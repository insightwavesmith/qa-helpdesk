import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * DELETE /api/competitor/monitors/[id]
 * 모니터링 삭제
 */
/**
 * PATCH /api/competitor/monitors/[id]
 * 모니터링 업데이트 (클릭 시 NEW 배지 리셋 등)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { id } = await params;
  const body = await req.json();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 허용 필드만 추출
  const updateFields: Record<string, unknown> = {};
  if (body.newAdsCount !== undefined)
    updateFields.new_ads_count = body.newAdsCount;
  if (body.lastCheckedAt !== undefined)
    updateFields.last_checked_at = body.lastCheckedAt;

  if (Object.keys(updateFields).length === 0) {
    return NextResponse.json(
      { error: "업데이트할 필드가 없습니다", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  const { error } = await svc
    .from("competitor_monitors")
    .update(updateFields)
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "업데이트 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/competitor/monitors/[id]
 * 모니터링 삭제
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 본인 소유 확인 후 삭제
  const { error } = await svc
    .from("competitor_monitors")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json(
      { error: "삭제 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
