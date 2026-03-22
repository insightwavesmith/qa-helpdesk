#!/usr/bin/env node
/**
 * LP 데이터 기반 교차분석 + 전환율 추정
 *
 * landing_pages → creatives (lp_id) → daily_ad_insights (ad_id) 체인으로
 * LP별 전환율(click_to_purchase_rate), ROAS, CTR을 집계한 후,
 * lp_analysis.reference_based에서 8개 boolean 요소를 파싱하여
 * 요소별 전환율 impact를 교차분석한다.
 *
 * Usage:
 *   node scripts/compute-lp-data-analysis.mjs [--days N] [--min-clicks N] [--dry-run]
 *
 * Options:
 *   --days N       성과 데이터 기간 (기본 30일)
 *   --min-clicks N 최소 클릭 수 필터 (기본 100)
 *   --dry-run      계산만, DB 업데이트 안 함
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 옵션 ──
const DRY_RUN = process.argv.includes("--dry-run");

const DAYS_IDX = process.argv.indexOf("--days");
const DAYS = DAYS_IDX !== -1 ? parseInt(process.argv[DAYS_IDX + 1], 10) : 30;

const MIN_CLICKS_IDX = process.argv.indexOf("--min-clicks");
const MIN_CLICKS = MIN_CLICKS_IDX !== -1 ? parseInt(process.argv[MIN_CLICKS_IDX + 1], 10) : 100;

// ── .env.local 파싱 ──
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

// ── Supabase 헬퍼 ──
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
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

// ── 날짜 헬퍼 ──
function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ── 수학 헬퍼 ──
function sum(arr) {
  return arr.reduce((acc, v) => acc + v, 0);
}

function avg(arr) {
  if (!arr || arr.length === 0) return null;
  const valid = arr.filter((v) => v !== null && v !== undefined && !isNaN(v));
  if (valid.length === 0) return null;
  return sum(valid) / valid.length;
}

// ── LP 요소 파서 ──
const ELEMENTS = {
  reviews_present: (rb) => (rb?.social_proof?.review_count || 0) > 0,
  sticky_cta: (rb) => rb?.cta_structure?.type === "sticky",
  urgency_timer: (rb) => rb?.urgency_scarcity?.timer === true,
  trust_certification: (rb) => rb?.trust_elements?.certification === true,
  easy_pay_available: (rb) => (rb?.cta_structure?.easy_pay?.length || 0) > 0,
  brand_story: (rb) => rb?.trust_elements?.brand_story === true,
  photo_reviews: (rb) => (rb?.social_proof?.types || []).includes("photo"),
  objection_handling: (rb) => rb?.conversion_psychology?.objection_handling === true,
};

// ── main ──
async function main() {
  console.log(`LP 데이터 기반 교차분석 + 전환율 추정${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`기간: ${DAYS}일, 최소 클릭: ${MIN_CLICKS}건`);
  console.log();

  const PAGE_SIZE = 1000;
  const thirtyDaysAgo = getDateDaysAgo(DAYS);
  const today = getTodayStr();

  // ── 1. landing_pages (is_active=true) 조회 ──
  console.log("landing_pages 조회 중...");
  let landingPages = [];
  let offset = 0;
  while (true) {
    const batch = await sbGet(
      `/landing_pages?select=id,account_id,canonical_url,product_name` +
      `&is_active=eq.true&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    landingPages.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`LP 전체: ${landingPages.length}건`);

  if (landingPages.length === 0) {
    console.log("처리할 LP가 없습니다.");
    return;
  }

  // ── 2. lp_analysis 조회 (reference_based, data_based, existing rows) ──
  console.log("lp_analysis 조회 중...");
  const analysisMap = new Map(); // lp_id → lp_analysis row
  let analysisOffset = 0;
  while (true) {
    const batch = await sbGet(
      `/lp_analysis?select=id,lp_id,viewport,reference_based,data_based,conversion_score` +
      `&viewport=eq.mobile&order=lp_id.asc&offset=${analysisOffset}&limit=${PAGE_SIZE}`
    );
    for (const row of batch) {
      analysisMap.set(row.lp_id, row);
    }
    if (batch.length < PAGE_SIZE) break;
    analysisOffset += PAGE_SIZE;
  }
  console.log(`lp_analysis (mobile): ${analysisMap.size}건`);
  console.log();

  // ── 3. LP별 성과 집계 ──
  console.log("LP별 성과 데이터 집계 중...");

  const lpResults = []; // { lp, adIds, clicks, purchases, spend, revenue, impressions, click_to_purchase_rate, roas, ctr }

  let matchedCount = 0;
  let sufficientCount = 0;

  for (const lp of landingPages) {
    // 3-1. creatives에서 lp_id로 ad_id 목록 조회
    const creativesBatch = await sbGet(
      `/creatives?select=ad_id&lp_id=eq.${lp.id}&is_active=eq.true`
    );
    const adIds = creativesBatch.map((r) => r.ad_id).filter(Boolean);

    if (adIds.length === 0) {
      // 광고 없는 LP 스킵
      continue;
    }

    matchedCount++;

    // 3-2. daily_ad_insights 집계 (각 ad_id별로 조회 후 합산)
    let totalClicks = 0;
    let totalPurchases = 0;
    let totalSpend = 0;
    let totalRevenue = 0;
    let totalImpressions = 0;

    for (const adId of adIds) {
      const insights = await sbGet(
        `/daily_ad_insights?select=impressions,clicks,purchases,spend,revenue` +
        `&ad_id=eq.${adId}&date=gte.${thirtyDaysAgo}&date=lte.${today}`
      );
      for (const r of insights) {
        totalClicks += r.clicks || 0;
        totalPurchases += r.purchases || 0;
        totalSpend += r.spend || 0;
        totalRevenue += r.revenue || 0;
        totalImpressions += r.impressions || 0;
      }
    }

    // 3-3. 최소 클릭 필터
    if (totalClicks < MIN_CLICKS) {
      continue;
    }

    sufficientCount++;

    const click_to_purchase_rate =
      totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : null;
    const roas = totalSpend > 0 ? totalRevenue / totalSpend : null;
    const ctr =
      totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null;

    lpResults.push({
      lp,
      adIds,
      clicks: totalClicks,
      purchases: totalPurchases,
      spend: totalSpend,
      revenue: totalRevenue,
      impressions: totalImpressions,
      click_to_purchase_rate,
      roas,
      ctr,
    });
  }

  console.log(`성과 데이터 매칭: ${matchedCount}건`);
  console.log(`클릭 충분 (≥${MIN_CLICKS}): ${sufficientCount}건`);
  console.log();

  if (lpResults.length === 0) {
    console.log("분석 가능한 LP가 없습니다.");
    return;
  }

  // ── 4. LP 요소 × 전환율 교차분석 ──
  console.log("LP 요소 × 전환율 교차분석 중...");

  // reference_based가 있는 LP만 교차분석에 포함
  const lpWithRB = lpResults.filter((r) => {
    const analysisRow = analysisMap.get(r.lp.id);
    return analysisRow?.reference_based != null;
  });

  console.log(`reference_based 있는 LP: ${lpWithRB.length}건`);

  const elementResults = {};

  for (const [elementKey, extractFn] of Object.entries(ELEMENTS)) {
    const withGroup = lpWithRB.filter((r) => {
      const rb = analysisMap.get(r.lp.id)?.reference_based;
      try {
        return extractFn(rb) === true;
      } catch {
        return false;
      }
    });

    const withoutGroup = lpWithRB.filter((r) => {
      const rb = analysisMap.get(r.lp.id)?.reference_based;
      try {
        return extractFn(rb) !== true;
      } catch {
        return true;
      }
    });

    const withRates = withGroup
      .map((r) => r.click_to_purchase_rate)
      .filter((v) => v !== null);
    const withoutRates = withoutGroup
      .map((r) => r.click_to_purchase_rate)
      .filter((v) => v !== null);

    const withRate = avg(withRates);
    const withoutRate = avg(withoutRates);

    const impact_delta =
      withRate !== null && withoutRate !== null
        ? Math.round((withRate - withoutRate) * 100) / 100
        : null;
    const impact_pct =
      withoutRate !== null && withoutRate > 0 && impact_delta !== null
        ? Math.round((impact_delta / withoutRate) * 100)
        : 0;

    const minSample = Math.min(withGroup.length, withoutGroup.length);
    const confidence =
      minSample >= 30 ? "high" : minSample >= 10 ? "medium" : "low";

    elementResults[elementKey] = {
      with: withRate !== null ? Math.round(withRate * 100) / 100 : null,
      without: withoutRate !== null ? Math.round(withoutRate * 100) / 100 : null,
      impact_delta,
      impact_pct,
      sample_with: withGroup.length,
      sample_without: withoutGroup.length,
      confidence,
    };
  }

  // ── 5. conversion_score 백분위 계산 ──
  console.log("전환율 백분위 계산 중...");

  const ratesForPercentile = lpResults
    .map((r) => r.click_to_purchase_rate)
    .filter((v) => v !== null);
  const sortedRates = [...ratesForPercentile].sort((a, b) => a - b);

  function calcPercentile(rate) {
    if (rate === null || sortedRates.length === 0) return null;
    const rank = sortedRates.filter((r) => r <= rate).length;
    return Math.round((rank / sortedRates.length) * 100);
  }

  // ── 6. lp_analysis UPSERT ──
  console.log(`lp_analysis data_based ${DRY_RUN ? "저장 (dry-run — 실제 저장 안 함)" : "저장"} 중...`);

  let savedCount = 0;
  let insertCount = 0;
  let patchCount = 0;
  let errors = 0;

  for (const result of lpResults) {
    const { lp, adIds, click_to_purchase_rate, roas, ctr } = result;

    const benchmark_percentile = calcPercentile(click_to_purchase_rate);

    const dataBased = {
      conversion_rate: click_to_purchase_rate !== null
        ? Math.round(click_to_purchase_rate * 100) / 100
        : null,
      roas: roas !== null ? Math.round(roas * 100) / 100 : null,
      ctr: ctr !== null ? Math.round(ctr * 100) / 100 : null,
      ad_count: adIds.length,
      data_period: `${thirtyDaysAgo}~${today}`,
      benchmark_percentile,
      element_correlation: elementResults,
      confidence_note: "high: ≥30 samples, medium: 10-29, low: <10",
    };

    if (DRY_RUN) {
      savedCount++;
      continue;
    }

    const existingRow = analysisMap.get(lp.id);

    let opResult;
    if (existingRow) {
      // 기존 행 PATCH
      opResult = await sbPatch(
        "lp_analysis",
        `id=eq.${existingRow.id}`,
        {
          data_based: dataBased,
          conversion_score: click_to_purchase_rate,
        }
      );
      if (opResult.ok) patchCount++;
    } else {
      // 신규 행 INSERT
      opResult = await sbPost("lp_analysis", {
        lp_id: lp.id,
        viewport: "mobile",
        data_based: dataBased,
        conversion_score: click_to_purchase_rate,
      });
      if (opResult.ok) insertCount++;
    }

    if (!opResult.ok) {
      console.error(`  X DB 저장 실패 (lp_id=${lp.id}): ${opResult.body}`);
      errors++;
    } else {
      savedCount++;
    }
  }

  // ── 결과 출력 ──
  console.log();
  console.log("━━━ LP 데이터 분석 결과 ━━━");
  console.log(`LP 전체: ${landingPages.length}건`);
  console.log(`성과 데이터 매칭: ${matchedCount}건`);
  console.log(`클릭 충분 (≥${MIN_CLICKS}): ${sufficientCount}건`);
  if (DRY_RUN) {
    console.log(`data_based 저장: (dry-run — 실제 저장 안 함, 대상: ${savedCount}건)`);
  } else {
    console.log(`data_based 저장: ${savedCount}건 (신규: ${insertCount}, 수정: ${patchCount})`);
    if (errors > 0) console.log(`실패: ${errors}건`);
  }
  console.log(`element_correlation 요소: ${Object.keys(ELEMENTS).length}개`);
  console.log();
  console.log("요소별 impact_delta:");
  for (const [key, val] of Object.entries(elementResults)) {
    const deltaStr =
      val.impact_delta !== null
        ? (val.impact_delta >= 0 ? `+${val.impact_delta.toFixed(2)}%` : `${val.impact_delta.toFixed(2)}%`)
        : "N/A";
    console.log(`  ${key}: ${deltaStr} (confidence: ${val.confidence}, with: ${val.sample_with}건, without: ${val.sample_without}건)`);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
