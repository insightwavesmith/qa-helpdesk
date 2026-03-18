#!/usr/bin/env node
/**
 * 광고 소재 요소 태깅 스크립트 — Gemini 2.0 Pro Vision 기반
 *
 * Usage: node scripts/analyze-creatives.mjs [--limit N] [--account-id xxx]
 *   --limit N          : 최대 N건 처리 (기본: 9999)
 *   --account-id xxx   : 특정 광고 계정만 처리
 *
 * 플로우:
 * 1. ad_creative_embeddings에서 is_active=true, media_url IS NOT NULL 조회
 * 2. creative_element_analysis에 이미 분석된 ad_id 제외
 * 3. 각 소재: 이미지 다운로드 → base64 → Gemini 2.0 Pro 분석
 * 4. 결과를 creative_element_analysis에 UPSERT
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// CLI 인수 파싱
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;

const accountIdx = args.indexOf("--account-id");
const ACCOUNT_ID = accountIdx >= 0 ? args[accountIdx + 1] : null;

// .env.local 로딩
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-pro";

if (!SB_URL || !SB_KEY) {
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요");
  process.exit(1);
}

// ━━━ Supabase REST 헬퍼 ━━━
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, row) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  return { ok: res.ok, status: res.status };
}

// ━━━ 소재 분석 프롬프트 ━━━
const IMAGE_ANALYSIS_PROMPT = `이 광고 소재 이미지를 분석해서 다음 JSON 구조로 출력해줘. 정확한 JSON만 출력하고 다른 텍스트는 넣지 마.

{
  "format": "image|video|carousel|gif",
  "hook": { "type": "question|shock|benefit|problem|none", "text": "후킹 텍스트 또는 null", "position_sec": 0 },
  "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
  "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none" },
  "text_overlay": { "ratio_pct": 20, "headline": "메인 텍스트", "cta_text": "CTA 텍스트" },
  "color": { "dominant": "#FF6B6B", "palette": ["#FF6B6B", "#4ECDC4"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
  "style": "ugc|professional|minimal|bold|lifestyle",
  "social_proof": { "review_shown": false, "before_after": false, "testimonial": false },
  "cta": { "type": "button|text|overlay|none", "position": "bottom|center|end_frame|none", "color": "#FF6B6B" },
  "video_structure": null
}`;

const VIDEO_ANALYSIS_PROMPT = `이 광고 소재 이미지(비디오 썸네일)를 분석해서 다음 JSON 구조로 출력해줘. 정확한 JSON만 출력하고 다른 텍스트는 넣지 마.

{
  "format": "video",
  "hook": { "type": "question|shock|benefit|problem|none", "text": "후킹 텍스트 또는 null", "position_sec": 0 },
  "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
  "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none" },
  "text_overlay": { "ratio_pct": 20, "headline": "메인 텍스트", "cta_text": "CTA 텍스트" },
  "color": { "dominant": "#FF6B6B", "palette": ["#FF6B6B", "#4ECDC4"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
  "style": "ugc|professional|minimal|bold|lifestyle",
  "social_proof": { "review_shown": false, "before_after": false, "testimonial": false },
  "cta": { "type": "button|text|overlay|none", "position": "bottom|center|end_frame|none", "color": "#FF6B6B" },
  "video_structure": {
    "scenes": [
      { "sec": "0-3", "type": "hook|demo|result|cta|brand", "desc": "씬 설명" }
    ],
    "pacing": "fast|medium|slow",
    "bgm": true,
    "narration": false
  }
}`;

// ━━━ Gemini 2.0 Pro Vision 분석 ━━━
async function analyzeCreative(imageUrl, adCopy, mediaType) {
  // 이미지 다운로드
  let imgRes;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    console.log(`    이미지 다운로드 타임아웃: ${e.message}`);
    return null;
  }

  if (!imgRes.ok) {
    console.log(`    이미지 다운로드 실패: ${imgRes.status}`);
    return null;
  }

  const ct = imgRes.headers.get("content-type") || "image/jpeg";
  const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
  const buf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");

  // 프롬프트 조합
  const isVideo = mediaType === "VIDEO";
  const analysisPrompt = isVideo ? VIDEO_ANALYSIS_PROMPT : IMAGE_ANALYSIS_PROMPT;

  const parts = [
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

  // 광고 카피가 있으면 컨텍스트로 추가
  if (adCopy) {
    parts.push({ text: `광고 카피: ${adCopy}` });
  }

  parts.push({ text: analysisPrompt });

  // Gemini API 호출
  let genRes;
  try {
    genRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts }],
          generationConfig: { maxOutputTokens: 2048 },
        }),
        signal: AbortSignal.timeout(60_000),
      }
    );
  } catch (e) {
    console.log(`    Gemini API 타임아웃: ${e.message}`);
    return null;
  }

  if (!genRes.ok) {
    const errText = await genRes.text().catch(() => "");
    console.log(`    Gemini API 실패: ${genRes.status} ${errText.slice(0, 200)}`);
    return null;
  }

  const data = await genRes.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

  // 마크다운 코드블록 제거 + JSON 추출
  const text = rawText.replace(/```json\n?/g, "").replace(/```/g, "").trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log(`    JSON 파싱 실패: ${text.slice(0, 200)}`);
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log(`    JSON 파싱 에러 (retry): ${e.message}`);
    // retry 1회: 줄바꿈/특수문자 정리 후 재시도
    try {
      const cleaned = jsonMatch[0]
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]");
      return JSON.parse(cleaned);
    } catch {
      console.log(`    JSON 파싱 최종 실패`);
      return null;
    }
  }
}

// ━━━ 분석 결과 → DB 행 매핑 ━━━
function buildRow(adId, accountId, analysis) {
  return {
    ad_id: adId,
    account_id: accountId,
    format: analysis.format || null,
    hook_type: analysis.hook?.type || null,
    hook_text: analysis.hook?.text || null,
    product_position: analysis.product_visibility?.position || null,
    product_size_pct: analysis.product_visibility?.size_pct || null,
    human_presence: analysis.human_presence?.face || false,
    text_overlay_ratio: analysis.text_overlay?.ratio_pct || null,
    dominant_color: analysis.color?.dominant || null,
    color_tone: analysis.color?.tone || null,
    color_contrast: analysis.color?.contrast || null,
    style: analysis.style || null,
    social_proof_types: [
      analysis.social_proof?.review_shown && "review",
      analysis.social_proof?.before_after && "before_after",
      analysis.social_proof?.testimonial && "testimonial",
    ].filter(Boolean),
    cta_type: analysis.cta?.type || null,
    cta_position: analysis.cta?.position || null,
    cta_color: analysis.cta?.color || null,
    video_scenes: analysis.video_structure?.scenes || null,
    video_pacing: analysis.video_structure?.pacing || null,
    has_bgm: analysis.video_structure?.bgm ?? null,
    has_narration: analysis.video_structure?.narration ?? null,
    raw_analysis: analysis,
    model_version: GEMINI_MODEL,
  };
}

// ━━━ 메인 ━━━
async function main() {
  console.log("소재 요소 태깅 시작 (Gemini 2.0 Pro Vision)");
  console.log(`  limit: ${LIMIT}, account-id: ${ACCOUNT_ID || "전체"}`);

  // 대상 소재 조회
  let query = `/ad_creative_embeddings?select=ad_id,account_id,media_url,media_type,ad_copy&is_active=eq.true&media_url=not.is.null&embedding_3072=not.is.null&limit=${LIMIT}`;
  if (ACCOUNT_ID) {
    query += `&account_id=eq.${encodeURIComponent(ACCOUNT_ID)}`;
  }

  const creatives = await sbGet(query);
  console.log(`  대상 소재: ${creatives.length}건`);

  if (creatives.length === 0) {
    console.log("처리할 소재 없음");
    return;
  }

  // 이미 분석된 ad_id 조회 (스킵 대상 파악)
  const adIds = creatives.map((c) => c.ad_id);
  // Supabase REST in 필터: ?ad_id=in.(id1,id2,...)
  const inFilter = `(${adIds.map(encodeURIComponent).join(",")})`;
  let existingRows = [];
  try {
    existingRows = await sbGet(
      `/creative_element_analysis?select=ad_id&ad_id=in.${inFilter}`
    );
  } catch (e) {
    console.log(`  기존 분석 조회 실패 (무시하고 계속): ${e.message}`);
  }

  const existingSet = new Set(existingRows.map((r) => r.ad_id));
  const toAnalyze = creatives.filter((c) => !existingSet.has(c.ad_id));

  console.log(`  기존 분석: ${existingSet.size}건 스킵, 신규: ${toAnalyze.length}건 처리\n`);

  let analyzed = 0;
  let errors = 0;

  for (let i = 0; i < toAnalyze.length; i++) {
    const creative = toAnalyze[i];
    process.stdout.write(`[${i + 1}/${toAnalyze.length}] ${creative.ad_id} — `);

    const analysis = await analyzeCreative(
      creative.media_url,
      creative.ad_copy,
      creative.media_type
    );

    if (!analysis) {
      console.log("분석 실패");
      errors++;
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    // 진행 상황 출력
    console.log(
      `format: ${analysis.format || "?"}, hook: ${analysis.hook?.type || "none"}, style: ${analysis.style || "?"}`
    );

    // DB UPSERT
    const row = buildRow(creative.ad_id, creative.account_id, analysis);
    const result = await sbPost("creative_element_analysis", row);

    if (result.ok) {
      analyzed++;
    } else {
      console.log(`    DB 저장 실패: ${result.status}`);
      errors++;
    }

    // API 레이트 리밋 방지 (500ms 딜레이)
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log("\n━━━ 결과 ━━━");
  console.log(`총 대상: ${creatives.length}건`);
  console.log(`스킵(기존): ${existingSet.size}건`);
  console.log(`분석 완료: ${analyzed}건`);
  console.log(`에러: ${errors}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
