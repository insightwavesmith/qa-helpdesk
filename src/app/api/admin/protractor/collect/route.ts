import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCreativeType } from "@/lib/protractor/creative-type";
import { runCollectDaily } from "@/app/api/cron/collect-daily/route";

// ── collect-daily에서 재사용할 유틸리티 (동일 로직) ──

const AD_FIELDS = [
  "id", "name", "adset_id", "adset_name",
  "campaign_id", "campaign_name", "account_id", "account_name",
  "creative.fields(object_type,product_set_id,video_id,image_hash,asset_feed_spec)",
].join(",");

const INSIGHT_FIELDS = [
  "spend", "impressions", "clicks", "ctr", "reach",
  "actions", "action_values",
  "video_thruplay_watched_actions", "video_p100_watched_actions",
  "quality_ranking", "engagement_rate_ranking", "conversion_rate_ranking",
].join(",");

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

function normalizeRanking(raw: string | null | undefined): string {
  if (!raw) return "UNKNOWN";
  const u = raw.toUpperCase();
  if (u.includes("ABOVE")) return "ABOVE_AVERAGE";
  if (u.includes("BELOW")) return "BELOW_AVERAGE";
  if (u === "AVERAGE") return "AVERAGE";
  return "UNKNOWN";
}

// getCreativeType은 공용 모듈에서 import (@/lib/protractor/creative-type)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateMetrics(insight: Record<string, any>) {
  const impressions = safeInt(insight.impressions);
  const clicks = safeInt(insight.clicks);
  const spend = safeFloat(insight.spend);
  const reach = safeInt(insight.reach);

  const actions: Action[] = insight.actions ?? [];
  const actionValues: Action[] = insight.action_values ?? [];

  const initiateCheckout = getActionValue(actions, "initiate_checkout") || getActionValue(actions, "omni_initiated_checkout");
  const purchases = getActionValue(actions, "purchase") || getActionValue(actions, "omni_purchase");
  const purchaseValue = getActionValue(actionValues, "purchase") || getActionValue(actionValues, "omni_purchase");

  const ctr = safeFloat(insight.ctr);
  const roas = spend > 0 ? purchaseValue / spend : 0;

  const videoP3s = getActionValue(actions, "video_view");
  const thruplay = getVideoActionValue(insight.video_thruplay_watched_actions);
  const videoP100 = getVideoActionValue(insight.video_p100_watched_actions);

  const reactions = getActionValue(actions, "post_reaction") || getActionValue(actions, "like");
  const comments = getActionValue(actions, "comment");
  const shares = getActionValue(actions, "post");
  const saves = getActionValue(actions, "onsite_conversion.post_save");

  return {
    spend: round(spend, 2),
    impressions, reach, clicks,
    purchases: Math.trunc(purchases),
    purchase_value: round(purchaseValue, 2),
    ctr: round(ctr, 4),
    roas: round(roas, 4),
    initiate_checkout: Math.trunc(initiateCheckout),
    video_p3s_rate: impressions > 0 ? round(videoP3s / impressions * 100, 4) : null,
    thruplay_rate: impressions > 0 ? round(thruplay / impressions * 100, 4) : null,
    retention_rate: videoP3s > 0 ? round(videoP100 / videoP3s * 100, 4) : null,
    video_p100: Math.trunc(videoP100),
    reactions_per_10k: impressions > 0 ? round(reactions / impressions * 10000, 2) : null,
    comments_per_10k: impressions > 0 ? round(comments / impressions * 10000, 2) : null,
    shares_per_10k: impressions > 0 ? round(shares / impressions * 10000, 2) : null,
    saves_per_10k: impressions > 0 ? round(saves / impressions * 10000, 2) : null,
    engagement_per_10k: impressions > 0 ? round((reactions + comments + shares + saves) / impressions * 10000, 2) : null,
    click_to_checkout_rate: clicks > 0 ? round(initiateCheckout / clicks * 100, 4) : null,
    click_to_purchase_rate: clicks > 0 ? round(purchases / clicks * 100, 4) : null,
    checkout_to_purchase_rate: initiateCheckout > 0 ? round(purchases / initiateCheckout * 100, 4) : null,
    reach_to_purchase_rate: impressions > 0 ? round(purchases / impressions * 100, 6) : null,
  };
}

async function fetchMetaWithRetry(url: string, options: RequestInit, maxRetries = 2): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 3000;
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, (attempt + 1) * 3000));
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

