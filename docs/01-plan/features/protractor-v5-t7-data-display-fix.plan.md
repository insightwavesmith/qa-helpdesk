# T7. 총가치각도기 데이터 표시 이슈 — Plan

> 작성일: 2026-03-04
> 스프린트: 총가치각도기 v5

## 1. 개요

- **기능**: 수집된 `daily_ad_insights` 데이터가 있을 때 게이지 + T3 점수 + 등급 + 핵심 지표가 정상 표시되도록 수정
- **증상**: `daily_ad_insights`에 데이터 존재 (3/2: 541건, 3/1: 436건), 헤더("3월 2일 · 75개 광고")는 정상 표시되나 게이지/점수가 렌더링 안 됨
- **영향 범위**: `/api/protractor/total-value` API + `TotalValueGauge` 컴포넌트

## 2. 현재 상태 분석

### 데이터 흐름
```
real-dashboard.tsx
  → /api/protractor/insights    (← 정상 동작: 헤더에 데이터 표시)
  → /api/protractor/total-value (← 이슈: 게이지/점수 미표시)
     → computeMetricValues(rows)
     → fetchBenchmarks()
     → calculateT3Score()
     → response: { score, grade, diagnostics, metrics, hasBenchmarkData }
```

### total-value API 동작 분석

**정상 케이스** (벤치마크 있을 때):
- `calculateT3Score(metricValues, benchMap)` → score=1~100, grade=A~F
- 게이지 정상 렌더링

**벤치마크 없을 때** (현재 추정 상황):
- `benchMap = {}` → 모든 지표 score=null
- `partScore = 0` for all parts (scores.length === 0)
- `t3Score = 0`, `grade = { grade: "F", label: "위험" }`
- `hasBenchmarkData = false`
- API 응답: `{ score: 0, grade: { grade: "F", label: "위험" }, hasBenchmarkData: false }`

**TotalValueGauge 처리**:
```tsx
const noBenchmark = data.hasBenchmarkData === false;
const noScore = data.score == null || !data.grade;
// score=0 → noScore=false (null 아님)
// grade=F → noScore=false
// → 게이지 렌더링됨, but 0점/F등급 표시
```

### 가능한 문제 원인

**원인 A — API 500 에러**:
- `computeMetricValues` 또는 `fetchBenchmarks`에서 예외 발생
- → `setTotalValue(null)` → "데이터를 불러올 수 없습니다" 표시

**원인 B — API 403 에러 (권한 검증 실패)**:
- `verifyAccountOwnership`이 false 반환
- → 403 응답 → `setTotalValue(null)` → 게이지 미표시
- insights API는 같은 ownership 체크 사용이지만 혹시 다른 account_id 파라미터 전달?

**원인 C — 벤치마크 없어서 0점/F등급으로 표시되지만 사용자가 "안 됨"으로 인식**:
- 실제로는 렌더링되나 0점 F등급이 비정상으로 보임
- 해결: 벤치마크 없을 때 계산 없이 원시 지표만 표시하는 fallback UI 개선

**원인 D — 날짜 범위 파라미터 오류**:
- `period` 파라미터와 `date_start/date_end`가 불일치
- API에서 `periodToDateRange(period)` fallback을 사용하면 UI에서 선택한 날짜와 다른 범위 조회

## 3. 핵심 요구사항

### 기능적 요구사항
- FR-01: `daily_ad_insights`에 데이터가 있으면 게이지가 렌더링되어야 함 (점수가 0이어도)
- FR-02: 벤치마크가 없을 때도 "수집된 데이터 기준" 원시 지표값(3초시청률, CTR 등)은 표시
- FR-03: API 오류 발생 시 적절한 에러 메시지 표시
- FR-04: 정상 데이터 시 게이지 + T3 점수 + 등급 + SummaryCards 6개 모두 표시

### 비기능적 요구사항
- 데이터 수집 로직(`collect-daily`) 변경 금지
- 벤치마크 수집 로직 변경 금지

## 4. 범위

### 포함
- `/api/protractor/total-value/route.ts` — 에러 로깅 강화, 원인 파악
- `real-dashboard.tsx` — API 에러 시 UI 처리 개선
- `TotalValueGauge.tsx` — 벤치마크 없을 때 UI 개선 (0점 fallback 가이드 텍스트)

### 제외
- `collect-daily` 수집 로직 변경 금지
- `benchmarks` 관련 수집 로직 변경 금지
- T3 점수 계산 알고리즘 변경

## 5. 진단 절차

```
1. 브라우저 Network 탭에서 /api/protractor/total-value 응답 확인
   → status 200이면 response body 확인
   → status 4xx/5xx이면 에러 원인 파악

2. status 200인데 score=null → calculateT3Score 반환값 확인
   → t3-engine.ts 로직 검토

3. status 403 → verifyAccountOwnership 실패 원인
   → ad_accounts 테이블에 해당 user_id + account_id 조합 존재 여부 확인

4. status 500 → 서버 에러 로그 확인
   → computeMetricValues 또는 fetchBenchmarks 에러
```

## 6. 성공 기준

- [ ] `/api/protractor/total-value` 응답이 status 200으로 반환된다
- [ ] 게이지가 (벤치마크 없어도) 점수/등급과 함께 표시된다
- [ ] SummaryCards에 수집된 데이터 기반 6개 지표가 표시된다
- [ ] 벤치마크 없을 때 안내 배너가 적절히 표시된다
- [ ] `npm run build` 성공

## 7. 실행 순서

1. 브라우저 콘솔/네트워크로 API 응답 직접 확인 → 원인 특정
2. 원인별 수정 (4xx → auth/ownership fix, 500 → 에러 처리, 200 but bad data → UI fix)
3. 벤치마크 없을 때 UI 개선 (fallback 메시지 개선)
4. 빌드 확인
