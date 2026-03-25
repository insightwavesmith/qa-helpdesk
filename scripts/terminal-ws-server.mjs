/**
 * 웹 터미널 WebSocket 서버
 * tmux 세션(sdk-cto, sdk-pm, sdk-mkt)을 실시간으로 스트리밍
 *
 * 실행 방법:
 *   node scripts/terminal-ws-server.mjs
 *   pm2 start scripts/terminal-ws-server.mjs --name terminal-ws
 *
 * 환경변수:
 *   TERMINAL_WS_PORT=3001
 *   SUPABASE_JWT_SECRET=<secret> (또는 FIREBASE_JWT_SECRET)
 *   TERMINAL_POLL_INTERVAL=100
 *   TERMINAL_SCROLLBACK=1000
 */

import { WebSocketServer } from 'ws';
import { execSync, execFileSync } from 'child_process';
import { createWriteStream, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── 설정 ──

const WS_PORT = parseInt(process.env.TERMINAL_WS_PORT ?? '3001', 10);
const POLL_INTERVAL = parseInt(process.env.TERMINAL_POLL_INTERVAL ?? '100', 10);
const SCROLLBACK = parseInt(process.env.TERMINAL_SCROLLBACK ?? '1000', 10);
const JWT_SECRET = process.env.SUPABASE_JWT_SECRET ?? process.env.FIREBASE_JWT_SECRET ?? '';

const SESSION_CONFIGS = {
  cto:       { tmuxSession: 'sdk-cto',  displayName: 'CTO팀',   emoji: '⚙️',  color: '#10b981' },
  pm:        { tmuxSession: 'sdk-pm',   displayName: 'PM팀',    emoji: '📋', color: '#8b5cf6' },
  marketing: { tmuxSession: 'sdk-mkt',  displayName: '마케팅팀', emoji: '📊', color: '#f59e0b' },
};

// ── 위험 명령 패턴 ──

const BLOCKED_PATTERNS = [
  { pattern: /rm\s+(-[rRf]+\s+|--recursive|--force)/i,   label: 'rm -rf / rm --force' },
  { pattern: /git\s+push\s+--force/i,                    label: 'git push --force' },
  { pattern: /git\s+reset\s+--hard/i,                    label: 'git reset --hard' },
  { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i,           label: 'DROP TABLE/DATABASE' },
  { pattern: /TRUNCATE\s+/i,                             label: 'TRUNCATE' },
  { pattern: /DELETE\s+FROM\s+\w+\s*(;|\s*$)/i,          label: 'DELETE FROM (조건 없음)' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/i,              label: 'fork bomb' },
  { pattern: /mkfs\./i,                                  label: 'mkfs (디스크 포맷)' },
  { pattern: /dd\s+if=/i,                                label: 'dd (디스크 덮어쓰기)' },
  { pattern: />\s*\/dev\/sd/i,                           label: '/dev/sd 덮어쓰기' },
];

function checkDangerousInput(input) {
  for (const { pattern, label } of BLOCKED_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, reason: `위험 명령 감지: ${label}` };
    }
  }
  return { blocked: false };
}

// ── 입력 로그 ──

const LOG_DIR = '/tmp/cross-team/terminal';
let inputLogStream = null;

function ensureLogDir() {
  try {
    mkdirSync(LOG_DIR, { recursive: true });
    inputLogStream = createWriteStream(join(LOG_DIR, 'input.log'), { flags: 'a' });
  } catch {
    console.warn('[터미널] 로그 디렉토리 생성 실패 (무시)');
  }
}

function logInput(sessionId, input, blocked) {
  if (!inputLogStream) return;
  const entry = JSON.stringify({
    time: new Date().toISOString(),
    sessionId,
    input,
    blocked,
  });
  inputLogStream.write(entry + '\n');
}

// ── tmux 헬퍼 ──

