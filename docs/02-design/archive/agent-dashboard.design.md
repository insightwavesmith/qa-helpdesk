# 에이전트 대시보드 설계서

> **작성일**: 2026-03-24
> **작성자**: Leader (PM팀 기획)
> **Plan 참조**: `docs/01-plan/features/agent-dashboard.plan.md`
> **목업 참조**: mozzi-reports.vercel.app/dashboard

---

## 1. 데이터 모델

### 1.1 팀 상태 (state.json — 팀별 파일)

각 팀은 `/tmp/cross-team/{team}/state.json`에 상태를 기록한다.

```typescript
// types/agent-dashboard.ts

/** 팀 식별자 */
type TeamId = 'pm' | 'marketing' | 'cto';

/** 에이전트 모델 */
type AgentModel = 'opus' | 'sonnet' | 'haiku';

/** 팀 운영 상태 */
type TeamStatus = 'active' | 'planned' | 'idle';

/** TASK 상태 */
type TaskStatus = 'done' | 'active' | 'pending' | 'blocked';

/** PDCA 단계 */
type PdcaPhase = 'planning' | 'designing' | 'implementing' | 'checking' | 'completed';

/** 팀 멤버 */
interface AgentMember {
  name: string;        // "pm-lead", "frontend-dev" 등
  model: AgentModel;   // "opus", "sonnet", "haiku"
  role: string;        // "기획 총괄", "프론트엔드" 등
}

/** 팀 TASK */
interface AgentTask {
  id: string;          // "T1", "T2" 등
  title: string;       // 작업 제목
  status: TaskStatus;  // 진행 상태
  assignee?: string;   // 담당 에이전트 이름
  updatedAt: string;   // ISO 8601
}

/** 팀 상태 (단일 팀) */
interface TeamState {
  name: string;        // "PM팀"
  emoji: string;       // "📋"
  status: TeamStatus;
  color: string;       // HEX "#8b5cf6"
  members: AgentMember[];
  tasks: AgentTask[];
}

/** 소통 로그 항목 */
interface CommLog {
  time: string;        // "14:30" 또는 ISO 8601
  from: string;        // 발신자 ("pm-lead", "cto-lead")
  to?: string;         // 수신자 (없으면 전체)
  msg: string;         // 메시지 내용
  team: TeamId;        // 발신 팀
}

/** 백그라운드 작업 */
interface BackgroundTask {
  id: string;          // "backfill", "embedding" 등
  label: string;       // "📦 backfill 90일"
  current: number;     // 현재 진행 수
  total: number;       // 전체 수
  color: string;       // 진행 바 색상
  team: TeamId;        // 소속 팀
  status: 'running' | 'paused' | 'completed' | 'error';
}

/** PDCA Feature 상태 (.pdca-status.json 연동) */
interface PdcaFeature {
  name: string;        // feature key
  phase: PdcaPhase;
  matchRate: number;   // 0-100
  documents: {
    plan?: string;
    design?: string;
    analysis?: string;
    report?: string;
  };
  startedAt: string;
  completedAt?: string;
  notes: string;
  team: TeamId;        // 담당 팀
}

/** ─── 슬랙 알림 관련 타입 ─── */

/** 슬랙 알림 이벤트 종류 */
type SlackEventType =
  | 'task.started'        // 팀 TASK 시작
  | 'task.completed'      // 팀 TASK 완료
  | 'chain.handoff'       // 팀 간 체인 전달
  | 'deploy.completed'    // 배포 완료
  | 'error.critical'      // 에러/장애
  | 'approval.needed'     // 승인 필요
  | 'pdca.phase_change'   // PDCA 단계 전환
  | 'background.completed'; // 백그라운드 작업 완료

/** 슬랙 알림 우선순위 */
type SlackPriority = 'normal' | 'important' | 'urgent';

/** 슬랙 알림 이벤트 */
interface SlackNotification {
  id: string;              // UUID
  event: SlackEventType;
  priority: SlackPriority;
  team: TeamId;            // 발신 팀
  targetTeam?: TeamId;     // 수신 팀 (체인 전달 시)
  title: string;           // 알림 제목
  message: string;         // 상세 메시지
  metadata?: {
    feature?: string;      // PDCA feature 이름
    taskId?: string;       // TASK ID
    matchRate?: number;    // PDCA matchRate
    errorMessage?: string; // 에러 메시지
    dashboardUrl?: string; // 대시보드 링크
  };
  channels: string[];      // 전송 대상 채널 ID 목록
  ceoNotify: boolean;      // CEO DM 전송 여부
  sentAt?: string;         // ISO 8601 (전송 완료 시각)
  status: 'pending' | 'sent' | 'failed';
}

/** 슬랙 채널 설정 */
interface SlackChannelConfig {
  pm: string;              // #agent-pm 채널 ID
  marketing: string;       // #agent-marketing 채널 ID
  cto: string;             // #agent-cto 채널 ID
  ceoUserId: string;       // Smith님 Slack User ID (DM용)
}

/** 체인 전달 규칙 — 팀 A 완료 시 팀 B에 알림 */
interface ChainRule {
  fromTeam: TeamId;
  fromEvent: string;       // "plan.completed", "implementation.completed" 등
  toTeam: TeamId;
  toAction: string;        // "구현 착수 필요", "검증 착수 필요" 등
}

/** 대시보드 전체 상태 (API 응답) */
interface DashboardState {
  updatedAt: string;               // ISO 8601
  org: OrgChart;                   // 조직도
  teams: Record<TeamId, TeamState>;
  logs: CommLog[];                 // 최근 50건
  background: BackgroundTask[];
  pdca: {
    features: PdcaFeature[];
    summary: {
      total: number;
      completed: number;
      inProgress: number;
      avgMatchRate: number;
    };
  };
  connection: {
    status: 'live' | 'stale' | 'disconnected';
    lastPing: string;
  };
}

/** 조직도 */
interface OrgChart {
  ceo: { name: string; title: string };
  coo: { name: string; title: string };
  teams: {
    id: TeamId;
    name: string;
    emoji: string;
    lead: string;
    memberCount: number;
  }[];
}
```

