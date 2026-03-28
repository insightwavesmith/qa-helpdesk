# 클라이언트 캐싱 설계서

## 1. 데이터 모델

### SWR 설정 (데이터 모델 변경 없음 — 클라이언트 캐싱 레이어만 추가)

```
신규 파일: src/lib/swr/config.ts      ← SWR 전역 설정 + fetcher 함수
신규 파일: src/lib/swr/keys.ts        ← SWR 캐시 키 상수 정의
신규 파일: src/lib/swr/hooks.ts       ← 커스텀 SWR 훅 모음
```

DB/API 변경 없음. 기존 API route 그대로 유지.

## 2. API 설계

API 변경 없음. 기존 엔드포인트를 SWR fetcher가 호출하는 구조.

### SWR 전역 설정

```typescript
// src/lib/swr/config.ts
import type { SWRConfiguration } from "swr";

/** 표준 JSON API fetcher */
export const jsonFetcher = (url: string) => fetch(url).then(r => {
  if (!r.ok) throw new Error(`API error: ${r.status}`);
  return r.json();
});

/** Server Action 래퍼 fetcher — SWR에서 server action 호출용 */
export const actionFetcher = <T>(action: () => Promise<T>) => action();

/** 전역 SWR 기본 설정 */
export const swrDefaultConfig: SWRConfiguration = {
  revalidateOnFocus: false,     // 포커스 시 재검증 비활성 (불필요한 API 호출 방지)
  dedupingInterval: 30_000,     // 30초 내 동일 키 요청 중복 제거
  errorRetryCount: 2,           // 에러 시 최대 2회 재시도
  keepPreviousData: true,       // 키 변경 시 이전 데이터 유지 (로딩 깜빡임 방지)
};
```

### SWR 캐시 키 상수

```typescript
// src/lib/swr/keys.ts

// ── Protractor ──
export const SWR_KEYS = {
  // 총가치각도기
  PROTRACTOR_ACCOUNTS: "/api/protractor/accounts",
  protractorInsights: (accountId: string, start: string, end: string) =>
    `/api/protractor/insights?account_id=${accountId}&start=${start}&end=${end}`,
  protractorTotalValue: (accountId: string, period: number, start: string, end: string) =>
    `/api/protractor/total-value?account_id=${accountId}&period=${period}&date_start=${start}&date_end=${end}`,
  protractorOverlap: (accountId: string, start: string, end: string) =>
    `/api/protractor/overlap?account_id=${accountId}&date_start=${start}&date_end=${end}`,
  PROTRACTOR_BENCHMARKS: "/api/protractor/benchmarks",

  // 대시보드
  SALES_SUMMARY: "/api/sales-summary",

  // 경쟁사분석
  COMPETITOR_MONITORS: "/api/competitor/monitors",

  // 관리자
  ADMIN_ACCOUNTS: "/api/admin/accounts",
  ADMIN_KNOWLEDGE_STATS: "/api/admin/knowledge/stats",

  // Server Action 기반 (접두사 "action:" 사용)
  ADMIN_CONTENTS: (typeFilter: string, statusFilter: string) =>
    `action:contents:${typeFilter}:${statusFilter}`,
  ADMIN_CURATION_COUNT: "action:curation-count",
  ADMIN_REVIEWS: "action:reviews",
  PIPELINE_STATS: "action:pipeline-stats",
  CURATION_SUMMARY_STATS: "action:curation-summary-stats",
  deletedContents: (sourceFilter?: string) =>
    `action:deleted-contents:${sourceFilter ?? "all"}`,
  curriculumContents: (sourceType: string) =>
    `action:curriculum:${sourceType}`,
  curationContents: (source: string, score: string, period: string, status: string) =>
    `action:curation:${source}:${score}:${period}:${status}`,
  curationStatusCounts: (source: string) =>
    `action:curation-status:${source}`,
  subscribers: (page: number, status: string, search: string) =>
    `action:subscribers:${page}:${status}:${search}`,
  QA_REPORTS: "action:qa-reports",
} as const;
```

