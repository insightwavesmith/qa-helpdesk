# 성능 코드 리뷰 — T1~T4 성능개선 결과물 검증 + P0 잔여 이슈

## 타입
개발 (코드 리뷰 + 구현)

## 배경
`d1fb047` 커밋에서 SWR 프리페치 등 성능 개선을 했으나, 실제 캐시 히트율 검증이 안 됐고
P0 잔여 이슈(overlap 순차 호출, limit 하드코딩, 안전장치 미비)가 남아있음.

## 범위

### T1. SWR 프리페치 검증 + 최적화
- 프리페치 키와 페이지 SWR 키 일치 확인
- dedupingInterval, revalidateOnFocus 설정 검증
- 불필요한 refetch 수정

### T2. overlap API 병렬화 (P0)
- `src/app/api/protractor/overlap/route.ts:208~267`
- 순차 Meta API → Promise.allSettled 병렬화 (concurrency 3~5)
- 개별 pair 실패해도 나머지 정상 반환
- 기존 캐시 로직 유지

### T3. total-value limit 하드코딩 제거
- `src/app/api/protractor/total-value/route.ts:100` `.limit(1000)` 제거
- 필요 컬럼만 select

### T4. daily_ad_insights 안전장치
- `src/app/api/protractor/insights/route.ts:33~42`
- limit 또는 기간 제한 추가
- 필요 컬럼만 select

## 성공 기준
- [ ] T1: SWR 키 불일치 0건
- [ ] T2: overlap 호출 병렬화 + 에러 격리
- [ ] T3: limit 1000 제거 + select 최적화
- [ ] T4: insights 안전장치 + select 최적화
- [ ] npm run build 성공
