# Agent Ops Phase 2 설계서 — 슬랙 통합 + 에이전트 대시보드

> **작성일**: 2026-03-25
> **작성자**: PM팀 설계 담당
> **Plan 참조**: `docs/01-plan/features/agent-ops-platform.plan.md` (Phase 2: P2-1~P2-6)
> **기존 설계서 참조**:
>   - `docs/02-design/features/slack-notification.design.md` — 8개 이벤트, Block Kit, Rate Limit
>   - `docs/02-design/features/agent-dashboard.design.md` — 데이터 모델, API, 컴포넌트
>   - `docs/02-design/features/orchestration-chain.design.md` — state.json, comm.jsonl, 체인 규약
> **기존 구현 참조**:
>   - `src/lib/slack-notifier.ts` — 현재 슬랙 전송 모듈 (Block Kit, sendWithRetry, resolveChannels)
>   - `src/types/agent-dashboard.ts` — 타입 정의 (TeamId, SlackEventType 등)
>   - `src/lib/chain-detector.ts` — 체인 규칙 4개 + detectChainHandoff()
>   - `.claude/hooks/agent-slack-notify.sh` — TaskCompleted hook

---

## Phase 2 작업 매핑

| Plan ID | 작업명 | 본 설계서 섹션 |
|---------|--------|---------------|
| P2-1 | 통합 채널 구조 전환 (`SLACK_UNIFIED_CHANNEL`) | 1.1, 2.1 |
| P2-2 | Rate Limit 큐잉 + 재시도 로직 | 1.2, 3.2 |
| P2-3 | 에이전트 대시보드 API | 2.2~2.5 |
| P2-4 | 에이전트 대시보드 UI | 3.1 |
| P2-5 | 슬랙 알림 API (POST /slack/notify) | 2.6 |
| P2-6 | agent-slack-notify.sh Hook 개선 | 3.3 |

---

## 1. 데이터 모델

> 기존 `src/types/agent-dashboard.ts`에 정의된 타입을 기반으로 한다. **중복 정의 금지** — 아래는 신규 추가/변경 사항만 기술한다.

### 1.1 SlackEventType 확장 (신규 3개)

Phase 1(P1-6)에서 추가된 3개 이벤트를 포함하여, Phase 2에서는 총 11개 이벤트를 지원해야 한다.

**기존 8개** (변경 없음):
`task.started`, `task.completed`, `chain.handoff`, `deploy.completed`, `error.critical`, `approval.needed`, `pdca.phase_change`, `background.completed`

**신규 3개** (P1-6에서 추가, Phase 2에서 통합):

```typescript
// src/types/agent-dashboard.ts — SlackEventType 확장

export type SlackEventType =
  | 'task.started'
  | 'task.completed'
  | 'chain.handoff'
  | 'deploy.completed'
  | 'error.critical'
  | 'approval.needed'
  | 'pdca.phase_change'
  | 'background.completed'
  // Phase 1 신규 (P1-6)
  | 'team.idle'              // 팀 5분 무갱신 → idle 경고
  | 'team.recovered'         // idle 상태에서 활동 재개
  | 'session.crashed';       // 세션 크래시 감지
```

**신규 이벤트 상세**:

| 이벤트 | 트리거 | 수신처 | CEO DM | 우선순위 |
|--------|--------|--------|:------:|----------|
| `team.idle` | idle-detector가 state.json `updatedAt` 5분 무갱신 감지 | 해당 팀 채널 | O | `important` |
| `team.recovered` | idle 상태 팀의 state.json 갱신 감지 | 해당 팀 채널 | X | `normal` |
| `session.crashed` | idle-detector가 tmux 세션 alive 확인 실패 (10분 무응답) | 해당 팀 채널 | O | `urgent` |

### 1.2 Rate Limit 큐 데이터 구조 (queue.jsonl 스키마)

> GCS 위치: `gs://bscamp-storage/agent-ops/slack/queue.jsonl` (append-only)
> 기존 `slack-notifier.ts`의 `enqueueNotification()` 함수가 `@google-cloud/storage`를 통해 이 파일에 적재한다.

**현재 큐 항목 스키마** (기존 구현):

```typescript
interface SlackQueueEntry {
  id: string;               // crypto.randomUUID()
  channelId: string;        // 전송 대상 채널 ID
  blocks: unknown[];        // Block Kit blocks
  text: string;             // fallback text
  queuedAt: string;         // ISO 8601
  status: 'queued' | 'sent' | 'failed';
  retryCount: number;       // 0부터 시작
}
```

**Phase 2 확장 필드**:

```typescript
interface SlackQueueEntryV2 extends SlackQueueEntry {
  event: SlackEventType;    // 이벤트 타입 (병합 판단용)
  team: TeamId;             // 발신 팀 (병합 판단용)
  priority: SlackPriority;  // 우선순위 (urgent 먼저 소비)
  mergeKey?: string;        // 병합 키: `${channelId}:${event}` (같은 키 = 병합 대상)
  lastRetryAt?: string;     // 마지막 재시도 시각 (ISO 8601)
  failReason?: string;      // 실패 사유
}
```

> `SlackQueueEntryV2`는 `src/types/agent-dashboard.ts`에 추가한다. 기존 `SlackQueueEntry`와의 하위 호환을 위해 새 필드는 모두 선택(optional)이다.

### 1.3 통합 채널 구조 (SLACK_UNIFIED_CHANNEL)

**목적**: 초기 운영에서 3개 팀별 채널 대신 하나의 통합 채널로 모든 알림을 수신하는 옵션을 제공한다.

**환경변수**:

| 환경변수 | 값 형식 | 필수 | 설명 |
|----------|--------|:----:|------|
| `SLACK_UNIFIED_CHANNEL` | `C07XXXXXX` | X | 통합 채널 ID. 설정 시 팀별 채널 대신 여기로 전송 |

**라우팅 우선순위**:

```
1. SLACK_UNIFIED_CHANNEL이 설정되어 있으면 → 통합 채널로 전송
2. 통합 채널 미설정 → 기존 팀별 채널 라우팅 (resolveChannels 로직 유지)
3. CEO DM은 통합 채널과 무관하게 기존 로직 유지 (중요/긴급 이벤트만)
```

> 현재 `src/lib/slack-notifier.ts`의 `resolveChannels()` 함수에 이미 `UNIFIED_CHANNEL` 분기가 구현되어 있다. Phase 2에서는 이 로직을 검증하고, 통합 채널 모드에서도 `chain.handoff`의 발신/수신 팀 구분이 메시지 내에서 명확히 표시되는지 확인한다.

### 1.4 PRIORITY_MAP 확장 (11개 이벤트)

```typescript
// src/lib/slack-notifier.ts — PRIORITY_MAP 확장

const PRIORITY_MAP: Record<SlackEventType, SlackPriority> = {
  'task.started': 'normal',
  'task.completed': 'normal',
  'chain.handoff': 'important',
  'deploy.completed': 'important',
  'error.critical': 'urgent',
  'approval.needed': 'important',
  'pdca.phase_change': 'normal',
  'background.completed': 'normal',
  // Phase 1 신규
  'team.idle': 'important',
  'team.recovered': 'normal',
  'session.crashed': 'urgent',
};
```

### 1.5 CEO_NOTIFY_EVENTS 확장