### 1.2 파일 기반 데이터 저장 (Phase 1)

```
/tmp/cross-team/
├── pm/
│   └── state.json          ← PM팀 세션이 갱신
├── marketing/
│   └── state.json          ← 마케팅팀 세션이 갱신
├── cto/
│   └── state.json          ← CTO팀 세션이 갱신
├── logs/
│   └── comm.jsonl          ← 팀 간 소통 로그 (append-only)
├── background/
│   └── tasks.json          ← 백그라운드 작업 목록
├── slack/
│   └── queue.jsonl         ← 슬랙 알림 발송 큐 (append-only)
└── pm-done.md              ← 기획 완료 마커
```

### 1.3 PDCA 연동 데이터 소스

| 프로젝트 | .pdca-status.json 경로 | 팀 |
|---------|----------------------|-----|
| bscamp | `/Users/smith/projects/bscamp/.bkit/state/pdca-status.json` | CTO팀 |
| (PM 프로젝트) | 해당 프로젝트의 `.bkit/state/pdca-status.json` | PM팀 |
| (마케팅 프로젝트) | 해당 프로젝트의 `.bkit/state/pdca-status.json` | 마케팅팀 |

---

## 2. API 설계

### 2.1 대시보드 상태 조회

```
GET /api/agent-dashboard
```

**응답**: `DashboardState` (전체 상태)

**동작**:
1. `/tmp/cross-team/{pm,marketing,cto}/state.json` 3개 파일 읽기
2. `/tmp/cross-team/logs/comm.jsonl` 최근 50건 읽기
3. `/tmp/cross-team/background/tasks.json` 읽기
4. 각 프로젝트의 `.pdca-status.json` 읽기
5. 집계 통계 계산 (총 feature 수, 평균 matchRate 등)
6. `DashboardState` 조립 후 반환

