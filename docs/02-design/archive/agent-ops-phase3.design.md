# Agent Ops Phase 3 설계서 — 웹 터미널 대시보드

> **작성일**: 2026-03-25
> **작성자**: 설계 담당
> **Plan 참조**: `docs/01-plan/features/agent-ops-platform.plan.md` (Phase 3: P3-1 ~ P3-6)
> **기존 설계 참조**: `docs/02-design/features/web-terminal-dashboard.design.md`
> **대시보드 참조**: `docs/02-design/features/agent-dashboard.design.md`
> **슬랙 참조**: `docs/02-design/features/slack-notification.design.md`
> **기존 타입**: `src/types/web-terminal.ts`, `src/types/agent-dashboard.ts`
> **기존 구현**: `scripts/terminal-ws-server.mjs`

---

## 개요

Smith님이 브라우저에서 3개 에이전트팀(CTO, PM, 마케팅)의 tmux 세션을 실시간 모니터링하고, 직접 명령을 입력하며, 슬랙 알림 로그와 idle/체인 상태를 한 화면에서 확인할 수 있는 웹 터미널 대시보드다.

**기존 `web-terminal-dashboard.design.md`와의 관계**: 기존 설계서가 전체 구조와 컴포넌트 스케치를 정의했다면, 본 문서는 **구현 수준의 상세 명세**를 제공한다. xterm.js 설정값, WebSocket 메시지 프로토콜 JSON 스키마, tmux capture-pane 파싱 로직, PM2 설정, 위험 명령 패턴 목록 등을 구체적으로 정의한다.

---

## 1. 데이터 모델

### 1.1 타입 정의 (`src/types/web-terminal.ts`)

기존 타입 파일이 이미 구현되어 있다. 아래는 현재 정의된 전체 타입과 Phase 3에서 추가/변경이 필요한 항목이다.

#### 기존 타입 (변경 없음)

```typescript
// src/types/web-terminal.ts (현재 구현 상태 그대로)

import type { TeamId } from './agent-dashboard';

/** 터미널 세션 식별자 */
export type TerminalSessionId = 'cto' | 'pm' | 'marketing';

/** 터미널 세션 연결 상태 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/** 터미널 세션 설정 */
export interface TerminalSession {
  id: TerminalSessionId;
  tmuxSession: string;       // 실제 tmux 세션명: 'sdk-cto', 'sdk-pm', 'sdk-mkt'
  displayName: string;       // 'CTO팀', 'PM팀', '마케팅팀'
  emoji: string;
  color: string;             // 팀 대표 색상
  status: ConnectionStatus;
  lastOutput: string;        // 마지막 출력 라인 (사이드바 미리보기용)
  lastOutputAt: string;      // ISO 8601
  bufferSize: number;        // 현재 스크롤백 버퍼 줄 수
}

/** 세션 설정 상수 (서버 + 클라이언트 공유) */
export const TERMINAL_SESSIONS: Record<TerminalSessionId, {
  tmuxSession: string;
  displayName: string;
  emoji: string;
  color: string;
  teamId: TeamId;
}> = {
  cto:       { tmuxSession: 'sdk-cto',  displayName: 'CTO팀',   emoji: '⚙️',  color: '#10b981', teamId: 'cto' },
  pm:        { tmuxSession: 'sdk-pm',   displayName: 'PM팀',    emoji: '📋', color: '#8b5cf6', teamId: 'pm' },
  marketing: { tmuxSession: 'sdk-mkt',  displayName: '마케팅팀', emoji: '📊', color: '#f59e0b', teamId: 'marketing' },
};
```

#### Phase 3 추가 타입 (P3-6: idle/체인 상태)

```typescript
// src/types/web-terminal.ts 에 추가

/** idle 팀 상태 (idle-detector 연동) */
export interface IdleTeamStatus {
  teamId: TeamId;
  isIdle: boolean;
  idleSince?: string;          // ISO 8601. idle 시작 시각
  idleDurationMinutes?: number; // 현재 idle 지속 시간 (분)
  lastActivityAt: string;      // 마지막 활동 시각
}

/** 체인 상태 (chain-watcher 연동) */
export interface ChainStatus {
  fromTeam: TeamId;
  toTeam: TeamId;
  event: string;              // 'plan.completed', 'implementation.completed' 등
  action: string;             // '구현 착수 필요', '검증 착수 필요' 등
  triggeredAt: string;        // ISO 8601
  acknowledged: boolean;      // 수신 팀이 확인했는지
}

/** WebSocket idle/체인 상태 업데이트 메시지 (서버 -> 클라이언트) */
export interface WsIdleUpdate {
  type: 'idle.update';
  teams: IdleTeamStatus[];
}

export interface WsChainUpdate {
  type: 'chain.update';
  chains: ChainStatus[];
}

/** 기존 WsServerMessage 유니온에 추가 */
export type WsServerMessage =
  | WsTerminalOutput
  | WsSessionStatus
  | WsSessionHistory
  | WsError
  | WsInputBlocked
  | WsIdleUpdate       // 추가
  | WsChainUpdate;     // 추가
```

### 1.2 WebSocket 메시지 프로토콜 (JSON 스키마)

#### 서버 -> 클라이언트 메시지

| type | 설명 | 전송 시점 | 페이로드 |
|------|------|----------|---------|
| `terminal.output` | 터미널 출력 diff | 100ms 폴링에서 변경 감지 시 | `{ sessionId, data, timestamp }` |
| `session.status` | 3팀 세션 상태 | 연결 직후 + 5초마다 | `{ sessions: [...] }` |
| `session.history` | 전체 스크롤백 버퍼 | 세션 전환 시 | `{ sessionId, data, lineCount }` |
| `error` | 에러 | 에러 발생 시 | `{ code, message, sessionId? }` |
| `input.blocked` | 위험 명령 차단 | 입력 차단 시 | `{ sessionId, input, reason }` |
| `idle.update` | idle 팀 상태 | 10초마다 | `{ teams: [IdleTeamStatus...] }` |
| `chain.update` | 체인 전달 상태 | 체인 이벤트 발생 시 | `{ chains: [ChainStatus...] }` |

#### 클라이언트 -> 서버 메시지

| type | 설명 | 페이로드 |
|------|------|---------|
| `terminal.input` | 명령 입력 전달 | `{ sessionId, data, sendEnter? }` |
| `subscribe` | 세션 구독 전환 | `{ sessionId }` |
| `request.history` | 히스토리 요청 | `{ sessionId, lines? }` |

#### JSON 스키마 예시

**`terminal.output` (서버 -> 클라이언트)**:
```json
{
  "type": "terminal.output",
  "sessionId": "cto",
  "data": "[32m✓[0m TypeScript 컴파일 완료 (0 에러)\n",
  "timestamp": "2026-03-25T14:30:15.123+09:00"
}
```

**`session.status` (서버 -> 클라이언트)**:
```json
{
  "type": "session.status",
  "sessions": [
    {
      "id": "cto",
      "status": "connected",
      "lastOutput": "✓ npm run build 성공",
      "lastOutputAt": "2026-03-25T14:30:10+09:00"
    },
    {
      "id": "pm",
      "status": "disconnected",
      "lastOutput": "",
      "lastOutputAt": ""
    },
    {
      "id": "marketing",
      "status": "connected",
      "lastOutput": "T1 분석 진행 중...",
      "lastOutputAt": "2026-03-25T14:29:55+09:00"
    }
  ]
}
```