function tmuxSessionExists(session) {
  try {
    execSync(`tmux has-session -t ${session} 2>/dev/null`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function capturePane(session, lines = SCROLLBACK) {
  try {
    const output = execFileSync('tmux', [
      'capture-pane', '-t', session, '-p', '-S', `-${lines}`,
    ], { encoding: 'utf8', timeout: 3000 });
    return output;
  } catch {
    return null;
  }
}

function sendKeys(session, data, sendEnter = true) {
  const args = ['send-keys', '-t', session, data];
  if (sendEnter) args.push('Enter');
  execFileSync('tmux', args, { timeout: 3000 });
}

// ── diff 알고리즘 (설계서 2.1 참조) ──

function computeDiff(prev, curr) {
  if (!prev) return curr;
  const prevLines = prev.split('\n');
  const currLines = curr.split('\n');

  const prevTail = prevLines.slice(-20);
  let matchStart = 0;

  for (let i = 0; i < currLines.length; i++) {
    const slice = currLines.slice(i, i + prevTail.length);
    if (slice.join('\n') === prevTail.join('\n')) {
      matchStart = i + prevTail.length;
      break;
    }
  }

  const newLines = currLines.slice(matchStart);
  return newLines.join('\n');
}

// ── WebSocket 서버 ──

const clients = new Set();
const previousOutput = { cto: '', pm: '', marketing: '' };

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1 /* OPEN */) {
      ws.send(data);
    }
  }
}

function broadcastToSession(sessionId, msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    if (ws.readyState === 1 && ws._subscribedSession === sessionId) {
      ws.send(data);
    }
  }
}

// JWT 검증
function verifyToken(token) {
  if (!JWT_SECRET) {
    // JWT_SECRET 없으면 개발 환경으로 간주 — 경고 후 허용
    console.warn('[터미널] 경고: JWT_SECRET 미설정. 개발 환경에서만 허용.');
    return { uid: 'dev', role: 'admin' };
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Supabase JWT: user_metadata.role 또는 app_metadata.role
    const role =
      decoded?.app_metadata?.role ??
      decoded?.user_metadata?.role ??
      decoded?.role ??
      'unknown';
    return { uid: decoded.sub, role };
  } catch {
    return null;
  }
}

// 세션 상태 수집
function collectSessionStatus() {
  return Object.entries(SESSION_CONFIGS).map(([id, config]) => {
    const exists = tmuxSessionExists(config.tmuxSession);
    return {
      id,
      status: exists ? 'connected' : 'disconnected',
      lastOutput: previousOutput[id]?.split('\n').filter(Boolean).pop() ?? '',
      lastOutputAt: new Date().toISOString(),
    };
  });
}

const wss = new WebSocketServer({
  port: WS_PORT,
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers['origin'];
    const allowed = ['http://localhost:3000', 'https://bscamp.app', 'http://localhost:3001'];
    // origin이 없거나(curl 등) 허용된 경우 통과
    if (!origin || allowed.includes(origin)) return true;
    console.warn(`[터미널] 차단된 origin: ${origin}`);
    return false;
  },
});

