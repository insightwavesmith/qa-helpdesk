import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// ── Meta API 필드 정의 (GCP 방식) ─────────────────────────────
const AD_FIELDS = [
  "id",
  "name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "account_id",
  "account_name",
  "creative.fields(object_type)",
].join(",");

const INSIGHT_FIELDS = [
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "reach",
  "actions",
  "action_values",
  "video_thruplay_watched_actions",
  "video_p100_watched_actions",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
].join(",");

// ── 유틸리티 ──────────────────────────────────────────────────
function safeFloat(v: unknown, def = 0): number {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
function safeInt(v: unknown, def = 0): number {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

function round(v: number, d: number): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

type Action = { action_type: string; value: string | number };

function getActionValue(actions: Action[] | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? safeFloat(a.value) : 0;
}

function getVideoActionValue(videoActions: { value: string | number }[] | undefined): number {
  if (!videoActions || videoActions.length === 0) return 0;
  return videoActions.reduce((sum, a) => sum + safeFloat(a.value), 0);
}

// Meta 랭킹 정규화 (GCP 방식)
function normalizeRanking(raw: string | null | undefined): string {
  if (!raw) return "UNKNOWN";
  const u = raw.toUpperCase();
  if (u.includes("ABOVE")) return "ABOVE_AVERAGE";
  if (u.includes("BELOW")) return "BELOW_AVERAGE";
  if (u === "AVERAGE") return "AVERAGE";
  return "UNKNOWN";
}

// creative.object_type → creative_type (GCP 방식)
function getCreativeType(ad: Record<string, unknown>): string {
  const creative = ad.creative as { object_type?: string } | undefined;
  const objectType = creative?.object_type ?? "UNKNOWN";
  const typeMap: Record<string, string> = {
    VIDEO: "VIDEO",
    SHARE: "SHARE",
    IMAGE: "IMAGE",
    PRIVACY_CHECK_FAIL: "VIDEO",
  };
  return typeMap[objectType] ?? "UNKNOWN";
}

// ── 지표 계산 (GCP 스펙 기준) ──────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateMetrics(insight: Record<string, any>) {
  const impressions = safeInt(insight.impressions);
  const clicks = safeInt(insight.clicks);
  const spend = safeFloat(insight.spend);
  const reach = safeInt(insight.reach);

  const actions: Action[] = insight.actions ?? [];
  const actionValues: Action[] = insight.action_values ?? [];

  const initiateCheckout =
    getActionValue(actions, "initiate_checkout") ||
    getActionValue(actions, "omni_initiated_checkout");
  const purchases =
    getActionValue(actions, "purchase") ||
    getActionValue(actions, "omni_purchase");
  const purchaseValue =
    getActionValue(actionValues, "purchase") ||
    getActionValue(actionValues, "omni_purchase");

  const ctr = safeFloat(insight.ctr);
  const roas = spend > 0 ? purchaseValue / spend : 0;

  // 영상 지표 (GCP 방식: actions → video_view가 3초 시청)
  const videoP3s = getActionValue(actions, "video_view");
  const thruplay = getVideoActionValue(insight.video_thruplay_watched_actions);
  const videoP100 = getVideoActionValue(insight.video_p100_watched_actions);

  // 참여 지표
  const reactions = getActionValue(actions, "post_reaction") || getActionValue(actions, "like");
  const comments = getActionValue(actions, "comment");
  const shares = getActionValue(actions, "post");
  const saves = getActionValue(actions, "onsite_conversion.post_save");

  return {
    spend: round(spend, 2),
    impressions,
    reach,
    clicks,
    purchases: Math.trunc(purchases),
    purchase_value: round(purchaseValue, 2),
    ctr: round(ctr, 4),
    roas: round(roas, 4),
    initiate_checkout: Math.trunc(initiateCheckout),
    // 영상 지표 (GCP 방식: 분모 = impressions)
    video_p3s_rate: impressions > 0 ? round(videoP3s / impressions * 100, 4) : null,
    thruplay_rate: impressions > 0 ? round(thruplay / impressions * 100, 4) : null,
    // retention_rate = p100 / p3s (GCP 방식, 기존: thruplay / p3s)
    retention_rate: videoP3s > 0 ? round(videoP100 / videoP3s * 100, 4) : null,
    video_p100: Math.trunc(videoP100),
    // 참여 지표
    reactions_per_10k: impressions > 0 ? round(reactions / impressions * 10000, 2) : null,
    comments_per_10k: impressions > 0 ? round(comments / impressions * 10000, 2) : null,
    shares_per_10k: impressions > 0 ? round(shares / impressions * 10000, 2) : null,
    saves_per_10k: impressions > 0 ? round(saves / impressions * 10000, 2) : null,
    engagement_per_10k: impressions > 0 ? round((reactions + comments + shares + saves) / impressions * 10000, 2) : null,
    // 전환율 지표
    click_to_checkout_rate: clicks > 0 ? round(initiateCheckout / clicks * 100, 4) : null,
    click_to_purchase_rate: clicks > 0 ? round(purchases / clicks * 100, 4) : null,
    checkout_to_purchase_rate: initiateCheckout > 0 ? round(purchases / initiateCheckout * 100, 4) : null,
    // reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
    reach_to_purchase_rate: impressions > 0 ? round(purchases / impressions * 100, 6) : null,
  };
}

// ── Meta Graph API 호출 (GCP 방식: /ads 엔드포인트) ───────────
async function fetchAccountAds(accountId: string, targetDate?: string): Promise<Record<string, unknown>[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");

  const cleanId = accountId.replace(/^act_/, "");

  // insights 필드: date_preset 또는 time_range 방식
  const insightSpec = targetDate
    ? `insights.time_range(${JSON.stringify({ since: targetDate, until: targetDate })}){${INSIGHT_FIELDS}}`
    : `insights.date_preset(yesterday){${INSIGHT_FIELDS}}`;

  const fields = `${AD_FIELDS},${insightSpec}`;

  const url = new URL(`https://graph.facebook.com/v21.0/act_${cleanId}/ads`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", fields);
  url.searchParams.set(
    "filtering",
    JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }])
  );
  url.searchParams.set("limit", "100");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta API: ${data.error.message ?? "Unknown error"}`);
  }

  // 인사이트가 있는 광고만 필터링
  const ads: Record<string, unknown>[] = data.data ?? [];
  return ads.filter((ad) => {
    const insights = (ad.insights as { data?: unknown[] } | undefined)?.data;
    return insights && insights.length > 0;
  });
}

export const maxDuration = 300; // 5분 (Vercel Pro 최대)

// ── GET /api/cron/collect-daily ──────────────────────────────
// Vercel Cron: 매일 03:00 UTC (KST 12:00)
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date"); // optional: YYYY-MM-DD
  const yesterday = dateParam ?? new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  try {
    // 1. Meta API로 접근 가능한 전체 광고계정 조회
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error("META_ACCESS_TOKEN not set");

    const adAccountsUrl = new URL("https://graph.facebook.com/v21.0/me/adaccounts");
    adAccountsUrl.searchParams.set("access_token", token);
    adAccountsUrl.searchParams.set("fields", "account_id,name");
    adAccountsUrl.searchParams.set("limit", "500");

    const adAccountsRes = await fetch(adAccountsUrl.toString());
    const adAccountsJson = await adAccountsRes.json();

    if (!adAccountsJson.data || adAccountsJson.data.length === 0) {
      return NextResponse.json({ message: "No accessible accounts", results: [] });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const accounts = adAccountsJson.data.map((a: any) => ({
      account_id: (a.account_id as string).replace(/^act_/, ""),
      account_name: a.name as string,
    }));

    const results: Record<string, unknown>[] = [];

    for (const account of accounts) {
      const accountResult: Record<string, unknown> = {
        account_id: account.account_id,
        meta_ads: 0,
      };

      // ── Meta 광고 데이터 수집 (GCP 방식) ──
      try {
        const ads = await fetchAccountAds(account.account_id, dateParam ?? undefined);

        if (ads.length > 0) {
          console.log(`[collect-daily] Sample ad keys [${account.account_id}]:`, Object.keys(ads[0]));
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows = ads.map((ad: any) => {
            const insight = (ad.insights as { data: Record<string, unknown>[] }).data[0];
            const metrics = calculateMetrics(insight);
            const creativeType = getCreativeType(ad);

            return {
              date: yesterday,
              account_id: account.account_id,
              account_name: account.account_name,
              campaign_id: ad.campaign_id ?? null,
              campaign_name: ad.campaign_name ?? null,
              adset_id: ad.adset_id ?? null,
              adset_name: ad.adset_name ?? null,
              ad_id: (ad.ad_id ?? ad.id) as string | null,
              ad_name: (ad.ad_name ?? ad.name) as string | null,
              creative_type: creativeType,
              quality_ranking: normalizeRanking(insight.quality_ranking as string),
              engagement_ranking: normalizeRanking(insight.engagement_rate_ranking as string),
              conversion_ranking: normalizeRanking(insight.conversion_rate_ranking as string),
              ...metrics,
              collected_at: new Date().toISOString(),
            };
          });

          const { error: insertErr } = await svc
            .from("daily_ad_insights")
            .upsert(rows as never[], { onConflict: "account_id,date,ad_id" });

          if (insertErr) {
            console.error(
              `daily_ad_insights insert error [${account.account_id}]:`,
              insertErr
            );
          } else {
            accountResult.meta_ads = rows.length;
          }
        }
      } catch (e) {
        accountResult.meta_error = e instanceof Error ? e.message : String(e);
        console.error(`Meta error [${account.account_id}]:`, e);
      }

      // ── overlap 수집 ──────────────────────────────────────────
      try {
        const { fetchActiveAdsets, fetchCombinedReach, makePairKey } = await import("@/lib/protractor/overlap-utils");

        const adsets = await fetchActiveAdsets(account.account_id);
        if (adsets.length > 0) {
          // 개별 reach — 당일 DB 데이터 사용
          const { data: reachRows } = await svc
            .from("daily_ad_insights")
            .select("adset_id, reach")
            .eq("account_id", account.account_id)
            .eq("date", yesterday)
            .in("adset_id", adsets.map((a) => a.id));

          const reachByAdset: Record<string, number> = {};
          for (const row of (reachRows ?? []) as { adset_id: string; reach: number | null }[]) {
            if (!row.adset_id) continue;
            reachByAdset[row.adset_id] = (reachByAdset[row.adset_id] ?? 0) + (row.reach ?? 0);
          }

          const activeAdsets = adsets.filter((a) => (reachByAdset[a.id] ?? 0) > 0);
          if (activeAdsets.length > 0) {
            const individualSum = activeAdsets.reduce((sum, a) => sum + (reachByAdset[a.id] ?? 0), 0);

            // 전체 unique reach (Meta API)
            let totalUnique: number;
            try {
              totalUnique = await fetchCombinedReach(
                account.account_id,
                activeAdsets.map((a) => a.id),
                yesterday,
                yesterday
              );
            } catch {
              totalUnique = individualSum;
            }

            const overallRate =
              individualSum > 0
                ? Math.max(0, ((individualSum - totalUnique) / individualSum) * 100)
                : 0;

            // pair별 overlap 계산 (상위 8개 adset, 최대 28조합)
            const sortedAdsets = [...activeAdsets].sort(
              (a, b) => (reachByAdset[b.id] ?? 0) - (reachByAdset[a.id] ?? 0)
            );
            const cappedAdsets = sortedAdsets.slice(0, 8);
            const pairs: Array<{
              adset_a_name: string;
              adset_b_name: string;
              campaign_a: string;
              campaign_b: string;
              overlap_rate: number;
            }> = [];

            for (let i = 0; i < cappedAdsets.length; i++) {
              for (let j = i + 1; j < cappedAdsets.length; j++) {
                const a = cappedAdsets[i];
                const b = cappedAdsets[j];
                const pairSum = (reachByAdset[a.id] ?? 0) + (reachByAdset[b.id] ?? 0);
                if (pairSum === 0) continue;
                // makePairKey는 사용되지 않는 변수 방지용
                void makePairKey(a.id, b.id);
                try {
                  const combinedUnique = await fetchCombinedReach(
                    account.account_id,
                    [a.id, b.id],
                    yesterday,
                    yesterday
                  );
                  const pairOverlap = Math.max(0, ((pairSum - combinedUnique) / pairSum) * 100);
                  pairs.push({
                    adset_a_name: a.name,
                    adset_b_name: b.name,
                    campaign_a: a.campaignName,
                    campaign_b: b.campaignName,
                    overlap_rate: Math.round(pairOverlap * 10) / 10,
                  });
                } catch {
                  continue;
                }
              }
            }

            // daily_overlap_insights UPSERT
            await svc
              .from("daily_overlap_insights" as never)
              .upsert(
                {
                  account_id: account.account_id,
                  date: yesterday,
                  overall_rate: Math.round(overallRate * 10) / 10,
                  total_unique_reach: totalUnique,
                  individual_sum: individualSum,
                  pairs: pairs,
                  collected_at: new Date().toISOString(),
                } as never,
                { onConflict: "account_id,date" }
              );

            accountResult.overlap_rate = Math.round(overallRate * 10) / 10;
          }
        }
      } catch (overlapErr) {
        console.error(`overlap 수집 실패 (${account.account_id}):`, overlapErr);
        // 실패해도 다른 수집에 영향 없게 격리
      }

      results.push(accountResult);
    }

    return NextResponse.json({
      message: "collect-daily completed",
      date: yesterday,
      accounts: accounts.length,
      results,
    });
  } catch (e) {
    console.error("collect-daily fatal error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? (e as { message: string }).message : "Unknown error" },
      { status: 500 }
    );
  }
}