**`session.history` (서버 -> 클라이언트)**:
```json
{
  "type": "session.history",
  "sessionId": "cto",
  "data": "... (최대 1000줄의 스크롤백 버퍼, ANSI escape 포함) ...",
  "lineCount": 847
}
```

**`input.blocked` (서버 -> 클라이언트)**:
```json
{
  "type": "input.blocked",
  "sessionId": "cto",
  "input": "rm -rf /tmp/cross-team",
  "reason": "위험 명령 감지: rm -rf / rm --force"
}
```

**`idle.update` (서버 -> 클라이언트)**:
```json
{
  "type": "idle.update",
  "teams": [
    {
      "teamId": "pm",
      "isIdle": true,
      "idleSince": "2026-03-25T14:25:00+09:00",
      "idleDurationMinutes": 5,
      "lastActivityAt": "2026-03-25T14:25:00+09:00"
    },
    {
      "teamId": "cto",
      "isIdle": false,
      "lastActivityAt": "2026-03-25T14:30:10+09:00"
    },
    {
      "teamId": "marketing",
      "isIdle": false,
      "lastActivityAt": "2026-03-25T14:29:55+09:00"
    }
  ]
}
```

**`chain.update` (서버 -> 클라이언트)**:
```json
{
  "type": "chain.update",
  "chains": [
    {
      "fromTeam": "pm",
      "toTeam": "cto",
      "event": "plan.completed",
      "action": "구현 착수 필요",
      "triggeredAt": "2026-03-25T14:20:00+09:00",
      "acknowledged": false
    }
  ]
}
```

**`terminal.input` (클라이언트 -> 서버)**:
```json
{
  "type": "terminal.input",
  "sessionId": "cto",
  "data": "npm run build",
  "sendEnter": true
}
```

**`subscribe` (클라이언트 -> 서버)**:
```json
{
  "type": "subscribe",
  "sessionId": "pm"
}
```

**`request.history` (클라이언트 -> 서버)**:
```json
{
  "type": "request.history",
  "sessionId": "cto",
  "lines": 1000
}
```

### 1.3 위험 명령 패턴 (BLOCKED_PATTERNS)

기존 `scripts/terminal-ws-server.mjs`에 구현되어 있다. 전체 패턴 목록:

| # | 정규식 | 라벨 | 차단 대상 예시 |
|---|--------|------|-------------|
| 1 | `rm\s+(-[rRf]+\s+\|--recursive\|--force)` | `rm -rf / rm --force` | `rm -rf /`, `rm --force file.txt` |
| 2 | `git\s+push\s+--force` | `git push --force` | `git push --force origin main` |
| 3 | `git\s+reset\s+--hard` | `git reset --hard` | `git reset --hard HEAD~3` |
| 4 | `DROP\s+(TABLE\|DATABASE\|SCHEMA)` | `DROP TABLE/DATABASE` | `DROP TABLE users;` |
| 5 | `TRUNCATE\s+` | `TRUNCATE` | `TRUNCATE TABLE logs;` |
| 6 | `DELETE\s+FROM\s+\w+\s*(;\|\s*$)` | `DELETE FROM (조건 없음)` | `DELETE FROM users;` |
| 7 | `:\(\)\s*\{\s*:\|:&\s*\};:` | `fork bomb` | `:(){ :\|:& };:` |
| 8 | `mkfs\.` | `mkfs (디스크 포맷)` | `mkfs.ext4 /dev/sda1` |
| 9 | `dd\s+if=` | `dd (디스크 덮어쓰기)` | `dd if=/dev/zero of=/dev/sda` |
| 10 | `>\s*\/dev\/sd` | `/dev/sd 덮어쓰기` | `echo "" > /dev/sda` |

**차단 동작**: 패턴 매칭 시 `input.blocked` 메시지를 클라이언트에 반환하고, `tmux send-keys`를 실행하지 않는다. 모든 입력(차단 여부 무관)은 `gs://bscamp-storage/agent-ops/terminal/input.log`에 JSON 형태로 기록한다(`@google-cloud/storage` 라이브러리로 append).

### 1.4 히스토리 저장 구조

```
gs://bscamp-storage/agent-ops/terminal/
├── input.log               ← 모든 입력 로그 (append-only, JSONL) — GCS에 gsutil/라이브러리로 append
└── (향후 확장) session-snapshots/
    ├── cto-{timestamp}.txt     ← 세션 스냅샷 (Phase 4에서 영구 저장)
    ├── pm-{timestamp}.txt
    └── marketing-{timestamp}.txt
```

> **GCS 접근**: 로컬 맥의 WS 서버에서 `@google-cloud/storage` 라이브러리 또는 `gsutil cp`로 읽기/쓰기. Vercel API Route에서는 `@google-cloud/storage`로 읽기.

**input.log 엔트리 형식**:
```json
{
  "time": "2026-03-25T14:30:15.123+09:00",
  "sessionId": "cto",
  "input": "npm run build",
  "blocked": false
}
```

---

## 2. API 설계

### 2.1 REST API (Next.js Route Handlers)

HTTP REST API는 WebSocket 연결이 불가능한 환경을 위한 fallback으로, 이미 구현되어 있다.

#### `GET /api/terminal/sessions`

**파일**: `src/app/api/terminal/sessions/route.ts`

**인증**: `requireAdmin()` (기존 `src/app/api/admin/_shared.ts`)

**응답 스키마**:
```typescript
interface TerminalSessionsResponse {
  ok: true;
  sessions: {
    id: TerminalSessionId;
    tmuxSession: string;
    displayName: string;
    emoji: string;
    color: string;
    exists: boolean;          // tmux has-session 결과
    attached: boolean;        // tmux list-sessions로 attached 여부 확인
    lastActivity: string;     // ISO 8601 (session_activity)
  }[];
  wsUrl: string;              // 'ws://localhost:3001'
}
```

**동작**:
```
1. requireAdmin() — admin 역할 확인
2. execSync('tmux list-sessions -F "#{session_name}:#{session_attached}:#{session_activity}"')
3. 3개 세션(sdk-cto, sdk-pm, sdk-mkt) 매칭
4. 응답 조립
```

#### `POST /api/terminal/sessions/[id]/input`

**파일**: `src/app/api/terminal/sessions/[id]/input/route.ts`

**인증**: `requireAdmin()`

**요청 스키마**:
```typescript
interface TerminalInputRequest {
  data: string;              // 입력 텍스트 (최대 1000자)
  sendEnter?: boolean;       // Enter 전송 여부 (기본: true)
}
```

**응답 스키마**:
```typescript
// 성공
{ ok: true, sessionId: 'cto' }

// 차단
{ ok: false, error: 'INPUT_BLOCKED', reason: '위험 명령 감지: rm -rf' }

// 세션 없음
{ ok: false, error: 'SESSION_NOT_FOUND', message: 'tmux 세션 sdk-cto가 존재하지 않습니다' }
```

**동작**:
```
1. requireAdmin()
2. id 파라미터 검증 (cto | pm | marketing)
3. data 검증 (비어있지 않음, 최대 1000자)
4. BLOCKED_PATTERNS 검사
5. tmux has-session 확인
6. tmux send-keys -t {session} "{escaped}" [Enter]
7. input.log에 기록
```

#### `GET /api/terminal/sessions/[id]/history`

**파일**: `src/app/api/terminal/sessions/[id]/history/route.ts`

