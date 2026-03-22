#!/usr/bin/env node
/**
 * 경쟁사 광고 소재 요소 태깅 스크립트 — 큐 기반 비동기 처리
 *
 * ━━━ 큐 테이블 생성 SQL (Supabase에서 수동 실행) ━━━
 *
 *   CREATE TABLE IF NOT EXISTS competitor_analysis_queue (
 *     id BIGSERIAL PRIMARY KEY,
 *     brand_page_id TEXT NOT NULL,
 *     ad_id TEXT NOT NULL,
 *     status TEXT NOT NULL DEFAULT 'pending',
 *     created_at TIMESTAMPTZ DEFAULT now(),
 *     processed_at TIMESTAMPTZ,
 *     UNIQUE (brand_page_id, ad_id)
 *   );
 *   CREATE INDEX IF NOT EXISTS idx_caq_status ON competitor_analysis_queue(status);
 *   CREATE INDEX IF NOT EXISTS idx_caq_brand ON competitor_analysis_queue(brand_page_id);
 *   ALTER TABLE competitor_analysis_queue ENABLE ROW LEVEL SECURITY;
 *   CREATE POLICY "service_role_all" ON competitor_analysis_queue
 *     FOR ALL TO service_role USING (true) WITH CHECK (true);
 *
 * ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 *
 * Usage:
 *   # 큐에 브랜드 광고 등록
 *   node scripts/analyze-competitor-creatives.mjs --enqueue --brand-page-id <page_id>
 *
 *   # 배치 처리 (크론용)
 *   node scripts/analyze-competitor-creatives.mjs --process [--limit N]
 *
 *   # 브랜드 상태 조회
 *   node scripts/analyze-competitor-creatives.mjs --status --brand-page-id <page_id>
 *
 *   # dry-run (DB 저장 없이 처리 흐름만 확인)
 *   node scripts/analyze-competitor-creatives.mjs --process --limit 5 --dry-run
 *
 * 저장 테이블: creative_element_analysis
 *   ad_id 형식: "competitor:{ad_archive_id}" (자사 소재와 구분)
 *   account_id: brand_page_id (경쟁사 페이지 ID)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);

// CLI 옵션 파싱
const MODE_ENQUEUE = args.includes("--enqueue");
const MODE_PROCESS = args.includes("--process");
const MODE_STATUS  = args.includes("--status");

const brandIdx = args.indexOf("--brand-page-id");
const BRAND_PAGE_ID = brandIdx >= 0 ? args[brandIdx + 1] : null;

const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100;

const DRY_RUN = args.includes("--dry-run");

// 사용법 출력
if (!MODE_ENQUEUE && !MODE_PROCESS && !MODE_STATUS) {
  console.log("Usage:");
  console.log("  --enqueue --brand-page-id <page_id>   브랜드 광고를 큐에 등록");
  console.log("  --process [--limit N]                  pending 항목 배치 처리");
  console.log("  --status --brand-page-id <page_id>     큐 상태 조회");
  console.log("  --dry-run                              DB 저장 없이 처리 흐름 확인");
  process.exit(0);
}

// .env.local 로딩
const envPath = resolve(__dirname, "..", ".env.local");
let envContent;
try {
  envContent = readFileSync(envPath, "utf-8");
} catch {
  console.error(".env.local 파일을 찾을 수 없습니다. 프로젝트 루트에 .env.local이 있어야 합니다.");
  process.exit(1);
}

const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-pro";

// competitor 소재는 ad_id에 이 prefix를 붙여 자사 소재와 구분
const COMPETITOR_PREFIX = "competitor:";

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (MODE_PROCESS && !GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요 (--process 모드에서 필수)");
  process.exit(1);
}

// ━━━ Supabase REST 헬퍼 ━━━
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, row, onConflict = null) {
  const url = onConflict
    ? `${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`
    : `${SB_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(row),
  });
  const text = res.ok ? "" : await res.text();
  return { ok: res.ok, status: res.status, text };
}

async function sbPatch(table, filter, patch) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(patch),
  });
  return { ok: res.ok, status: res.status };
}

// ━━━ 소재 분석 프롬프트 (analyze-creatives.mjs와 동일) ━━━
const IMAGE_ANALYSIS_PROMPT = `이 광고 소재 이미지를 분석해서 아래 JSON 스키마에 맞춰 출력해라.
규칙: 순수 JSON만 반환. 마크다운 코드블록(~~~, \`\`\`) 사용 금지. 주석 금지. 설명 텍스트 금지.

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

const VIDEO_ANALYSIS_PROMPT = `이 광고 소재 이미지(비디오 썸네일)를 분석해서 아래 JSON 스키마에 맞춰 출력해라.
규칙: 순수 JSON만 반환. 마크다운 코드블록(~~~, \`\`\`) 사용 금지. 주석 금지. 설명 텍스트 금지.

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

// ━━━ Gemini Vision 분석 ━━━
async function analyzeCreative(imageUrl, adCopy, displayFormat) {
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

  // 비디오 포맷인 경우 비디오 프롬프트 사용
  const isVideo = displayFormat === "VIDEO";
  const analysisPrompt = isVideo ? VIDEO_ANALYSIS_PROMPT : IMAGE_ANALYSIS_PROMPT;

  const parts = [
    { inline_data: { mime_type: mimeType, data: base64 } },
  ];

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
          generationConfig: {
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
          },
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

  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.[0]?.text) {
    console.log(`    응답 없음 (finishReason: ${candidate?.finishReason || "UNKNOWN"})`);
    return null;
  }

  const rawText = candidate.content.parts[0].text;

  try {
    return JSON.parse(rawText);
  } catch {
    // 폴백: 마크다운 코드블록 제거 + JSON 추출
  }

  const cleaned = rawText
    .replace(/```json\n?/g, "")
    .replace(/```\n?/g, "")
    .replace(/^[^{]*/, "")
    .replace(/[^}]*$/, "")
    .replace(/,\s*}/g, "}")
    .replace(/,\s*]/g, "]")
    .replace(/\/\/.*/g, "")
    .trim();

  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    console.log(`    JSON 추출 실패. raw(200자): ${rawText.slice(0, 200)}`);
    return null;
  }

  try {
    return JSON.parse(jsonMatch[0]);
  } catch (e) {
    console.log(`    JSON 파싱 실패: ${e.message}. raw(300자): ${rawText.slice(0, 300)}`);
    return null;
  }
}

