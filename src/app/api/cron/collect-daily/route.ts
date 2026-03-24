/**
 * ═══════════════════════════════════════════════════════════════
 * collect-daily — 원시 데이터 수집 (Meta API → DB + Storage)
 * ═══════════════════════════════════════════════════════════════
 *
 * 역할: Meta 광고 API에서 일일 성과 데이터를 수집하여 DB에 저장하는
 *       데이터 수집 파이프라인의 진입점.
 *
 * 소유 테이블 (이 크론이 UPSERT 하는 테이블):
 *   - daily_ad_insights   : 일별 광고 성과 지표 (spend, impressions, clicks, ROAS 등)
 *   - creatives           : 소재 마스터 (ad_id, creative_type, lp_id 등)
 *   - creative_media      : 소재 미디어 파일 (이미지/영상 URL, Storage 경로)
 *   - landing_pages       : LP 정규화 테이블 (canonical_url, domain, page_type)
 *
 * 하지 않는 것:
 *   - 임베딩 벡터 생성 (→ embed-creatives가 담당)
 *   - 5축 분석 실행 (→ embed-creatives가 트리거)
 *   - 벤치마크 계산 (→ collect-benchmarks가 담당)
 *
 * Vercel Cron: 매일 4회 배치 실행 (batch 1~4)
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import { runPrecomputeAll } from "@/lib/precompute";

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
  "creative.fields(object_type,product_set_id,video_id,image_hash,asset_feed_spec,object_story_spec)",
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

// LP URL 추출 헬퍼 — 3단계 폴백 체인
// 1) object_story_spec.link_data.link
// 2) asset_feed_spec.link_urls / bodies
// 3) call_to_action.value.link
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractLpUrl(ad: Record<string, any>): string | null {
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

// creative 필드 기반 분류 — 공용 모듈에서 import
import { getCreativeType } from "@/lib/protractor/creative-type";
import { extractCarouselCards } from "@/lib/protractor/carousel-cards";
import {
  fetchImageUrlsByHash,
  extractImageHashes,
  fetchVideoThumbnails,
  fetchVideoSourceUrls,
} from "@/lib/protractor/creative-image-fetcher";
import { embedMissingCreatives } from "@/lib/ad-creative-embedder";
import { normalizeUrl, classifyUrl } from "@/lib/lp-normalizer";

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

// ── Meta API 권한 사전 체크 ────────────────────────────────────
// 계정별로 API 접근 가능 여부를 확인하고, 권한 없는 계정은 마킹+스킵
async function checkMetaPermission(
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

  const res = await fetchMetaWithRetry(url.toString(), { signal: AbortSignal.timeout(60_000) });
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

// ── 수집 결과 타입 ──────────────────────────────────────────
export interface CollectDailyResult {
  message: string;
  date: string;
  accounts: number;
  share_to_video_fixed: number;
  results: Record<string, unknown>[];
  precompute?: Record<string, unknown> | null;
  pipeline?: Record<string, unknown> | null;
}

// ── 핵심 수집 로직 (크론 + 수동수집 공용) ───────────────────
export async function runCollectDaily(dateParam?: string, batch?: number, accountId?: string): Promise<CollectDailyResult> {
  const svc = createServiceClient();
  // 배치 번호가 있으면 cron_runs에 배치 이름으로 기록
  const cronName = batch ? `collect-daily-${batch}` : "collect-daily";
  const cronRunId = await startCronRun(cronName);

  // KST(UTC+9) 기준 어제 날짜
  const yesterday = dateParam ?? (() => {
    const now = new Date(Date.now() + 9 * 3600_000); // UTC → KST
    now.setDate(now.getDate() - 1); // 어제
    return now.toISOString().slice(0, 10);
  })();

  let hasPartialError = false;

  try {
    // 1. Supabase ad_accounts 테이블에서 등록된 활성 계정만 조회
    // created_at 정렬로 배치 분할 시 일관된 순서 보장
    const { data: adAccountRows, error: adAccountsErr } = await svc
      .from("ad_accounts")
      .select("account_id, account_name")
      .eq("active", true)
      .order("created_at");

    if (adAccountsErr) {
      throw new Error(`ad_accounts 조회 실패: ${adAccountsErr.message}`);
    }
    if (!adAccountRows || adAccountRows.length === 0) {
      return { message: "등록된 활성 계정 없음", date: yesterday, accounts: 0, share_to_video_fixed: 0, results: [] };
    }

    const accounts = adAccountRows.map((a) => ({
      account_id: a.account_id.replace(/^act_/, ""),
      account_name: a.account_name ?? "",
    }));

    // 단일 계정 필터 (테스트/디버깅용)
    let filteredAccounts = accounts;
    if (accountId) {
      filteredAccounts = accounts.filter((a) => a.account_id === accountId);
      console.log(`[collect-daily] account filter: ${accountId} → ${filteredAccounts.length}건`);
    } else if (batch != null && batch >= 1 && batch <= 4) {
      const BATCH_SIZE = 10;
      const offset = (batch - 1) * BATCH_SIZE;
      if (batch === 4) {
        // batch 4는 나머지 전부
        filteredAccounts = accounts.slice(offset);
      } else {
        filteredAccounts = accounts.slice(offset, offset + BATCH_SIZE);
      }
      console.log(`[collect-daily] batch ${batch}: ${filteredAccounts.length}건 (전체 ${accounts.length}건 중 offset=${offset})`);
    }

    // 후처리(임베딩, SHARE→VIDEO, 사전계산, pipeline)는 마지막 배치 또는 전체 실행 시에만
    const isLastBatch = batch == null || batch === 4;

    // ── Meta API 권한 사전 체크 ──
    // 각 계정에 대해 API 접근 가능 여부를 미리 확인하고,
    // 권한 없는 계정은 ad_accounts.meta_status='permission_denied'로 마킹 후 스킵
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) throw new Error("META_ACCESS_TOKEN not set");

    const permittedAccounts: typeof filteredAccounts = [];
    const deniedIds: string[] = [];

    for (const account of filteredAccounts) {
      // 숫자 ID가 아닌 더미 계정 스킵
      if (!/^\d+$/.test(account.account_id)) {
        console.log(`[collect-daily] 잘못된 account_id 스킵: ${account.account_id}`);
        deniedIds.push(account.account_id);
        continue;
      }

      const perm = await checkMetaPermission(account.account_id, token);
      if (perm.ok) {
        permittedAccounts.push(account);
      } else {
        console.log(`[collect-daily] 권한 없음 스킵: ${account.account_id} (${account.account_name}) — ${perm.error}`);
        deniedIds.push(account.account_id);
      }
    }

    // 권한 없는 계정 일괄 마킹
    if (deniedIds.length > 0) {
      await svc
        .from("ad_accounts")
        .update({ meta_status: "permission_denied", updated_at: new Date().toISOString() })
        .in("account_id", deniedIds);
      console.log(`[collect-daily] ${deniedIds.length}개 계정 permission_denied 마킹`);
    }

    // 권한 있는 계정 중 이전에 denied였던 것은 상태 복구
    const permittedIds = permittedAccounts.map((a) => a.account_id);
    if (permittedIds.length > 0) {
      await svc
        .from("ad_accounts")
        .update({ meta_status: "ok", updated_at: new Date().toISOString() })
        .in("account_id", permittedIds)
        .eq("meta_status", "permission_denied");
    }

    console.log(`[collect-daily] 권한 체크 완료: ${permittedAccounts.length}개 허용, ${deniedIds.length}개 거부`);

    const results: Record<string, unknown>[] = [];

    for (const account of permittedAccounts) {
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
              // raw JSONB — Meta API 응답 원본 저장
              raw_insight: insight,
              raw_ad: { id: ad.id, name: ad.name, creative: ad.creative, campaign_id: ad.campaign_id, campaign_name: ad.campaign_name, adset_id: ad.adset_id, adset_name: ad.adset_name },
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

          // ── 소재 이미지/썸네일 URL 수집 ──
          const imageHashes = extractImageHashes(ads);
          const hashToUrl = imageHashes.length > 0
            ? await fetchImageUrlsByHash(account.account_id, imageHashes)
            : new Map<string, string>();

          // 동영상 썸네일 수집
          const videoIds = [...new Set(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ads.map((ad: any) => ad.creative?.video_id as string | undefined)
              .filter((id): id is string => typeof id === "string")
          )];
          const videoThumbMap = videoIds.length > 0
            ? await fetchVideoThumbnails(videoIds)
            : new Map<string, string>();

          if (videoThumbMap.size > 0) {
            console.log(`[collect-daily] video thumbnails: ${videoThumbMap.size}/${videoIds.length}건`);
          }

          // ── 정규화 테이블 UPSERT (landing_pages → creatives → creative_media) ──
          try {
            // Step 1: LP URL 수집 + 정규화 + landing_pages UPSERT
            const lpUrlMap = new Map<string, { canonical: string; hostname: string; account_id: string }>();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            for (const ad of ads as any[]) {
              const rawLpUrl = extractLpUrl(ad);
              if (!rawLpUrl) continue;
              const norm = normalizeUrl(rawLpUrl);
              if (!norm) continue;
              lpUrlMap.set(norm.canonical, { ...norm, account_id: account.account_id });
            }

            let canonicalToLpId = new Map<string, string>();

            if (lpUrlMap.size > 0) {
              const lpRows = Array.from(lpUrlMap.values()).map((lp) => {
                const { page_type, platform } = classifyUrl(lp.canonical, lp.hostname);
                return {
                  account_id: lp.account_id,
                  canonical_url: lp.canonical,
                  domain: lp.hostname,
                  page_type,
                  platform,
                  is_active: true,
                  updated_at: new Date().toISOString(),
                };
              });
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: lpErr } = await (svc as any)
                .from("landing_pages")
                .upsert(lpRows, { onConflict: "canonical_url" });
              if (lpErr) {
                console.error(`[collect-daily] v2 landing_pages upsert error [${account.account_id}]:`, lpErr);
              } else {
                console.log(`[collect-daily] v2 landing_pages: ${lpRows.length}건 upserted`);
              }

              // canonical_url → lp_id 매핑 조회
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: lpIdData } = await (svc as any)
                .from("landing_pages")
                .select("id, canonical_url")
                .in("canonical_url", Array.from(lpUrlMap.keys()));

              canonicalToLpId = new Map<string, string>(
                (lpIdData ?? []).map((lp: { canonical_url: string; id: string }) => [lp.canonical_url, lp.id])
              );
            }

            // Step 2: creatives UPSERT (lp_id FK 포함, LP 없으면 null)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const v2CreativeRows = (ads as any[]).map((ad: any) => {
              const adId = (ad.ad_id ?? ad.id) as string;
              if (!adId) return null;
              const creativeType = getCreativeType(ad);
              const rawLpUrl = extractLpUrl(ad);
              let lpId: string | null = null;
              if (rawLpUrl) {
                const norm = normalizeUrl(rawLpUrl);
                if (norm) lpId = canonicalToLpId.get(norm.canonical) ?? null;
              }
              return {
                ad_id: adId,
                account_id: account.account_id,
                creative_type: creativeType,
                source: "member",
                is_member: true,
                brand_name: account.account_name || null,
                is_active: true,
                lp_url: rawLpUrl || null,
                lp_id: lpId,
                updated_at: new Date().toISOString(),
                raw_creative: ad.creative || null,
              };
            }).filter(Boolean);

            if (v2CreativeRows.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { error: v2CreativeErr } = await (svc as any)
                .from("creatives")
                .upsert(v2CreativeRows, { onConflict: "ad_id" });
              if (v2CreativeErr) {
                console.error(`[collect-daily] v2 creatives upsert error [${account.account_id}]:`, v2CreativeErr);
              } else {
                console.log(`[collect-daily] v2 creatives: ${v2CreativeRows.length}건 upserted`);
              }
            }

            // Step 3: creative_media UPSERT (media_url 있는 건만)
            if (v2CreativeRows.length > 0) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const adIds = v2CreativeRows.map((r: any) => r.ad_id as string);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: creativeIdData } = await (svc as any)
                .from("creatives")
                .select("id, ad_id")
                .in("ad_id", adIds);

              const adIdToCreativeId = new Map<string, string>(
                (creativeIdData ?? []).map((c: { ad_id: string; id: string }) => [c.ad_id, c.id])
              );

              // 기존 creative_media에서 storage_url 조회 (이미 다운로드된 미디어)
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const { data: existingMedia } = await (svc as any)
                .from("creative_media")
                .select("creative_id, storage_url")
                .in("creative_id", Array.from(adIdToCreativeId.values()))
                .not("storage_url", "is", null);
              const creativeIdToStorageUrl = new Map<string, string>(
                (existingMedia ?? []).map((r: { creative_id: string; storage_url: string }) => [r.creative_id, r.storage_url])
              );

              const mediaRows: Record<string, unknown>[] = [];
              for (const ad of ads as any[]) {
                const adId = (ad.ad_id ?? ad.id) as string;
                const creativeId = adIdToCreativeId.get(adId);
                if (!creativeId) continue;

                const creative = ad.creative;
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const creativeType = getCreativeType(ad as any);

                if (creativeType === "CAROUSEL") {
                  // CAROUSEL: 카드별 N행 생성
                  const cards = extractCarouselCards(ad as Record<string, unknown>);
                  if (cards.length > 0) {
                    for (const card of cards) {
                      const cardMediaUrl = (() => {
                        if (card.imageHash && hashToUrl.has(card.imageHash)) return hashToUrl.get(card.imageHash)!;
                        if (card.imageUrl) return card.imageUrl;
                        if (card.videoId && videoThumbMap.has(card.videoId)) return videoThumbMap.get(card.videoId)!;
                        return null;
                      })();

                      mediaRows.push({
                        creative_id: creativeId,
                        media_type: card.videoId ? "VIDEO" : "IMAGE",
                        media_url: cardMediaUrl,
                        media_hash: card.imageHash || null,
                        storage_url: creativeIdToStorageUrl.get(creativeId) || null,
                        raw_creative: creative || null,
                        position: card.position,
                        card_total: cards.length,
                      });
                    }
                  } else {
                    // fallback: 카드 추출 실패 시 단일 미디어
                    const imageHash = creative?.image_hash;
                    const videoId = creative?.video_id;
                    const mediaUrl = imageHash && hashToUrl.has(imageHash) ? hashToUrl.get(imageHash)!
                      : videoId && videoThumbMap.has(videoId) ? videoThumbMap.get(videoId)!
                      : null;
                    if (mediaUrl) {
                      mediaRows.push({
                        creative_id: creativeId,
                        media_type: videoId ? "VIDEO" : "IMAGE",
                        media_url: mediaUrl,
                        media_hash: imageHash || null,
                        storage_url: creativeIdToStorageUrl.get(creativeId) || null,
                        raw_creative: creative || null,
                        position: 0,
                        card_total: 1,
                      });
                    }
                  }
                } else {
                  // IMAGE/VIDEO: 기존대로 position=0
                  const imageHash = creative?.image_hash;
                  const videoId = creative?.video_id;
                  const mediaUrl = (() => {
                    if (imageHash && hashToUrl.has(imageHash)) return hashToUrl.get(imageHash)!;
                    if (videoId && videoThumbMap.has(videoId)) return videoThumbMap.get(videoId)!;
                    const afsImages = creative?.asset_feed_spec?.images;
                    if (afsImages && Array.isArray(afsImages)) {
                      for (const img of afsImages) {
                        if (img.hash && hashToUrl.has(img.hash)) return hashToUrl.get(img.hash)!;
                      }
                    }
                    return null;
                  })();
                  if (!mediaUrl) continue;

                  mediaRows.push({
                    creative_id: creativeId,
                    media_type: videoId ? "VIDEO" : "IMAGE",
                    media_url: mediaUrl,
                    media_hash: imageHash || null,
                    storage_url: creativeIdToStorageUrl.get(creativeId) || null,
                    raw_creative: creative || null,
                    position: 0,
                    card_total: 1,
                  });
                }
              }

              if (mediaRows.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const { error: mediaErr } = await (svc as any)
                  .from("creative_media")
                  .upsert(mediaRows, { onConflict: "creative_id,position" });
                if (mediaErr) {
                  console.error(`[collect-daily] v2 creative_media upsert error [${account.account_id}]:`, mediaErr);
                } else {
                  console.log(`[collect-daily] v2 creative_media: ${mediaRows.length}건 upserted`);
                }
              }

              // ── mp4 즉시 다운로드 (VIDEO 타입, storage_url 없는 건만) ──
              try {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const videoMediaRows = (mediaRows as any[]).filter(
                  (r) => r && r.media_type === "VIDEO" && !r.storage_url
                );
                if (videoMediaRows.length > 0 && videoIds.length > 0) {
                  const videoSourceMap = await fetchVideoSourceUrls(videoIds);
                  let mp4Downloaded = 0;
                  for (const [videoId, sourceUrl] of videoSourceMap.entries()) {
                    try {
                      // video_id → ad_id 매핑
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const matchingAd = (ads as any[]).find(
                        (ad) => ad.creative?.video_id === videoId
                      );
                      if (!matchingAd) continue;
                      const adId = (matchingAd.ad_id ?? matchingAd.id) as string;

                      // mp4 다운로드
                      const mp4Res = await fetch(sourceUrl);
                      if (!mp4Res.ok) continue;
                      const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());

                      // Storage 업로드: creatives/{account_id}/media/{ad_id}.mp4
                      const storagePath = `creatives/${account.account_id}/media/${adId}.mp4`;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const { error: uploadErr } = await (svc as any).storage
                        .from("creatives")
                        .upload(storagePath, mp4Buffer, {
                          contentType: "video/mp4",
                          upsert: true,
                        });

                      if (!uploadErr) {
                        // creative_media.storage_url 업데이트 (mp4 영구 경로)
                        const creativeId = adIdToCreativeId.get(adId);
                        if (creativeId) {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          await (svc as any)
                            .from("creative_media")
                            .update({ storage_url: storagePath })
                            .eq("creative_id", creativeId);
                        }
                        mp4Downloaded++;
                      }
                    } catch {
                      // mp4 개별 실패는 무시 (다음 크론에서 재시도)
                    }
                  }
                  if (mp4Downloaded > 0) {
                    console.log(`[collect-daily] mp4 다운로드: ${mp4Downloaded}건 [${account.account_id}]`);
                  }
                }
              } catch (mp4Err) {
                console.error(`[collect-daily] mp4 다운로드 실패 (비치명적) [${account.account_id}]:`, mp4Err);
              }
            }
          } catch (v2Err) {
            console.error(`[collect-daily] v2 UPSERT 실패 (기존 로직 영향 없음) [${account.account_id}]:`, v2Err);
          }
        }
      } catch (e) {
        accountResult.meta_error = e instanceof Error ? e.message : String(e);
        console.error(`Meta error [${account.account_id}]:`, e);
        hasPartialError = true;
      }

      results.push(accountResult);
    }

    const totalRecords = results.reduce((sum, r) => sum + (typeof r.meta_ads === "number" ? r.meta_ads : 0), 0);

    // 후처리는 마지막 배치(batch 4) 또는 배치 없이 전체 실행할 때만 수행
    let shareFixed: { ad_id: string | null }[] | null = null;
    let precomputeResult: Record<string, unknown> | null = null;
    let pipelineResult: Record<string, unknown> | null = null;

    if (isLastBatch) {
      // ── 임베딩 없는 소재 보충 (배치 50개, 500ms 딜레이) ──
      try {
        const embedResult = await embedMissingCreatives(50, 500);
        console.log(`[collect-daily] embedMissingCreatives: processed=${embedResult.processed}, embedded=${embedResult.embedded}, errors=${embedResult.errors}`);
      } catch (err) {
        console.error("[collect-daily] embedMissingCreatives failed:", err);
      }

      // 기존 SHARE → VIDEO 일괄 수정 (이전 버전 코드로 수집된 데이터 보정)
      const { data: shareData, error: shareFixErr } = await svc
        .from("daily_ad_insights")
        .update({ creative_type: "VIDEO" })
        .eq("creative_type", "SHARE")
        .select("ad_id");

      shareFixed = shareData;

      if (shareFixErr) {
        console.error("[collect-daily] SHARE→VIDEO 일괄 수정 실패:", shareFixErr);
      } else if (shareFixed && shareFixed.length > 0) {
        console.log(`[collect-daily] SHARE→VIDEO 일괄 수정: ${shareFixed.length}건`);
      }

      // ── 사전계산 실행 (실패해도 크론 결과에 영향 없음) ──
      try {
        precomputeResult = await runPrecomputeAll(svc) as unknown as Record<string, unknown>;
      } catch (e) {
        console.error("[collect-daily] 사전계산 실패 (크론 결과 영향 없음):", e);
      }

      // ── Creative Pipeline 호출 (실패해도 크론 결과에 영향 없음) ──
      try {
        const pipelineUrl = process.env.CREATIVE_PIPELINE_URL;
        const pipelineSecret = process.env.CREATIVE_PIPELINE_SECRET;
        if (pipelineUrl) {
          const pipelineRes = await fetch(`${pipelineUrl}/pipeline`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-SECRET': pipelineSecret || '',
            },
            body: JSON.stringify({}),
            signal: AbortSignal.timeout(300_000),
          });
          pipelineResult = await pipelineRes.json();
          console.log('[collect-daily] creative pipeline 완료:', JSON.stringify(pipelineResult).slice(0, 200));
        }
      } catch (e) {
        console.error('[collect-daily] creative pipeline 호출 실패 (크론 결과 영향 없음):', e);
      }
    }

    await completeCronRun(
      cronRunId,
      hasPartialError ? "partial" : "success",
      totalRecords,
      hasPartialError ? "일부 계정 실패" : undefined
    );

    return {
      message: "collect-daily completed",
      date: yesterday,
      accounts: filteredAccounts.length,
      share_to_video_fixed: shareFixed?.length ?? 0,
      results,
      precompute: precomputeResult,
      pipeline: pipelineResult,
    };
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : typeof e === "object" && e && "message" in e ? (e as { message: string }).message : "Unknown error";
    console.error("collect-daily fatal error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    throw new Error(errorMessage);
  }
}

// ── GET /api/cron/collect-daily ──────────────────────────────
// Vercel Cron: 매일 18:00 UTC (KST 다음날 03:00)
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") ?? undefined;
  // 수동 호출 시 batch 파라미터로 특정 배치만 실행 가능 (예: ?batch=2)
  const batchParam = searchParams.get("batch");
  const batch = batchParam ? parseInt(batchParam, 10) : undefined;

  try {
    const result = await runCollectDaily(dateParam, batch);
    return NextResponse.json(result);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
