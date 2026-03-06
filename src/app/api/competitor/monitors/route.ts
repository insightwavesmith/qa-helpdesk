import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// competitor_monitors, competitor_alerts 테이블은 신규 생성 예정
// database.ts 타입 재생성 전까지 (svc as any) 사용

/**
 * GET /api/competitor/monitors
 * 내 모니터링 목록 조회
 */
export async function GET() {
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 모니터 목록
  const { data: monitors, error } = await svc
    .from("competitor_monitors")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "모니터링 목록 조회 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  // 미읽은 알림 수 계산
  const monitorList = (monitors ?? []) as Array<{
    id: string;
    brand_name: string;
    page_id: string | null;
    last_checked_at: string | null;
    last_ad_count: number | null;
    created_at: string;
  }>;
  const monitorIds = monitorList.map((m) => m.id);
  let alertCounts: Record<string, number> = {};

  if (monitorIds.length > 0) {
    const { data: alerts } = await svc
      .from("competitor_alerts")
      .select("monitor_id")
      .in("monitor_id", monitorIds)
      .eq("is_read", false);

    if (alerts) {
      alertCounts = (alerts as Array<{ monitor_id: string }>).reduce(
        (acc: Record<string, number>, a: { monitor_id: string }) => {
          acc[a.monitor_id] = (acc[a.monitor_id] ?? 0) + 1;
          return acc;
        },
        {} as Record<string, number>,
      );
    }
  }

  const result = monitorList.map((m) => ({
    id: m.id,
    brandName: m.brand_name,
    pageId: m.page_id,
    lastCheckedAt: m.last_checked_at,
    lastAdCount: m.last_ad_count ?? 0,
    createdAt: m.created_at,
    unreadAlertCount: alertCounts[m.id] ?? 0,
  }));

  return NextResponse.json({ monitors: result });
}

/**
 * POST /api/competitor/monitors
 * 브랜드 모니터링 등록
 */
export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const brandName = body.brandName?.trim();
  const pageId = body.pageId?.trim() || null;

  if (!brandName) {
    return NextResponse.json(
      { error: "브랜드명을 입력하세요", code: "INVALID_QUERY" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 등록 한도 확인 (최대 10개)
  const { count } = await svc
    .from("competitor_monitors")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id);

  if ((count ?? 0) >= 10) {
    return NextResponse.json(
      {
        error: "모니터링은 최대 10개까지 등록할 수 있습니다",
        code: "MONITOR_LIMIT",
      },
      { status: 400 },
    );
  }

  const { data, error } = await svc
    .from("competitor_monitors")
    .insert({
      user_id: user.id,
      brand_name: brandName,
      page_id: pageId,
    })
    .select()
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: "모니터링 등록 실패", code: "DB_ERROR" },
      { status: 500 },
    );
  }

  const row = data as {
    id: string;
    brand_name: string;
    page_id: string | null;
    last_checked_at: string | null;
    last_ad_count: number | null;
    created_at: string;
  };

  return NextResponse.json(
    {
      monitor: {
        id: row.id,
        brandName: row.brand_name,
        pageId: row.page_id,
        lastCheckedAt: row.last_checked_at,
        lastAdCount: row.last_ad_count ?? 0,
        createdAt: row.created_at,
        unreadAlertCount: 0,
      },
    },
    { status: 201 },
  );
}
