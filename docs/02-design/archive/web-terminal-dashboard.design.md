# 웹 터미널 대시보드 설계서

> **작성일**: 2026-03-25
> **작성자**: PM팀
> **Plan 참조**: `docs/01-plan/features/web-terminal-dashboard.plan.md`
> **기존 설계 참조**: `docs/02-design/features/agent-dashboard.design.md`, `docs/02-design/features/slack-notification.design.md`
> **기술 참조**: [Codeman](https://github.com/Ark0N/Codeman) (MIT)
> **기존 타입**: `src/types/agent-dashboard.ts`

---

## 1. 데이터 모델

### 1.1 세션 설정 (config)

```typescript
// src/types/web-terminal.ts

import type { TeamId } from './agent-dashboard';

/** 터미널 세션 식별자 */
export type TerminalSessionId = 'cto' | 'pm' | 'marketing';

/** 터미널 세션 연결 상태 */
export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected' | 'error';

/** 터미널 세션 설정 */
export interface TerminalSession {
  id: TerminalSessionId;
  tmuxSession: string;     // 실제 tmux 세션명: 'sdk-cto', 'sdk-pm', 'sdk-mkt'
  displayName: string;     // '⚙️ CTO팀', '📋 PM팀', '📊 마케팅팀'
  emoji: string;
  color: string;           // 팀 대표 색상
  status: ConnectionStatus;
  lastOutput: string;      // 마지막 출력 라인 (사이드바 미리보기용)
  lastOutputAt: string;    // ISO 8601
  bufferSize: number;      // 현재 스크롤백 버퍼 줄 수
}

/** 세션 설정 상수 (서버 + 클라이언트 공유) */
export const TERMINAL_SESSIONS: Record<TerminalSessionId, {
  tmuxSession: string;
  displayName: string;
  emoji: string;
  color: string;
  teamId: TeamId;
}> = {
  cto: {
    tmuxSession: 'sdk-cto',
    displayName: 'CTO팀',
    emoji: '⚙️',
    color: '#10b981',
    teamId: 'cto',
  },
  pm: {
    tmuxSession: 'sdk-pm',
    displayName: 'PM팀',
    emoji: '📋',
    color: '#8b5cf6',
    teamId: 'pm',
  },
  marketing: {
    tmuxSession: 'sdk-mkt',
    displayName: '마케팅팀',
    emoji: '📊',
    color: '#f59e0b',
    teamId: 'marketing',
  },
};
```

### 1.2 WebSocket 메시지 프로토콜

```typescript
// src/types/web-terminal.ts (계속)

/** ── 서버 -> 클라이언트 메시지 ── */

/** 터미널 출력 데이터 */
export interface WsTerminalOutput {
  type: 'terminal.output';
  sessionId: TerminalSessionId;
  data: string;           // 터미널 출력 (ANSI escape 포함). diff만 전송
  timestamp: string;      // ISO 8601
}

/** 세션 상태 업데이트 */
export interface WsSessionStatus {
  type: 'session.status';
  sessions: Pick<TerminalSession, 'id' | 'status' | 'lastOutput' | 'lastOutputAt'>[];
}

/** 초기 히스토리 (연결 직후 전송) */
export interface WsSessionHistory {
  type: 'session.history';
  sessionId: TerminalSessionId;
  data: string;           // 전체 스크롤백 버퍼 (최대 1000줄)
  lineCount: number;
}

/** 에러 메시지 */
export interface WsError {
  type: 'error';
  code: string;           // 'TMUX_SESSION_NOT_FOUND' | 'AUTH_FAILED' | 'SEND_BLOCKED'
  message: string;
  sessionId?: TerminalSessionId;
}

/** 입력 차단 알림 (위험 명령 감지) */
export interface WsInputBlocked {
  type: 'input.blocked';
  sessionId: TerminalSessionId;
  input: string;          // 차단된 입력 원문
  reason: string;         // '위험 명령 감지: rm -rf' 등
}

/** 서버 -> 클라이언트 메시지 유니온 */
export type WsServerMessage =
  | WsTerminalOutput
  | WsSessionStatus
  | WsSessionHistory
  | WsError
  | WsInputBlocked;

/** ── 클라이언트 -> 서버 메시지 ── */

/** 터미널 입력 전달 */
export interface WsTerminalInput {
  type: 'terminal.input';
  sessionId: TerminalSessionId;
  data: string;           // 사용자 입력 텍스트
  sendEnter?: boolean;    // true면 입력 후 Enter 키 전송 (기본값: true)
}

/** 세션 구독 (특정 세션 출력 수신 시작) */
export interface WsSubscribe {
  type: 'subscribe';
  sessionId: TerminalSessionId;
}

/** 히스토리 요청 (세션 전환 시) */
export interface WsRequestHistory {
  type: 'request.history';
  sessionId: TerminalSessionId;
  lines?: number;         // 요청 줄 수 (기본값: 1000)
}

/** 클라이언트 -> 서버 메시지 유니온 */
export type WsClientMessage =
  | WsTerminalInput
  | WsSubscribe
  | WsRequestHistory;
```

### 1.3 슬랙 통합 채널 타입 (변경분)

```typescript
// src/types/agent-dashboard.ts 변경 사항 (기존 인터페이스 확장)

/** 슬랙 채널 설정 — 통합 채널 구조 */
export interface SlackChannelConfigV2 {
  /** 통합 채널 ID (신규, 우선 적용) */
  unified?: string;
  /** @deprecated 통합 채널 미설정 시 fallback */
  pm?: string;
  /** @deprecated 통합 채널 미설정 시 fallback */
  marketing?: string;
  /** @deprecated 통합 채널 미설정 시 fallback */
  cto?: string;
  /** CEO Slack User ID (DM용, 변경 없음) */
  ceoUserId: string;
}
```

---

## 2. 백엔드 설계

### 2.1 WebSocket 서버 (별도 프로세스)

**파일 위치**: `scripts/terminal-ws-server.mjs` (Next.js 외부 독립 스크립트)

**기술 스택**:
- `ws` (WebSocket 라이브러리, npm)
- `child_process.execSync` / `execFile` (tmux 명령 실행)
- `jsonwebtoken` (JWT 검증, Supabase Auth 토큰)

**포트**: `TERMINAL_WS_PORT` 환경변수 (기본값: `3001`)

**실행 방법**:
```bash
# 직접 실행
node scripts/terminal-ws-server.mjs

# PM2로 실행 (권장)
pm2 start scripts/terminal-ws-server.mjs --name terminal-ws

# 환경변수
TERMINAL_WS_PORT=3001
SUPABASE_JWT_SECRET=<supabase jwt secret>
TERMINAL_POLL_INTERVAL=100   # ms, capture-pane 폴링 간격
TERMINAL_SCROLLBACK=1000     # 스크롤백 줄 수
```

**서버 동작 흐름**:

```
1. 시작 시:
   - 3개 tmux 세션(sdk-cto, sdk-pm, sdk-mkt) 존재 확인
   - 캡처 루프 시작 (setInterval, 100ms)
   - WebSocket 서버 리슨 (0.0.0.0:3001)

2. 연결 시 (ws.on('connection')):
   - query param에서 token 추출: ws://localhost:3001?token={jwt}
   - JWT 검증 (Supabase JWT secret 사용)
   - role === 'admin' 확인
   - 실패 시 ws.close(4001, 'Unauthorized')
   - 성공 시 클라이언트 등록 + 3개 세션 상태 전송 (session.status)

3. 캡처 루프 (100ms):
   for each session in [sdk-cto, sdk-pm, sdk-mkt]:
     output = exec(`tmux capture-pane -t ${session} -p -S -${SCROLLBACK}`)
     if output !== previousOutput[session]:
       diff = computeDiff(previousOutput[session], output)
       broadcast({ type: 'terminal.output', sessionId, data: diff })
       previousOutput[session] = output

4. 입력 수신 (terminal.input):
   - 위험 명령 필터링 (BLOCKED_PATTERNS 매칭)
   - 통과 시: exec(`tmux send-keys -t ${session} "${escaped}" ${sendEnter ? 'Enter' : ''}`)
   - 차단 시: ws.send({ type: 'input.blocked', ... })

5. 히스토리 요청 (request.history):
   - output = exec(`tmux capture-pane -t ${session} -p -S -${lines}`)
   - ws.send({ type: 'session.history', data: output })
```

**diff 알고리즘** (CPU 절약):

```typescript
function computeDiff(prev: string, curr: string): string {
  // 줄 단위 비교. 동일한 앞부분 건너뛰고 새로 추가된 줄만 반환
  const prevLines = prev.split('\n');
  const currLines = curr.split('\n');

  // 뒤에서부터 매칭하여 새 줄만 추출
  // tmux capture-pane은 전체 버퍼를 반환하므로,
  // 이전 출력의 마지막 N줄과 현재 출력을 비교하여 새 줄 감지
  let matchStart = 0;
  const prevTail = prevLines.slice(-20); // 마지막 20줄로 매칭 포인트 검색
  for (let i = 0; i < currLines.length; i++) {
    if (currLines.slice(i, i + prevTail.length).join('\n') === prevTail.join('\n')) {
      matchStart = i + prevTail.length;
      break;
    }
  }

  return currLines.slice(matchStart).join('\n');
}
```

### 2.2 위험 명령 필터링

Destructive Detector(`.claude/hooks/` 규칙)와 동일한 패턴 적용:

```typescript
// scripts/terminal-ws-server.mjs 내부

const BLOCKED_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /rm\s+(-[rRf]+\s+|--recursive|--force)/i, label: 'rm -rf / rm --force' },
  { pattern: /git\s+push\s+--force/i, label: 'git push --force' },
  { pattern: /git\s+reset\s+--hard/i, label: 'git reset --hard' },
  { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i, label: 'DROP TABLE/DATABASE' },
  { pattern: /TRUNCATE\s+/i, label: 'TRUNCATE' },
  { pattern: /DELETE\s+FROM\s+\w+\s*(;|\s*$)/i, label: 'DELETE FROM (조건 없음)' },
  { pattern: /:(){ :\|:& };:/i, label: 'fork bomb' },
  { pattern: /mkfs\./i, label: 'mkfs (디스크 포맷)' },
  { pattern: /dd\s+if=/i, label: 'dd (디스크 덮어쓰기)' },
  { pattern: />\s*\/dev\/sd/i, label: '/dev/sd 덮어쓰기' },
];

function checkDangerousInput(input: string): { blocked: boolean; reason?: string } {
  for (const { pattern, label } of BLOCKED_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, reason: `위험 명령 감지: ${label}` };
    }
  }
  return { blocked: false };
}
```

### 2.3 tmux 연동 명령어

```bash
# 세션 존재 확인
tmux has-session -t sdk-cto 2>/dev/null && echo "exists"

# 출력 캡처 (최근 1000줄)
tmux capture-pane -t sdk-cto -p -S -1000

# 특정 윈도우/페인 지정 캡처 (팀원 pane 포함 시)
tmux capture-pane -t sdk-cto:0.0 -p -S -1000

# 입력 전달 (Enter 포함)
tmux send-keys -t sdk-cto "사용자 입력 내용" Enter

# 입력 전달 (Enter 없이, 부분 입력)
tmux send-keys -t sdk-cto "부분 텍스트"

# 세션 목록 확인
tmux list-sessions -F "#{session_name}:#{session_attached}:#{session_activity}"
```

### 2.4 API 엔드포인트 (Next.js, REST fallback)

WebSocket 연결이 불가능한 환경을 위한 HTTP fallback API.

**파일 위치**: `src/app/api/terminal/`

#### `GET /api/terminal/sessions`

세션 목록 + 상태 조회.

```typescript
// src/app/api/terminal/sessions/route.ts

interface TerminalSessionsResponse {
  ok: true;
  sessions: {
    id: TerminalSessionId;
    tmuxSession: string;
    displayName: string;
    emoji: string;
    color: string;
    exists: boolean;        // tmux 세션 존재 여부
    attached: boolean;      // 다른 클라이언트 접속 중 여부
    lastActivity: string;   // ISO 8601
  }[];
  wsUrl: string;            // 'ws://localhost:3001'
}
```

**동작**: `tmux list-sessions` 실행 -> 3개 세션 매칭 -> 상태 반환

**인증**: `requireAdmin()` (기존 `src/app/api/admin/_shared.ts`)

#### `POST /api/terminal/sessions/{id}/input`

HTTP로 입력 전달 (WebSocket 불가 시 fallback).

```typescript
// src/app/api/terminal/sessions/[id]/input/route.ts

// 요청
interface TerminalInputRequest {
  data: string;            // 입력 텍스트
  sendEnter?: boolean;     // Enter 전송 여부 (기본: true)
}

// 응답 (성공)
{ ok: true, sessionId: 'cto' }

// 응답 (차단)
{ ok: false, error: 'INPUT_BLOCKED', reason: '위험 명령 감지: rm -rf' }

// 응답 (세션 없음)
{ ok: false, error: 'SESSION_NOT_FOUND', message: 'tmux 세션 sdk-cto가 존재하지 않습니다' }
```

**동작**: 위험 명령 검사 -> `tmux send-keys -t {session} "{data}" Enter`

#### `GET /api/terminal/sessions/{id}/history`

세션 히스토리 조회 (스크롤백).

```typescript
// src/app/api/terminal/sessions/[id]/history/route.ts

// Query: ?lines=1000
interface TerminalHistoryResponse {
  ok: true;
  sessionId: TerminalSessionId;
  data: string;            // 전체 출력 텍스트 (ANSI escape 포함)
  lineCount: number;
  capturedAt: string;      // ISO 8601
}
```

**동작**: `tmux capture-pane -t {session} -p -S -{lines}`

#### `GET /api/terminal/slack-log`

슬랙 알림 로그 조회 (사이드바 표시용).

```typescript
// src/app/api/terminal/slack-log/route.ts

// Query: ?limit=20
interface SlackLogResponse {
  ok: true;
  logs: {
    event: string;
    team: TeamId;
    title: string;
    message: string;
    sentAt: string;
    status: 'sent' | 'failed';
  }[];
}
```

**동작**: `/tmp/cross-team/slack/queue.jsonl` 최근 N줄 파싱

---

## 3. 프론트엔드 설계

### 3.1 페이지 구조

- **경로**: `/admin/terminal`
- **인증**: admin 전용 (기존 admin 레이아웃 하위)
- **레이아웃**: 좌측 사이드바(세션 탭 + 상태 + 슬랙 로그) + 우측 메인(터미널 + 입력 바)

```
┌─────────────────────────────────────────────────────────────────┐
│ 📡 웹 터미널          [LIVE ●]          [대시보드로 이동 →]       │
├─────────────┬───────────────────────────────────────────────────┤
│             │                                                   │
│  세션 목록    │                                                   │
│  ┌─────────┐│  ┌─────────────────────────────────────────────┐  │
│  │⚙️ CTO팀 ││  │                                             │  │
│  │ ● 연결됨 ││  │        xterm.js 터미널 렌더링 영역            │  │
│  │ T3 진행중 ││  │                                             │  │
│  └─────────┘│  │   (ANSI 색상, 커서, 스크롤백 1000줄)          │  │
│  ┌─────────┐│  │                                             │  │
│  │📋 PM팀  ││  │                                             │  │
│  │ ○ 유휴   ││  │                                             │  │
│  │ 완료     ││  │                                             │  │
│  └─────────┘│  │                                             │  │
│  ┌─────────┐│  └─────────────────────────────────────────────┘  │
│  │📊 마케팅 ││  ┌─────────────────────────────────────────────┐  │
│  │ ● 연결됨 ││  │ $ ▌                                        │  │
│  │ T1 진행중 ││  │ [입력 바 — Enter로 전송]                     │  │
│  └─────────┘│  └─────────────────────────────────────────────┘  │
│             │                                                   │
│  슬랙 알림    │                                                   │
│  ─────────  │                                                   │
│  14:30 체인  │                                                   │
│  PM→CTO     │                                                   │
│  14:25 완료  │                                                   │
│  T2 구현     │                                                   │
│             │                                                   │
├─────────────┴───────────────────────────────────────────────────┤
│  ⚙️ CTO팀 | sdk-cto | 연결됨 | 버퍼 847줄 | 지연 45ms          │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 컴포넌트 구조

```
src/app/(main)/admin/terminal/
├── page.tsx                          ← 서버 컴포넌트 (인증 체크 + 메타)
├── terminal-client.tsx               ← 'use client' 메인 클라이언트
├── components/
│   ├── TerminalSidebar.tsx           ← 좌측 사이드바 전체
│   │   ├── SessionTab.tsx            ← 개별 세션 탭 (클릭으로 전환)
│   │   └── SlackAlertLog.tsx         ← 슬랙 알림 로그 패널
│   ├── TerminalView.tsx              ← 메인 터미널 영역
│   │   ├── XtermRenderer.tsx         ← xterm.js 래퍼 (dynamic import, ssr: false)
│   │   └── InputBar.tsx              ← 하단 입력 바
│   ├── StatusBar.tsx                 ← 하단 상태 바 (연결, 버퍼, 지연)
│   └── ConnectionIndicator.tsx       ← LIVE/RECONNECTING/DISCONNECTED 표시
└── hooks/
    ├── useTerminalWebSocket.ts       ← WebSocket 연결/재연결/메시지 처리
    └── useTerminalSession.ts         ← 세션 전환/히스토리 관리
```

### 3.3 컴포넌트 상세

#### `page.tsx` (서버 컴포넌트)

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

#### `XtermRenderer.tsx` (xterm.js 래퍼)

```typescript
// dynamic import 필수 (xterm.js는 SSR 불가)
// terminal-client.tsx에서:
// const XtermRenderer = dynamic(
//   () => import('./components/XtermRenderer'),
//   { ssr: false, loading: () => <div className="...">터미널 로딩 중...</div> }
// );

// XtermRenderer.tsx
'use client';

import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';

export interface XtermRendererHandle {
  write: (data: string) => void;
  clear: () => void;
  focus: () => void;
}

interface Props {
  onResize?: (cols: number, rows: number) => void;
}

const XTERM_OPTIONS = {
  theme: {
    background: '#ffffff',
    foreground: '#1e1e1e',
    cursor: '#F75D5D',
    cursorAccent: '#ffffff',
    selectionBackground: '#F75D5D33',
    // ANSI 16색 (라이트 모드 최적화)
    black: '#1e1e1e',
    red: '#F75D5D',
    green: '#10b981',
    yellow: '#f59e0b',
    blue: '#3b82f6',
    magenta: '#8b5cf6',
    cyan: '#06b6d4',
    white: '#f5f5f5',
    brightBlack: '#6b7280',
    brightRed: '#E54949',
    brightGreen: '#34d399',
    brightYellow: '#fbbf24',
    brightBlue: '#60a5fa',
    brightMagenta: '#a78bfa',
    brightCyan: '#22d3ee',
    brightWhite: '#ffffff',
  },
  fontFamily: "'Pretendard', 'JetBrains Mono', 'Fira Code', monospace",
  fontSize: 14,
  lineHeight: 1.4,
  scrollback: 1000,
  cursorBlink: true,
  cursorStyle: 'bar' as const,
  allowProposedApi: true,
};

export default forwardRef<XtermRendererHandle, Props>(
  function XtermRenderer({ onResize }, ref) {
    const containerRef = useRef<HTMLDivElement>(null);
    const terminalRef = useRef<Terminal | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    useImperativeHandle(ref, () => ({
      write: (data: string) => terminalRef.current?.write(data),
      clear: () => terminalRef.current?.clear(),
      focus: () => terminalRef.current?.focus(),
    }));

    useEffect(() => {
      if (!containerRef.current) return;

      const terminal = new Terminal(XTERM_OPTIONS);
      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.open(containerRef.current);
      fitAddon.fit();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;

      const handleResize = () => {
        fitAddon.fit();
        onResize?.(terminal.cols, terminal.rows);
      };
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        terminal.dispose();
      };
    }, [onResize]);

    return (
      <div
        ref={containerRef}
        className="w-full h-full min-h-[400px] rounded-lg border border-gray-200 overflow-hidden"
        style={{ backgroundColor: '#ffffff' }}
      />
    );
  }
);
```

#### `InputBar.tsx` (입력 바)

```typescript
'use client';

