#!/usr/bin/env node
/**
 * LP 레퍼런스 분석 스크립트 v2
 *
 * Gemini 2.5 Pro로 모바일 랜딩 페이지 스크린샷을 8개 카테고리로 분석:
 *   page_structure, pricing_strategy, social_proof, urgency_scarcity,
 *   cta_structure, trust_elements, conversion_psychology, mobile_ux
 *
 * 결과: lp_analysis.reference_based (JSONB) + flat 컬럼 동기화
 *
 * Usage:
 *   node scripts/analyze-lps-v2.mjs --limit 50
 *   node scripts/analyze-lps-v2.mjs --dry-run
 *   node scripts/analyze-lps-v2.mjs --lp-id <UUID>
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : 50;
const LP_ID_IDX = process.argv.indexOf("--lp-id");
const FILTER_LP_ID = LP_ID_IDX !== -1 ? process.argv[LP_ID_IDX + 1] : null;

// ── .env.local 파싱 ──
const envPath = resolve(__dirname, "..", ".env.local");
let env = {};
try {
  const envContent = readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
  }
} catch {
  // .env.local 없으면 process.env 사용
}

const SB_URL =
  env.NEXT_PUBLIC_SUPABASE_URL ||
  env.SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  process.env.SUPABASE_URL;
const SB_KEY =
  env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = env.GEMINI_API_KEY || process.env.GEMINI_API_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL(또는 SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!GEMINI_KEY) {
  console.error("GEMINI_API_KEY 필요");
  process.exit(1);
}

const GEMINI_MODEL = "gemini-2.5-pro";
const RATE_LIMIT_MS = 4000; // 분당 15 요청 → 4초 간격
const MAX_RETRIES = 3;

// ── Supabase REST 헬퍼 ──
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
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

// ── LP 분석 프롬프트 ──
function buildPrompt(canonicalUrl) {
  return `이 모바일 랜딩 페이지 스크린샷을 분석하세요.
URL: ${canonicalUrl}

아래 8개 카테고리로 구조화된 JSON을 반환하세요. 각 필드에 대한 설명을 참고하세요.

{
  "page_structure": {
    "section_order": ["hero", "benefits", "reviews", "pricing", "cta"],
    "page_length": "long",
    "scroll_depth": 4500
  },
  "pricing_strategy": {
    "anchoring": true,
    "bundle": false,
    "discount_display": "percent",
    "price_position": "mid"
  },
  "social_proof": {
    "review_count": 234,
    "rating": 4.8,
    "types": ["text", "photo"],
    "authority": "dermatologist",
    "position_pct": 60
  },
  "urgency_scarcity": {
    "timer": false,
    "stock_count": true,
    "fomo_copy": "1,234명 구매",
    "timedeal": false
  },
  "cta_structure": {
    "type": "sticky",
    "position": "bottom",
    "options": 3,
    "easy_pay": ["naverpay", "kakaopay"],
    "text": "구매하기"
  },
  "trust_elements": {
    "certification": true,
    "brand_story": true,
    "refund_policy": "전액 환불",
    "badges": ["GMP", "식약처"]
  },
  "conversion_psychology": {
    "primary_trigger": "social_proof",
    "objection_handling": true,
    "benefit_hierarchy": ["효과", "가격", "안전"]
  },
  "mobile_ux": {
    "sticky_cta": true,
    "readability": "good",
    "scroll_depth_pct": 65,
    "text_density_pct": 35,
    "gif_count": 2,
    "video_autoplay": true
  }
}

스크린샷에서 보이는 정보만 분석하세요. 보이지 않는 항목은 null 또는 기본값을 사용하세요.
반드시 위 구조의 JSON만 반환하세요.`;
}

// ── Gemini Vision 호출 (재시도 포함) ──
async function callGeminiVision(imageBase64, mimeType, canonicalUrl) {
  const prompt = buildPrompt(canonicalUrl);
  const parts = [
    { inline_data: { mime_type: mimeType, data: imageBase64 } },
    { text: prompt },
  ];

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
        // 폴백: JSON 추출 (마크다운 코드블록 등 제거)
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

// ── Storage 이미지 다운로드 → base64 ──
async function downloadImageAsBase64(screenshotUrl) {
  // screenshotUrl이 이미 full URL이면 그대로 사용, 아니면 prefix 붙이기
  const publicUrl = screenshotUrl.startsWith("http")
    ? screenshotUrl
    : `${SB_URL}/storage/v1/object/public/creatives/${screenshotUrl}`;
  const res = await fetch(publicUrl, {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`이미지 다운로드 실패: ${res.status} ${publicUrl}`);
  }
  const buffer = await res.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");

  // MIME 타입 추정 (확장자 기반)
  const lower = screenshotUrl.toLowerCase();
  let mimeType = "image/jpeg";
  if (lower.endsWith(".png")) mimeType = "image/png";
  else if (lower.endsWith(".webp")) mimeType = "image/webp";
  else if (lower.endsWith(".gif")) mimeType = "image/gif";

  return { base64, mimeType };
}

// ── reference_based에서 flat 컬럼 추출 ──
function extractFlatColumns(r) {
  return {
    hero_type: r.page_structure?.section_order?.[0] || null,
    price_position: r.pricing_strategy?.price_position || null,
    discount_highlight: r.pricing_strategy?.anchoring || false,
    review_count: r.social_proof?.review_count || 0,
    review_type: r.social_proof?.types?.[0] || null,
    cta_type: r.cta_structure?.type || null,
    cta_position: r.cta_structure?.position || null,
    page_length: r.page_structure?.page_length || null,
    trust_badges: r.trust_elements?.badges || [],
    easy_pay: r.cta_structure?.easy_pay || [],
    urgency_stock: r.urgency_scarcity?.stock_count || false,
    urgency_timedeal: r.urgency_scarcity?.timedeal || false,
    text_density_pct: r.mobile_ux?.text_density_pct || null,
    gif_count: r.mobile_ux?.gif_count || 0,
    video_autoplay: r.mobile_ux?.video_autoplay || false,
    social_proof: r.social_proof || {},
  };
}

// ── 메인 ──
async function main() {
  console.log("━━━ LP 분석 v2 시작 ━━━");
  console.log(`모드: ${DRY_RUN ? "dry-run" : "실행"}`);
  console.log(`한도: ${FILTER_LP_ID ? `lp_id=${FILTER_LP_ID}` : `${LIMIT}건`}`);
  console.log("");

  // 1. lp_snapshots 조회 (viewport=mobile, screenshot_url 있는 행)
  let snapshotQuery;
  if (FILTER_LP_ID) {
    snapshotQuery = `/lp_snapshots?select=id,lp_id,screenshot_url&viewport=eq.mobile&screenshot_url=not.is.null&lp_id=eq.${FILTER_LP_ID}`;
  } else {
    snapshotQuery = `/lp_snapshots?select=id,lp_id,screenshot_url&viewport=eq.mobile&screenshot_url=not.is.null&limit=${LIMIT}`;
  }

  let snapshots;
  try {
    snapshots = await sbGet(snapshotQuery);
  } catch (e) {
    console.error("lp_snapshots 조회 실패:", e.message);
    process.exit(1);
  }

  if (!snapshots || snapshots.length === 0) {
    console.log("분석 대상 스냅샷이 없습니다.");
    process.exit(0);
  }

  console.log(`스냅샷 조회: ${snapshots.length}건`);

  // 2. 각 스냅샷에 대해 landing_pages 조회 + lp_analysis 스킵 체크
  const targets = [];
  let skippedCount = 0;

  for (const snap of snapshots) {
    const lpId = snap.lp_id;

    // landing_pages에서 account_id, canonical_url 조회
    let lpRows;
    try {
      lpRows = await sbGet(
        `/landing_pages?select=id,account_id,canonical_url&id=eq.${lpId}&limit=1`
      );
    } catch (e) {
      console.warn(`  [WARN] landing_pages 조회 실패 (lp_id=${lpId}): ${e.message}`);
      continue;
    }

    if (!lpRows || lpRows.length === 0) {
      console.warn(`  [WARN] landing_pages 없음 (lp_id=${lpId})`);
      continue;
    }

    const lp = lpRows[0];

    // lp_analysis에 reference_based 이미 있는지 + analyzed_at NULL(재분석 대상) 체크
    let analysisRows;
    try {
      analysisRows = await sbGet(
        `/lp_analysis?select=id,reference_based,analyzed_at&lp_id=eq.${lpId}&viewport=eq.mobile&limit=1`
      );
    } catch (e) {
      console.warn(`  [WARN] lp_analysis 조회 실패 (lp_id=${lpId}): ${e.message}`);
      continue;
    }

    const existingAnalysis = analysisRows?.[0];
    // analyzed_at가 NULL이면 재분석 대상 (content_hash 변경 → crawl-lps가 리셋)
    const needsReanalysis = existingAnalysis && existingAnalysis.analyzed_at == null;
    if (existingAnalysis?.reference_based != null && !needsReanalysis) {
      console.log(`  [SKIP] lp_id=${lpId} — 이미 분석됨`);
      skippedCount++;
      continue;
    }
    if (needsReanalysis) {
      console.log(`  [RE-ANALYZE] lp_id=${lpId} — content_hash 변경 감지`);
    }

    targets.push({
      snapshotId: snap.id,
      lp_id: lpId,
      account_id: lp.account_id,
      canonical_url: lp.canonical_url,
      screenshot_url: snap.screenshot_url,
    });
  }

  console.log(`\n분석 대상: ${targets.length}건 (스킵: ${skippedCount}건)`);

  if (targets.length === 0) {
    console.log("\n분석할 대상이 없습니다.");
    printSummary(0, skippedCount, 0, targets.length);
    return;
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] 대상 목록:");
    for (const t of targets) {
      console.log(`  lp_id=${t.lp_id}  url=${t.canonical_url}`);
      console.log(`    screenshot=${t.screenshot_url}`);
    }
    printSummary(0, skippedCount, 0, targets.length);
    return;
  }

  // 3. 각 대상 분석
  let analyzedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    console.log(`\n[${i + 1}/${targets.length}] lp_id=${t.lp_id}`);
    console.log(`  URL: ${t.canonical_url}`);
    console.log(`  screenshot: ${t.screenshot_url}`);

    // a. Storage에서 이미지 다운로드
    let base64, mimeType;
    try {
      ({ base64, mimeType } = await downloadImageAsBase64(t.screenshot_url));
      console.log(`  이미지 다운로드 완료 (${mimeType})`);
    } catch (e) {
      console.error(`  [ERROR] 이미지 다운로드 실패: ${e.message}`);
      errorCount++;
      continue;
    }

    // b. Gemini 2.5 Pro 호출
    console.log(`  Gemini 분석 중...`);
    const { result, error } = await callGeminiVision(base64, mimeType, t.canonical_url);

    if (error) {
      console.error(`  [ERROR] Gemini 호출 실패: ${error}`);
      errorCount++;

      // rate limit 후 다음 요청
      if (i < targets.length - 1) await sleep(RATE_LIMIT_MS);
      continue;
    }

    console.log(`  Gemini 응답 수신 완료`);

    // c. flat 컬럼 추출
    const flatColumns = extractFlatColumns(result);

    // d. lp_analysis UPSERT
    const upsertRecord = {
      lp_id: t.lp_id,
      viewport: "mobile",
      reference_based: result,
      ...flatColumns,
      model_version: "gemini-2.5-pro-lp-v2",
      analyzed_at: new Date().toISOString(),
    };

    const upsertResult = await sbPost("lp_analysis", upsertRecord);
    if (!upsertResult.ok) {
      console.error(`  [ERROR] UPSERT 실패: ${upsertResult.status} ${upsertResult.body}`);
      errorCount++;
    } else {
      console.log(`  UPSERT 완료`);
      analyzedCount++;
    }

    // rate limit: 마지막 항목이 아니면 대기
    if (i < targets.length - 1) {
      await sleep(RATE_LIMIT_MS);
    }
  }

  printSummary(analyzedCount, skippedCount, errorCount, targets.length);
}

function printSummary(analyzed, skipped, errors, total) {
  console.log("\n━━━ LP 분석 v2 결과 ━━━");
  console.log(`대상: ${total}건`);
  console.log(`분석 완료: ${analyzed}건`);
  console.log(`스킵 (이미 분석됨): ${skipped}건`);
  console.log(`에러: ${errors}건`);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
