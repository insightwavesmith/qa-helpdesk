# T1. SummaryCards 하드코딩 데이터 제거 — Plan

## 1. 개요
- **기능**: SummaryCards / PerformanceTrendChart에 하드코딩된 더미 데이터를 제거하고, 실제 DB 데이터 기반으로 표시
- **해결하려는 문제**: daily_ad_insights 테이블을 비워도 더미 수치(총 광고비 834,500 등)가 계속 노출됨
- **원인**: `SummaryCards.tsx` 17~20줄 `defaultCards` 배열, `PerformanceTrendChart.tsx`의 `defaultData` 배열이 fallback으로 사용됨

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: SummaryCards가 props로 전달된 실제 DB 데이터를 표시해야 한다
- FR-02: 데이터가 없을 때(cards prop 미전달 또는 빈 배열) "데이터 없음" 상태를 표시하거나 컴포넌트를 숨겨야 한다
- FR-03: PerformanceTrendChart도 동일하게 실제 데이터 기반으로 표시하고, 없으면 빈 상태 처리
- FR-04: 기존 protractor API(server action)에서 데이터를 전달받는 구조 유지

### 비기능적 요구사항
- 기존 컴포넌트 인터페이스(SummaryCardData, PerformanceTrendChartProps) 유형은 유지 가능
- 새 API 엔드포인트 생성 금지

## 3. 범위

### 포함
- `SummaryCards.tsx`의 `defaultCards` 더미 데이터 제거 → 빈 배열 또는 undefined fallback
- `PerformanceTrendChart.tsx`의 `defaultData` 더미 데이터 제거
- 데이터 없음 UI 처리 (빈 상태 메시지 or 컴포넌트 조건부 렌더링)
- 상위 컴포넌트(real-dashboard.tsx, sample-dashboard.tsx)에서 데이터 전달 확인

### 제외
- daily_ad_insights 테이블 구조 변경
- 새 API 엔드포인트 생성
- 데이터 fetch 로직 신규 작성 (기존 protractor API 활용)

## 4. 성공 기준
- [ ] daily_ad_insights에 데이터가 있으면 SummaryCards에 실제 수치가 표시된다
- [ ] daily_ad_insights가 비어있으면 더미 수치 대신 빈 상태가 표시된다
- [ ] PerformanceTrendChart에 하드코딩된 차트 데이터가 없다
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `SummaryCards.tsx` — `defaultCards` 제거, cards가 없거나 빈 배열일 때 empty state 표시
2. `PerformanceTrendChart.tsx` — `defaultData` 제거, data가 없을 때 empty state 표시
3. 상위 컴포넌트(sample-dashboard.tsx 등)에서 실제 데이터가 props로 전달되는지 확인 → 미전달 시 수정
4. 빌드 확인
