# 타겟중복율 T1~T3 코드리뷰 보고서

> 작성일: 2026-02-25
> 타입: 분석/리뷰 (코드 수정 없음)
> 기준 문서: TASK-타겟중복.md

---

## 현재 상태 요약

| 항목 | 상태 |
|------|------|
| `adset_overlap_cache` 테이블 | 미존재 (migrations 최신: `20260225_benchmarks_creative_type.sql`) |
| `database.ts` overlap 타입 | 미존재 |
| `/api/protractor/overlap` 라우트 | 미존재 |
| `OverlapAnalysis` 컴포넌트 | 미존재 |
| 기존 protractor API 라우트 | accounts, benchmarks, insights, save-secret, total-value (5개) |
| 기존 protractor 컴포넌트 | 8개 (index.ts re-export) |

---

## T1. DB: adset_overlap_cache 테이블

### TASK 정의 SQL 검토

```sql
CREATE TABLE adset_overlap_cache (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  account_id text NOT NULL,
  adset_pair text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  overlap_data jsonb NOT NULL,
  cached_at timestamptz DEFAULT now(),
  UNIQUE(account_id, adset_pair, period_start, period_end)
);
```

### 발견 사항

#### [필수] RLS 정책 누락
TASK SQL에 RLS가 없음. CLAUDE.md 규칙 위반 (`RLS 정책 필수`).

기존 패턴 참고 (`00002_rls_policies.sql`):
- `is_admin()`, `is_approved_user()`, `get_user_role()` 헬퍼 함수 사용 중
- 단, `adset_overlap_cache`는 **API 서버(service_role)에서만** 읽기/쓰기하므로 RLS ENABLE만 하면 됨
- 기존 protractor API는 모두 `createServiceClient()` 사용 → RLS 우회
- **권장**: `ALTER TABLE adset_overlap_cache ENABLE ROW LEVEL SECURITY;` 만으로 충분 (service_role은 자동 우회)

#### [필수] `adset_pair` 정렬 규칙 미명시
- 두 adset ID 조합 시 순서에 따라 "123_456"과 "456_123"이 다른 레코드로 삽입될 위험
- **권장**: 항상 두 ID를 오름차순 정렬 후 `_`로 결합 (예: `[a, b].sort().join("_")`)
- Design 문서에 명확히 정의 필요

#### [권장] `cached_at` TTL 인덱스
- TTL 만료 캐시 정리 쿼리: `DELETE FROM adset_overlap_cache WHERE cached_at < NOW() - INTERVAL '24h'`
- 현재 UNIQUE 인덱스에 `cached_at`가 미포함이므로 별도 인덱스 권장:
  ```sql
  CREATE INDEX idx_overlap_cache_ttl ON adset_overlap_cache(cached_at);
  ```

#### [참고] `overlap_data` jsonb 스키마
- TASK T2 출력 스펙 (`overall_rate`, `total_unique`, `individual_sum`, `pairs[]`)과 일치하는 jsonb 구조를 Design 문서에서 명확히 정의해야 함
- 전체 계정 결과를 하나의 jsonb에 넣을지, pair별로 별도 row로 저장할지 결정 필요
- TASK에서 `adset_pair` 컬럼이 있으므로 pair별 row인 것으로 보이나, `overall_rate` 같은 전체 지표 저장 위치가 불명확

### 수정 필요 파일

| # | 파일 | 작업 | 예상 줄 |
|---|------|------|---------|
| 1 | `supabase/migrations/00026_adset_overlap_cache.sql` | 신규 생성 | ~25줄 |
| 2 | `src/types/database.ts` | Row/Insert/Update 타입 추가 | ~30줄 |

---

## T2. 타겟중복 API — `/api/protractor/overlap`

### 기존 패턴 분석

