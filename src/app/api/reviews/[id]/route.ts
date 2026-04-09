import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/firebase/auth";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";
import { reviewCorsHeaders, handleReviewOptions } from "../_cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * OPTIONS /api/reviews/:id
 * CORS preflight
 */
export async function OPTIONS(req: NextRequest) {
  return handleReviewOptions(req);
}

/**
 * GET /api/reviews/:id
 * 수강후기 상세 조회 (공개)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const svc = createServiceClient();

  const { data, error } = await svc
    .from("reviews")
    .select("*, author:profiles!reviews_author_id_fkey(name)")
    .eq("id", id)
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "후기를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // view_count 비동기 증가
  after(async () => {
    await svc
      .from("reviews")
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq("id", id);
  });

  return NextResponse.json({ data }, { headers: reviewCorsHeaders(_req) });
}

/**
 * DELETE /api/reviews/:id
 * 수강후기 삭제 (본인 또는 관리자)
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "인증이 필요합니다.", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const svc = createServiceClient();

  // 후기 존재 확인
  const { data: review } = await svc
    .from("reviews")
    .select("author_id")
    .eq("id", id)
    .single();

  if (!review) {
    return NextResponse.json(
      { error: "후기를 찾을 수 없습니다.", code: "NOT_FOUND" },
      { status: 404 },
    );
  }

  // 권한 확인: 본인 또는 관리자
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  const isAdmin = profile?.role === "admin";
  const isOwner = review.author_id === toProfileId(user.uid);

  if (!isAdmin && !isOwner) {
    return NextResponse.json(
      { error: "권한이 없습니다.", code: "FORBIDDEN" },
      { status: 403 },
    );
  }

  const { error } = await svc.from("reviews").delete().eq("id", id);

  if (error) {
    console.error("[api/reviews DELETE] error:", error);
    return NextResponse.json(
      { error: "후기 삭제 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
