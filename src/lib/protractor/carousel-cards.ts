/**
 * carousel-cards.ts — CAROUSEL 광고 개별 카드(슬라이드) 추출 유틸
 * collect-daily, collect-benchmark 양쪽에서 import하여 사용
 */

export interface CarouselCard {
  imageHash: string | null;
  imageUrl: string | null;
  videoId: string | null;
  lpUrl: string | null;
  position: number;
}

/**
 * CAROUSEL 광고에서 개별 카드(슬라이드) 추출
 *
 * 추출 우선순위:
 * 1. creative.object_story_spec.template_data.elements 배열 (카탈로그형 캐러셀)
 * 2. fallback: creative.asset_feed_spec.images 배열 (멀티 이미지 캐러셀)
 *
 * 반환값이 빈 배열이면 호출 측에서 position=0 단일 미디어로 fallback 처리
 */
export function extractCarouselCards(
  ad: Record<string, unknown>
): CarouselCard[] {
  const creative = ad.creative as Record<string, unknown> | undefined;
  if (!creative) return [];

  const oss = creative.object_story_spec as Record<string, unknown> | undefined;
  const afs = creative.asset_feed_spec as Record<string, unknown> | undefined;

  // 1순위: oss.template_data.elements 배열 순회
  if (oss) {
    const templateData = oss.template_data as
      | Record<string, unknown>
      | undefined;
    if (templateData) {
      const elements = templateData.elements as
        | Record<string, unknown>[]
        | undefined;
      if (Array.isArray(elements) && elements.length > 0) {
        return elements.map((el, idx) => ({
          imageHash: (el.image_hash as string | undefined) ?? null,
          imageUrl: (el.image_url as string | undefined) ?? null,
          videoId: (el.video_id as string | undefined) ?? null,
          lpUrl: (el.link as string | undefined) ?? null,
          position: idx,
        }));
      }
    }
  }

  // 2순위 fallback: afs.images 배열 순회
  if (afs) {
    const images = afs.images as Record<string, unknown>[] | undefined;
    if (Array.isArray(images) && images.length > 0) {
      return images.map((img, idx) => ({
        imageHash: (img.hash as string | undefined) ?? null,
        imageUrl: (img.url as string | undefined) ?? null,
        videoId: null,
        lpUrl: null,
        position: idx,
      }));
    }
  }

  // 빈 배열 반환 → 호출 측에서 position=0 단일 미디어로 fallback 처리
  return [];
}