**인증**: `requireAdmin()`

**Query 파라미터**: `?lines=1000` (기본값: 1000, 최대: 5000)

**응답 스키마**:
```typescript
interface TerminalHistoryResponse {
  ok: true;
  sessionId: TerminalSessionId;
  data: string;              // 전체 출력 텍스트 (ANSI escape 포함)
  lineCount: number;
  capturedAt: string;        // ISO 8601
}
```

**동작**:
```
1. requireAdmin()
2. id 파라미터 검증
3. lines 파라미터 파싱 (기본 1000, 최대 5000)
4. tmux capture-pane -t {session} -p -S -{lines}
5. 응답 조립
```

#### `GET /api/terminal/slack-log`

**파일**: `src/app/api/terminal/slack-log/route.ts`

**인증**: `requireAdmin()`

**Query 파라미터**: `?limit=20` (기본값: 20, 최대: 100)

**응답 스키마**:
```typescript
interface SlackLogResponse {
  ok: true;
  logs: {
    event: string;           // SlackEventType
    team: TeamId;
    title: string;
    message: string;
    sentAt: string;           // ISO 8601
    status: 'sent' | 'failed';
  }[];
}
```

**동작**:
```
1. requireAdmin()
2. gs://bscamp-storage/agent-ops/slack/queue.jsonl 읽기 (@google-cloud/storage)
3. 마지막 N줄 파싱 (JSONL → 배열)
4. 역순 정렬 (최신순)
5. 응답 조립
```

### 2.2 WebSocket 서버 (`scripts/terminal-ws-server.mjs`)

기존 구현이 완료되어 있다. 아래는 구현 수준의 상세 설계다.

#### 서버 설정

| 항목 | 환경변수 | 기본값 | 설명 |
|------|---------|--------|------|
| 포트 | `TERMINAL_WS_PORT` | `3001` | WebSocket 리슨 포트 |
| 폴링 간격 | `TERMINAL_POLL_INTERVAL` | `100` (ms) | tmux capture-pane 실행 주기 |
| 스크롤백 | `TERMINAL_SCROLLBACK` | `1000` (줄) | capture-pane -S 파라미터 |
| JWT 시크릿 | `SUPABASE_JWT_SECRET` | (필수) | JWT 토큰 검증용. 미설정 시 개발 모드 (인증 우회) |

#### 연결 핸드셰이크 (JWT 인증)

```
클라이언트                    서버
    |                          |
    |-- ws://localhost:3001    |
    |   ?token={jwt}           |
    |                          |
    |   [1] URL에서 token 추출  |
    |   [2] jwt.verify(token,  |
    |       SUPABASE_JWT_SECRET)|
    |   [3] role === 'admin'   |
    |       확인                |
    |                          |
    |<-- [성공] session.status  |
    |    (3팀 상태 전송)         |
    |<-- session.history       |
    |    (기본 세션 cto 히스토리) |
    |                          |
    |   [실패: JWT 무효]         |
    |<-- close(4001,           |
    |    'Unauthorized')       |
    |                          |
    |   [실패: role !== admin]  |
    |<-- close(4003,           |
    |    'Forbidden')          |
```

**JWT 검증 로직 (`verifyToken` 함수)**:
```javascript
function verifyToken(token) {
  if (!JWT_SECRET) {
    // 개발 환경: JWT_SECRET 미설정 시 경고 후 허용
    console.warn('[터미널] 경고: JWT_SECRET 미설정. 개발 환경에서만 허용.');
    return { uid: 'dev', role: 'admin' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Supabase JWT 구조: app_metadata.role 또는 user_metadata.role
    const role =
      decoded?.app_metadata?.role ??
      decoded?.user_metadata?.role ??
      decoded?.role ??
      'unknown';
    return { uid: decoded.sub, role };
  } catch {
    return null; // 검증 실패
  }
}
```

#### tmux capture-pane 폴링 로직 (100ms 간격)

```
setInterval(() => {
  for each session in [sdk-cto, sdk-pm, sdk-mkt]:
    ┌─────────────────────────────────────────────┐
    │ 1. execFileSync('tmux', ['capture-pane',    │
    │    '-t', session, '-p', '-S', '-1000'])      │
    │    → timeout: 3000ms                         │
    │                                              │
    │ 2. capturePane 실패 시 → skip (다음 폴링)     │
    │                                              │
    │ 3. curr === previousOutput[session] 이면     │
    │    → skip (변경 없음)                         │
    │                                              │
    │ 4. diff = computeDiff(prev, curr)            │
    │    → 줄 단위 비교, 새 줄만 추출               │
    │                                              │
    │ 5. previousOutput[session] = curr            │
    │                                              │
    │ 6. diff.trim() === '' 이면 → skip            │
    │                                              │
    │ 7. broadcastToSession(sessionId, {           │
    │      type: 'terminal.output',                │
    │      sessionId, data: diff, timestamp        │
    │    })                                        │
    │    → 해당 세션을 구독 중인 클라이언트에만 전송  │
    └─────────────────────────────────────────────┘
}, 100ms);
```

**diff 알고리즘 (`computeDiff` 함수)**:

```javascript
function computeDiff(prev, curr) {
  // prev가 없으면 전체 curr 반환 (최초 캡처)
  if (!prev) return curr;

  const prevLines = prev.split('\n');
  const currLines = curr.split('\n');

  // 이전 출력의 마지막 20줄을 기준으로 매칭 포인트 검색
  // tmux capture-pane은 전체 버퍼를 반환하므로,
  // 이전 출력 말미와 현재 출력을 비교하여 새로 추가된 줄만 추출
  const prevTail = prevLines.slice(-20);
  let matchStart = 0;

  for (let i = 0; i < currLines.length; i++) {
    const slice = currLines.slice(i, i + prevTail.length);
    if (slice.join('\n') === prevTail.join('\n')) {
      matchStart = i + prevTail.length;
      break;
    }
  }

  return currLines.slice(matchStart).join('\n');
}
```

**설계 근거**:
- `prevTail`을 20줄로 제한하는 이유: 전체 버퍼(1000줄) 비교는 CPU 낭비. 20줄이면 충분한 유니크성 보장.
- 매칭 실패 시 `matchStart = 0`이므로 전체 curr 반환. 약간의 중복은 xterm.js가 자동 처리.
- `execFileSync` 사용 이유: `execSync`와 달리 shell injection 방지. tmux 인자를 배열로 전달.

#### 세션 전환 프로토콜

```
클라이언트                        서버
    |                              |
    |  [사용자가 PM팀 탭 클릭]       |
    |                              |
    |-- { type: 'subscribe',       |
    |    sessionId: 'pm' }         |
    |                              |
    |   [ws._subscribedSession     |
    |    = 'pm' 으로 변경]          |
    |                              |
    |-- { type: 'request.history', |
    |    sessionId: 'pm',          |
    |    lines: 1000 }             |
    |                              |
    |   [tmux capture-pane         |
    |    -t sdk-pm -p -S -1000]    |
    |                              |
    |<-- { type: 'session.history',|
    |     sessionId: 'pm',         |
    |     data: '...', lineCount } |
    |                              |
    |   [이후 pm 세션의 terminal.   |
    |    output만 수신]             |
```

