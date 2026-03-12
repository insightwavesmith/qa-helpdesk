/**
 * Overlap 사전계산 — collect-daily 크론 완료 후 실행
 * 모든 활성 계정 × 주요 기간의 타겟중복을 미리 계산하여 daily_overlap_insights에 저장
 * 사용자 요청 시 DB 캐시 즉시 반환 (100ms 이내)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchActiveAdsets,
  fetchCombinedReach,
  fetchPerAdsetReach,
  makePairKey,
  type OverlapPair,
} from "@/lib/protractor/overlap-utils";
import { periodToDateRange } from "@/lib/protractor/t3-engine";

/** 사전계산 대상 기간 (일) */
const PERIODS = [1, 7, 30, 90];
const CONCURRENCY = 5;
const PAIR_TIMEOUT_MS = 50_000;

export async function precomputeOverlap(
  supabase: SupabaseClient,
): Promise<{ computed: number; errors: string[] }> {
  const errors: string[] = [];
  let computed = 0;

  // 1. 활성 계정 목록
  const { data: accounts } = await supabase
    .from("ad_accounts")
    .select("account_id")
    .eq("active", true);

  if (!accounts || accounts.length === 0) return { computed, errors };

  // 2. 계정별 × 기간별 overlap 사전계산
  for (const account of accounts) {
    const accountId = account.account_id;

    for (const period of PERIODS) {
      try {
        const range = periodToDateRange(period);

        // 이미 최신 데이터가 있으면 스킵 (24시간 이내)
        const { data: existing } = await supabase
          .from("daily_overlap_insights" as never)
          .select("collected_at")
          .eq("account_id", accountId)
          .eq("date", range.end)
          .limit(1);

        if (existing && (existing as { collected_at: string }[]).length > 0) {
          const cachedAt = new Date((existing as { collected_at: string }[])[0].collected_at);
          const hoursSince = (Date.now() - cachedAt.getTime()) / (1000 * 60 * 60);
          if (hoursSince < 24) {
            continue; // 스킵
          }
        }

        // 활성 광고세트 조회
        const adsets = await fetchActiveAdsets(accountId);
        if (adsets.length === 0) continue;

        // 개별 reach 조회
        let reachByAdset: Record<string, number>;
        try {
          reachByAdset = await fetchPerAdsetReach(
            accountId,
            adsets.map((a) => a.id),
            range.start,
            range.end,
          );
        } catch {
          // Meta API 실패 시 DB fallback
          const { data: reachRows } = await supabase
            .from("daily_ad_insights")
            .select("adset_id, reach")
            .eq("account_id", accountId)
            .gte("date", range.start)
            .lte("date", range.end)
            .in("adset_id", adsets.map((a) => a.id));

          reachByAdset = {};
          for (const row of (reachRows ?? []) as { adset_id: string; reach: number | null }[]) {
            if (!row.adset_id) continue;
            reachByAdset[row.adset_id] = Math.max(
              reachByAdset[row.adset_id] ?? 0,
              row.reach ?? 0,
            );
          }
        }

        // reach 0인 adset 제외
        const activeAdsets = adsets.filter((a) => (reachByAdset[a.id] ?? 0) > 0);
        if (activeAdsets.length === 0) {
          // 활성 adset 없음 → 중복률 0으로 저장
          await upsertOverlapResult(supabase, accountId, range.end, 0, 0, 0, []);
          computed++;
          continue;
        }

        const individualSum = activeAdsets.reduce(
          (sum, a) => sum + (reachByAdset[a.id] ?? 0),
          0,
        );

        // 전체 합산 unique reach
        let totalUnique: number;
        try {
          totalUnique = await fetchCombinedReach(
            accountId,
            activeAdsets.map((a) => a.id),
            range.start,
            range.end,
          );
        } catch {
          totalUnique = individualSum; // 실패 시 중복률 0
        }

        const overallRate =
          individualSum > 0
            ? Math.max(0, ((individualSum - totalUnique) / individualSum) * 100)
            : 0;

        // Pair-wise overlap 계산
        const pairs: OverlapPair[] = [];
        const now = new Date().toISOString();

        const sortedAdsets = [...activeAdsets].sort(
          (a, b) => (reachByAdset[b.id] ?? 0) - (reachByAdset[a.id] ?? 0),
        );
        const cappedAdsets = sortedAdsets.slice(0, 6);

        type PairTask = {
          a: (typeof cappedAdsets)[0];
          b: (typeof cappedAdsets)[0];
          reachA: number;
          reachB: number;
        };
        const allPairTasks: PairTask[] = [];
        for (let i = 0; i < cappedAdsets.length; i++) {
          for (let j = i + 1; j < cappedAdsets.length; j++) {
            const a = cappedAdsets[i];
            const b = cappedAdsets[j];
            const reachA = reachByAdset[a.id] ?? 0;
            const reachB = reachByAdset[b.id] ?? 0;
            if (reachA + reachB === 0) continue;
            allPairTasks.push({ a, b, reachA, reachB });
          }
        }

        const startTime = Date.now();
        for (let c = 0; c < allPairTasks.length; c += CONCURRENCY) {
          if (Date.now() - startTime > PAIR_TIMEOUT_MS) break;

          const chunk = allPairTasks.slice(c, c + CONCURRENCY);
          const results = await Promise.allSettled(
            chunk.map(({ a, b, reachA, reachB }) =>
              (async () => {
                const pairSum = reachA + reachB;
                const combinedUnique = await fetchCombinedReach(
                  accountId,
                  [a.id, b.id],
                  range.start,
                  range.end,
                );
                const pairOverlap = Math.max(
                  0,
                  ((pairSum - combinedUnique) / pairSum) * 100,
                );

                pairs.push({
                  adset_a_name: a.name,
                  adset_b_name: b.name,
                  campaign_a: a.campaignName,
                  campaign_b: b.campaignName,
                  overlap_rate: Math.round(pairOverlap * 10) / 10,
                });

                // pair별 캐시도 저장
                await supabase.from("adset_overlap_cache" as never).upsert(
                  {
                    account_id: accountId,
                    adset_pair: makePairKey(a.id, b.id),
                    period_start: range.start,
                    period_end: range.end,
                    overlap_data: {
                      overlap_rate: Math.round(pairOverlap * 10) / 10,
                      reach_a: reachA,
                      reach_b: reachB,
                      combined_unique: combinedUnique,
                      adset_a_name: a.name,
                      adset_b_name: b.name,
                      campaign_a: a.campaignName,
                      campaign_b: b.campaignName,
                    },
                    cached_at: now,
                  } as never,
                  { onConflict: "account_id,adset_pair,period_start,period_end" },
                );
              })(),
            ),
          );

          for (const result of results) {
            if (result.status === "rejected") {
              console.warn(`[precompute-overlap] pair 실패 [${accountId}/${period}]:`, result.reason);
            }
          }
        }

        // __overall__ 캐시
        try {
          await supabase.from("adset_overlap_cache" as never).upsert(
            {
              account_id: accountId,
              adset_pair: "__overall__",
              period_start: range.start,
              period_end: range.end,
              overlap_data: {
                overall_rate: Math.round(overallRate * 10) / 10,
                total_unique: totalUnique,
                individual_sum: individualSum,
              },
              cached_at: now,
            } as never,
            { onConflict: "account_id,adset_pair,period_start,period_end" },
          );
        } catch {
          // 무시
        }

        pairs.sort((a, b) => b.overlap_rate - a.overlap_rate);
        const roundedRate = Math.round(overallRate * 10) / 10;

        await upsertOverlapResult(
          supabase,
          accountId,
          range.end,
          roundedRate,
          totalUnique,
          individualSum,
          pairs,
        );
        computed++;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Meta API 토큰 미설정 시 전체 중단
        if (msg.includes("META_ACCESS_TOKEN")) {
          errors.push(`overlap [${accountId}]: META_ACCESS_TOKEN not set`);
          return { computed, errors };
        }
        errors.push(`overlap [${accountId}/${period}]: ${msg}`);
      }
    }
  }

  return { computed, errors };
}

async function upsertOverlapResult(
  supabase: SupabaseClient,
  accountId: string,
  dateEnd: string,
  overallRate: number,
  totalUnique: number,
  individualSum: number,
  pairs: OverlapPair[],
) {
  await supabase.from("daily_overlap_insights" as never).upsert(
    {
      account_id: accountId,
      date: dateEnd,
      overall_rate: overallRate,
      total_unique_reach: totalUnique,
      individual_sum: individualSum,
      pairs,
      collected_at: new Date().toISOString(),
    } as never,
    { onConflict: "account_id,date" },
  );
}
