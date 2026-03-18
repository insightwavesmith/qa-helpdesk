/**
 * GET /api/admin/creative-lp-consistency?account_id=xxx
 * 소재↔LP 일관성 점수 조회
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { getConsistencyByAccount } from "@/lib/lp-consistency";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireAdmin();
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
    const results = await getConsistencyByAccount(accountId);

    const avgScore =
      results.length > 0
        ? Math.round(
            (results.reduce((s, r) => s + (r.total_score ?? 0), 0) /
              results.length) *
              10000,
          ) / 10000
        : null;

    return NextResponse.json({
      account_id: accountId,
      total: results.length,
      avg_score: avgScore,
      results,
    });
  } catch (err) {
    console.error("[creative-lp-consistency] 조회 실패:", err);
    return NextResponse.json(
      { error: "일관성 점수 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