**클라이언트 측 처리 (`useTerminalSession` hook)**:
1. `switchSession(id)` 호출
2. xterm 터미널 `clear()` 후 새 세션 히스토리로 교체
3. `subscribe` + `request.history` 메시지 동시 전송
4. 이전 세션의 출력은 메모리 버퍼(`termBuffers.current[id]`)에 유지 (탭 재전환 시 즉시 복원)

#### 연결 해제/재연결 처리

```
[연결 끊김 감지]
    |
    ├── close code === 4001 (인증 실패)
    │   └── 재연결 하지 않음
    │       → connectionStatus = 'error'
    │       → UI에 "인증 실패. 다시 로그인해주세요." 표시
    │
    ├── close code === 4003 (권한 없음)
    │   └── 재연결 하지 않음
    │       → connectionStatus = 'error'
    │       → UI에 "admin 권한이 필요합니다." 표시
    │
    └── 기타 (네트워크 끊김, 서버 재시작 등)
        └── 자동 재연결 시도
            → retryInterval: 5000ms (5초)
            → maxRetries: 10
            → 재연결 시마다 retryCount 증가
            → UI에 "연결이 끊어졌습니다. 재연결 중... (3/10)" 표시
            → maxRetries 초과 시 connectionStatus = 'disconnected'
```

#### PM2 관리 설정

```javascript
// ecosystem.config.cjs (프로젝트 루트에 생성)

module.exports = {
  apps: [
    {
      name: 'terminal-ws',
      script: 'scripts/terminal-ws-server.mjs',
      interpreter: 'node',
      instances: 1,                    // 단일 인스턴스 (WebSocket은 sticky 필요)
      autorestart: true,               // 크래시 시 자동 재시작
      max_restarts: 10,                // 최대 재시작 횟수 (연속)
      min_uptime: '10s',               // 10초 이내 재시작되면 에러로 간주
      restart_delay: 2000,             // 재시작 딜레이 2초
      watch: false,                    // 파일 감시 끔 (수동 재시작만)
      max_memory_restart: '200M',      // 메모리 200MB 초과 시 재시작
      env: {
        NODE_ENV: 'production',
        TERMINAL_WS_PORT: 3001,
        TERMINAL_POLL_INTERVAL: 100,
        TERMINAL_SCROLLBACK: 1000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/terminal-ws-error.log',   // 로컬 맥 WS 서버 로그 (GCS 불필요, 로컬 유지)
      out_file: './logs/terminal-ws-out.log',       // 로컬 맥 WS 서버 로그 (GCS 불필요, 로컬 유지)
      merge_logs: true,
      log_type: 'json',
    },
  ],
};
```

**PM2 운영 명령어**:
```bash
# 시작
pm2 start ecosystem.config.cjs

# 상태 확인
pm2 status terminal-ws

# 로그 확인
pm2 logs terminal-ws --lines 50

# 재시작
pm2 restart terminal-ws

# 중지 + 삭제
pm2 stop terminal-ws && pm2 delete terminal-ws
```

---

## 3. 컴포넌트 구조

### 3.1 터미널 페이지 (`/admin/terminal`)

```
src/app/(main)/admin/terminal/
├── page.tsx                          서버 컴포넌트 (auth 확인, JWT 전달)
├── terminal-client.tsx               'use client' 메인 클라이언트 (상태 오케스트레이션)
├── components/
│   ├── TerminalSidebar.tsx           좌측 사이드바 컨테이너
│   │   (SessionTab + SlackAlertLog + IdleIndicator 조합)
│   ├── SessionTab.tsx                개별 세션 탭 (클릭 전환, 상태 표시)
│   ├── SlackAlertLog.tsx             슬랙 알림 로그 패널
│   ├── TerminalView.tsx              메인 터미널 영역 컨테이너
│   ├── XtermRenderer.tsx             xterm.js 래퍼 (dynamic import, SSR 불가)
│   ├── InputBar.tsx                  하단 입력 바 + 위험 명령 필터링 UI
│   ├── StatusBar.tsx                 하단 상태 바 (연결, 버퍼, 지연)
│   ├── ConnectionIndicator.tsx       LIVE/RECONNECTING/DISCONNECTED 표시
│   ├── IdleIndicator.tsx             [P3-6 신규] idle 팀 경고 배지
│   └── ChainStatusBadge.tsx          [P3-6 신규] 체인 상태 배지
└── hooks/
    ├── useTerminalWebSocket.ts       WebSocket 연결/재연결/메시지 처리
    ├── useTerminalSession.ts         세션 전환/히스토리/버퍼 관리
    └── useSlackLog.ts                [P3-5 신규] 슬랙 로그 폴링
```

### 3.2 `page.tsx` (서버 컴포넌트)

```typescript
// src/app/(main)/admin/terminal/page.tsx

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import TerminalClient from './terminal-client';

export const metadata = {
  title: '웹 터미널 | 관리자',
};

export default async function TerminalPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // admin 역할 확인
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'admin') redirect('/dashboard');

  // JWT 토큰 (WebSocket 인증용)
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';

  return <TerminalClient token={token} />;
}
```

### 3.3 컴포넌트 상세 (10개)

#### `terminal-client.tsx` (메인 클라이언트)

**역할**: 전체 상태 오케스트레이션. WebSocket hook과 Session hook을 연결하고, 하위 컴포넌트에 props 배분.

**상태 관리**:
```typescript
// terminal-client.tsx 핵심 구조
'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useCallback } from 'react';
import { useTerminalWebSocket } from './hooks/useTerminalWebSocket';
import { useTerminalSession } from './hooks/useTerminalSession';

const XtermRenderer = dynamic(
  () => import('./components/XtermRenderer'),
  { ssr: false, loading: () => <div className="...">터미널 로딩 중...</div> }
);

interface Props {
  token: string;
}

export default function TerminalClient({ token }: Props) {
  const { connectionStatus, send, lastMessage, retryCount } = useTerminalWebSocket({ token });
  const { activeSession, sessions, switchSession, handleMessage } = useTerminalSession(send);
  const xtermRef = useRef<XtermRendererHandle>(null);

  // WebSocket 메시지를 세션 hook으로 전달 + xterm에 출력
  useEffect(() => {
    if (!lastMessage) return;
    handleMessage(lastMessage);

    if (lastMessage.type === 'terminal.output' && lastMessage.sessionId === activeSession) {
      xtermRef.current?.write(lastMessage.data);
    }
    if (lastMessage.type === 'session.history' && lastMessage.sessionId === activeSession) {
      xtermRef.current?.clear();
      xtermRef.current?.write(lastMessage.data);
    }
  }, [lastMessage, activeSession, handleMessage]);

  // ... 레이아웃 렌더링
}
```

#### `XtermRenderer.tsx` (xterm.js 래퍼)

**xterm.js 설정값 (구체적 명세)**:

