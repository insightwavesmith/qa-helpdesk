# T5. 참여합계 제거 — Design

> 작성일: 2026-03-04
> 스프린트: 총가치각도기 v5

## 1. 현행 구조

### real-dashboard.tsx 관련 코드 (현재)

```tsx
// 라인 267~282: engagementData 계산
const engagementData = (() => {
  if (!totalValue?.diagnostics) return null;
  const engPart = Object.values(totalValue.diagnostics)
    .find((p) => p.label === "참여율");
  const engMetric = engPart?.metrics?.find((m) => m.key === "engagement_per_10k");
  if (!engMetric) return null;
  return {
    value: engMetric.value ?? 0,
    benchmark: engMetric.pctOfBenchmark != null
      ? (engMetric.value ?? 0) / (engMetric.pctOfBenchmark / 100) : 0,
    score: engMetric.score ?? 0,
    grade: engMetric.score != null
      ? (engMetric.score >= 75 ? "A" : engMetric.score >= 50 ? "B" : "C") : "F",
  };
})();

// 라인 283: noBenchmarkFlag
const noBenchmarkFlag = totalValue?.hasBenchmarkData === false;

// 라인 382~385: EngagementTotalCard 렌더링
<EngagementTotalCard
  engagementTotal={engagementData}
  noBenchmark={noBenchmarkFlag}
/>
```

### import 현황
```tsx
import {
  ProtractorHeader,
  SummaryCards,
  TotalValueGauge,
  EngagementTotalCard,   // ← 제거 대상
  OverlapAnalysis,
  type OverlapData,
} from "@/components/protractor";
```

## 2. 변경 설계

### 2-1. real-dashboard.tsx 변경

**Import 수정**:
```tsx
// Before
import {
  ProtractorHeader,
  SummaryCards,
  TotalValueGauge,
  EngagementTotalCard,
  OverlapAnalysis,
  type OverlapData,
} from "@/components/protractor";

// After
import {
  ProtractorHeader,
  SummaryCards,
  TotalValueGauge,
  OverlapAnalysis,
  type OverlapData,
} from "@/components/protractor";
```

**상태 변수 정리** (engagementData IIFE 전체 삭제):
```tsx
// 삭제: engagementData 계산 블록 (라인 267~282)
// 삭제: noBenchmarkFlag 라인 (라인 283)
//   → noBenchmarkFlag가 TotalValueGauge에서도 사용되는지 확인
//   → TotalValueGauge는 data.hasBenchmarkData를 자체적으로 읽으므로 외부 prop 불필요 → 삭제 가능
```

**렌더링 블록 삭제**:
```tsx
// 삭제: 성과요약 탭 내 EngagementTotalCard 렌더링 전체
// Before:
{/* 3a-1. 참여합계 지표 카드 (C1-v2: fallback UI 포함) */}
<EngagementTotalCard
  engagementTotal={engagementData}
  noBenchmark={noBenchmarkFlag}
/>

// After: 해당 블록 없음
```

### 2-2. sample-dashboard.tsx 확인

- `sample-dashboard.tsx` 내 `EngagementTotalCard` 사용 여부 확인
- 현재: 미사용 (별도 dummy 데이터 사용) → 변경 불필요
- 만약 사용 중이라면 동일하게 제거

### 2-3. 성과요약 탭 최종 렌더링 순서

| 순서 | 컴포넌트 | 변경 |
|------|---------|------|
| 1 | `TotalValueGauge` (showMetricCards=false) | 유지 |
| ~~2~~ | ~~`EngagementTotalCard`~~ | **제거** |
| 2 | `SummaryCards` (6개) | 유지 |
| 3 | `OverlapAnalysis` | 유지 |

## 3. 영향 범위

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `src/app/(main)/protractor/real-dashboard.tsx` | 수정 | import 제거 + engagementData/noBenchmarkFlag + 렌더링 제거 |
| `src/app/(main)/protractor/sample-dashboard.tsx` | 확인 | 사용 여부 확인 후 제거 또는 유지 |
| `src/components/protractor/EngagementTotalCard.tsx` | 유지 | 파일 삭제 금지 (다른 참조 가능성) |
| `src/components/protractor/index.ts` | 유지 | export 유지 |

## 4. 에러 처리

- `engagementData`가 제거되므로 관련 null 체크 불필요
- 빌드 시 TS unused import 에러 발생 가능 → import에서 `EngagementTotalCard` 즉시 제거로 해결
- `noBenchmarkFlag` 사용처가 EngagementTotalCard 외에 없으면 변수 제거 → 있으면 유지

## 5. 구현 체크리스트

- [ ] `EngagementTotalCard` import 제거
- [ ] `engagementData` IIFE 블록 삭제
- [ ] `noBenchmarkFlag` 사용처 확인 → 미사용 시 삭제
- [ ] `<EngagementTotalCard>` JSX 블록 삭제
- [ ] `sample-dashboard.tsx` 확인
- [ ] `tsc --noEmit` 에러 없음 확인
- [ ] `npm run build` 성공
