import { NextRequest, NextResponse } from 'next/server';
import { execFileSync } from 'child_process';
import { requireAdmin } from '@/app/api/admin/_shared';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';
import type { TerminalSessionId } from '@/types/web-terminal';

export async function GET(
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

  const { searchParams } = new URL(request.url);
  const lines = parseInt(searchParams.get('lines') ?? '1000', 10);

  const { tmuxSession } = TERMINAL_SESSIONS[sessionId];

  let data: string;
  try {
    data = execFileSync(
      'tmux',
      ['capture-pane', '-t', tmuxSession, '-p', '-S', `-${lines}`],
      { encoding: 'utf8', timeout: 5000 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: 'CAPTURE_FAILED',
        message: `tmux 세션 ${tmuxSession}을 캡처할 수 없습니다. 세션이 활성 상태인지 확인하세요.`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sessionId,
    data,
    lineCount: data.split('\n').length,
    capturedAt: new Date().toISOString(),
  });
}
