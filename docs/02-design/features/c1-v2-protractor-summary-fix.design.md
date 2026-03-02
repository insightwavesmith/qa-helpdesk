# C1-v2. 총가치각도기 성과요약 정리 — 근본 수정 설계서

> 작성: 2026-03-02
> 참조: c1-protractor-summary-cleanup.design.md, c1-v2-protractor-summary-fix.plan.md
> 근본 원인: TotalValueGauge early return이 모든 C1 변경을 무효화

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음)

## 3. 컴포넌트 구조

### 3-1. TotalValueGauge — early return 제거 (핵심 수정)

**파일**: `src/components/protractor/TotalValueGauge.tsx`

**현재 문제: 3개 early return**
```tsx
// 176-186줄: 벤치마크 없으면 전체 게이지 숨김
if (data && data.hasBenchmarkData === false) {
  return (<Card>벤치마크 데이터 없음</Card>);  // ← 9개 카드 도달 안 함
}

// 189-199줄: 점수 null이면 전체 게이지 숨김
if (!data || data.score == null || !data.grade) {
  return (<Card>데이터 없음</Card>);  // ← 9개 카드 도달 안 함
}
```

**수정 방안: early return 제거, 메인 렌더링 내부에서 조건 분기**

```tsx
export function TotalValueGauge({ data, isLoading, showMetricCards = true }: TotalValueGaugeProps) {
  // 1. 로딩 — 유지 (문제없음)
  if (isLoading) {
    return (<Card><Spinner/></Card>);
  }

  // 2. 데이터 완전 없음 — 유지 (문제없음, 이 경우 게이지 자체 불가)
  if (!data) {
    return (<Card>데이터를 불러올 수 없습니다</Card>);
  }

  // 3. 벤치마크 없음 — ★ early return 제거 ★
  //    게이지는 표시하되, 안내 배너 추가
  const noBenchmark = data.hasBenchmarkData === false;
  const noScore = data.score == null || !data.grade;

  // 점수가 없으면 0점 F등급으로 fallback
  const displayScore = data.score ?? 0;
  const displayGrade = data.grade ?? { grade: "F", label: "벤치마크 설정 필요" };
  const gradeStyle = GRADE_STYLES[displayGrade.grade] ?? GRADE_STYLES.F;

  return (
    <Card className="bg-white border border-gray-200">
      <CardContent className="p-5">
        {/* 벤치마크 미설정 안내 배너 */}
        {noBenchmark && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-700">
            <Info className="h-4 w-4 shrink-0" />
            <p>벤치마크 데이터가 없습니다. 벤치마크 관리 탭에서 수집하면 정확한 점수를 확인할 수 있습니다.</p>
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* 좌측: 게이지 + 파트별 점수바 — 항상 표시 */}
          <div className="flex-shrink-0 flex flex-col items-center" style={{ minWidth: "220px" }}>
            <SemiCircleGauge
              score={displayScore}
              grade={displayGrade.grade}
              gradeStyle={gradeStyle}
            />
            <p className={`-mt-1 text-sm font-semibold ${gradeStyle.text}`}>
              {displayGrade.label}
            </p>
            {/* ... 기존 periodLabel, summary 등 유지 ... */}

            {/* 파트 점수바 — diagnostics 있으면 표시 */}
            {data.diagnostics && (
              <div className="mt-4 w-full space-y-1.5">
                {Object.values(data.diagnostics).map((part) => (
                  <PartScoreBar key={part.label} label={part.label} score={part.score} />
                ))}
              </div>
            )}
          </div>

          {/* 우측: 9개 지표 카드 — showMetricCards prop으로 제어 (이제 실제 도달 가능) */}
          {showMetricCards && data.metrics.length > 0 && (
            <div className="grid flex-1 grid-cols-3 gap-3">
              {data.metrics.map((m) => (
                /* 기존 MetricCard 렌더링 유지 */
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
```

**핵심 변경 요약:**
1. `hasBenchmarkData === false` early return → 삭제, 내부 배너로 대체
2. `score == null || !grade` early return → 삭제, fallback 값(0점 F등급) 사용
3. `!data` early return → 유지 (데이터 자체가 없으면 게이지 불가)
4. 이제 `showMetricCards={false}`가 **항상** 작동함