| 항목 | 기존 패턴 | 위치 |
|------|-----------|------|
| 인증 | `requireProtractorAccess()` → AuthSuccess/AuthFailure | `_shared.ts:18` |
| 계정 소유권 | `verifyAccountOwnership(svc, userId, role, accountId)` | `_shared.ts:53` |
| DB 클라이언트 | `createServiceClient()` (RLS 우회) | `_shared.ts:33` |
| 파라미터 | `searchParams.get("account_id")`, `start`, `end` | `insights/route.ts:12-15` |
| Meta API | `graph.facebook.com/v21.0`, `AbortSignal.timeout(60_000)` | `cron/collect-daily/route.ts:120-136` |
| Meta 토큰 | `process.env.META_ACCESS_TOKEN` | `cron/collect-daily/route.ts:121` |
| 에러 응답 | 한국어 메시지 + status code | `insights/route.ts:18-20` |

### API 로직 리뷰

#### 2a. 캐시 확인 (HIT/MISS)

```typescript
// 패턴
svc.from("adset_overlap_cache")
  .select("overlap_data, cached_at")
  .eq("account_id", accountId)
  .eq("period_start", dateStart)
  .eq("period_end", dateEnd)
```

**발견**:
- TASK에 TTL 명시 없음. **24시간 권장** — `cached_at`가 24시간 이내인 경우만 HIT
- `force=true` 파라미터로 캐시 무시 가능 (T3 "새로 분석" 버튼)
- `adset_pair` 컬럼이 있으므로 pair별로 여러 row가 존재 → 전체 조회 후 조합 필요

#### 2b. Meta API 호출 — 핵심 위험

**Rate Limit 분석**:
- Meta API: 200 calls/hour/token (Business Use Case Rate Limit)
- adset N개 → 조합 수 = N*(N-1)/2
  - 10개: 45조합 + 2~3 목록 조회 = ~48회 (**안전**)
  - 15개: 105조합 + 3 = ~108회 (**주의**)
  - 20개: 190조합 + 3 = ~193회 (**위험 — 한계 근접**)
  - 25개: 300조합 + 3 = **초과**

**대안 전략 (권장)**:
1. **개별 adset reach** → `daily_ad_insights` DB에서 조회 (이미 `adset_id`, `reach` 컬럼 존재, `cron/collect-daily`가 매일 수집)
   ```sql
   SELECT adset_id, adset_name, campaign_name, SUM(reach) as total_reach
   FROM daily_ad_insights
   WHERE account_id = ? AND date BETWEEN ? AND ?
   GROUP BY adset_id, adset_name, campaign_name
   ```
2. **2개씩 조합 overlap** → Meta Insights API만 호출 (필수 — DB에 조합 reach 없음)
3. **전체 합산 unique** → Meta Insights API 1회 (`filtering=[adset.id IN [모두]]`)
4. **이렇게 하면**: API 호출 = 조합 수 + 1 (전체), DB 조회 = 1회

**추가 대안 — Batch Request**:
```
POST / HTTP/1.1
Host: graph.facebook.com
batch=[{"method":"GET","relative_url":"act_{id}/insights?filtering=[{...}]&fields=reach"}, ...]
```
- 50개씩 batch 가능 → 190조합도 4회 batch로 처리 가능

#### 2c. 중복율 계산

```
중복율 = (개별합 - 합산unique) / 개별합
```

**발견**:
- 0으로 나누기 방지: 개별합 = 0 → 0% 반환
- **음수 방지**: Meta 데이터 정합성 이슈로 `합산unique > 개별합` 가능 → `Math.max(0, rate)` 처리
- pair별 overlap_rate: `(reach_a + reach_b - combined_unique) / (reach_a + reach_b)` — 이 공식도 Design에 명시 필요

#### 2d. 기간 7일 미만 비활성

**플랜 오류 수정**: 플랜에서 "현재 PeriodSelector에 '어제' 프리셋이 있음"이라 했으나, 실제 `PeriodSelector.tsx`는 **7/14/30/90일** 옵션만 제공. "어제" 프리셋 없음.

