/**
 * 경쟁사 광고 캐시 모듈
 * - competitor_ad_cache 테이블 UPSERT/조회
 * - URL 만료 관리 (oe 파라미터 기반)
 * - service_role 클라이언트로 RLS 우회
 */

import { createServiceClient } from "@/lib/supabase/server";
import { extractExpiresAt } from "@/lib/competitor/meta-ad-library";
import type { CompetitorAd, CompetitorAdCacheRow } from "@/types/competitor";

/**
 * 검색 결과를 캐시 테이블에 UPSERT
 * ad_archive_id 기준 중복 시 업데이트
 */
export async function upsertAdCache(ads: CompetitorAd[]): Promise<void> {
  if (ads.length === 0) return;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const rows = ads.map((ad) => {
    // 영상 URL의 oe 파라미터에서 만료 시점 추출
    const expiresAt =
      extractExpiresAt(ad.videoUrl) ?? extractExpiresAt(ad.imageUrl);

    return {
      ad_archive_id: ad.id,
      page_id: ad.pageId,
      page_name: ad.pageName,
      ad_text: ad.body || null,
      ad_title: ad.title || null,
      image_url: ad.imageUrl,
      video_url: ad.videoUrl,
      video_preview_url: ad.videoPreviewUrl,
      display_format: ad.displayFormat,
      link_url: ad.linkUrl,
      start_date: ad.startDate,
      end_date: ad.endDate,
      is_active: ad.isActive,
      platforms: ad.platforms,
      snapshot_url: ad.snapshotUrl,
      carousel_cards: ad.carouselCards,
      metadata: {},
      expires_at: expiresAt?.toISOString() ?? null,
    };
  });

  const { error } = await svc
    .from("competitor_ad_cache")
    .upsert(rows, { onConflict: "ad_archive_id" });

  if (error) {
    console.error("[ad-cache] UPSERT 실패:", error.message);
  }
}

/**
 * 캐시에서 광고 조회 (ad_archive_id 기준)
 */
export async function getAdFromCache(
  adArchiveId: string,
): Promise<CompetitorAdCacheRow | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  const { data, error } = await svc
    .from("competitor_ad_cache")
    .select("*")
    .eq("ad_archive_id", adArchiveId)
    .single();

  if (error || !data) return null;

  return data as CompetitorAdCacheRow;
}

/**
 * 캐시된 URL이 만료되었는지 확인
 */
export function isUrlExpired(cachedAd: CompetitorAdCacheRow): boolean {
  if (!cachedAd.expires_at) return false;
  return new Date(cachedAd.expires_at) < new Date();
}