```typescript
const CEO_NOTIFY_EVENTS: SlackEventType[] = [
  'chain.handoff',
  'deploy.completed',
  'error.critical',
  'approval.needed',
  // Phase 1 신규
  'team.idle',
  'session.crashed',
];
```

> `team.recovered`는 CEO DM 불필요 (복구 확인은 채널에서 충분).

### 1.6 이벤트별 라우팅 매트릭스 (11개 전체)

| 이벤트 | #agent-pm | #agent-cto | #agent-marketing | CEO DM | 통합 채널 |
|--------|:---------:|:----------:|:----------------:|:------:|:---------:|
| `task.started` | 발신팀만 | 발신팀만 | 발신팀만 | - | O |
| `task.completed` | 발신팀만 | 발신팀만 | 발신팀만 | - | O |
| `chain.handoff` | 관련 시 | 관련 시 | 관련 시 | O | O |
| `deploy.completed` | - | O | - | O | O |
| `error.critical` | 발신팀만 | 발신팀만 | 발신팀만 | O | O |
| `approval.needed` | 발신팀만 | 발신팀만 | 발신팀만 | O | O |
| `pdca.phase_change` | 발신팀만 | 발신팀만 | 발신팀만 | - | O |
| `background.completed` | 발신팀만 | 발신팀만 | 발신팀만 | - | O |
| `team.idle` | 발신팀만 | 발신팀만 | 발신팀만 | O | O |
| `team.recovered` | 발신팀만 | 발신팀만 | 발신팀만 | - | O |
| `session.crashed` | 발신팀만 | 발신팀만 | 발신팀만 | O | O |

> **"통합 채널" 열**: `SLACK_UNIFIED_CHANNEL` 설정 시, 팀별 채널 대신 통합 채널 1개로 전송. CEO DM은 별도 유지.

---

## 2. API 설계

> 기존 `agent-dashboard.design.md` 섹션 2의 API를 그대로 구현한다. 아래는 Phase 2에서 구현할 API 목록과 상세 스펙이다.

### 2.1 GET /api/agent-dashboard — 3팀 상태 조회

**파일 위치**: `src/app/api/agent-dashboard/route.ts`

**요청**: 파라미터 없음

**응답 타입**: `DashboardState` (기존 `src/types/agent-dashboard.ts`에 정의됨)

**동작 순서**:

```
1. 인증: requireAdmin() 호출 → admin 역할 확인
2. 3팀 state.json 읽기 (GCS):
   - gs://bscamp-storage/agent-ops/pm/state.json
   - gs://bscamp-storage/agent-ops/marketing/state.json
   - gs://bscamp-storage/agent-ops/cto/state.json
   → 파일 없으면 기본값 반환 (status: "planned", tasks: [])
3. comm.jsonl 읽기 (GCS):
   - gs://bscamp-storage/agent-ops/{team}/comm.jsonl
   → 최근 50건 (tail)
4. background/tasks.json 읽기 (GCS):
   - gs://bscamp-storage/agent-ops/background/tasks.json
   → 없으면 빈 배열
5. PDCA 상태 읽기:
   - /Users/smith/projects/bscamp/.bkit/state/pdca-status.json (CTO팀)
   - 타 프로젝트의 .bkit/state/pdca-status.json (PM팀, 마케팅팀)
   → 파일 없으면 빈 features
6. 슬랙 알림 로그:
   - gs://bscamp-storage/agent-ops/slack/queue.jsonl (GCS)
   → 최근 20건 (대시보드 표시용)
7. 집계 통계 계산: total, completed, inProgress, avgMatchRate
8. connection 상태 판단:
   - 3팀 중 가장 최근 updatedAt 기준
   - < 10초: live, 10~30초: stale, > 30초: disconnected
9. DashboardState 조립 후 JSON 응답
```

**응답 예시** (기존 `agent-dashboard.design.md` 2.1절 참조):

```json
{
  "updatedAt": "2026-03-25T14:30:00+09:00",
  "connection": { "status": "live", "lastPing": "2026-03-25T14:30:00+09:00" },
  "org": {
    "ceo": { "name": "Smith", "title": "CEO" },
    "coo": { "name": "모찌", "title": "COO" },
    "teams": [
      { "id": "pm", "name": "PM팀", "emoji": "📋", "lead": "pm-lead", "memberCount": 3 },
      { "id": "marketing", "name": "마케팅팀", "emoji": "📊", "lead": "marketing-strategist", "memberCount": 4 },
      { "id": "cto", "name": "CTO팀", "emoji": "⚙️", "lead": "cto-lead", "memberCount": 4 }
    ]
  },
  "teams": { "pm": { "...TeamState" }, "marketing": { "..." }, "cto": { "..." } },
  "logs": [],
  "background": [],
  "pdca": {
    "features": [],
    "summary": { "total": 0, "completed": 0, "inProgress": 0, "avgMatchRate": 0 }
  }
}
```

**에러 응답**:

| 상황 | HTTP | 에러 코드 | 메시지 |
|------|:----:|-----------|--------|
| 인증 실패 | 401 | `UNAUTHORIZED` | "admin 권한이 필요합니다" |
| state.json 파싱 실패 | 200 | (부분 응답) | 해당 팀 기본값 반환 + `_warnings` 필드에 에러 기록 |
| GCS 접근 불가 | 500 | `STATE_READ_ERROR` | "GCS에서 상태 파일을 읽을 수 없습니다" |

### 2.2 GET /api/agent-dashboard/log — 소통 로그 조회

**파일 위치**: `src/app/api/agent-dashboard/log/route.ts`

**요청 (쿼리 파라미터)**:

| 파라미터 | 타입 | 기본값 | 설명 |
|----------|------|--------|------|
| `limit` | number | 50 | 반환할 로그 수 (최대 200) |
| `team` | TeamId | (전체) | 특정 팀 로그만 필터링 |
| `since` | string | (없음) | ISO 8601 — 이 시각 이후 로그만 |

**응답**:

```typescript
{
  ok: true;
  logs: CommLog[];       // 최신순 정렬
  total: number;         // 전체 로그 수
  hasMore: boolean;      // 더 있는지 여부
}
```

**동작**:

```
1. 인증: requireAdmin()
2. gs://bscamp-storage/agent-ops/{team}/comm.jsonl 읽기 (GCS)
3. JSON 파싱 (한 줄씩, 파싱 실패 줄은 건너뛰기)
4. team 필터 적용 (있으면)
5. since 필터 적용 (있으면)
6. 최신순 정렬 (time 기준 DESC)
7. limit 적용 후 반환
```

**에러 응답**:

| 상황 | HTTP | 에러 코드 |
|------|:----:|-----------|
| 인증 실패 | 401 | `UNAUTHORIZED` |
| comm.jsonl 없음 | 200 | 빈 배열 반환 (에러 아님) |
| 잘못된 limit | 400 | `INVALID_LIMIT` |

### 2.3 PUT /api/agent-dashboard/team/[teamId] — 팀 상태 갱신

**파일 위치**: `src/app/api/agent-dashboard/team/[teamId]/route.ts`

**요청**: `TeamState` 객체 (JSON body)

**응답**:

```json
{ "ok": true, "updatedAt": "2026-03-25T14:30:00+09:00" }
```

