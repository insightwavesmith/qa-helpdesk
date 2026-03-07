import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/competitor/monitors/[id]/alerts
 * 알림 읽음 처리
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
  const alertIds: string[] = body.alertIds ?? [];

  if (alertIds.length === 0) {
    return NextResponse.json({ success: true });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 본인 소유 모니터 확인
  const { data: monitor } = await svc
    .from("competitor_monitors")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!monitor) {
    return NextResponse.json(
      { error: "권한이 없습니다", code: "UNAUTHORIZED" },
      { status: 403 },
    );
  }

  await svc
    .from("competitor_alerts")
    .update({ is_read: true })
    .in("id", alertIds)
    .eq("monitor_id", id);

  return NextResponse.json({ success: true });
}
