# T8. 과거데이터 수동 수집 기능 — Design

> 작성일: 2026-03-04
> 스프린트: 총가치각도기 v5

## 1. 데이터 모델

### 새 DB 테이블 없음
- `daily_ad_insights` 기존 테이블에 `INSERT OR UPDATE (upsert)` — 기존 스키마 활용

### API 요청/응답

**POST /api/admin/backfill**
```
Content-Type: application/json
Body: {
  account_id: string,  // "123456789"
  days: 7 | 30 | 90
}

Response: text/event-stream (SSE)
data: {"type": "start", "total": 30, "accountId": "123456789"}
data: {"type": "progress", "current": 1, "total": 30, "date": "2026-02-03", "inserted": 15}
data: {"type": "progress", "current": 2, "total": 30, "date": "2026-02-04", "inserted": 22}
...
data: {"type": "complete", "totalDays": 30, "totalInserted": 847}
data: {"type": "error", "message": "Meta API rate limit exceeded"}
```

## 2. API 설계

### POST /api/admin/backfill (신규)

**파일**: `src/app/api/admin/backfill/route.ts`

```typescript
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 300; // 5분 (Vercel Pro)

export async function POST(request: NextRequest) {
  // 1. admin 권한 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "인증 필요" }, { status: 401 });

  const svc = createServiceClient();
  const { data: profile } = await svc.from("profiles")
    .select("role").eq("id", user.id).single();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "관리자 전용" }, { status: 403 });
  }

  const { account_id, days } = await request.json();
  if (!account_id || ![7, 30, 90].includes(days)) {
    return NextResponse.json({ error: "account_id, days(7/30/90) 필수" }, { status: 400 });
  }

  // 2. SSE 스트리밍 응답
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      try {
        // 수집 날짜 범위 생성 (오늘-1일 ~ 오늘-days일)
        const dates: string[] = [];
        for (let i = 1; i <= days; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          dates.push(`${y}-${m}-${day}`);
        }
        dates.reverse(); // 오래된 날짜부터 처리

        send({ type: "start", total: dates.length, accountId: account_id });

        let totalInserted = 0;

        for (let i = 0; i < dates.length; i++) {
          const dateStr = dates[i];
          try {
            // collect-daily 로직 재활용 (fetchAccountAds import)
            const inserted = await backfillOneDay(svc, account_id, dateStr);
            totalInserted += inserted;
            send({
              type: "progress",
              current: i + 1,
              total: dates.length,
              date: dateStr,
              inserted,
            });
          } catch (e) {
            send({
              type: "dayError",
              date: dateStr,
              message: (e as Error).message,
            });
          }

          // rate limit 방지: 2초 대기
          if (i < dates.length - 1) {
            await new Promise(r => setTimeout(r, 2000));
          }
        }

        send({ type: "complete", totalDays: dates.length, totalInserted });
      } catch (e) {
        send({ type: "error", message: (e as Error).message || "Unknown error" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
```

### backfillOneDay 헬퍼 함수

```typescript
// collect-daily의 fetchAccountAds + upsert 로직 추출 (공유)
async function backfillOneDay(
  svc: SupabaseClient,
  accountId: string,
  dateStr: string
): Promise<number> {
  const ads = await fetchAccountAds(accountId, dateStr);

  const rows = ads.map((ad) => ({
    account_id: accountId,
    date: dateStr,
    ad_id: ...,
    // calculateMetrics(insight) 결과
  }));

  if (rows.length === 0) return 0;

  const { error } = await svc
    .from("daily_ad_insights")
    .upsert(rows, { onConflict: "account_id,ad_id,date" });

  if (error) throw new Error(error.message);
  return rows.length;
}
```

**주의**: `fetchAccountAds`와 `calculateMetrics`는 `collect-daily/route.ts`에 있는 내부 함수.
→ 공통 모듈로 추출: `src/lib/protractor/meta-collector.ts`

**공통 모듈 추출 계획**:
```typescript
// src/lib/protractor/meta-collector.ts (신규)
export async function fetchAccountAds(accountId: string, targetDate?: string): Promise<AdRow[]>
export function calculateMetrics(insight: Record<string, unknown>): MetricResult
export async function upsertInsights(svc: SupabaseClient, rows: InsightRow[]): Promise<number>
```

## 3. 컴포넌트 구조

### BackfillSection.tsx (신규)

**파일**: `src/app/(main)/admin/protractor/backfill-section.tsx`