### 3-2. EngagementTotalCard — fallback UI 추가

**파일**: `src/components/protractor/EngagementTotalCard.tsx`

**현재 문제**: `engagementTotal`이 null이면 null 반환 (silent)

**수정 방안:**

```tsx
interface EngagementTotalCardProps {
  engagementTotal: {
    value: number;
    benchmark: number;
    score: number;
    grade: string;
  } | null;
  noBenchmark?: boolean;  // 벤치마크 미설정 상태
}

export function EngagementTotalCard({ engagementTotal, noBenchmark }: EngagementTotalCardProps) {
  // 벤치마크 미설정 상태: 안내 카드
  if (!engagementTotal && noBenchmark) {
    return (
      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">참여합계</p>
            <p className="text-sm text-gray-400 mt-1">벤치마크 설정 후 확인 가능</p>
          </div>
        </div>
      </div>
    );
  }

  // 데이터 완전 없음: null 반환 (T3 로딩 중 등)
  if (!engagementTotal) return null;

  // 정상 렌더링 (기존과 동일)
  const ratio = engagementTotal.benchmark > 0
    ? (engagementTotal.value / engagementTotal.benchmark * 100).toFixed(0)
    : "-";
  const gradeColor = GRADE_COLORS[engagementTotal.grade] ?? GRADE_COLORS.C;

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-5">
      {/* 기존 렌더링 유지 */}
    </div>
  );
}
```

### 3-3. real-dashboard.tsx — IIFE 개선

**파일**: `src/app/(main)/protractor/real-dashboard.tsx`

**현재 문제**: IIFE 내에서 데이터 추출 실패 시 null 반환

**수정 방안**: IIFE를 명시적 변수 + 조건부 렌더링으로 교체

```tsx
// 데이터 표시 섹션 상단에서 변수 추출
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

const noBenchmark = totalValue?.hasBenchmarkData === false;

// JSX:
<EngagementTotalCard
  engagementTotal={engagementData}
  noBenchmark={noBenchmark}
/>
```

**추가 정리:**
- 미사용 `DiagnosticPanel` import 제거 (현재 uncommitted 변경 커밋)

### 3-4. SummaryCards — 6개 확장

**파일**: `src/lib/protractor/aggregate.ts` 70~106줄

**현재**: 4개 카드 (총 광고비 / 총 클릭 / 총 구매 / ROAS)
**수정**: 6개 카드 (총 광고비 / 노출 / 도달 / 총 클릭 / 총 구매 / ROAS)

```tsx
export function toSummaryCards(
  current: AccountSummary,
  previous?: AccountSummary | null,
): SummaryCardData[] {
  const pct = (cur: number, prev: number): number => {
    if (!prev || prev === 0) return 0;
    return +((cur - prev) / prev * 100).toFixed(1);
  };

  return [
    {
      label: "총 광고비",
      value: current.totalSpend.toLocaleString("ko-KR"),
      prefix: "₩",
      changePercent: pct(current.totalSpend, previous?.totalSpend ?? 0),
      changeLabel: "전기간 대비",
    },
    // ★ 신규: 노출
    {
      label: "노출",
      value: current.totalImpressions.toLocaleString("ko-KR"),
      changePercent: pct(current.totalImpressions, previous?.totalImpressions ?? 0),
      changeLabel: "전기간 대비",
    },
    // ★ 신규: 도달 (AccountSummary에 totalReach 추가 필요)
    {
      label: "도달",
      value: current.totalReach.toLocaleString("ko-KR"),
      changePercent: pct(current.totalReach, previous?.totalReach ?? 0),
      changeLabel: "전기간 대비",
    },
    {
      label: "총 클릭",
      value: current.totalClicks.toLocaleString("ko-KR"),
      changePercent: pct(current.totalClicks, previous?.totalClicks ?? 0),
      changeLabel: "전기간 대비",
    },
    {
      label: "총 구매",
      value: current.totalPurchases.toLocaleString("ko-KR"),
      changePercent: pct(current.totalPurchases, previous?.totalPurchases ?? 0),
      changeLabel: "전기간 대비",
    },
    {
      label: "ROAS",
      value: current.roas.toFixed(2),
      changePercent: pct(current.roas, previous?.roas ?? 0),
      changeLabel: "전기간 대비",
    },
  ];
}
```