단, **초기 상태 문제**:
- `real-dashboard.tsx:135` → `useState<DateRange>(yesterday())` — 초기 dateRange가 1일
- `PeriodSelector.tsx:27` → `useState<PeriodKey>("30")` — 초기 표시는 30일이지만 `onPeriodChange`를 mount 시 호출하지 않음
- **결과**: 대시보드 첫 로드 시 실제 dateRange는 "어제"(1일)이지만 PeriodSelector는 "30일" 선택 표시
- 타겟중복 탭이 이 초기 상태로 로드되면 "7일 미만" 에러 발생
- **권장**: PeriodSelector에 `useEffect`로 mount 시 `onPeriodChange(getDateRange(30))` 호출하거나, overlap 탭에서 dateRange < 7일이면 안내 메시지만 표시 (에러가 아닌 UX)

#### 2e. 응답 형식

```json
{
  "overall_rate": 25.3,
  "total_unique": 15000,
  "individual_sum": 20000,
  "cached_at": "2026-02-25T12:00:00Z",
  "pairs": [
    {
      "adset_a_name": "...",
      "adset_b_name": "...",
      "campaign_a": "...",
      "campaign_b": "...",
      "overlap_rate": 60.5
    }
  ]
}
```

**발견**: `cached_at` 추가 필요 — TASK 원본에 미포함이나 T3에서 "마지막 분석 시각" 표시 요구

### 수정 필요 파일

| # | 파일 | 작업 | 예상 줄 |
|---|------|------|---------|
| 1 | `src/app/api/protractor/overlap/route.ts` | 신규 생성 | ~150줄 |
| 2 | `src/app/api/protractor/_shared.ts` | 변경 불필요 | 0줄 |

---

## T3. OverlapAnalysis 컴포넌트

### 기존 구조 분석

**`real-dashboard.tsx` (391줄)**:
- L128: `RealDashboard` 함수 컴포넌트
- L133-150: 상태 (accounts, selectedAccountId, dateRange, insights, benchmarks, diagnosisData, totalValue + loading 상태 4개)
- L298-389: JSX — 단일 스크롤 레이아웃, 탭 없음
- L301-309: Header (ProtractorHeader + PeriodSelector) — 탭 공통 영역
- L340-386: 데이터 표시 영역 — `TabsContent`로 감쌀 대상

**기존 컴포넌트 8개** (`index.ts`):
ProtractorHeader, PeriodSelector, SummaryCards, DiagnosticPanel, PerformanceTrendChart, ConversionFunnel, DailyMetricsTable, TotalValueGauge

**차트 라이브러리**: `recharts` v3.7.0 — PieChart, innerRadius 사용 가능

**Tabs UI**: `@/components/ui/tabs` — shadcn/ui Tabs, TabsList, TabsTrigger, TabsContent 사용 가능 (PeriodSelector에서 이미 사용 중)

### 탭 구조 도입 리뷰

#### 변경 계획

```
Before (L298-389):
<div className="flex flex-col gap-6">
  <header> ... </header>
  {error && ...}
  {loadingData && ...}
  {!selectedAccountId && ...}
  {selectedAccountId && !loadingData && (
    <> TotalValueGauge, SummaryCards, DiagnosticPanel, ... </>
  )}
</div>

After:
<div className="flex flex-col gap-6">
  <header> ... </header>              ← 그대로 (L301-309)
  {error && ...}                       ← 탭 밖 (공통)
  <Tabs value={activeTab} ...>
    <TabsList>
      <TabsTrigger value="summary">성과 요약</TabsTrigger>
      <TabsTrigger value="overlap">타겟중복</TabsTrigger>
    </TabsList>
    <TabsContent value="summary">
      {loadingData && ...}
      {!selectedAccountId && ...}
      {selectedAccountId && !loadingData && (
        <> 기존 내용 전체 </>
      )}
    </TabsContent>
    <TabsContent value="overlap">
      <OverlapAnalysis ... />
    </TabsContent>
  </Tabs>
</div>
```