## 3. 컴포넌트 구조 — 페이지별 전환 설계

### 3.0 SWRConfig Provider 설정

```tsx
// src/app/(main)/layout.tsx에 SWRConfig Provider 추가
import { SWRConfig } from "swr";
import { swrDefaultConfig } from "@/lib/swr/config";

// layout의 children을 SWRConfig로 래핑
<SWRConfig value={swrDefaultConfig}>
  {children}
</SWRConfig>
```

### 3.1 `real-dashboard.tsx` (총가치각도기) — 가장 복잡

**현재**: useEffect×4 (accounts, insights, totalValue, overlap) + useState×10+ (loading/error/data 각각)

**전환**:
```tsx
// Before
const [accounts, setAccounts] = useState<AdAccount[]>([]);
const [loadingAccounts, setLoadingAccounts] = useState(true);
useEffect(() => {
  (async () => {
    const res = await fetch("/api/protractor/accounts");
    ...
  })();
}, []);

// After
const { data: accountsData, error: accountsError, isLoading: loadingAccounts } = useSWR(
  SWR_KEYS.PROTRACTOR_ACCOUNTS,
  jsonFetcher
);
const accounts: AdAccount[] = accountsData?.data ?? [];

// insights — 계정+기간에 따라 키가 동적으로 변경
const { data: insightsData, error, isLoading: loadingData } = useSWR(
  selectedAccountId ? SWR_KEYS.protractorInsights(selectedAccountId, dateRange.start, dateRange.end) : null,
  jsonFetcher
);
const insights: AdInsightRow[] = insightsData?.data ?? [];

// totalValue — 계정+기간+periodNum
const { data: totalValue, error: totalValueError, isLoading: loadingTotalValue } = useSWR(
  selectedAccountId ? SWR_KEYS.protractorTotalValue(selectedAccountId, periodNum, dateRange.start, dateRange.end) : null,
  jsonFetcher
);

// overlap
const { data: overlapData, error: overlapError, isLoading: loadingOverlap, mutate: mutateOverlap } = useSWR(
  selectedAccountId ? SWR_KEYS.protractorOverlap(selectedAccountId, dateRange.start, dateRange.end) : null,
  jsonFetcher
);
```

**제거할 상태**: `loadingAccounts`, `loadingData`, `loadingTotalValue`, `loadingOverlap`, `error`, `totalValueError`, `overlapError` → SWR가 제공
**유지할 상태**: `selectedAccountId`, `dateRange`, `periodNum`, `activeTab` (UI 상태)
**유지할 로직**: `handleAccountSelect`, `handlePeriodChange`, `handleRemoveAccount` (mutation 후 `mutate()` 호출)
**force refresh (overlap)**: `mutateOverlap()` 호출로 강제 revalidation

### 3.2 `v0-dashboard.tsx` (대시보드)

**현재**: useEffect 1개, 내부에서 accounts fetch → 각 account별 insights fetch (병렬 Promise.all) → 집계

**전환**: 복합 데이터 집계이므로 커스텀 fetcher 사용
```tsx
const fetchAdminSummary = async () => {
  const end = new Date(); end.setDate(end.getDate() - 1);
  const start = new Date(end); start.setDate(start.getDate() - 6);
  const startStr = start.toISOString().split("T")[0];
  const endStr = end.toISOString().split("T")[0];
  const accountsRes = await fetch("/api/protractor/accounts");
  const accountsJson = await accountsRes.json();
  const accounts = accountsJson.data ?? [];
  if (accounts.length === 0) return null;
  // ... 기존 집계 로직 유지 ...
  return summary;
};

const { data: summary } = useSWR("dashboard:admin-summary", fetchAdminSummary);
```

