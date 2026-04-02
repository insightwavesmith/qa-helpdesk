# 크론 파이프라인 정비 Design (V2)

> 작성일: 2026-04-03
> 작성자: PM
> 레벨: L2-기능
> 선행: system-review-integrated-2026-04-03.report.md (점검 결과)
> 선행: docs/reports/ops/cron-health-check.md (크론 건강 점검)
> 선행: prescription-pipeline-v3.design.md (처방 V3)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | 크론 파이프라인 체인 완성 + 전수 로깅 + 장애 알림 |
| **핵심 변경** | run-prescription 체인 연결, discover-accounts 등록, cron_runs 28개 전수 |
| **현재 문제** | 처방 Scheduler 미등록, 로깅 32%, 체인 끊김 감지 불가 |
| **TDD** | 35건 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | run-prescription이 Scheduler 미등록으로 자동 실행 안 됨, 크론 68% 블라인드 |
| **Solution** | Scheduler 등록 2건 + triggerNext 체인 연결 + cron_runs 전수 + 실패 Slack |
| **Function UX Effect** | 처방이 매일 자동 실행, 크론 장애 즉시 Slack 알림 |
| **Core Value** | 수집→분석→처방 완전 자동 파이프라인 달성 |

---

## 1. 현행 체인 구조 + 문제점

### 1.1 현재 체인 맵

```
collect-daily (01:00 KST, chain=true)
  │ triggerNext("process-media")
  ▼
process-media (chain=true)
  │ triggerNext(["embed-creatives", "creative-saliency", "video-saliency"])
  ▼
┌─ embed-creatives      ──┐
├─ creative-saliency    ──┤  (병렬, fire-and-forget)
└─ video-saliency       ──┘
  │
  ✖ ← 여기서 체인 끊김
  │
video-scene-analysis (05:00 KST, 독립 Scheduler)
  │
  ✖ ← triggerNext 없음 (파이프라인 마지막 단계라고 명시됨)
  │
run-prescription (Scheduler 미등록, 수동 실행만)
```

### 1.2 문제 3건

| # | 문제 | 영향 | 우선순위 |
|---|------|------|---------|
| 1 | run-prescription Scheduler 미등록 | 처방 자동화 불가 | **P0** |
| 2 | discover-accounts Scheduler 미등록 | 신규 광고계정 미탐지 | **P0** |
| 3 | saliency → scene-analysis 체인 미연결 | 체인 끊김, 데이터 순서 불보장 | P1 |

---

## 2. 목표 체인 구조

### 2.1 완성된 체인 맵

```
collect-daily (01:00 KST, chain=true)
  │ triggerNext("process-media")
  ▼
process-media (chain=true)
  │ triggerNext(["embed-creatives", "creative-saliency", "video-saliency"])
  ▼
┌─ embed-creatives      ──┐
├─ creative-saliency    ──┤  (병렬)
└─ video-saliency       ──┘
  │ (신규) 마지막 완료 시 triggerNext("video-scene-analysis")
  ▼
video-scene-analysis (05:00 KST 독립 + chain 콜백)
  │ (신규) triggerNext("run-prescription")
  ▼
run-prescription (06:00 KST 독립 + chain 콜백)
  │ 파이프라인 완료
  ▼
(신규) 완료 Slack 알림

discover-accounts (월요일 08:00 KST, 독립)
```

### 2.2 이중 안전장치 설계

| 크론 | 독립 Scheduler | 체인 콜백 | 이유 |
|------|:-------------:|:---------:|------|
| video-scene-analysis | ✅ 05:00 KST | ✅ saliency 후 | 체인 끊겨도 05:00에 독립 실행 |
| run-prescription | ✅ 06:00 KST | ✅ scene 후 | 체인 끊겨도 06:00에 독립 실행 |
| discover-accounts | ✅ 월 08:00 KST | ❌ (독립) | 주간 작업, 체인 불필요 |

---

## 3. Scheduler 등록

### 3.1 run-prescription (P0)

```bash
gcloud scheduler jobs create http run-prescription-daily \
  --schedule="0 21 * * *" \
  --time-zone="UTC" \
  --uri="https://bscamp-cron-906295665279.asia-northeast3.run.app/api/cron/run-prescription" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --description="매일 06:00 KST 처방 자동 실행" \
  --attempt-deadline=600s \
  --location=asia-northeast3
```