#### 발견 사항

**[주의] real-dashboard.tsx 수정 범위**:
- import 추가: `Tabs, TabsList, TabsTrigger, TabsContent` from `@/components/ui/tabs` + `OverlapAnalysis` from `@/components/protractor`
- state 추가: `activeTab`, `overlapData`, `loadingOverlap` (3개)
- useEffect 추가: overlap fetch (1개)
- JSX 변경: 탭 구조 감싸기 (~40줄 수정)
- **위험도 중간**: 기존 `<>...</>` fragment를 `<TabsContent>`로 감싸기만 하면 기존 기능 불변

**[참고] loading/empty 상태 분리**:
- 성과 요약 탭: 기존 `loadingData`, `!selectedAccountId` 조건 그대로
- 타겟중복 탭: 별도 `loadingOverlap` 상태 + 계정/기간 미선택 시 안내

### OverlapAnalysis 컴포넌트 리뷰

#### Props 설계

```typescript
interface OverlapAnalysisProps {
  accountId: string | null;
  dateRange: { start: string; end: string };
  overlapData: OverlapResponse | null;
  isLoading: boolean;
  onRefresh: () => void;
}
```

**발견**: `overlapData`와 `onRefresh`를 props로 받으면 상태 관리가 `real-dashboard.tsx`에 집중됨. 대안으로 컴포넌트 내부에서 자체 fetch도 가능하나, 기존 패턴(insights, diagnosis 등)이 부모 관리이므로 일관성 유지 권장.

#### 3a. 히어로 — 전체 중복률 도넛

- recharts `PieChart` + `Pie innerRadius` 사용
- 데이터: `[{ name: "중복", value: overall_rate }, { name: "고유", value: 100 - overall_rate }]`
- 색상: `#F75D5D` (중복, Primary), `#E5E7EB` (고유, gray-200)
- 옆에 수치 3개: 실제도달(`total_unique`), 개별합(`individual_sum`), 중복낭비(`individual_sum - total_unique`)

#### 3b. 위험 경고 — 60% 이상 조합

- 필터: `pairs.filter(p => p.overlap_rate >= 60)`
- 스타일: DiagnosticPanel `severity="심각"` 참고 — 빨간 배경 + 경고 아이콘
- **캠페인명 + 광고세트명 그대로 표시** (TASK 명시)

#### 3c. 전체 세트 테이블

- `ad-metrics-table.tsx` (281줄) 패턴 참고:
  - shadcn Table 컴포넌트
  - 정렬 가능 (헤더 클릭)
  - VerdictDot 상태 뱃지
- 컬럼: 캠페인명, 세트명, Reach, 최고중복, 상태

#### 3d. "새로 분석" 버튼

- API 호출: `/api/protractor/overlap?...&force=true`
- 서버: `force=true`면 캐시 무시하고 Meta API 재호출
- 로딩 중 버튼 비활성

#### 3e. 해석 가이드 + 분석 시각

- 정적 텍스트 (접기/펼치기) — 중복률 해석 기준 설명
- `cached_at` → `new Date(cached_at).toLocaleString("ko-KR")` 포맷

---

## 종합 영향도 분석

### 신규 파일 (3개)

| 파일 | 예상 줄 | 복잡도 |
|------|---------|--------|
| `supabase/migrations/00026_adset_overlap_cache.sql` | ~25줄 | 낮음 |
| `src/app/api/protractor/overlap/route.ts` | ~150줄 | **높음** (Meta API 다수 호출) |
| `src/components/protractor/OverlapAnalysis.tsx` | ~250줄 | 중간 |

### 수정 파일 (3개)

| 파일 | 수정 범위 | 위험도 |
|------|-----------|--------|
| `src/types/database.ts` | Row/Insert/Update 추가 (~30줄) | 낮음 (추가만) |
| `src/components/protractor/index.ts` | 1줄 추가 | 낮음 |
| `src/app/(main)/protractor/real-dashboard.tsx` | import + state + effect + JSX 탭 (~40줄) | **중간** |

