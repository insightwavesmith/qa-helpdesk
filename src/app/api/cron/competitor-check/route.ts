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
  latest_ad_date: string | null;
  total_ads_count: number | null;
  new_ads_count: number | null;
}

interface SearchResult {
  serverTotalCount: number;
  latestStartDate: string | null;
}

/**
 * GET /api/cron/competitor-check
 * Cron: 등록된 브랜드별 신규 광고 감지
 * 스케줄: 매일 09:00, 21:00 KST
 *
 * v2: page_id 기반 검색 + 중복 page_id 1회만 호출 + new_ads_count 갱신
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

  // page_id별 결과 캐시 (중복 호출 방지 — 크레딧 절약)
  const pageIdCache = new Map<string, SearchResult>();

  for (let i = 0; i < monitorList.length; i++) {
    const monitor = monitorList[i];
    try {
      let searchResult: SearchResult;
      const cacheKey = monitor.page_id ?? `name:${monitor.brand_name}`;

      if (pageIdCache.has(cacheKey)) {
        // 동일 page_id는 캐시된 결과 사용
        searchResult = pageIdCache.get(cacheKey)!;
      } else {
        // page_id가 있으면 page_id로 검색, 없으면 brand_name으로 폴백
        const result = await searchMetaAds(
          monitor.page_id
            ? {
                searchTerms: monitor.brand_name,
                searchPageIds: monitor.page_id,
                limit: 1,
              }
            : {
                searchTerms: monitor.brand_name,
                limit: 1,
              },
        );

        const latestStartDate =
          result.ads.length > 0 ? result.ads[0].startDate : null;

        searchResult = {
          serverTotalCount: result.serverTotalCount,
          latestStartDate,
        };
        pageIdCache.set(cacheKey, searchResult);

        // Rate limit 완화: API 호출 간 500ms 딜레이 (캐시 히트 시 스킵)
        if (i < monitorList.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const prevTotalAds = monitor.total_ads_count ?? 0;
      const currentTotalAds = searchResult.serverTotalCount;
      const prevLatestDate = monitor.latest_ad_date ?? null;
      const currentLatestDate = searchResult.latestStartDate;

      // 신규 광고 감지: 전체 수 증가 또는 최신 광고 날짜가 더 최근
      const hasNewByCount = currentTotalAds > prevTotalAds;
      const hasNewByDate =
        currentLatestDate &&
        prevLatestDate &&
        new Date(currentLatestDate) > new Date(prevLatestDate);
      const hasNew = hasNewByCount || hasNewByDate;

      // 업데이트 필드
      const updateFields: Record<string, unknown> = {
        last_checked_at: new Date().toISOString(),
        total_ads_count: currentTotalAds,
      };

      if (currentLatestDate) {
        updateFields.latest_ad_date = currentLatestDate;
      }

      if (hasNew) {
        const newCount = hasNewByCount
          ? currentTotalAds - prevTotalAds
          : 1;
        updateFields.new_ads_count =
          (monitor.new_ads_count ?? 0) + newCount;
        newAlerts++;

        // 신규 광고 발견 시 해당 page_id의 새 광고를 분석 큐에 등록
        if (monitor.page_id) {
          try {
            // competitor_ad_cache에서 이미지 있는 광고 조회
            const { data: newAds } = await svc
              .from("competitor_ad_cache")
              .select("ad_archive_id")
              .eq("page_id", monitor.page_id)
              .not("image_url", "is", null)
              .order("created_at", { ascending: false })
              .limit(50);

            if (newAds && (newAds as Array<{ ad_archive_id: string }>).length > 0) {
              const queueRows = (newAds as Array<{ ad_archive_id: string }>).map((ad) => ({
                brand_page_id: monitor.page_id as string,
                ad_id: ad.ad_archive_id,
                status: "pending",
              }));
              await svc
                .from("competitor_analysis_queue")
                .upsert(queueRows, { onConflict: "brand_page_id,ad_id", ignoreDuplicates: true });
            }
          } catch (enqueueErr) {
            console.warn(
              `[competitor-check] ${monitor.brand_name} 분석 큐 등록 실패:`,
              enqueueErr,
            );
          }
        }
      }

      await svc
        .from("competitor_monitors")
        .update(updateFields)
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
    cachedPages: pageIdCache.size,
  });
}