```typescript
const XTERM_OPTIONS: ITerminalOptions = {
  // ── 테마 (라이트 모드 전용, CLAUDE.md 규칙) ──
  theme: {
    background: '#ffffff',            // 흰색 배경
    foreground: '#1e1e1e',            // 어두운 텍스트
    cursor: '#F75D5D',                // Primary 색상 커서
    cursorAccent: '#ffffff',          // 커서 위 텍스트 색상
    selectionBackground: '#F75D5D33', // Primary 33% 투명도 선택 영역
    selectionForeground: undefined,   // 자동 (배경 대비)

    // ANSI 16색 (라이트 배경 가독성 최적화)
    black:        '#1e1e1e',
    red:          '#F75D5D',          // Primary
    green:        '#10b981',          // emerald-500
    yellow:       '#f59e0b',          // amber-500
    blue:         '#3b82f6',          // blue-500
    magenta:      '#8b5cf6',          // violet-500
    cyan:         '#06b6d4',          // cyan-500
    white:        '#f5f5f5',

    brightBlack:  '#6b7280',          // gray-500
    brightRed:    '#E54949',          // Primary hover
    brightGreen:  '#34d399',          // emerald-400
    brightYellow: '#fbbf24',          // amber-400
    brightBlue:   '#60a5fa',          // blue-400
    brightMagenta:'#a78bfa',          // violet-400
    brightCyan:   '#22d3ee',          // cyan-400
    brightWhite:  '#ffffff',
  },

  // ── 폰트 ──
  fontFamily: "'Pretendard', 'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 14,                       // 기본 폰트 크기
  lineHeight: 1.4,                    // 줄 높이 비율
  fontWeight: '400',                  // 일반 텍스트
  fontWeightBold: '700',              // 볼드 텍스트

  // ── 스크롤 ──
  scrollback: 1000,                   // 스크롤백 버퍼 줄 수
  scrollSensitivity: 1,               // 마우스 스크롤 감도

  // ── 커서 ──
  cursorBlink: true,                  // 커서 깜빡임
  cursorStyle: 'bar',                 // 'block' | 'underline' | 'bar'
  cursorWidth: 2,                     // bar 스타일 커서 폭 (px)
  cursorInactiveStyle: 'outline',     // 비활성 시 아웃라인

  // ── 기타 ──
  allowProposedApi: true,             // 실험적 API 허용 (addon 호환)
  convertEol: true,                   // \n을 \r\n으로 변환
  disableStdin: true,                 // 직접 키 입력 비활성화 (InputBar로 입력)
  drawBoldTextInBrightColors: false,  // 볼드를 밝은 색으로 바꾸지 않음
  rightClickSelectsWord: true,        // 우클릭으로 단어 선택
  screenReaderMode: false,            // 스크린 리더 모드 끔 (성능)
  smoothScrollDuration: 0,            // 부드러운 스크롤 비활성화 (성능)
};
```

**Addon 설정**:

| Addon | 버전 | 용도 | 설정 |
|-------|------|------|------|
| `@xterm/addon-fit` | ^0.10.x | 컨테이너 크기에 맞게 cols/rows 자동 조절 | `fitAddon.fit()` (mount + resize 시) |
| `@xterm/addon-web-links` | ^0.11.x | URL 클릭 시 새 탭 열기 | 기본 설정 (handler 없음) |

**컨테이너 스타일**:
```jsx
<div
  ref={containerRef}
  className="w-full h-full min-h-[400px] rounded-lg border border-gray-200 overflow-hidden"
  style={{ backgroundColor: '#ffffff' }}
/>
```

#### `SessionTab.tsx` (세션 탭)

**Props**:
```typescript
interface Props {
  id: TerminalSessionId;
  displayName: string;
  emoji: string;
  color: string;
  status: ConnectionStatus;
  taskSummary?: string;      // 'T3 진행중' (대시보드 state.json 연동)
  lastOutput?: string;       // 마지막 출력 미리보기 (truncate)
  isIdle?: boolean;          // [P3-6] idle 여부
  isActive: boolean;         // 현재 선택된 세션인지
  onClick: () => void;
}
```

**상태 인디케이터**:
```typescript
const STATUS_INDICATOR: Record<ConnectionStatus, { color: string; label: string }> = {
  connected:    { color: '#10b981', label: '연결됨' },    // emerald-500
  connecting:   { color: '#f59e0b', label: '연결 중...' }, // amber-500
  disconnected: { color: '#6b7280', label: '연결 끊김' },  // gray-500
  error:        { color: '#ef4444', label: '오류' },       // red-500
};
```

**idle 상태 시 스타일**: 배경에 `bg-amber-50` 적용, idle 경고 아이콘 표시.

**선택 상태 시 스타일**: 좌측 4px 보더 `#F75D5D`, 배경 `#F75D5D/10`.

#### `InputBar.tsx` (입력 바)

**Props**:
```typescript
interface Props {
  sessionId: TerminalSessionId;
  sessionName: string;
  connected: boolean;
  onSend: (input: string) => void;
}
```

**동작**:
1. 사용자가 텍스트 입력
2. Enter 키 또는 "전송" 버튼 클릭
3. `onSend(value)` 호출 -> `terminal-client.tsx`에서 WebSocket `terminal.input` 전송
4. 입력 필드 초기화

**위험 명령 필터링 UI**:
- 서버에서 `input.blocked` 메시지 수신 시 -> 토스트 알림 표시
- 토스트: 빨간 배경(`#F75D5D`), 흰 텍스트, 3초 후 자동 닫힘
- 메시지: "위험 명령이 감지되어 차단되었습니다: {reason}"

**비활성 상태**: `connected === false`일 때 입력 불가. placeholder "연결 끊김".

**버튼 스타일**:
```
bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-md
disabled:opacity-50 disabled:cursor-not-allowed
```

#### `StatusBar.tsx` (상태 바)

**표시 정보**:
```
⚙️ CTO팀 | sdk-cto | 연결됨 | 버퍼 847줄 | 지연 45ms
```

| 항목 | 소스 | 갱신 주기 |
|------|------|----------|
| 팀 이모지 + 이름 | `TERMINAL_SESSIONS[activeSession]` | 세션 전환 시 |
| tmux 세션명 | `TERMINAL_SESSIONS[activeSession].tmuxSession` | 세션 전환 시 |
| 연결 상태 | `connectionStatus` (useTerminalWebSocket) | 실시간 |
| 버퍼 줄 수 | `sessions[activeSession].bufferSize` | session.history 수신 시 |
| 지연 시간 | WebSocket ping-pong 측정 | 5초마다 |

#### `ConnectionIndicator.tsx` (연결 상태 표시)

**상태별 UI**:

| 상태 | 아이콘 | 텍스트 | 색상 |
|------|--------|--------|------|
| `connected` | 초록 점(●) 애니메이션(pulse) | `LIVE` | `#10b981` |
| `connecting` | 노란 점(●) 애니메이션(pulse) | `연결 중...` | `#f59e0b` |
| `disconnected` | 회색 점(○) | `재연결 중... (3/10)` | `#6b7280` |
| `error` | 빨간 점(●) | `연결 오류` | `#ef4444` |

#### `SlackAlertLog.tsx` (슬랙 로그 사이드바) — P3-5

**역할**: 사이드바 하단에 최근 슬랙 알림 로그를 시간순으로 표시.

**데이터 소스**: `GET /api/terminal/slack-log?limit=20` (10초 폴링)

**표시 형식**:
```
14:30  🔗 체인 전달: PM팀 → CTO팀
14:25  ✅ T2 구현 완료 (CTO팀)
14:10  🚀 T1 시작 (마케팅팀)
14:05  ⚠️ 빌드 실패 (CTO팀)          ← status: 'failed'면 빨간색
```

**이벤트별 이모지 매핑**:
```typescript
const EVENT_EMOJI: Record<string, string> = {
  'task.started':         '🚀',
  'task.completed':       '✅',
  'chain.handoff':        '🔗',
  'deploy.completed':     '🚢',
  'error.critical':       '🚨',
  'approval.needed':      '🔔',
  'pdca.phase_change':    '📊',
  'background.completed': '📦',
  'team.idle':            '💤',
  'team.recovered':       '🔄',
  'session.crashed':      '💥',
};
```