async function fetchAccountAds(accountId: string, targetDate: string): Promise<Record<string, unknown>[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");

  const cleanId = accountId.replace(/^act_/, "");
  const insightSpec = `insights.time_range(${JSON.stringify({ since: targetDate, until: targetDate })}){${INSIGHT_FIELDS}}`;
  const fields = `${AD_FIELDS},${insightSpec}`;

  const url = new URL(`https://graph.facebook.com/v21.0/act_${cleanId}/ads`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", fields);
  url.searchParams.set("filtering", JSON.stringify([{ field: "effective_status", operator: "IN", value: ["ACTIVE"] }]));
  url.searchParams.set("limit", "100");

  const res = await fetchMetaWithRetry(url.toString(), { signal: AbortSignal.timeout(60_000) });
  const data = await res.json();

  if (data.error) {
    throw new Error(`Meta API: ${data.error.message ?? "Unknown error"}`);
  }

  const ads: Record<string, unknown>[] = data.data ?? [];
  return ads.filter((ad) => {
    const insights = (ad.insights as { data?: unknown[] } | undefined)?.data;
    return insights && insights.length > 0;
  });
}

// ── POST /api/admin/protractor/collect ────────────────────────
// 관리자 전용: 전체 또는 선택 계정 일괄 수집 (SSE 스트리밍)
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  // 인증
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "인증이 필요합니다." }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    return NextResponse.json({ error: "관리자 전용 기능입니다." }, { status: 403 });
  }

  // 요청 파싱
  const body = await req.json();
  const mode: string | undefined = body.mode;
  const accountIds: string[] | "all" = body.accountIds;
  const dateParam: string | undefined = body.date;
  const days: number = typeof body.days === "number" ? body.days : 90;

  // ── backfill 모드 ──────────────────────────────────────────
  if (mode === "backfill") {
    if (!accountIds || accountIds === "all" || (accountIds as string[]).length === 0) {
      return NextResponse.json({ error: "backfill은 계정 ID 지정 필수" }, { status: 400 });
    }
    const targetAccountIds = accountIds as string[];

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        function send(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        }

        send({ type: "backfill_start", days, accounts: targetAccountIds.length });

        let successDays = 0;
        let failedDays = 0;

        for (let i = days; i >= 1; i--) {
          const d = new Date(Date.now() + 9 * 3600_000); // KST
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().slice(0, 10);

          try {
            for (const accId of targetAccountIds) {
              const result = await runCollectDaily(dateStr, undefined, accId);
              send({
                type: "day_complete",
                date: dateStr,
                accountId: accId,
                ads: result.results.length,
              });
            }
            successDays++;
          } catch (e) {
            failedDays++;
            send({
              type: "day_error",
              date: dateStr,
              error: e instanceof Error ? e.message : String(e),
            });
          }

          // rate limit: 날짜 간 1초 딜레이
          await new Promise(r => setTimeout(r, 1000));
        }

        send({ type: "backfill_complete", successDays, failedDays });
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }

  // KST 어제 날짜
  const targetDate = dateParam ?? (() => {
    const now = new Date(Date.now() + 9 * 3600_000);
    now.setDate(now.getDate() - 1);
    return now.toISOString().slice(0, 10);
  })();

  // 수집 대상 계정 조회
  let accounts: { account_id: string; account_name: string }[];

  if (accountIds === "all") {
    const { data } = await svc
      .from("ad_accounts")
      .select("account_id, account_name")
      .eq("active", true)
      .order("account_name");
    accounts = (data ?? []).map((a) => ({
      account_id: a.account_id as string,
      account_name: (a.account_name ?? a.account_id) as string,
    }));
  } else {
    const { data } = await svc
      .from("ad_accounts")
      .select("account_id, account_name")
      .eq("active", true)
      .in("account_id", accountIds);
    accounts = (data ?? []).map((a) => ({
      account_id: a.account_id as string,
      account_name: (a.account_name ?? a.account_id) as string,
    }));
  }

  if (accounts.length === 0) {
    return NextResponse.json({ error: "수집할 계정이 없습니다." }, { status: 400 });
  }

  // SSE 스트리밍
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      send({ type: "start", totalAccounts: accounts.length, date: targetDate });

      let successCount = 0;
      let failedCount = 0;
      let totalAds = 0;

      for (const account of accounts) {
        send({
          type: "account_start",
          accountId: account.account_id,
          accountName: account.account_name,
        });

        try {
          const ads = await fetchAccountAds(account.account_id, targetDate);

          if (ads.length > 0) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rows = ads.map((ad: any) => {
              const insight = (ad.insights as { data: Record<string, unknown>[] }).data[0];
              const metrics = calculateMetrics(insight);
              const creativeType = getCreativeType(ad);
              return {
                date: targetDate,
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
              throw new Error(insertErr.message);
            }

            totalAds += rows.length;
            send({
              type: "account_complete",
              accountId: account.account_id,
              adsCount: rows.length,
            });
          } else {
            send({
              type: "account_complete",
              accountId: account.account_id,
              adsCount: 0,
            });
          }
          successCount++;
        } catch (e) {
          failedCount++;
          send({
            type: "account_error",
            accountId: account.account_id,
            error: e instanceof Error ? e.message : String(e),
          });
        }

        // Rate limit 보호: 계정 간 2초 딜레이
        await new Promise(r => setTimeout(r, 2000));
      }

      send({
        type: "complete",
        summary: { success: successCount, failed: failedCount, totalAds },
      });

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
