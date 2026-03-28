# T10 백필 통합 (광고+믹스패널+타겟중복) — 설계서

> 작성일: 2026-03-04
> 작성자: Leader
> 참조: protractor-v5-t10-backfill-unify.plan.md

---

## 1. 데이터 모델

### 기존 테이블 (변경 없음)

#### daily_ad_insights
```
Upsert Key: (account_id, date, ad_id)
기존 meta-collector.ts의 upsertInsights() 사용
```

#### daily_mixpanel_insights
```sql
-- 이미 존재하는 테이블 (20260226_daily_mixpanel_insights.sql)
UNIQUE (date, account_id, project_id)  -- upsert conflict target
```
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| date | DATE | 수집 대상 날짜 |
| user_id | UUID | 계정 소유자 (FK → profiles) |
| account_id | TEXT | 광고계정 ID |
| project_id | TEXT | Mixpanel 프로젝트 ID |
| total_revenue | NUMERIC(15,2) | 매출 합계 |
| purchase_count | INTEGER | 구매 건수 |
| collected_at | TIMESTAMPTZ | 수집 시각 |

#### adset_overlap_cache
```sql
-- 이미 존재하는 테이블
UNIQUE (account_id, adset_pair, period_start, period_end)
```
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| account_id | TEXT | 광고계정 ID |
| adset_pair | TEXT | 정렬된 adset ID 조합 또는 `"__overall__"` |
| period_start | DATE | 기간 시작 |
| period_end | DATE | 기간 종료 |
| overlap_data | JSONB | 중복률 데이터 |
| cached_at | TIMESTAMPTZ | 캐시 시각 |

> **주의**: `daily_overlap_insights` 테이블은 미존재. DB 스키마 변경 금지 제약 준수하여 `adset_overlap_cache`에 저장.

### SSE 이벤트 스키마

기존 SSE 이벤트를 확장하여 3단계(phase) 구조로 변경:

```typescript
// ── 공통 ──
type SSEEvent =
  | { type: "start"; phases: PhaseInfo[] }
  | { type: "phase_start"; phase: PhaseName; total: number }
  | { type: "phase_progress"; phase: PhaseName; current: number; total: number; date: string; detail?: string }
  | { type: "phase_complete"; phase: PhaseName; totalDays: number; totalInserted: number }
  | { type: "phase_skip"; phase: PhaseName; reason: string }
  | { type: "phase_error"; phase: PhaseName; message: string }
  | { type: "day_error"; phase: PhaseName; date: string; message: string }
  | { type: "complete"; summary: PhaseSummary[] }
  | { type: "error"; message: string };

type PhaseName = "ad" | "mixpanel" | "overlap";

interface PhaseInfo {
  phase: PhaseName;
  label: string;  // "광고데이터" | "믹스패널" | "타겟중복"
}

interface PhaseSummary {
  phase: PhaseName;
  label: string;
  status: "success" | "skipped" | "error";
  totalDays: number;
  totalInserted: number;
  message?: string;
}
```

## 2. API 설계

### POST /api/admin/backfill

#### 요청
```json
{
  "account_id": "123456789",
  "days": 1
}
```

| 파라미터 | 타입 | 필수 | 설명 |
|----------|------|------|------|
| account_id | string | O | 광고계정 ID |
| days | number | O | 수집 기간 (1, 7, 30, 90) |

> **변경점**: `days` 허용 값에 **1** 추가 → `[1, 7, 30, 90]`

#### 응답: SSE 스트리밍 (text/event-stream)

수집 순서: **광고데이터 → 믹스패널 → 타겟중복** (순차 처리)