**`useSlackLog` hook**:
```typescript
// hooks/useSlackLog.ts

'use client';

import { useState, useEffect, useCallback } from 'react';
import type { SlackLogEntry } from '@/types/web-terminal';

interface UseSlackLogReturn {
  logs: SlackLogEntry[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSlackLog(limit: number = 20): UseSlackLogReturn {
  const [logs, setLogs] = useState<SlackLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/terminal/slack-log?limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.ok) {
        setLogs(data.logs);
        setError(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '로그 로드 실패');
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 10_000); // 10초 폴링
    return () => clearInterval(interval);
  }, [fetchLogs]);

  return { logs, isLoading, error, refresh: fetchLogs };
}
```

#### `IdleIndicator.tsx` (idle 팀 경고) — P3-6 신규

**역할**: 5분 이상 활동이 없는 팀에 대한 경고를 시각적으로 표시.

**데이터 소스**: WebSocket `idle.update` 메시지 (10초 간격)

**표시 위치**: SessionTab 내부 + 사이드바 상단 경고 배너

**UI 디자인**:
```typescript
interface Props {
  teamId: TeamId;
  isIdle: boolean;
  idleDurationMinutes?: number;
}

// idle 상태 시
// ┌──────────────────────────┐
// │ 💤 PM팀 유휴 (5분)       │
// │ 마지막 활동: 14:25        │
// └──────────────────────────┘

// 스타일
// 배경: bg-amber-50, 테두리: border-amber-200
// 텍스트: text-amber-700
// 5분 초과 시: bg-red-50, border-red-200, text-red-700
```

**경고 단계**:
| 시간 | 색상 | 라벨 |
|------|------|------|
| 0-5분 | 없음 (정상) | - |
| 5-10분 | amber (경고) | `💤 유휴 (N분)` |
| 10분+ | red (위험) | `🚨 장기 유휴 (N분)` |

#### `ChainStatusBadge.tsx` (체인 상태 배지) — P3-6 신규

**역할**: 팀 간 체인 전달이 발생했을 때 시각적 배지로 표시.

**데이터 소스**: WebSocket `chain.update` 메시지

**표시 위치**: SessionTab 내부 (해당 팀의 탭에)

**UI 디자인**:
```typescript
interface Props {
  chains: ChainStatus[];     // 해당 팀과 관련된 체인 목록
  teamId: TeamId;
}

// 체인 수신 팀 (대기 중)
// ┌───────────────────────┐
// │ 🔗 PM팀 → 구현 착수 필요 │
// └───────────────────────┘

// 스타일
// 배경: bg-blue-50, 테두리: border-blue-200
// 텍스트: text-blue-700
// acknowledged === false 면 펄스 애니메이션 (주의 환기)
```

#### `HistoryPanel.tsx` (선택적 확장)

Phase 3 기본 범위에서는 xterm.js 내장 스크롤백으로 히스토리를 제공한다. 별도의 HistoryPanel 컴포넌트는 Phase 4에서 검색 기능과 함께 추가할 수 있다.

### 3.4 Hook 상세 (3개)

#### `useTerminalWebSocket.ts`

**설정 옵션**:
```typescript
interface UseTerminalWebSocketOptions {
  token: string;             // Supabase JWT (서버 컴포넌트에서 전달)
  wsUrl?: string;            // 기본값: 'ws://localhost:3001'
  maxRetries?: number;       // 기본값: 10
  retryInterval?: number;    // 기본값: 5000 (ms)
}
```

**반환값**:
```typescript
interface UseTerminalWebSocketReturn {
  connectionStatus: ConnectionStatus;
  send: (msg: WsClientMessage) => void;
  lastMessage: WsServerMessage | null;
  retryCount: number;
}
```

**핵심 동작**:
1. 마운트 시 `connect()` 호출 -> WebSocket 연결 생성
2. `ws://localhost:3001?token={jwt}` 형태로 연결
3. `onopen`: `connectionStatus = 'connected'`, retryCount 리셋
4. `onmessage`: JSON 파싱 후 `lastMessage` 상태 업데이트
5. `onclose`: 코드에 따라 재연결 또는 에러 상태
6. 언마운트 시 WebSocket 연결 정리

**재연결 전략**:
- 재연결 간격: 5초 (고정)
- 최대 시도: 10회
- 인증 실패(4001) / 권한 없음(4003): 재연결 안 함
- retryCount를 UI에 노출 ("재연결 중... 3/10")

#### `useTerminalSession.ts`

**반환값**:
```typescript
interface UseTerminalSessionReturn {
  activeSession: TerminalSessionId;
  sessions: Record<TerminalSessionId, TerminalSession>;
  switchSession: (id: TerminalSessionId) => void;
  handleMessage: (msg: WsServerMessage) => void;
}
```

**핵심 동작**:
1. 초기 세션: `'cto'` (기본)
2. `switchSession(id)`: 활성 세션 변경 + `subscribe` + `request.history` 전송
3. `handleMessage`: 메시지 타입별 분기 처리
   - `terminal.output`: 해당 세션 버퍼에 추가, lastOutput 갱신
   - `session.status`: 3팀 상태 일괄 갱신
   - `session.history`: 전체 히스토리로 버퍼 교체, bufferSize 갱신
4. 세션별 버퍼(`termBuffers.current`): 탭 전환 시 이전 출력 유지

#### `useSlackLog.ts` — P3-5 신규

섹션 3.3 SlackAlertLog 참조. 10초 폴링으로 `/api/terminal/slack-log` 호출.

---

## 4. 에러 처리

### 4.1 에러 시나리오 + 사용자 피드백

| 상황 | 감지 방법 | 사용자 표시 (한국어) | 자동 복구 |
|------|----------|-------------------|----------|
| WebSocket 서버 미실행 | 연결 시 `onerror` | "WebSocket 서버에 연결할 수 없습니다 (localhost:3001)" | 5초 간격 재연결 (최대 10회) |
| WebSocket 끊김 | `onclose` 이벤트 | "연결이 끊어졌습니다. 재연결 중... (3/10)" | 5초 간격 재연결 |
| JWT 인증 실패 | 서버 `close(4001)` | "인증에 실패했습니다. 다시 로그인해주세요." [로그인 링크] | 없음 |
| admin 권한 없음 | 서버 `close(4003)` | "admin 권한이 필요합니다." | 없음 |
| tmux 세션 없음 | `tmux has-session` 실패 | "CTO팀 세션이 활성화되지 않았습니다" | 5초 간격 상태 체크 (session.status) |
| tmux capture-pane 실패 | `execFileSync` 예외 | 해당 세션 "캡처 오류" 표시 | 다음 폴링(100ms)에서 재시도 |
| tmux send-keys 실패 | `execFileSync` 예외 | "입력 전달에 실패했습니다" (토스트) | 없음 (사용자 재시도) |
| 위험 명령 차단 | `BLOCKED_PATTERNS` 매칭 | "위험 명령이 감지되어 차단되었습니다: {label}" (빨간 토스트) | 없음 (의도적 차단) |
| WS 서버 크래시 | PM2 감지 | "서버 재시작 중..." | PM2 `autorestart: true` |
| 슬랙 로그 API 실패 | fetch 에러 | "슬랙 로그를 불러올 수 없습니다" (회색 텍스트) | 10초 후 재폴링 |

