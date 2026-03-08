import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { searchMetaAds, MetaAdError } from "@/lib/competitor/meta-ad-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MonitorRow {
  id: string;
  brand_name: string;
  page_id: string | null;
  last_ad_count: number | null;
}

/**
 * GET /api/cron/competitor-check
 * Cron: 등록된 브랜드별 신규 광고 감지
 * 스케줄: 매일 09:00, 21:00 KST
 */
export async function GET(req: NextRequest) {
  // Cron 인증 확인
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const apiKey = process.env.SEARCH_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SEARCH_API_KEY 미설정", processed: 0 },
      { status: 200 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 모니터 목록 (last_checked_at ASC 우선, 최대 100개)
  const { data: monitors, error } = await svc
    .from("competitor_monitors")
    .select("*")
    .order("last_checked_at", { ascending: true, nullsFirst: true })
    .limit(100);

  if (error || !monitors) {
    return NextResponse.json({ error: "DB 조회 실패", processed: 0 });
  }

  const monitorList = monitors as MonitorRow[];
  let processed = 0;
  let newAlerts = 0;

  for (let i = 0; i < monitorList.length; i++) {
    const monitor = monitorList[i];
    try {
      const result = await searchMetaAds({
        searchTerms: monitor.brand_name,
        limit: 50,
      });

      const currentAdCount = result.totalCount;
      const prevAdCount = monitor.last_ad_count ?? 0;

      // 신규 광고 감지 (C1: slice 방향 수정 — 신규 광고는 durationDays가 짧아 리스트 끝에 위치)
      if (currentAdCount > prevAdCount) {
        const diff = currentAdCount - prevAdCount;
        const newAdIds = result.ads.slice(-diff).map((ad) => ad.id);

        await svc.from("competitor_alerts").insert({
          monitor_id: monitor.id,
          new_ad_ids: newAdIds,
        });

        newAlerts++;
      }

      // 모니터 업데이트 (M7: page_id 자동 변경 제거)
      await svc
        .from("competitor_monitors")
        .update({
          last_checked_at: new Date().toISOString(),
          last_ad_count: currentAdCount,
        })
        .eq("id", monitor.id);

      processed++;

      // Rate limit 완화: 브랜드 간 500ms 딜레이 (M6)
      if (i < monitorList.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } catch (err) {
      if (err instanceof MetaAdError && err.code === "RATE_LIMITED") {
        break;
      }
      console.error(
        `[competitor-check] ${monitor.brand_name} 체크 실패:`,
        err,
      );
    }
  }

  return NextResponse.json({
    processed,
    newAlerts,
    total: monitorList.length,
  });
}
