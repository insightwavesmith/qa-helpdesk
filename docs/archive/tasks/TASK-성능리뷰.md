# TASK: 성능 코드 리뷰 — T1~T5 성능개선 결과물 검증 + P0 잔여 이슈

> 참고: `docs/reviews/performance-analysis.md` (성능 분석 보고서)
> 이전 커밋: `d1fb047` (perf: 수강생 체감 속도 개선 T1~T5)

---

## 빌드/테스트
- `npm run build` 성공 필수
- 테스트 계정: smith@test.com / test1234! (admin), student@test.com / test1234! (student)

---

## T1. SWR 프리페치 검증 + 최적화

### 이게 뭔지
로그인 후 SWR 프리페치가 제대로 작동하는지 검증하고, 캐시 히트율을 높이는 개선.

### 왜 필요한지
`d1fb047`에서 SWR 프리페치를 넣었는데, 실제로 각 페이지에서 캐시를 제대로 쓰고 있는지 확인이 안 됐다.
SWR 키가 프리페치와 페이지에서 불일치하면 프리페치해도 캐시 미스 → 효과 없음.

### 파일
- `src/components/providers/swr-prefetch-provider.tsx` (또는 프리페치 로직이 있는 파일)
- `src/app/(main)/layout.tsx`
- SWR 키를 사용하는 모든 `useSWR` 호출 (`src/app/(main)/` 하위)

### 검증 기준
- 프리페치 SWR 키와 각 페이지 SWR 키가 일치하는지 확인
- `dedupingInterval`, `revalidateOnFocus` 설정이 적절한지 확인
- 불필요한 refetch가 발생하는 곳이 있으면 수정
- `npm run build` 성공

### 하지 말 것
- SWR 라이브러리 교체 (react-query 등) 금지
- API 엔드포인트 구조 변경 금지

---

## T2. overlap API 병렬화 (P0 잔여)

### 이게 뭔지
타겟중복률 분석 API에서 Meta API를 순차 호출하는 걸 병렬화해서 최대 55초 → 10초 이내로 줄이기.

### 왜 필요한지
8개 adset 기준 28쌍 순차 호출 = 최대 55초. 관리자가 총가치각도기 타겟중복률 탭을 열면 1분 가까이 기다려야 한다.

### 파일
- `src/app/api/protractor/overlap/route.ts` (208~267줄 부근)

### 검증 기준
- `Promise.allSettled` 등으로 병렬화 (동시 3~5개 제한, Meta rate limit 고려)
- 개별 pair 실패해도 나머지는 정상 반환
- 기존 캐시 로직(DB upsert) 유지
- `npm run build` 성공

### 하지 말 것
- 캐시 TTL 변경 금지
- DB 스키마 변경 금지
- overlap 계산 로직 자체 변경 금지

---

## T3. total-value limit 하드코딩 제거

### 이게 뭔지
총가치각도기 API에서 `.limit(1000)` 하드코딩 때문에 데이터가 잘리는 문제 수정.

### 왜 필요한지
광고 수 × 기간 일수가 1000을 넘으면 집계가 누락된다. 수강생 계정이 커지면 실제 수치와 다른 값이 나온다.

### 파일
- `src/app/api/protractor/total-value/route.ts` (116~121줄 부근)

### 검증 기준
- limit 제거하거나 페이지네이션 처리
- 필요 컬럼만 select (전체 `*` 아닌 필요한 것만)
- `npm run build` 성공

### 하지 말 것
- DB RPC 새로 만들기 금지 (기존 쿼리 최적화만)
- 다른 API 엔드포인트 건드리지 말 것

---

## T4. daily_ad_insights 안전장치

### 이게 뭔지
daily_ad_insights 조회에 limit이 없어서 대형 계정+긴 기간 시 OOM/타임아웃 위험. 안전장치 추가.

### 왜 필요한지
`select("*").eq("account_id").gte("date").lte("date")` — 제한 없이 전수 조회. 데이터 많은 계정이 오면 서버가 죽을 수 있다.

### 파일
- `src/app/api/protractor/insights/route.ts` (34~40줄 부근)

### 검증 기준
- 합리적인 limit 설정 또는 기간 제한
- 필요 컬럼만 select
- 기존 대시보드 기능 정상 동작 유지
- `npm run build` 성공

### 하지 말 것
- 인사이트 수집 로직 변경 금지
- DB 스키마 변경 금지
