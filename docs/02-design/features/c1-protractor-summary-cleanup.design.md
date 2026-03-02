# C1. 총가치각도기 성과요약 정리 — 설계서

> 작성: 2026-03-02
> 참조: protractor-refactoring.design.md, t1-summary-cards-hardcoded.design.md

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음, 기존 데이터로 UI만 조정)

## 3. 컴포넌트 구조

### 3-1. 성과요약 탭 레이아웃 변경

**파일**: `src/app/(main)/protractor/real-dashboard.tsx`

**현재 성과요약 탭 렌더링 순서**:
```
1. TotalValueGauge (게이지 + 파트별 점수바 + 9개 지표 카드 3×3 그리드)
2. SummaryCards (광고비/노출/도달/클릭/구매/ROAS)
3. DiagnosticPanel (T3 3컬럼 진단)
4. OverlapAnalysis (타겟중복)
```

**수정 후 성과요약 탭 렌더링 순서**:
```
1. TotalValueGauge (게이지 + 파트별 등급 카드 3장만, 9개 지표 카드 숨김)
2. EngagementTotalCard (참여합계 지표 — 신규)
3. SummaryCards (광고비/노출/도달/클릭/구매/ROAS)
4. OverlapAnalysis (타겟중복)
```

**제거 항목**:
- TotalValueGauge 내 9개 개별 지표 카드 그리드
- DiagnosticPanel (진단상세 탭에서만 표시)

### 3-2. TotalValueGauge 수정

**파일**: `src/components/protractor/TotalValueGauge.tsx`

**현재 구조** (요약):
```tsx
export function TotalValueGauge({ totalValue, parts, metrics }: Props) {
  return (
    <div>
      {/* 1. 반원형 SVG 게이지 — 유지 */}
      <GaugeSVG score={totalValue.score} grade={totalValue.grade} />

      {/* 2. 파트별 점수바 (기반/참여/전환) — 유지 */}
      <PartScoreBars parts={parts} />

      {/* 3. 9개 지표 카드 3×3 그리드 — 제거 대상 */}
      <div className="grid grid-cols-3 gap-3">
        {metrics.map(m => <MetricCard key={m.key} ... />)}
      </div>
    </div>
  );
}
```

**수정 방안**: `showMetricCards` prop 추가

```tsx
interface TotalValueGaugeProps {
  totalValue: { score: number; grade: string };
  parts: PartScore[];
  metrics: MetricValue[];
  showMetricCards?: boolean; // default: true (하위 호환)
}

export function TotalValueGauge({
  totalValue, parts, metrics,
  showMetricCards = true
}: TotalValueGaugeProps) {
  return (
    <div>
      {/* 1. 반원형 SVG 게이지 — 항상 표시 */}
      <GaugeSVG score={totalValue.score} grade={totalValue.grade} />

      {/* 2. 파트별 점수바 — 항상 표시 */}
      <PartScoreBars parts={parts} />

      {/* 3. 9개 지표 카드 — prop에 따라 표시/숨김 */}
      {showMetricCards && (
        <div className="grid grid-cols-3 gap-3">
          {metrics.map(m => <MetricCard key={m.key} ... />)}
        </div>
      )}
    </div>
  );
}
```

**real-dashboard.tsx 사용**:
```tsx
// 성과요약 탭
<TotalValueGauge
  totalValue={totalValue}
  parts={parts}
  metrics={metrics}
  showMetricCards={false}  // 9개 카드 숨김
/>

// 진단상세 탭 (기존과 동일)
<TotalValueGauge
  totalValue={totalValue}
  parts={parts}
  metrics={metrics}
  showMetricCards={true}  // 또는 생략 (default: true)
/>
```

### 3-3. EngagementTotalCard (신규 컴포넌트)

**파일**: `src/components/protractor/EngagementTotalCard.tsx` (신규)

참여율 파트의 합계 지표만 별도 카드로 표시.

```tsx
interface EngagementTotalCardProps {
  engagementTotal: {
    value: number;      // 참여합계 값
    benchmark: number;  // 벤치마크 기준값
    score: number;      // 점수 (0~100)
    grade: string;      // 등급 (A~F)
  };
}

export function EngagementTotalCard({ engagementTotal }: EngagementTotalCardProps) {
  const ratio = engagementTotal.benchmark > 0
    ? (engagementTotal.value / engagementTotal.benchmark * 100).toFixed(0)
    : "-";

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5 mt-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">참여합계</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">
            {engagementTotal.value.toLocaleString()}
          </p>
        </div>
        <div className="text-right">
          <span className={`
            inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold
            ${gradeColor(engagementTotal.grade)}
          `}>
            {engagementTotal.grade}등급
          </span>
          <p className="text-xs text-gray-400 mt-1">
            벤치마크 대비 {ratio}%
          </p>
        </div>
      </div>
    </div>
  );
}
```