### 3.3 `admin/content/page.tsx` (큐레이션 관리)

**현재**: useEffect + useCallback (`loadContents`), 모듈 레벨 `_contentsCache` 변수

**전환**:
```tsx
// 모듈 레벨 _contentsCache 제거 — SWR 캐시가 대체

const { data: contentsResult, isLoading: loading, mutate: mutateContents } = useSWR(
  SWR_KEYS.ADMIN_CONTENTS(typeFilter, statusFilter),
  () => getContents({ pageSize: 100, sourceType: "info_share",
    ...(typeFilter !== "all" ? { type: typeFilter } : {}),
    ...(statusFilter !== "all" && statusFilter !== "sent" ? { status: statusFilter } : {}),
  }),
);

const { data: curationCount } = useSWR(
  SWR_KEYS.ADMIN_CURATION_COUNT,
  () => getCurationCount(),
);
```

### 3.4 `admin/knowledge/page.tsx` (지식 관리)

**현재**: useEffect + useCallback (`loadData`) + `fetchMonitoringData()`

**전환**:
```tsx
const { data, isLoading: loading, mutate } = useSWR(
  SWR_KEYS.ADMIN_KNOWLEDGE_STATS,
  jsonFetcher
);
const usageData = data?.usage ?? [];
const chunkStats = data?.chunkStats ?? [];
const totalChunks = data?.totalChunks ?? 0;
```

### 3.5 `admin/accounts/accounts-client.tsx` (회원관리)

**현재**: useEffect + useCallback (`fetchData`)

**전환**:
```tsx
const { data, isLoading: loading, mutate } = useSWR(
  SWR_KEYS.ADMIN_ACCOUNTS,
  jsonFetcher
);
const accounts = data?.accounts ?? [];
const students = data?.students ?? [];
```
**mutation 후**: `handleAssign`, `handleAdd`, `handleEdit`, `handleToggle` 완료 후 `mutate()` 호출

### 3.6 `admin/reviews/page.tsx` (후기 관리)

**현재**: useEffect + `fetchReviews()` (server action)

**전환**:
```tsx
const { data: reviewsResult, isLoading: loading, error: fetchError, mutate } = useSWR(
  SWR_KEYS.ADMIN_REVIEWS,
  () => getReviewsAdmin()
);
const reviews = (reviewsResult?.data ?? []) as Review[];
```
**mutation 후**: pin/delete/featured 토글 후 `mutate()` 호출

### 3.7 `protractor/components/benchmark-admin.tsx` (벤치마크 관리)

**현재**: useEffect + `loadBenchmarks()`

**전환**:
```tsx
const { data: benchmarkData, isLoading: loading, mutate } = useSWR(
  SWR_KEYS.PROTRACTOR_BENCHMARKS,
  jsonFetcher
);
const rows = (benchmarkData?.data ?? []) as BenchmarkAdminRow[];
```
**수동 재수집 후**: `handleCollect` 완료 후 `mutate()` 호출

### 3.8 `competitor/components/monitor-panel.tsx` (경쟁사 모니터링)

**현재**: useEffect + useCallback (`fetchMonitors`)

**전환**:
```tsx
const { data: monitorsData, isLoading: loading, mutate } = useSWR(
  SWR_KEYS.COMPETITOR_MONITORS,
  jsonFetcher
);
// 부모에서 monitors 상태를 관리하므로, SWR 데이터를 부모에 전달
useEffect(() => {
  if (monitorsData?.monitors) setMonitors(monitorsData.monitors);
}, [monitorsData, setMonitors]);
```
**주의**: 부모(`competitor-dashboard.tsx`)가 `monitors` 상태를 소유하므로, SWR 데이터 → 부모 상태 동기화 필요. 또는 SWR 훅을 부모로 올려서 `monitors`를 SWR이 직접 관리하는 방식도 고려 (리팩토링 범위와 트레이드오프).

