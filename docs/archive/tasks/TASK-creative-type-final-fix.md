# TASK: creative_type SHARE 문제 — 완전 해결

## 문제
코드에 SHARE→VIDEO 로직이 있는데 프로덕션에서 여전히 SHARE로 저장됨.
여러 번 수정했지만 해결 안 됨. 이번에 근본적으로 끝낸다.

## 원인 추정
1. 수동수집 API(`/api/protractor/collect-daily`)가 내부 fetch로 크론 API를 호출하는데,
   `VERCEL_URL` 환경변수가 프로덕션이 아닌 preview 배포를 가리킬 수 있음
2. `creative.fields(asset_feed_spec)` 문법이 Meta API에서 무시될 수 있음

## 요구사항

### 1. 수동수집 API — 내부 fetch 제거
- `/api/protractor/collect-daily/route.ts`에서 `/api/cron/collect-daily`를 fetch로 호출하는 방식 제거
- 대신 크론 API의 수집 로직을 공용 함수로 추출해서 직접 import + 호출
- 이렇게 하면 배포 URL 차이 문제 완전 제거

### 2. getCreativeType 공용 모듈로 분리
- `src/lib/protractor/creative-type.ts` 생성
- `getCreativeType()` 함수 하나만 관리
- collect-daily, collect-benchmarks 양쪽에서 import
- SHARE 처리를 함수 최상단에 배치:
  ```typescript
  // 최우선: object_type SHARE → VIDEO (카탈로그+수동업로드 영상)
  if (objectType === "SHARE") return "VIDEO";
  ```

### 3. 기존 SHARE 데이터 일괄 수정
- collect-daily 실행 시가 아니라, 별도 SQL로 처리:
  ```sql
  UPDATE daily_ad_insights SET creative_type = 'VIDEO' WHERE creative_type = 'SHARE';
  ```
- Supabase Management API로 직접 실행 (SUPABASE_ACCESS_TOKEN 환경변수 사용)

### 4. 벤치마크도 동일 적용
- collect-benchmarks에서도 같은 공용 getCreativeType import

## 빌드 검증 + 커밋 + 푸시
- `npm run build` 통과
- 커밋 메시지: `fix: creative_type 분류 근본 해결 — 공용 모듈 + 수동수집 직접 호출`
- main 브랜치에 푸시
