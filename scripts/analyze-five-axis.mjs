#!/usr/bin/env node
/**
 * 5축 통합 분석 배치 스크립트
 *
 * Gemini 3.1 Pro Preview로 소재 이미지/영상을 5축 분석:
 *   visual, text, audio(영상만), structure(영상만), attention
 *
 * 결과: creative_media.analysis_json (JSONB)
 * 폴백: ad_creative_embeddings에만 있는 경우 → video_analysis에 저장
 *
 * Usage:
 *   node scripts/analyze-five-axis.mjs --dry-run
 *   node scripts/analyze-five-axis.mjs --limit 50
 *   node scripts/analyze-five-axis.mjs --account 123456789
 *   node scripts/analyze-five-axis.mjs --type IMAGE
 *   node scripts/analyze-five-axis.mjs --type VIDEO
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : null;
const ACCOUNT_IDX = process.argv.indexOf("--account");
const FILTER_ACCOUNT = ACCOUNT_IDX !== -1 ? process.argv[ACCOUNT_IDX + 1] : null;
const TYPE_IDX = process.argv.indexOf("--type");
const FILTER_TYPE = TYPE_IDX !== -1 ? process.argv[TYPE_IDX + 1].toUpperCase() : null;

// ── .env.local 파싱 ──
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

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요");
  process.exit(1);
}

const GEMINI_MODEL = "gemini-2.5-pro";
const ANALYSIS_MODEL_NAME = "gemini-2.5-pro";
const RATE_LIMIT_MS = 4000; // 분당 15 요청 → 4초 간격
const MAX_RETRIES = 3;

// ── Supabase 헬퍼 ──
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, query, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── 분석 프롬프트 ──
const IMAGE_PROMPT = `이 광고 소재 이미지를 분석해서 아래 JSON 스키마에 맞춰 출력하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지. 설명 텍스트 금지.

{
  "summary": "소재 한줄 요약 (한국어)",
  "visual": {
    "format": "image",
    "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
    "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none", "count": 0 },
    "color": { "dominant": "#hex", "palette": ["#hex"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "style": "ugc|professional|minimal|bold|lifestyle",
    "layout": { "text_pct": 20, "whitespace_pct": 15, "complexity": "simple|moderate|complex" },
    "brand": { "logo_visible": false, "logo_position": "top-left|top-right|bottom|none" }
  },
  "text": {
    "hook": { "type": "question|shock|benefit|problem|curiosity|none", "text": "후킹 텍스트" },
    "overlay_texts": ["텍스트1", "텍스트2"],
    "cta_text": "CTA 문구",
    "key_message": "핵심 메시지",
    "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": null }
  },
  "audio": null,
  "structure": null,
  "attention": {
    "top_fixations": [
      { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "제품" }
    ],
    "cta_attention_score": 0.7,
    "cognitive_load": "low|medium|high"
  }
}`;

const VIDEO_PROMPT = `이 광고 영상의 썸네일을 분석해서 아래 JSON 스키마에 맞춰 출력하라.
규칙: 순수 JSON만 반환. 마크다운 코드블록 금지. 주석 금지. 설명 텍스트 금지.

{
  "summary": "소재 한줄 요약 (한국어)",
  "visual": {
    "format": "video",
    "product_visibility": { "position": "center|side|background|none", "size_pct": 30 },
    "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise|none", "count": 0 },
    "color": { "dominant": "#hex", "palette": ["#hex"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
    "style": "ugc|professional|minimal|bold|lifestyle",
    "layout": { "text_pct": 20, "whitespace_pct": 15, "complexity": "simple|moderate|complex" },
    "brand": { "logo_visible": false, "logo_position": "top-left|top-right|bottom|none" },
    "scene_timeline": [
      { "sec": "0-3", "type": "hook|problem|demo|result|cta|brand", "desc": "설명" }
    ],
    "motion_pattern": "static|slow|fast|mixed",
    "scene_transition_speed": "slow|medium|fast"
  },
  "text": {
    "hook": { "type": "question|shock|benefit|problem|curiosity|none", "text": "후킹 텍스트" },
    "overlay_texts": ["텍스트1"],
    "cta_text": "CTA 문구",
    "key_message": "핵심 메시지",
    "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": null }
  },
  "audio": {
    "narration_text": "추정 나레이션 (썸네일 기반 추측)",
    "bgm_genre": "pop|calm|exciting|none",
    "audio_emotion": "upbeat|calm|urgent|neutral",
    "audio_type": "narration|bgm|sfx|silent|mixed"
  },
  "structure": {
    "scenes": [
      { "sec": "0-3", "type": "hook|demo|result|cta|brand", "desc": "설명" }
    ],
    "pacing": "fast|medium|slow",
    "hook_type": "question|shock|benefit|problem|curiosity",
    "ending_cta_type": "button|text|overlay|swipe-up|none"
  },
  "attention": {
    "top_fixations": [
      { "x": 0.5, "y": 0.3, "weight": 0.9, "label": "제품" }
    ],
    "cta_attention_score": 0.7,
    "cognitive_load": "low|medium|high"
  }
}`;

// ── Gemini Vision 분석 ──
async function analyzeWithGemini(imageUrl, adCopy, mediaType) {
  // 이미지 다운로드
  let imgRes;
  try {
    imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(15_000) });
  } catch (e) {
    return { error: `다운로드 타임아웃: ${e.message}` };
  }

  if (!imgRes.ok) {
    return { error: `다운로드 실패: ${imgRes.status}` };
  }

  const ct = imgRes.headers.get("content-type") || "image/jpeg";
  const mimeType = ct.startsWith("image/") ? ct.split(";")[0] : "image/jpeg";
  const buf = await imgRes.arrayBuffer();
  const base64 = Buffer.from(buf).toString("base64");

  const isVideo = mediaType === "VIDEO";
  const prompt = isVideo ? VIDEO_PROMPT : IMAGE_PROMPT;

  const parts = [{ inline_data: { mime_type: mimeType, data: base64 } }];
  if (adCopy) parts.push({ text: `광고 카피: ${adCopy}` });
  parts.push({ text: prompt });

  // Gemini API 호출 (재시도)
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              maxOutputTokens: 8192,
              responseMimeType: "application/json",
            },
          }),
          signal: AbortSignal.timeout(90_000),
        }
      );

      if (res.status === 429 || res.status >= 500) {
        const waitMs = Math.pow(2, attempt + 1) * 1000;
        console.warn(`  [${res.status}] ${waitMs}ms 후 재시도...`);
        await sleep(waitMs);
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return { error: `Gemini ${res.status}: ${errText.slice(0, 200)}` };
      }

      const data = await res.json();
      const candidate = data.candidates?.[0];
      if (!candidate?.content?.parts?.[0]?.text) {
        return { error: `응답 없음 (${candidate?.finishReason || "UNKNOWN"})` };
      }

      const rawText = candidate.content.parts[0].text;
      try {
        return { result: JSON.parse(rawText) };
      } catch {
        // 폴백: JSON 추출
        const cleaned = rawText
          .replace(/```json\n?/g, "")
          .replace(/```\n?/g, "")
          .replace(/\/\/.*/g, "")
          .trim();
        const match = cleaned.match(/\{[\s\S]*\}/);
        if (match) {
          try {
            return { result: JSON.parse(match[0]) };
          } catch (e) {
            return { error: `JSON 파싱 실패: ${e.message}` };
          }
        }
        return { error: `JSON 추출 실패` };
      }
    } catch (e) {
      if (attempt < MAX_RETRIES - 1) {
        await sleep(2000);
        continue;
      }
      return { error: `API 에러: ${e.message}` };
    }
  }
  return { error: "재시도 초과" };
}