### 3.9 `curation/pipeline-sidebar.tsx` (파이프라인 사이드바)

**현재**: useEffect + Promise.all([getPipelineStats(), getCurationSummaryStats()])

**전환**:
```tsx
const { data: stats, isLoading: loadingStats } = useSWR(
  SWR_KEYS.PIPELINE_STATS,
  () => getPipelineStats()
);
const { data: summaryStats } = useSWR(
  SWR_KEYS.CURATION_SUMMARY_STATS,
  () => getCurationSummaryStats()
);
const loading = loadingStats; // summaryStats는 보조 데이터
```

### 3.10 `curation/deleted-section.tsx` (삭제된 콘텐츠)

**현재**: useEffect + server action

**전환**:
```tsx
const { data: deletedResult, mutate } = useSWR(
  SWR_KEYS.deletedContents(sourceFilter !== "all" ? sourceFilter : undefined),
  () => getDeletedContents(sourceFilter !== "all" ? sourceFilter : undefined)
);
const items = (deletedResult?.data ?? []) as DeletedItem[];
const count = deletedResult?.count ?? 0;
```
**복원 후**: `mutate()` + `onRestore()` 콜백 호출

### 3.11 `curation/curriculum-view.tsx` (커리큘럼 뷰)

**현재**: useEffect + useCallback (`loadData`)

**전환**:
```tsx
const { data: curriculumData, isLoading: loading } = useSWR(
  SWR_KEYS.curriculumContents(sourceType),
  () => getCurriculumContents(sourceType)
);
```

### 3.12 `curation/curation-view.tsx` (큐레이션 뷰)

**현재**: useEffect + useCallback (`loadContents`) + useRef 캐시

**전환**:
```tsx
const { data: contentsResult, isLoading: loading, mutate } = useSWR(
  SWR_KEYS.curationContents(sourceFilter, scoreFilter, periodFilter, statusFilter),
  () => getCurationContents({ source: sourceFilter, score: scoreFilter, period: periodFilter, status: statusFilter })
);

const { data: statusCounts } = useSWR(
  SWR_KEYS.curationStatusCounts(sourceFilter),
  () => getCurationStatusCounts(sourceFilter)
);
```
**useRef 캐시 제거**: SWR 캐시가 대체

### 3.13 `dashboard/SalesSummary.tsx` (매출 요약)

**현재**: useEffect + fetch

**전환**:
```tsx
const { data, isLoading: loading, error } = useSWR(
  SWR_KEYS.SALES_SUMMARY,
  jsonFetcher
);
```

### 3.14 `qa-chatbot/QaReportList.tsx` (QA 리포트)

**현재**: useEffect + useCallback (`loadReports`)

**전환**:
```tsx
const { data: reports = [], isLoading, mutate } = useSWR(
  SWR_KEYS.QA_REPORTS,
  () => getQaReports({ limit: 50 })
);
```
**상태 변경 후**: `handleStatusChange` 후 `mutate()` 또는 optimistic update

### 3.15 `admin/SubscriberTab.tsx` (구독자 관리)

**현재**: useEffect + useCallback (`load`) — pagination/filter 의존

**전환**:
```tsx
const { data: subscriberResult, isLoading: loading } = useSWR(
  SWR_KEYS.subscribers(page, statusFilter, search),
  () => getSubscribers(page, pageSize, {
    status: statusFilter === "all" ? undefined : statusFilter,
    search: search || undefined,
  })
);
const subscribers = subscriberResult?.data ?? [];
const totalCount = subscriberResult?.count ?? 0;
```

## 4. 에러 처리

### SWR 에러 핸들링 전략
- SWR의 `error` 상태를 직접 사용
- 기존 `try/catch + setError()` 패턴을 SWR의 `onError` 콜백으로 교체
- 전역 에러 처리는 SWRConfig의 `onError`에서 toast 표시