**주의**: run-prescription은 현재 `ids`와 `account_id` 파라미터가 필수. Scheduler 호출 시 전체 계정 대상 배치 모드가 필요.

### 3.2 배치 모드 추가 (run-prescription 수정)

현재 run-prescription은 개별 `ids` 지정 방식. 전체 배치 모드 추가:

```typescript
// src/app/api/cron/run-prescription/route.ts 수정

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const accountId = searchParams.get("account_id") ?? "";
  const batchMode = searchParams.get("batch") === "true";  // (신규)

  // 배치 모드: 처방 미생성 소재 자동 조회
  if (batchMode || (ids.length === 0 && !accountId)) {
    return handleBatchPrescription(svc);
  }

  // 기존 개별 모드
  if (ids.length === 0 || !accountId) {
    return NextResponse.json(
      { error: "ids, account_id 파라미터 필수 (또는 batch=true)" },
      { status: 400 },
    );
  }
  // ... 기존 로직
}

async function handleBatchPrescription(svc: SupabaseClient) {
  const runId = await startCronRun("run-prescription");

  // 처방 미생성 + 5축 분석 완료 소재 조회 (최신 100건)
  const { data: targets } = await svc
    .from("creative_media")
    .select("id, creative_id, creatives!inner(account_id)")
    .is("analysis_json->prescription", null)           // 처방 미생성
    .not("analysis_json->andromeda_signals", "is", null) // 5축 분석 완료
    .order("created_at", { ascending: false })
    .limit(100);

  let ok = 0, fail = 0;
  for (const t of targets ?? []) {
    try {
      await generatePrescription(svc, t.id, t.creatives.account_id, true);
      ok++;
    } catch (e) {
      console.error(`[run-prescription] batch 실패: ${t.id}`, e);
      fail++;
    }
  }

  await completeCronRun(runId, fail > 0 ? "partial" : "success", ok, 
    fail > 0 ? `${fail}건 실패` : undefined);

  return NextResponse.json({ message: `배치 처방: ${ok}건 성공, ${fail}건 실패` });
}
```

### 3.3 discover-accounts (P0)

```bash
gcloud scheduler jobs create http discover-accounts-weekly \
  --schedule="0 23 * * 0" \
  --time-zone="UTC" \
  --uri="https://bscamp-cron-906295665279.asia-northeast3.run.app/api/cron/discover-accounts" \
  --http-method=GET \
  --headers="Authorization=Bearer ${CRON_SECRET}" \
  --description="매주 월요일 08:00 KST 계정 자동 탐색" \
  --attempt-deadline=300s \
  --location=asia-northeast3
```

discover-accounts는 이미 `startCronRun`/`completeCronRun` 사용 중. 추가 코드 변경 불필요.

---

## 4. triggerNext 체인 연결

### 4.1 saliency → video-scene-analysis

병렬 3개(embed, creative-saliency, video-saliency) 중 **마지막 완료** 시 scene-analysis 트리거.

**설계 방식**: 가장 단순한 접근 — video-saliency가 항상 마지막(가장 느림)이므로 여기에 triggerNext 추가.

```typescript
// src/app/api/cron/video-saliency/route.ts — 마지막에 추가

const isChain = searchParams.get("chain") === "true";
if (isChain && processedCount > 0) {
  await triggerNext("video-scene-analysis");
  console.log("[video-saliency] chain → video-scene-analysis triggered");
}
```

### 4.2 video-scene-analysis → run-prescription

```typescript
// src/app/api/cron/video-scene-analysis/route.ts — 기존 "triggerNext 없음" 주석 위치

// 기존: 파이프라인 마지막 단계 — triggerNext() 없음
// 변경: run-prescription 체인 연결
const isChain = searchParams.get("chain") === "true";
if (isChain && stats.analyzed > 0) {
  await triggerNext("run-prescription", { batch: "true" });
  console.log("[video-scene-analysis] chain → run-prescription triggered");
}
```

### 4.3 triggerNext 개선: 결과 콜백

현재 triggerNext는 완전 fire-and-forget (2초 abort). 결과를 알 수 없음.

**개선**: 트리거 결과를 cron_runs에 기록.

