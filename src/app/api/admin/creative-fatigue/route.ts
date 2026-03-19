/**
 * GET /api/admin/creative-fatigue?account_id=xxx
 * 소재 피로도 위험 감지 결과 반환
 * similarity >= 0.85 → 위험 / >= 0.90 → 확실 중복
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { detectFatigue } from "@/lib/creative-analyzer";

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
    const fatigueRisks = await detectFatigue(accountId);

    const highRisk = fatigueRisks.filter((r) => r.risk === "duplicate");
    const mediumRisk = fatigueRisks.filter((r) => r.risk === "danger");

    return NextResponse.json({
      account_id: accountId,
      fatigueRisks,
      summary: {
        total: fatigueRisks.length,
        high_risk: highRisk.length,
        medium_risk: mediumRisk.length,
      },
    });
  } catch (err) {
    console.error("[creative-fatigue] 피로도 분석 실패:", err);
    return NextResponse.json(
      { error: "피로도 분석 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
