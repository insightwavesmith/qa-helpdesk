/**
 * collect-benchmarks — GCP 방식 벤치마크 수집 (전면 재작성)
 * Vercel Cron: 매주 월요일 17:00 UTC (KST 화요일 02:00)
 *
 * STEP 1: Meta API로 활성 계정의 광고 원본 수집 → ad_insights_classified UPSERT
 * STEP 2: creative_type × ranking_type × ranking_group별 평균 계산 → benchmarks UPSERT
 * STEP 3: MEDIAN_ALL (랭킹 무관 전체 평균) → benchmarks UPSERT
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

// ── Vercel Cron 인증 ─────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// 제외 광고계정 ID 목록 (act_ 접두사 없이)
const EXCLUDED_ACCOUNTS: string[] = [];

// 최종 13개 지표 키
// reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
const METRIC_KEYS = [
  "video_p3s_rate",
  "thruplay_rate",
  "retention_rate",
  "reactions_per_10k",
  "comments_per_10k",
  "shares_per_10k",
  "saves_per_10k",
  "engagement_per_10k",
  "ctr",
  "click_to_checkout_rate",
  "click_to_purchase_rate",
  "checkout_to_purchase_rate",
  "reach_to_purchase_rate",
  "roas",
] as const;

type MetricKey = (typeof METRIC_KEYS)[number];

interface ClassifiedAd {
  ad_id: string;
  ad_name: string | null;
  account_id: string;
  creative_type: string;
  quality_ranking: string;
  engagement_ranking: string;
  conversion_ranking: string;
  impressions: number;
  clicks: number;
  spend: number;
  reach: number;
  video_p3s_rate: number | null;
  thruplay_rate: number | null;
  retention_rate: number | null;
  reactions_per_10k: number | null;
  comments_per_10k: number | null;
  shares_per_10k: number | null;
  saves_per_10k: number | null;
  engagement_per_10k: number | null;
  ctr: number | null;
  click_to_checkout_rate: number | null;
  click_to_purchase_rate: number | null;
  checkout_to_purchase_rate: number | null;
  // reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
  reach_to_purchase_rate: number | null;
  roas: number | null;
  collected_at: string;
}

// ── 유틸리티 ─────────────────────────────────────────────────

function round(v: number, d: number): number {
  const m = 10 ** d;
  return Math.round(v * m) / m;
}

function safeFloat(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type MetaAction = { action_type: string; value: string | number };

function getActionValue(actions: MetaAction[] | undefined, type: string): number {
  if (!actions) return 0;
  const a = actions.find((x) => x.action_type === type);
  return a ? safeFloat(a.value) : 0;
}

function getVideoActionValue(videoActions: { value: string | number }[] | undefined): number {
  if (!videoActions || videoActions.length === 0) return 0;
  return videoActions.reduce((sum, a) => sum + safeFloat(a.value), 0);
}

// Meta 랭킹 값 정규화 → ABOVE_AVERAGE / AVERAGE / BELOW_AVERAGE / UNKNOWN
function normalizeRanking(raw: string | undefined | null): string {
  if (!raw) return "UNKNOWN";
  const u = raw.toUpperCase().replace(/-/g, "_");
  if (u.includes("ABOVE")) return "ABOVE_AVERAGE";
  if (u.includes("BELOW")) return "BELOW_AVERAGE";
  if (u === "AVERAGE") return "AVERAGE";
  return "UNKNOWN";
}

// ── GCP 방식 /ads 엔드포인트 필드 ─────────────────────────────
// AD_FIELDS: id, name, adset_id, creative.fields(object_type,product_set_id)
const AD_FIELDS = [
  "id",
  "name",
  "adset_id",
  "creative.fields(object_type,product_set_id)",
].join(",");

// INSIGHT_FIELDS: nested insights 안에 들어갈 지표 필드
const INSIGHT_FIELDS = [
  "impressions",
  "clicks",
  "spend",
  "reach",
  "ctr",
  "actions",
  "action_values",
  "video_thruplay_watched_actions",
  "video_p100_watched_actions",
  "quality_ranking",
  "engagement_rate_ranking",
  "conversion_rate_ranking",
].join(",");

// creative.object_type + product_set_id → creative_type (GCP 방식)
// VIDEO = object_type VIDEO | PRIVACY_CHECK_FAIL
// CATALOG = object_type SHARE 또는 (IMAGE + product_set_id 존재)
// IMAGE = 나머지
function getCreativeType(ad: Record<string, unknown>): string {
  const creative = ad.creative as { object_type?: string; product_set_id?: string } | undefined;
  const objectType = creative?.object_type ?? "UNKNOWN";
  const productSetId = creative?.product_set_id;

  if (objectType === "VIDEO" || objectType === "PRIVACY_CHECK_FAIL") return "VIDEO";
  if (objectType === "SHARE") return "CATALOG";
  if (objectType === "IMAGE" && productSetId) return "CATALOG";
  if (objectType === "IMAGE") return "IMAGE";
  return "IMAGE"; // fallback
}

// 광고 인사이트 → 13개 지표 계산 (GCP 스펙 기준)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function calculateMetrics(insight: Record<string, any>, accountId: string, collectedAt: string, creativeType: string): ClassifiedAd | null {
  const impressions = Math.trunc(safeFloat(insight.impressions));
  if (impressions < 3500) return null; // 최소 노출 필터

  const clicks = Math.trunc(safeFloat(insight.clicks));
  const spend = safeFloat(insight.spend);
  const reach = Math.trunc(safeFloat(insight.reach));

  const actions: MetaAction[] = insight.actions ?? [];
  const actionValues: MetaAction[] = insight.action_values ?? [];

  const initiateCheckout =
    getActionValue(actions, "initiate_checkout") ||
    getActionValue(actions, "omni_initiated_checkout");
  const purchases =
    getActionValue(actions, "purchase") ||
    getActionValue(actions, "omni_purchase");
  const purchaseValue =
    getActionValue(actionValues, "purchase") ||
    getActionValue(actionValues, "omni_purchase");
  const reactions =
    getActionValue(actions, "post_reaction") || getActionValue(actions, "like");
  const comments = getActionValue(actions, "comment");
  const shares = getActionValue(actions, "post");
  const saves = getActionValue(actions, "onsite_conversion.post_save");

  const videoP3s = getActionValue(actions, "video_view");
  const thruplay = getVideoActionValue(insight.video_thruplay_watched_actions);
  const videoP100 = getVideoActionValue(insight.video_p100_watched_actions);

  const ctr = safeFloat(insight.ctr);
  const roas = spend > 0 ? purchaseValue / spend : 0;

  return {
    ad_id: insight.ad_id as string,
    ad_name: (insight.ad_name as string) ?? null,
    account_id: accountId,
    creative_type: creativeType,
    quality_ranking: normalizeRanking(insight.quality_ranking),
    engagement_ranking: normalizeRanking(insight.engagement_rate_ranking),
    conversion_ranking: normalizeRanking(insight.conversion_rate_ranking),
    impressions,
    clicks,
    spend: round(spend, 2),
    reach,
    // 13개 지표 — GCP 스펙: video_p3s_rate 분모 = impressions (collect-daily와 상이)
    video_p3s_rate: impressions > 0 ? round((videoP3s / impressions) * 100, 4) : null,
    thruplay_rate: impressions > 0 ? round((thruplay / impressions) * 100, 4) : null,
    retention_rate: videoP3s > 0 ? round((videoP100 / videoP3s) * 100, 4) : null,
    reactions_per_10k: impressions > 0 ? round((reactions / impressions) * 10000, 2) : null,
    comments_per_10k: impressions > 0 ? round((comments / impressions) * 10000, 2) : null,
    shares_per_10k: impressions > 0 ? round((shares / impressions) * 10000, 2) : null,
    saves_per_10k: impressions > 0 ? round((saves / impressions) * 10000, 2) : null,
    engagement_per_10k:
      impressions > 0
        ? round(((reactions + comments + shares + saves) / impressions) * 10000, 2)
        : null,
    ctr: round(ctr, 4),
    click_to_checkout_rate: clicks > 0 ? round((initiateCheckout / clicks) * 100, 4) : null,
    click_to_purchase_rate: clicks > 0 ? round((purchases / clicks) * 100, 4) : null,
    checkout_to_purchase_rate:
      initiateCheckout > 0 ? round((purchases / initiateCheckout) * 100, 4) : null,
    // reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
    reach_to_purchase_rate: impressions > 0 ? round((purchases / impressions) * 100, 6) : null,
    roas: round(roas, 4),
    collected_at: collectedAt,
  };
}

// 해당 주의 월요일 날짜 (ISO: YYYY-MM-DD)
function getMondayOfWeek(d: Date = new Date()): string {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

// 429 exponential backoff fetch
async function fetchWithRetry(url: string, maxRetries = 3): Promise<Response> {
  for (let i = 0; i < maxRetries; i++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (res.status !== 429) return res;
    const delay = 1000 * Math.pow(2, i);
    console.warn(`Rate limited (429), retry ${i + 1} after ${delay}ms`);
    await new Promise((r) => setTimeout(r, delay));
  }
  return fetch(url, { signal: AbortSignal.timeout(60_000) });
}

// 그룹 평균 계산: 13개 지표의 양수값만 평균
function calcGroupAvg(
  ads: ClassifiedAd[],
  extra: Record<string, unknown>
): Record<string, unknown> {
  const row: Record<string, unknown> = { ...extra };

  for (const key of METRIC_KEYS) {
    const values = ads
      .map((a) => a[key as MetricKey])
      .filter((v): v is number => v != null && Number.isFinite(v) && v > 0);
    row[key] = values.length > 0
      ? round(values.reduce((s, v) => s + v, 0) / values.length, 4)
      : null;
  }

  return row;
}

export const maxDuration = 300; // 5분 (Vercel Pro 최대)

// ── GET /api/cron/collect-benchmarks ─────────────────────────
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    return NextResponse.json({ error: "META_ACCESS_TOKEN not set" }, { status: 500 });
  }

  const svc = createServiceClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anySvc = svc as any;
  const collectedAt = new Date().toISOString();
  const cronRunId = await startCronRun("collect-benchmarks");

  try {
    // ────────────────────────────────────────────────────────
    // STEP 1-1: 전체 활성 광고계정 조회
    // ────────────────────────────────────────────────────────
    const accountsUrl = new URL("https://graph.facebook.com/v21.0/me/adaccounts");
    accountsUrl.searchParams.set("access_token", token);
    accountsUrl.searchParams.set("fields", "account_id,name,account_status");
    accountsUrl.searchParams.set("limit", "500");

    const accountsRes = await fetchWithRetry(accountsUrl.toString());
    const accountsJson = await accountsRes.json();

    if (!accountsJson.data || accountsJson.data.length === 0) {
      return NextResponse.json({ message: "No ad accounts found" });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activeAccounts: { cleanId: string; name: string }[] = accountsJson.data
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .filter((a: any) => {
        const cleanId = (a.account_id as string).replace(/^act_/, "");
        return Number(a.account_status) === 1 && !EXCLUDED_ACCOUNTS.includes(cleanId);
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((a: any) => ({
        cleanId: (a.account_id as string).replace(/^act_/, ""),
        name: a.name as string,
      }));

    if (activeAccounts.length === 0) {
      return NextResponse.json({ message: "No active ad accounts after filtering" });
    }

    // ────────────────────────────────────────────────────────
    // STEP 1-2: 계정별 /ads 엔드포인트 + nested insights 수집 (GCP 방식)
    //   AD_FIELDS + insights.date_preset(last_7d){INSIGHT_FIELDS}
    //   → creative.object_type + product_set_id로 정확한 creative_type 판별
    // ────────────────────────────────────────────────────────
    const insightSpec = `insights.date_preset(last_7d){${INSIGHT_FIELDS}}`;
    const adsFields = `${AD_FIELDS},${insightSpec}`;

    const allClassified: ClassifiedAd[] = [];
    let accountsProcessed = 0;

    for (const account of activeAccounts) {
      // Rate limit: 200ms per account
      await new Promise((r) => setTimeout(r, 200));

      try {
        const adsUrl = new URL(
          `https://graph.facebook.com/v21.0/act_${account.cleanId}/ads`
        );
        adsUrl.searchParams.set("access_token", token);
        adsUrl.searchParams.set("fields", adsFields);
        adsUrl.searchParams.set("limit", "500");
        adsUrl.searchParams.set(
          "filtering",
          JSON.stringify([
            { field: "effective_status", operator: "IN", value: ["ACTIVE"] },
          ])
        );

        const adsRes = await fetchWithRetry(adsUrl.toString());
        const adsJson = await adsRes.json();

        if (adsJson.error) {
          console.error(`[${account.cleanId}] Meta API error:`, adsJson.error.message);
          continue;
        }

        const rawAds: Record<string, unknown>[] = adsJson.data ?? [];

        // insights가 있는 광고만 필터 + spend 기준 상위 10개
        const adsWithInsights = rawAds
          .filter((ad) => {
            const ins = ad.insights as { data?: unknown[] } | undefined;
            return ins?.data && ins.data.length > 0;
          })
          .sort((a, b) => {
            const insA = (a.insights as { data: Record<string, unknown>[] }).data[0];
            const insB = (b.insights as { data: Record<string, unknown>[] }).data[0];
            return safeFloat(insB.spend) - safeFloat(insA.spend);
          })
          .slice(0, 10);

        for (const ad of adsWithInsights) {
          const insight = (ad.insights as { data: Record<string, unknown>[] }).data[0];
          // ad 최상위에서 ad_id/ad_name 가져오기 (nested insights에는 없을 수 있음)
          const enrichedInsight = {
            ...insight,
            ad_id: insight.ad_id ?? ad.id,
            ad_name: insight.ad_name ?? ad.name,
          };
          const creativeType = getCreativeType(ad);
          const row = calculateMetrics(
            enrichedInsight,
            account.cleanId,
            collectedAt,
            creativeType,
          );
          if (row) allClassified.push(row);
        }

        accountsProcessed++;
      } catch (e) {
        console.error(`[${account.cleanId}] fetch error:`, e instanceof Error ? e.message : e);
      }
    }

    if (allClassified.length === 0) {
      return NextResponse.json({
        message: "No ads collected (all impressions < 3500 or no active ads)",
        accounts_checked: activeAccounts.length,
      });
    }

    // ────────────────────────────────────────────────────────
    // STEP 1-5: ad_insights_classified 전체 교체 (DELETE → INSERT)
    // ────────────────────────────────────────────────────────
    const { error: deleteAicErr } = await anySvc
      .from("ad_insights_classified")
      .delete()
      .not("id", "is", null);

    if (deleteAicErr) {
      console.error("ad_insights_classified delete error:", deleteAicErr);
      // non-fatal: continue with insert
    }

    const { error: insertAicErr } = await anySvc
      .from("ad_insights_classified")
      .insert(allClassified);

    if (insertAicErr) {
      console.error("ad_insights_classified insert error:", insertAicErr);
      throw insertAicErr;
    }

    // ────────────────────────────────────────────────────────
    // STEP 2: 벤치마크 계산 — creative_type × ranking_type × ranking_group
    // ────────────────────────────────────────────────────────
    const creativeTypes = ["VIDEO", "IMAGE", "CATALOG"] as const;
    const rankingTypes = ["quality", "engagement", "conversion"] as const;
    const rankingGroups = ["ABOVE_AVERAGE", "AVERAGE", "BELOW_AVERAGE"] as const;

    const benchmarkRows: Record<string, unknown>[] = [];
    const weekDate = getMondayOfWeek(); // A4: 해당 주의 월요일

    for (const ct of creativeTypes) {
      for (const rankingType of rankingTypes) {
        const rankingKey = `${rankingType}_ranking` as keyof ClassifiedAd;
        for (const rankingGroup of rankingGroups) {
          const filtered = allClassified.filter(
            (r) => r.creative_type === ct && r[rankingKey] === rankingGroup
          );
          if (filtered.length === 0) continue;

          benchmarkRows.push(
            calcGroupAvg(filtered, {
              creative_type: ct,
              ranking_type: rankingType,
              ranking_group: rankingGroup,
              sample_count: filtered.length,
              calculated_at: collectedAt,
              date: weekDate,
            })
          );
        }
      }
    }

    // ────────────────────────────────────────────────────────
    // STEP 3: MEDIAN_ALL — 랭킹 무관 전체 평균
    // ────────────────────────────────────────────────────────
    const medianRankingTypes = ["engagement", "conversion"] as const;
    for (const ct of creativeTypes) {
      const ctAds = allClassified.filter((r) => r.creative_type === ct);
      if (ctAds.length === 0) continue;

      for (const rankingType of medianRankingTypes) {
        benchmarkRows.push(
          calcGroupAvg(ctAds, {
            creative_type: ct,
            ranking_type: rankingType,
            ranking_group: "MEDIAN_ALL",
            sample_count: ctAds.length,
            calculated_at: collectedAt,
            date: weekDate,
          })
        );
      }
    }

    // ────────────────────────────────────────────────────────
    // benchmarks 테이블 UPSERT (A4: 이력 보존)
    // ────────────────────────────────────────────────────────
    if (benchmarkRows.length > 0) {
      const { error: insertBenchErr } = await anySvc
        .from("benchmarks")
        .upsert(benchmarkRows, {
          onConflict: "creative_type,ranking_type,ranking_group,date",
        });

      if (insertBenchErr) {
        console.error("benchmarks insert error:", insertBenchErr);
        throw insertBenchErr;
      }
    }

    await completeCronRun(cronRunId, "success", allClassified.length);

    return NextResponse.json({
      message: "collect-benchmarks (GCP 방식) 완료",
      accounts_active: activeAccounts.length,
      accounts_processed: accountsProcessed,
      ads_classified: allClassified.length,
      benchmarks_saved: benchmarkRows.length,
      creative_type_breakdown: {
        VIDEO: allClassified.filter((r) => r.creative_type === "VIDEO").length,
        IMAGE: allClassified.filter((r) => r.creative_type === "IMAGE").length,
        CATALOG: allClassified.filter((r) => r.creative_type === "CATALOG").length,
      },
      collected_at: collectedAt,
    });
  } catch (e) {
    const errorMessage = e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? (e as { message: string }).message
        : "Unknown error";
    console.error("collect-benchmarks error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}
