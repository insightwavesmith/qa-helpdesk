import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/competitor/monitors/[id]/alerts
 * 알림 목록 조회 (H1)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
      { status: 401 },
    );
  }

  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 본인 소유 모니터 확인
  const { data: monitor } = await svc
    .from("competitor_monitors")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.uid)
    .single();

  if (!monitor) {
    return NextResponse.json(
      { error: "권한이 없습니다", code: "UNAUTHORIZED" },
      { status: 403 },
    );
  }

  // 알림 목록 조회 (최신순, limit 50)
  const { data: alerts, error } = await svc
    .from("competitor_alerts")
    .select("*")
    .eq("monitor_id", id)
    .order("detected_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json(
      { error: "알림 조회 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const result = (
    (alerts ?? []) as Array<{
      id: string;
      monitor_id: string;
      new_ad_ids: string[];
      detected_at: string;
      is_read: boolean;
    }>
  ).map((a) => ({
    id: a.id,
    monitorId: a.monitor_id,
    newAdIds: a.new_ad_ids,
    detectedAt: a.detected_at,
    isRead: a.is_read,
  }));

  return NextResponse.json({ alerts: result });
}

/**
 * PATCH /api/competitor/monitors/[id]/alerts
 * 알림 읽음 처리
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();

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
    .eq("user_id", user.uid)
    .single();

  if (!monitor) {
    return NextResponse.json(
      { error: "권한이 없습니다", code: "UNAUTHORIZED" },
      { status: 403 },
    );
  }

  // 알림 읽음 처리 + 에러 처리 (M5)
  const { error: updateError } = await svc
    .from("competitor_alerts")
    .update({ is_read: true })
    .in("id", alertIds)
    .eq("monitor_id", id);

  if (updateError) {
    return NextResponse.json(
      { error: "알림 업데이트 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true });
}
