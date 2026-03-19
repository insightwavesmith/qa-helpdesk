# collect-daily 동영상+카탈로그 media_url 수집 — Plan

## 타입: 개발 (P0)

## 이게 뭔지
`collect-daily` 크론에서 동영상(96건)과 카탈로그(127건) 소재의 media_url을 수집하도록 수정.

## 왜 필요한지
- 현재 `media_url` 해결 로직이 `image_hash → adimages API`만 사용
- 동영상 소재: `video_id`가 있지만 썸네일 URL 미수집 → media_url = null
- 카탈로그 소재: `image_hash` 없이 `asset_feed_spec`으로 이미지 제공 → 매핑 불가
- 370건 중 223건(60%)의 media_url이 null → UI 카드에 placeholder만 표시

## 현재 코드 (문제)
```typescript
// collect-daily/route.ts line 340
const mediaUrl = imageHash ? (hashToUrl.get(imageHash) || null) : null;
```
- `imageHash`가 없으면 무조건 null 반환
- `video_id`, `asset_feed_spec` 데이터는 이미 fetch하지만 활용 안 함

## 해결 방향
1. **동영상**: `video_id` → Meta API `GET /{video_id}?fields=thumbnails` → 썸네일 URL
2. **카탈로그**: `asset_feed_spec.images[].hash` 추출 → 기존 `fetchImageUrlsByHash`에 포함
3. 기존 `hashToUrl` 맵에 카탈로그 해시 포함 + `videoIdToThumb` 맵 신규 추가

## 수정 대상 파일
- `src/app/api/cron/collect-daily/route.ts` — media_url 해결 로직
- `src/lib/protractor/creative-image-fetcher.ts` — 동영상 썸네일 fetch 함수 추가

## 성공 기준
1. 동영상 소재의 media_url에 썸네일 URL 저장
2. 카탈로그 소재의 media_url에 이미지 URL 저장
3. tsc + lint + build 통과
4. 기존 이미지 소재의 media_url 해결 로직 변경 없음
