/**
 * GET /api/protractor/creative-detail?id={creative_media_id}
 * 개별 소재 풀분석 데이터 조회
 * 설계서: docs/02-design/features/creative-analysis-v2.design.md 섹션 2.3
 */

import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";
import type { AnalysisJsonV3 } from "@/types/prescription";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 1. 인증 + 역할 확인
  const auth = await requireProtractorAccess();
  if ("response" in auth) return auth.response;
  const { svc } = auth;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { error: "id 파라미터가 필요합니다" },
      { status: 400 },
    );
  }

  // 2. creative_media 조회
  const { data: media, error: mediaErr } = await svc
    .from("creative_media")
    .select(
      "id, creative_id, media_url, storage_url, ad_copy, media_type, analysis_json, saliency_url, video_analysis, thumbnail_url, duration_seconds",
    )
    .eq("id", id)
    .single();

  if (mediaErr || !media) {
    return NextResponse.json(
      { error: "소재를 찾을 수 없습니다" },
      { status: 404 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const m = media as any;

  // 3. creatives에서 ad_id, account_id 조회
  const { data: creative } = await svc
    .from("creatives")
    .select("ad_id, account_id, category")
    .eq("id", m.creative_id)
    .single();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = creative as any;
  const adId: string | null = c?.ad_id ?? null;
  const accountId: string | null = c?.account_id ?? null;

  // 4. creative_saliency 조회 (ad_id 기준)
  let saliency = null;
  if (adId) {
    const { data: salData } = await svc
      .from("creative_saliency")
      .select(
        "attention_map_url, top_fixations, cta_attention_score, cognitive_load",
      )
      .eq("ad_id", adId)
      .single();
    saliency = salData;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sal = saliency as any;

  // 5. daily_ad_insights 성과 집계 (최근 7일, ad_id 기준)
  let performance: {
    impressions: number;
    reach: number;
    spend: number;
    ctr: number;
    cpc: number;
    roas: number;
    video_p3s_rate: number | null;
    video_thruplay_rate: number | null;
    video_p25_rate: number | null;
    video_p50_rate: number | null;
    video_p75_rate: number | null;
    video_p100_rate: number | null;
    shares_per_10k: number | null;
    saves_per_10k: number | null;
    purchase_count: number;
    reach_to_purchase_rate: number;
  } | null = null;

  if (adId) {
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - 7);
    const sinceDateStr = sinceDate.toISOString().split("T")[0];

    const { data: insights } = await svc
      .from("daily_ad_insights")
      .select(
        "impressions, reach, spend, clicks, purchase_value, purchases, video_p3s_rate, thruplay_rate, roas, ctr, reach_to_purchase_rate, video_p25, video_p50, video_p75, video_p100, shares_per_10k, saves_per_10k",
      )
      .eq("ad_id", adId)
      .gte("date", sinceDateStr);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (insights as any[]) ?? [];
    if (rows.length > 0) {
      let totalImpressions = 0;
      let totalReach = 0;
      let totalSpend = 0;
      let totalClicks = 0;
      let totalPurchaseValue = 0;
      let totalPurchases = 0;
      let videoP3sSum = 0;
      let videoP3sCount = 0;
      let thruplaySum = 0;
      let thruplayCount = 0;
      let totalVideoP25 = 0;
      let totalVideoP50 = 0;
      let totalVideoP75 = 0;
      let totalVideoP100 = 0;
      let sharesPer10kSum = 0;
      let sharesPer10kCount = 0;
      let savesPer10kSum = 0;
      let savesPer10kCount = 0;

      for (const row of rows) {
        totalImpressions += Number(row.impressions) || 0;
        totalReach += Number(row.reach) || 0;
        totalSpend += Number(row.spend) || 0;
        totalClicks += Number(row.clicks) || 0;
        totalPurchaseValue += Number(row.purchase_value) || 0;
        totalPurchases += Number(row.purchases) || 0;

        if (row.video_p3s_rate != null) {
          videoP3sSum += Number(row.video_p3s_rate);
          videoP3sCount++;
        }
        if (row.thruplay_rate != null) {
          thruplaySum += Number(row.thruplay_rate);
          thruplayCount++;
        }
        totalVideoP25 += Number(row.video_p25) || 0;
        totalVideoP50 += Number(row.video_p50) || 0;
        totalVideoP75 += Number(row.video_p75) || 0;
        totalVideoP100 += Number(row.video_p100) || 0;

        if (row.shares_per_10k != null) {
          sharesPer10kSum += Number(row.shares_per_10k);
          sharesPer10kCount++;
        }
        if (row.saves_per_10k != null) {
          savesPer10kSum += Number(row.saves_per_10k);
          savesPer10kCount++;
        }
      }

      const isVideo = m.media_type === "VIDEO";

      performance = {
        impressions: totalImpressions,
        reach: totalReach,
        spend: Math.round(totalSpend * 100) / 100,
        ctr:
          totalImpressions > 0
            ? Math.round((totalClicks / totalImpressions) * 10000) / 100
            : 0,
        cpc:
          totalClicks > 0
            ? Math.round((totalSpend / totalClicks) * 100) / 100
            : 0,
        roas:
          totalSpend > 0
            ? Math.round((totalPurchaseValue / totalSpend) * 100) / 100
            : 0,
        video_p3s_rate:
          isVideo && videoP3sCount > 0
            ? Math.round((videoP3sSum / videoP3sCount) * 100) / 100
            : null,
        video_thruplay_rate:
          isVideo && thruplayCount > 0
            ? Math.round((thruplaySum / thruplayCount) * 100) / 100
            : null,
        video_p25_rate:
          isVideo && totalReach > 0
            ? Math.round((totalVideoP25 / totalReach) * 10000) / 100
            : null,
        video_p50_rate:
          isVideo && totalReach > 0
            ? Math.round((totalVideoP50 / totalReach) * 10000) / 100
            : null,
        video_p75_rate:
          isVideo && totalReach > 0
            ? Math.round((totalVideoP75 / totalReach) * 10000) / 100
            : null,
        video_p100_rate:
          isVideo && totalReach > 0
            ? Math.round((totalVideoP100 / totalReach) * 10000) / 100
            : null,
        shares_per_10k:
          sharesPer10kCount > 0
            ? Math.round((sharesPer10kSum / sharesPer10kCount) * 100) / 100
            : null,
        saves_per_10k:
          savesPer10kCount > 0
            ? Math.round((savesPer10kSum / savesPer10kCount) * 100) / 100
            : null,
        purchase_count: totalPurchases,
        reach_to_purchase_rate:
          totalReach > 0
            ? Math.round((totalPurchases / totalReach) * 1000000) / 1000000
            : 0,
      };
    }
  }

  // 7. prescription_benchmarks 조회 (motion_global 기준)
  let benchmarks: {
    category: string;
    metrics: Record<string, { p25: number; p50: number; p75: number }>;
  } | null = null;

  {
    const category = c?.category ?? null;
    const { data: benchRows } = await svc
      .from("prescription_benchmarks")
      .select("metric, p25, p50, p75")
      .eq("source", "motion_global")
      .eq("media_type", m.media_type);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (benchRows as any[]) ?? [];
    if (rows.length > 0) {
      const metrics: Record<string, { p25: number; p50: number; p75: number }> =
        {};
      for (const row of rows) {
        metrics[row.metric] = {
          p25: Number(row.p25) || 0,
          p50: Number(row.p50) || 0,
          p75: Number(row.p75) || 0,
        };
      }
      benchmarks = {
        category: category ?? "전체",
        metrics,
      };
    }
  }

  // 8. 같은 account_id 내 ROAS 최고 소재 1건
  let topCreative: {
    id: string;
    media_url: string;
    ad_copy: string | null;
    roas: number;
    ctr: number;
    reach_to_purchase_rate: number;
  } | null = null;

  if (accountId) {
    const { data: topRows } = await svc
      .from("creative_performance")
      .select(
        "creative_media_id, roas, ctr, reach_to_purchase_rate",
      )
      .eq("account_id", accountId)
      .neq("creative_media_id", id)
      .order("roas", { ascending: false })
      .limit(1);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const topRow = (topRows as any[])?.[0];
    if (topRow) {
      const { data: topMedia } = await svc
        .from("creative_media")
        .select("id, media_url, storage_url, ad_copy")
        .eq("id", topRow.creative_media_id)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tm = topMedia as any;
      if (tm) {
        topCreative = {
          id: tm.id,
          media_url: tm.storage_url || tm.media_url,
          ad_copy: tm.ad_copy ?? null,
          roas: Number(topRow.roas) || 0,
          ctr: Number(topRow.ctr) || 0,
          reach_to_purchase_rate:
            Number(topRow.reach_to_purchase_rate) || 0,
        };
      }
    }
  }

  // 9. 응답 조합
  return NextResponse.json({
    creative: {
      id: m.id,
      ad_id: adId,
      media_type: m.media_type,
      media_url: m.storage_url || m.media_url,
      storage_url: m.storage_url ?? null,
      thumbnail_url: m.thumbnail_url ?? null,
      ad_copy: m.ad_copy ?? null,
      duration_seconds: m.duration_seconds ?? null,
      analysis_json: (m.analysis_json as AnalysisJsonV3) ?? null,
      video_analysis: m.video_analysis ?? null,
    },
    performance,
    saliency: sal
      ? {
          attention_map_url: sal.attention_map_url,
          top_fixations: sal.top_fixations ?? [],
          cta_attention_score: Number(sal.cta_attention_score) || 0,
          cognitive_load: Number(sal.cognitive_load) || 0,
        }
      : null,
    benchmarks,
    top_creative: topCreative,
  });
}
