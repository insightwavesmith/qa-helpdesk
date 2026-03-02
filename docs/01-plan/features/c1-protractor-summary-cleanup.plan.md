# C1. 총가치각도기 성과요약 정리 — Plan

> 작성: 2026-03-02
> 선행 작업: protractor-refactoring (implementing), t1-summary-cards-hardcoded (completed), t2-protractor-margin (completed)

## 1. 개요
- **기능**: 성과요약 탭을 간결하게 정리하여 진단상세 탭과 차별화
- **해결하려는 문제**: 성과요약 탭에 게이지 + 9개 지표 카드 + SummaryCards 6개 + DiagnosticPanel + OverlapAnalysis가 전부 표시되어 진단상세와 거의 같은 내용 반복
- **핵심**: 성과요약 = 핵심 지표만 한눈에 / 진단상세 = 개별 지표 상세 분석

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **TotalValueGauge 내 9개 개별 지표 카드 제거** — 현재 3×3 그리드로 표시되는 개별 지표 카드(영상3 + 참여3 + 전환3)를 성과요약에서 제거
- FR-02: **A/B/C 등급 카드 3장 유지** — 기반점수/참여율/전환율 파트별 등급 카드는 유지
- FR-03: **참여합계 지표 표시** — 참여율 파트의 합계(engagement_total) 지표만 성과요약에 표시
- FR-04: **게이지(T3 점수) 유지** — 반원형 SVG 게이지 유지
- FR-05: **SummaryCards 6개 유지** — 광고비/노출/도달/클릭/구매/ROAS
- FR-06: **OverlapAnalysis 유지** — 타겟중복 분석 유지
- FR-07: **DiagnosticPanel 제거** — 성과요약에서 제거 (진단상세에서 볼 수 있음)

### 비기능적 요구사항
- 진단 엔진 로직 변경 금지
- 콘텐츠 탭 변경 금지
- 벤치마크 계산 방식 변경 금지
- metric-groups.ts 변경 금지

## 3. 범위

### 포함
- `src/app/(main)/protractor/real-dashboard.tsx` — 성과요약 탭 렌더링 순서 변경
- `src/components/protractor/TotalValueGauge.tsx` — 9개 지표 카드 그리드 제거 (또는 prop으로 숨김)
- 참여합계 지표 표시 컴포넌트 추가 (간단한 카드)

### 제외
- `src/lib/protractor/t3-engine.ts` — 진단 엔진 로직
- `src/lib/protractor/metric-groups.ts` — 지표 정의
- 진단상세 탭 (DiagnosticPanel은 진단상세에서 그대로 사용)
- 콘텐츠 탭
- 벤치마크 계산

## 4. 성공 기준
- [ ] 성과요약 탭에 게이지(T3 점수)가 표시됨
- [ ] 성과요약 탭에 A/B/C 등급 카드 3장(기반/참여/전환)이 표시됨
- [ ] 성과요약 탭에 참여합계 지표가 표시됨
- [ ] 성과요약 탭에 9개 개별 지표 카드가 표시되지 않음
- [ ] 성과요약 탭에 DiagnosticPanel이 표시되지 않음
- [ ] SummaryCards 6개 정상 표시
- [ ] OverlapAnalysis 정상 표시
- [ ] 진단상세 탭의 DiagnosticPanel은 기존과 동일하게 작동
- [ ] 진단 엔진/벤치마크 로직 변경 없음
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `TotalValueGauge.tsx` 분석 — 9개 지표 카드가 렌더링되는 부분 확인
2. `TotalValueGauge.tsx` 수정 — prop(`showMetricCards?: boolean`)으로 카드 그리드 토글하거나, 별도 컴포넌트 분리
3. `real-dashboard.tsx` — 성과요약 탭에서 DiagnosticPanel 제거
4. 참여합계 지표 표시 UI 추가
5. 빌드 확인
