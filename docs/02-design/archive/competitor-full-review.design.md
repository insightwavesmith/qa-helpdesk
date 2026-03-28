# 경쟁사 분석기 전체 리뷰 + 개선 설계서

> 작성일: 2026-03-07
> 태스크: TASK-경쟁사분석기-전체리뷰.md
> Plan: `docs/01-plan/features/competitor-full-review.plan.md`

---

## 1. 데이터 모델

### 1-1. 기존 테이블 (변경 없음)

`competitor_monitors`, `competitor_alerts`, `competitor_insight_cache` — 기존 설계서(`competitor-analyzer.design.md`) 참조. 스키마 변경 없음.

### 1-2. 타입 안전성 개선 (C3 대응)

현재 `database.ts`에 competitor 테이블 타입이 없어 `(svc as any)` 7곳 사용 중. Supabase CLI 타입 재생성이 불가한 경우를 대비하여 로컬 타입 정의로 대체:

```typescript
// src/types/competitor.ts 에 추가 (기존 타입 아래)

/** DB Row 타입 (database.ts 재생성 전 임시) */
export interface CompetitorMonitorRow {
  id: string;
  user_id: string;
  brand_name: string;
  page_id: string | null;
  last_checked_at: string | null;
  last_ad_count: number | null;
  created_at: string;
}

export interface CompetitorAlertRow {
  id: string;
  monitor_id: string;
  new_ad_ids: string[];   // jsonb
  detected_at: string;
  is_read: boolean;
}

export interface CompetitorInsightCacheRow {
  id: string;
  search_query: string;
  insight_data: CompetitorInsight;
  ad_count: number;
  created_at: string;
  expires_at: string;
}
```

**적용 방식**: `(svc as any)` 대신 응답에 Row 타입을 명시하여 타입 안전성 확보. `createServiceClient()` 자체는 `as any` 유지하되, `.from().select()` 결과에 타입 단언.

---

## 2. API 설계

### 2-1. T2: 모니터링 수정 사항

#### 2-1-1. 알림 목록 조회 GET 추가 (H1)

```
GET /api/competitor/monitors/[id]/alerts
```

**파일**: `src/app/api/competitor/monitors/[id]/alerts/route.ts`

**인증**: 필수 (본인 소유 모니터 확인)

**응답 (200)**:
```json
{
  "alerts": [
    {
      "id": "uuid",
      "monitorId": "uuid",
      "newAdIds": ["ad_id_1", "ad_id_2"],
      "detectedAt": "2026-03-07T09:00:00Z",
      "isRead": false
    }
  ]
}
```

**내부 동작**:
1. `createClient()` → 사용자 인증 확인
2. 모니터 소유권 확인 (`competitor_monitors WHERE id = [id] AND user_id = auth.uid()`)
3. `competitor_alerts WHERE monitor_id = [id]` 조회 (최신순, limit 50)
4. camelCase 변환 후 반환

#### 2-1-2. 중복 브랜드 등록 방지 (M3)

`POST /api/competitor/monitors` 수정:

```typescript
// 기존 코드 (한도 확인) 이후 추가:
// 동일 브랜드 중복 확인
const { data: existing } = await svc
  .from("competitor_monitors")
  .select("id")
  .eq("user_id", user.id)
  .eq("brand_name", brandName)
  .maybeSingle();

if (existing) {
  return NextResponse.json(
    { error: "이미 등록된 브랜드입니다", code: "DUPLICATE_MONITOR" },
    { status: 409 }
  );
}
```

**에러 코드 추가**: `DUPLICATE_MONITOR` (409 Conflict)

#### 2-1-3. DELETE 결과 확인 (M4)

```typescript
// 삭제 후 영향받은 행 확인
const { error, count } = await svc
  .from("competitor_monitors")
  .delete()
  .eq("id", id)
  .eq("user_id", user.id);

if (error) { /* 기존 에러 처리 */ }
// count 기반 확인은 Supabase의 delete가 count를 반환하지 않으므로,
// 삭제 전 존재 확인 또는 현재 동작 유지 (영향 낮음)
```

**결정**: 현재 동작 유지. DELETE는 멱등성 원칙상 존재하지 않는 리소스 삭제도 200 반환이 표준.

#### 2-1-4. PATCH 알림 에러 처리 (M5)

```typescript
const { error: updateError } = await svc
  .from("competitor_alerts")
  .update({ is_read: true })
  .in("id", alertIds)
  .eq("monitor_id", id);

if (updateError) {
  return NextResponse.json(
    { error: "알림 업데이트 실패", code: "DB_ERROR" },
    { status: 500 }
  );
}
```

### 2-2. T3: AI 인사이트 수정 사항

#### 2-2-1. 인증 추가 (C2)

