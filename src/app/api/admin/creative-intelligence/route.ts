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
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "5", 10);

  // 1. creatives에서 active ad_id 조회
  const { data: creativeRows, error: crErr } = await svc
    .from("creatives")
    .select("id, ad_id, lp_url")
    .eq("account_id", accountId)
    .eq("is_active", true);

  if (crErr) {
    return NextResponse.json({ error: crErr.message }, { status: 500 });
  }
  if (!creativeRows || creativeRows.length === 0) {
    return NextResponse.json({ account_id: accountId, total: 0, results: [] });
  }

  const creativeIds = creativeRows.map((r: Record<string, unknown>) => r.id as string);

  // 2. creative_media 조회
  const { data: mediaRows, error: mediaErr } = await svc
    .from("creative_media")
    .select("id, creative_id, media_url, ad_copy, media_type, storage_url, analysis_json")
    .in("creative_id", creativeIds);

  if (mediaErr) {
    return NextResponse.json({ error: mediaErr.message }, { status: 500 });
  }

  // creative_id → creative 매핑
  const creativeMap = new Map<string, Record<string, unknown>>();
  for (const c of creativeRows) {
    creativeMap.set(c.id as string, c as Record<string, unknown>);
  }

  // 3. daily_ad_insights에서 기간 평균 ROAS 조회
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - period);
  const sinceDateStr = sinceDate.toISOString().split("T")[0];

  const adIds = creativeRows.map((r: Record<string, unknown>) => r.ad_id as string);
  const { data: insights } = await svc
    .from("daily_ad_insights")
    .select("ad_id, spend, website_purchase_value")
    .eq("account_id", accountId)
    .in("ad_id", adIds)
    .gte("date_start", sinceDateStr);

  // ad_id별 ROAS 집계
  const roasMap = new Map<string, { totalSpend: number; totalRevenue: number }>();
  for (const row of (insights || []) as Record<string, unknown>[]) {
    const existing = roasMap.get(row.ad_id as string) || { totalSpend: 0, totalRevenue: 0 };
    existing.totalSpend += Number(row.spend) || 0;
    existing.totalRevenue += Number(row.website_purchase_value) || 0;
    roasMap.set(row.ad_id as string, existing);
  }

  // 4. 결과 병합 — 분석 데이터 있는 것 우선 정렬
  const results = (mediaRows || []).map((media: Record<string, unknown>) => {
    const creative = creativeMap.get(media.creative_id as string);
    const adId = (creative?.ad_id as string) || "";
    const analysisJson = media.analysis_json as Record<string, unknown> | null;
    const perf = roasMap.get(adId);
    const roas = perf && perf.totalSpend > 0
      ? Math.round((perf.totalRevenue / perf.totalSpend) * 100) / 100
      : null;

    const hasAnalysis = analysisJson && (
      analysisJson.scene_analysis ||
      analysisJson.visual_impact ||
      analysisJson.hook_type
    );

    return {
      id: media.id as string,
      ad_id: adId,
      analysis_json: analysisJson,
      media_url: (media.storage_url as string) || (media.media_url as string) || null,
      ad_copy: (media.ad_copy as string) || null,
      media_type: (media.media_type as string) || null,
      lp_url: (creative?.lp_url as string) || null,
      roas,
      spend: perf?.totalSpend ?? null,
      revenue: perf?.totalRevenue ?? null,
      has_analysis: !!hasAnalysis,
      period,
    };
  })
    .sort((a: { has_analysis: boolean; roas: number | null }, b: { has_analysis: boolean; roas: number | null }) => {
      if (a.has_analysis !== b.has_analysis) return a.has_analysis ? -1 : 1;
      return (b.roas ?? 0) - (a.roas ?? 0);
    })
    .slice(0, limit);

  return NextResponse.json({
    account_id: accountId,
    total: results.length,
    period,
    results,
  });
}