```typescript
// src/lib/swr/config.ts
export const swrDefaultConfig: SWRConfiguration = {
  // ...
  onError: (error) => {
    console.error("SWR fetch error:", error);
    // 전역 토스트는 넣지 않음 — 각 컴포넌트에서 필요 시 개별 처리
  },
};
```

### 에러 코드별 처리
| 에러 | 처리 |
|------|------|
| 403 (권한 없음) | 컴포넌트에서 `error` 상태 확인 → 권한 없음 UI 표시 (real-dashboard의 totalValue 등) |
| 500 (서버 에러) | SWR `errorRetryCount: 2` 자동 재시도 |
| Network Error | SWR 자동 재시도 + 컴포넌트에서 에러 UI |

### Mutation 후 Revalidation
- **Optimistic Update**: 간단한 토글(pin, featured) → `mutate(optimisticData, { revalidate: true })`
- **서버 확인 필요**: 생성/삭제 → `mutate()` (서버 재조회)

```typescript
// 예: 후기 핀 토글 (optimistic update)
const handleTogglePin = async (id: string) => {
  await togglePinReview(id);
  mutate(); // 서버에서 재조회
};
```

## 5. 구현 순서

### Phase 1: 인프라 (의존성 없음)
- [ ] T1-1. `npm install swr`
- [ ] T1-2. `src/lib/swr/config.ts` 생성 (jsonFetcher, actionFetcher, swrDefaultConfig)
- [ ] T1-3. `src/lib/swr/keys.ts` 생성 (SWR_KEYS 상수)
- [ ] T1-4. `src/app/(main)/layout.tsx`에 SWRConfig Provider 추가

### Phase 2: 단순 전환 (독립적, 병렬 가능)
각 파일은 독립적이므로 병렬 작업 가능. 우선순위: 사용자 체감 임팩트 순.

- [ ] T2-1. `SalesSummary.tsx` — 가장 단순 (fetch 1개, 상태 3개)
- [ ] T2-2. `admin/knowledge/page.tsx` — fetch 1개
- [ ] T2-3. `admin/accounts/accounts-client.tsx` — fetch 1개, mutation 4개
- [ ] T2-4. `admin/reviews/page.tsx` — server action 1개, mutation 3개
- [ ] T2-5. `benchmark-admin.tsx` — fetch 1개, 수동 재수집
- [ ] T2-6. `QaReportList.tsx` — server action 1개
- [ ] T2-7. `pipeline-sidebar.tsx` — server action 2개
- [ ] T2-8. `deleted-section.tsx` — server action 1개, 필터 의존
- [ ] T2-9. `curriculum-view.tsx` — server action 1개
- [ ] T2-10. `SubscriberTab.tsx` — server action 1개, pagination

### Phase 3: 복잡 전환 (의존성 있음, 순차)
- [ ] T3-1. `admin/content/page.tsx` — 모듈 레벨 캐시 제거 + server action 2개 + 탭/필터 연동
- [ ] T3-2. `curation-view.tsx` — useRef 캐시 제거 + server action 2개 + 4개 필터
- [ ] T3-3. `monitor-panel.tsx` — 부모 상태 연동 문제 해결
- [ ] T3-4. `v0-dashboard.tsx` — 복합 집계 fetcher
- [ ] T3-5. `real-dashboard.tsx` — SWR 4개 + 동적 키 + mutation (가장 복잡, 마지막)

### Phase 4: 검증
- [ ] T4-1. tsc --noEmit 통과
- [ ] T4-2. next lint 통과
- [ ] T4-3. npm run build 통과
- [ ] T4-4. 수동 QA: 총가치각도기 ↔ 경쟁사분석 전환 시 로딩 없음 확인
- [ ] T4-5. 수동 QA: 모든 사이드바 메뉴 전환 시 캐시 즉시 표시 확인
- [ ] T4-6. 수동 QA: 데이터 변경 후 재방문 시 업데이트 반영 확인