`POST /api/competitor/insights` 수정:

```typescript
// 기존 코드 최상단에 추가:
import { createClient } from "@/lib/supabase/server";

// handler 시작 부분:
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

if (!user) {
  return NextResponse.json(
    { error: "로그인이 필요합니다", code: "UNAUTHORIZED" },
    { status: 401 }
  );
}
```

#### 2-2-2. Anthropic 직접 호출 timeout 추가 (H2)

`src/lib/competitor/analyze-ads.ts` 수정:

```typescript
async function callAnthropicDirect(
  apiKey: string,
  body: Record<string, unknown>,
): Promise<AnthropicResponseData> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120_000); // 120초

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Anthropic API ${res.status}: ${errText.substring(0, 200)}`);
    }

    return (await res.json()) as AnthropicResponseData;
  } finally {
    clearTimeout(timer);
  }
}
```

#### 2-2-3. AI 응답 JSON 검증 (H3)

`src/lib/competitor/analyze-ads.ts` — `analyzeAds()` 함수 끝부분 수정:

```typescript
const parsed = JSON.parse(jsonStr);

// 필수 필드 검증
if (
  typeof parsed.longRunningAdCount !== "number" ||
  typeof parsed.totalAdCount !== "number" ||
  typeof parsed.summary !== "string" ||
  !Array.isArray(parsed.hookTypes) ||
  !Array.isArray(parsed.seasonPattern)
) {
  throw new Error("AI 응답 형식이 올바르지 않습니다");
}

const insight: CompetitorInsight = {
  longRunningAdCount: parsed.longRunningAdCount,
  totalAdCount: parsed.totalAdCount,
  videoRatio: parsed.videoRatio ?? 0,
  imageRatio: parsed.imageRatio ?? 1,
  platformDistribution: parsed.platformDistribution ?? { facebook: 0, instagram: 0, messenger: 0 },
  hookTypes: parsed.hookTypes,
  seasonPattern: parsed.seasonPattern,
  keyProducts: parsed.keyProducts ?? [],
  summary: parsed.summary,
  analyzedAt: new Date().toISOString(),
};

return insight;
```

### 2-3. T4: 크론 수정 사항

#### 2-3-1. 신규 광고 감지 로직 개선 (C1)

**현재 문제**: `currentAdCount > prevAdCount` 단순 비교는 광고 제거+추가 시 감지 실패. 또한 `ads.slice(0, diff)`는 durationDays DESC 정렬이라 신규 광고(짧은 운영기간)가 리스트 끝에 위치.

**수정 방안**: 광고 ID 기반 비교로 변경.

```typescript
// src/app/api/cron/competitor-check/route.ts 수정