**동작**:

```
1. 인증: requireAdmin()
2. teamId 검증: 'pm' | 'marketing' | 'cto'
3. TeamState 스키마 검증 (필수 필드: name, emoji, status, color, members, tasks)
4. gs://bscamp-storage/agent-ops/{teamId}/state.json 덮어쓰기 (GCS upload with precondition)
5. 이전 상태와 비교 → TASK 완료 감지 시:
   a. task.completed 이벤트 → 슬랙 알림 전송
   b. 전체 TASK 완료 시 → chain.handoff 이벤트 발생 (chain-detector.ts 호출)
6. updatedAt 자동 갱신
```

**GCS Atomic Write 구현**:

```typescript
// @google-cloud/storage를 사용하여 GCS에 업로드 (경쟁 조건 방지: generationMatchPrecondition)
import { getAgentOpsFile } from '@/lib/gcs-agent-ops';

const bucket = storage.bucket(process.env.GCS_BUCKET!);
const file = bucket.file(`${process.env.GCS_AGENT_OPS_PREFIX}${teamId}/state.json`);
await file.save(JSON.stringify(state, null, 2), {
  contentType: 'application/json',
  preconditionOpts: { ifGenerationMatch: currentGeneration },
});
```

**에러 응답**:

| 상황 | HTTP | 에러 코드 |
|------|:----:|-----------|
| 인증 실패 | 401 | `UNAUTHORIZED` |
| teamId 잘못됨 | 400 | `INVALID_TEAM` |
| 스키마 검증 실패 | 400 | `INVALID_STATE` |
| GCS 업로드 실패 | 500 | `STATE_WRITE_ERROR` |

### 2.4 PUT /api/agent-dashboard/background/[taskId] — 백그라운드 작업 갱신

**파일 위치**: `src/app/api/agent-dashboard/background/[taskId]/route.ts`

**요청**:

```json
{
  "current": 2900,
  "total": 3096,
  "status": "running"
}
```

**응답**:

```json
{ "ok": true, "taskId": "backfill", "progress": 93.7 }
```

**동작**:

```
1. 인증: requireAdmin()
2. gs://bscamp-storage/agent-ops/background/tasks.json 읽기 (GCS)
3. taskId에 해당하는 항목 찾기 (없으면 새 항목 추가)
4. current, total, status 갱신
5. status가 'completed'로 변경 시 → background.completed 슬랙 알림 전송
6. tasks.json 덮어쓰기
```

**에러 응답**:

| 상황 | HTTP | 에러 코드 |
|------|:----:|-----------|
| 인증 실패 | 401 | `UNAUTHORIZED` |
| 잘못된 status 값 | 400 | `INVALID_STATUS` |

### 2.5 POST /api/agent-dashboard/log — 소통 로그 전송

**파일 위치**: `src/app/api/agent-dashboard/log/route.ts` (GET과 같은 파일, POST 핸들러)

**요청**:

```json
{
  "from": "pm-lead",
  "team": "pm",
  "to": "cto-lead",
  "msg": "agent-dashboard Plan 문서 완료, Design 진행 중"
}
```

**응답**:

```json
{ "ok": true, "time": "2026-03-25T14:30:00+09:00" }
```

**동작**:

```
1. 인증: requireAdmin()
2. 필수 필드 검증: from, team, msg
3. time 자동 추가 (현재 시각, ISO 8601 KST)
4. gs://bscamp-storage/agent-ops/{team}/comm.jsonl에 append (GCS download → append → upload)
5. 1000줄 초과 시 자동 rotate (orchestration-chain.design.md 4.4절 참조)
```

### 2.6 POST /api/agent-dashboard/slack/notify — 슬랙 알림 전송

**파일 위치**: `src/app/api/agent-dashboard/slack/notify/route.ts`

> 이 API의 상세 스펙은 `slack-notification.design.md` 섹션 4.1에 완전히 정의되어 있다. 아래는 Phase 2 구현 시 추가 고려사항만 기술한다.

**요청 스키마**: `SlackNotifyRequest` (기존 `slack-notification.design.md` 4.1절 참조)

```typescript
interface SlackNotifyRequest {
  event: SlackEventType;       // 11개 이벤트 중 하나 (Phase 2에서 3개 신규 포함)
  team: TeamId;
  targetTeam?: TeamId;         // chain.handoff 시 필수
  title: string;               // 최대 200자
  message: string;             // 최대 3000자
  metadata?: {
    feature?: string;
    taskId?: string;
    matchRate?: number;
    errorMessage?: string;
    dashboardUrl?: string;
    idleDuration?: number;     // 신규: team.idle 시 무갱신 경과 시간(분)
    sessionId?: string;        // 신규: session.crashed 시 크래시된 세션 ID
  };
}
```

**Phase 2 추가 검증 규칙**:

| 필드 | 검증 | 에러 코드 |
|------|------|-----------|
| `event` | 11개 SlackEventType 중 하나 (3개 신규 포함) | `INVALID_EVENT_TYPE` |
| `targetTeam` | `chain.handoff`일 때 필수, `team`과 동일하면 거부 | `MISSING_TARGET_TEAM` |

**Phase 2 내부 동작 변경사항**:

```
기존 동작 (slack-notification.design.md 4.1절)에 추가:
1. SlackNotification 생성 시 PRIORITY_MAP에 11개 이벤트 반영
2. CEO_NOTIFY_EVENTS에 team.idle, session.crashed 포함 여부 확인
3. 신규 3개 이벤트에 대한 Block Kit 메시지 빌드 (섹션 3.2.3 참조)
4. queue.jsonl 로깅 시 SlackQueueEntryV2 필드 포함
```

**응답 스키마**: 기존 `slack-notification.design.md` 4.1절과 동일

| HTTP | 상황 | 응답 |
|:----:|------|------|
| 200 | 전체 성공 | `{ ok: true, notificationId, channelsSent, ceoNotified, sentAt }` |
| 207 | 부분 성공 | `{ ok: true, ..., failedChannels: [...] }` |
| 400 | 요청 검증 실패 | `{ ok: false, error: "INVALID_EVENT_TYPE", message: "..." }` |
| 401 | 인증 실패 | `{ ok: false, error: "UNAUTHORIZED" }` |
| 500 | 전체 실패 | `{ ok: false, error: "SLACK_SEND_FAILED", failedChannels: [...] }` |
| 503 | 토큰 미설정 | `{ ok: false, error: "SLACK_TOKEN_MISSING" }` |

---

## 3. 컴포넌트 구조

### 3.1 대시보드 페이지 (page.tsx)

**디렉토리 구조**:

```
src/app/(main)/admin/agent-dashboard/
├── page.tsx                         ← 메인 페이지 (서버 컴포넌트)
├── components/
│   ├── DashboardHeader.tsx          ← LIVE 인디케이터 + 업데이트 시각
│   ├── OrgChart.tsx                 ← 조직도 (CEO → COO → 3팀)
│   ├── TeamCard.tsx                 ← 팀 카드 (상태 + 멤버 + TASK + idle 하이라이트)
│   ├── TeamMemberChip.tsx           ← 에이전트 멤버 칩 (모델별 색상)
│   ├── TaskList.tsx                 ← TASK 목록 (상태 아이콘)
│   ├── CommLogPanel.tsx             ← 팀 간 소통 로그
│   ├── BackgroundPanel.tsx          ← 백그라운드 작업 진행 바
│   ├── PdcaStatusPanel.tsx          ← PDCA 상태 요약 (auto-sync 표시 포함)
│   ├── ChainStatusPanel.tsx         ← 체인 전달 시각화 (신규)
│   ├── SlackAlertLog.tsx            ← 슬랙 알림 로그 (신규)
│   ├── CheckpointInfo.tsx           ← 세션 정보 표시 (신규)
│   └── useDashboardState.ts         ← 상태 관리 커스텀 훅
```