```
data: {"type":"start","phases":[{"phase":"ad","label":"광고데이터"},{"phase":"mixpanel","label":"믹스패널"},{"phase":"overlap","label":"타겟중복"}]}

data: {"type":"phase_start","phase":"ad","total":7}
data: {"type":"phase_progress","phase":"ad","current":1,"total":7,"date":"2026-02-25","detail":"12건 저장"}
data: {"type":"phase_progress","phase":"ad","current":2,"total":7,"date":"2026-02-26","detail":"8건 저장"}
...
data: {"type":"phase_complete","phase":"ad","totalDays":7,"totalInserted":65}

data: {"type":"phase_start","phase":"mixpanel","total":7}
data: {"type":"phase_progress","phase":"mixpanel","current":1,"total":7,"date":"2026-02-25"}
...
data: {"type":"phase_complete","phase":"mixpanel","totalDays":7,"totalInserted":7}

data: {"type":"phase_start","phase":"overlap","total":1}
data: {"type":"phase_progress","phase":"overlap","current":1,"total":1,"date":"2026-02-25~2026-03-03","detail":"5쌍 분석"}
data: {"type":"phase_complete","phase":"overlap","totalDays":1,"totalInserted":6}

data: {"type":"complete","summary":[{"phase":"ad","label":"광고데이터","status":"success","totalDays":7,"totalInserted":65},{"phase":"mixpanel","label":"믹스패널","status":"success","totalDays":7,"totalInserted":7},{"phase":"overlap","label":"타겟중복","status":"success","totalDays":1,"totalInserted":6}]}
```

#### 믹스패널 스킵 케이스
계정에 `mixpanel_project_id`가 없거나 시크릿키가 없는 경우:
```
data: {"type":"phase_skip","phase":"mixpanel","reason":"시크릿키 없음"}
```

#### 에러 처리

| 코드 | 조건 | 메시지 |
|------|------|--------|
| 401 | 미인증 | "인증 필요" |
| 403 | admin이 아님 | "관리자 전용" |
| 400 | body 파싱 실패 | "잘못된 요청" |
| 400 | account_id/days 누락 또는 days 범위 외 | "account_id, days(1/7/30/90) 필수" |

### 백필 API 내부 수집 로직

#### Phase 1: 광고데이터 (기존 로직 유지)
```
for each date in dateRange:
  ads = fetchAccountAds(account_id, date)
  rows = buildInsightRows(ads, account_id, accountName, date)
  upsertInsights(svc, rows)  → daily_ad_insights
  SSE: phase_progress("ad", ...)
  sleep(2000)  // rate limit
```

#### Phase 2: 믹스패널 (collect-mixpanel 크론 로직 차용)
```
account = ad_accounts에서 mixpanel_project_id 조회
if (!mixpanel_project_id) → phase_skip("mixpanel", "믹스패널 미연동")

secretKey = service_secrets에서 조회 → 없으면 profiles fallback
if (!secretKey) → phase_skip("mixpanel", "시크릿키 없음")

for each date in dateRange:
  { totalRevenue, purchaseCount } = fetchMixpanelRevenue(projectId, secretKey, date)
  svc.from("daily_mixpanel_insights").upsert({
    date, user_id, account_id, project_id,
    total_revenue, purchase_count, collected_at
  }, { onConflict: "date,account_id,project_id" })
  SSE: phase_progress("mixpanel", ...)
  sleep(2000)  // rate limit (60 queries/hour)
```

> **주의**: `fetchMixpanelRevenue` 함수는 `collect-mixpanel/route.ts`에서 로컬 함수로 정의됨.
> 백필 route에서 사용하려면 **별도 모듈로 추출**하거나 **로직을 복제**해야 함.
> → 설계 결정: `src/lib/protractor/mixpanel-collector.ts` 신규 파일로 추출 권장.

#### Phase 3: 타겟중복 (overlap API 로직 차용)
```
adsets = fetchActiveAdsets(account_id)
if (adsets.length === 0) → phase_skip("overlap", "활성 캠페인 없음")

// 날짜별이 아닌 전체 기간에 대해 1회 계산
dateStart = dateRange의 첫째 날
dateEnd = dateRange의 마지막 날

// 개별 reach는 daily_ad_insights에서 조회 (Phase 1에서 이미 수집됨)
reachByAdset = SUM(reach) GROUP BY adset_id WHERE date BETWEEN dateStart AND dateEnd

// 상위 8개 adset으로 제한 (rate limit 대응)
cappedAdsets = sortByReach(adsets).slice(0, 8)

// Meta API로 조합별 overlap 계산
for each pair (i, j) in cappedAdsets:
  combinedReach = fetchCombinedReach(account_id, [i, j], dateStart, dateEnd)
  overlapRate = (reachA + reachB - combinedReach) / (reachA + reachB) * 100

  svc.from("adset_overlap_cache").upsert({
    account_id, adset_pair: makePairKey(i, j),
    period_start: dateStart, period_end: dateEnd,
    overlap_data: { overlap_rate, reach_a, reach_b, combined_unique, names... },
    cached_at: now
  }, { onConflict: "account_id,adset_pair,period_start,period_end" })

// 전체 overlap 저장
totalUnique = fetchCombinedReach(account_id, allAdsetIds, dateStart, dateEnd)
svc.from("adset_overlap_cache").upsert({
  account_id, adset_pair: "__overall__",
  period_start: dateStart, period_end: dateEnd,
  overlap_data: { overall_rate, total_unique, individual_sum },
  cached_at: now
})

SSE: phase_complete("overlap", ...)
```