**응답 예시**:
```json
{
  "updatedAt": "2026-03-24T23:15:00+09:00",
  "connection": { "status": "live", "lastPing": "2026-03-24T23:15:00+09:00" },
  "org": {
    "ceo": { "name": "Smith", "title": "CEO" },
    "coo": { "name": "모찌", "title": "COO" },
    "teams": [
      { "id": "pm", "name": "PM팀", "emoji": "📋", "lead": "pm-lead", "memberCount": 3 },
      { "id": "marketing", "name": "마케팅팀", "emoji": "📊", "lead": "marketing-strategist", "memberCount": 4 },
      { "id": "cto", "name": "CTO팀", "emoji": "⚙️", "lead": "cto-lead", "memberCount": 4 }
    ]
  },
  "teams": { "...": "TeamState 객체" },
  "logs": [],
  "background": [],
  "pdca": {
    "features": [],
    "summary": { "total": 0, "completed": 0, "inProgress": 0, "avgMatchRate": 0 }
  }
}
```

**에러 응답**:
```json
{ "error": "STATE_FILE_NOT_FOUND", "message": "PM팀 상태 파일을 찾을 수 없습니다", "team": "pm" }
```

### 2.2 소통 로그 전송

```
POST /api/agent-dashboard/log
```

**요청**:
```json
{
  "from": "pm-lead",
  "team": "pm",
  "to": "cto-lead",
  "msg": "agent-dashboard Plan 문서 완료, Design 진행 중"
}
```

**동작**: `/tmp/cross-team/logs/comm.jsonl`에 타임스탬프 추가 후 append

### 2.3 팀 상태 갱신

```
PUT /api/agent-dashboard/team/{teamId}
```

**요청**: `TeamState` 객체

**동작**: `/tmp/cross-team/{teamId}/state.json` 덮어쓰기

### 2.4 백그라운드 작업 갱신

```
PUT /api/agent-dashboard/background/{taskId}
```

**요청**:
```json
{
  "current": 2900,
  "total": 3096,
  "status": "running"
}
```

### 2.5 SSE 스트림 (Phase 1 선택)

```
GET /api/agent-dashboard/stream
```

**동작**: 5초 간격으로 상태 변경 감지 → SSE 이벤트 push
- `event: state-update` — 전체 상태 갱신
- `event: new-log` — 새 소통 로그
- `event: background-progress` — 백그라운드 진행률

### 2.6 슬랙 알림 전송

```
POST /api/agent-dashboard/slack/notify
```

**요청**:
```json
{
  "event": "chain.handoff",
  "team": "pm",
  "targetTeam": "cto",
  "title": "체인 전달: PM팀 → CTO팀",
  "message": "PM팀이 [agent-dashboard] 기획을 완료했습니다. CTO팀 구현 착수가 필요합니다.",
  "metadata": {
    "feature": "agent-dashboard",
    "dashboardUrl": "https://bscamp.app/admin/agent-dashboard"
  }
}
```

**동작**:
1. `SlackNotification` 객체 생성 (priority/channels 자동 결정)
2. 이벤트 타입별 라우팅 규칙으로 수신 채널 결정
3. @slack/web-api로 Block Kit 메시지 전송
4. CEO DM 필요 시 `chat.postMessage`로 DM 전송
5. 전송 결과를 `/tmp/cross-team/slack/queue.jsonl`에 로깅

**알림 라우팅 규칙**:

| event | 팀 채널 | CEO DM |
|-------|---------|--------|
| `task.started` | 해당 팀만 | X |
| `task.completed` | 해당 팀만 | X |
| `chain.handoff` | 양쪽 팀 | O |
| `deploy.completed` | #agent-cto | O |
| `error.critical` | 해당 팀 | O |
| `approval.needed` | 해당 팀 | O |
| `pdca.phase_change` | 해당 팀만 | X |
| `background.completed` | 해당 팀만 | X |

### 2.7 슬랙 서비스 모듈

