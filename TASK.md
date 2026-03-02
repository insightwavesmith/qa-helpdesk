# TASK.md — 총가치각도기 성과요약 분석 + 코드리뷰

## 중요: 코드 수정 하지 마라. 분석과 코드리뷰만.

## 배경
총가치각도기 성과요약 탭 수정을 2번 시도했으나 2번 다 QA FAIL.
에이전트팀이 "수정 완료"라고 보고했지만 실제 화면에서는 변화 없음.

## 해야 할 것

### 1. 현재 상태 분석
- src/app/(main)/protractor/ 관련 파일 전부 읽기
- real-dashboard.tsx가 실제로 렌더링하는 컴포넌트 목록
- 성과요약 탭에 현재 어떤 컴포넌트가 표시되는지 정확히 파악
- TotalValueGauge, SummaryCards, DiagnosticPanel, OverlapAnalysis 각각의 상태

### 2. 이전 수정이 반영 안 된 이유 분석
- showMetricCards prop이 실제로 적용됐는지
- EngagementTotalCard가 렌더링되는지, null 반환하는지
- DiagnosticPanel이 실제로 제거됐는지
- 조건부 렌더링 (데이터 없을 때 fallback)이 원인인지

### 3. Plan/Design vs 실제 코드 diff
- docs/01-plan/features/c1-protractor-summary-cleanup.plan.md
- docs/02-design/features/c1-protractor-summary-cleanup.design.md
- 위 문서에서 요구한 것 vs 실제 코드 1:1 대조

### 4. 수정 방안 제시
- 코드 수정하지 말고, "이 파일의 이 줄을 이렇게 바꿔야 한다"는 구체적 방안만 보고

## 기대하는 최종 상태 (참고)
- 성과요약 탭: 게이지(T3 점수) + A/B/C 등급 카드 3장 + 참여합계만 + SummaryCards 6개 + OverlapAnalysis
- 9개 개별 지표 카드 제거
- DiagnosticPanel 제거

## 하지 말 것
- 코드 수정
- 파일 생성/삭제
- npm run build