---

## 핵심 리뷰 발견 7건

### [P0 — 필수] 1. Meta API Rate Limit 대응 전략

- adset 20개 이상이면 조합 API 호출만으로 rate limit 초과
- **권장**: 개별 reach는 `daily_ad_insights` DB에서 `SUM(reach) GROUP BY adset_id`로 조회, 조합 overlap만 Meta API 또는 batch request 사용
- Design 문서에 전략 확정 필수

### [P0 — 필수] 2. RLS 정책 추가

- TASK SQL에 RLS 없음. 마이그레이션에 `ENABLE ROW LEVEL SECURITY` 추가 필수
- service_role 전용이므로 별도 policy 불필요 (RLS 활성화만으로 일반 유저 접근 차단)

### [P1 — 중요] 3. `adset_pair` 정렬 규칙 명시

- 두 ID를 항상 오름차순 정렬 후 결합 → 순서 무관 중복 방지
- API 코드와 Design 문서 양쪽에 규칙 명시

### [P1 — 중요] 4. 캐시 TTL 정의

- TASK에 TTL 미명시. Design에서 24시간 권장 확정
- `cached_at` + INTERVAL 비교 또는 `force=true` 파라미터

### [P1 — 중요] 5. `overlap_data` jsonb vs pair별 row 결정

- TASK에 `adset_pair` 컬럼이 있으므로 pair별 row 구조로 보이나, `overall_rate` 같은 전체 지표 저장 위치 불명확
- **권장**: `adset_pair = '__overall__'`로 전체 결과 row를 별도 저장하거나, pair별 overlap만 저장하고 전체는 조회 시 재계산

### [P2 — 참고] 6. 초기 dateRange 불일치

- `real-dashboard.tsx:135` 초기 `dateRange = yesterday()` (1일)
- `PeriodSelector.tsx:27` 초기 표시 "30일" (onPeriodChange 미호출)
- 타겟중복 탭 첫 로드 시 1일 범위 → "7일 미만" 에러 발생
- **권장**: PeriodSelector mount 시 초기 range emit하거나, overlap 탭에서 부드러운 안내 처리

### [P2 — 참고] 7. 응답에 `cached_at` 포함

- 프론트 "마지막 분석 시각" 표시를 위해 API 응답에 `cached_at` 필드 포함 필요
- TASK 원본에 미명시이나 T3 요구사항에서 참조

---

## TASK.md 보완 권장사항

| # | 항목 | 현재 | 권장 |
|---|------|------|------|
| 1 | T1 RLS | 없음 | `ENABLE ROW LEVEL SECURITY` 추가 |
| 2 | T1 `adset_pair` 규칙 | 미명시 | `[id_a, id_b].sort().join("_")` 명시 |
| 3 | T2 TTL | 미명시 | 24시간 (또는 명시적 정의) |
| 4 | T2 Rate Limit 대응 | 미명시 | DB reach 활용 + batch request 전략 |
| 5 | T2 응답 `cached_at` | 미포함 | 응답 스펙에 추가 |
| 6 | T2 `overlap_data` 스키마 | jsonb만 명시 | 전체/pair 저장 구조 정의 |
| 7 | T3 초기 dateRange | 미고려 | 7일 미만 시 UX 처리 방식 정의 |

---

## 전제 조건 확인

- [x] TASK-총가치각도기 완료 여부 — 최근 커밋 `8f72f09` refactor 및 `2df5053` feat 확인 → 완료로 판단
- [ ] Plan 문서: `docs/01-plan/features/타겟중복.plan.md` — 구현 전 작성 필요
- [ ] Design 문서: `docs/02-design/features/타겟중복.design.md` — 구현 전 작성 필요
- [ ] `.pdca-status.json` 업데이트 필요
