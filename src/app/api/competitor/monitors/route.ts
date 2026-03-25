import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    page_profile_url: string | null;
    ig_username: string | null;
    category: string | null;
    new_ads_count: number | null;
    latest_ad_date: string | null;
    total_ads_count: number | null;
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
    // v2 확장 필드
    pageProfileUrl: m.page_profile_url ?? null,
    igUsername: m.ig_username ?? null,
    category: m.category ?? null,
    newAdsCount: m.new_ads_count ?? 0,
    latestAdDate: m.latest_ad_date ?? null,
    totalAdsCount: m.total_ads_count ?? 0,
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

  // 동일 브랜드 중복 등록 방지 (M3)
  const { data: existing } = await svc
    .from("competitor_monitors")
    .select("id")
    .eq("user_id", user.id)
    .eq("brand_name", brandName)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "이미 등록된 브랜드입니다", code: "DUPLICATE_MONITOR" },
      { status: 409 },
    );
  }

  // v2 확장 필드 (BrandPage에서 전달)
  const pageProfileUrl = body.pageProfileUrl?.trim() || null;
  const igUsername = body.igUsername?.trim() || null;
  const category = body.category?.trim() || null;
  const totalAdsCount =
    typeof body.totalAdsCount === "number" ? body.totalAdsCount : 0;

  const { data, error } = await svc
    .from("competitor_monitors")
    .insert({
      user_id: user.id,
      brand_name: brandName,
      page_id: pageId,
      page_profile_url: pageProfileUrl,
      ig_username: igUsername,
      category: category,
      total_ads_count: totalAdsCount,
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
    page_profile_url: string | null;
    ig_username: string | null;
    category: string | null;
    new_ads_count: number | null;
    latest_ad_date: string | null;
    total_ads_count: number | null;
  };

  // 브랜드 등록 후 기존 광고를 분석 큐에 자동 등록
  if (pageId) {
    try {
      const { data: existingAds } = await svc
        .from("competitor_ad_cache")
        .select("ad_archive_id")
        .eq("page_id", pageId)
        .not("image_url", "is", null);

      if (existingAds && (existingAds as Array<{ ad_archive_id: string }>).length > 0) {
        const BATCH_SIZE = 100;
        const adList = existingAds as Array<{ ad_archive_id: string }>;
        for (let i = 0; i < adList.length; i += BATCH_SIZE) {
          const batch = adList.slice(i, i + BATCH_SIZE).map((ad) => ({
            brand_page_id: pageId,
            ad_id: ad.ad_archive_id,
            status: "pending",
          }));
          await svc
            .from("competitor_analysis_queue")
            .upsert(batch, { onConflict: "brand_page_id,ad_id", ignoreDuplicates: true });
        }
        console.log(
          `[monitors POST] ${pageId} 브랜드 등록 — ${adList.length}건 분석 큐 등록`,
        );
      }
    } catch (err) {
      // 큐 등록 실패는 모니터 등록 자체를 실패시키지 않음
      console.warn("[monitors POST] 분석 큐 등록 실패:", err);
    }
  }

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
        // v2 확장 필드
        pageProfileUrl: row.page_profile_url ?? null,
        igUsername: row.ig_username ?? null,
        category: row.category ?? null,
        newAdsCount: row.new_ads_count ?? 0,
        latestAdDate: row.latest_ad_date ?? null,
        totalAdsCount: row.total_ads_count ?? 0,
      },
    },
    { status: 201 },
  );
}