wss.on('connection', (ws, req) => {
  // URL에서 token 파라미터 추출
  const url = new URL(req.url, `http://localhost:${WS_PORT}`);
  const token = url.searchParams.get('token') ?? '';

  const decoded = verifyToken(token);
  if (!decoded) {
    console.log('[터미널] 인증 실패 — 연결 거부');
    ws.close(4001, 'Unauthorized');
    return;
  }

  if (decoded.role !== 'admin' && decoded.role !== 'dev') {
    console.log(`[터미널] 권한 없음 (role: ${decoded.role}) — 연결 거부`);
    ws.close(4003, 'Forbidden');
    return;
  }

  console.log(`[터미널] 연결됨 (uid: ${decoded.uid})`);

  ws._subscribedSession = 'cto'; // 기본 구독
  clients.add(ws);

  // 연결 직후 세션 상태 전송
  ws.send(JSON.stringify({
    type: 'session.status',
    sessions: collectSessionStatus(),
  }));

  // 기본 세션(cto) 히스토리 전송
  const ctoOutput = capturePane(SESSION_CONFIGS.cto.tmuxSession);
  if (ctoOutput !== null) {
    ws.send(JSON.stringify({
      type: 'session.history',
      sessionId: 'cto',
      data: ctoOutput,
      lineCount: ctoOutput.split('\n').length,
    }));
  }

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'subscribe': {
        ws._subscribedSession = msg.sessionId;
        break;
      }

      case 'request.history': {
        const sessionId = msg.sessionId;
        const config = SESSION_CONFIGS[sessionId];
        if (!config) break;

        const lines = msg.lines ?? SCROLLBACK;
        const output = capturePane(config.tmuxSession, lines);
        if (output !== null) {
          ws.send(JSON.stringify({
            type: 'session.history',
            sessionId,
            data: output,
            lineCount: output.split('\n').length,
          }));
        } else {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'CAPTURE_FAILED',
            message: `tmux 세션 ${config.tmuxSession} 캡처에 실패했습니다`,
            sessionId,
          }));
        }
        break;
      }

      case 'terminal.input': {
        const { sessionId, data, sendEnter = true } = msg;
        const config = SESSION_CONFIGS[sessionId];
        if (!config) break;

        // 위험 명령 필터링
        const check = checkDangerousInput(data);
        logInput(sessionId, data, check.blocked);

        if (check.blocked) {
          ws.send(JSON.stringify({
            type: 'input.blocked',
            sessionId,
            input: data,
            reason: check.reason,
          }));
          break;
        }

        if (!tmuxSessionExists(config.tmuxSession)) {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'SESSION_NOT_FOUND',
            message: `tmux 세션 ${config.tmuxSession}이 존재하지 않습니다`,
            sessionId,
          }));
          break;
        }

        try {
          sendKeys(config.tmuxSession, data, sendEnter);
        } catch {
          ws.send(JSON.stringify({
            type: 'error',
            code: 'SEND_FAILED',
            message: '입력 전달에 실패했습니다',
            sessionId,
          }));
        }
        break;
      }
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[터미널] 연결 해제 (uid: ${decoded.uid})`);
  });

  ws.on('error', (err) => {
    console.error('[터미널] WebSocket 에러:', err.message);
    clients.delete(ws);
  });
});

// ── 캡처 루프 (100ms 폴링) ──

setInterval(() => {
  for (const [id, config] of Object.entries(SESSION_CONFIGS)) {
    const curr = capturePane(config.tmuxSession);
    if (curr === null) continue;

    const prev = previousOutput[id];
    if (curr === prev) continue;

    const diff = computeDiff(prev, curr);
    previousOutput[id] = curr;

    if (diff.trim() === '') continue;

    broadcastToSession(id, {
      type: 'terminal.output',
      sessionId: id,
      data: diff,
      timestamp: new Date().toISOString(),
    });
  }
}, POLL_INTERVAL);

// ── 상태 브로드캐스트 (5초마다) ──

setInterval(() => {
  if (clients.size === 0) return;
  broadcast({
    type: 'session.status',
    sessions: collectSessionStatus(),
  });
}, 5000);

// ── 시작 ──

ensureLogDir();

console.log(`[터미널] WebSocket 서버 시작 — 포트 ${WS_PORT}`);
console.log(`[터미널] 폴링 간격: ${POLL_INTERVAL}ms, 스크롤백: ${SCROLLBACK}줄`);
console.log(`[터미널] JWT 인증: ${JWT_SECRET ? '활성화' : '비활성화 (개발 환경)'}`);

// tmux 세션 초기 상태 출력
for (const [id, config] of Object.entries(SESSION_CONFIGS)) {
  const exists = tmuxSessionExists(config.tmuxSession);
  console.log(`[터미널] ${config.displayName} (${config.tmuxSession}): ${exists ? '활성' : '비활성'}`);
}

wss.on('error', (err) => {
  console.error('[터미널] 서버 에러:', err);
});

process.on('SIGTERM', () => {
  console.log('[터미널] SIGTERM 수신 — 종료 중...');
  wss.close(() => process.exit(0));
});
