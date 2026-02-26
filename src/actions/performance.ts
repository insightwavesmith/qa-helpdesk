"use server";

import { createServiceClient } from "@/lib/supabase/server";
import {
  ALL_METRIC_DEFS,
  type BenchEntry,
  computeMetricValues,
  getDominantCreativeType,
  calculateT3Score,
} from "@/lib/protractor/t3-engine";

// ─── 타입 ─────────────────────────────────────────────
export interface StudentPerformanceRow {
  userId: string;
  name: string;
  email: string;
  cohort: string | null;
  spend: number;
  revenue: number;
  roas: number;
  purchases: number;
  t3Score: number | null;
  t3Grade: string | null;
}

export interface PerformanceSummary {
  totalStudents: number;
  totalSpend: number;
  avgRoas: number;
  totalRevenue: number;
}

export interface StudentPerformanceResult {
  rows: StudentPerformanceRow[];
  summary: PerformanceSummary;
  cohorts: { id: string; name: string }[];
}

export interface OwnerAdSummaryRow {
  id: string;
  accountId: string;
  accountName: string | null;
  ownerType: string;
  totalSpend: number;
  totalRevenue: number;
  avgRoas: number;
  totalPurchases: number;
  periodStart: string;
  periodEnd: string;
}

export interface OwnerSummaryResult {
  rows: OwnerAdSummaryRow[];
  totalAccounts: number;
  totalSpend: number;
  avgRoas: number;
}

