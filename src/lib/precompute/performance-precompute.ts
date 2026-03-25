/**
 * 수강생 성과 사전계산 — collect-daily 크론 완료 후 실행
 * performance.ts의 getStudentPerformance()와 동일한 계산을 수행하여 student_performance_daily에 UPSERT
 */
import type { DbClient } from "@/lib/db";
import {
  ALL_METRIC_DEFS,
  type BenchEntry,
  computeMetricValues,
  calculateT3Score,
} from "@/lib/protractor/t3-engine";

const DEFAULT_PERIOD = 30;

/** performance.ts의 fetchBenchmarksForT3과 동일한 로직 */
async function fetchBenchmarksForT3(
  supabase: DbClient,
): Promise<Map<string, Record<string, BenchEntry>>> {
  const byType = new Map<string, Record<string, BenchEntry>>();

  const { data: latestBench } = await supabase
    .from("benchmarks")
    .select("calculated_at")
    .order("calculated_at", { ascending: false })
    .limit(1);

  if (!latestBench || latestBench.length === 0) return byType;
  const latestAt = (latestBench[0].calculated_at as string).slice(0, 10);

  const { data: benchRows } = await supabase
    .from("benchmarks")
    .select("*")
    .eq("ranking_group", "ABOVE_AVERAGE")
    .gte("calculated_at", latestAt);

  if (!benchRows) return byType;

  for (const row of benchRows as unknown as Record<string, unknown>[]) {
    const ct = ((row.creative_type as string) ?? "ALL").toUpperCase();
    if (!byType.has(ct)) byType.set(ct, {});
    const ctMap = byType.get(ct)!;
    for (const def of ALL_METRIC_DEFS) {
      const val = row[def.key];
      if (val != null && typeof val === "number" && ctMap[def.key] == null) {
        ctMap[def.key] = val;
      }
    }
  }

  return byType;
}

function resolveBenchmarks(
  byType: Map<string, Record<string, BenchEntry>>,
  dominantCT: string,
): Record<string, BenchEntry> {
  const result: Record<string, BenchEntry> = {};
  const primary = byType.get(dominantCT);
  const fallback = byType.get("ALL");

  for (const def of ALL_METRIC_DEFS) {
    const entry = primary?.[def.key] ?? fallback?.[def.key];
    if (entry != null) result[def.key] = entry;
  }
  return result;
}