> 참여합계 데이터는 기존 `totalValue` API 응답의 파트별 지표에서 추출. t3-engine.ts의 `computeMetricValues()`가 이미 engagement_total을 계산하고 있음.

### 3-4. real-dashboard.tsx 수정

**파일**: `src/app/(main)/protractor/real-dashboard.tsx`

**성과요약 탭 렌더링 수정**:

```tsx
// Before (현재)
{activeTab === "summary" && (
  <>
    <TotalValueGauge totalValue={totalValue} parts={parts} metrics={metrics} />
    <SummaryCards cards={summaryCards} />
    <DiagnosticPanel diagnostics={diagnostics} />
    <OverlapAnalysis overlap={overlapData} />
  </>
)}

// After
{activeTab === "summary" && (
  <>
    <TotalValueGauge
      totalValue={totalValue}
      parts={parts}
      metrics={metrics}
      showMetricCards={false}
    />
    <EngagementTotalCard engagementTotal={engagementMetric} />
    <SummaryCards cards={summaryCards} />
    <OverlapAnalysis overlap={overlapData} />
  </>
)}
```

**진단상세 탭** (기존과 동일, DiagnosticPanel 여기서 표시):
```tsx
{activeTab === "detail" && (
  <>
    <TotalValueGauge totalValue={totalValue} parts={parts} metrics={metrics} />
    <DiagnosticPanel diagnostics={diagnostics} />
  </>
)}
```

> 주의: 진단상세 탭이 이미 존재하는지 확인 필요. 현재 real-dashboard.tsx에 탭이 "성과 요약" / "콘텐츠" 2개만 있다면, DiagnosticPanel을 표시할 탭이 필요. 현재 탭 구조를 유지하면서 DiagnosticPanel을 제거하되, 향후 "진단 상세" 탭 추가 시 그곳에 배치.

### 3-5. 참여합계 데이터 추출

`real-dashboard.tsx`에서 totalValue API 응답으로부터 참여합계 추출:

```tsx
// totalValue 응답 구조 (기존)
// { score, grade, parts: [{ name: "기반점수", ... }, { name: "참여율", ... }, { name: "전환율", ... }] }

// 참여율 파트에서 engagement_total 지표 추출
const engagementPart = totalValue?.parts?.find(p => p.name === "참여율");
const engagementMetric = engagementPart?.metrics?.find(m => m.key === "engagement_total")
  ?? { value: 0, benchmark: 0, score: 0, grade: "F" };
```

## 4. 에러 처리
- totalValue가 null/undefined인 경우 → 게이지 로딩 스켈레톤 (기존 동작 유지)
- 참여합계 데이터가 없는 경우 → EngagementTotalCard에 "데이터 없음" 표시
- OverlapAnalysis 데이터가 없는 경우 → 기존 "타겟중복 데이터가 없습니다" 메시지 유지

## 5. 구현 순서
- [ ] `TotalValueGauge.tsx` — `showMetricCards` prop 추가 (기존 동작 유지: default true)
- [ ] `EngagementTotalCard.tsx` — 신규 컴포넌트 작성
- [ ] `real-dashboard.tsx` — 성과요약 탭 렌더링 수정 (DiagnosticPanel 제거, showMetricCards={false}, EngagementTotalCard 추가)
- [ ] 진단상세 탭에서 DiagnosticPanel이 정상 표시되는지 확인
- [ ] `npm run build` 성공 확인

## 6. 탭별 컴포넌트 배치 (최종)

| 컴포넌트 | 성과요약 탭 | 진단상세 탭 | 콘텐츠 탭 |
|----------|:-----------:|:-----------:|:---------:|
| TotalValueGauge (게이지+등급바) | ✅ | ✅ | - |
| TotalValueGauge (9개 지표 카드) | ❌ 제거 | ✅ | - |
| EngagementTotalCard | ✅ 신규 | - | - |
| SummaryCards (6개) | ✅ | - | - |
| DiagnosticPanel | ❌ 제거 | ✅ | - |
| OverlapAnalysis | ✅ | - | - |
| ContentRanking | - | - | ✅ |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/components/protractor/TotalValueGauge.tsx` | prop 추가 (하위 호환) | 낮음 |
| `src/components/protractor/EngagementTotalCard.tsx` | 신규 컴포넌트 | 없음 |
| `src/app/(main)/protractor/real-dashboard.tsx` | 렌더링 순서 변경 | 중간 |
| `src/components/protractor/index.ts` | export 추가 | 낮음 |

- 진단 엔진: 변경 없음
- 벤치마크 계산: 변경 없음
- metric-groups.ts: 변경 없음
- API: 변경 없음