// ─── T2: 수강생 성과 데이터 ──────────────────────────────
export async function getStudentPerformance(
  cohortFilter?: string,
  period: number = 30,
): Promise<StudentPerformanceResult> {
  const supabase = createServiceClient();
  const validPeriod = [7, 14, 30].includes(period) ? period : 30;

  // 1. 기수 목록
  const { data: cohorts } = await supabase
    .from("cohorts")
    .select("id, name")
    .order("name", { ascending: false });

  // 2. student 프로필 + ad_accounts join
  let profileQuery = supabase
    .from("profiles")
    .select("id, name, email, cohort")
    .eq("role", "student");

  if (cohortFilter) {
    profileQuery = profileQuery.eq("cohort", cohortFilter);
  }

  const { data: students } = await profileQuery;

  if (!students || students.length === 0) {
    return {
      rows: [],
      summary: { totalStudents: 0, totalSpend: 0, avgRoas: 0, totalRevenue: 0 },
      cohorts: cohorts ?? [],
    };
  }

  // 3. 학생별 ad_accounts 조회
  const studentIds = students.map((s) => s.id);
  const { data: adAccounts } = await supabase
    .from("ad_accounts")
    .select("account_id, user_id")
    .in("user_id", studentIds)
    .eq("active", true);

  if (!adAccounts || adAccounts.length === 0) {
    const rows: StudentPerformanceRow[] = students.map((s) => ({
      userId: s.id,
      name: s.name,
      email: s.email,
      cohort: s.cohort,
      spend: 0,
      revenue: 0,
      roas: 0,
      purchases: 0,
      t3Score: null,
      t3Grade: null,
    }));
    return {
      rows,
      summary: { totalStudents: students.length, totalSpend: 0, avgRoas: 0, totalRevenue: 0 },
      cohorts: cohorts ?? [],
    };
  }

  // 4. daily_ad_insights — 기간 동적 계산
  const periodStart = new Date(Date.now() - validPeriod * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const accountIds = adAccounts.map((a) => a.account_id);
  // T4: 전체 컬럼 조회 (T3 계산에 필요)
  const { data: insights } = await supabase
    .from("daily_ad_insights")
    .select("*")
    .in("account_id", accountIds)
    .gte("date", periodStart);

  // 5. 계정 → 학생 매핑
  const accountToUser = new Map<string, string>();
  for (const a of adAccounts) {
    if (a.user_id) accountToUser.set(a.account_id, a.user_id);
  }

  // 6. 학생별 집계 (성과 + T3용 raw rows)
  const userAgg = new Map<
    string,
    { spend: number; revenue: number; purchases: number; days: number; roasSum: number }
  >();
  const userRawRows = new Map<string, Record<string, unknown>[]>();

  for (const row of (insights ?? []) as Record<string, unknown>[]) {
    const accountId = row.account_id as string;
    const userId = accountToUser.get(accountId);
    if (!userId) continue;

    // 성과 집계
    const curr = userAgg.get(userId) ?? { spend: 0, revenue: 0, purchases: 0, days: 0, roasSum: 0 };
    curr.spend += Number(row.spend) || 0;
    curr.revenue += Number(row.purchase_value) || 0;
    curr.purchases += Number(row.purchases) || 0;
    curr.days += 1;
    curr.roasSum += Number(row.roas) || 0;
    userAgg.set(userId, curr);

    // T3용 raw rows 수집
    const rawList = userRawRows.get(userId) ?? [];
    rawList.push(row);
    userRawRows.set(userId, rawList);
  }

  // T4: 벤치마크 한 번만 조회
  const benchMap = await fetchBenchmarksForT3(supabase);

  const rows: StudentPerformanceRow[] = students.map((s) => {
    const agg = userAgg.get(s.id);
    const rawRows = userRawRows.get(s.id);

    // T4: T3 점수 계산
    let t3Score: number | null = null;
    let t3Grade: string | null = null;
    if (rawRows && rawRows.length > 0) {
      const metricValues = computeMetricValues(rawRows);
      const dominantCT = getDominantCreativeType(rawRows);
      // creative_type별 벤치마크 매핑
      const userBench = resolveBenchmarks(benchMap, dominantCT);
      const t3Result = calculateT3Score(metricValues, userBench);
      t3Score = t3Result.score;
      t3Grade = t3Result.grade.grade;
    }

    return {
      userId: s.id,
      name: s.name,
      email: s.email,
      cohort: s.cohort,
      spend: agg?.spend ?? 0,
      revenue: agg?.revenue ?? 0,
      roas: agg && agg.days > 0 ? agg.roasSum / agg.days : 0,
      purchases: agg?.purchases ?? 0,
      t3Score,
      t3Grade,
    };
  });

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const roasValues = rows.filter((r) => r.roas > 0);
  const avgRoas =
    roasValues.length > 0
      ? roasValues.reduce((s, r) => s + r.roas, 0) / roasValues.length
      : 0;

  return {
    rows,
    summary: {
      totalStudents: students.length,
      totalSpend,
      avgRoas,
      totalRevenue,
    },
    cohorts: cohorts ?? [],
  };
}

// T4: 벤치마크 조회 (한 번만) — creative_type별로 분류
type BenchByType = Map<string, Record<string, BenchEntry>>;

async function fetchBenchmarksForT3(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
): Promise<BenchByType> {
  const byType: BenchByType = new Map();

  const { data: latestBench } = await supabase
    .from("benchmarks")
    .select("date")
    .order("calculated_at", { ascending: false })
    .limit(1);

  if (!latestBench || latestBench.length === 0) return byType;

  const { data: benchRows } = await supabase
    .from("benchmarks")
    .select("metric_name, p25, p50, p75, p90, creative_type")
    .eq("date", latestBench[0].date);

  if (!benchRows) return byType;

  for (const row of benchRows as Record<string, unknown>[]) {
    const ct = ((row.creative_type as string) ?? "ALL").toUpperCase();
    if (!byType.has(ct)) byType.set(ct, {});
    byType.get(ct)![row.metric_name as string] = {
      p25: row.p25 as number | null,
      p50: row.p50 as number | null,
      p75: row.p75 as number | null,
      p90: row.p90 as number | null,
    };
  }

  return byType;
}

function resolveBenchmarks(
  byType: BenchByType,
  dominantCT: string,
): Record<string, BenchEntry> {
  const result: Record<string, BenchEntry> = {};
  const primary = byType.get(dominantCT);
  const fallback = byType.get("ALL");

  for (const def of ALL_METRIC_DEFS) {
    const entry = primary?.[def.key] ?? fallback?.[def.key];
    if (entry) result[def.key] = entry;
  }

  return result;
}

// ─── T3: 관리자 광고계정 성과 ──────────────────────────────
export async function getOwnerAdSummaries(): Promise<OwnerSummaryResult> {
  const supabase = createServiceClient();

  const { data } = await supabase
    .from("owner_ad_summaries")
    .select("*")
    .order("period_end", { ascending: false });

  if (!data || data.length === 0) {
    return { rows: [], totalAccounts: 0, totalSpend: 0, avgRoas: 0 };
  }

  // 최신 period 기준으로만 보여주기
  const latestEnd = data[0].period_end;
  const latestRows = data.filter((d) => d.period_end === latestEnd);

  const rows: OwnerAdSummaryRow[] = latestRows.map((d) => ({
    id: d.id,
    accountId: d.account_id,
    accountName: d.account_name,
    ownerType: d.owner_type,
    totalSpend: Number(d.total_spend) || 0,
    totalRevenue: Number(d.total_revenue) || 0,
    avgRoas: Number(d.avg_roas) || 0,
    totalPurchases: d.total_purchases ?? 0,
    periodStart: d.period_start,
    periodEnd: d.period_end,
  }));

  const uniqueAccounts = new Set(rows.map((r) => r.accountId));
  const totalSpend = rows.reduce((s, r) => s + r.totalSpend, 0);
  const roasValues = rows.filter((r) => r.avgRoas > 0);
  const avgRoas =
    roasValues.length > 0
      ? roasValues.reduce((s, r) => s + r.avgRoas, 0) / roasValues.length
      : 0;

  return {
    rows,
    totalAccounts: uniqueAccounts.size,
    totalSpend,
    avgRoas,
  };
}
