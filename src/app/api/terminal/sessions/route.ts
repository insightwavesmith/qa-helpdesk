import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { requireAdmin } from '@/app/api/admin/_shared';
import type { TerminalSessionId } from '@/types/web-terminal';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';

const WS_PORT = process.env.TERMINAL_WS_PORT ?? '3001';

interface SessionInfo {
  id: TerminalSessionId;
  tmuxSession: string;
  displayName: string;
  emoji: string;
  color: string;
  exists: boolean;
  attached: boolean;
  lastActivity: string;
}

function tmuxListSessions(): Record<string, { attached: boolean; lastActivity: string }> {
  try {
    const output = execSync(
      "tmux list-sessions -F '#{session_name}:#{session_attached}:#{session_activity}' 2>/dev/null",
      { encoding: 'utf8', timeout: 3000 },
    );
    const result: Record<string, { attached: boolean; lastActivity: string }> = {};
    for (const line of output.trim().split('\n')) {
      if (!line) continue;
      const parts = line.split(':');
      if (parts.length < 3) continue;
      const [name, attached, activity] = parts;
      // activity는 unix timestamp (초)
      const lastActivity = new Date(parseInt(activity, 10) * 1000).toISOString();
      result[name] = { attached: attached === '1', lastActivity };
    }
    return result;
  } catch {
    return {};
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  const tmuxSessions = tmuxListSessions();

  const sessions: SessionInfo[] = Object.entries(TERMINAL_SESSIONS).map(([id, config]) => {
    const tmuxInfo = tmuxSessions[config.tmuxSession];
    return {
      id: id as TerminalSessionId,
      tmuxSession: config.tmuxSession,
      displayName: config.displayName,
      emoji: config.emoji,
      color: config.color,
      exists: !!tmuxInfo,
      attached: tmuxInfo?.attached ?? false,
      lastActivity: tmuxInfo?.lastActivity ?? new Date().toISOString(),
    };
  });

  return NextResponse.json({
    ok: true,
    sessions,
    wsUrl: `ws://localhost:${WS_PORT}`,
  });
}
