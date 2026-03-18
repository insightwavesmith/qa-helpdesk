/**
 * POST /api/admin/creative-clusters/generate?account_id=xxx
 * 클러스터 생성 또는 갱신 (agglomerative clustering)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { generateClusters } from "@/lib/creative-analyzer";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // 2분

export async function POST(req: NextRequest) {
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
    const result = await generateClusters(accountId);

    return NextResponse.json({
      account_id: accountId,
      clusters_created: result.clusters_created,
      message:
        result.clusters_created > 0
          ? `${result.clusters_created}개 클러스터가 생성되었습니다.`
          : "클러스터 생성 조건을 충족하는 소재가 없습니다. (유사도 0.8 이상 소재 부족)",
    });
  } catch (err) {
    console.error("[creative-clusters/generate] 클러스터 생성 실패:", err);
    return NextResponse.json(
      { error: "클러스터 생성 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