// ── main ──
async function main() {
  console.log(`5축 통합 분석 배치${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`모델: ${ANALYSIS_MODEL_NAME}`);
  console.log(`필터: account=${FILTER_ACCOUNT || "전체"}, type=${FILTER_TYPE || "전체"}, limit=${LIMIT || "없음"}\n`);

  // 1. creative_media에서 분석 대상 조회 (analysis_json 컬럼이 없을 수 있음)
  const PAGE_SIZE = 1000;
  let cmRows = [];
  let offset = 0;
  let cmHasAnalysisCol = true;
  try {
    while (true) {
      let query =
        `/creative_media?select=id,creative_id,storage_url,media_type,ad_copy,analysis_json,creatives!inner(ad_id,account_id)` +
        `&storage_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
      if (FILTER_TYPE) query += `&media_type=eq.${FILTER_TYPE}`;
      const batch = await sbGet(query);
      cmRows.push(...batch);
      if (batch.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  } catch (e) {
    // analysis_json 컬럼이 아직 없으면 컬럼 없이 재시도
    console.log(`  creative_media (analysis_json 포함) 실패 — 컬럼 없이 재시도`);
    cmHasAnalysisCol = false;
    cmRows = [];
    offset = 0;
    try {
      while (true) {
        let query =
          `/creative_media?select=id,creative_id,storage_url,media_type,ad_copy,creatives!inner(ad_id,account_id)` +
          `&storage_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
        if (FILTER_TYPE) query += `&media_type=eq.${FILTER_TYPE}`;
        const batch = await sbGet(query);
        cmRows.push(...batch);
        if (batch.length < PAGE_SIZE) break;
        offset += PAGE_SIZE;
      }
    } catch (e2) {
      console.log(`  creative_media 조회 완전 실패: ${e2.message}`);
    }
  }
  console.log(`creative_media: ${cmRows.length}건${cmHasAnalysisCol ? "" : " (analysis_json 컬럼 미생성)"}`);

  // 2. ad_creative_embeddings에서 추가 대상 (creative_media에 없는 것)
  const cmAdIds = new Set(cmRows.map((r) => r.creatives?.ad_id));
  let aceRows = [];
  offset = 0;
  while (true) {
    let query =
      `/ad_creative_embeddings?select=ad_id,account_id,storage_url,media_type,ad_copy,video_analysis` +
      `&storage_url=not.is.null&order=ad_id.asc&offset=${offset}&limit=${PAGE_SIZE}`;
    if (FILTER_TYPE) query += `&media_type=eq.${FILTER_TYPE}`;
    if (FILTER_ACCOUNT) query += `&account_id=eq.${FILTER_ACCOUNT}`;
    const batch = await sbGet(query);
    aceRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  // creative_media에 이미 있는 것은 제외
  aceRows = aceRows.filter((r) => !cmAdIds.has(r.ad_id));
  console.log(`ad_creative_embeddings (추가): ${aceRows.length}건`);

  // 3. 통합 리스트 구성
  const allItems = [];

  // creative_media 행 (우선)
  for (const row of cmRows) {
    if (FILTER_ACCOUNT && String(row.creatives?.account_id) !== String(FILTER_ACCOUNT)) continue;
    // 이미 분석된 건 스킵 (analysis_json이 있으면)
    if (cmHasAnalysisCol && row.analysis_json) continue;
    allItems.push({
      source: "creative_media",
      id: row.id,
      adId: row.creatives?.ad_id,
      accountId: row.creatives?.account_id,
      storageUrl: row.storage_url,
      mediaType: row.media_type,
      adCopy: row.ad_copy,
    });
  }

  // ad_creative_embeddings 행
  for (const row of aceRows) {
    // 이미 video_analysis가 있고 5축 구조면 스킵
    if (row.video_analysis?.visual && row.video_analysis?.text) continue;
    allItems.push({
      source: "ace",
      id: null,
      adId: row.ad_id,
      accountId: row.account_id,
      storageUrl: row.storage_url,
      mediaType: row.media_type,
      adCopy: row.ad_copy,
    });
  }

  console.log(`\n분석 대상: ${allItems.length}건`);

  const toProcess = LIMIT && LIMIT > 0 ? allItems.slice(0, LIMIT) : allItems;
  console.log(`처리 예정: ${toProcess.length}건\n`);

  if (toProcess.length === 0) {
    console.log("처리할 소재가 없습니다.");
    return;
  }

  let success = 0;
  let errors = 0;
  let skipped = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    const prefix = `[${i + 1}/${toProcess.length}]`;

    if (DRY_RUN) {
      if (i < 5 || i % 100 === 0) {
        console.log(`${prefix} [dry-run] ${item.adId} (${item.mediaType}, ${item.source})`);
      }
      success++;
      continue;
    }

    process.stdout.write(`${prefix} ${item.adId} (${item.mediaType}) — `);

    const { result, error } = await analyzeWithGemini(
      item.storageUrl,
      item.adCopy,
      item.mediaType
    );

    if (error) {
      console.log(`✗ ${error}`);
      errors++;
      await sleep(1000);
      continue;
    }

    // DB 저장
    if (item.source === "creative_media" && cmHasAnalysisCol) {
      const patch = await sbPatch("creative_media", `id=eq.${item.id}`, {
        analysis_json: result,
        analyzed_at: new Date().toISOString(),
        analysis_model: ANALYSIS_MODEL_NAME,
      });
      if (!patch.ok) {
        console.log(`✗ DB 저장 실패: ${patch.body}`);
        errors++;
      } else {
        console.log(`✅ ${result.summary?.slice(0, 40) || "OK"}`);
        success++;
      }
    } else if (item.source === "creative_media" && !cmHasAnalysisCol) {
      // analysis_json 컬럼 미생성 → ace 폴백
      const patch = await sbPatch("ad_creative_embeddings", `ad_id=eq.${item.adId}`, {
        video_analysis: result,
      });
      if (!patch.ok) {
        console.log(`✗ ace 폴백 저장 실패: ${patch.body}`);
        errors++;
      } else {
        console.log(`✅ (ace폴백) ${result.summary?.slice(0, 40) || "OK"}`);
        success++;
      }
    } else {
      // ace 폴백: video_analysis에 저장
      const patch = await sbPatch("ad_creative_embeddings", `ad_id=eq.${item.adId}`, {
        video_analysis: result,
      });
      if (!patch.ok) {
        console.log(`✗ ace 저장 실패: ${patch.body}`);
        errors++;
      } else {
        console.log(`✅ (ace) ${result.summary?.slice(0, 40) || "OK"}`);
        success++;
      }
    }

    // Rate limit
    await sleep(RATE_LIMIT_MS);

    // 50건마다 중간 통계
    if ((i + 1) % 50 === 0) {
      console.log(`\n  ── 중간 결과: 성공 ${success}건, 실패 ${errors}건, 스킵 ${skipped}건 ──\n`);
    }
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`성공: ${success}건, 실패: ${errors}건, 스킵: ${skipped}건`);
  console.log(`모델: ${ANALYSIS_MODEL_NAME}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