```tsx
"use client";

interface Props {
  accounts: { account_id: string; account_name: string }[];
}

export function BackfillSection({ accounts }: Props) {
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ current: 0, total: 0, date: "" });

  async function handleBackfill() {
    setStatus("running");
    setProgress({ current: 0, total: 0, date: "" });

    const res = await fetch("/api/admin/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ account_id: selectedAccountId, days }),
    });

    if (!res.body) return;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      const text = decoder.decode(value);
      const lines = text.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const data = JSON.parse(line.slice(6));

        if (data.type === "start") {
          setProgress(prev => ({ ...prev, total: data.total }));
        } else if (data.type === "progress") {
          setProgress({ current: data.current, total: data.total, date: data.date });
        } else if (data.type === "complete") {
          setStatus("done");
          toast.success(`${data.totalDays}일 데이터 수집 완료 (${data.totalInserted}건)`);
        } else if (data.type === "error") {
          setStatus("error");
          toast.error(`수집 실패: ${data.message}`);
        }
      }
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>과거 데이터 수동 수집</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-3 items-end flex-wrap">
          {/* 계정 선택 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">계정</label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              disabled={status === "running"}
              className="border rounded-lg px-3 py-2 text-sm"
            >
              <option value="">계정 선택</option>
              {accounts.map(a => (
                <option key={a.account_id} value={a.account_id}>
                  {a.account_name} ({a.account_id})
                </option>
              ))}
            </select>
          </div>

          {/* 기간 선택 */}
          <div>
            <label className="text-sm font-medium text-gray-700 mb-1 block">기간</label>
            <div className="flex gap-2">
              {([7, 30, 90] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  disabled={status === "running"}
                  className={`px-4 py-2 text-sm rounded-lg border ${
                    days === d
                      ? "bg-[#F75D5D] text-white border-[#F75D5D]"
                      : "bg-white text-gray-700 border-gray-300"
                  }`}
                >
                  {d}일
                </button>
              ))}
            </div>
          </div>

          {/* 수집 버튼 */}
          <Button
            onClick={handleBackfill}
            disabled={!selectedAccountId || status === "running"}
            className="bg-[#F75D5D] hover:bg-[#E54949]"
          >
            {status === "running" ? "수집 중..." : "수동 수집"}
          </Button>
        </div>

        {/* 진행 상태 */}
        {status === "running" && progress.total > 0 && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              수집 중... {progress.current}/{progress.total}일 ({progress.date})
            </div>
            <div className="mt-2 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#F75D5D] transition-all"
                style={{ width: `${(progress.current / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### admin/protractor/page.tsx 변경

```tsx
// 계정 목록을 서버에서 조회하여 BackfillSection에 전달
import { BackfillSection } from "./backfill-section";

export default async function AdminProtractorPage() {
  const svc = createServiceClient();
  const { data: adAccounts } = await svc
    .from("ad_accounts")
    .select("account_id, account_name")
    .order("account_name");

  return (
    <div className="space-y-6">
      ...
      <BackfillSection accounts={adAccounts ?? []} />
      ...
    </div>
  );
}
```

**주의**: `page.tsx`가 현재 Server Component이므로 `createServiceClient()` 사용 가능.

## 4. 공통 모듈 추출 설계

`collect-daily/route.ts` 내부 함수를 공유 모듈로 추출:

```typescript
// src/lib/protractor/meta-collector.ts (신규)

export const AD_FIELDS = "...";
export const INSIGHT_FIELDS = "...";

export function calculateMetrics(insight: Record<string, unknown>): InsightMetrics { ... }
export async function fetchAccountAds(accountId: string, targetDate?: string): Promise<AdData[]> { ... }
export async function upsertInsights(
  svc: SupabaseClient,
  accountId: string,
  date: string,
  ads: AdData[],
): Promise<number> { ... }
```

- `collect-daily/route.ts` → `meta-collector.ts` 함수 import 사용
- `backfill/route.ts` → 동일 함수 import

## 5. 영향 범위

| 파일 | 변경 유형 | 내용 |
|------|---------|------|
| `src/app/api/admin/backfill/route.ts` | **신규** | 백필 API (SSE 스트리밍) |
| `src/lib/protractor/meta-collector.ts` | **신규** | Meta API 공통 모듈 추출 |
| `src/app/(main)/admin/protractor/backfill-section.tsx` | **신규** | 백필 UI 컴포넌트 |
| `src/app/(main)/admin/protractor/page.tsx` | 수정 | BackfillSection 추가, 계정 목록 fetch |
| `src/app/api/cron/collect-daily/route.ts` | 수정 (선택) | meta-collector.ts import로 리팩토링 |

## 6. 에러 처리

| 에러 상황 | 처리 방법 |
|----------|---------|
| 계정 미선택 | 버튼 비활성화 |
| Meta API 429 (rate limit) | SSE `dayError` 이벤트 + 재시도 대기 후 계속 |
| Meta API 기타 에러 | SSE `dayError` 이벤트, 해당 날짜 스킵 + 계속 진행 |
| 치명적 에러 | SSE `error` 이벤트 + 스트림 종료 |
| 수집 중 새로고침 | 진행 중 상태 유지 불가 (수용 가능 — 재시작 필요) |

## 7. 구현 체크리스트

- [ ] `meta-collector.ts` 공통 모듈 신규 작성
  - [ ] `fetchAccountAds()` 추출
  - [ ] `calculateMetrics()` 추출
  - [ ] `upsertInsights()` 추출
- [ ] `collect-daily/route.ts` → `meta-collector.ts` import 전환 (기능 동일 유지)
- [ ] `backfill/route.ts` 신규 작성
  - [ ] admin 권한 확인
  - [ ] SSE 스트리밍 구현
  - [ ] 날짜 루프 + rate limit 대기
  - [ ] maxDuration = 300 설정
- [ ] `backfill-section.tsx` 신규 작성
  - [ ] 계정 드롭다운
  - [ ] 7/30/90일 버튼
  - [ ] SSE 스트림 읽기 + 진행 상태 표시
  - [ ] 완료 토스트
- [ ] `admin/protractor/page.tsx` 계정 목록 fetch + BackfillSection 추가
- [ ] `tsc --noEmit` 에러 없음
- [ ] `npm run build` 성공