### 4.2 에러 코드 정의

| 코드 | 의미 | HTTP 상태 | WS close 코드 |
|------|------|----------|--------------|
| `AUTH_FAILED` | JWT 무효 또는 만료 | 401 | 4001 |
| `FORBIDDEN` | admin 역할 아님 | 403 | 4003 |
| `SESSION_NOT_FOUND` | tmux 세션 없음 | 404 | - |
| `INPUT_BLOCKED` | 위험 명령 차단 | 400 | - |
| `SEND_FAILED` | tmux send-keys 실패 | 500 | - |
| `CAPTURE_FAILED` | tmux capture-pane 실패 | 500 | - |
| `INVALID_SESSION_ID` | 세션 ID 유효하지 않음 | 400 | - |
| `INPUT_TOO_LONG` | 입력 1000자 초과 | 400 | - |

### 4.3 토스트 알림 규칙

| 유형 | 배경색 | 지속 시간 | 예시 |
|------|--------|----------|------|
| 성공 | `bg-green-50`, `text-green-700` | 2초 | "입력이 전달되었습니다" (표시 안 함, 기본 동작이므로) |
| 경고 | `bg-amber-50`, `text-amber-700` | 3초 | "세션이 활성화되지 않았습니다" |
| 에러 | `bg-red-50`, `text-red-700` | 5초 | "위험 명령이 감지되어 차단되었습니다" |
| 차단 | `bg-[#F75D5D]`, `text-white` | 3초 | BLOCKED_PATTERNS 매칭 시 |

---

## 5. 구현 순서

### P3-1: WebSocket 서버 + tmux 연동

**이미 구현 완료** (`scripts/terminal-ws-server.mjs`). Phase 3에서 추가 작업:

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| P3-1-1 | WebSocket 서버 기본 구조 | `scripts/terminal-ws-server.mjs` | 완료 |
| P3-1-2 | JWT 인증 검증 | (P3-1-1에 포함) | 완료 |
| P3-1-3 | tmux capture-pane 폴링 | (P3-1-1에 포함) | 완료 |
| P3-1-4 | diff 알고리즘 | (P3-1-1에 포함) | 완료 |
| P3-1-5 | CORS 설정 | (P3-1-1에 포함) | 완료 |
| P3-1-6 | PM2 ecosystem 설정 | `ecosystem.config.cjs` | **미구현** |
| P3-1-7 | idle.update 메시지 추가 | `scripts/terminal-ws-server.mjs` | **미구현** (P3-6) |
| P3-1-8 | chain.update 메시지 추가 | `scripts/terminal-ws-server.mjs` | **미구현** (P3-6) |

### P3-2: xterm.js 터미널 페이지

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| P3-2-1 | 서버 컴포넌트 (page.tsx) | `src/app/(main)/admin/terminal/page.tsx` | 완료 |
| P3-2-2 | 클라이언트 컴포넌트 (terminal-client.tsx) | `src/app/(main)/admin/terminal/terminal-client.tsx` | 완료 |
| P3-2-3 | XtermRenderer (xterm.js 래퍼) | `components/XtermRenderer.tsx` | 완료 |
| P3-2-4 | TerminalView (메인 영역) | `components/TerminalView.tsx` | 완료 |
| P3-2-5 | TerminalSidebar (좌측 사이드바) | `components/TerminalSidebar.tsx` | 완료 |
| P3-2-6 | StatusBar (하단 상태 바) | `components/StatusBar.tsx` | 완료 |
| P3-2-7 | ConnectionIndicator | `components/ConnectionIndicator.tsx` | 완료 |

### P3-3: 세션 전환 + 히스토리

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| P3-3-1 | useTerminalWebSocket hook | `hooks/useTerminalWebSocket.ts` | 완료 |
| P3-3-2 | useTerminalSession hook | `hooks/useTerminalSession.ts` | 완료 |
| P3-3-3 | SessionTab 컴포넌트 | `components/SessionTab.tsx` | 완료 |
| P3-3-4 | 세션 전환 시 히스토리 로드 | (P3-3-2에 포함) | 완료 |
| P3-3-5 | 세션별 버퍼 유지 | (P3-3-2에 포함) | 완료 |

### P3-4: 입력 전달 + 위험 명령 필터링

