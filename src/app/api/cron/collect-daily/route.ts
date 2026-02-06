import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// ── Meta UTM 소스 목록 ────────────────────────────────────────
const META_UTM_SOURCES = [
  "meta",
  "facebook",
  "fb",
  "ig",
  "instagram",
  "Facebook",
  "Instagram",
];

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

type Action = { action_type: string; value: string | number };

function getActionValue(actions: Action[] | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? safeFloat(a.value) : 0;
}

function getVideoActionValue(arr: Action[] | undefined): number {
  if (!arr || arr.length === 0) return 0;
  return safeFloat(arr[0]?.value);
}

function normalizeRanking(r: string | null | undefined): string {
  if (!r) return "UNKNOWN";
  const u = r.toUpperCase();
  if (u.includes("ABOVE")) return "ABOVE_AVERAGE";
  if (u.includes("BELOW")) return "BELOW_AVERAGE";
  if (u === "AVERAGE") return "AVERAGE";
  return "UNKNOWN";
}

function round(v: number, d: number): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

// ── Meta insights 지표 계산 ───────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateMetrics(insight: Record<string, any>) {
  const impressions = safeInt(insight.impressions);
  const clicks = safeInt(insight.clicks);
  const spend = safeFloat(insight.spend);
  const reach = safeInt(insight.reach);

  const actions: Action[] = insight.actions ?? [];
  const actionValues: Action[] = insight.action_values ?? [];

  const addToCart =
    getActionValue(actions, "add_to_cart") ||
    getActionValue(actions, "omni_add_to_cart");
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

  return {
    spend: round(spend, 2),
    impressions,
    reach,
    clicks,
    purchases: Math.trunc(purchases),
    purchase_value: round(purchaseValue, 2),
    ctr: round(ctr, 4),
    roas: round(roas, 4),
    add_to_cart: Math.trunc(addToCart),
    initiate_checkout: Math.trunc(initiateCheckout),
  };
}

// ── Meta Graph API 호출 ────────────────────────────────────────
async function fetchAccountInsights(accountId: string) {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");

  const fields =
    "spend,impressions,clicks,actions,action_values,ctr,cpc,cpm,frequency,reach";

  const url = new URL(
    `https://graph.facebook.com/v21.0/act_${accountId}/insights`
  );
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", fields);
  url.searchParams.set("date_preset", "yesterday");
  url.searchParams.set("level", "ad");
  url.searchParams.set("limit", "500");

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) });
  const data = await res.json();

  if (data.error) {
    throw new Error(
      `Meta API: ${data.error.message ?? "Unknown error"}`
    );
  }

  return (data.data ?? []) as Record<string, unknown>[];
}

