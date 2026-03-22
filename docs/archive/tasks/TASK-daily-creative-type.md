# TASK: 데일리 수집 소재타입 분류 통일 + 재수집

## 배경
벤치마크 수집(`collect-benchmarks/route.ts`)은 `video_id/image_hash/product_set_id` 기반으로 소재타입을 정확히 분류하도록 이미 수정됨.
그런데 데일리 수집(`collect-daily/route.ts`)은 아직 `object_type` 기반의 구방식을 사용 중.
수강생이 자신의 광고 소재를 벤치마크와 비교할 때, 분류 기준이 다르면 비교가 부정확해짐.

## 요구사항

### 1. 데일리 수집 소재타입 분류 변경
- `src/app/api/cron/collect-daily/route.ts`의 `getCreativeType()` 함수를 벤치마크와 동일한 로직으로 수정
- Meta API 요청 시 creative 필드에 `video_id`, `image_hash`, `product_set_id` 추가 요청 (AD_FIELDS에 포함)
- 분류 우선순위:
  1. `video_id` 있으면 → `VIDEO`
  2. `image_hash` 있고 `product_set_id` 없으면 → `IMAGE`
  3. `product_set_id` 있으면 → `CATALOG`
  4. fallback → 기존 `object_type` 기반 매핑

### 2. 참조 코드
- 벤치마크의 정확한 구현: `src/app/api/cron/collect-benchmarks/route.ts`의 `getCreativeType()` (L141~153)
- 여기서 로직을 그대로 가져오면 됨

### 3. 빌드 검증
- `npm run build` 통과 확인
- TypeScript 타입 에러 없음 확인

### 4. 커밋 + 푸시
- 커밋 메시지: `fix: 데일리 수집 creative_type 분류를 벤치마크와 동일하게 통일`
- main 브랜치에 푸시

## 완료 기준
- 데일리 수집의 getCreativeType()이 벤치마크와 동일한 분류 로직 사용
- AD_FIELDS에 video_id, image_hash, product_set_id 포함
- 빌드 성공
- 커밋 + 푸시 완료