```typescript
// src/lib/slack-notifier.ts

import { WebClient } from '@slack/web-api';

const slack = new WebClient(process.env.SLACK_BOT_TOKEN);

/** 채널 설정 (환경변수) */
const CHANNELS: SlackChannelConfig = {
  pm: process.env.SLACK_CHANNEL_PM!,           // #agent-pm
  marketing: process.env.SLACK_CHANNEL_MARKETING!, // #agent-marketing
  cto: process.env.SLACK_CHANNEL_CTO!,         // #agent-cto
  ceoUserId: process.env.SLACK_CEO_USER_ID!,   // Smith님 User ID
};

/** 체인 전달 규칙 */
const CHAIN_RULES: ChainRule[] = [
  { fromTeam: 'pm', fromEvent: 'plan.completed', toTeam: 'cto', toAction: '구현 착수 필요' },
  { fromTeam: 'pm', fromEvent: 'plan.completed', toTeam: 'marketing', toAction: '검증 준비 필요' },
  { fromTeam: 'cto', fromEvent: 'implementation.completed', toTeam: 'marketing', toAction: '마케팅 검증 시작' },
  { fromTeam: 'marketing', fromEvent: 'review.completed', toTeam: 'pm', toAction: '결과 리뷰 필요' },
];

/** 이벤트 → 우선순위 매핑 */
const PRIORITY_MAP: Record<SlackEventType, SlackPriority> = {
  'task.started': 'normal',
  'task.completed': 'normal',
  'chain.handoff': 'important',
  'deploy.completed': 'important',
  'error.critical': 'urgent',
  'approval.needed': 'important',
  'pdca.phase_change': 'normal',
  'background.completed': 'normal',
};

/** Block Kit 메시지 빌더 */
function buildSlackBlocks(notification: SlackNotification) {
  const emoji = {
    'task.started': '🚀',
    'task.completed': '✅',
    'chain.handoff': '🔗',
    'deploy.completed': '🚢',
    'error.critical': '🚨',
    'approval.needed': '🔔',
    'pdca.phase_change': '📊',
    'background.completed': '⏳',
  }[notification.event];

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} ${notification.title}` }
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: notification.message }
    },
    ...(notification.metadata?.feature ? [{
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `📋 Feature: *${notification.metadata.feature}*` },
        ...(notification.metadata.matchRate
          ? [{ type: 'mrkdwn', text: `📊 Match Rate: *${notification.metadata.matchRate}%*` }]
          : []),
      ]
    }] : []),
    ...(notification.metadata?.dashboardUrl ? [{
      type: 'actions',
      elements: [{
        type: 'button',
        text: { type: 'plain_text', text: '대시보드에서 보기' },
        url: notification.metadata.dashboardUrl,
        style: notification.priority === 'urgent' ? 'danger' : 'primary'
      }]
    }] : []),
  ];
}

/** 메인 전송 함수 */
async function sendSlackNotification(notification: SlackNotification): Promise<void> {
  const blocks = buildSlackBlocks(notification);

  // 1. 팀 채널에 전송
  for (const channelId of notification.channels) {
    await slack.chat.postMessage({
      channel: channelId,
      blocks,
      text: notification.title, // fallback
    });
  }

  // 2. CEO DM 전송 (중요/긴급만)
  if (notification.ceoNotify) {
    await slack.chat.postMessage({
      channel: CHANNELS.ceoUserId,
      blocks,
      text: `[${notification.priority.toUpperCase()}] ${notification.title}`,
    });
  }
}
```

### 2.8 체인 전달 감지 로직

```typescript
// src/lib/chain-detector.ts

/** 팀 상태 변경 시 체인 전달 필요 여부 판단 */
function detectChainHandoff(
  team: TeamId,
  event: string,   // "plan.completed", "implementation.completed" 등
): ChainRule | null {
  return CHAIN_RULES.find(r => r.fromTeam === team && r.fromEvent === event) ?? null;
}

