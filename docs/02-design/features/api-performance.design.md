# 총가치각도기 API 응답속도 개선 설계서

## 1. 데이터 모델
기존 테이블 활용. 신규 테이블 없음.
- `daily_overlap_insights` — overlap 결과 캐시 (기존, 미활용 → 활용)
- `t3_scores_precomputed` — T3 점수 캐시 (기존, period 1/14 추가)
- `adset_overlap_cache` — pair별 캐시 (기존)

## 2. API 설계 (변경 없음, 내부 로직만 최적화)

### GET /api/protractor/overlap
```
Before: DB조회(daily_overlap_insights) → DB조회(adset_overlap_cache) → Meta API
After:  DB조회(daily_overlap_insights) → DB조회(adset_overlap_cache) → Meta API → daily_overlap_insights 저장
```
- 계산 완료 후 `daily_overlap_insights`에 upsert 추가
- fetchActiveAdsets: 캠페인별 adset 조회를 Promise.all로 병렬화

### GET /api/protractor/total-value
```
Before: PRECOMPUTED_PERIODS = [7, 30, 90]
After:  PRECOMPUTED_PERIODS = [1, 7, 14, 30, 90]
```
- fetchBenchmarks: 2회 쿼리 → 1회로 통합

### GET /api/protractor/insights
- select 컬럼 변경 없음 (클라이언트에서 모두 사용)
- `.order("date", { ascending: true })` 유지

## 3. 컴포넌트 구조

### swr-provider.tsx
- prefetchKeys에서 `PROTRACTOR_ACCOUNTS` 제거

## 4. 에러 처리
변경 없음. 기존 에러 핸들링 유지.

## 5. 구현 순서
- [x] T1: swr-provider.tsx accounts prefetch 제거
- [x] T2: overlap API — daily_overlap_insights 저장 + fetchActiveAdsets 병렬화
- [x] T3: total-value API — PRECOMPUTED_PERIODS 확대 + fetchBenchmarks 최적화
- [x] T3b: t3-precompute.ts — period 1, 14 추가
- [x] T4: 벤치마크 쿼리 1회로 통합
