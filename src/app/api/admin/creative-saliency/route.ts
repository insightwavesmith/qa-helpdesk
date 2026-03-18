import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/creative-saliency
 *
 * 시선 예측 결과 조회
 *
 * Query params:
 *   ad_id: 특정 소재 필터
 *   account_id: 특정 계정 필터
 *   limit: 최대 반환 건수 (기본 100)
 */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { svc } = auth;

  const adId = req.nextUrl.searchParams.get("ad_id");
  const accountId = req.nextUrl.searchParams.get("account_id");
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "100", 10);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("creative_saliency")
    .select("*")
    .order("analyzed_at", { ascending: false })
    .limit(limit);

  if (adId) {
    query = query.eq("ad_id", adId);
  }
  if (accountId) {
    query = query.eq("account_id", accountId);
  }

  const { data: results, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    total: results?.length ?? 0,
    results: results || [],
  });
}