/** bkit hook에서 호출 — 상태 변경 시 자동 감지 + 슬랙 전송 */
async function onTeamStateChange(team: TeamId, previousState: TeamState, newState: TeamState) {
  // 1. 완료된 TASK 감지
  const newlyCompleted = newState.tasks.filter(
    t => t.status === 'done' && previousState.tasks.find(p => p.id === t.id)?.status !== 'done'
  );

  for (const task of newlyCompleted) {
    // task.completed 알림
    await sendSlackNotification({
      event: 'task.completed',
      team,
      title: `${newState.name} 작업 완료: ${task.title}`,
      message: `담당: ${task.assignee ?? '미지정'}`,
      channels: [CHANNELS[team]],
      ceoNotify: false,
      // ...
    });
  }

  // 2. 모든 TASK 완료 시 체인 전달 감지
  const allDone = newState.tasks.every(t => t.status === 'done');
  if (allDone) {
    const chain = detectChainHandoff(team, 'implementation.completed');
    if (chain) {
      await sendSlackNotification({
        event: 'chain.handoff',
        team,
        targetTeam: chain.toTeam,
        title: `체인 전달: ${newState.name} → ${chain.toTeam}팀`,
        message: `${newState.name}의 작업이 완료되었습니다. ${chain.toAction}`,
        channels: [CHANNELS[team], CHANNELS[chain.toTeam]],
        ceoNotify: true,
        // ...
      });
    }
  }
}
```

---

## 3. 컴포넌트 구조

### 3.1 페이지 구성

```
src/app/(main)/admin/agent-dashboard/
├── page.tsx                    ← 메인 페이지 (서버 컴포넌트)
├── components/
│   ├── DashboardHeader.tsx     ← LIVE 인디케이터 + 업데이트 시각
│   ├── OrgChart.tsx            ← 조직도 (CEO → COO → 3팀)
│   ├── TeamCard.tsx            ← 팀 카드 (상태 + 멤버 + TASK)
│   ├── TeamMemberChip.tsx      ← 에이전트 멤버 칩 (모델 색상)
│   ├── TaskList.tsx            ← TASK 목록 (상태 아이콘)
│   ├── CommLogPanel.tsx        ← 팀 간 소통 로그
│   ├── BackgroundPanel.tsx     ← 백그라운드 작업 진행 바
│   ├── PdcaStatusPanel.tsx     ← PDCA 상태 요약 + feature 목록
│   └── useDashboardState.ts    ← 상태 관리 커스텀 훅
```

### 3.2 컴포넌트 상세

#### DashboardHeader
```
┌─────────────────────────────────────────────────┐
│ 🍡 bscamp 에이전트 대시보드    ● LIVE  23:15:00 │
└─────────────────────────────────────────────────┘
```
- Props: `connection: { status, lastPing }`
- LIVE 아이콘: 초록(live), 주황(stale, >30초), 빨강(disconnected, >60초)

#### OrgChart
```
┌─────────────────────────────────────────────────┐
│          Smith (CEO)                             │
│              ↓                                   │
│          모찌 (COO)                              │
│        ↙     ↓     ↘                            │
│   📋 PM팀  📊 마케팅팀  ⚙️ CTO팀               │
│   3명       4명         4명                      │
└─────────────────────────────────────────────────┘
```
- Props: `org: OrgChart`
- 정적 렌더링 (조직 변경 시에만 갱신)

#### TeamCard
```
┌─────────────────────────────┐
│ 📋 PM팀          ● 운영 중  │
│ ─────────────────────────── │
│ 🟣 pm-lead (opus)           │
│ 🔵 pm-discovery (sonnet)    │
│ 🔵 pm-prd (sonnet)          │
│ ─────────────────────────── │
│ ✓ PRD 초안 작성        완료 │
│ → 시장조사 분석       진행중 │
│ ○ 경쟁사 벤치마크      대기 │
└─────────────────────────────┘
```
- Props: `team: TeamState`
- 모델별 칩 색상: opus=#F75D5D, sonnet=#6366f1, haiku=#10b981

#### CommLogPanel
```
┌─────────────────────────────────────────────────┐
│ 💬 팀 간 소통 로그                               │
│ ─────────────────────────────────────────────────│
│ 14:30  pm-lead → cto-lead                        │
│        "대시보드 기획서 전달합니다"                │
│ 14:25  cto-lead → 전체                           │
│        "backfill 92% 완료, 15분 후 종료 예정"     │
│ 14:20  marketing-strategist → pm-lead            │
│        "크리에이티브 분석 리포트 공유"             │
└─────────────────────────────────────────────────┘
```
- Props: `logs: CommLog[]`
- 최신 순 정렬, 최대 50건

#### BackgroundPanel
```
┌─────────────────────────────────────────────────┐
│ ⏳ 백그라운드 작업                               │
│ ─────────────────────────────────────────────────│
│ [CTO팀]                                         │
│ 📦 backfill 90일    ████████████░░  2847/3096 92%│
│ 🧠 embedding        ██████████████  1200/1200 ✓ │
│ [마케팅팀]                                       │
│ 👁️ imageSaliency    ████████░░░░░░  856/1500 57%│
│ 🎬 videoSaliency    ░░░░░░░░░░░░░░    0/500  0%│
└─────────────────────────────────────────────────┘
```
- Props: `tasks: BackgroundTask[]`
- 팀별 그룹화, 색상 코딩

#### PdcaStatusPanel
```
┌─────────────────────────────────────────────────┐
│ 📊 PDCA 상태                                    │
│ ─────────────────────────────────────────────────│
│ 전체: 85개  완료: 78개  진행: 7개  평균: 96.2%   │
│ ─────────────────────────────────────────────────│
│ [진행 중 Features]                               │
│ • agent-dashboard  planning   —%   PM팀          │
│ • backfill-unify   checking   92%  CTO팀         │
│ • creative-v3      designing  —%   마케팅팀       │
└─────────────────────────────────────────────────┘
```
- Props: `pdca: { features, summary }`
- 진행 중 feature만 표시 (완료는 접기)

### 3.3 상태 관리

```typescript
// useDashboardState.ts
function useDashboardState() {
  // 5초 폴링으로 /api/agent-dashboard 호출
  // 상태 변경 시에만 리렌더링 (deep compare)
  // connection status 자동 판단 (lastPing 기준)
  return { data: DashboardState, isLoading, error, isLive };
}
```

### 3.4 레이아웃 그리드

```
데스크탑 (1920px):
┌──────────────────────────────────────────────────┐
│ DashboardHeader (full width)                      │
├──────────────────────────────────────────────────┤
│ OrgChart (full width)                             │
├────────────┬────────────┬────────────────────────┤
│ TeamCard   │ TeamCard   │ TeamCard               │
│ (PM팀)     │ (마케팅팀)  │ (CTO팀)               │
├────────────┴────────────┴────────────────────────┤
│ CommLogPanel (full width)                         │
├──────────────────────┬───────────────────────────┤
│ BackgroundPanel      │ PdcaStatusPanel            │
│ (2/3 width)          │ (1/3 width)               │
└──────────────────────┴───────────────────────────┘

