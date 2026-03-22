# TASK: creative_type SHARE → VIDEO 변환이 프로덕션에서 안 먹히는 문제 디버깅

## 문제
`getCreativeType()` 함수에 `asset_feed_spec.videos` 체크 + SHARE fallback 로직이 있는데,
프로덕션 재수집 후에도 DB에 SHARE 137건이 그대로 저장됨.

Meta API 직접 호출 시 `asset_feed_spec.videos`는 정상 반환됨 — 코드 로직도 맞음.
프로덕션에서 실제로 어떤 값이 들어오는지 확인 필요.

## 디버깅 요구사항

### 1. getCreativeType()에 디버깅 로그 추가
- `collect-daily/route.ts`의 `getCreativeType()` 함수 시작 부분에:
  ```typescript
  console.log(`[getCreativeType] ad=${(ad as any).name}, object_type=${creative?.object_type}, video_id=${creative?.video_id}, has_afs_videos=${!!creative?.asset_feed_spec?.videos?.length}, result=?`);
  ```
- 함수 return 직전에 최종 result도 로그

### 2. creative 필드 파싱 문제 확인
- Meta API가 `creative.fields(asset_feed_spec)` 요청 시 실제로 creative 객체 안에 `asset_feed_spec`이 들어오는지
- `ad.creative`의 실제 구조를 JSON.stringify로 로그 (SHARE인 광고 1건만)
- 혹시 `creative.fields(...)` 문법에서 `asset_feed_spec`의 sub-fields를 명시해야 하는지 확인
  - 예: `creative.fields(asset_feed_spec{videos{video_id}})` vs `creative.fields(asset_feed_spec)`

### 3. AD_FIELDS 수정 시도
- `asset_feed_spec` 대신 `asset_feed_spec{videos{video_id}}` 로 변경해서 테스트
- 두 방식 다 해보고 Meta API 응답 차이 확인

### 4. 수정 + 빌드 + 푸시
- 원인 파악 후 수정
- `npm run build` 통과
- 커밋 + 푸시

## 참조
- `src/app/api/cron/collect-daily/route.ts` — getCreativeType(), AD_FIELDS
- `src/app/api/cron/collect-benchmarks/route.ts` — 동일 함수 (양쪽 동기화)
- 에어무드 계정: `1440411543944393`
- Meta API 토큰: `.env.local`의 `META_ACCESS_TOKEN`
- 테스트 명령: curl로 에어무드 계정의 SHARE 광고 creative 필드 확인
