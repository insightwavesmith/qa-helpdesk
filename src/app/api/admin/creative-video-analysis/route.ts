/**
 * GET /api/admin/creative-video-analysis?account_id=xxx
 * 동영상 소재 분석 결과 조회 (Gemini 2.0 Pro 분석 완료된 항목)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // 관리자 권한 확인
  const auth = await requireAdmin();
  if ("response" in auth) return auth.response;

  const { svc } = auth;

  // account_id 파라미터 확인
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json(
      { error: "account_id 파라미터가 필요합니다" },
      { status: 400 }
    );
  }

  // 동영상 분석 결과 조회 (video_analysis가 있는 항목만)
  // ad_creative_embeddings는 DB 타입 자동생성 대상 미포함 → as any 캐스트
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: results, error } = await (svc as any)
    .from("ad_creative_embeddings")
    .select(
      "ad_id, media_url, ad_copy, video_analysis, media_type, roas, ctr, updated_at"
    )
    .eq("account_id", accountId)
    .eq("media_type", "VIDEO")
    .not("video_analysis", "is", null)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[creative-video-analysis] 조회 실패:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    account_id: accountId,
    total: results?.length ?? 0,
    results: results ?? [],
  });
}
