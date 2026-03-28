# collect-daily 동영상+카탈로그 media_url 수집 — Design

## 1. 데이터 모델
기존 `ad_creative_embeddings` 테이블 변경 없음. `media_url` 컬럼에 값만 채움.

## 2. API 설계

### 2-1. 동영상 썸네일 조회 (신규 함수)
```
Meta Graph API: GET /{video_id}?fields=thumbnails
Response: { thumbnails: { data: [{ uri, height, width }] } }
```

`creative-image-fetcher.ts`에 추가:
```typescript
export async function fetchVideoThumbnails(
  videoIds: string[]
): Promise<Map<string, string>>
```
- 배치 50개씩, 개별 호출 + 100ms 딜레이
- 응답에서 가장 큰 썸네일의 `uri` 사용
- 에러 시 해당 video_id 스킵 (전체 실패 방지)

### 2-2. 카탈로그 이미지 해시 추출 (함수 수정)
기존 `extractImageHashes` 확장:
```typescript
export function extractImageHashes(ads: Record<string, unknown>[]): string[] {
  // 기존: creative.image_hash만 추출
  // 수정: + creative.asset_feed_spec.images[].hash도 추출
}
```

### 2-3. collect-daily media_url 해결 순서
```
1. image_hash → hashToUrl (기존)
2. video_id → videoThumbMap (신규)
3. asset_feed_spec.images[0].hash → hashToUrl (신규 — 카탈로그)
4. null (fallback)
```

## 3. 구현 순서
1. `creative-image-fetcher.ts`에 `fetchVideoThumbnails` 함수 추가
2. `extractImageHashes` 함수에 `asset_feed_spec.images[].hash` 추출 추가
3. `collect-daily/route.ts`에서:
   - video_id 목록 추출
   - `fetchVideoThumbnails` 호출
   - media_url 해결 로직을 3단계 fallback으로 변경

## 4. 에러 처리
- Meta API 429: 기존 `fetchMetaWithRetry` 재사용
- 개별 video_id 실패: 스킵 + 로그
- asset_feed_spec 파싱 에러: 스킵 + 로그
- 전체 video thumbnail 단계 실패: 기존 로직으로 fallback (이미지 소재는 정상 수집)

## 5. 성능 고려
- 96개 video_id × 200ms = ~20초 추가 (maxDuration 300초 내)
- hashToUrl 배치에 카탈로그 해시 포함 → 추가 API 호출 최소
