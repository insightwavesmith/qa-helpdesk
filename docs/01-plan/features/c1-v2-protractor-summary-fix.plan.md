# C1-v2. 총가치각도기 성과요약 정리 — 근본 수정 Plan

> 작성: 2026-03-02
> 선행: c1-protractor-summary-cleanup (QA 2회 FAIL — 코드 수정은 맞으나 시각 변화 미반영)
> 분석 보고서: TASK.md 코드리뷰 결과 참조

## 1. 개요
- **기능**: C1의 동일한 목표 (성과요약 탭 간결화) + QA FAIL 근본 원인 해결
- **해결하려는 문제**: C1 코드 수정은 올바르나, TotalValueGauge의 3개 early return 경로가 `showMetricCards` prop을 무효화하여 벤치마크 없는 계정에서 시각 변화 없음
- **추가 수정**: SummaryCards 4개→6개 불일치, EngagementTotalCard silent null, 진단상세 탭 부재

## 2. QA FAIL 근본 원인 요약

### 원인 1 (Critical): TotalValueGauge early return
- `hasBenchmarkData === false` → 176~186줄에서 "벤치마크 데이터 없음" 카드 반환
- `data.score == null || !data.grade` → 189~199줄에서 "데이터 없음" 카드 반환
- 위 두 경로에서는 9개 지표 카드가 **원래부터 렌더링되지 않음** → `showMetricCards={false}`가 무의미

### 원인 2 (High): EngagementTotalCard silent null
- `totalValue?.diagnostics` null → 참여합계 카드 미렌더 (fallback 없음)
- 신규 추가 컴포넌트가 보이지 않아 "추가된 것 없음" 느낌

### 원인 3 (Medium): SummaryCards 개수 불일치
- 설계서: 6개 (광고비/노출/도달/클릭/구매/ROAS)
- 실제 `toSummaryCards()`: 4개 (광고비/클릭/구매/ROAS) — 노출, 도달 누락

### 원인 4 (Low): DiagnosticPanel 볼 곳 없음
- C1에서 성과요약 탭에서 제거했으나, "진단상세" 탭이 존재하지 않음
- 현재 탭: 성과요약 / 콘텐츠 (2개만)

## 3. 핵심 요구사항

### 기능적 요구사항
- FR-01: **TotalValueGauge — early return 경로 제거/수정** — 벤치마크 없어도 게이지+파트바 렌더링. 벤치마크 미설정 안내는 게이지 내부 배너로 대체.
- FR-02: **EngagementTotalCard — fallback UI 추가** — 데이터 없을 때 "벤치마크 설정 후 확인 가능" 등 안내 카드 표시. null 반환 금지.
- FR-03: **SummaryCards 6개로 확장** — 노출(impressions), 도달(reach) 카드 추가
- FR-04: (선택) **진단 상세 탭 추가** — 3번째 탭으로 DiagnosticPanel 표시
- FR-05: C1의 기존 요구사항 유지 (showMetricCards={false}, DiagnosticPanel 성과요약에서 제거)

### 비기능적 요구사항
- 진단 엔진(t3-engine.ts) 로직 변경 금지
- metric-groups.ts 변경 금지
- 기존 API 응답 형태 변경 최소화
- `npm run build` 성공

## 4. 범위

### 포함
- `src/components/protractor/TotalValueGauge.tsx` — early return 경로 수정
- `src/components/protractor/EngagementTotalCard.tsx` — fallback UI 추가
- `src/lib/protractor/aggregate.ts` — toSummaryCards에 노출/도달 추가
- `src/app/(main)/protractor/real-dashboard.tsx` — EngagementTotalCard 렌더링 조건 수정, (선택) 진단상세 탭 추가
- `src/app/(main)/protractor/real-dashboard.tsx` — 미사용 DiagnosticPanel import 제거 (현재 uncommitted)

### 제외
- `src/lib/protractor/t3-engine.ts` — 엔진 로직
- `src/lib/protractor/metric-groups.ts` — 지표 정의
- `src/app/api/protractor/total-value/route.ts` — API 응답 구조
- 콘텐츠 탭
- 벤치마크 계산

## 5. 성공 기준
- [ ] **벤치마크 없는 계정**에서 성과요약 탭에 게이지가 표시됨 (점수 0, F등급이라도)
- [ ] **벤치마크 없는 계정**에서 9개 지표 카드가 표시되지 않음
- [ ] **벤치마크 없는 계정**에서 EngagementTotalCard가 "벤치마크 미설정" 안내로 표시됨
- [ ] SummaryCards가 6개 (광고비/노출/도달/클릭/구매/ROAS)
- [ ] DiagnosticPanel이 성과요약 탭에 없음
- [ ] (선택) 진단상세 탭에서 DiagnosticPanel 정상 표시
- [ ] 벤치마크 있는 계정에서도 동일하게 정상 작동
- [ ] `npm run build` 성공
- [ ] QA: 데스크탑(1920px) + 모바일(375px) 스크린샷 확인

## 6. 실행 순서
1. `TotalValueGauge.tsx` — `hasBenchmarkData === false` early return 제거, 게이지 내부에 안내 배너 추가
2. `TotalValueGauge.tsx` — `!data || data.score == null || !data.grade` 경로도 데이터 부분 표시로 변경 (게이지는 0점으로 표시)
3. `EngagementTotalCard.tsx` — fallback UI 추가 (null 미반환)
4. `real-dashboard.tsx` — EngagementTotalCard 렌더링 조건 개선 (IIFE 대신 명확한 조건문)
5. `aggregate.ts` — toSummaryCards에 노출/도달 추가
6. (선택) `real-dashboard.tsx` — 진단상세 탭 추가
7. 미사용 import 정리
8. 빌드 확인
9. QA: 벤치마크 없는 계정 + 있는 계정 모두 테스트

## 7. 위험 요소
| 위험 | 완화 방안 |
|------|----------|
| TotalValueGauge 0점 F등급 게이지가 사용자에게 부정적 | 벤치마크 미설정 안내 배너 + "벤치마크 설정 시 정확한 점수 확인" 문구 |
| SummaryCards 6개 레이아웃 변경 | 기존 3×2 그리드 유지 (grid-cols-3 lg:grid-cols-6) |
| 진단상세 탭 추가 시 탭 UX 변경 | (선택사항) 추가하지 않으면 DiagnosticPanel 완전 미노출 |