**추가 수정 필요**: `AccountSummary` 인터페이스에 `totalReach` 추가, `aggregateSummary()`에서 reach 합산

```tsx
export interface AccountSummary {
  totalSpend: number;
  totalImpressions: number;
  totalReach: number;        // ★ 신규
  totalClicks: number;
  totalPurchases: number;
  totalRevenue: number;
  avgCtr: number;
  avgCpc: number;
  roas: number;
}

export function aggregateSummary(insights: AdInsightRow[]): AccountSummary {
  // ... 기존 코드 ...
  const totalReach = insights.reduce((sum, r) => sum + (r.reach || 0), 0);  // ★ 신규

  return {
    totalSpend: Math.round(totalSpend),
    totalImpressions,
    totalReach,               // ★ 신규
    totalClicks,
    totalPurchases,
    totalRevenue: Math.round(totalRevenue),
    avgCtr: totalImpressions > 0 ? +(totalClicks / totalImpressions * 100).toFixed(2) : 0,
    avgCpc: totalClicks > 0 ? Math.round(totalSpend / totalClicks) : 0,
    roas: totalSpend > 0 ? +(totalRevenue / totalSpend).toFixed(2) : 0,
  };
}
```

### 3-5. (선택) 진단상세 탭 추가

**파일**: `src/app/(main)/protractor/real-dashboard.tsx`

현재 탭: `성과 요약` / `콘텐츠` (2개)
추가: `성과 요약` / `진단 상세` / `콘텐츠` (3개)

```tsx
const [activeTab, setActiveTab] = useState<"summary" | "detail" | "content">("summary");

<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
  <TabsList>
    <TabsTrigger value="summary">성과 요약</TabsTrigger>
    <TabsTrigger value="detail">진단 상세</TabsTrigger>
    <TabsTrigger value="content">콘텐츠</TabsTrigger>
  </TabsList>

  {/* 성과 요약 탭 — C1 기존 (게이지+참여합계+SummaryCards+Overlap) */}
  <TabsContent value="summary">
    <TotalValueGauge data={totalValue} isLoading={loadingTotalValue} showMetricCards={false} />
    <EngagementTotalCard engagementTotal={engagementData} noBenchmark={noBenchmark} />
    <SummaryCards cards={summaryCards} />
    <OverlapAnalysis ... />
  </TabsContent>

  {/* 진단 상세 탭 — 게이지(9개 카드 포함) + DiagnosticPanel */}
  <TabsContent value="detail">
    <TotalValueGauge data={totalValue} isLoading={loadingTotalValue} showMetricCards={true} />
    {totalValue?.diagnostics && (
      <DiagnosticPanel t3Diagnostics={totalValue.diagnostics} />
    )}
  </TabsContent>

  {/* 콘텐츠 탭 — 기존과 동일 */}
  <TabsContent value="content">
    <ContentRanking ... />
  </TabsContent>
</Tabs>
```

> 주의: 진단상세 탭 추가는 선택사항. 추가하지 않으면 DiagnosticPanel을 import에서도 제거해야 함.

## 4. 에러 처리
- `totalValue` null → TotalValueGauge "데이터 없음" 카드 (기존 유지), EngagementTotalCard null 반환
- `totalValue.hasBenchmarkData === false` → TotalValueGauge 내부 안내 배너 (early return 아님), EngagementTotalCard "벤치마크 설정 후 확인 가능" 안내
- `totalValue.score == null` → 게이지 0점 F등급 표시 + "벤치마크 설정 필요" 라벨
- insights 없음 → SummaryCards "광고 데이터가 없습니다" (기존 유지)
- overlap 에러 → OverlapAnalysis 기존 에러 UI 유지

