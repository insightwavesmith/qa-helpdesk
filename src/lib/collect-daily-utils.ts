/**
 * ═══════════════════════════════════════════════════════════════
 * collect-daily-utils — 수집 공용 유틸리티
 * ═══════════════════════════════════════════════════════════════
 *
 * collect-daily/route.ts 및 protractor/collect/route.ts 양쪽에서
 * 공통으로 사용하는 유틸리티 함수 모음.
 *
 * 포함:
 *   - Meta API 필드 상수 (AD_FIELDS, INSIGHT_FIELDS)
 *   - 숫자 안전 변환 (safeFloat, safeInt, round)
 *   - Meta 액션 값 추출 (getActionValue, getVideoActionValue)
 *   - 랭킹 정규화 (normalizeRanking)
 *   - LP URL 추출 (extractLpUrl)
 *   - 지표 계산 (calculateMetrics)
 *   - Meta API 권한 체크 (checkMetaPermission)
 *   - Meta API 재시도 래퍼 (fetchMetaWithRetry)
 *   - Meta API 광고 조회 (fetchAccountAds)
 * ═══════════════════════════════════════════════════════════════
 */

// ── Meta API 필드 정의 (GCP 방식) ─────────────────────────────
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
export function safeFloat(v: unknown, def = 0): number {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}
export function safeInt(v: unknown, def = 0): number {
  if (v == null || v === "") return def;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}

export function round(v: number, d: number): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

export type Action = { action_type: string; value: string | number };

export function getActionValue(actions: Action[] | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? safeFloat(a.value) : 0;
}

export function getVideoActionValue(videoActions: { value: string | number }[] | undefined): number {
  if (!videoActions || videoActions.length === 0) return 0;
  return videoActions.reduce((sum, a) => sum + safeFloat(a.value), 0);
}

// Meta 랭킹 정규화 (GCP 방식)
export function normalizeRanking(raw: string | null | undefined): string {
  if (!raw) return "UNKNOWN";
  const u = raw.toUpperCase();
  if (u.includes("ABOVE")) return "ABOVE_AVERAGE";
  if (u.includes("BELOW")) return "BELOW_AVERAGE";
  if (u === "AVERAGE") return "AVERAGE";
  return "UNKNOWN";
}

// LP URL 추출 헬퍼 — 3단계 폴백 체인
// 1) object_story_spec.link_data.link
// 2) asset_feed_spec.link_urls / bodies
// 3) call_to_action.value.link
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractLpUrl(ad: Record<string, any>): string | null {
  const creative = ad.creative;
  if (!creative) return null;

  // 1) object_story_spec.link_data.link
  const oss = creative.object_story_spec;
  if (oss?.link_data?.link) return oss.link_data.link;
  if (oss?.video_data?.call_to_action?.value?.link) return oss.video_data.call_to_action.value.link;

  // 2) asset_feed_spec
  const afs = creative.asset_feed_spec;
  if (afs) {
    // link_urls 배열
    if (afs.link_urls?.length > 0) {
      const url = afs.link_urls[0]?.website_url || afs.link_urls[0];
      if (typeof url === "string" && url.startsWith("http")) return url;
    }
    // call_to_action_types + call_to_actions
    if (afs.call_to_actions?.length > 0) {
      const cta = afs.call_to_actions[0];
      if (cta?.value?.link) return cta.value.link;
    }
  }

  // 3) call_to_action.value.link (top-level)
  if (creative.call_to_action?.value?.link) return creative.call_to_action.value.link;

  return null;
}

// ── 지표 계산 (GCP 스펙 기준) ──────────────────────────────────
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

// ── Meta API 권한 사전 체크 ────────────────────────────────────
// 계정별로 API 접근 가능 여부를 확인하고, 권한 없는 계정은 마킹+스킵
export async function checkMetaPermission(
  accountId: string,
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const cleanId = accountId.replace(/^act_/, "");
    const res = await fetch(
      `https://graph.facebook.com/v21.0/act_${cleanId}?access_token=${token}&fields=name,account_status`,
      { signal: AbortSignal.timeout(10_000) },
    );
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = (body as any)?.error?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: msg };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Meta API 재시도 래퍼 ──────────────────────────────────────
export async function fetchMetaWithRetry(
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
        console.log(`[collect-daily] 429 Rate limited, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      if (!response.ok && attempt < maxRetries) {
        const waitMs = (attempt + 1) * 3000; // 3s, 6s
        console.log(`[collect-daily] API error ${response.status}, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }
      return response;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (attempt < maxRetries) {
        const waitMs = (attempt + 1) * 3000;
        console.log(`[collect-daily] Network error, retry ${attempt + 1} after ${waitMs}ms`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }
  throw lastError || new Error("Max retries exceeded");
}

// ── Meta Graph API 호출 (GCP 방식: /ads 엔드포인트) ───────────
// includeInactive=true: 백필용 — ACTIVE+PAUSED+ARCHIVED 광고 포함
export async function fetchAccountAds(
  accountId: string,
  targetDate?: string,
  includeInactive = false,
): Promise<Record<string, unknown>[]> {
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
