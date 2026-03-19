/**
 * GET /api/admin/creative-similarity?account_id=xxx
 * 같은 계정 소재 간 유사도 매트릭스 반환
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { computeSimilarityPairs } from "@/lib/creative-analyzer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(["admin", "student", "member"]);
  if ("response" in auth) return auth.response;

  const { searchParams } = new URL(req.url);
  const accountId = searchParams.get("account_id");

  if (!accountId) {
    return NextResponse.json(
      { error: "account_id 파라미터가 필요합니다." },
      { status: 400 },
    );
  }

  try {
    const pairs = await computeSimilarityPairs(accountId);

    return NextResponse.json({
      account_id: accountId,
      total: pairs.length,
      pairs,
    });
  } catch (err) {
    console.error("[creative-similarity] 유사도 계산 실패:", err);
    return NextResponse.json(
      { error: "유사도 계산 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