```typescript
// src/lib/pipeline-chain.ts — triggerNext 개선

export async function triggerNext(
  endpoints: string | string[],
  params?: Record<string, string>,
): Promise<TriggerResult[]> {
  const targets = Array.isArray(endpoints) ? endpoints : [endpoints];
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.log("[pipeline-chain] CRON_SECRET not set, skipping trigger");
    return targets.map(t => ({ endpoint: t, status: 'skipped' as const }));
  }

  const results: TriggerResult[] = [];

  for (const endpoint of targets) {
    try {
      const url = new URL(`/api/cron/${endpoint}`, CLOUD_RUN_URL);
      url.searchParams.set("chain", "true");
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          url.searchParams.set(k, v);
        }
      }

      // 기존: 2초 abort. 개선: 5초로 확장 + 상태코드 확인
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url.toString(), {
        method: "GET",
        headers: { Authorization: `Bearer ${secret}` },
        signal: controller.signal,
      });
      clearTimeout(timer);

      const triggered = response.status === 200 || response.status === 202;
      results.push({ 
        endpoint, 
        status: triggered ? 'triggered' : 'failed',
        httpStatus: response.status,
      });

      console.log(`[pipeline-chain] ${endpoint}: ${response.status}`);
    } catch (e) {
      // AbortError (타임아웃)도 "triggered"로 간주 — fire-and-forget 특성
      const isAbort = e instanceof DOMException && e.name === 'AbortError';
      results.push({ 
        endpoint, 
        status: isAbort ? 'triggered' : 'failed',
        error: isAbort ? undefined : String(e),
      });

      if (!isAbort) {
        console.warn(`[pipeline-chain] trigger failed: ${endpoint}`, e);
        // (신규) 실패 시 Slack 알림
        await notifyChainFailure(endpoint, String(e));
      }
    }
  }

  return results;
}

interface TriggerResult {
  endpoint: string;
  status: 'triggered' | 'failed' | 'skipped';
  httpStatus?: number;
  error?: string;
}
```

---

## 5. cron_runs 로깅 전수 적용

### 5.1 현황

| 상태 | 크론 수 | 비율 |
|------|---------|------|
| startCronRun 사용 | 9개 | 32% |
| 미사용 | 19개 | 68% |
| **합계** | **28개** | |

### 5.2 미사용 19개 크론 목록

| # | 크론 | 파일 |
|---|------|------|
| 1 | organic-benchmark | src/app/api/cron/organic-benchmark/route.ts |
| 2 | collect-daily-1 | src/app/api/cron/collect-daily-1/route.ts |
| 3 | collect-daily-2 | src/app/api/cron/collect-daily-2/route.ts |
| 4 | collect-daily-3 | src/app/api/cron/collect-daily-3/route.ts |
| 5 | collect-daily-4 | src/app/api/cron/collect-daily-4/route.ts |
| 6 | backfill-ai-answers | src/app/api/cron/backfill-ai-answers/route.ts |
| 7 | publish-scheduled | src/app/api/cron/publish-scheduled/route.ts |
| 8 | analyze-lp-saliency | src/app/api/cron/analyze-lp-saliency/route.ts |
| 9 | precompute | src/app/api/cron/precompute/route.ts |
| 10 | analyze-competitors | src/app/api/cron/analyze-competitors/route.ts |
| 11 | competitor-check | src/app/api/cron/competitor-check/route.ts |
| 12 | video-saliency | src/app/api/cron/video-saliency/route.ts |
| 13 | embed-creatives | src/app/api/cron/embed-creatives/route.ts |
| 14 | crawl-lps | src/app/api/cron/crawl-lps/route.ts |
| 15 | creative-saliency | src/app/api/cron/creative-saliency/route.ts |
| 16 | track-performance | src/app/api/cron/track-performance/route.ts |
| 17 | cleanup-deleted | src/app/api/cron/cleanup-deleted/route.ts |
| 18 | video-scene-analysis | src/app/api/cron/video-scene-analysis/route.ts |
| 19 | run-prescription | src/app/api/cron/run-prescription/route.ts |

### 5.3 적용 패턴

기존 패턴(discover-accounts 참고):

```typescript
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) { return ...; }

  const runId = await startCronRun("크론이름");

  try {
    // ... 기존 로직 ...
    await completeCronRun(runId, "success", processedCount);
  } catch (e) {
    await completeCronRun(runId, "error", 0, String(e));
    // ... 에러 응답 ...
  }
}
```

### 5.4 일괄 적용 방법