태블릿 (768px):
TeamCard 세로 스택 (1열)
BackgroundPanel + PdcaStatusPanel 세로 스택
```

---

## 4. 에러 처리

| 상황 | 에러 코드 | 사용자 메시지 | 처리 |
|------|----------|-------------|------|
| 팀 state.json 없음 | `STATE_FILE_NOT_FOUND` | "{팀명} 상태를 불러올 수 없습니다" | 해당 팀 카드에 회색 "오프라인" 표시 |
| state.json 파싱 실패 | `STATE_PARSE_ERROR` | "{팀명} 데이터 형식 오류" | 마지막 유효 상태 유지 + 경고 배지 |
| .pdca-status.json 없음 | `PDCA_NOT_FOUND` | "PDCA 상태를 불러올 수 없습니다" | PDCA 패널에 "데이터 없음" 표시 |
| API 타임아웃 (>10초) | `API_TIMEOUT` | "데이터 갱신 지연 중..." | LIVE → stale 전환, 재시도 |
| 인증 실패 | `UNAUTHORIZED` | "접근 권한이 없습니다" | 로그인 페이지로 리다이렉트 |
| comm.jsonl 쓰기 실패 | `LOG_WRITE_ERROR` | (내부 로그만) | 메모리에 버퍼링 후 재시도 |
| 슬랙 토큰 무효/만료 | `SLACK_AUTH_ERROR` | (내부 로그만) | 대시보드에 "슬랙 연결 끊김" 경고 배지 표시 |
| 슬랙 API Rate Limit | `SLACK_RATE_LIMIT` | (내부 로그만) | 5초 버퍼 큐잉 후 재시도 (최대 3회) |
| 슬랙 채널 ID 미설정 | `SLACK_CHANNEL_MISSING` | "{팀명} 슬랙 채널 미설정" | 해당 팀 알림 건너뛰고 로그 기록 |
| CEO User ID 미설정 | `SLACK_CEO_MISSING` | (내부 로그만) | CEO DM 건너뛰고 팀 채널만 전송 |

### 연결 상태 판단 기준

```
마지막 성공 응답 기준:
- < 10초: LIVE (초록)
- 10~30초: stale (주황)
- > 30초: disconnected (빨강)
```

---

## 5. 구현 순서

### Phase 1: MVP (구현 대상)

```
T1: 타입 정의
    파일: src/types/agent-dashboard.ts
    내용: 위 데이터 모델의 모든 인터페이스
    담당: backend-dev
    의존: 없음