export async function precomputeStudentPerformance(
  supabase: DbClient,
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  try {
    // 1. student 프로필
    const { data: students } = await supabase
      .from("profiles")
      .select("id, name, email, cohort")
      .eq("role", "student");

    if (!students || students.length === 0) return { computed, errors };

    // 2. ad_accounts (active)
    const studentIds = students.map((s: any) => s.id); // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: adAccounts } = await supabase
      .from("ad_accounts")
      .select("account_id, user_id, mixpanel_project_id")
      .in("user_id", studentIds)
      .eq("active", true);

    if (!adAccounts || adAccounts.length === 0) {
      // 광고 계정 없는 학생들도 빈 데이터로 UPSERT
      for (const s of students) {
        const { error } = await supabase
          .from("student_performance_daily" as never)
          .upsert(
            {
              student_id: s.id,
              period: DEFAULT_PERIOD,
              cohort: s.cohort,
              name: s.name,
              email: s.email,
              spend: 0, revenue: 0, roas: 0, purchases: 0,
              t3_score: null, t3_grade: null,
              mixpanel_revenue: 0, mixpanel_purchases: 0,
              computed_at: new Date().toISOString(),
            } as never,
            { onConflict: "student_id,period" } as never,
          );
        if (error) errors.push(`perf upsert [${s.id}]: ${error.message}`);
        else computed++;
      }
      return { computed, errors };
    }

    // 3. daily_ad_insights (periodToDateRange와 동일한 로컬 날짜 기준)
    const endDate = new Date();
    endDate.setDate(endDate.getDate() - 1); // 어제까지
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - (DEFAULT_PERIOD - 1));
    const periodStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

    const accountIds = adAccounts.map((a: any) => a.account_id); // eslint-disable-line @typescript-eslint/no-explicit-any
    const { data: insights } = await supabase
      .from("daily_ad_insights")
      .select("*")
      .in("account_id", accountIds)
      .gte("date", periodStart);

    // 4. 매핑
    const accountToUser = new Map<string, string>();
    const projectIdToUser = new Map<string, string>();
    for (const a of adAccounts) {
      if (a.user_id) {
        accountToUser.set(a.account_id, a.user_id);
        if (a.mixpanel_project_id) {
          projectIdToUser.set(a.mixpanel_project_id, a.user_id);
        }
      }
    }

    // 5. 학생별 집계
    const userAgg = new Map<string, { spend: number; revenue: number; purchases: number; days: number; roasSum: number }>();
    const userRawRows = new Map<string, Record<string, unknown>[]>();

    for (const row of (insights ?? []) as unknown as Record<string, unknown>[]) {
      const accountId = row.account_id as string;
      const userId = accountToUser.get(accountId);
      if (!userId) continue;

      const curr = userAgg.get(userId) ?? { spend: 0, revenue: 0, purchases: 0, days: 0, roasSum: 0 };
      curr.spend += Number(row.spend) || 0;
      curr.revenue += Number(row.purchase_value) || 0;
      curr.purchases += Number(row.purchases) || 0;
      curr.days += 1;
      curr.roasSum += Number(row.roas) || 0;
      userAgg.set(userId, curr);

      const rawList = userRawRows.get(userId) ?? [];
      rawList.push(row);
      userRawRows.set(userId, rawList);
    }

    // 6. 벤치마크
    const benchMap = await fetchBenchmarksForT3(supabase);

    // 7. Mixpanel
    const projectIds = adAccounts
      .map((a: any) => a.mixpanel_project_id) // eslint-disable-line @typescript-eslint/no-explicit-any
      .filter((id: any): id is string => id != null); // eslint-disable-line @typescript-eslint/no-explicit-any

    const userMixpanel = new Map<string, { revenue: number; purchases: number }>();
    if (projectIds.length > 0) {
      const { data: mixpanelRows } = await supabase
        .from("daily_mixpanel_insights" as never)
        .select("project_id, total_revenue, purchase_count")
        .in("project_id" as never, projectIds)
        .gte("date" as never, periodStart);

      for (const row of (mixpanelRows ?? []) as unknown as { project_id: string; total_revenue: number | null; purchase_count: number | null }[]) {
        const userId = projectIdToUser.get(row.project_id);
        if (!userId) continue;
        const curr = userMixpanel.get(userId) ?? { revenue: 0, purchases: 0 };
        curr.revenue += Number(row.total_revenue) || 0;
        curr.purchases += Number(row.purchase_count) || 0;
        userMixpanel.set(userId, curr);
      }
    }

    // 8. UPSERT per student
    for (const s of students) {
      try {
        const agg = userAgg.get(s.id);
        const rawRows = userRawRows.get(s.id);

        let t3Score: number | null = null;
        let t3Grade: string | null = null;
        if (rawRows && rawRows.length > 0) {
          const metricValues = computeMetricValues(rawRows);
          const userBench = resolveBenchmarks(benchMap, "ALL");
          const t3Result = calculateT3Score(metricValues, userBench);
          t3Score = t3Result.score;
          t3Grade = t3Result.grade.grade;
        }

        const mixpanel = userMixpanel.get(s.id);

        const { error } = await supabase
          .from("student_performance_daily" as never)
          .upsert(
            {
              student_id: s.id,
              period: DEFAULT_PERIOD,
              cohort: s.cohort,
              name: s.name,
              email: s.email,
              spend: agg?.spend ?? 0,
              revenue: agg?.revenue ?? 0,
              roas: agg && agg.days > 0 ? agg.roasSum / agg.days : 0,
              purchases: agg?.purchases ?? 0,
              t3_score: t3Score,
              t3_grade: t3Grade,
              mixpanel_revenue: mixpanel?.revenue ?? 0,
              mixpanel_purchases: mixpanel?.purchases ?? 0,
              computed_at: new Date().toISOString(),
            } as never,
            { onConflict: "student_id,period" } as never,
          );

        if (error) {
          errors.push(`perf upsert [${s.id}]: ${error.message}`);
        } else {
          computed++;
        }
      } catch (e) {
        errors.push(`perf [${s.id}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`perf fatal: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { computed, errors };
}