#### 3.1.1 DashboardHeader

> 기존 `agent-dashboard.design.md` 3.2절 참조. 변경 없음.

```
┌─────────────────────────────────────────────────────┐
│ 🍡 bscamp 에이전트 대시보드     ● LIVE  14:30:00    │
└─────────────────────────────────────────────────────┘
```

- Props: `connection: { status: 'live' | 'stale' | 'disconnected', lastPing: string }`
- LIVE 인디케이터 색상: 초록(`live`), 주황(`stale`, >10초), 빨강(`disconnected`, >30초)
- 디자인: 배경 흰색, 텍스트 `#333`, Pretendard 폰트

#### 3.1.2 OrgChart

> 기존 설계 동일. CEO → COO → 3팀 구조의 정적 조직도 렌더링.

#### 3.1.3 TeamCard (idle 하이라이트 추가)

```
┌─────────────────────────────────┐
│ ⚙️ CTO팀           ● 운영 중   │    ← idle 시: 테두리 주황 + "⚠ 5분 무응답"
│ ─────────────────────────────── │
│ 🔴 cto-lead (opus)             │    ← 모델별 칩 색상
│ 🔵 frontend-dev (sonnet)       │
│ 🔵 backend-dev (sonnet)        │
│ 🟢 qa-engineer (haiku)         │
│ ─────────────────────────────── │
│ ✓ T1 타입 정의            완료  │
│ → T2 API 구현             진행중│
│ ○ T3 UI 조립              대기  │
│ ─────────────────────────────── │
│ 📊 PDCA: implementing  MR: 0%  │    ← PDCA auto-sync 표시
│ 💾 컨텍스트: 45%               │    ← 세션 정보 (선택 필드)
└─────────────────────────────────┘
```

**Props**: `team: TeamState`

**모델별 칩 색상**:
- opus: `#F75D5D` (Primary 색상)
- sonnet: `#6366f1` (인디고)
- haiku: `#10b981` (에메랄드)

**idle 하이라이트 조건**:

```typescript
// idle 판단: updatedAt이 현재 시각 기준 5분 이상 경과
const isIdle = team.status === 'idle' ||
  (team.updatedAt && Date.now() - new Date(team.updatedAt).getTime() > 5 * 60 * 1000);

// idle 시 스타일
if (isIdle) {
  // 테두리: 주황색 2px solid (#f59e0b)
  // 배경: 연한 주황 (#fffbeb)
  // 상단에 "⚠ {N}분 무응답" 배지 표시
}
```

**TASK 상태 아이콘**: 기존 설계 동일
- `done`: ✓ (초록)
- `active`: → (파란, 애니메이션)
- `pending`: ○ (회색)
- `blocked`: ✕ (빨강)

#### 3.1.4 CommLogPanel

> 기존 설계 동일. 최신순 50건 표시. 팀별 색상 코딩.

- PM팀 메시지: 좌측 바 `#8b5cf6` (보라)
- CTO팀 메시지: 좌측 바 `#F75D5D` (Primary)
- 마케팅팀 메시지: 좌측 바 `#f59e0b` (주황)

#### 3.1.5 PdcaStatusPanel (auto-sync 표시 추가)

```
┌─────────────────────────────────────────────────────┐
│ 📊 PDCA 상태  (🔄 자동 동기화)                      │
│ ─────────────────────────────────────────────────────│
│ 전체: 85개  완료: 78개  진행: 7개  평균: 96.2%       │
│ ─────────────────────────────────────────────────────│
│ [진행 중 Features]                                   │
│ • agent-ops-phase2  implementing  —%   CTO팀         │
│ • backfill-unify    checking      92%  CTO팀         │
│ • creative-v3       designing     —%   마케팅팀       │
└─────────────────────────────────────────────────────┘
```

**Phase 2 추가사항**:
- "🔄 자동 동기화" 배지: Phase 1의 agent-state-sync.sh가 PDCA를 자동 갱신하고 있음을 표시
- 진행 중 feature만 기본 표시, 완료된 feature는 접힘 (토글 가능)

#### 3.1.6 ChainStatusPanel (신규)

체인 전달 상태를 시각적으로 표시하는 패널.

```
┌─────────────────────────────────────────────────────┐
│ 🔗 체인 전달 상태                                    │
│ ─────────────────────────────────────────────────────│
│                                                      │
│  📋 PM팀 ──✓──> ⚙️ CTO팀 ──→──> 📊 마케팅팀        │
│  (기획 완료)     (구현 중)        (대기)              │
│                                                      │
│  마지막 핸드오프: PM→CTO (03-25 14:30)               │
│  다음 예정: CTO→마케팅 (구현 완료 시)                 │
└─────────────────────────────────────────────────────┘
```

**데이터 소스**: `chain-detector.ts`의 `CHAIN_RULES` 4개 + 각 팀 `state.json`의 `status`

**시각화 로직**:

```typescript
// 각 팀의 상태에 따라 체인 화살표 색상 결정
const chainSteps = [
  { from: 'pm', to: 'cto', label: '기획→구현' },
  { from: 'cto', to: 'marketing', label: '구현→검증' },
  { from: 'marketing', to: 'pm', label: '검증→리뷰' },
];

// 완료된 단계: 초록 체크 (✓)
// 진행 중 단계: 파란 화살표 (→, 애니메이션)
// 대기 단계: 회색 점선
```

#### 3.1.7 SlackAlertLog (신규)

최근 슬랙 알림 발송 이력을 표시.

```
┌─────────────────────────────────────────────────────┐
│ 📨 슬랙 알림 로그                                    │
│ ─────────────────────────────────────────────────────│
│ 14:30  ✅ task.completed  CTO팀     전송 완료         │
│ 14:28  🔗 chain.handoff  PM→CTO    전송 완료 + CEO DM│
│ 14:20  🚨 error.critical CTO팀     전송 실패 (재시도) │
│ 14:15  📊 pdca.phase     CTO팀     전송 완료         │
└─────────────────────────────────────────────────────┘
```

**데이터 소스**: `gs://bscamp-storage/agent-ops/slack/queue.jsonl` 최근 20건 (GCS)

**표시 항목**:
- 시각 (HH:MM)
- 이벤트 이모지 + 타입
- 팀 (chain.handoff는 양쪽 표시)
- 전송 상태: 완료/실패/대기 중/큐잉

#### 3.1.8 CheckpointInfo (신규)

각 팀의 세션 정보를 간략히 표시.

