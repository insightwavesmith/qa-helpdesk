# T1. SummaryCards 하드코딩 데이터 제거 — Design

> 최종 갱신: 2026-03-01

## 1. 현행 구조

### SummaryCards.tsx (현재)
```typescript
const defaultCards: SummaryCardData[] = [
  { label: "총 광고비", value: "834,500", prefix: "₩", changePercent: 8, changeLabel: "전기간 대비" },
  { label: "총 클릭", value: "4,280", changePercent: 12, changeLabel: "전기간 대비" },
  { label: "총 구매", value: "132", changePercent: 18, changeLabel: "전기간 대비" },
  { label: "ROAS", value: "2.85", changePercent: 5, changeLabel: "전기간 대비" },
];

export function SummaryCards({ cards = defaultCards }: SummaryCardsProps) { ... }
```
- `cards` prop이 전달되지 않으면 항상 더미 데이터 표시

### PerformanceTrendChart.tsx (현재)
- 27개 샘플 데이터 포인트 (1/10~2/6) 하드코딩
- `data` prop 미전달 시 `defaultData` 사용

## 2. 변경 설계

### 2-1. SummaryCards.tsx 변경

**Before**:
```typescript
export function SummaryCards({ cards = defaultCards }: SummaryCardsProps) {
```

**After**:
```typescript
export function SummaryCards({ cards }: SummaryCardsProps) {
  if (!cards || cards.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
        광고 데이터가 없습니다.
      </div>
    );
  }
  // 기존 렌더링 로직 유지
```

- `defaultCards` 상수 완전 제거
- empty state UI: 기존 카드 영역에 "광고 데이터가 없습니다" 표시

### 2-2. PerformanceTrendChart.tsx 변경

**Before**:
```typescript
export function PerformanceTrendChart({ data = defaultData }: PerformanceTrendChartProps) {
```

**After**:
```typescript
export function PerformanceTrendChart({ data }: PerformanceTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        차트 데이터가 없습니다.
      </div>
    );
  }
  // 기존 렌더링 로직 유지
```

- `defaultData` 상수 완전 제거

### 2-3. 상위 컴포넌트 확인

| 파일 | SummaryCards 사용 | 데이터 전달 여부 |
|------|------------------|----------------|
| real-dashboard.tsx | O | 확인 필요 — 실제 DB 데이터를 cards prop으로 전달하고 있는지 점검 |
| sample-dashboard.tsx | O | 확인 필요 — 샘플 대시보드에서도 props 전달 점검 |

- 만약 상위에서 cards를 전달하지 않고 있다면, 이미 서버에서 조회한 데이터를 SummaryCardData[] 형태로 매핑하여 전달해야 함
- **새 API는 만들지 않음** — 기존 protractor 관련 server action/fetch 로직 활용

## 3. 영향 범위

| 파일 | 변경 유형 |
|------|----------|
| `src/components/protractor/SummaryCards.tsx` | defaultCards 제거 + empty state |
| `src/components/protractor/PerformanceTrendChart.tsx` | defaultData 제거 + empty state |
| `src/app/(main)/protractor/real-dashboard.tsx` | props 전달 확인/수정 |
| `src/app/(main)/protractor/sample-dashboard.tsx` | props 전달 확인/수정 |

## 4. 에러 처리
- cards/data가 undefined, null, 빈 배열 → empty state 표시
- 상위에서 DB 조회 실패 → props 미전달 → 자연스럽게 empty state 표시됨