T2: API Route — 대시보드 상태 조회
    파일: src/app/api/agent-dashboard/route.ts
    내용: GET /api/agent-dashboard (파일 읽기 + 집계)
    담당: backend-dev
    의존: T1

T3: API Route — 소통 로그 / 팀 상태 / 백그라운드 갱신
    파일: src/app/api/agent-dashboard/log/route.ts
          src/app/api/agent-dashboard/team/[teamId]/route.ts
          src/app/api/agent-dashboard/background/[taskId]/route.ts
    담당: backend-dev
    의존: T1

T4: 커스텀 훅 (useDashboardState)
    파일: src/app/(main)/admin/agent-dashboard/components/useDashboardState.ts
    내용: 5초 폴링, connection 상태 판단, deep compare
    담당: frontend-dev
    의존: T1

T5: 조직도 + 헤더 컴포넌트
    파일: OrgChart.tsx, DashboardHeader.tsx
    내용: 정적 조직도 렌더링, LIVE 인디케이터
    담당: frontend-dev
    의존: T4

T6: 팀 카드 컴포넌트
    파일: TeamCard.tsx, TeamMemberChip.tsx, TaskList.tsx
    내용: 팀별 카드 (멤버 칩 + TASK 목록)
    담당: frontend-dev
    의존: T4

T7: 소통 로그 + 백그라운드 + PDCA 패널
    파일: CommLogPanel.tsx, BackgroundPanel.tsx, PdcaStatusPanel.tsx
    내용: 소통 로그 표시, 진행 바, PDCA 요약
    담당: frontend-dev
    의존: T4

T8: 메인 페이지 조립
    파일: src/app/(main)/admin/agent-dashboard/page.tsx
    내용: 그리드 레이아웃 + 전체 컴포넌트 조합
    담당: frontend-dev
    의존: T5, T6, T7

T9: 사이드바 메뉴 추가
    파일: src/components/DashboardSidebar.tsx (기존 파일 최소 수정)
    내용: "에이전트 대시보드" 메뉴 항목 추가
    담당: frontend-dev
    의존: T8

T10: bkit Hook — state.json 자동 갱신
    파일: .claude/hooks/agent-state-sync.sh
    내용: TaskCompleted 이벤트 시 /tmp/cross-team/{team}/state.json 갱신
    담당: backend-dev
    의존: T2

T11: 슬랙 알림 서비스 모듈
    파일: src/lib/slack-notifier.ts
    내용: @slack/web-api 연동, Block Kit 메시지 빌더, sendSlackNotification()
    환경변수: SLACK_BOT_TOKEN, SLACK_CHANNEL_PM, SLACK_CHANNEL_MARKETING,
              SLACK_CHANNEL_CTO, SLACK_CEO_USER_ID
    담당: backend-dev
    의존: T1

T12: 체인 전달 감지 + 슬랙 API Route
    파일: src/lib/chain-detector.ts
          src/app/api/agent-dashboard/slack/notify/route.ts
    내용: 체인 규칙(PM→CTO→마케팅), 상태 변경 감지, POST /slack/notify API
    담당: backend-dev
    의존: T11

