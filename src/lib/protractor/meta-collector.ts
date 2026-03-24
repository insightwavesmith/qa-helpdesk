/**
 * Meta API 공통 모듈 — collect-daily + backfill 공유
 * T8: 과거데이터 수동 수집 기능을 위한 함수 추출
 */

// ── Meta API 필드 정의 ──────────────────────────────────────

export const AD_FIELDS = [
  "id",
  "name",
  "adset_id",
  "adset_name",
  "campaign_id",
  "campaign_name",
  "account_id",
  "account_name",
  "effective_status",
  "configured_status",
  "creative.fields(object_type,product_set_id,video_id,image_hash,asset_feed_spec,object_story_spec,thumbnail_url,body,title,link_url)",
].join(",");

export const INSIGHT_FIELDS = [
  // 기본 지표
  "spend",
  "impressions",
  "clicks",
  "ctr",
  "reach",
  "frequency",
  // 액션/가치 (JSONB 배열)
  "actions",
  "action_values",
  "cost_per_action_type",
  // 동영상 지표
  "video_thruplay_watched_actions",
  "video_p100_watched_actions",
  "video_p25_watched_actions",
  "video_p50_watched_actions",
  "video_p75_watched_actions",
  "video_avg_time_watched_actions",
  "video_play_actions",
  "cost_per_thruplay",
  // 랭킹
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
  // 비용 지표
  "cpm",
  "cpp",
  "cost_per_unique_click",
  // 유니크 지표
  "unique_clicks",
  "unique_ctr",
  // 외부 클릭
  "outbound_clicks",
  "outbound_clicks_ctr",
  // 인라인
  "inline_link_clicks",
  "inline_link_click_ctr",
  // ROAS
  "website_purchase_roas",
  // 기타
  "social_spend",
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

// Meta 랭킹 정규화
function normalizeRanking(raw: string | null | undefined): string {
  if (!raw) return "UNKNOWN";
  const u = raw.toUpperCase();
  if (u.includes("ABOVE")) return "ABOVE_AVERAGE";
  if (u.includes("BELOW")) return "BELOW_AVERAGE";
  if (u === "AVERAGE") return "AVERAGE";
  return "UNKNOWN";
}

// creative_type 분류 — 공용 모듈 사용
import { getCreativeType } from "@/lib/protractor/creative-type";

// ── 지표 계산 ──────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function calculateMetrics(insight: Record<string, any>) {
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

  const videoP3s = getActionValue(actions, "video_view");
  const thruplay = getVideoActionValue(insight.video_thruplay_watched_actions);
  const videoP100 = getVideoActionValue(insight.video_p100_watched_actions);

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

// ── Meta API 재시도 래퍼 ──────────────────────────────────────

async function fetchMetaWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 2
): Promise<Response> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitMs = retryAfter ? parseInt(retryAfter) * 1000 : (attempt + 1) * 3000;
        console.log(`[meta-collector] 429 Rate limited, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok && attempt < maxRetries) {
        const waitMs = (attempt + 1) * 3000;
        console.log(`[meta-collector] API error ${response.status}, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const waitMs = (attempt + 1) * 3000;
        console.log(`[meta-collector] Network error, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

// ── Meta Graph API 호출 ─────────────────────────────────────

// includeInactive=true: 백필용 — ACTIVE+PAUSED+ARCHIVED 광고 포함
export async function fetchAccountAds(
  accountId: string,
  targetDate?: string,
  includeInactive = false,
): Promise<Record<string, unknown>[]> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) throw new Error("META_ACCESS_TOKEN not set");

  const cleanId = accountId.replace(/^act_/, "");

  const insightSpec = targetDate
    ? `insights.time_range(${JSON.stringify({ since: targetDate, until: targetDate })}){${INSIGHT_FIELDS}}`
    : `insights.date_preset(yesterday){${INSIGHT_FIELDS}}`;

  const fields = `${AD_FIELDS},${insightSpec}`;

  const url = new URL(`https://graph.facebook.com/v21.0/act_${cleanId}/ads`);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", fields);

  const statuses = includeInactive
    ? ["ACTIVE", "PAUSED", "ARCHIVED", "WITH_ISSUES"]
    : ["ACTIVE"];
  url.searchParams.set(
    "filtering",
    JSON.stringify([{ field: "effective_status", operator: "IN", value: statuses }])
  );
  // 백필 시 필드가 많아 limit 줄임 + 페이지네이션
  const pageLimit = includeInactive ? 25 : 100;
  url.searchParams.set("limit", String(pageLimit));

  const allAds: Record<string, unknown>[] = [];
  let nextUrl: string | null = url.toString();

  while (nextUrl) {
    const res = await fetchMetaWithRetry(nextUrl, { signal: AbortSignal.timeout(60_000) });
    const data = await res.json();

    if (data.error) {
      throw new Error(`Meta API: ${data.error.message ?? "Unknown error"}`);
    }

    const ads: Record<string, unknown>[] = data.data ?? [];
    for (const ad of ads) {
      const insights = (ad.insights as { data?: unknown[] } | undefined)?.data;
      if (insights && insights.length > 0) {
        allAds.push(ad);
      }
    }

    // 다음 페이지
    nextUrl = data.paging?.next ?? null;
  }

  return allAds;
}

// ── 광고 데이터 → daily_ad_insights 행 변환 ──────────────────

export function buildInsightRows(
  ads: Record<string, unknown>[],
  accountId: string,
  accountName: string,
  dateStr: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Record<string, any>[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ads.map((ad: any) => {
    const insight = (ad.insights as { data: Record<string, unknown>[] }).data[0];
    const metrics = calculateMetrics(insight);
    const creativeType = getCreativeType(ad);

    return {
      date: dateStr,
      account_id: accountId,
      account_name: accountName,
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
}

// ── Supabase upsert ──────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function upsertInsights(svc: any, rows: Record<string, any>[]): Promise<number> {
  if (rows.length === 0) return 0;

  const { error } = await svc
    .from("daily_ad_insights")
    .upsert(rows, { onConflict: "account_id,date,ad_id" });

  if (error) throw new Error(`daily_ad_insights upsert error: ${error.message}`);
  return rows.length;
}
