/**
 * T3 점수 사전계산 — collect-daily 크론 완료 후 실행
 * 계정별 × 기간별(7/30/90) T3 점수를 계산하여 t3_scores_precomputed에 UPSERT
 */
import type { DbClient } from "@/lib/db";
import {
  ALL_METRIC_DEFS,
  type BenchEntry,
  computeMetricValues,
  calculateT3Score,
  periodToDateRange,
  getDominantCreativeType,
} from "@/lib/protractor/t3-engine";

const PERIODS = [1, 7, 14, 30, 90];

/** total-value route와 동일한 벤치마크 조회 로직 */
async function fetchBenchmarks(
  svc: DbClient,
  dominantCT: string,
): Promise<Record<string, BenchEntry>> {
  const benchMap: Record<string, BenchEntry> = {};
  try {
    // 1회 쿼리: 최신 벤치마크 조회
    const aboveAvgValues = ["ABOVE_AVERAGE", "above_avg"];
    const ctValues = dominantCT !== "ALL" ? [dominantCT, "ALL"] : ["ALL"];

    const { data: rows } = await svc
      .from("benchmarks")
      .select("*")
      .in("creative_type", ctValues)
      .in("ranking_group", aboveAvgValues)
      .order("calculated_at", { ascending: false })
      .limit(20);

    if (!rows || rows.length === 0) return benchMap;

    const typedRows = rows as unknown as Record<string, unknown>[];
    // 최신 calculated_at 기준으로만 사용
    const latestAt = typedRows[0]?.calculated_at as string | undefined;
    const latestDate = latestAt?.slice(0, 10);
    const filteredRows = latestDate
      ? typedRows.filter((r) => (r.calculated_at as string)?.slice(0, 10) === latestDate)
      : typedRows;
    const ctRows = filteredRows.filter((r) => r.creative_type === dominantCT);
    const allRows = filteredRows.filter((r) => r.creative_type === "ALL");

    for (const row of ctRows) {
      for (const def of ALL_METRIC_DEFS) {
        const val = row[def.key];
        if (val != null && typeof val === "number" && benchMap[def.key] == null) {
          benchMap[def.key] = val;
        }
      }
    }
    for (const row of allRows) {
      for (const def of ALL_METRIC_DEFS) {
        const val = row[def.key];
        if (val != null && typeof val === "number" && benchMap[def.key] == null) {
          benchMap[def.key] = val;
        }
      }
    }
  } catch {
    // 벤치마크 없어도 계속 진행
  }
  return benchMap;
}

export async function precomputeT3Scores(
  supabase: DbClient,
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  // 1. 활성 계정 목록
  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("account_id")
    .eq("active", true);

  if (!accounts || accounts.length === 0) return { computed, errors };

  // 2. 계정별 × 기간별 T3 점수 계산
  for (const account of accounts) {
    const accountId = account.account_id;

    for (const period of PERIODS) {
      try {
        const range = periodToDateRange(period);

        // daily_ad_insights 조회 (total-value route와 동일한 컬럼)
        const { data: rawData } = await supabase
          .from("daily_ad_insights")
          .select("spend,impressions,reach,clicks,purchases,purchase_value,date,ad_id,adset_id,initiate_checkout,video_p3s_rate,thruplay_rate,retention_rate,reactions_per_10k,comments_per_10k,shares_per_10k,saves_per_10k,creative_type")
          .eq("account_id", accountId)
          .gte("date", range.start)
          .lte("date", range.end);

        const rows = rawData as unknown as Record<string, unknown>[] | null;
        if (!rows || rows.length === 0) continue;

        // 지표 계산
        const metricValues = computeMetricValues(rows);

        // summary 집계
        let totalSpend = 0, totalImpressions = 0, totalReach = 0;
        let totalClicks = 0, totalPurchases = 0, totalPurchaseValue = 0;
        const uniqueDates = new Set<string>();
        const adIds = new Set<string>();

        for (const row of rows) {
          totalSpend += Number(row.spend) || 0;
          totalImpressions += Number(row.impressions) || 0;
          totalReach += Number(row.reach) || 0;
          totalClicks += Number(row.clicks) || 0;
          totalPurchases += Number(row.purchases) || 0;
          totalPurchaseValue += Number(row.purchase_value) || 0;
          if (row.date) uniqueDates.add(row.date as string);
          if (row.ad_id) adIds.add(row.ad_id as string);
        }

        // 벤치마크 + T3 점수
        const dominantCT = getDominantCreativeType(rows);
        const benchMap = await fetchBenchmarks(supabase, dominantCT);
        const hasBenchmarkData = Object.keys(benchMap).length > 0;
        const t3Result = calculateT3Score(metricValues, benchMap);

        // pctOfBenchmark 포함 metrics
        const safeMetrics = t3Result.metrics.map(({ aboveAvg, ...rest }) => ({
          ...rest,
          pctOfBenchmark: rest.value != null && aboveAvg != null && aboveAvg > 0
            ? Math.round((rest.value / aboveAvg) * 100)
            : null,
        }));

        const safeDiagnostics = t3Result.diagnostics
          ? Object.fromEntries(
              Object.entries(t3Result.diagnostics).map(([k, part]) => [
                k,
                {
                  ...part,
                  metrics: part.metrics.map(({ aboveAvg, ...rest }) => ({
                    ...rest,
                    pctOfBenchmark: rest.value != null && aboveAvg != null && aboveAvg > 0
                      ? Math.round((rest.value / aboveAvg) * 100)
                      : null,
                  })),
                },
              ])
            )
          : null;

        const summary = {
          spend: Math.round(totalSpend),
          impressions: totalImpressions,
          reach: totalReach,
          clicks: totalClicks,
          purchases: totalPurchases,
          purchaseValue: Math.round(totalPurchaseValue),
          roas: totalSpend > 0 ? Math.round((totalPurchaseValue / totalSpend) * 100) / 100 : 0,
          adCount: adIds.size,
        };

        // UPSERT
        const { error: upsertErr } = await supabase
          .from("t3_scores_precomputed" as never)
          .upsert(
            {
              account_id: accountId,
              period,
              creative_type: dominantCT,
              score: t3Result.score,
              grade: t3Result.grade.grade,
              grade_label: t3Result.grade.label,
              metrics_json: safeMetrics,
              diagnostics_json: safeDiagnostics,
              summary_json: summary,
              data_available_days: uniqueDates.size,
              has_benchmark_data: hasBenchmarkData,
              computed_at: new Date().toISOString(),
            } as never,
            { onConflict: "account_id,period,creative_type" } as never,
          );

        if (upsertErr) {
          errors.push(`T3 upsert [${accountId}/${period}]: ${upsertErr.message}`);
        } else {
          computed++;
        }
      } catch (e) {
        errors.push(`T3 [${accountId}/${period}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  return { computed, errors };
}