```
┌─────────────────────────────────────────────────────┐
│ 💾 세션 정보                                         │
│ ─────────────────────────────────────────────────────│
│ PM팀:   세션 abc123  컨텍스트 45%  마지막 갱신 5분 전 │
│ CTO팀:  세션 def456  컨텍스트 72%  마지막 갱신 30초 전│
│ 마케팅: (오프라인)                                    │
└─────────────────────────────────────────────────────┘
```

**데이터 소스**: 각 팀 `state.json`의 `sessionId`, `contextUsage`, `updatedAt` 필드

**경고 표시**:
- 컨텍스트 70% 이상: 주황 배지 "⚠ compact 필요"
- 컨텍스트 90% 이상: 빨강 배지 "🚨 세션 교체 필요"

#### 3.1.9 useDashboardState (상태 관리 커스텀 훅)

```typescript
// src/app/(main)/admin/agent-dashboard/components/useDashboardState.ts

import { useState, useEffect, useRef, useCallback } from 'react';
import type { DashboardState } from '@/types/agent-dashboard';

interface UseDashboardStateReturn {
  data: DashboardState | null;
  isLoading: boolean;
  error: string | null;
  isLive: boolean;                // connection.status === 'live'
  refetch: () => Promise<void>;   // 수동 갱신
}

export function useDashboardState(
  pollInterval = 5000   // 기본 5초 폴링
): UseDashboardStateReturn {
  // 구현 핵심:
  // 1. useEffect에서 setInterval로 GET /api/agent-dashboard 호출
  // 2. 응답을 deep compare하여 변경 시에만 setState (불필요한 리렌더링 방지)
  // 3. connection.status 자동 판단:
  //    - lastPing < 10초: live
  //    - 10~30초: stale
  //    - > 30초: disconnected
  // 4. 에러 발생 시 3회 재시도 후 error 상태 설정
  // 5. 탭 비활성화(document.hidden) 시 폴링 중단 → 활성화 시 즉시 갱신
}
```

**deep compare 구현**:

```typescript
function isEqual(a: DashboardState, b: DashboardState): boolean {
  // JSON.stringify 비교 (간단하지만 충분)
  return JSON.stringify(a) === JSON.stringify(b);
}
```

#### 3.1.10 레이아웃 그리드

```
데스크탑 (1920px):
┌─────────────────────────────────────────────────────┐
│ DashboardHeader (전체 너비)                           │
├─────────────────────────────────────────────────────┤
│ OrgChart (전체 너비)                                  │
├────────────┬────────────┬───────────────────────────┤
│ TeamCard   │ TeamCard   │ TeamCard                   │
│ (PM팀)     │ (마케팅팀)  │ (CTO팀)                   │
├────────────┴────────────┴───────────────────────────┤
│ ChainStatusPanel (전체 너비)                          │
├─────────────────────────────────────────────────────┤
│ CommLogPanel (전체 너비)                              │
├──────────────────────┬──────────────────────────────┤
│ BackgroundPanel      │ PdcaStatusPanel               │
│ (1/2 너비)           │ (1/2 너비)                    │
├──────────────────────┼──────────────────────────────┤
│ SlackAlertLog        │ CheckpointInfo                │
│ (1/2 너비)           │ (1/2 너비)                    │
└──────────────────────┴──────────────────────────────┘

모바일 (375px):
모든 패널 세로 스택 (1열)
순서: Header → OrgChart → TeamCard x3 → ChainStatus → CommLog →
      Background → PDCA → SlackAlert → Checkpoint
```

**그리드 구현** (Tailwind CSS):

```tsx
<div className="max-w-[1400px] mx-auto px-4 py-6 space-y-6">
  <DashboardHeader connection={data.connection} />
  <OrgChart org={data.org} />

  {/* 팀 카드 3열 */}
  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
    {(['pm', 'marketing', 'cto'] as const).map(teamId => (
      <TeamCard key={teamId} team={data.teams[teamId]} />
    ))}
  </div>

  <ChainStatusPanel teams={data.teams} />
  <CommLogPanel logs={data.logs} />

  {/* 하단 2열 그리드 */}
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <BackgroundPanel tasks={data.background} />
    <PdcaStatusPanel pdca={data.pdca} />
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    <SlackAlertLog />
    <CheckpointInfo teams={data.teams} />
  </div>
</div>
```

**디자인 규칙**:
- 배경: 흰색 (`#ffffff`)
- 카드 배경: `#f9fafb` (Tailwind `bg-gray-50`)
- 카드 테두리: `#e5e7eb` (Tailwind `border-gray-200`)
- 텍스트: `#111827` (Tailwind `text-gray-900`)
- Primary 강조: `#F75D5D`, hover: `#E54949`
- 폰트: Pretendard
- 라이트 모드만 (다크 모드 토글 없음)

### 3.2 슬랙 알림 시스템

#### 3.2.1 slack-notifier.ts 변경사항 (P2-1: 통합 채널)

**현재 상태**: `resolveChannels()` 함수에 `UNIFIED_CHANNEL` 분기가 이미 구현되어 있음.

**Phase 2 변경 내용**:

```typescript
// src/lib/slack-notifier.ts 변경 항목

// 1. PRIORITY_MAP 확장 (11개 이벤트)
// → 섹션 1.4 참조

// 2. CEO_NOTIFY_EVENTS 확장
// → 섹션 1.5 참조

// 3. Block Kit emojiMap 확장
const emojiMap: Record<SlackEventType, string> = {
  'task.started': '🚀',
  'task.completed': '✅',
  'chain.handoff': '🔗',
  'deploy.completed': '🚢',
  'error.critical': '🚨',
  'approval.needed': '🔔',
  'pdca.phase_change': '📊',
  'background.completed': '⏳',
  // Phase 1 신규
  'team.idle': '⚠️',
  'team.recovered': '✨',
  'session.crashed': '💥',
};

// 4. 신규 이벤트 Block Kit 추가 (3.2.3절 참조)

// 5. 통합 채널 모드에서 발신팀 명시 강화
//    → 통합 채널에서는 여러 팀의 알림이 섞이므로,
//      메시지 header에 "[PM팀]", "[CTO팀]" 접두사 추가
```

**통합 채널 메시지 접두사 로직**:

```typescript
function buildSlackBlocks(notification: SlackNotification): any[] {
  const emoji = emojiMap[notification.event];
  const teamDisplay = TEAM_DISPLAY[notification.team];

  // 통합 채널 모드에서는 팀 이름을 header에 포함
  const titlePrefix = UNIFIED_CHANNEL ? `[${teamDisplay.name}] ` : '';

  const blocks: any[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${emoji} ${titlePrefix}${notification.title}`,
        emoji: true,
      },
    },
    // ... 나머지 기존 로직
  ];

  // ... 기존 chain.handoff, error.critical 분기 유지
}
```

#### 3.2.2 Rate Limit 큐잉 로직 (P2-2)

**현재 상태**: `sendWithRetry()` + `enqueueNotification()`이 기본 구현되어 있음.

**Phase 2 확장 내용**:

**서킷 브레이커 (5회 연속 실패 시 2분 차단)**:

```typescript
// src/lib/slack-notifier.ts에 추가

interface CircuitBreakerState {
  failures: number;       // 연속 실패 횟수
  openUntil: number;      // 차단 해제 시각 (Date.now() 기준)
  isOpen: boolean;        // 현재 차단 상태
}