// ── Mixpanel Segmentation API 호출 ────────────────────────────
async function fetchMixpanelLpMetrics(
  projectId: string,
  secret: string,
  fromDate: string,
  toDate: string
) {
  const auth = Buffer.from(`${secret}:`).toString("base64");
  const baseUrl = "https://mixpanel.com/api/2.0/segmentation";

  const sourceConditions = META_UTM_SOURCES.map(
    (s) => `properties["utm_source"] == "${s}"`
  ).join(" or ");
  const metaWhere = `(${sourceConditions})`;

  async function queryTotal(
    event: string,
    extraWhere?: string,
    useMetaFilter = true
  ): Promise<number> {
    let where = useMetaFilter ? metaWhere : undefined;
    if (extraWhere) {
      where = useMetaFilter ? `${metaWhere} and ${extraWhere}` : extraWhere;
    }

    const params = new URLSearchParams({
      project_id: projectId,
      event,
      from_date: fromDate,
      to_date: toDate,
      type: "general",
    });
    if (where) params.set("where", where);

    const res = await fetch(`${baseUrl}?${params}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const result = await res.json();

    if (result.data?.values) {
      return Object.values(result.data.values).reduce(
        (sum: number, daily) =>
          sum +
          Object.values(daily as Record<string, number>).reduce(
            (s, v) => s + v,
            0
          ),
        0
      );
    }
    return 0;
  }

  async function queryUnique(
    event: string,
    useMetaFilter = true
  ): Promise<number> {
    const params = new URLSearchParams({
      project_id: projectId,
      event,
      from_date: fromDate,
      to_date: toDate,
      type: "unique",
    });
    if (useMetaFilter) params.set("where", metaWhere);

    const res = await fetch(`${baseUrl}?${params}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const result = await res.json();

    if (result.data?.values) {
      return Object.values(result.data.values).reduce(
        (sum: number, daily) =>
          sum +
          Object.values(daily as Record<string, number>).reduce(
            (s, v) => s + v,
            0
          ),
        0
      );
    }
    return 0;
  }

  async function queryDurationAvg(): Promise<number> {
    const params = new URLSearchParams({
      project_id: projectId,
      event: "page_exit",
      from_date: fromDate,
      to_date: toDate,
      type: "general",
      on: 'properties["duration"]',
      where: metaWhere,
    });

    const res = await fetch(`${baseUrl}?${params}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const result = await res.json();

    let totalDuration = 0;
    let totalEvents = 0;
    if (result.data?.values) {
      for (const [durStr, dailyData] of Object.entries(result.data.values)) {
        const dur = Number(durStr);
        if (!Number.isFinite(dur)) continue;
        const cnt =
          typeof dailyData === "object" && dailyData !== null
            ? Object.values(dailyData as Record<string, number>).reduce(
                (s, v) => s + v,
                0
              )
            : 0;
        totalDuration += dur * cnt;
        totalEvents += cnt;
      }
    }
    return totalEvents > 0 ? totalDuration / totalEvents : 0;
  }

  // 세션 수 (view_product)
  const totalSessions = await queryTotal("view_product", undefined, true);
  if (totalSessions < 10) return null;

  // LP 품질 지표
  const [
    stayed1s,
    stayed10s,
    avgDuration,
    scroll25,
    scroll50,
    scroll75,
    reviewClicks,
    totalClicks,
    cartUsers,
    checkoutUsers,
    purchaseUsers,
  ] = await Promise.all([
    queryTotal("page_exit", 'properties["duration"] >= 1', true),
    queryTotal("page_exit", 'properties["duration"] >= 10', true),
    queryDurationAvg(),
    queryTotal("scroll_depth", 'properties["scroll_percent"] >= 25', true),
    queryTotal("scroll_depth", 'properties["scroll_percent"] >= 50', true),
    queryTotal("scroll_depth", 'properties["scroll_percent"] >= 75', true),
    queryTotal("review_click", undefined, true),
    queryTotal("$mp_click", undefined, true),
    queryUnique("add_to_cart", false),
    queryUnique("begin_checkout", false),
    queryUnique("purchase", false),
  ]);

  return {
    total_users: totalSessions,
    bounce_1s_rate: round(
      ((totalSessions - stayed1s) / totalSessions) * 100,
      2
    ),
    bounce_10s_rate: round(
      ((totalSessions - stayed10s) / totalSessions) * 100,
      2
    ),
    avg_time_on_page: round(avgDuration, 2),
    scroll_25_rate: round((scroll25 / totalSessions) * 100, 2),
    scroll_50_rate: round((scroll50 / totalSessions) * 100, 2),
    scroll_75_rate: round((scroll75 / totalSessions) * 100, 2),
    review_click_rate: round((reviewClicks / totalSessions) * 100, 2),
    total_button_clicks: totalClicks,
    lp_session_to_cart: round((cartUsers / totalSessions) * 100, 2),
    lp_session_to_checkout: round((checkoutUsers / totalSessions) * 100, 2),
    lp_session_to_purchase: round((purchaseUsers / totalSessions) * 100, 2),
    lp_checkout_to_purchase:
      checkoutUsers > 0
        ? round((purchaseUsers / checkoutUsers) * 100, 2)
        : 0,
  };
}

// ── POST /api/cron/collect-daily ──────────────────────────────
// Vercel Cron: 매일 01:00 UTC (KST 10:00)
export async function POST(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const yesterday = new Date(Date.now() - 86_400_000)
    .toISOString()
    .slice(0, 10);

  try {
    // 1. active ad_accounts 조회
    const { data: accounts, error: accErr } = await svc
      .from("ad_accounts")
      .select("account_id, account_name, mixpanel_project_id")
      .eq("active", true);

    if (accErr) throw accErr;
    if (!accounts || accounts.length === 0) {
      return NextResponse.json({ message: "No active accounts", results: [] });
    }

    const results: Record<string, unknown>[] = [];

    for (const account of accounts) {
      const accountResult: Record<string, unknown> = {
        account_id: account.account_id,
        meta_ads: 0,
        lp_collected: false,
      };

      // ── Meta 광고 데이터 수집 ──
      try {
        const insights = await fetchAccountInsights(account.account_id);

        if (insights.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const rows = insights.map((insight: any) => {
            const metrics = calculateMetrics(insight);
            return {
              date: yesterday,
              account_id: account.account_id,
              account_name: account.account_name,
              campaign_id: insight.campaign_id ?? null,
              campaign_name: insight.campaign_name ?? null,
              adset_id: insight.adset_id ?? null,
              adset_name: insight.adset_name ?? null,
              ad_id: insight.ad_id ?? null,
              ad_name: insight.ad_name ?? null,
              ...metrics,
              collected_at: new Date().toISOString(),
            };
          });

          const { error: insertErr } = await svc
            .from("daily_ad_insights")
            .insert(rows as never[]);

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

      // ── Mixpanel LP 데이터 수집 ──
      if (account.mixpanel_project_id) {
        try {
          // service_secrets에서 Mixpanel secret 조회
          const { data: secretRow } = await svc
            .from("service_secrets" as never)
            .select("key_value" as never)
            .eq("service" as never, "mixpanel")
            .eq(
              "key_name" as never,
              `secret_${account.account_id}`
            )
            .single();

          const mixpanelSecret = (secretRow as { key_value: string } | null)
            ?.key_value;

          if (mixpanelSecret) {
            const lpData = await fetchMixpanelLpMetrics(
              account.mixpanel_project_id,
              mixpanelSecret,
              yesterday,
              yesterday
            );

            if (lpData) {
              const { error: lpErr } = await svc
                .from("daily_lp_metrics")
                .insert({
                  date: yesterday,
                  account_id: account.account_id,
                  project_name: account.account_name,
                  ...lpData,
                  collected_at: new Date().toISOString(),
                } as never);

              if (lpErr) {
                console.error(
                  `daily_lp_metrics insert error [${account.account_id}]:`,
                  lpErr
                );
              } else {
                accountResult.lp_collected = true;
              }
            }
          }
        } catch (e) {
          accountResult.lp_error = e instanceof Error ? e.message : String(e);
          console.error(`Mixpanel error [${account.account_id}]:`, e);
        }
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
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 }
    );
  }
}
