import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/creative-intelligence?account_id=xxx
 * 특정 광고계정의 소재별 종합 점수 + 개선 제안 목록 조회
 * overall_score 내림차순 정렬 (고득점 소재 우선)
 */
export async function GET(req: NextRequest) {
  // 관리자 인증
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;
  const { svc } = auth;

  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json(
      { error: "account_id 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  // 소재 점수 + 제안 조회 (점수 높은 순)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results, error } = await (svc as any)
    .from("creative_intelligence_scores")
    .select("*")
    .eq("account_id", accountId)
    .order("overall_score", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    account_id: accountId,
    total: results?.length ?? 0,
    results: results ?? [],
  });
}
