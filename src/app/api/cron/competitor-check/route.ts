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

  const token = process.env.META_AD_LIBRARY_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "META_AD_LIBRARY_TOKEN 미설정", processed: 0 },
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

  for (const monitor of monitorList) {
    try {
      const result = await searchMetaAds({
        searchTerms: monitor.brand_name,
        limit: 50,
      });

      const currentAdCount = result.totalCount;
      const prevAdCount = monitor.last_ad_count ?? 0;

      // 신규 광고 감지
      if (currentAdCount > prevAdCount) {
        const newAdIds = result.ads
          .slice(0, currentAdCount - prevAdCount)
          .map((ad) => ad.id);

        await svc.from("competitor_alerts").insert({
          monitor_id: monitor.id,
          new_ad_ids: newAdIds,
        });

        newAlerts++;
      }

      // 모니터 업데이트
      await svc
        .from("competitor_monitors")
        .update({
          last_checked_at: new Date().toISOString(),
          last_ad_count: currentAdCount,
          page_id: monitor.page_id || result.ads[0]?.pageId || null,
        })
        .eq("id", monitor.id);

      processed++;
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
