/**
 * GET /api/admin/creative-clusters?account_id=xxx
 * 저장된 클러스터 목록 조회
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";
import { createServiceClient } from "@/lib/db";

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

  const supabase = createServiceClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: clusters, error } = await (supabase as any)
      .from("creative_clusters")
      .select("*")
      .eq("account_id", accountId)
      .order("member_count", { ascending: false });

    if (error) {
      console.error("[creative-clusters] 조회 실패:", error);
      return NextResponse.json(
        { error: "클러스터 조회 중 오류가 발생했습니다." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      account_id: accountId,
      clusters: clusters ?? [],
    });
  } catch (err) {
    console.error("[creative-clusters] 오류:", err);
    return NextResponse.json(
      { error: "클러스터 조회 중 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}
