"use server";

import { createServiceClient } from "@/lib/supabase/server";

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
  cohortFilter?: string
): Promise<StudentPerformanceResult> {
  const supabase = createServiceClient();

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
    }));
    return {
      rows,
      summary: { totalStudents: students.length, totalSpend: 0, avgRoas: 0, totalRevenue: 0 },
      cohorts: cohorts ?? [],
    };
  }

  // 4. daily_ad_insights 최근 30일 집계
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const accountIds = adAccounts.map((a) => a.account_id);
  const { data: insights } = await supabase
    .from("daily_ad_insights")
    .select("account_id, spend, purchase_value, roas, purchases")
    .in("account_id", accountIds)
    .gte("date", thirtyDaysAgo);

  // 5. 계정 → 학생 매핑
  const accountToUser = new Map<string, string>();
  for (const a of adAccounts) {
    if (a.user_id) accountToUser.set(a.account_id, a.user_id);
  }

  // 6. 학생별 집계
  const userAgg = new Map<
    string,
    { spend: number; revenue: number; purchases: number; days: number; roasSum: number }
  >();

  for (const row of insights ?? []) {
    const userId = accountToUser.get(row.account_id);
    if (!userId) continue;
    const curr = userAgg.get(userId) ?? { spend: 0, revenue: 0, purchases: 0, days: 0, roasSum: 0 };
    curr.spend += row.spend ?? 0;
    curr.revenue += row.purchase_value ?? 0;
    curr.purchases += row.purchases ?? 0;
    curr.days += 1;
    curr.roasSum += row.roas ?? 0;
    userAgg.set(userId, curr);
  }

  const rows: StudentPerformanceRow[] = students.map((s) => {
    const agg = userAgg.get(s.id);
    return {
      userId: s.id,
      name: s.name,
      email: s.email,
      cohort: s.cohort,
      spend: agg?.spend ?? 0,
      revenue: agg?.revenue ?? 0,
      roas: agg && agg.days > 0 ? agg.roasSum / agg.days : 0,
      purchases: agg?.purchases ?? 0,
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