| # | 작업 | 파일 | 상태 |
|---|------|------|------|
| P3-4-1 | InputBar 컴포넌트 | `components/InputBar.tsx` | 완료 |
| P3-4-2 | BLOCKED_PATTERNS 서버 필터링 | `scripts/terminal-ws-server.mjs` | 완료 |
| P3-4-3 | input.blocked 토스트 UI | `terminal-client.tsx` | **검증 필요** |
| P3-4-4 | 입력 로깅 (gs://bscamp-storage/agent-ops/terminal/input.log) | `scripts/terminal-ws-server.mjs` | 완료 |
| P3-4-5 | REST API fallback (POST /api/terminal/sessions/[id]/input) | `src/app/api/terminal/sessions/[id]/input/route.ts` | 완료 |

### P3-5: 슬랙 로그 사이드바 통합

| # | 작업 | 파일 | 상태 | 의존성 |
|---|------|------|------|--------|
| P3-5-1 | GET /api/terminal/slack-log API | `src/app/api/terminal/slack-log/route.ts` | 완료 | P2-5 |
| P3-5-2 | SlackAlertLog 컴포넌트 | `components/SlackAlertLog.tsx` | 완료 | P3-5-1 |
| P3-5-3 | useSlackLog hook (10초 폴링) | `hooks/useSlackLog.ts` | **미구현** | P3-5-1 |
| P3-5-4 | 이벤트별 이모지 매핑 | (P3-5-2에 포함) | **검증 필요** | - |
| P3-5-5 | 사이드바 통합 | `components/TerminalSidebar.tsx` | 완료 | P3-5-2 |

### P3-6: idle 팀 하이라이트 + 체인 상태 표시

| # | 작업 | 파일 | 상태 | 의존성 |
|---|------|------|------|--------|
| P3-6-1 | IdleTeamStatus + ChainStatus 타입 추가 | `src/types/web-terminal.ts` | **미구현** | P1-2 |
| P3-6-2 | WS 서버에 idle.update 브로드캐스트 추가 | `scripts/terminal-ws-server.mjs` | **미구현** | P1-2 |
| P3-6-3 | WS 서버에 chain.update 브로드캐스트 추가 | `scripts/terminal-ws-server.mjs` | **미구현** | P1-1 |
| P3-6-4 | IdleIndicator 컴포넌트 | `components/IdleIndicator.tsx` | **미구현** | P3-6-2 |
| P3-6-5 | ChainStatusBadge 컴포넌트 | `components/ChainStatusBadge.tsx` | **미구현** | P3-6-3 |
| P3-6-6 | SessionTab에 idle/chain 정보 통합 | `components/SessionTab.tsx` | **미구현** | P3-6-4, P3-6-5 |
| P3-6-7 | terminal-client에서 idle/chain 메시지 처리 | `terminal-client.tsx` | **미구현** | P3-6-1 |

### 의존성 그래프

```
P3-1 (WS 서버 — 완료) ──────────────> P3-4 (입력 필터링 — 완료)
    │                                     │
    └─────────────────> P3-2 (xterm 페이지 — 완료)
                            │
                            ├─────> P3-3 (세션 전환 — 완료)
                            │
                            ├─────> P3-5 (슬랙 사이드바 — 부분 미구현)
                            │         └── useSlackLog hook 필요
                            │
                            └─────> P3-6 (idle/체인 — 미구현)
                                      └── P1-1 (chain-watcher) 의존
                                      └── P1-2 (idle-detector) 의존

[ecosystem.config.cjs] — 독립 작업 (P3-1-6)
```

### 구현 Wave 요약 (CTO팀용)

| Wave | 작업 | 담당 | 의존성 | 상태 |
|------|------|------|--------|------|
| **Wave 1** | WS 서버 + tmux 연동 | backend-dev | 없음 | 완료 |
| **Wave 2** | xterm.js 페이지 + 세션 전환 | frontend-dev | Wave 1 | 완료 |
| **Wave 3** | 입력 전달 + 보안 | frontend-dev + backend-dev | Wave 1, 2 | 완료 |
| **Wave 4** | 슬랙 사이드바 + useSlackLog | frontend-dev + backend-dev | Wave 3 | 부분 완료 |
| **Wave 5** | idle/체인 UI + PM2 | frontend-dev + backend-dev | P1-1, P1-2, Wave 4 | 미구현 |

### 미구현 항목 체크리스트 (남은 작업)

- [ ] `ecosystem.config.cjs` 생성 (PM2 설정)
- [ ] `hooks/useSlackLog.ts` 작성 (10초 폴링)
- [ ] `src/types/web-terminal.ts`에 `IdleTeamStatus`, `ChainStatus`, `WsIdleUpdate`, `WsChainUpdate` 타입 추가
- [ ] `scripts/terminal-ws-server.mjs`에 idle.update + chain.update 브로드캐스트 추가
- [ ] `components/IdleIndicator.tsx` 신규 작성
- [ ] `components/ChainStatusBadge.tsx` 신규 작성
- [ ] `components/SessionTab.tsx`에 idle/chain props 추가
- [ ] `terminal-client.tsx`에서 idle/chain 메시지 핸들링
- [ ] input.blocked 토스트 UI 검증
- [ ] 슬랙 로그 이벤트 이모지 매핑 검증

---

## 6. 패키지 의존성

### 이미 설치됨

| 패키지 | 용도 |
|--------|------|
| `@xterm/xterm` ^5.x | 브라우저 터미널 렌더링 |
| `@xterm/addon-fit` ^0.10.x | 터미널 자동 크기 조절 |
| `@xterm/addon-web-links` ^0.11.x | URL 클릭 가능 |
| `ws` ^8.x | WebSocket 서버 |
| `jsonwebtoken` | JWT 검증 |

### 추가 필요 없음

Phase 3 범위에서 추가로 필요한 패키지는 `@google-cloud/storage`뿐이다. idle-detector와 chain-watcher는 Phase 1에서 이미 설계된 스크립트이며, GCS(`gs://bscamp-storage/agent-ops/`) 기반으로 데이터를 공유한다. 로컬 맥 스크립트에서는 `gsutil cp`도 사용 가능.

---

## 7. 보안 요약

| 계층 | 방식 | 설명 |
|------|------|------|
| Next.js 페이지 | Supabase Auth | 서버 컴포넌트에서 admin 역할 확인. 비인증/비admin -> 리다이렉트 |
| REST API | `requireAdmin()` | `src/app/api/admin/_shared.ts` |
| WebSocket | JWT 검증 | 연결 시 `?token={jwt}` -> `jwt.verify(token, SUPABASE_JWT_SECRET)` |
| 입력 필터링 | BLOCKED_PATTERNS | 10개 정규식 패턴. WS + REST 양쪽 모두 적용 |
| 입력 로깅 | append-only 로그 | `gs://bscamp-storage/agent-ops/terminal/input.log` (감사 추적, GCS) |
| CORS | origin 허용 목록 | `localhost:3000`, `bscamp.app` |
| 세션 격리 | tmux 세션 분리 | 팀 간 입력/출력 간섭 없음 |

---

## 8. 레이아웃 와이어프레임

```
┌──────────────────────────────────────────────────────────────────────┐
│ 📡 웹 터미널            [LIVE ●]            [대시보드로 이동 →]        │
├──────────────┬───────────────────────────────────────────────────────┤
│              │                                                       │
│  세션 목록    │                                                       │
│  ┌──────────┐│  ┌───────────────────────────────────────────────┐    │
│  │⚙️ CTO팀  ││  │                                               │    │
│  │ ● 연결됨  ││  │       xterm.js 터미널 렌더링 영역               │    │
│  │ T3 진행중 ││  │                                               │    │
│  └──────────┘│  │   배경: #ffffff                                │    │
│  ┌──────────┐│  │   폰트: Pretendard, 14px                      │    │
│  │📋 PM팀   ││  │   커서: #F75D5D (bar, blink)                  │    │
│  │ 💤 유휴   ││  │   스크롤백: 1000줄                             │    │
│  │ 5분 경과  ││  │   ANSI 16색 지원                               │    │
│  └──────────┘│  │                                               │    │
│  ┌──────────┐│  └───────────────────────────────────────────────┘    │
│  │📊 마케팅  ││  ┌───────────────────────────────────────────────┐    │
│  │ ● 연결됨  ││  │ CTO팀 $  ▌ npm run build                     │    │
│  │🔗 PM→CTO ││  │ [전송]                                        │    │
│  │ T1 진행중 ││  └───────────────────────────────────────────────┘    │
│  └──────────┘│                                                       │
│              │                                                       │
│  슬랙 알림    │                                                       │
│  ──────────  │                                                       │
│  14:30 🔗    │                                                       │
│  체인: PM→CTO│                                                       │
│  14:25 ✅    │                                                       │
│  T2 완료     │                                                       │
│  14:10 🚀    │                                                       │
│  T1 시작     │                                                       │
│              │                                                       │
├──────────────┴───────────────────────────────────────────────────────┤
│  ⚙️ CTO팀 | sdk-cto | 연결됨 | 버퍼 847줄 | 지연 45ms               │
└──────────────────────────────────────────────────────────────────────┘
```

**레이아웃 규격**:
- 사이드바 폭: `w-64` (256px)
- 터미널 영역: 나머지 flex-1
- 입력 바 높이: 56px (`py-3 px-4`)
- 상태 바 높이: 40px
- 최소 터미널 높이: `min-h-[400px]`
- 전체 높이: `h-[calc(100vh-64px)]` (네비게이션 바 제외)

---

## 9. Phase 3 완료 기준 (Plan 문서 기준)

| 기준 | 검증 방법 |
|------|----------|
| `/admin/terminal`에서 3팀 tmux 실시간 출력 확인 | 각 팀 탭 전환하며 출력 스트리밍 확인 |
| 입력 전달 + 위험 명령 차단 동작 | InputBar에서 `ls` 전달 성공 + `rm -rf` 차단 확인 |
| 사이드바에 슬랙 로그 표시 | `/api/terminal/slack-log` 데이터가 사이드바에 렌더링 |
| idle 경고 표시 | 5분 이상 무활동 팀에 노란색 경고 배지 |
| 체인 상태 표시 | chain.handoff 이벤트 발생 시 해당 팀에 배지 표시 |
| PM2로 WS 서버 관리 | `pm2 start ecosystem.config.cjs` 로 안정 실행 |
| `npm run build` 성공 | 빌드 에러 0개 |
| `npx tsc --noEmit` 통과 | 타입 에러 0개 |
