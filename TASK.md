# TASK.md — 총가치각도기 P0: 미연결 컴포넌트 연결 + 벤치마크 표시 (2026-02-24)

> 작성: 모찌 | 승인 대기

---

## 배경

총가치각도기(Protractor)에서 `benchmarks`와 `lpMetrics` 데이터를 API로 가져오지만
`void` 처리되어 화면에 표시되지 않고 있음. GCP 원본과 동일한 판정 공식(`aboveAvg × 0.75`)은 이미 구현됨.

## T1. void 제거 + BenchmarkCompare / AdMetricsTable 렌더링

**파일:** `src/app/(main)/protractor/real-dashboard.tsx`

**수정:**
1. 261~262행 `void lpMetrics; void benchmarks;` 제거
2. `BenchmarkCompare` 컴포넌트 import + 렌더링 추가
   - 이미 존재: `src/app/(main)/protractor/components/benchmark-compare.tsx`
   - insights + benchmarks props 전달
3. `AdMetricsTable` 컴포넌트 렌더링 추가
   - 이미 존재: `src/app/(main)/protractor/components/ad-metrics-table.tsx`
   - insights + benchmarks props 전달
4. 렌더링 위치: 기존 `DailyMetricsTable` 아래 또는 `SummaryCards` 아래 적절한 위치

**완료 기준:** 벤치마크 데이터가 대시보드에 표시됨

## T2. LP Metrics 카드 연결 (데이터 있을 때만)

**파일:** `src/app/(main)/protractor/real-dashboard.tsx`

**수정:**
1. `LpMetricsCard` 컴포넌트 렌더링 추가
   - 이미 존재: `src/app/(main)/protractor/components/lp-metrics-card.tsx`
   - lpMetrics props 전달
2. `lpMetrics.length > 0` 일 때만 표시 (GCP도 LP 섹션 비활성화 상태이므로 데이터 없으면 숨김)

**완료 기준:** LP 데이터 있으면 표시, 없으면 숨김 (에러 없음)

## T3. below_avg 실제 데이터 계산

**파일:** `src/app/api/cron/collect-benchmarks/route.ts`

**현재:** `belowVal = avgVal * 0.5` (추정값)
**수정:** `belowVal = percentile(values, 25)` (실제 p25 계산)

**완료 기준:** benchmarks 테이블의 below_avg가 실제 하위 분포 기반

---

## 검증

1. `npm run build` 성공
2. 총가치각도기 페이지에서 벤치마크 비교 테이블 표시 확인
3. 커밋 + 푸시