## 5. 구현 순서
- [ ] `TotalValueGauge.tsx` — `hasBenchmarkData === false` early return 제거, 내부 안내 배너 추가
- [ ] `TotalValueGauge.tsx` — `score == null || !grade` early return을 fallback 값(0/F) 처리로 변경
- [ ] `EngagementTotalCard.tsx` — `noBenchmark` prop 추가, fallback UI 구현
- [ ] `real-dashboard.tsx` — IIFE를 명시적 변수 + 조건부 렌더링으로 교체, `noBenchmark` prop 전달
- [ ] `aggregate.ts` — AccountSummary에 totalReach 추가, aggregateSummary에서 reach 합산
- [ ] `aggregate.ts` — toSummaryCards에 노출/도달 카드 추가 (총 6개)
- [ ] `real-dashboard.tsx` — 미사용 DiagnosticPanel import 제거
- [ ] (선택) `real-dashboard.tsx` — 진단상세 탭 추가, DiagnosticPanel import 복원
- [ ] `npm run build` 성공 확인
- [ ] QA: 벤치마크 **없는** 계정으로 테스트 (핵심!)
- [ ] QA: 벤치마크 **있는** 계정으로 테스트
- [ ] QA: 데스크탑(1920px) + 모바일(375px) 스크린샷

## 6. 탭별 컴포넌트 배치 (최종)

| 컴포넌트 | 성과요약 탭 | 진단상세 탭 (선택) | 콘텐츠 탭 |
|----------|:-----------:|:------------------:|:---------:|
| TotalValueGauge (게이지+파트바) | ✅ | ✅ | - |
| TotalValueGauge (9개 지표 카드) | ❌ showMetricCards=false | ✅ showMetricCards=true | - |
| 벤치마크 미설정 안내 배너 | ✅ (게이지 내부) | ✅ (게이지 내부) | - |
| EngagementTotalCard | ✅ (fallback 포함) | - | - |
| SummaryCards (6개) | ✅ | - | - |
| DiagnosticPanel | ❌ | ✅ | - |
| OverlapAnalysis | ✅ | - | - |
| ContentRanking | - | - | ✅ |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/components/protractor/TotalValueGauge.tsx` | early return 제거, 배너 추가, fallback 값 | **높음** (렌더링 로직 변경) |
| `src/components/protractor/EngagementTotalCard.tsx` | noBenchmark prop + fallback UI | 낮음 |
| `src/lib/protractor/aggregate.ts` | AccountSummary에 reach 추가, toSummaryCards 6개 | 중간 |
| `src/app/(main)/protractor/real-dashboard.tsx` | IIFE→변수, noBenchmark 전달, import 정리 | 중간 |
| (선택) `src/app/(main)/protractor/real-dashboard.tsx` | 진단상세 탭 추가 | 중간 |

- 진단 엔진: 변경 없음
- 벤치마크 계산: 변경 없음
- metric-groups.ts: 변경 없음
- API: 변경 없음

## 8. QA 체크리스트 (반드시 실행)

### 테스트 시나리오 A: 벤치마크 없는 계정
- [ ] 성과요약 탭에 게이지 표시됨 (0점 F등급)
- [ ] "벤치마크 데이터가 없습니다" 안내 배너 표시됨
- [ ] 9개 지표 카드 미표시
- [ ] EngagementTotalCard "벤치마크 설정 후 확인 가능" 안내 표시됨
- [ ] SummaryCards 6개 표시됨 (insights 있는 경우)

### 테스트 시나리오 B: 벤치마크 있는 계정
- [ ] 성과요약 탭에 게이지 표시됨 (실제 점수/등급)
- [ ] 안내 배너 미표시
- [ ] 9개 지표 카드 미표시 (showMetricCards=false)
- [ ] EngagementTotalCard 실제 데이터 표시 (참여합계 + 등급)
- [ ] SummaryCards 6개 표시됨

### 테스트 시나리오 C: 데이터 없는 계정 (insights 없음)
- [ ] TotalValueGauge "데이터를 불러올 수 없습니다" 표시
- [ ] SummaryCards "광고 데이터가 없습니다" 표시
- [ ] 에러 없음