import { useState, useRef, KeyboardEvent } from 'react';
import type { TerminalSessionId } from '@/types/web-terminal';

interface Props {
  sessionId: TerminalSessionId;
  sessionName: string;
  connected: boolean;
  onSend: (input: string) => void;
}

export default function InputBar({ sessionId, sessionName, connected, onSend }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && value.trim()) {
      onSend(value);
      setValue('');
    }
  };

  return (
    <div className="flex items-center gap-2 px-4 py-3 bg-white border-t border-gray-200">
      <span className="text-sm text-gray-500 font-mono">
        {sessionName} $
      </span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={!connected}
        placeholder={connected ? '명령어를 입력하세요...' : '연결 끊김'}
        className="flex-1 px-3 py-2 text-sm font-mono bg-gray-50 border border-gray-200 rounded-md
                   focus:outline-none focus:ring-2 focus:ring-[#F75D5D] focus:border-transparent
                   disabled:opacity-50 disabled:cursor-not-allowed
                   font-[Pretendard,'JetBrains_Mono',monospace]"
      />
      <button
        onClick={() => { if (value.trim()) { onSend(value); setValue(''); } }}
        disabled={!connected || !value.trim()}
        className="px-4 py-2 text-sm font-medium text-white rounded-md
                   bg-[#F75D5D] hover:bg-[#E54949]
                   disabled:opacity-50 disabled:cursor-not-allowed
                   transition-colors"
      >
        전송
      </button>
    </div>
  );
}
```

#### `SessionTab.tsx` (세션 탭)

```typescript
'use client';

import type { TerminalSessionId, ConnectionStatus } from '@/types/web-terminal';

interface Props {
  id: TerminalSessionId;
  displayName: string;
  emoji: string;
  color: string;
  status: ConnectionStatus;
  taskSummary?: string;    // 현재 TASK 요약 (예: 'T3 진행중')
  lastOutput?: string;     // 마지막 출력 미리보기
  isActive: boolean;
  onClick: () => void;
}

const STATUS_INDICATOR: Record<ConnectionStatus, { color: string; label: string }> = {
  connected:    { color: '#10b981', label: '연결됨' },
  connecting:   { color: '#f59e0b', label: '연결 중...' },
  disconnected: { color: '#6b7280', label: '연결 끊김' },
  error:        { color: '#ef4444', label: '오류' },
};

export default function SessionTab({
  id, displayName, emoji, color, status,
  taskSummary, lastOutput, isActive, onClick,
}: Props) {
  const indicator = STATUS_INDICATOR[status];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-all
        ${isActive
          ? 'bg-[#F75D5D]/10 border-l-4 border-[#F75D5D]'
          : 'hover:bg-gray-50 border-l-4 border-transparent'
        }`}
    >
      <div className="flex items-center gap-2">
        <span>{emoji}</span>
        <span className="font-medium text-sm" style={{ color: isActive ? '#F75D5D' : '#1e1e1e' }}>
          {displayName}
        </span>
        <span
          className="w-2 h-2 rounded-full ml-auto"
          style={{ backgroundColor: indicator.color }}
          title={indicator.label}
        />
      </div>
      {taskSummary && (
        <p className="text-xs text-gray-500 mt-1 ml-6">{taskSummary}</p>
      )}
      {lastOutput && (
        <p className="text-xs text-gray-400 mt-0.5 ml-6 truncate font-mono">
          {lastOutput}
        </p>
      )}
    </button>
  );
}
```

### 3.4 Hooks

#### `useTerminalWebSocket.ts`

```typescript
'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import type {
  WsServerMessage, WsClientMessage,
  TerminalSessionId, ConnectionStatus,
} from '@/types/web-terminal';

interface UseTerminalWebSocketOptions {
  token: string;
  wsUrl?: string;            // 기본값: 'ws://localhost:3001'
  maxRetries?: number;       // 기본값: 10
  retryInterval?: number;    // 기본값: 5000 (ms)
}

interface UseTerminalWebSocketReturn {
  connectionStatus: ConnectionStatus;
  send: (msg: WsClientMessage) => void;
  lastMessage: WsServerMessage | null;
  retryCount: number;
}

export function useTerminalWebSocket({
  token,
  wsUrl = 'ws://localhost:3001',
  maxRetries = 10,
  retryInterval = 5000,
}: UseTerminalWebSocketOptions): UseTerminalWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [lastMessage, setLastMessage] = useState<WsServerMessage | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setConnectionStatus('connecting');
    const ws = new WebSocket(`${wsUrl}?token=${token}`);

    ws.onopen = () => {
      setConnectionStatus('connected');
      retryCountRef.current = 0;
      setRetryCount(0);
    };

    ws.onmessage = (event) => {
      try {
        const msg: WsServerMessage = JSON.parse(event.data);
        setLastMessage(msg);
      } catch { /* JSON 파싱 실패 무시 */ }
    };

    ws.onclose = (event) => {
      wsRef.current = null;
      if (event.code === 4001) {
        // 인증 실패 — 재시도하지 않음
        setConnectionStatus('error');
        return;
      }
      setConnectionStatus('disconnected');

      // 자동 재연결
      if (retryCountRef.current < maxRetries) {
        retryCountRef.current += 1;
        setRetryCount(retryCountRef.current);
        setTimeout(connect, retryInterval);
      }
    };

    ws.onerror = () => {
      setConnectionStatus('error');
    };

    wsRef.current = ws;
  }, [token, wsUrl, maxRetries, retryInterval]);

  const send = useCallback((msg: WsClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { connectionStatus, send, lastMessage, retryCount };
}
```

#### `useTerminalSession.ts`

```typescript
'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import type {
  TerminalSessionId, WsServerMessage,
  TerminalSession, WsClientMessage,
} from '@/types/web-terminal';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';

interface UseTerminalSessionReturn {
  activeSession: TerminalSessionId;
  sessions: Record<TerminalSessionId, TerminalSession>;
  switchSession: (id: TerminalSessionId) => void;
  handleMessage: (msg: WsServerMessage) => void;
}

export function useTerminalSession(
  send: (msg: WsClientMessage) => void,
): UseTerminalSessionReturn {
  const [activeSession, setActiveSession] = useState<TerminalSessionId>('cto');

  const [sessions, setSessions] = useState<Record<TerminalSessionId, TerminalSession>>(() => {
    const initial: Record<string, TerminalSession> = {};
    for (const [id, config] of Object.entries(TERMINAL_SESSIONS)) {
      initial[id] = {
        id: id as TerminalSessionId,
        tmuxSession: config.tmuxSession,
        displayName: `${config.emoji} ${config.displayName}`,
        emoji: config.emoji,
        color: config.color,
        status: 'disconnected',
        lastOutput: '',
        lastOutputAt: '',
        bufferSize: 0,
      };
    }
    return initial as Record<TerminalSessionId, TerminalSession>;
  });

  // 세션별 xterm 버퍼 참조 (XtermRendererHandle.write 호출용)
  const termBuffers = useRef<Record<TerminalSessionId, string[]>>({
    cto: [], pm: [], marketing: [],
  });

  const switchSession = useCallback((id: TerminalSessionId) => {
    setActiveSession(id);
    // 세션 전환 시 히스토리 요청
    send({ type: 'request.history', sessionId: id, lines: 1000 });
    send({ type: 'subscribe', sessionId: id });
  }, [send]);

  const handleMessage = useCallback((msg: WsServerMessage) => {
    switch (msg.type) {
      case 'terminal.output':
        // 해당 세션 버퍼에 추가
        termBuffers.current[msg.sessionId].push(msg.data);
        setSessions(prev => ({
          ...prev,
          [msg.sessionId]: {
            ...prev[msg.sessionId],
            lastOutput: msg.data.split('\n').pop() ?? '',
            lastOutputAt: msg.timestamp,
          },
        }));
        break;

      case 'session.status':
        setSessions(prev => {
          const next = { ...prev };
          for (const s of msg.sessions) {
            if (next[s.id]) {
              next[s.id] = { ...next[s.id], ...s };
            }
          }
          return next;
        });
        break;

      case 'session.history':
        // 전체 히스토리로 버퍼 교체
        termBuffers.current[msg.sessionId] = [msg.data];
        setSessions(prev => ({
          ...prev,
          [msg.sessionId]: {
            ...prev[msg.sessionId],
            bufferSize: msg.lineCount,
          },
        }));
        break;
    }
  }, []);

  return { activeSession, sessions, switchSession, handleMessage };
}
```

### 3.5 xterm.js 테마 (라이트 모드)

```typescript
// 라이트 모드 전용. 다크 모드 없음 (CLAUDE.md 규칙).
const LIGHT_THEME = {
  background: '#ffffff',        // 흰색 배경
  foreground: '#1e1e1e',        // 어두운 텍스트
  cursor: '#F75D5D',            // Primary 색상 커서
  cursorAccent: '#ffffff',
  selectionBackground: '#F75D5D33', // Primary 33% 투명도 선택 영역
  // ANSI 색상은 라이트 배경에서 가독성 확보하도록 조정
};
```

### 3.6 WebSocket 클라이언트 연결

- 연결 URL: `ws://localhost:3001?token={jwt}`
- JWT: Supabase Auth 세션의 `access_token`을 서버 컴포넌트에서 전달
- 자동 재연결: 5초 간격, 최대 10회
- 인증 실패(코드 4001) 시 재연결 안 함
- 연결 상태 표시: `ConnectionIndicator` 컴포넌트

---

## 4. 슬랙 통합

### 4.1 통합 채널 구조 (변경)

기존 `slack-notification.design.md`의 채널 구조를 다음과 같이 변경한다.

**환경변수 변경**:

| 환경변수 | 상태 | 설명 |
|---------|------|------|
| `SLACK_UNIFIED_CHANNEL` | **신규** | 통합 알림 채널 ID |
| `SLACK_CHANNEL_PM` | deprecated | 통합 채널 미설정 시 fallback |
| `SLACK_CHANNEL_CTO` | deprecated | 통합 채널 미설정 시 fallback |
| `SLACK_CHANNEL_MARKETING` | deprecated | 통합 채널 미설정 시 fallback |
| `SLACK_CEO_USER_ID` | 유지 | CEO DM (변경 없음) |

**resolveChannels 변경 로직**:

```typescript
// src/lib/slack-notifier.ts 내 resolveChannels 변경

function resolveChannels(
  event: SlackEventType,
  team: TeamId,
  targetTeam?: TeamId,
): string[] {
  const unifiedChannel = process.env.SLACK_UNIFIED_CHANNEL;

  if (unifiedChannel) {
    // 통합 채널 모드: 모든 이벤트가 1개 채널로
    return [unifiedChannel];
  }

  // Fallback: 기존 팀별 채널 로직 (deprecated)
  const channels = [CHANNELS[team]].filter(Boolean);
  if (event === 'chain.handoff' && targetTeam) {
    const targetChannel = CHANNELS[targetTeam];
    if (targetChannel && !channels.includes(targetChannel)) {
      channels.push(targetChannel);
    }
  }
  return channels;
}
```

### 4.2 알림 로그 표시 (사이드바)

터미널 페이지 사이드바 하단에 슬랙 알림 로그를 표시한다.

**데이터 소스**: `/tmp/cross-team/slack/queue.jsonl`

**API**: `GET /api/terminal/slack-log?limit=20`

**표시 형식**:

```
14:30  🔗 체인 전달: PM팀 → CTO팀
14:25  ✅ T2 구현 완료 (CTO팀)
14:10  🚀 T1 시작 (마케팅팀)
```

**갱신 주기**: 10초 폴링 (SWR / React Query)

---

## 5. 보안

### 5.1 인증

| 계층 | 방식 | 설명 |
|------|------|------|
| Next.js 페이지 | Supabase Auth | 서버 컴포넌트에서 admin 역할 확인. 비인증/비admin -> 리다이렉트 |
| REST API | `requireAdmin()` | 기존 `src/app/api/admin/_shared.ts` 함수 |
| WebSocket | JWT 검증 | 연결 시 query param `token`을 `jsonwebtoken.verify(token, SUPABASE_JWT_SECRET)` |

### 5.2 입력 제한 (위험 명령 필터링)

- WebSocket 서버와 REST API 양쪽 모두에서 필터링
- `BLOCKED_PATTERNS` 정규식 배열 (섹션 2.2 참조)
- 차단 시 사용자에게 `input.blocked` 메시지 + 사유 표시
- 모든 입력은 로깅 (`/tmp/cross-team/terminal/input.log`, append-only)

### 5.3 세션 격리

- 각 팀 세션은 독립된 tmux 세션으로 운영
- 한 팀 세션에 보낸 입력이 다른 팀에 영향 없음
- WebSocket 메시지에 `sessionId` 필수 -- 서버에서 검증

### 5.4 CORS

WebSocket 서버에서 origin 검증:

```typescript
const wss = new WebSocketServer({
  port: WS_PORT,
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    const allowed = ['http://localhost:3000', 'https://bscamp.app'];
    return allowed.includes(origin);
  },
});
```

---

## 6. 에러 처리

| 상황 | 감지 방법 | 사용자 표시 | 자동 복구 |
|------|----------|-----------|----------|
| tmux 세션 없음 | `tmux has-session` 실패 | "⚙️ CTO팀 세션이 활성화되지 않았습니다" | 5초 간격 재확인 |
| WebSocket 서버 미실행 | 연결 실패 (onerror) | "WebSocket 서버에 연결할 수 없습니다 (localhost:3001)" | 5초 간격 재연결 (최대 10회) |
| WebSocket 끊김 | onclose 이벤트 | "연결이 끊어졌습니다. 재연결 중... (3/10)" | 5초 간격 재연결 |
| JWT 인증 실패 | 서버에서 close(4001) | "인증에 실패했습니다. 다시 로그인해주세요." | 없음 (로그인 페이지 링크) |
| 위험 명령 차단 | BLOCKED_PATTERNS 매칭 | "위험 명령이 감지되어 차단되었습니다: rm -rf" (토스트) | 없음 (의도된 차단) |
| capture-pane 실패 | execSync 예외 | 해당 세션 "캡처 오류" 표시 | 다음 폴링에서 재시도 |
| send-keys 실패 | execSync 예외 | "입력 전달에 실패했습니다" (토스트) | 없음 (재시도 버튼) |
| WS 서버 크래시 | PM2 자동 감지 | "서버 재시작 중..." | PM2 auto-restart |

### 에러 코드 정의

| 코드 | 의미 | HTTP | WS close |
|------|------|------|----------|
| `AUTH_FAILED` | 인증 실패 (JWT 무효/만료) | 401 | 4001 |
| `FORBIDDEN` | admin 역할 아님 | 403 | 4003 |
| `SESSION_NOT_FOUND` | tmux 세션 없음 | 404 | - |
| `INPUT_BLOCKED` | 위험 명령 차단 | 400 | - |
| `SEND_FAILED` | tmux send-keys 실패 | 500 | - |
| `CAPTURE_FAILED` | tmux capture-pane 실패 | 500 | - |

---

## 7. 구현 순서 (CTO팀용)

### Wave 1: WebSocket 서버 + tmux 연동 (백엔드)

| # | 작업 | 파일 | 담당 |
|---|------|------|------|
| W1-1 | 타입 정의 | `src/types/web-terminal.ts` | backend-dev |
| W1-2 | WebSocket 서버 구현 | `scripts/terminal-ws-server.mjs` | backend-dev |
| W1-3 | tmux capture-pane 폴링 루프 | (W1-2에 포함) | backend-dev |
| W1-4 | JWT 인증 검증 | (W1-2에 포함) | backend-dev |
| W1-5 | 위험 명령 필터링 | (W1-2에 포함) | backend-dev |
| W1-6 | REST API fallback | `src/app/api/terminal/` | backend-dev |

### Wave 2: xterm.js 페이지 + 세션 전환 (프론트엔드)

| # | 작업 | 파일 | 담당 |
|---|------|------|------|
| W2-1 | 페이지 + 클라이언트 컴포넌트 | `src/app/(main)/admin/terminal/` | frontend-dev |
| W2-2 | XtermRenderer (xterm.js 래퍼) | `components/XtermRenderer.tsx` | frontend-dev |
| W2-3 | SessionTab + TerminalSidebar | `components/SessionTab.tsx` 등 | frontend-dev |
| W2-4 | useTerminalWebSocket hook | `hooks/useTerminalWebSocket.ts` | frontend-dev |
| W2-5 | useTerminalSession hook | `hooks/useTerminalSession.ts` | frontend-dev |
| W2-6 | 라이트 모드 테마 적용 | XtermRenderer 내부 | frontend-dev |

### Wave 3: 입력 전달 + 보안 (통합)

| # | 작업 | 파일 | 담당 |
|---|------|------|------|
| W3-1 | InputBar 컴포넌트 | `components/InputBar.tsx` | frontend-dev |
| W3-2 | send-keys 릴레이 테스트 | WS 서버 + 프론트 통합 | frontend-dev + backend-dev |
| W3-3 | 위험 명령 차단 UI (토스트) | `components/InputBar.tsx` | frontend-dev |
| W3-4 | 입력 로깅 | `scripts/terminal-ws-server.mjs` | backend-dev |
| W3-5 | CORS 설정 | WS 서버 | backend-dev |

### Wave 4: 슬랙 통합 + 상태 요약 (마무리)

| # | 작업 | 파일 | 담당 |
|---|------|------|------|
| W4-1 | SlackAlertLog 컴포넌트 | `components/SlackAlertLog.tsx` | frontend-dev |
| W4-2 | GET /api/terminal/slack-log | `src/app/api/terminal/slack-log/route.ts` | backend-dev |
| W4-3 | 상태 요약 사이드바 | `components/TerminalSidebar.tsx` | frontend-dev |
| W4-4 | StatusBar + ConnectionIndicator | `components/StatusBar.tsx` 등 | frontend-dev |
| W4-5 | admin 사이드바 네비게이션 추가 | `src/app/(main)/admin/layout.tsx` | frontend-dev |
| W4-6 | 슬랙 채널 통합 로직 업데이트 | `src/lib/slack-notifier.ts` | backend-dev |

### 의존성 관계

```
Wave 1 (백엔드)  ─────────────────>  Wave 3 (통합)
                                       |
Wave 2 (프론트엔드) ──────────────>  Wave 3
                                       |
                                    Wave 4 (마무리)
```

Wave 1과 Wave 2는 병렬 진행 가능. Wave 3은 양쪽 완료 후 통합. Wave 4는 Wave 3 이후.

---

## 8. 패키지 의존성

### 신규 설치 필요

| 패키지 | 버전 | 용도 | 설치 위치 |
|--------|------|------|----------|
| `@xterm/xterm` | ^5.x | 브라우저 터미널 렌더링 | bscamp (Next.js) |
| `@xterm/addon-fit` | ^0.10.x | 터미널 자동 크기 조절 | bscamp |
| `@xterm/addon-web-links` | ^0.11.x | URL 클릭 가능 | bscamp |
| `ws` | ^8.x | WebSocket 서버 | bscamp (서버 스크립트용) |
| `jsonwebtoken` | ^9.x | JWT 검증 (WS 서버) | bscamp |

### 기존 사용 중 (추가 설치 불필요)

| 패키지 | 용도 |
|--------|------|
| `@slack/web-api` | 슬랙 알림 전송 (이미 설치됨) |
| `@supabase/supabase-js` | 인증 (이미 설치됨) |

---

## 9. 파일 구조 요약

```
신규 생성 파일:
├── src/types/web-terminal.ts                              ← 타입 정의
├── src/app/(main)/admin/terminal/
│   ├── page.tsx                                           ← 서버 컴포넌트
│   ├── terminal-client.tsx                                ← 클라이언트 메인
│   ├── components/
│   │   ├── TerminalSidebar.tsx
│   │   ├── SessionTab.tsx
│   │   ├── SlackAlertLog.tsx
│   │   ├── TerminalView.tsx
│   │   ├── XtermRenderer.tsx
│   │   ├── InputBar.tsx
│   │   ├── StatusBar.tsx
│   │   └── ConnectionIndicator.tsx
│   └── hooks/
│       ├── useTerminalWebSocket.ts
│       └── useTerminalSession.ts
├── src/app/api/terminal/
│   ├── sessions/route.ts                                  ← GET 세션 목록
│   ├── sessions/[id]/input/route.ts                       ← POST 입력 전달
│   ├── sessions/[id]/history/route.ts                     ← GET 히스토리
│   └── slack-log/route.ts                                 ← GET 슬랙 로그
├── scripts/terminal-ws-server.mjs                         ← WS 서버 (독립 프로세스)

수정 파일 (최소 변경):
├── src/app/(main)/admin/layout.tsx                        ← 사이드바에 '웹 터미널' 네비게이션 추가
├── src/lib/slack-notifier.ts                              ← SLACK_UNIFIED_CHANNEL 지원 추가
├── src/types/agent-dashboard.ts                           ← SlackChannelConfigV2 추가
├── package.json                                           ← xterm.js, ws, jsonwebtoken 의존성 추가
```

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 웹 터미널 대시보드 (3팀 tmux 세션 실시간 모니터링 + 입력) |
| **작성일** | 2026-03-25 |
| **기술 핵심** | xterm.js (브라우저) + WebSocket (ws 라이브러리) + tmux capture-pane/send-keys |
| **신규 파일** | 타입 1개 + 페이지 1개 + 컴포넌트 8개 + Hook 2개 + API 4개 + WS 서버 1개 = **17개** |
| **수정 파일** | admin layout, slack-notifier, agent-dashboard types, package.json = **4개** |
| **Wave 구조** | W1(백엔드) + W2(프론트, 병렬) -> W3(통합) -> W4(마무리) |
| **Codeman 차용** | xterm.js 터미널 + tmux 세션 관리 구조. Phase 2에서 zero-lag input, QR auth 검토 |
| **슬랙 변경** | 팀별 3채널 -> 통합 1채널 (`SLACK_UNIFIED_CHANNEL`) + deprecated fallback |
| **핵심 제약** | WS 서버는 맥 로컬 필수. Cloud 배포 불가 (tmux 접근 필요) |