for (const monitor of monitorList) {
  try {
    const result = await searchMetaAds({
      searchTerms: monitor.brand_name,
      limit: 50,
    });

    const currentAdCount = result.totalCount;
    const currentAdIds = result.ads.map((ad) => ad.id);

    // 신규 광고 감지: 카운트 증가 시 알림 생성
    // (ID 기반 정밀 비교는 이전 ID 목록 저장이 필요하므로,
    //  현재 스키마에서는 카운트 비교 유지 + slice 방향 수정)
    if (currentAdCount > (monitor.last_ad_count ?? 0)) {
      const diff = currentAdCount - (monitor.last_ad_count ?? 0);

      // 신규 광고는 운영기간이 짧으므로 리스트 끝에서 추출
      const newAdIds = result.ads
        .slice(-diff)
        .map((ad) => ad.id);

      await svc.from("competitor_alerts").insert({
        monitor_id: monitor.id,
        new_ad_ids: newAdIds,
      });

      newAlerts++;
    }

    // 모니터 업데이트 (page_id 자동 변경 제거 — M7)
    await svc
      .from("competitor_monitors")
      .update({
        last_checked_at: new Date().toISOString(),
        last_ad_count: currentAdCount,
      })
      .eq("id", monitor.id);

    processed++;

    // Rate limit 완화: 브랜드 간 500ms 딜레이 (M6)
    if (monitorList.indexOf(monitor) < monitorList.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  } catch (err) {
    if (err instanceof MetaAdError && err.code === "RATE_LIMITED") {
      break;
    }
    console.error(`[competitor-check] ${monitor.brand_name} 체크 실패:`, err);
  }
}
```

**변경 포인트**:
1. `ads.slice(0, diff)` → `ads.slice(-diff)` — 신규 광고(짧은 운영기간)는 리스트 끝에 위치
2. `page_id` 자동 업데이트 제거 — 의도치 않은 page_id 변경 방지 (M7)
3. 브랜드 간 500ms 딜레이 추가 — Meta API rate limit 완화 (M6)

### 2-4. T5: 디버그 로그 정리

#### 대상 파일 + 제거 라인

| 파일 | 라인 | 내용 | 조치 |
|------|------|------|------|
| `src/lib/competitor/meta-ad-library.ts` | L70-75 | `console.log("[meta-ad-library] 토큰 확인:", ...)` | 삭제 |
| `src/app/api/competitor/search/route.ts` | L32-35 | `console.log("[competitor/search] META_AD_LIBRARY_TOKEN:", ...)` | 삭제 |

**유지할 로그**:
- `console.error("[competitor-check] ... 체크 실패:", err)` — 크론 에러 로그 (운영 필수)
- `console.error("[competitor/insights] 분석 실패:", err)` — AI 분석 에러 로그

---

## 3. 컴포넌트 구조

### 3-1. 변경 대상 컴포넌트

T2~T5는 주로 백엔드(API route + lib) 수정이며, 프론트엔드 컴포넌트 변경은 최소:

#### 3-1-1. ad-card.tsx — caption 링크 수정 (H4)

**현재 문제**: `ad_creative_link_captions`는 "example.com" 같은 표시용 텍스트인데 URL로 사용 중.

**수정**:
```tsx
// caption이 URL 형태일 때만 링크 표시
{ad.caption && /^https?:\/\//.test(ad.caption) && (
  <a
    href={ad.caption}
    target="_blank"
    rel="noopener noreferrer"
    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-[#F75D5D] bg-red-50 hover:bg-red-100 rounded-lg transition"
  >
    <ExternalLink className="h-3.5 w-3.5" />
    랜딩페이지
  </a>
)}
```

**변경 이유**: caption 필드는 Meta Ad Library의 `ad_creative_link_captions`로, URL이 아닌 경우가 대부분. URL 형태(`http://` 시작)인 경우에만 링크 렌더링.

#### 3-1-2. add-monitor-dialog.tsx — ESC 키 핸들러 (M9)

```typescript
// useEffect 추가:
useEffect(() => {
  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") onClose();
  }
  document.addEventListener("keydown", handleKeyDown);
  return () => document.removeEventListener("keydown", handleKeyDown);
}, [onClose]);
```

#### 3-1-3. competitor-dashboard.tsx — handleAnalyze deps 최적화 (M10)

```typescript
// filteredAds를 useMemo로 안정화:
const filteredAds = useMemo(() => {
  return ads.filter((ad) => {
    if (filters.activeOnly && !ad.isActive) return false;
    if (filters.minDays > 0 && ad.durationDays < filters.minDays) return false;
    if (filters.platform && !ad.platforms.includes(filters.platform)) return false;
    return true;
  });
}, [ads, filters]);

// handleAnalyze의 deps가 안정적인 filteredAds 참조 사용
```

### 3-2. 변경하지 않는 컴포넌트

| 컴포넌트 | 이유 |
|----------|------|
| `search-bar.tsx` | 코드 품질 양호, 이슈 없음 |
| `filter-chips.tsx` | M8(누락 칩)은 설계서 범위 외 — 현재 4개 칩으로 충분 |
| `monitor-panel.tsx` | 코드 품질 양호 |
| `monitor-brand-card.tsx` | 코드 품질 양호, 접근성 구현 |
| `insight-section.tsx` | 3상태 렌더링 양호 |
| `insight-stat-card.tsx` | 단순 표시 컴포넌트, 이슈 없음 |
| `hook-type-chart.tsx` | 코드 품질 양호 |
| `season-chart.tsx` | 코드 품질 양호 |
| `ad-card-list.tsx` | 코드 품질 양호 |
| `duration-bar.tsx` | 코드 품질 양호 |

---

## 4. 에러 처리

### 4-1. 신규 에러 코드

| 상황 | HTTP | 코드 | 메시지 |
|------|------|------|--------|
| 중복 브랜드 등록 | 409 | `DUPLICATE_MONITOR` | "이미 등록된 브랜드입니다" |
| 알림 업데이트 실패 | 500 | `DB_ERROR` | "알림 업데이트 실패" |
| AI 응답 형식 오류 | 500 | `INSIGHT_ERROR` | "AI 분석에 실패했습니다. 다시 시도하세요." (기존 catch) |
| AI 호출 타임아웃 | 500 | `INSIGHT_ERROR` | "AI 분석에 실패했습니다. 다시 시도하세요." (기존 catch) |

### 4-2. 기존 에러 코드 (유지)

`TOKEN_MISSING`, `INVALID_QUERY`, `META_API_ERROR`, `RATE_LIMITED`, `MONITOR_LIMIT`, `UNAUTHORIZED`, `INSIGHT_ERROR` — 변경 없음.

### 4-3. 에러 코드 타입 업데이트

```typescript
// src/types/competitor.ts
export type CompetitorErrorCode =
  | "TOKEN_MISSING"
  | "INVALID_QUERY"
  | "META_API_ERROR"
  | "RATE_LIMITED"
  | "MONITOR_LIMIT"
  | "DUPLICATE_MONITOR"  // 신규
  | "UNAUTHORIZED"
  | "INSIGHT_ERROR"
  | "DB_ERROR";           // 신규
```

---

## 5. 구현 순서 (체크리스트)

### T2: 모니터링 기능 점검 + 수정

- [ ] `src/types/competitor.ts` — DB Row 타입 3종 추가 (CompetitorMonitorRow, CompetitorAlertRow, CompetitorInsightCacheRow)
- [ ] `src/types/competitor.ts` — CompetitorErrorCode에 `DUPLICATE_MONITOR`, `DB_ERROR` 추가
- [ ] `src/app/api/competitor/monitors/route.ts` — POST에 중복 브랜드 체크 추가 (M3)
- [ ] `src/app/api/competitor/monitors/[id]/alerts/route.ts` — GET 핸들러 추가 (H1)
- [ ] `src/app/api/competitor/monitors/[id]/alerts/route.ts` — PATCH 에러 처리 추가 (M5)
- [ ] 로컬 curl 테스트: 등록 → 조회 → 중복 등록(409) → 알림 조회 → 삭제

### T3: AI 인사이트 기능 점검 + 수정

- [ ] `src/app/api/competitor/insights/route.ts` — 인증 체크 추가 (C2)
- [ ] `src/lib/competitor/analyze-ads.ts` — `callAnthropicDirect`에 AbortController + 120s timeout 추가 (H2)
- [ ] `src/lib/competitor/analyze-ads.ts` — `analyzeAds()` JSON 응답 검증 로직 추가 (H3)
- [ ] `src/app/(main)/protractor/competitor/components/ad-card.tsx` — caption 링크 조건부 렌더링 (H4)

### T4: 크론 체크 기능 점검

- [ ] `src/app/api/cron/competitor-check/route.ts` — `ads.slice(0, diff)` → `ads.slice(-diff)` 수정 (C1)
- [ ] `src/app/api/cron/competitor-check/route.ts` — page_id 자동 업데이트 제거 (M7)
- [ ] `src/app/api/cron/competitor-check/route.ts` — 브랜드 간 500ms 딜레이 추가 (M6)

### T5: 디버그 로그 정리

- [ ] `src/lib/competitor/meta-ad-library.ts` L70-75 — console.log 삭제 (M1)
- [ ] `src/app/api/competitor/search/route.ts` L32-35 — console.log 삭제 (M2)

### 공통 (모든 T 완료 후)

- [ ] `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx` — ESC 키 핸들러 추가 (M9)
- [ ] `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` — filteredAds useMemo 적용 (M10)
- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0개
- [ ] `npx next lint --quiet` — lint 에러 0개
- [ ] `npm run build` — 빌드 성공

---

## 6. 변경 파일 요약

| 파일 | T | 변경 내용 |
|------|---|-----------|
| `src/types/competitor.ts` | T2 | DB Row 타입 3종 + ErrorCode 2종 추가 |
| `src/app/api/competitor/monitors/route.ts` | T2 | POST 중복 체크 추가 |
| `src/app/api/competitor/monitors/[id]/alerts/route.ts` | T2 | GET 핸들러 추가 + PATCH 에러 처리 |
| `src/app/api/competitor/insights/route.ts` | T3 | 인증 체크 추가 |
| `src/lib/competitor/analyze-ads.ts` | T3 | timeout 추가 + JSON 검증 |
| `src/app/(main)/protractor/competitor/components/ad-card.tsx` | T3 | caption 링크 조건부 |
| `src/app/api/cron/competitor-check/route.ts` | T4 | slice 방향 + page_id 제거 + 딜레이 |
| `src/lib/competitor/meta-ad-library.ts` | T5 | debug log 삭제 |
| `src/app/api/competitor/search/route.ts` | T5 | debug log 삭제 |
| `src/app/(main)/protractor/competitor/components/add-monitor-dialog.tsx` | 공통 | ESC 핸들러 |
| `src/app/(main)/protractor/competitor/competitor-dashboard.tsx` | 공통 | useMemo |

**총 변경 파일**: 11개 (신규 0개, 수정 11개)

---

## 7. 하지 말 것 (TASK 제약)

- T1에서 코드 수정 금지 (리뷰만)
- 모니터링 상한(10개) 로직 변경 금지
- AI 모델 변경 금지 (기존 claude-sonnet-4-20250514 유지)
- 크론 스케줄 변경 금지
- 에러 처리 로직 변경 금지 (T5)