각 크론 핸들러의 GET 함수 시작/끝에 startCronRun/completeCronRun 추가.
19개 파일 × 3줄(import + start + complete) = 변경 최소.

---

## 6. cron_runs.details 컬럼 마이그레이션

### 6.1 문제

`completeCronRun`의 `details` 파라미터가 존재하지만, cron_runs 테이블에 `details` 컬럼이 없으면 무시됨.

### 6.2 마이그레이션 SQL

```sql
-- Cloud SQL (PostgreSQL) 마이그레이션
ALTER TABLE cron_runs
  ADD COLUMN IF NOT EXISTS details jsonb;

COMMENT ON COLUMN cron_runs.details IS '크론 실행 상세 정보 (처리 건수, 계정별 결과 등)';
```

### 6.3 details 활용 예시

```typescript
// collect-daily
await completeCronRun(runId, "success", result.results.length, undefined, {
  accounts: result.accountCount,
  creatives: result.results.length,
  skipped: result.skipped,
  chain_triggered: "process-media",
});

// run-prescription (배치 모드)
await completeCronRun(runId, ok > 0 ? "success" : "error", ok, undefined, {
  batch: true,
  success: ok,
  failed: fail,
  targets: targets?.length ?? 0,
});
```

---

## 7. 실패 알림 설계

### 7.1 Slack 알림 함수

```typescript
// src/lib/cron-alert.ts (신규)

const SLACK_WEBHOOK_URL = process.env.SLACK_CRON_ALERT_WEBHOOK;

export async function notifyChainFailure(
  endpoint: string,
  error: string,
): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `🚨 크론 체인 실패`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*크론 체인 실패*\n• 엔드포인트: \`${endpoint}\`\n• 에러: ${error}\n• 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
          },
        },
      ],
    }),
  }).catch((e) => console.error("[cron-alert] Slack 전송 실패:", e));
}

export async function notifyCronError(
  cronName: string,
  error: string,
  recordsCount: number,
): Promise<void> {
  if (!SLACK_WEBHOOK_URL) return;

  await fetch(SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `⚠️ 크론 실행 에러: ${cronName}`,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*크론 에러*\n• 이름: \`${cronName}\`\n• 처리: ${recordsCount}건\n• 에러: ${error}\n• 시각: ${new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
          },
        },
      ],
    }),
  }).catch((e) => console.error("[cron-alert] Slack 전송 실패:", e));
}
```

### 7.2 completeCronRun 확장

```typescript
// src/lib/cron-logger.ts — completeCronRun에 Slack 알림 추가

import { notifyCronError } from "@/lib/cron-alert";

export async function completeCronRun(
  id: string | null,
  status: "success" | "error" | "partial",
  recordsCount: number,
  errorMessage?: string,
  details?: unknown
): Promise<void> {
  if (!id) return;
  try {
    const db = createServiceClient();
    await db.from("cron_runs").update({
      status,
      records_count: recordsCount,
      finished_at: new Date().toISOString(),
      error_message: errorMessage || null,
      ...(details !== undefined && { details }),
    }).eq("id", id);

    // (신규) 에러/부분 실패 시 Slack 알림
    if (status === "error" || status === "partial") {
      // cron_name 조회
      const { data } = await db.from("cron_runs").select("cron_name").eq("id", id).single();
      if (data) {
        await notifyCronError(data.cron_name, errorMessage ?? "알 수 없는 에러", recordsCount);
      }
    }
  } catch (e) { console.error("[cron-logger] complete exception:", e); }
}
```

### 7.3 알림 정책

| 상태 | 알림 | 채널 |
|------|------|------|
| `error` | 즉시 | Slack #cron-alerts |
| `partial` | 즉시 | Slack #cron-alerts |
| `success` | 없음 | - |
| chain trigger 실패 | 즉시 | Slack #cron-alerts |

---

## 8. 건강 점검 대시보드 확장

### 8.1 현재 health 엔드포인트

`/api/cron/health` — 현재 3개 크론만 모니터링.

### 8.2 확장: 28개 전수 모니터링