T13: bkit Hook — 슬랙 알림 트리거
    파일: .claude/hooks/agent-slack-notify.sh
    내용: TaskCompleted 이벤트 시 /api/agent-dashboard/slack/notify 호출
          (task.completed + chain.handoff 자동 감지)
    담당: backend-dev
    의존: T12, T10
```

### 의존성 그래프

```
T1 ──→ T2 ──→ T10 ──→ T13
  │──→ T3              ↑
  │──→ T4 ──→ T5 ──→ T8 ──→ T9
  │       ──→ T6 ──↗
  │       ──→ T7 ──↗
  │──→ T11 ──→ T12 ──→ T13
```

### 병렬 위임 계획

```
Wave 1: T1 (backend-dev) — 타입 정의
Wave 2: T2 + T3 + T11 (backend-dev) | T4 (frontend-dev) — 병렬
Wave 3: T5 + T6 + T7 (frontend-dev) | T10 + T12 (backend-dev) — 병렬
Wave 4: T8 + T9 (frontend-dev) | T13 (backend-dev) — 병렬
Wave 5: QA (qa-engineer) — 대시보드 + 슬랙 알림 통합 검증
```

---

## 6. 디자인 시스템 적용

### 색상 (라이트모드 — CLAUDE.md 규칙)

| 용도 | 색상 | 코드 |
|------|------|------|
| Primary (강조) | 빨강 | #F75D5D |
| Primary Hover | 진한 빨강 | #E54949 |
| PM팀 | 보라 | #8B5CF6 |
| 마케팅팀 | 주황 | #F59E0B |
| CTO팀 | 인디고 | #6366F1 |
| 배경 | 흰색 | #FFFFFF |
| 카드 배경 | 연한 회색 | #F8FAFC |
| 텍스트 | 검정 | #0F172A |
| 보조 텍스트 | 회색 | #64748B |
| 성공/완료 | 초록 | #10B981 |
| 경고/stale | 주황 | #F59E0B |
| 에러/disconnected | 빨강 | #EF4444 |

### 모델 칩 색상

| 모델 | 배경색 | 텍스트 |
|------|-------|--------|
| opus | #F75D5D (Primary) | white |
| sonnet | #6366F1 | white |
| haiku | #10B981 | white |

### 폰트
- 기본: Pretendard
- 수치/코드: JetBrains Mono (또는 시스템 모노스페이스)

---

---

## 7. 환경변수 (슬랙)

```env
# .env.local에 추가
SLACK_BOT_TOKEN=xoxb-...           # 슬랙 봇 토큰 (chat:write, im:write 스코프)
SLACK_CHANNEL_PM=C0XXXXXXXX        # #agent-pm 채널 ID
SLACK_CHANNEL_MARKETING=C0XXXXXXXX # #agent-marketing 채널 ID
SLACK_CHANNEL_CTO=C0XXXXXXXX       # #agent-cto 채널 ID
SLACK_CEO_USER_ID=U0XXXXXXXX       # Smith님 Slack User ID
```

### 필요 패키지

```bash
npm install @slack/web-api
```

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 에이전트 대시보드 설계 (슬랙 알림 포함) |
| **작성일** | 2026-03-24 |
| **TASK 수** | 13개 (T1~T13) |
| **예상 파일** | 타입 1개 + API 5개 + 컴포넌트 8개 + 슬랙 모듈 2개 + 훅 2개 + 페이지 1개 |

| 관점 | 내용 |
|------|------|
| **문제** | 정적 목업 + 알림 없음 → CEO가 대시보드를 상시 확인해야 함 |
| **해결** | 실시간 대시보드 + 슬랙 푸시로 능동적 정보 전달 |
| **기능 UX 효과** | 대시보드 5초 갱신 + 슬랙으로 체인 전달/에러/배포 즉시 인지 |
| **핵심 가치** | CEO가 슬랙만 봐도 3팀 운영 흐름 파악, 대시보드는 상세 확인용 |
