/**
 * 광고 진단 사전계산 — collect-daily 크론 완료 후 실행
 * diagnose route와 동일한 로직으로 계정별 상위 5개 광고 진단 → ad_diagnosis_cache에 UPSERT
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { diagnoseAd, Verdict, PART_METRICS, type GCPBenchmarks } from "@/lib/diagnosis";

const TOP_ADS_LIMIT = 10;

// diagnosis label → DB column key 역매핑
const labelToKeyMap = new Map<string, string>();
for (const partConfig of Object.values(PART_METRICS)) {
  for (const metricDef of partConfig.metrics) {
    labelToKeyMap.set(metricDef.label, metricDef.key);
  }
}

/** diagnose route와 동일한 벤치마크 조회 */
async function fetchGCPBenchmarks(supabase: SupabaseClient): Promise<GCPBenchmarks> {
  const gcpBenchmarks: GCPBenchmarks = {};

  const { data: latestBench } = await supabase
    .from("benchmarks")
    .select("calculated_at")
    .order("calculated_at", { ascending: false })
    .limit(1);

  if (!latestBench || latestBench.length === 0) return gcpBenchmarks;
  const latestAt = (latestBench[0].calculated_at as string).slice(0, 10);

  const { data: benchRows } = await supabase
    .from("benchmarks")
    .select("*")
    .eq("ranking_group", "ABOVE_AVERAGE")
    .gte("calculated_at", latestAt);

  if (!benchRows) return gcpBenchmarks;

  for (const row of benchRows as unknown as Record<string, unknown>[]) {
    const ct = (row.creative_type as string) ?? "VIDEO";
    const rt = (row.ranking_type as string) ?? "engagement";

    if (!gcpBenchmarks[ct]) gcpBenchmarks[ct] = {};

    gcpBenchmarks[ct][rt as "engagement" | "conversion"] = {
      above_avg: {
        video_p3s_rate: row.video_p3s_rate as number | null,
        thruplay_rate: row.thruplay_rate as number | null,
        retention_rate: row.retention_rate as number | null,
        reactions_per_10k: row.reactions_per_10k as number | null,
        comments_per_10k: row.comments_per_10k as number | null,
        shares_per_10k: row.shares_per_10k as number | null,
        saves_per_10k: row.saves_per_10k as number | null,
        engagement_per_10k: row.engagement_per_10k as number | null,
        ctr: row.ctr as number | null,
        click_to_checkout_rate: row.click_to_checkout_rate as number | null,
        click_to_purchase_rate: row.click_to_purchase_rate as number | null,
        checkout_to_purchase_rate: row.checkout_to_purchase_rate as number | null,
        reach_to_purchase_rate: row.reach_to_purchase_rate as number | null,
        roas: row.roas as number | null,
      },
      sample_count: row.sample_count as number | undefined,
    };
  }

  return gcpBenchmarks;
}

export async function precomputeDiagnosis(
  supabase: SupabaseClient,
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  try {
    // 1. 벤치마크 한 번만 로드
    const gcpBenchmarks = await fetchGCPBenchmarks(supabase);

    // 2. 활성 계정 목록
    const { data: accounts } = await supabase
      .from("ad_accounts")
      .select("account_id")
      .eq("active", true);

    if (!accounts || accounts.length === 0) return { computed, errors };

    // 3. 계정별 진단
    for (const account of accounts) {
      const accountId = account.account_id;

      try {
        // 최근 30일 insights (periodToDateRange와 동일한 로컬 날짜 기준)
        const endDate = new Date();
        endDate.setDate(endDate.getDate() - 1); // 어제까지
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 29); // 30일간
        const periodStart = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}-${String(startDate.getDate()).padStart(2, "0")}`;

        const { data: rawData } = await supabase
          .from("daily_ad_insights")
          .select("*")
          .eq("account_id", accountId)
          .gte("date", periodStart)
          .order("spend", { ascending: false })
          .limit(1000);

        const rawInsights = rawData as unknown as Record<string, unknown>[] | null;
        if (!rawInsights || rawInsights.length === 0) continue;

        // ad_id별 그루핑 (diagnose route와 동일)
        const adMap = new Map<string, Record<string, unknown>>();
        const sumKeys = ["impressions", "reach", "clicks", "spend", "purchases", "purchase_value"];
        const rateKeys = [
          "video_p3s_rate", "thruplay_rate", "retention_rate",
          "reactions_per_10k", "comments_per_10k", "shares_per_10k",
          "saves_per_10k", "engagement_per_10k",
          "click_to_checkout_rate", "click_to_purchase_rate",
          "checkout_to_purchase_rate", "reach_to_purchase_rate",
        ];

        for (const row of rawInsights) {
          const adId = row.ad_id as string;
          if (!adId) continue;
          const existing = adMap.get(adId);
          if (!existing) {
            adMap.set(adId, { ...row });
          } else {
            for (const k of sumKeys) {
              existing[k] = ((existing[k] as number) || 0) + ((row[k] as number) || 0);
            }
            for (const k of rateKeys) {
              if (row[k] != null) existing[k] = row[k];
            }
            const totalSpend = existing.spend as number;
            const totalClicks = existing.clicks as number;
            const totalImpressions = existing.impressions as number;
            const totalRevenue = existing.purchase_value as number;
            existing.ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
            existing.roas = totalSpend > 0 ? totalRevenue / totalSpend : 0;
            const totalPurchases = existing.purchases as number;
            existing.reach_to_purchase_rate = totalImpressions > 0 ? (totalPurchases / totalImpressions) * 100 : 0;
          }
        }

        const topAds = Array.from(adMap.values())
          .sort((a, b) => ((b.spend as number) || 0) - ((a.spend as number) || 0))
          .slice(0, TOP_ADS_LIMIT);

        // 진단 + UPSERT
        for (const ad of topAds) {
          const adCreativeType = ((ad.creative_type as string) ?? "VIDEO").toUpperCase();
          const diagnosis = diagnoseAd(ad, gcpBenchmarks, adCreativeType);

          const partsJson = diagnosis.parts.map((p) => ({
            part_num: p.partNum,
            part_name: p.partName,
            verdict: p.verdict,
            metrics: p.metrics
              .filter((m) => m.verdict !== Verdict.UNKNOWN)
              .map((m) => ({
                name: m.metricName,
                key: labelToKeyMap.get(m.metricName) ?? null,
                my_value: m.myValue,
                pct_of_benchmark: m.myValue != null && m.aboveAvg != null && m.aboveAvg > 0
                  ? Math.round((m.myValue / m.aboveAvg) * 100)
                  : null,
                abs_benchmark: m.aboveAvg ?? null,
                verdict: m.verdict,
              })),
          }));

          const { error: upsertErr } = await supabase
            .from("ad_diagnosis_cache" as never)
            .upsert(
              {
                account_id: accountId,
                ad_id: diagnosis.adId,
                ad_name: diagnosis.adName,
                creative_type: adCreativeType,
                overall_verdict: diagnosis.overallVerdict,
                one_liner: diagnosis.oneLineDiagnosis,
                parts_json: partsJson,
                spend: (ad.spend as number) ?? 0,
                computed_at: new Date().toISOString(),
              } as never,
              { onConflict: "account_id,ad_id" } as never,
            );

          if (upsertErr) {
            errors.push(`diag upsert [${accountId}/${diagnosis.adId}]: ${upsertErr.message}`);
          } else {
            computed++;
          }
        }
      } catch (e) {
        errors.push(`diag [${accountId}]: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  } catch (e) {
    errors.push(`diag fatal: ${e instanceof Error ? e.message : String(e)}`);
  }

  return { computed, errors };
}