```typescript
// src/app/api/cron/health/route.ts — 확장

const ALL_CRONS = [
  { name: "collect-daily", expectedInterval: "1d" },
  { name: "process-media", expectedInterval: "1d" },
  { name: "embed-creatives", expectedInterval: "1d" },
  { name: "creative-saliency", expectedInterval: "1d" },
  { name: "video-saliency", expectedInterval: "1d" },
  { name: "video-scene-analysis", expectedInterval: "1d" },
  { name: "run-prescription", expectedInterval: "1d" },
  { name: "discover-accounts", expectedInterval: "7d" },
  // ... 나머지 20개 ...
];

// 각 크론의 최근 실행 상태 조회
for (const cron of ALL_CRONS) {
  const { data } = await svc
    .from("cron_runs")
    .select("status, finished_at, records_count, error_message")
    .eq("cron_name", cron.name)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  results.push({
    name: cron.name,
    lastRun: data?.finished_at ?? null,
    lastStatus: data?.status ?? "never",
    recordsCount: data?.records_count ?? 0,
    healthy: isHealthy(data, cron.expectedInterval),
  });
}
```

---

## 9. 구현 순서

| 순서 | 작업 | 파일 | 공수 |
|------|------|------|------|
| 1 | run-prescription 배치 모드 + startCronRun 추가 | run-prescription/route.ts | 0.5일 |
| 2 | Scheduler 등록 2건 (gcloud 명령) | 인프라 | 0.5일 |
| 3 | video-saliency → scene-analysis triggerNext | video-saliency/route.ts | 0.5시간 |
| 4 | video-scene-analysis → run-prescription triggerNext | video-scene-analysis/route.ts | 0.5시간 |
| 5 | pipeline-chain.ts 개선 (콜백 + 알림) | pipeline-chain.ts | 0.5일 |
| 6 | cron-alert.ts 생성 (Slack 알림) | cron-alert.ts | 0.5일 |
| 7 | completeCronRun에 Slack 알림 연동 | cron-logger.ts | 0.5시간 |
| 8 | cron_runs.details 컬럼 마이그레이션 | Cloud SQL | 0.5시간 |
| 9 | 19개 크론에 startCronRun/completeCronRun 추가 | 19개 파일 | 1일 |
| 10 | health 엔드포인트 28개 전수 확장 | health/route.ts | 0.5일 |

**총 공수: ~4일**

---

## 10. TDD 케이스

### Scheduler 등록 + 배치 모드

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| CP-01 | run-prescription batch=true → 처방 미생성 소재 자동 조회 | §3.2 | targets.length > 0 |
| CP-02 | run-prescription batch=true → 성공 건수 반환 | §3.2 | ok >= 0, fail >= 0 |
| CP-03 | run-prescription batch=true → cron_runs 기록 | §3.2 | cron_name="run-prescription" |
| CP-04 | run-prescription 기존 ids 모드 → 동작 유지 | §3.2 | 기존 로직 불변 |
| CP-05 | run-prescription batch + ids 둘 다 없음 → batch 모드 | §3.2 | 배치 실행 |
| CP-06 | discover-accounts → cron_runs 기록 존재 | §3.3 | 이미 구현 확인 |

### triggerNext 체인 연결

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| CP-07 | video-saliency chain=true → triggerNext("video-scene-analysis") | §4.1 | console.log 확인 |
| CP-08 | video-saliency chain=false → triggerNext 미호출 | §4.1 | 미호출 |
| CP-09 | video-saliency 처리 0건 → triggerNext 미호출 | §4.1 | 미호출 |
| CP-10 | video-scene-analysis chain=true → triggerNext("run-prescription", {batch: "true"}) | §4.2 | 파라미터 확인 |
| CP-11 | video-scene-analysis chain=false → triggerNext 미호출 | §4.2 | 미호출 |
| CP-12 | video-scene-analysis 분석 0건 → triggerNext 미호출 | §4.2 | 미호출 |

### triggerNext 개선

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| CP-13 | triggerNext 성공 → TriggerResult status='triggered' | §4.3 | httpStatus=200 |
| CP-14 | triggerNext 타임아웃(abort) → status='triggered' | §4.3 | fire-and-forget 특성 |
| CP-15 | triggerNext 네트워크 에러 → status='failed' + Slack 알림 | §4.3 | notifyChainFailure 호출 |
| CP-16 | triggerNext CRON_SECRET 없음 → status='skipped' | §4.3 | 전부 skipped |
| CP-17 | triggerNext 배열 → 각 엔드포인트 개별 트리거 | §4.3 | results.length = targets.length |

