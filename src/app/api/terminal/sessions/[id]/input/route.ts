import { NextRequest, NextResponse } from 'next/server';
import { execFileSync, execSync } from 'child_process';
import { requireAdmin } from '@/app/api/admin/_shared';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';
import type { TerminalSessionId } from '@/types/web-terminal';

const BLOCKED_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /rm\s+(-[rRf]+\s+|--recursive|--force)/i, label: 'rm -rf / rm --force' },
  { pattern: /git\s+push\s+--force/i,                  label: 'git push --force' },
  { pattern: /git\s+reset\s+--hard/i,                  label: 'git reset --hard' },
  { pattern: /DROP\s+(TABLE|DATABASE|SCHEMA)/i,          label: 'DROP TABLE/DATABASE' },
  { pattern: /TRUNCATE\s+/i,                            label: 'TRUNCATE' },
  { pattern: /DELETE\s+FROM\s+\w+\s*(;|\s*$)/i,         label: 'DELETE FROM (조건 없음)' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\};:/i,             label: 'fork bomb' },
  { pattern: /mkfs\./i,                                 label: 'mkfs (디스크 포맷)' },
  { pattern: /dd\s+if=/i,                               label: 'dd (디스크 덮어쓰기)' },
  { pattern: />\s*\/dev\/sd/i,                          label: '/dev/sd 덮어쓰기' },
];

function checkDangerous(input: string): { blocked: boolean; reason?: string } {
  for (const { pattern, label } of BLOCKED_PATTERNS) {
    if (pattern.test(input)) {
      return { blocked: true, reason: `위험 명령 감지: ${label}` };
    }
  }
  return { blocked: false };
}

function tmuxSessionExists(session: string): boolean {
  try {
    execSync(`tmux has-session -t ${session} 2>/dev/null`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  const { id } = await params;
  const sessionId = id as TerminalSessionId;

  if (!TERMINAL_SESSIONS[sessionId]) {
    return NextResponse.json(
      { ok: false, error: 'SESSION_NOT_FOUND', message: `알 수 없는 세션 ID: ${sessionId}` },
      { status: 404 },
    );
  }

  let body: { data?: string; sendEnter?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'INVALID_BODY', message: '요청 본문을 파싱할 수 없습니다' },
      { status: 400 },
    );
  }

  const { data, sendEnter = true } = body;

  if (!data || typeof data !== 'string') {
    return NextResponse.json(
      { ok: false, error: 'MISSING_DATA', message: 'data 필드가 필요합니다' },
      { status: 400 },
    );
  }

  // 위험 명령 필터링
  const check = checkDangerous(data);
  if (check.blocked) {
    return NextResponse.json(
      { ok: false, error: 'INPUT_BLOCKED', reason: check.reason },
      { status: 400 },
    );
  }

  const { tmuxSession } = TERMINAL_SESSIONS[sessionId];

  if (!tmuxSessionExists(tmuxSession)) {
    return NextResponse.json(
      {
        ok: false,
        error: 'SESSION_NOT_FOUND',
        message: `tmux 세션 ${tmuxSession}이 존재하지 않습니다`,
      },
      { status: 404 },
    );
  }

  try {
    const args = ['send-keys', '-t', tmuxSession, data];
    if (sendEnter) args.push('Enter');
    execFileSync('tmux', args, { timeout: 3000 });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'SEND_FAILED', message: '입력 전달에 실패했습니다' },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, sessionId });
}
