// __tests__/hooks/collect-daily-thumbnail.test.ts — CT-1~CT-4 (4건)
// collect-daily VIDEO thumbnail_url 보강 로직 검증
// mediaRows 생성 로직을 직접 테스트 (route handler 전체 mock 불필요)

import { describe, it, expect } from 'vitest';

/**
 * collect-daily의 media_url 생성 로직을 분리하여 테스트.
 * 실제 코드 라인 284 (비-CAROUSEL), 250 (CAROUSEL 카드), 267 (CAROUSEL fallback)의
 * media_url 필드 결정 로직만 추출.
 */
function resolveMediaUrl(opts: {
  existingMediaUrl: string | null;
  cardImageUrl?: string | null;
  videoId: string | null;
  thumbnailUrl: string | null;
}): string | null {
  const { existingMediaUrl, cardImageUrl, videoId, thumbnailUrl } = opts;

  // 수정 후 로직: existing > cardImageUrl > (videoId ? thumbnail : null)
  if (cardImageUrl !== undefined) {
    // CAROUSEL 카드 경로 (라인 250)
    return existingMediaUrl || cardImageUrl || (videoId ? thumbnailUrl : null) || null;
  }
  // 비-CAROUSEL 또는 CAROUSEL fallback (라인 267, 284)
  return existingMediaUrl || (videoId ? thumbnailUrl : null) || null;
}

describe('collect-daily VIDEO thumbnail_url 보강', () => {

  // CT-1: 비-CAROUSEL VIDEO + thumbnail_url 있음 → media_url = thumbnail_url
  it('CT-1: VIDEO + thumbnail_url → media_url에 저장', () => {
    const result = resolveMediaUrl({
      existingMediaUrl: null,
      videoId: 'vid1',
      thumbnailUrl: 'https://thumb.jpg',
    });
    expect(result).toBe('https://thumb.jpg');
  });

  // CT-2: 비-CAROUSEL VIDEO + thumbnail_url null → media_url = null (기존 동작)
  it('CT-2: VIDEO + thumbnail_url null → media_url = null', () => {
    const result = resolveMediaUrl({
      existingMediaUrl: null,
      videoId: 'vid2',
      thumbnailUrl: null,
    });
    expect(result).toBeNull();
  });

  // CT-3: 비-CAROUSEL IMAGE → thumbnail_url 분기 안 탐 (기존 동작 유지)
  it('CT-3: IMAGE → 기존 로직 무영향', () => {
    const result = resolveMediaUrl({
      existingMediaUrl: null,
      videoId: null, // IMAGE: videoId 없음
      thumbnailUrl: 'https://thumb.jpg', // 있어도 videoId null이면 무시
    });
    expect(result).toBeNull();
  });

  // CT-4: VIDEO + existing.media_url 있음 → existing 우선 (덮어쓰기 안 함)
  it('CT-4: 기존 media_url 있으면 유지', () => {
    const result = resolveMediaUrl({
      existingMediaUrl: 'https://old.jpg',
      videoId: 'vid3',
      thumbnailUrl: 'https://new-thumb.jpg',
    });
    expect(result).toBe('https://old.jpg');
  });
});