### cron_runs 로깅

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| CP-18 | startCronRun → cron_runs INSERT + id 반환 | §5.3 | id !== null |
| CP-19 | completeCronRun("success") → status 업데이트 | §5.3 | status="success" |
| CP-20 | completeCronRun("error") → Slack 알림 발송 | §7.2 | notifyCronError 호출 |
| CP-21 | completeCronRun("partial") → Slack 알림 발송 | §7.2 | notifyCronError 호출 |
| CP-22 | completeCronRun + details → details 컬럼 저장 | §6.3 | jsonb 파싱 성공 |
| CP-23 | embed-creatives에 startCronRun/completeCronRun 적용 | §5.4 | cron_runs 레코드 존재 |
| CP-24 | creative-saliency에 startCronRun/completeCronRun 적용 | §5.4 | cron_runs 레코드 존재 |
| CP-25 | video-saliency에 startCronRun/completeCronRun 적용 | §5.4 | cron_runs 레코드 존재 |
| CP-26 | video-scene-analysis에 startCronRun/completeCronRun 적용 | §5.4 | cron_runs 레코드 존재 |
| CP-27 | run-prescription에 startCronRun/completeCronRun 적용 | §5.4 | cron_runs 레코드 존재 |

### DB 마이그레이션

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| CP-28 | cron_runs.details 컬럼 존재 | §6.2 | ALTER TABLE 성공 |
| CP-29 | details에 JSON 저장 → 조회 가능 | §6.3 | jsonb 파싱 |

### Slack 알림

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| CP-30 | notifyChainFailure → Slack webhook 호출 | §7.1 | POST 요청 확인 |
| CP-31 | notifyCronError → Slack webhook 호출 | §7.1 | blocks[].text 포함 |
| CP-32 | SLACK_CRON_ALERT_WEBHOOK 없음 → 조용히 스킵 | §7.1 | 에러 없이 반환 |

### 건강 점검

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| CP-33 | /api/cron/health → 28개 크론 전체 상태 | §8.2 | results.length >= 28 |
| CP-34 | 24시간 내 미실행 크론 → healthy=false | §8.2 | isHealthy 로직 |
| CP-35 | 주간 크론(discover) 7일 내 실행 → healthy=true | §8.2 | expectedInterval="7d" 적용 |

### 매핑 테이블 요약

| Design 섹션 | TDD 범위 | 케이스 수 |
|------------|---------|----------|
| §3 Scheduler + 배치 | CP-01~06 | 6 |
| §4 triggerNext 체인 | CP-07~17 | 11 |
| §5 cron_runs 로깅 | CP-18~27 | 10 |
| §6 DB 마이그레이션 | CP-28~29 | 2 |
| §7 Slack 알림 | CP-30~32 | 3 |
| §8 건강 점검 | CP-33~35 | 3 |
| **합계** | | **35** |

**Gap 0%**: 모든 설계 섹션에 대응 TDD 존재.

---

## 11. 파일 구조 (변경 대상)

```
src/
├── app/api/cron/
│   ├── run-prescription/route.ts    # (수정) 배치 모드 + cron_runs
│   ├── video-saliency/route.ts      # (수정) triggerNext 추가
│   ├── video-scene-analysis/route.ts # (수정) triggerNext 추가
│   ├── health/route.ts              # (수정) 28개 전수 확장
│   ├── embed-creatives/route.ts     # (수정) cron_runs 추가
│   ├── creative-saliency/route.ts   # (수정) cron_runs 추가
│   └── ... (나머지 13개 cron_runs 추가)
├── lib/
│   ├── pipeline-chain.ts            # (수정) 콜백 + TriggerResult
│   ├── cron-logger.ts               # (수정) Slack 알림 연동
│   └── cron-alert.ts                # (신규) Slack 알림 함수
```

---

## 12. 관련 문서

| 문서 | 경로 |
|------|------|
| 통합 점검 보고서 | docs/04-report/features/system-review-integrated-2026-04-03.report.md |
| 크론 건강 점검 | docs/reports/ops/cron-health-check.md |
| 처방 V3 Design | docs/02-design/features/prescription-pipeline-v3.design.md |
| 처방 As-Is 보고서 | docs/04-report/features/prescription-pipeline-as-is.report.md |
| 파이프라인 체인 코드 | src/lib/pipeline-chain.ts |
| 크론 로거 | src/lib/cron-logger.ts |