// 메모리 내 서킷 브레이커 상태 (프로세스 내 유지)
const circuitBreaker: CircuitBreakerState = {
  failures: 0,
  openUntil: 0,
  isOpen: false,
};

const CIRCUIT_BREAKER_THRESHOLD = 5;  // 연속 실패 횟수
const CIRCUIT_BREAKER_TIMEOUT = 2 * 60 * 1000;  // 2분

function checkCircuitBreaker(): boolean {
  if (circuitBreaker.isOpen) {
    if (Date.now() > circuitBreaker.openUntil) {
      // half-open: 한 번 시도
      circuitBreaker.isOpen = false;
      circuitBreaker.failures = 0;
      return true;
    }
    return false; // 아직 차단 중
  }
  return true;
}

function recordSuccess(): void {
  circuitBreaker.failures = 0;
  circuitBreaker.isOpen = false;
}

function recordFailure(): void {
  circuitBreaker.failures++;
  if (circuitBreaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitBreaker.isOpen = true;
    circuitBreaker.openUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
    console.error(
      `[slack-notifier] 서킷 브레이커 열림: ${CIRCUIT_BREAKER_THRESHOLD}회 연속 실패, ` +
      `${CIRCUIT_BREAKER_TIMEOUT / 1000}초 후 재시도`
    );
  }
}
```

**sendWithRetry 개선**:

```typescript
async function sendWithRetry(
  channelId: string,
  blocks: any[],
  text: string,
  maxRetries = 3
): Promise<{ ok: boolean; error?: string }> {
  // 서킷 브레이커 확인
  if (!checkCircuitBreaker()) {
    console.warn(`[slack-notifier] 서킷 브레이커 열림 — 큐에 적재`);
    await enqueueNotification(channelId, blocks, text);
    return { ok: false, error: 'CIRCUIT_BREAKER_OPEN' };
  }

  let allRateLimit = true;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await slack.chat.postMessage({ channel: channelId, blocks, text });
      recordSuccess();
      return { ok: true };
    } catch (err: unknown) {
      const isRateLimit = err instanceof Error &&
        'code' in err &&
        (err as { code: string }).code === 'slack_webapi_rate_limited';
      const retryAfter = isRateLimit && err instanceof Error && 'retryAfter' in err
        ? (err as { retryAfter: number }).retryAfter
        : undefined;

      if (!isRateLimit) allRateLimit = false;

      // 복구 불가 에러는 즉시 실패
      const unrecoverable = ['channel_not_found', 'invalid_auth', 'not_authed', 'token_revoked'];
      if (!isRateLimit && err instanceof Error && 'data' in err) {
        const slackErr = err as { data?: { error?: string } };
        if (unrecoverable.includes(slackErr.data?.error ?? '')) {
          recordFailure();
          return { ok: false, error: slackErr.data?.error };
        }
      }

      if (attempt < maxRetries) {
        const delay = retryAfter
          ? retryAfter * 1000
          : Math.pow(2, attempt - 1) * 1000;
        console.warn(
          `[slack-notifier] 채널 ${channelId} 재시도 ${attempt}/${maxRetries} (${delay}ms 대기)`
        );
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        recordFailure();
        const errorMsg = err instanceof Error ? err.message : String(err);

        if (allRateLimit && isRateLimit) {
          await enqueueNotification(channelId, blocks, text);
        }

        return { ok: false, error: errorMsg };
      }
    }
  }

  return { ok: false, error: 'max retries exceeded' };
}
```

**큐 소비 (배치 전송) 전략**:

> `slack-notification.design.md` 7.3~7.4절의 배치 전송 전략을 구현한다.

```
큐 소비 흐름:
1. gs://bscamp-storage/agent-ops/slack/queue.jsonl 읽기 (GCS)
2. status === 'queued' 항목만 필터
3. 우선순위 정렬 (urgent > important > normal)
4. 채널별 그룹핑
5. 같은 채널 + 같은 event 타입 + 5초 이내 → 단일 메시지로 병합
6. 채널당 5초 간격으로 전송 (1msg/sec 제한 대비 여유)
7. 성공 시 status: "sent", 실패 시 retryCount++
8. retryCount > 3이면 status: "failed"
```

**구현 방식**: API Route `GET /api/cron/process-slack-queue`로 구현하고, PM2 cron 또는 Vercel cron으로 30초 간격 실행.

#### 3.2.3 신규 3개 이벤트 Block Kit

**`team.idle`**:

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⚠️ CTO팀 무응답 경고",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "CTO팀이 *5분* 이상 활동이 없습니다.\n마지막 갱신: 2026-03-25 14:25 KST"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-ops-phase2*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 확인",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "primary"
        }
      ]
    }
  ],
  "text": "[경고] CTO팀 5분 무응답"
}
```

**`team.recovered`**:

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "✨ CTO팀 활동 재개",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "CTO팀이 활동을 재개했습니다.\nidle 지속 시간: 7분"
      }
    }
  ],
  "text": "CTO팀 활동 재개"
}
```

**`session.crashed`**:

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "💥 CTO팀 세션 크래시 감지",
        "emoji": true
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*세션 ID*: def456\n*마지막 활동*: 2026-03-25 14:20 KST\n*경과 시간*: 10분\n\n즉시 세션 재시작이 필요합니다."
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "📋 Feature: *agent-ops-phase2*"
        }
      ]
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "대시보드에서 확인",
            "emoji": true
          },
          "url": "https://bscamp.app/admin/agent-dashboard",
          "style": "danger"
        }
      ]
    }
  ],
  "text": "[긴급] CTO팀 세션 크래시 감지"
}
```

### 3.3 Hook 개선 (P2-6: agent-slack-notify.sh)

**현재 구현 상태**: 기본 `task.completed` + `chain.handoff` 전송만 구현.

**Phase 2 개선 항목**:

| # | 개선 내용 | 상세 |
|---|-----------|------|
| H1 | `metadata.taskId` 추가 | EVENT_DATA에서 task ID 추출하여 전송 |
| H2 | `metadata.feature` 추가 | state.json의 `currentFeature` 필드에서 읽기 |
| H3 | `error.critical` 이벤트 추가 | 빌드 실패 감지 시 에러 메시지와 함께 전송 |
| H4 | 로그 기록 | `gs://bscamp-storage/agent-ops/slack/hook.log`에 전송 결과 기록 (GCS) |
| H5 | 인증 개선 | 쿠키 대신 `X-Internal-Key` 헤더 사용 (선택) |
| H6 | chain.handoff 시 `targetTeam` 결정 | `chain-detector.ts` 규칙 기반으로 targetTeam 명시 |

**개선된 hook 스크립트 동작 흐름**:

```
agent-slack-notify.sh (Phase 2):

1. stdin에서 EVENT_DATA 읽기
2. AGENT_TEAM 환경변수로 팀 식별
3. 팀 이름 매핑
4. EVENT_DATA에서 task.subject, task.id 추출
5. state.json에서 currentFeature 읽기
6. task.completed 알림 전송:
   POST /api/agent-dashboard/slack/notify
   {
     event: "task.completed",
     team: AGENT_TEAM,
     title: "{팀이름} 작업 완료: {task.subject}",
     message: "{팀이름} 에이전트가 작업을 완료했습니다.",
     metadata: {
       taskId: "{task.id}",
       feature: "{currentFeature}",
       dashboardUrl: "https://bscamp.app/admin/agent-dashboard"
     }
   }
7. 모든 TASK 완료 여부 확인
8. ALL_DONE이면:
   a. 체인 규칙 매칭 (python3으로 간단 매칭 또는 API에 위임)
   b. chain.handoff 알림 전송 (targetTeam 포함)
9. 전송 결과 로깅 → gs://bscamp-storage/agent-ops/slack/hook.log (gsutil cp)
10. exit 0 (항상 성공)
```

