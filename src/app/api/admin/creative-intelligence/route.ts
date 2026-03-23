import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/creative-intelligence?account_id=xxx&period=30
 * 소재별 종합 점수 + media_url + ad_copy + ROAS(기간 평균) 통합 조회
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(["admin", "student", "member"]);
  if ("response" in auth) return auth.response;
  const { svc } = auth;

  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json(
      { error: "account_id 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  const period = parseInt(req.nextUrl.searchParams.get("period") || "30", 10);

  // 1. creative_media + creatives JOIN으로 소재 정보 + 분석 결과 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: mediaRows, error: mediaErr } = await (svc as any)
    .from("creative_media")
    .select("id, media_url, ad_copy, media_type, storage_url, analysis_json, creatives!inner(ad_id, account_id, lp_url, is_active)")
    .eq("creatives.account_id", accountId)
    .eq("creatives.is_active", true);

  if (mediaErr) {
    return NextResponse.json({ error: mediaErr.message }, { status: 500 });
  }

  if (!mediaRows || mediaRows.length === 0) {
    return NextResponse.json({ account_id: accountId, total: 0, results: [] });
  }

  const adIds = mediaRows.map((r: Record<string, unknown>) => (r.creatives as Record<string, unknown>).ad_id as string);

  // 2. daily_ad_insights에서 기간 평균 ROAS 조회
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - period);
  const sinceDateStr = sinceDate.toISOString().split("T")[0];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: insights } = await (svc as any)
    .from("daily_ad_insights")
    .select("ad_id, spend, website_purchase_value")
    .eq("account_id", accountId)
    .gte("date_start", sinceDateStr);

  // ad_id별 ROAS 집계 (가중평균: SUM(revenue) / SUM(spend))
  const roasMap = new Map<string, { totalSpend: number; totalRevenue: number }>();
  for (const row of insights || []) {
    const existing = roasMap.get(row.ad_id) || { totalSpend: 0, totalRevenue: 0 };
    existing.totalSpend += Number(row.spend) || 0;
    existing.totalRevenue += Number(row.website_purchase_value) || 0;
    roasMap.set(row.ad_id, existing);
  }

  // 3. 결과 병합
  const results = mediaRows.map((media: Record<string, unknown>) => {
    const creative = media.creatives as Record<string, unknown>;
    const adId = creative.ad_id as string;
    const analysisJson = media.analysis_json as Record<string, unknown> | null;
    const perf = roasMap.get(adId);
    const roas = perf && perf.totalSpend > 0
      ? Math.round((perf.totalRevenue / perf.totalSpend) * 100) / 100
      : null;

    return {
      ad_id: adId,
      // analysis_json 점수 (5축 분석 결과)
      analysis_json: analysisJson,
      // creative_media 필드
      media_url: (media.storage_url as string) || (media.media_url as string) || null,
      ad_copy: (media.ad_copy as string) || null,
      media_type: (media.media_type as string) || null,
      lp_url: (creative.lp_url as string) || null,
      // 성과 지표
      roas,
      spend: perf?.totalSpend ?? null,
      revenue: perf?.totalRevenue ?? null,
      period,
    };
  });

  return NextResponse.json({
    account_id: accountId,
    total: results.length,
    period,
    results,
  });
}