## 3. 컴포넌트 구조

### 3-1. 삭제: RecollectButtons

**파일 삭제**: `src/app/(main)/admin/protractor/recollect-buttons.tsx`

**page.tsx 변경**:
```diff
- import { RecollectButtons } from "./recollect-buttons";
  ...
- <RecollectButtons />
```

### 3-2. 수정: BackfillSection

#### Props (변경 없음)
```typescript
interface BackfillAccount {
  account_id: string;
  account_name: string;
}

interface BackfillSectionProps {
  accounts: BackfillAccount[];
}
```

#### State 변경
```typescript
// 기존
const [days, setDays] = useState<7 | 30 | 90>(30);
const [progress, setProgress] = useState({ current: 0, total: 0, date: "" });

// 변경
const [days, setDays] = useState<1 | 7 | 30 | 90>(30);

interface PhaseProgress {
  phase: PhaseName;
  label: string;
  status: "pending" | "running" | "done" | "skipped" | "error";
  current: number;
  total: number;
  date: string;
  detail?: string;
  message?: string;  // skip reason 또는 error message
}

const [phases, setPhases] = useState<PhaseProgress[]>([]);
```

#### PERIOD_OPTIONS 변경
```typescript
// 기존
const PERIOD_OPTIONS = [7, 30, 90] as const;

// 변경
const PERIOD_OPTIONS = [1, 7, 30, 90] as const;
```

#### SSE 파싱 변경

기존 SSE 파서를 phase 기반으로 확장:

```typescript
// phase_start → 해당 phase status를 "running"으로
// phase_progress → 해당 phase의 current/total/date 업데이트
// phase_complete → 해당 phase status를 "done"으로
// phase_skip → 해당 phase status를 "skipped"으로 + reason 표시
// phase_error → 해당 phase status를 "error"으로
// complete → 전체 status를 "done"으로
```

#### UI 레이아웃

```
┌──────────────────────────────────────────────────────┐
│ 과거 데이터 수동 수집                                    │
│ 특정 계정의 과거 데이터를 수동으로 수집합니다.              │
│ (광고데이터 + 매출데이터 + 타겟중복을 한번에 수집)          │
│                                                      │
│ [계정 선택 ▼]  [1일] [7일] [30일] [90일]  [수동 수집]   │
│                                                      │
│ ┌─ 수집 진행 상태 ──────────────────────────────────┐ │
│ │ ✅ 광고데이터     7/7일 완료 (65건)               │ │
│ │    ██████████████████████████████ 100%            │ │
│ │                                                  │ │
│ │ ⏳ 믹스패널       3/7일 (2026-02-27)             │ │
│ │    █████████████░░░░░░░░░░░░░░░░  43%            │ │
│ │                                                  │ │
│ │ ⏸ 타겟중복       대기 중                         │ │
│ │    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░   0%            │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ── 또는 스킵된 경우 ──                                 │
│ ┌──────────────────────────────────────────────────┐ │
│ │ ⏭ 믹스패널       건너뜀 (시크릿키 없음)            │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

#### Phase별 아이콘/색상
| 상태 | 아이콘 | 텍스트 색상 | 프로그레스바 |
|------|--------|------------|-------------|
| pending | `⏸` (회색 원) | text-gray-400 | bg-gray-200 |
| running | 스피너 (animate-spin) | text-gray-700 | bg-[#F75D5D] |
| done | `✅` | text-green-700 | bg-green-500 |
| skipped | `⏭` | text-amber-600 | bg-amber-300 |
| error | `❌` | text-red-600 | bg-red-500 |

### 3-3. 수정: page.tsx

```diff
- import { RecollectButtons } from "./recollect-buttons";
  import { BackfillSection } from "./backfill-section";
  ...
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">총가치각도기 관리</h1>
        <p className="text-gray-500">
          계정별 Meta 데이터 동기화 상태를 확인하고 관리합니다.
        </p>
      </div>