**H3 (빌드 실패 감지) 구현 방안**:

```bash
# TaskCompleted hook이 아닌, 별도의 빌드 실패 감지 로직
# agent-slack-notify.sh에 빌드 실패 감지 분기 추가

# 빌드 결과 확인 (환경변수 또는 마커 파일)
if [ -f "/tmp/agent-build-failed" ]; then
  BUILD_ERROR=$(cat /tmp/agent-build-failed)
  curl -s -X POST "$API_BASE/api/agent-dashboard/slack/notify" \
    -H "Content-Type: application/json" \
    -d "{
      \"event\": \"error.critical\",
      \"team\": \"$TEAM\",
      \"title\": \"빌드 실패: $TEAM_NAME\",
      \"message\": \"npm run build 실패\",
      \"metadata\": {
        \"errorMessage\": \"$BUILD_ERROR\",
        \"feature\": \"$CURRENT_FEATURE\",
        \"dashboardUrl\": \"https://bscamp.app/admin/agent-dashboard\"
      }
    }" > /dev/null 2>&1
  rm -f /tmp/agent-build-failed
fi
```

**H5 (인증 개선) — 내부 API Key**:

```bash
# 환경변수 INTERNAL_API_KEY가 설정되어 있으면 사용
if [ -n "$INTERNAL_API_KEY" ]; then
  AUTH_HEADER="-H \"X-Internal-Key: $INTERNAL_API_KEY\""
else
  AUTH_HEADER="-H \"Cookie: __session=$(cat /tmp/bscamp-session-cookie 2>/dev/null || echo '')\""
fi
```

> API Route 측에서 `X-Internal-Key` 헤더를 `INTERNAL_API_KEY` 환경변수와 비교하여 인증하는 분기를 추가한다.

---

## 4. 에러 처리

### 4.1 슬랙 API 에러

| HTTP 코드 | Slack 에러 | 원인 | 대응 |
|:---------:|-----------|------|------|
| 401 | `not_authed` / `invalid_auth` | 토큰 만료 또는 잘못된 토큰 | 재시도 불가, 로깅 + 대시보드 경고 배지 표시 |
| 403 | `channel_not_found` | 채널 ID가 잘못됨 또는 봇이 채널에 미참여 | 재시도 불가, 로깅 + 해당 채널 건너뛰기 |
| 404 | `channel_not_found` | 채널 삭제됨 | 위와 동일 |
| 429 | `rate_limited` | Rate Limit 초과 | Retry-After 대기 → 재시도 → 실패 시 큐잉 |
| 500 | (서버 에러) | Slack 내부 장애 | 지수 백오프 재시도 (1초, 2초, 4초) |

### 4.2 state.json 읽기 실패

| 상황 | 대응 |
|------|------|
| 파일 미존재 | 기본값 반환 (`{ name: "{팀명}", status: "planned", members: [], tasks: [] }`) |
| JSON 파싱 실패 | 마지막 유효 상태 캐시에서 반환 + 경고 기록 |
| 파일 접근 권한 없음 | 500 에러 반환 |

### 4.3 대시보드 API 에러 코드 통합

| 에러 코드 | HTTP | 원인 | 클라이언트 표시 |
|-----------|:----:|------|---------------|
| `UNAUTHORIZED` | 401 | admin 아닌 사용자 | 로그인 페이지로 리다이렉트 |
| `INVALID_TEAM` | 400 | 잘못된 teamId | "유효하지 않은 팀입니다" |
| `INVALID_STATE` | 400 | TeamState 스키마 불일치 | "상태 데이터 형식이 올바르지 않습니다" |
| `STATE_FILE_NOT_FOUND` | 200 | 팀 state.json 없음 | 해당 팀 카드에 "오프라인" 표시 |
| `STATE_PARSE_ERROR` | 200 | state.json JSON 파싱 실패 | 해당 팀 카드에 "데이터 오류" 표시 |
| `STATE_READ_ERROR` | 500 | GCS 접근 불가 | "GCS에서 상태를 불러올 수 없습니다" |
| `STATE_WRITE_ERROR` | 500 | state.json 쓰기 실패 | "상태 갱신에 실패했습니다" |
| `PDCA_NOT_FOUND` | 200 | .pdca-status.json 없음 | PDCA 패널에 "데이터 없음" 표시 |
| `API_TIMEOUT` | 504 | 응답 10초 초과 | "데이터 갱신 지연 중..." |
| `INVALID_EVENT_TYPE` | 400 | 잘못된 슬랙 이벤트 | "유효하지 않은 이벤트입니다" |
| `MISSING_TARGET_TEAM` | 400 | chain.handoff인데 targetTeam 없음 | "수신 팀을 지정해야 합니다" |
| `SLACK_TOKEN_MISSING` | 503 | SLACK_BOT_TOKEN 미설정 | "슬랙 연결 미설정" |
| `SLACK_SEND_FAILED` | 500 | 모든 채널 전송 실패 | "슬랙 전송에 실패했습니다" |
| `PARTIAL_SEND_FAILURE` | 207 | 일부 채널만 성공 | "일부 채널 전송 실패" |
| `CIRCUIT_BREAKER_OPEN` | 503 | 서킷 브레이커 열림 | "슬랙 전송 일시 차단 (2분 후 재시도)" |
| `LOG_WRITE_ERROR` | 500 | comm.jsonl 쓰기 실패 | "로그 저장에 실패했습니다" |
| `INVALID_LIMIT` | 400 | 잘못된 limit 파라미터 | "limit는 1~200 사이 정수여야 합니다" |
| `INVALID_STATUS` | 400 | 잘못된 BackgroundTask status | "유효하지 않은 상태입니다" |

---

## 5. 구현 순서

### P2-1: 통합 채널 구조 전환

```
파일: src/lib/slack-notifier.ts, src/types/agent-dashboard.ts
담당: backend-dev
의존: P1-6 (신규 슬랙 이벤트 3개 추가 완료)
내용:
  [ ] SlackEventType에 3개 신규 이벤트 추가 (types)
  [ ] PRIORITY_MAP 11개로 확장
  [ ] CEO_NOTIFY_EVENTS 확장
  [ ] emojiMap 11개로 확장
  [ ] resolveChannels() 통합 채널 로직 검증
  [ ] 통합 채널 모드에서 팀 이름 접두사 추가 (buildSlackBlocks)
  [ ] 신규 3개 이벤트 Block Kit 빌드 분기 추가
```

### P2-2: Rate Limit 큐잉 + 재시도 로직

