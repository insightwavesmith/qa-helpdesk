/**
 * 수강생 성과 사전계산 — collect-daily 크론 완료 후 실행
 * 수강생별 × 기간별(7/14/30일) 광고 성과를 집계하여 student_performance_daily에 UPSERT
 *
 * precompute-scores.mjs Phase 2 로직을 TypeScript로 포팅
 */
import type { DbClient } from "@/lib/db";
import {
  computeMetricValues,
  calculateT3Score,
} from "@/lib/protractor/t3-engine";

const PERIODS = [7, 14, 30];

/** 기간별 시작일 계산 (어제 기준) */
function getPeriodStart(periodDays: number): string {
  const periodEnd = new Date();
  periodEnd.setDate(periodEnd.getDate() - 1); // 어제
  const periodStartDate = new Date(periodEnd);
  periodStartDate.setDate(periodStartDate.getDate() - (periodDays - 1));
  const y = periodStartDate.getFullYear();
  const m = String(periodStartDate.getMonth() + 1).padStart(2, "0");
  const d = String(periodStartDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "ALL" 타입 벤치마크 맵 조회 */
async function fetchBenchmarkMap(
  svc: DbClient,
): Promise<Record<string, number>> {
  const benchMap: Record<string, number> = {};
  try {
    const { data: rows } = await svc
      .from("benchmarks")
      .select("*")
      .in("creative_type", ["ALL"])
      .in("ranking_group", ["ABOVE_AVERAGE", "above_avg"])
      .order("calculated_at", { ascending: false })
      .limit(10);

    if (!rows || rows.length === 0) return benchMap;

    const typedRows = Array.isArray(rows) ? rows as unknown as Record<string, unknown>[] : [];
    if (typedRows.length === 0) return benchMap;
    const latestAt = typedRows[0]?.calculated_at as string | undefined;
    const latestDate = latestAt?.slice(0, 10);
    const latestRows = latestDate
      ? typedRows.filter((r) => (r.calculated_at as string)?.slice(0, 10) === latestDate)
      : typedRows;

    for (const row of latestRows) {
      for (const [k, v] of Object.entries(row)) {
        if (v != null && typeof v === "number" && benchMap[k] == null) {
          benchMap[k] = v;
        }
      }
    }
  } catch {
    // 벤치마크 없어도 계속 진행
  }
  return benchMap;
}

interface StudentRow {
  id: string;
  name: string | null;
  email: string | null;
  cohort: string | null;
}

interface AdAccountRow {
  account_id: string;
  user_id: string;
  mixpanel_project_id: string | null;
}

interface InsightRow {
  account_id: string;
  spend: number | null;
  purchase_value: number | null;
  purchases: number | null;
  impressions: number | null;
  clicks: number | null;
  reach: number | null;
  video_p3s_rate: number | null;
  thruplay_rate: number | null;
  retention_rate: number | null;
  reactions_per_10k: number | null;
  comments_per_10k: number | null;
  shares_per_10k: number | null;
  saves_per_10k: number | null;
  creative_type: string | null;
  [key: string]: unknown;
}

interface MixpanelRow {
  project_id: string;
  total_revenue: number | null;
  purchase_count: number | null;
}

interface UserAgg {
  spend: number;
  revenue: number;
  purchases: number;
  days: number;
}

interface MixpanelAgg {
  revenue: number;
  purchases: number;
}

export async function precomputeStudentPerformance(
  svc: DbClient,
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  // 1. student 역할 프로필 조회
  const { data: studentsData, error: studentsErr } = await svc
    .from("profiles")
    .select("id,name,email,cohort")
    .eq("role", "student")
    .limit(9999);

  if (studentsErr) {
    errors.push(`profiles 조회 실패: ${studentsErr.message}`);
    return { computed, errors };
  }

  const students = (studentsData ?? []) as StudentRow[];
  if (students.length === 0) {
    return { computed, errors };
  }

  // 2. 학생 ad_accounts 조회
  const studentIds = students.map((s) => s.id);
  const { data: adAccountsData } = await svc
    .from("ad_accounts")
    .select("account_id,user_id,mixpanel_project_id")
    .in("user_id", studentIds)
    .eq("active", true)
    .limit(9999);

  const adAccounts = (adAccountsData ?? []) as AdAccountRow[];
  if (adAccounts.length === 0) {
    return { computed, errors };
  }

  // 3. 매핑 테이블 구성
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

  // 4. 벤치마크 한 번 조회
  const benchMap = await fetchBenchmarkMap(svc);
  const computedAt = new Date().toISOString();

  // 5. 기간별 처리
  for (const period of PERIODS) {
    try {
      const periodStart = getPeriodStart(period);
      const accountIds = adAccounts.map((a) => a.account_id);

      // daily_ad_insights 조회
      const { data: insightsData } = await svc
        .from("daily_ad_insights")
        .select(
          "account_id,spend,purchase_value,purchases,impressions,clicks,reach," +
          "video_p3s_rate,thruplay_rate,retention_rate," +
          "reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,creative_type",
        )
        .in("account_id", accountIds)
        .gte("date", periodStart)
        .limit(999999);

      const insights = (insightsData ?? []) as unknown as InsightRow[];

      // Mixpanel 데이터 조회
      const projectIds = adAccounts
        .map((a) => a.mixpanel_project_id)
        .filter((id): id is string => id != null);

      const userMixpanel = new Map<string, MixpanelAgg>();
      if (projectIds.length > 0) {
        try {
          const { data: mixpanelData } = await svc
            .from("daily_mixpanel_insights" as never)
            .select("project_id,total_revenue,purchase_count")
            .in("project_id", projectIds)
            .gte("date", periodStart)
            .limit(999999);

          const mixpanelRows = (mixpanelData ?? []) as MixpanelRow[];
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

      // 6. 학생별 집계
      const userAgg = new Map<string, UserAgg>();
      const userRawRows = new Map<string, InsightRow[]>();

      for (const row of insights) {
        const userId = accountToUser.get(row.account_id);
        if (!userId) continue;

        const curr = userAgg.get(userId) ?? {
          spend: 0, revenue: 0, purchases: 0, days: 0,
        };
        curr.spend += Number(row.spend) || 0;
        curr.revenue += Number(row.purchase_value) || 0;
        curr.purchases += Number(row.purchases) || 0;
        curr.days += 1;
        userAgg.set(userId, curr);

        const rawList = userRawRows.get(userId) ?? [];
        rawList.push(row);
        userRawRows.set(userId, rawList);
      }

      // 7. 해당 기간 기존 데이터 삭제 (UPSERT 대신 DELETE + INSERT 패턴)
      await (svc.from("student_performance_daily" as never) as ReturnType<DbClient["from"]>)
        .delete()
        .eq("period", period);

      // 8. 학생별 행 생성
      const rows: Record<string, unknown>[] = [];
      for (const s of students) {
        const agg = userAgg.get(s.id);
        const rawRows = userRawRows.get(s.id);
        const mixpanel = userMixpanel.get(s.id);

        let t3Score: number | null = null;
        let t3Grade: string | null = null;

        if (rawRows && rawRows.length > 0) {
          try {
            const metricValues = computeMetricValues(
              rawRows as unknown as Record<string, unknown>[],
            );
            // roas 보정: revenue / spend
            if (agg && agg.spend > 0) {
              metricValues.roas = agg.revenue / agg.spend;
            }
            const t3Result = calculateT3Score(metricValues, benchMap);
            t3Score = t3Result.score;
            t3Grade = t3Result.grade.grade;
          } catch {
            // T3 계산 실패 시 null 유지
          }
        }

        const roasValue = agg && agg.spend > 0
          ? Math.round((agg.revenue / agg.spend) * 100) / 100
          : 0;

        rows.push({
          student_id: s.id,
          period,
          name: s.name ?? "",
          email: s.email ?? "",
          cohort: s.cohort ?? null,
          spend: agg?.spend ?? 0,
          revenue: agg?.revenue ?? 0,
          roas: roasValue,
          purchases: agg?.purchases ?? 0,
          t3_score: t3Score,
          t3_grade: t3Grade,
          mixpanel_revenue: mixpanel?.revenue ?? 0,
          mixpanel_purchases: mixpanel?.purchases ?? 0,
          computed_at: computedAt,
        });
      }

      // 9. 배치 INSERT (100명씩)
      const BATCH = 100;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error: insertErr } = await (svc.from("student_performance_daily" as never) as ReturnType<DbClient["from"]>)
          .insert(batch as never[]);

        if (insertErr) {
          errors.push(`student INSERT [period=${period}, offset=${i}]: ${insertErr.message}`);
        } else {
          computed += batch.length;
        }
      }
    } catch (e) {
      errors.push(`student [period=${period}d]: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { computed, errors };
}