-     <RecollectButtons />
      <BackfillSection accounts={backfillAccounts} />
      <Tabs defaultValue="accounts">
```

## 4. 에러 처리

### API 레벨
| 에러 | 코드 | 메시지 |
|------|------|--------|
| 미인증 | 401 | "인증 필요" |
| 권한 없음 | 403 | "관리자 전용" |
| 잘못된 요청 | 400 | "잘못된 요청" |
| 파라미터 누락 | 400 | "account_id, days(1/7/30/90) 필수" |

### Phase별 에러 처리
| Phase | 에러 | 동작 |
|-------|------|------|
| ad | Meta API 실패 | day_error 전송 후 다음 날짜 계속 |
| ad | META_ACCESS_TOKEN 미설정 | phase_error 전송 → 다음 phase로 |
| mixpanel | project_id 없음 | phase_skip(reason: "믹스패널 미연동") |
| mixpanel | 시크릿키 없음 | phase_skip(reason: "시크릿키 없음") |
| mixpanel | API 401 (키 만료) | phase_error 전송 → 다음 phase로 |
| mixpanel | 타임아웃 | 1회 재시도 후 day_error |
| overlap | 활성 캠페인 없음 | phase_skip(reason: "활성 캠페인 없음") |
| overlap | Meta API rate limit | 55초 타임아웃으로 조기 종료, 수집된 데이터까지만 저장 |

### 클라이언트 에러 UI
- SSE 연결 실패: toast.error("수집 실패") + status를 "error"로 전환
- phase별 에러/스킵: 해당 phase 행에 에러/스킵 상태 표시 (다른 phase는 영향 없음)
- 전체 완료 후: 성공 phase 수/전체 phase 수 표시 (예: "2/3종 수집 완료")

## 5. 구현 순서

```markdown
## 체크리스트 (의존성 순서)

### Step 1: 공통 모듈 추출
- [ ] `src/lib/protractor/mixpanel-collector.ts` 신규 생성
  - `fetchMixpanelRevenue()` 함수를 collect-mixpanel/route.ts에서 추출
  - `lookupMixpanelSecret()` 함수 추출 (service_secrets → profiles fallback)
  - collect-mixpanel/route.ts도 이 모듈을 import하도록 변경 (DRY)

### Step 2: 백필 API 확장
- [ ] `/api/admin/backfill/route.ts` 수정
  - days 허용값에 1 추가: `[1, 7, 30, 90]`
  - SSE 이벤트 스키마를 phase 기반으로 변경
  - Phase 1 (ad): 기존 로직 유지, SSE 이벤트만 phase 형식으로 변경
  - Phase 2 (mixpanel): mixpanel-collector.ts 사용
  - Phase 3 (overlap): overlap-utils.ts 사용, adset_overlap_cache에 저장

### Step 3: 프론트엔드 변경
- [ ] `page.tsx`에서 RecollectButtons import/사용 제거
- [ ] `recollect-buttons.tsx` 파일 삭제
- [ ] `backfill-section.tsx` 수정:
  - PERIOD_OPTIONS에 1 추가
  - days state 타입에 1 추가
  - PhaseProgress state 추가
  - SSE 파싱 로직 phase 기반으로 변경
  - 3종 진행률 UI 구현

### Step 4: 빌드 검증
- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0
- [ ] `npx next lint --quiet` — lint 에러 0
- [ ] `npm run build` — 빌드 성공
```

## 6. 파일 변경 요약

| 파일 | 작업 | 설명 |
|------|------|------|
| `src/lib/protractor/mixpanel-collector.ts` | **신규** | fetchMixpanelRevenue, lookupMixpanelSecret 추출 |
| `src/app/api/cron/collect-mixpanel/route.ts` | 수정 (import만) | mixpanel-collector.ts에서 함수 import로 변경 |
| `src/app/api/admin/backfill/route.ts` | 수정 | 3종 수집 로직 + phase SSE |
| `src/app/(main)/admin/protractor/page.tsx` | 수정 | RecollectButtons 제거 |
| `src/app/(main)/admin/protractor/recollect-buttons.tsx` | **삭제** | 컴포넌트 제거 |
| `src/app/(main)/admin/protractor/backfill-section.tsx` | 수정 | 1일 옵션 + 3종 진행률 UI |
