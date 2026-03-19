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

  // 1. 소재 점수 조회 (overall_score 내림차순)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: scores, error: scoresErr } = await (svc as any)
    .from("creative_intelligence_scores")
    .select("*")
    .eq("account_id", accountId)
    .order("overall_score", { ascending: false });

  if (scoresErr) {
    return NextResponse.json({ error: scoresErr.message }, { status: 500 });
  }

  if (!scores || scores.length === 0) {
    return NextResponse.json({ account_id: accountId, total: 0, results: [] });
  }

  const adIds = scores.map((s: { ad_id: string }) => s.ad_id);

  // 2. ad_creative_embeddings에서 media_url, ad_copy 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: embeddings } = await (svc as any)
    .from("ad_creative_embeddings")
    .select("ad_id, media_url, ad_copy, media_type, storage_url, lp_url")
    .in("ad_id", adIds);

  const embeddingMap = new Map<string, Record<string, unknown>>();
  for (const e of embeddings || []) {
    embeddingMap.set(e.ad_id, e);
  }

  // 3. daily_ad_insights에서 기간 평균 ROAS 조회
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

  // 4. 결과 병합
  const results = scores.map((score: Record<string, unknown>) => {
    const adId = score.ad_id as string;
    const emb = embeddingMap.get(adId) || {};
    const perf = roasMap.get(adId);
    const roas = perf && perf.totalSpend > 0
      ? Math.round((perf.totalRevenue / perf.totalSpend) * 100) / 100
      : null;

    return {
      ...score,
      // ad_creative_embeddings 필드
      media_url: (emb as Record<string, unknown>).storage_url || (emb as Record<string, unknown>).media_url || null,
      ad_copy: (emb as Record<string, unknown>).ad_copy || null,
      media_type: (emb as Record<string, unknown>).media_type || null,
      lp_url: (emb as Record<string, unknown>).lp_url || null,
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
