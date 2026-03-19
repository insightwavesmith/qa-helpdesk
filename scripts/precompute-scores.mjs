#!/usr/bin/env node
/**
 * 사전계산 스크립트 — Phase 1 핵심 3개
 *
 * 1. T3 점수 사전계산 (t3_scores_precomputed)
 * 2. 수강생 성과 사전계산 (student_performance_daily)
 * 3. 광고 진단 사전계산 (ad_diagnosis_cache)
 *
 * Usage:
 *   node scripts/precompute-scores.mjs
 *   node scripts/precompute-scores.mjs --only t3
 *   node scripts/precompute-scores.mjs --only student
 *   node scripts/precompute-scores.mjs --only diagnosis
 *   node scripts/precompute-scores.mjs --dry-run
 *   node scripts/precompute-scores.mjs --account-id <id>
 *
 * DB 마이그레이션 (최초 실행 전 Supabase에서 수동 실행):
 * ─────────────────────────────────────────────────────
 *
 * -- 1. T3 점수 사전계산 테이블
 * CREATE TABLE IF NOT EXISTS t3_scores_precomputed (
 *   id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   account_id      text NOT NULL,
 *   period          integer NOT NULL,
 *   score           integer,
 *   grade           text,
 *   grade_label     text,
 *   metrics_json    jsonb,
 *   diagnostics_json jsonb,
 *   summary_json    jsonb,
 *   data_available_days integer,
 *   has_benchmark_data  boolean DEFAULT false,
 *   computed_at     timestamptz DEFAULT now()
 * );
 * CREATE INDEX IF NOT EXISTS idx_t3_scores_account_period
 *   ON t3_scores_precomputed (account_id, period, computed_at DESC);
 *
 * -- 2. 수강생 성과 사전계산 테이블
 * CREATE TABLE IF NOT EXISTS student_performance_daily (
 *   id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   student_id       uuid NOT NULL,
 *   period           integer NOT NULL,
 *   name             text,
 *   email            text,
 *   cohort           text,
 *   spend            numeric DEFAULT 0,
 *   revenue          numeric DEFAULT 0,
 *   roas             numeric DEFAULT 0,
 *   purchases        numeric DEFAULT 0,
 *   t3_score         integer,
 *   t3_grade         text,
 *   mixpanel_revenue numeric DEFAULT 0,
 *   mixpanel_purchases numeric DEFAULT 0,
 *   computed_at      timestamptz DEFAULT now()
 * );
 * CREATE INDEX IF NOT EXISTS idx_student_perf_period
 *   ON student_performance_daily (period, computed_at DESC);
 * CREATE INDEX IF NOT EXISTS idx_student_perf_cohort
 *   ON student_performance_daily (cohort, period, computed_at DESC);
 *
 * -- 3. 광고 진단 캐시 테이블
 * CREATE TABLE IF NOT EXISTS ad_diagnosis_cache (
 *   id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   account_id      text NOT NULL,
 *   ad_id           text NOT NULL,
 *   ad_name         text,
 *   creative_type   text,
 *   overall_verdict text,
 *   one_liner       text,
 *   parts_json      jsonb,
 *   spend           numeric,
 *   computed_at     timestamptz DEFAULT now()
 * );
 * CREATE INDEX IF NOT EXISTS idx_ad_diag_account
 *   ON ad_diagnosis_cache (account_id, computed_at DESC);
 * ─────────────────────────────────────────────────────
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ━━━ CLI 인수 파싱 ━━━
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const onlyIdx = args.indexOf("--only");
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null; // "t3" | "student" | "diagnosis" | null

const accountIdx = args.indexOf("--account-id");
const FILTER_ACCOUNT_ID = accountIdx >= 0 ? args[accountIdx + 1] : null;

// ━━━ 환경변수 로드 ━━━
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("[ERROR] NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

// ━━━ Supabase REST 헬퍼 ━━━
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`sbGet ${res.status} ${path}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

async function sbPost(table, rows, onConflict) {
  if (DRY_RUN) {
    console.log(`  [dry-run] UPSERT ${table} (${Array.isArray(rows) ? rows.length : 1}행)`);
    return { ok: true };
  }
  const url = onConflict
    ? `${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`
    : `${SB_URL}/rest/v1/${table}`;
  const body = Array.isArray(rows) ? rows : [rows];
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: onConflict
        ? "resolution=merge-duplicates,return=minimal"
        : "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error(`  [ERROR] UPSERT ${table} failed ${res.status}: ${text.slice(0, 300)}`);
  }
  return { ok: res.ok, status: res.status };
}

async function sbDelete(table, filter) {
  if (DRY_RUN) {
    console.log(`  [dry-run] DELETE ${table} WHERE ${filter}`);
    return { ok: true };
  }
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
  return { ok: res.ok, status: res.status };
}

// ━━━ 날짜 유틸 ━━━
function toLocalDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function periodToDateRange(period) {
  const end = new Date();
  end.setDate(end.getDate() - 1); // 어제까지
  const endStr = toLocalDateStr(end);
  const start = new Date(end);
  start.setDate(start.getDate() - (period - 1));
  const startStr = toLocalDateStr(start);
  return { start: startStr, end: endStr };
}

// ━━━ T3 엔진 (JS 이식) ━━━
// t3-engine.ts의 핵심 로직을 JS로 이식

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function mapRatioToScore(ratio) {
  if (ratio >= 1.33) return 100;
  if (ratio >= 1.0) return 75 + ((ratio - 1.0) / 0.33) * 25;
  if (ratio >= 0.75) return 50 + ((ratio - 0.75) / 0.25) * 25;
  if (ratio >= 0.5) return 25 + ((ratio - 0.5) / 0.25) * 25;
  return Math.max(0, (ratio / 0.5) * 25);
}

function calculateMetricScore(value, aboveAvg, ascending = true) {
  if (!aboveAvg || aboveAvg === 0) return 50;
  const ratio = ascending ? value / aboveAvg : aboveAvg / value;
  return clamp(mapRatioToScore(ratio), 0, 100);
}

function scoreToStatus(score) {
  if (score >= 75) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

function scoreToGrade(score) {
  if (score >= 80) return { grade: "A", label: "우수" };
  if (score >= 60) return { grade: "B", label: "양호" };
  if (score >= 40) return { grade: "C", label: "보통" };
  if (score >= 20) return { grade: "D", label: "주의 필요" };
  return { grade: "F", label: "위험" };
}

// metric-groups.ts의 지표 정의 (JS 이식)
const T3_PARTS = {
  foundation: {
    label: "기반점수",
    metrics: [
      { name: "3초시청률", key: "video_p3s_rate", ascending: true, unit: "%" },
      { name: "ThruPlay율", key: "thruplay_rate", ascending: true, unit: "%" },
      { name: "지속비율", key: "retention_rate", ascending: true, unit: "%" },
    ],
  },
  engagement: {
    label: "참여율",
    metrics: [
      { name: "좋아요/만노출", key: "reactions_per_10k", ascending: true, unit: "" },
      { name: "댓글/만노출", key: "comments_per_10k", ascending: true, unit: "" },
      { name: "공유/만노출", key: "shares_per_10k", ascending: true, unit: "" },
      { name: "저장/만노출", key: "saves_per_10k", ascending: true, unit: "" },
      { name: "참여합계/만노출", key: "engagement_per_10k", ascending: true, unit: "" },
    ],
  },
  conversion: {
    label: "전환율",
    metrics: [
      { name: "CTR", key: "ctr", ascending: true, unit: "%" },
      { name: "결제시작율", key: "click_to_checkout_rate", ascending: true, unit: "%" },
      { name: "구매전환율", key: "click_to_purchase_rate", ascending: true, unit: "%" },
      { name: "결제→구매율", key: "checkout_to_purchase_rate", ascending: true, unit: "%" },
      { name: "노출당구매확률", key: "reach_to_purchase_rate", ascending: true, unit: "%" },
      { name: "ROAS", key: "roas", ascending: true, unit: "" },
    ],
  },
};

const ALL_METRIC_DEFS = Object.values(T3_PARTS).flatMap((p) => p.metrics);

function computeMetricValues(rows) {
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalPurchases = 0;
  let totalVideoP3s = 0;
  let totalThruplay = 0;
  let totalVideoP100 = 0;
  let totalReactions = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSaves = 0;
  let totalInitiateCheckout = 0;
  let totalReach = 0;

  for (const row of rows) {
    const imp = Number(row.impressions) || 0;
    const clk = Number(row.clicks) || 0;
    const rowReach = Number(row.reach) || 0;

    totalImpressions += imp;
    totalClicks += clk;
    totalPurchases += Number(row.purchases) || 0;
    totalReach += rowReach;
    totalInitiateCheckout += Number(row.initiate_checkout) || 0;

    const p3sRate = Number(row.video_p3s_rate) || 0;
    totalVideoP3s += (p3sRate / 100) * imp;

    const thruplayRate = Number(row.thruplay_rate) || 0;
    totalThruplay += (thruplayRate / 100) * imp;

    const p3sRaw = (p3sRate / 100) * imp;
    const retentionRate = Number(row.retention_rate) || 0;
    totalVideoP100 += (retentionRate / 100) * p3sRaw;

    const reactPer10k = Number(row.reactions_per_10k) || 0;
    const commentPer10k = Number(row.comments_per_10k) || 0;
    const sharePer10k = Number(row.shares_per_10k) || 0;
    const savesPer10k = Number(row.saves_per_10k) || 0;
    totalReactions += (reactPer10k / 10000) * imp;
    totalComments += (commentPer10k / 10000) * imp;
    totalShares += (sharePer10k / 10000) * imp;
    totalSaves += (savesPer10k / 10000) * imp;
  }

  return {
    video_p3s_rate: totalImpressions > 0 ? (totalVideoP3s / totalImpressions) * 100 : null,
    thruplay_rate: totalImpressions > 0 ? (totalThruplay / totalImpressions) * 100 : null,
    retention_rate: totalVideoP3s > 0 ? (totalVideoP100 / totalVideoP3s) * 100 : null,
    reactions_per_10k: totalImpressions > 0 ? (totalReactions / totalImpressions) * 10000 : null,
    comments_per_10k: totalImpressions > 0 ? (totalComments / totalImpressions) * 10000 : null,
    shares_per_10k: totalImpressions > 0 ? (totalShares / totalImpressions) * 10000 : null,
    saves_per_10k: totalImpressions > 0 ? (totalSaves / totalImpressions) * 10000 : null,
    engagement_per_10k:
      totalImpressions > 0
        ? ((totalReactions + totalComments + totalShares + totalSaves) / totalImpressions) * 10000
        : null,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
    click_to_checkout_rate: totalClicks > 0 ? (totalInitiateCheckout / totalClicks) * 100 : null,
    click_to_purchase_rate: totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : null,
    checkout_to_purchase_rate:
      totalInitiateCheckout > 0 ? (totalPurchases / totalInitiateCheckout) * 100 : null,
    reach_to_purchase_rate:
      totalImpressions > 0 ? (totalPurchases / totalImpressions) * 100 : null,
    // roas는 별도 집계 (외부에서 전달)
    roas: null,
  };
}

function getDominantCreativeType(rows) {
  const ctCounts = new Map();
  for (const row of rows) {
    let ct = ((row.creative_type ?? "ALL")).toUpperCase();
    if (ct === "SHARE") ct = "VIDEO";
    ctCounts.set(ct, (ctCounts.get(ct) ?? 0) + 1);
  }
  let dominantCT = "ALL";
  let maxCount = 0;
  for (const [ct, count] of ctCounts) {
    if (ct !== "ALL" && count > maxCount) {
      dominantCT = ct;
      maxCount = count;
    }
  }
  return dominantCT;
}

function calculateT3Score(metricValues, benchMap) {
  const diagnostics = {};
  const allMetrics = [];
  const partScores = [];

  for (const [partKey, partDef] of Object.entries(T3_PARTS)) {
    const partMetrics = [];
    const scores = [];

    for (const def of partDef.metrics) {
      const value = metricValues[def.key];
      const aboveAvg = benchMap[def.key] ?? null;
      let metricScore = null;
      let status = "⚪";

      if (value != null && aboveAvg != null) {
        metricScore = Math.round(calculateMetricScore(value, aboveAvg, def.ascending) * 100) / 100;
        status = scoreToStatus(metricScore);
        scores.push(metricScore);
      }

      const result = {
        name: def.name,
        key: def.key,
        value: value != null ? Math.round(value * 100) / 100 : null,
        score: metricScore != null ? Math.round(metricScore) : null,
        aboveAvg: aboveAvg != null ? Math.round(aboveAvg * 100) / 100 : null,
        pctOfBenchmark:
          value != null && aboveAvg != null && aboveAvg > 0
            ? Math.round((value / aboveAvg) * 100)
            : null,
        status,
        unit: def.unit,
      };

      partMetrics.push(result);
      allMetrics.push(result);
    }

    const partScore =
      scores.length > 0
        ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
        : 0;

    diagnostics[partKey] = {
      label: partDef.label,
      score: partScore,
      metrics: partMetrics,
    };

    partScores.push(partScore);
  }

  const t3Score =
    partScores.length > 0
      ? Math.round(partScores.reduce((a, b) => a + b, 0) / partScores.length)
      : 0;

  return {
    score: t3Score,
    grade: scoreToGrade(t3Score),
    diagnostics,
    metrics: allMetrics,
  };
}

// ━━━ 벤치마크 조회 (공통) ━━━
async function fetchBenchmarks() {
  // 최신 calculated_at 기준으로 ABOVE_AVERAGE 조회
  const latestRows = await sbGet(
    "/benchmarks?select=calculated_at&order=calculated_at.desc&limit=1"
  );
  if (!latestRows || latestRows.length === 0) return { byType: new Map(), gcpBenchmarks: {} };

  const latestAt = latestRows[0].calculated_at.slice(0, 10);

  const benchRows = await sbGet(
    `/benchmarks?select=*&ranking_group=eq.ABOVE_AVERAGE&calculated_at=gte.${latestAt}`
  );

  if (!benchRows || benchRows.length === 0) return { byType: new Map(), gcpBenchmarks: {} };

  // T3용: byType Map (creative_type → metric → value)
  const byType = new Map();

  // 진단용: GCPBenchmarks 형식 (creative_type → engagement/conversion → above_avg)
  const gcpBenchmarks = {};

  for (const row of benchRows) {
    const ct = ((row.creative_type) ?? "ALL").toUpperCase();
    const rt = (row.ranking_type) ?? "engagement"; // engagement | conversion

    // T3용
    if (!byType.has(ct)) byType.set(ct, {});
    const ctMap = byType.get(ct);
    for (const def of ALL_METRIC_DEFS) {
      const val = row[def.key];
      if (val != null && typeof val === "number" && ctMap[def.key] == null) {
        ctMap[def.key] = val;
      }
    }

    // 진단용 (GCP format)
    if (!gcpBenchmarks[ct]) gcpBenchmarks[ct] = {};
    if (!gcpBenchmarks[ct][rt]) {
      gcpBenchmarks[ct][rt] = {
        above_avg: {
          video_p3s_rate: row.video_p3s_rate ?? null,
          thruplay_rate: row.thruplay_rate ?? null,
          retention_rate: row.retention_rate ?? null,
          reactions_per_10k: row.reactions_per_10k ?? null,
          comments_per_10k: row.comments_per_10k ?? null,
          shares_per_10k: row.shares_per_10k ?? null,
          saves_per_10k: row.saves_per_10k ?? null,
          engagement_per_10k: row.engagement_per_10k ?? null,
          ctr: row.ctr ?? null,
          click_to_checkout_rate: row.click_to_checkout_rate ?? null,
          click_to_purchase_rate: row.click_to_purchase_rate ?? null,
          checkout_to_purchase_rate: row.checkout_to_purchase_rate ?? null,
          reach_to_purchase_rate: row.reach_to_purchase_rate ?? null,
          roas: row.roas ?? null,
        },
        sample_count: row.sample_count ?? undefined,
      };
    }
  }

  return { byType, gcpBenchmarks };
}

function resolveBenchmarksForType(byType, dominantCT) {
  const result = {};
  const primary = byType.get(dominantCT);
  const fallback = byType.get("ALL");

  for (const def of ALL_METRIC_DEFS) {
    const entry = primary?.[def.key] ?? fallback?.[def.key];
    if (entry != null) result[def.key] = entry;
  }

  return result;
}

// ━━━ 1. T3 점수 사전계산 ━━━
async function computeT3Scores() {
  console.log("\n━━━ [1/3] T3 점수 사전계산 ━━━");

  // 전체 ad_accounts 조회
  let accountsPath = "/ad_accounts?select=account_id,account_name,active&active=eq.true";
  if (FILTER_ACCOUNT_ID) {
    accountsPath += `&account_id=eq.${encodeURIComponent(FILTER_ACCOUNT_ID)}`;
  }
  const accounts = await sbGet(accountsPath);
  console.log(`  대상 계정: ${accounts.length}개`);

  if (accounts.length === 0) {
    console.log("  계정 없음. 건너뜀.");
    return;
  }

  // 벤치마크 조회 (1회)
  const { byType } = await fetchBenchmarks();
  console.log(`  벤치마크 크리에이티브 타입: ${[...byType.keys()].join(", ") || "없음"}`);
  const hasBenchmarkData = byType.size > 0;

  const PERIODS = [1, 7, 14, 30, 90];
  let okCount = 0;
  let errCount = 0;
  const computedAt = new Date().toISOString();

  for (const account of accounts) {
    const accountId = account.account_id;
    console.log(`\n  [계정] ${account.account_name ?? accountId} (${accountId})`);

    for (const period of PERIODS) {
      try {
        const { start, end } = periodToDateRange(period);

        // daily_ad_insights 조회
        const insightsPath =
          `/daily_ad_insights?select=spend,impressions,reach,clicks,purchases,purchase_value,` +
          `date,ad_id,adset_id,initiate_checkout,video_p3s_rate,thruplay_rate,retention_rate,` +
          `reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,roas,creative_type` +
          `&account_id=eq.${encodeURIComponent(accountId)}` +
          `&date=gte.${start}&date=lte.${end}&limit=99999`;

        const rows = await sbGet(insightsPath);

        if (!rows || rows.length === 0) {
          console.log(`    period=${period}d: 데이터 없음. 스킵.`);
          continue;
        }

        // 집계 지표 (summary용)
        let totalSpend = 0;
        let totalImpressions = 0;
        let totalReach = 0;
        let totalClicks = 0;
        let totalPurchases = 0;
        let totalPurchaseValue = 0;
        const uniqueDates = new Set();
        const adIds = new Set();

        for (const row of rows) {
          totalSpend += Number(row.spend) || 0;
          totalImpressions += Number(row.impressions) || 0;
          totalReach += Number(row.reach) || 0;
          totalClicks += Number(row.clicks) || 0;
          totalPurchases += Number(row.purchases) || 0;
          totalPurchaseValue += Number(row.purchase_value) || 0;
          if (row.date) uniqueDates.add(row.date);
          if (row.ad_id) adIds.add(row.ad_id);
        }

        const dataAvailableDays = uniqueDates.size;

        // 지표값 계산
        const metricValues = computeMetricValues(rows);

        // roas는 summary에서 계산 (impressions-based가 아닌 spend-based)
        const computedRoas = totalSpend > 0
          ? Math.round((totalPurchaseValue / totalSpend) * 100) / 100
          : null;
        metricValues.roas = computedRoas;

        // 벤치마크 해소
        const dominantCT = getDominantCreativeType(rows);
        const benchMap = resolveBenchmarksForType(byType, dominantCT);

        // T3 점수 계산
        const t3Result = calculateT3Score(metricValues, benchMap);

        // 저장 행 구성
        const scoreRow = {
          account_id: accountId,
          period,
          score: t3Result.score,
          grade: t3Result.grade.grade,
          grade_label: t3Result.grade.label,
          metrics_json: t3Result.metrics,
          diagnostics_json: t3Result.diagnostics,
          summary_json: {
            spend: Math.round(totalSpend),
            impressions: totalImpressions,
            reach: totalReach,
            clicks: totalClicks,
            purchases: totalPurchases,
            purchaseValue: Math.round(totalPurchaseValue),
            roas: computedRoas ?? 0,
            adCount: adIds.size,
          },
          data_available_days: dataAvailableDays,
          has_benchmark_data: hasBenchmarkData,
          computed_at: computedAt,
        };

        // 기존 행 삭제 후 INSERT (on_conflict 키가 없으므로 DELETE + INSERT)
        if (!DRY_RUN) {
          await sbDelete(
            "t3_scores_precomputed",
            `account_id=eq.${encodeURIComponent(accountId)}&period=eq.${period}`
          );
        }
        await sbPost("t3_scores_precomputed", scoreRow, null);

        console.log(`    period=${period}d: score=${t3Result.score} (${t3Result.grade.grade}), rows=${rows.length}`);
        okCount++;
      } catch (e) {
        console.error(`    period=${period}d: 에러 — ${e.message}`);
        errCount++;
      }
    }
  }

  console.log(`\n  완료: 성공=${okCount}, 에러=${errCount}`);
}

// ━━━ 2. 수강생 성과 사전계산 ━━━
async function computeStudentPerformance() {
  console.log("\n━━━ [2/3] 수강생 성과 사전계산 ━━━");

  // student 프로필 전체 조회
  const students = await sbGet(
    "/profiles?select=id,name,email,cohort&role=eq.student&limit=9999"
  );
  console.log(`  수강생: ${students.length}명`);

  if (students.length === 0) {
    console.log("  수강생 없음. 건너뜀.");
    return;
  }

  // 학생별 ad_accounts 조회
  const studentIds = students.map((s) => s.id);
  const inVal = encodeURIComponent(`(${studentIds.join(",")})`);
  const adAccounts = await sbGet(
    `/ad_accounts?select=account_id,user_id,mixpanel_project_id&user_id=in.${inVal}&active=eq.true&limit=9999`
  );

  if (adAccounts.length === 0) {
    console.log("  활성 광고계정 없음. 건너뜀.");
    return;
  }

  // 계정 → 학생 매핑
  const accountToUser = new Map();
  const projectIdToUser = new Map();
  for (const a of adAccounts) {
    if (a.user_id) {
      accountToUser.set(a.account_id, a.user_id);
      if (a.mixpanel_project_id) {
        projectIdToUser.set(a.mixpanel_project_id, a.user_id);
      }
    }
  }

  // 벤치마크 조회 (1회)
  const { byType } = await fetchBenchmarks();

  const PERIODS = [7, 14, 30];
  let okCount = 0;
  let errCount = 0;
  const computedAt = new Date().toISOString();

  for (const period of PERIODS) {
    console.log(`\n  [period=${period}d]`);

    try {
      const periodEnd = new Date();
      periodEnd.setDate(periodEnd.getDate() - 1);
      const periodStartDate = new Date(periodEnd);
      periodStartDate.setDate(periodStartDate.getDate() - (period - 1));
      const periodStart = toLocalDateStr(periodStartDate);

      // daily_ad_insights 전체 조회 (대상 계정)
      const accountIds = adAccounts.map((a) => a.account_id);
      const acctInVal = encodeURIComponent(`(${accountIds.join(",")})`);

      const insightsPath =
        `/daily_ad_insights?select=account_id,spend,purchase_value,purchases,roas,` +
        `impressions,clicks,reach,initiate_checkout,video_p3s_rate,thruplay_rate,retention_rate,` +
        `reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,creative_type` +
        `&account_id=in.${acctInVal}&date=gte.${periodStart}&limit=999999`;

      const insights = await sbGet(insightsPath);
      console.log(`    insights: ${insights.length}행`);

      // Mixpanel 데이터 조회
      const projectIds = adAccounts
        .map((a) => a.mixpanel_project_id)
        .filter((id) => id != null);

      const userMixpanel = new Map();
      if (projectIds.length > 0) {
        const projInVal = encodeURIComponent(`(${projectIds.join(",")})`);
        try {
          const mixpanelRows = await sbGet(
            `/daily_mixpanel_insights?select=project_id,total_revenue,purchase_count` +
            `&project_id=in.${projInVal}&date=gte.${periodStart}&limit=999999`
          );
          for (const row of mixpanelRows) {
            const userId = projectIdToUser.get(row.project_id);
            if (!userId) continue;
            const curr = userMixpanel.get(userId) ?? { revenue: 0, purchases: 0 };
            curr.revenue += Number(row.total_revenue) || 0;
            curr.purchases += Number(row.purchase_count) || 0;
            userMixpanel.set(userId, curr);
          }
        } catch {
          // mixpanel 테이블 없어도 계속
        }
      }

      // 학생별 집계
      const userAgg = new Map();
      const userRawRows = new Map();

      for (const row of insights) {
        const userId = accountToUser.get(row.account_id);
        if (!userId) continue;

        const curr = userAgg.get(userId) ?? {
          spend: 0, revenue: 0, purchases: 0, roasSum: 0, days: 0,
        };
        curr.spend += Number(row.spend) || 0;
        curr.revenue += Number(row.purchase_value) || 0;
        curr.purchases += Number(row.purchases) || 0;
        curr.roasSum += Number(row.roas) || 0;
        curr.days += 1;
        userAgg.set(userId, curr);

        const rawList = userRawRows.get(userId) ?? [];
        rawList.push(row);
        userRawRows.set(userId, rawList);
      }

      // 기존 사전계산 삭제
      if (!DRY_RUN) {
        await sbDelete("student_performance_daily", `period=eq.${period}`);
      }

      // 학생별 행 생성 후 일괄 UPSERT
      const rows = [];
      for (const s of students) {
        const agg = userAgg.get(s.id);
        const rawRows = userRawRows.get(s.id);
        const mixpanel = userMixpanel.get(s.id);

        let t3Score = null;
        let t3Grade = null;
        if (rawRows && rawRows.length > 0) {
          const metricValues = computeMetricValues(rawRows);
          const benchMap = resolveBenchmarksForType(byType, "ALL");
          // roas 보정
          const userAggData = userAgg.get(s.id);
          if (userAggData && userAggData.spend > 0) {
            metricValues.roas = userAggData.revenue / userAggData.spend;
          }
          const t3Result = calculateT3Score(metricValues, benchMap);
          t3Score = t3Result.score;
          t3Grade = t3Result.grade.grade;
        }

        rows.push({
          student_id: s.id,
          period,
          name: s.name ?? "",
          email: s.email ?? "",
          cohort: s.cohort ?? null,
          spend: agg?.spend ?? 0,
          revenue: agg?.revenue ?? 0,
          roas: agg && agg.days > 0 ? Math.round((agg.roasSum / agg.days) * 100) / 100 : 0,
          purchases: agg?.purchases ?? 0,
          t3_score: t3Score,
          t3_grade: t3Grade,
          mixpanel_revenue: mixpanel?.revenue ?? 0,
          mixpanel_purchases: mixpanel?.purchases ?? 0,
          computed_at: computedAt,
        });
      }

      // 배치 INSERT (100명씩)
      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        await sbPost("student_performance_daily", rows.slice(i, i + BATCH), null);
      }

      console.log(`    저장: ${rows.length}명`);
      okCount += rows.length;
    } catch (e) {
      console.error(`    period=${period}d 에러: ${e.message}`);
      errCount++;
    }
  }

  console.log(`\n  완료: 성공=${okCount}건, 에러=${errCount}건`);
}

// ━━━ 3. 광고 진단 사전계산 ━━━

// 진단 엔진 JS 이식
const VERDICT = { GOOD: "🟢", NORMAL: "🟡", POOR: "🔴", UNKNOWN: "⚪" };

const PART_METRICS = {
  0: {
    name: "기반점수",
    benchmarkSource: "engagement",
    metrics: [
      { key: "video_p3s_rate", label: "3초 시청률", reverse: false },
      { key: "thruplay_rate", label: "ThruPlay율", reverse: false },
      { key: "retention_rate", label: "지속비율", reverse: false },
    ],
  },
  1: {
    name: "참여율",
    benchmarkSource: "engagement",
    metrics: [
      { key: "reactions_per_10k", label: "좋아요/만노출", reverse: false },
      { key: "comments_per_10k", label: "댓글/만노출", reverse: false },
      { key: "shares_per_10k", label: "공유/만노출", reverse: false },
      { key: "saves_per_10k", label: "저장/만노출", reverse: false },
      { key: "engagement_per_10k", label: "참여합계/만노출", reverse: false },
    ],
  },
  2: {
    name: "전환율",
    benchmarkSource: "conversion",
    metrics: [
      { key: "ctr", label: "CTR", reverse: false },
      { key: "click_to_checkout_rate", label: "결제시작율", reverse: false },
      { key: "click_to_purchase_rate", label: "구매전환율", reverse: false },
      { key: "checkout_to_purchase_rate", label: "결제→구매율", reverse: false },
      { key: "reach_to_purchase_rate", label: "노출당구매확률", reverse: false },
      { key: "roas", label: "ROAS", reverse: false },
    ],
  },
};

// label → DB column key 역매핑 (캐시 저장 시 key 포함용)
const labelToKeyMap = new Map();
for (const partConfig of Object.values(PART_METRICS)) {
  for (const metricDef of partConfig.metrics) {
    labelToKeyMap.set(metricDef.label, metricDef.key);
  }
}

function judgeMetric(myValue, aboveAvg, isReverse = false) {
  if (myValue == null || aboveAvg == null || aboveAvg === 0) return VERDICT.UNKNOWN;
  const threshold = aboveAvg * 0.75;
  if (isReverse) {
    if (myValue <= threshold) return VERDICT.GOOD;
    if (myValue <= aboveAvg) return VERDICT.NORMAL;
    return VERDICT.POOR;
  } else {
    if (myValue >= aboveAvg) return VERDICT.GOOD;
    if (myValue >= threshold) return VERDICT.NORMAL;
    return VERDICT.POOR;
  }
}

function judgePart(metricResults) {
  const ratios = [];
  for (const m of metricResults) {
    if (m.verdict === VERDICT.UNKNOWN) continue;
    if (m.myValue != null && m.aboveAvg != null && m.aboveAvg > 0) {
      if (m.isReverse) {
        ratios.push(m.myValue > 0 ? m.aboveAvg / m.myValue : 1);
      } else {
        ratios.push(m.myValue / m.aboveAvg);
      }
    }
  }
  if (ratios.length === 0) return VERDICT.UNKNOWN;
  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  if (avgRatio >= 1.0) return VERDICT.GOOD;
  if (avgRatio >= 0.75) return VERDICT.NORMAL;
  return VERDICT.POOR;
}

function generateOneLineDiagnosis(partVerdicts, creativeType = "VIDEO") {
  const p0 = partVerdicts[0] ?? VERDICT.UNKNOWN;
  const p1 = partVerdicts[1] ?? VERDICT.UNKNOWN;
  const p2 = partVerdicts[2] ?? VERDICT.UNKNOWN;

  if (creativeType === "IMAGE" || creativeType === "CATALOG") {
    if (p0 === VERDICT.POOR) return "클릭율(CTR)이 낮아요. 이미지나 문구를 바꿔보세요.";
    if ([VERDICT.GOOD, VERDICT.NORMAL].includes(p0) && p1 === VERDICT.POOR)
      return "광고가 눈에 안 띄어요. 반응을 이끌어내는 요소가 필요해요.";
    if (
      [VERDICT.GOOD, VERDICT.NORMAL, VERDICT.UNKNOWN].includes(p0) &&
      [VERDICT.GOOD, VERDICT.NORMAL, VERDICT.UNKNOWN].includes(p1) &&
      p2 === VERDICT.POOR
    )
      return "관심은 있는데 안 사요. 제품/가격/혜택을 점검하세요.";
    const active = [p0, p1, p2].filter((v) => v !== VERDICT.UNKNOWN);
    if (active.length > 0 && active.every((v) => v === VERDICT.GOOD))
      return "잘 하고 있어요! 예산 늘려보세요.";
    if (active.some((v) => v !== VERDICT.POOR))
      return "전반적으로 괜찮아요. 🟡인 부분을 개선하면 더 좋아질 거예요.";
    return "데이터를 더 쌓으면 정확한 진단이 가능해요.";
  }

  // VIDEO
  if (p0 === VERDICT.POOR) return "영상을 먼저 바꿔야 해요. 3초 훅이 약해요.";
  if ([VERDICT.GOOD, VERDICT.NORMAL].includes(p0) && p1 === VERDICT.POOR)
    return "광고가 눈에 안 띄어요. 반응을 이끌어내는 요소가 필요해요.";
  if (
    [VERDICT.GOOD, VERDICT.NORMAL].includes(p0) &&
    [VERDICT.GOOD, VERDICT.NORMAL].includes(p1) &&
    p2 === VERDICT.POOR
  )
    return "관심은 있는데 안 사요. 제품/가격/혜택을 점검하세요.";
  if (
    [VERDICT.GOOD, VERDICT.NORMAL].includes(p0) &&
    [VERDICT.GOOD, VERDICT.NORMAL].includes(p1) &&
    [VERDICT.GOOD, VERDICT.NORMAL].includes(p2)
  ) {
    if ([p0, p1, p2].every((v) => v === VERDICT.GOOD)) return "잘 하고 있어요! 예산 늘려보세요.";
    return "전반적으로 괜찮아요. 🟡인 부분을 개선하면 더 좋아질 거예요.";
  }
  return "데이터를 더 쌓으면 정확한 진단이 가능해요.";
}

function diagnoseAd(adData, gcpBenchmarks, creativeType) {
  const effectiveCreativeType =
    creativeType ?? adData.creative_type ?? "VIDEO";

  const ctBench =
    gcpBenchmarks[effectiveCreativeType] ??
    gcpBenchmarks["ALL"] ??
    gcpBenchmarks["VIDEO"] ??
    {};
  const engAbove = ctBench.engagement?.above_avg ?? {};
  const convAbove = ctBench.conversion?.above_avg ?? {};

  const partsResults = [];
  const partVerdicts = {};

  for (const [partNumStr, partConfig] of Object.entries(PART_METRICS)) {
    const partNum = Number(partNumStr);
    const metricResults = [];

    for (const metricDef of partConfig.metrics) {
      const { key, label, reverse: isReverse, benchmarkSourceOverride } = metricDef;
      const benchmarkSource = benchmarkSourceOverride ?? partConfig.benchmarkSource;
      const aboveAvgMap = benchmarkSource === "conversion" ? convAbove : engAbove;
      const aboveAvg = (aboveAvgMap[key] ?? null);
      const myValue = (adData[key] ?? null);
      const verdict = judgeMetric(myValue, aboveAvg, isReverse);

      metricResults.push({ metricName: label, myValue, aboveAvg, verdict, isReverse });
    }

    const partVerdict = judgePart(metricResults);
    partVerdicts[partNum] = partVerdict;

    partsResults.push({
      partNum,
      partName: partConfig.name,
      metrics: metricResults,
      verdict: partVerdict,
    });
  }

  const allVerdicts = Object.values(partVerdicts);
  let overallVerdict;
  if (allVerdicts.includes(VERDICT.POOR)) {
    overallVerdict = VERDICT.POOR;
  } else if (
    allVerdicts.filter((v) => v !== VERDICT.UNKNOWN).every((v) => v === VERDICT.GOOD)
  ) {
    overallVerdict = VERDICT.GOOD;
  } else {
    overallVerdict = VERDICT.NORMAL;
  }

  const oneLineDiagnosis = generateOneLineDiagnosis(partVerdicts, effectiveCreativeType);

  return {
    adId: adData.ad_id ?? "",
    adName: adData.ad_name ?? "",
    parts: partsResults,
    overallVerdict,
    oneLineDiagnosis,
  };
}

async function computeAdDiagnosis() {
  console.log("\n━━━ [3/3] 광고 진단 사전계산 ━━━");

  // 전체 ad_accounts 조회
  let accountsPath = "/ad_accounts?select=account_id,account_name,active&active=eq.true";
  if (FILTER_ACCOUNT_ID) {
    accountsPath += `&account_id=eq.${encodeURIComponent(FILTER_ACCOUNT_ID)}`;
  }
  const accounts = await sbGet(accountsPath);
  console.log(`  대상 계정: ${accounts.length}개`);

  if (accounts.length === 0) {
    console.log("  계정 없음. 건너뜀.");
    return;
  }

  // 벤치마크 조회
  const { gcpBenchmarks } = await fetchBenchmarks();
  const hasBenchmarkData = Object.keys(gcpBenchmarks).length > 0;
  console.log(`  벤치마크: ${hasBenchmarkData ? "있음" : "없음"}`);

  let okCount = 0;
  let errCount = 0;
  const computedAt = new Date().toISOString();

  // 최근 30일 기준 진단
  const { start: dateStart, end: dateEnd } = periodToDateRange(30);

  for (const account of accounts) {
    const accountId = account.account_id;
    console.log(`\n  [계정] ${account.account_name ?? accountId}`);

    try {
      // 상위 1000건 조회 (spend DESC)
      const insightsPath =
        `/daily_ad_insights?select=ad_id,ad_name,account_id,creative_type,` +
        `impressions,reach,clicks,spend,purchases,purchase_value,` +
        `video_p3s_rate,thruplay_rate,retention_rate,` +
        `reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,engagement_per_10k,` +
        `ctr,click_to_checkout_rate,click_to_purchase_rate,checkout_to_purchase_rate,` +
        `reach_to_purchase_rate,roas,initiate_checkout` +
        `&account_id=eq.${encodeURIComponent(accountId)}` +
        `&date=gte.${dateStart}&date=lte.${dateEnd}` +
        `&order=spend.desc&limit=1000`;

      const rawInsights = await sbGet(insightsPath);

      if (!rawInsights || rawInsights.length === 0) {
        console.log("    데이터 없음. 스킵.");
        continue;
      }

      // ad_id별 그루핑 (diagnose/route.ts 로직 이식)
      const adMap = new Map();
      const sumKeys = ["impressions", "reach", "clicks", "spend", "purchases", "purchase_value"];
      const rateKeys = [
        "video_p3s_rate", "thruplay_rate", "retention_rate",
        "reactions_per_10k", "comments_per_10k", "shares_per_10k",
        "saves_per_10k", "engagement_per_10k",
        "click_to_checkout_rate", "click_to_purchase_rate",
        "checkout_to_purchase_rate", "reach_to_purchase_rate",
      ];

      for (const row of rawInsights) {
        const adId = row.ad_id;
        if (!adId) continue;
        const existing = adMap.get(adId);
        if (!existing) {
          adMap.set(adId, { ...row });
        } else {
          for (const k of sumKeys) {
            existing[k] = (existing[k] || 0) + (row[k] || 0);
          }
          for (const k of rateKeys) {
            if (row[k] != null) existing[k] = row[k];
          }
          const totalSpend = existing.spend;
          const totalClicks = existing.clicks;
          const totalImpressions = existing.impressions;
          const totalRevenue = existing.purchase_value;
          existing.ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
          existing.roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
          const totalPurchases = existing.purchases;
          existing.reach_to_purchase_rate =
            totalImpressions > 0 ? (totalPurchases / totalImpressions) * 100 : 0;
        }
      }

      // spend 상위 10개 광고 추출 (캐시 커버리지 향상)
      const topAds = Array.from(adMap.values())
        .sort((a, b) => (b.spend || 0) - (a.spend || 0))
        .slice(0, 10);

      // 기존 진단 캐시 삭제
      if (!DRY_RUN) {
        await sbDelete(
          "ad_diagnosis_cache",
          `account_id=eq.${encodeURIComponent(accountId)}`
        );
      }

      // 각 광고 진단 후 저장
      const diagRows = [];
      for (const ad of topAds) {
        const adCreativeType = ((ad.creative_type ?? "VIDEO")).toUpperCase();
        const diagnosis = diagnoseAd(ad, gcpBenchmarks, adCreativeType);

        // camelCase → snake_case 변환 (클라이언트 기대 형식)
          const partsJson = diagnosis.parts.map((p) => ({
            part_num: p.partNum,
            part_name: p.partName,
            verdict: p.verdict,
            metrics: p.metrics
              .filter((m) => m.verdict !== "UNKNOWN")
              .map((m) => ({
                name: m.metricName,
                key: labelToKeyMap.get(m.metricName) ?? null,
                my_value: m.myValue,
                pct_of_benchmark:
                  m.myValue != null && m.aboveAvg != null && m.aboveAvg > 0
                    ? Math.round((m.myValue / m.aboveAvg) * 100)
                    : null,
                abs_benchmark: m.aboveAvg ?? null,
                verdict: m.verdict,
              })),
          }));

          diagRows.push({
          account_id: accountId,
          ad_id: diagnosis.adId,
          ad_name: diagnosis.adName,
          creative_type: adCreativeType,
          overall_verdict: diagnosis.overallVerdict,
          one_liner: diagnosis.oneLineDiagnosis,
          parts_json: partsJson,
          spend: ad.spend ?? 0,
          computed_at: computedAt,
        });
      }

      await sbPost("ad_diagnosis_cache", diagRows, null);

      console.log(`    top ${topAds.length}개 진단 완료 (총 ${adMap.size}개 광고)`);
      okCount += topAds.length;
    } catch (e) {
      console.error(`    에러: ${e.message}`);
      errCount++;
    }
  }

  console.log(`\n  완료: 성공=${okCount}건, 에러=${errCount}건`);
}

// ━━━ 메인 ━━━
async function main() {
  const startTime = Date.now();
  console.log("═══════════════════════════════════════");
  console.log("  사전계산 스크립트 — Phase 1");
  console.log("═══════════════════════════════════════");
  console.log(`  시작: ${new Date().toISOString()}`);
  if (DRY_RUN) console.log("  [dry-run 모드 — DB 저장 없음]");
  if (ONLY) console.log(`  [--only ${ONLY}]`);
  if (FILTER_ACCOUNT_ID) console.log(`  [--account-id ${FILTER_ACCOUNT_ID}]`);

  try {
    if (!ONLY || ONLY === "t3") {
      await computeT3Scores();
    }

    if (!ONLY || ONLY === "student") {
      await computeStudentPerformance();
    }

    if (!ONLY || ONLY === "diagnosis") {
      await computeAdDiagnosis();
    }
  } catch (e) {
    console.error("\n[FATAL] 예상치 못한 에러:", e.message);
    process.exit(1);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n═══════════════════════════════════════");
  console.log(`  완료: ${new Date().toISOString()} (${elapsed}s)`);
  console.log("═══════════════════════════════════════");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