```
파일: src/lib/slack-notifier.ts, src/types/agent-dashboard.ts
담당: backend-dev
의존: P2-1
내용:
  [ ] SlackQueueEntryV2 타입 추가 (types)
  [ ] 서킷 브레이커 구현 (checkCircuitBreaker, recordSuccess, recordFailure)
  [ ] sendWithRetry() 개선 (서킷 브레이커 통합, 복구 불가 에러 분리)
  [ ] enqueueNotification() 확장 (V2 필드 포함)
  [ ] 큐 소비 API 구현 (GET /api/cron/process-slack-queue) — 선택
```

### P2-3: 에이전트 대시보드 API

```
파일: src/app/api/agent-dashboard/route.ts
      src/app/api/agent-dashboard/log/route.ts
      src/app/api/agent-dashboard/team/[teamId]/route.ts
      src/app/api/agent-dashboard/background/[taskId]/route.ts
담당: backend-dev
의존: 없음 (P2-1과 병렬 가능)
내용:
  [ ] GET /api/agent-dashboard — 3팀 state.json + comm.jsonl + PDCA 읽기
  [ ] GET /api/agent-dashboard/log — comm.jsonl 조회 (limit, team, since 필터)
  [ ] POST /api/agent-dashboard/log — comm.jsonl append
  [ ] PUT /api/agent-dashboard/team/[teamId] — state.json 갱신 (atomic write)
  [ ] PUT /api/agent-dashboard/background/[taskId] — tasks.json 갱신
  [ ] 모든 API에 requireAdmin() 인증 추가
  [ ] 에러 처리 (파일 없음, 파싱 실패, 쓰기 실패)
```

### P2-4: 에이전트 대시보드 UI

```
파일: src/app/(main)/admin/agent-dashboard/page.tsx
      src/app/(main)/admin/agent-dashboard/components/*.tsx
담당: frontend-dev
의존: P2-3 (API 완성 후)
내용:
  [ ] useDashboardState.ts — 5초 폴링 + deep compare + 탭 비활성화 처리
  [ ] DashboardHeader.tsx — LIVE 인디케이터 (초록/주황/빨강)
  [ ] OrgChart.tsx — CEO → COO → 3팀 정적 조직도
  [ ] TeamCard.tsx — 팀 상태 + 멤버 칩 + TASK 목록 + idle 하이라이트
  [ ] TeamMemberChip.tsx — 모델별 색상 (opus=#F75D5D, sonnet=#6366f1, haiku=#10b981)
  [ ] TaskList.tsx — TASK 상태 아이콘 (✓/→/○/✕)
  [ ] CommLogPanel.tsx — 소통 로그 최신 50건
  [ ] BackgroundPanel.tsx — 진행 바 (팀별 그룹화)
  [ ] PdcaStatusPanel.tsx — PDCA 요약 + auto-sync 배지
  [ ] ChainStatusPanel.tsx (신규) — 체인 전달 시각화
  [ ] SlackAlertLog.tsx (신규) — 슬랙 알림 로그 최근 20건
  [ ] CheckpointInfo.tsx (신규) — 세션 정보 (컨텍스트 사용률 경고)
  [ ] page.tsx — 전체 레이아웃 그리드 조립
  [ ] 사이드바 메뉴 추가 (DashboardSidebar.tsx 최소 수정)
  [ ] 반응형: 데스크탑 3열, 태블릿 2열, 모바일 1열
```

### P2-5: 슬랙 알림 API

```
파일: src/app/api/agent-dashboard/slack/notify/route.ts
담당: backend-dev
의존: P2-1
내용:
  [ ] POST 핸들러 구현
  [ ] requireAdmin() + X-Internal-Key 이중 인증
  [ ] 요청 검증 (11개 이벤트, team, title, message)
  [ ] chain.handoff 시 targetTeam 필수 검증 + team !== targetTeam 확인
  [ ] SlackNotification 객체 생성 (priority, channels, ceoNotify 자동 결정)
  [ ] sendSlackNotification() 호출
  [ ] 결과를 queue.jsonl에 로깅
  [ ] 성공(200)/부분성공(207)/실패(500) 응답 분기
```

### P2-6: agent-slack-notify.sh Hook 개선

```
파일: .claude/hooks/agent-slack-notify.sh
담당: backend-dev
의존: P2-5
내용:
  [ ] metadata에 taskId 추가 (EVENT_DATA에서 추출)
  [ ] metadata에 feature 추가 (state.json의 currentFeature에서 읽기)
  [ ] error.critical 이벤트 추가 (/tmp/agent-build-failed 마커 감지)
  [ ] chain.handoff 시 targetTeam 결정 (python3으로 체인 규칙 매칭)
  [ ] 전송 결과 로깅 (gs://bscamp-storage/agent-ops/slack/hook.log, gsutil cp)
  [ ] 인증 개선: X-Internal-Key 환경변수 우선 사용
```

### 의존성 그래프

```
P2-1 (통합 채널) ──→ P2-2 (Rate Limit) ──→ P2-5 (슬랙 API) ──→ P2-6 (Hook 개선)
                                                    ↑
P2-3 (대시보드 API) ──→ P2-4 (대시보드 UI) ─────────┘
```

### 병렬 위임 계획

```
Wave 1 (병렬):
  - backend-dev: P2-1 (통합 채널) + P2-3 (대시보드 API)
  - frontend-dev: P2-4 준비 (컴포넌트 스켈레톤, useDashboardState 훅)

Wave 2:
  - backend-dev: P2-2 (Rate Limit) + P2-5 (슬랙 API)
  - frontend-dev: P2-4 (대시보드 UI 본격 구현 — P2-3 API 완성 후)

Wave 3:
  - backend-dev: P2-6 (Hook 개선)
  - qa-engineer: 전체 통합 테스트
```

### 파일 경계 (충돌 방지)

| 팀원 | 소유 파일/디렉토리 |
|------|-------------------|
| **backend-dev** | `src/lib/slack-notifier.ts`, `src/types/agent-dashboard.ts`, `src/app/api/agent-dashboard/**`, `.claude/hooks/agent-slack-notify.sh` |
| **frontend-dev** | `src/app/(main)/admin/agent-dashboard/**`, `src/components/DashboardSidebar.tsx` (1줄 추가만) |
| **qa-engineer** | `docs/03-analysis/agent-ops-phase2.analysis.md`, 테스트 파일 |

---

## Phase 2 완료 기준

- [ ] 통합 채널(`SLACK_UNIFIED_CHANNEL`)로 11개 이벤트 전송 확인
- [ ] 팀별 채널 모드에서도 기존 8개 + 신규 3개 이벤트 정상 전송
- [ ] Rate Limit(429) 시 자동 큐잉 + Retry-After 기반 재시도
- [ ] 서킷 브레이커: 5회 연속 실패 → 2분 차단 → half-open 재시도
- [ ] 대시보드 `/admin/agent-dashboard`에서 3팀 상태 실시간 확인 (5초 폴링)
- [ ] 대시보드: TeamCard(idle 하이라이트), CommLog, PDCA(auto-sync), Background, Chain, SlackLog, Checkpoint 패널 정상 표시
- [ ] 반응형 레이아웃: 데스크탑(1920px) + 모바일(375px) 정상 표시
- [ ] agent-slack-notify.sh: metadata 확장 + error.critical + targetTeam 결정
- [ ] `npx tsc --noEmit` 에러 0개
- [ ] `npm run build` 성공
- [ ] Gap 분석 문서 작성 (Match Rate 90%+)