// ━━━ 분석 결과 → DB 행 매핑 ━━━
function buildAnalysisRow(adArchiveId, pageId, analysis) {
  return {
    ad_id: `${COMPETITOR_PREFIX}${adArchiveId}`,
    account_id: pageId,
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

// ━━━ 모드 1: 큐 등록 ━━━
async function modeEnqueue() {
  if (!BRAND_PAGE_ID) {
    console.error("--enqueue 모드에는 --brand-page-id <page_id> 필요");
    process.exit(1);
  }

  console.log(`큐 등록 시작 — brand_page_id: ${BRAND_PAGE_ID}`);

  // competitor_ad_cache에서 해당 page_id의 이미지 있는 광고 조회
  let ads;
  try {
    ads = await sbGet(
      `/competitor_ad_cache?select=ad_archive_id&page_id=eq.${encodeURIComponent(BRAND_PAGE_ID)}&image_url=not.is.null`
    );
  } catch (e) {
    console.error(`광고 조회 실패: ${e.message}`);
    process.exit(1);
  }

  console.log(`  조회된 광고: ${ads.length}건`);

  if (ads.length === 0) {
    console.log("  등록할 광고 없음 (image_url 있는 광고가 없거나 page_id가 잘못됨)");
    return;
  }

  // 배치 UPSERT (중복은 on_conflict로 스킵)
  const BATCH_SIZE = 100;
  let enqueued = 0;
  let skipped = 0;

  for (let i = 0; i < ads.length; i += BATCH_SIZE) {
    const batch = ads.slice(i, i + BATCH_SIZE).map((ad) => ({
      brand_page_id: BRAND_PAGE_ID,
      ad_id: ad.ad_archive_id,
      status: "pending",
    }));

    if (DRY_RUN) {
      console.log(`  [dry-run] 배치 ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length}건 등록 예정`);
      enqueued += batch.length;
      continue;
    }

    const result = await sbPost(
      "competitor_analysis_queue",
      batch,
      "brand_page_id,ad_id"
    );

    if (result.ok) {
      enqueued += batch.length;
    } else {
      console.log(`  배치 저장 실패: ${result.status} ${result.text.slice(0, 200)}`);
      skipped += batch.length;
    }
  }

  console.log("\n━━━ 결과 ━━━");
  console.log(`총 광고: ${ads.length}건`);
  if (DRY_RUN) {
    console.log(`[dry-run] 등록 예정: ${enqueued}건 (DB 저장 없음)`);
  } else {
    console.log(`큐 등록: ${enqueued}건 (기존 항목은 on_conflict로 유지)`);
    if (skipped > 0) console.log(`실패: ${skipped}건`);
  }
}

// ━━━ 모드 2: 배치 처리 ━━━
async function modeProcess() {
  console.log(`배치 처리 시작 — limit: ${LIMIT}, dry-run: ${DRY_RUN}`);

  // pending 항목 조회 (limit 적용)
  let queueItems;
  try {
    queueItems = await sbGet(
      `/competitor_analysis_queue?select=id,brand_page_id,ad_id&status=eq.pending&order=id.asc&limit=${LIMIT}`
    );
  } catch (e) {
    console.error(`큐 조회 실패: ${e.message}`);
    process.exit(1);
  }

  console.log(`  pending 항목: ${queueItems.length}건\n`);

  if (queueItems.length === 0) {
    console.log("처리할 항목 없음");
    return;
  }

  // 대상 ad_id 목록으로 competitor_ad_cache 조회
  const adIds = queueItems.map((q) => q.ad_id);
  const inFilter = `(${adIds.map(encodeURIComponent).join(",")})`;

  let adDetails;
  try {
    adDetails = await sbGet(
      `/competitor_ad_cache?select=ad_archive_id,page_id,page_name,ad_text,ad_title,display_format,image_url,video_preview_url&ad_archive_id=in.${inFilter}`
    );
  } catch (e) {
    console.error(`소재 상세 조회 실패: ${e.message}`);
    process.exit(1);
  }

  // ad_archive_id → 상세 정보 맵
  const adMap = new Map(adDetails.map((ad) => [ad.ad_archive_id, ad]));

  // 큐 항목 id → 큐 Row 맵 (나중에 상태 업데이트에 사용)
  const queueMap = new Map(queueItems.map((q) => [q.ad_id, q]));

  let completed = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < queueItems.length; i++) {
    const qItem = queueItems[i];
    const ad = adMap.get(qItem.ad_id);

    if (!ad) {
      console.log(`[${i + 1}/${queueItems.length}] ${qItem.ad_id} — 소재 정보 없음 (스킵)`);
      skipped++;
      continue;
    }

    // 비디오 소재는 video_preview_url 우선, 없으면 image_url
    const isVideo = ad.display_format === "VIDEO";
    const imageUrl = (isVideo && ad.video_preview_url) ? ad.video_preview_url : ad.image_url;

    if (!imageUrl) {
      console.log(`[${i + 1}/${queueItems.length}] ${ad.page_name} / ${ad.ad_archive_id} — 이미지 URL 없음 (스킵)`);
      skipped++;
      continue;
    }

    const adCopy = [ad.ad_title, ad.ad_text].filter(Boolean).join(" | ") || null;

    process.stdout.write(
      `[${i + 1}/${queueItems.length}] ${ad.page_name} / ${ad.ad_archive_id} — `
    );

    if (DRY_RUN) {
      console.log(`[dry-run] 이미지: ${imageUrl}`);
      completed++;
      continue;
    }

    // 큐 상태를 'processing'으로 변경
    await sbPatch(
      "competitor_analysis_queue",
      `id=eq.${qItem.id}`,
      { status: "processing" }
    );

    const analysis = await analyzeCreative(imageUrl, adCopy, ad.display_format);

    if (!analysis) {
      console.log("분석 실패");
      // 큐 상태를 'failed'로 변경
      await sbPatch(
        "competitor_analysis_queue",
        `id=eq.${qItem.id}`,
        { status: "failed", processed_at: new Date().toISOString() }
      );
      failed++;
      await new Promise((r) => setTimeout(r, 500));
      continue;
    }

    console.log(
      `format: ${analysis.format || "?"}, hook: ${analysis.hook?.type || "none"}, style: ${analysis.style || "?"}`
    );

    // creative_element_analysis UPSERT
    const row = buildAnalysisRow(ad.ad_archive_id, ad.page_id, analysis);
    const saveResult = await sbPost("creative_element_analysis", row, "ad_id");

    if (saveResult.ok) {
      // 큐 상태를 'completed'로 변경
      await sbPatch(
        "competitor_analysis_queue",
        `id=eq.${qItem.id}`,
        { status: "completed", processed_at: new Date().toISOString() }
      );
      completed++;
    } else {
      console.log(`    DB 저장 실패: ${saveResult.status} ${saveResult.text.slice(0, 200)}`);
      await sbPatch(
        "competitor_analysis_queue",
        `id=eq.${qItem.id}`,
        { status: "failed", processed_at: new Date().toISOString() }
      );
      failed++;
    }

    // API 레이트 리밋 방지 (200ms 딜레이)
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\n━━━ 결과 ━━━");
  console.log(`배치 크기: ${queueItems.length}건`);
  if (DRY_RUN) {
    console.log(`[dry-run] 처리 예정: ${completed}건 (DB 저장 없음)`);
  } else {
    console.log(`완료: ${completed}건`);
    console.log(`실패: ${failed}건`);
    if (skipped > 0) console.log(`스킵: ${skipped}건`);
  }
}

// ━━━ 모드 3: 상태 조회 ━━━
async function modeStatus() {
  if (!BRAND_PAGE_ID) {
    console.error("--status 모드에는 --brand-page-id <page_id> 필요");
    process.exit(1);
  }

  console.log(`큐 상태 조회 — brand_page_id: ${BRAND_PAGE_ID}`);

  let rows;
  try {
    rows = await sbGet(
      `/competitor_analysis_queue?select=status&brand_page_id=eq.${encodeURIComponent(BRAND_PAGE_ID)}`
    );
  } catch (e) {
    console.error(`상태 조회 실패: ${e.message}`);
    process.exit(1);
  }

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of rows) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }

  const total = rows.length;
  const doneRate = total > 0 ? Math.round((counts.completed / total) * 100) : 0;

  console.log(`\n  총: ${total}건`);
  console.log(`  pending:    ${counts.pending}건`);
  console.log(`  processing: ${counts.processing}건`);
  console.log(`  completed:  ${counts.completed}건 (${doneRate}%)`);
  console.log(`  failed:     ${counts.failed}건`);
}

// ━━━ 엔트리포인트 ━━━
async function main() {
  if (MODE_ENQUEUE) {
    await modeEnqueue();
  } else if (MODE_PROCESS) {
    await modeProcess();
  } else if (MODE_STATUS) {
    await modeStatus();
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
