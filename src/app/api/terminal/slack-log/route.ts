import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { requireAdmin } from '@/app/api/admin/_shared';
import type { SlackLogEntry } from '@/types/web-terminal';
import type { TeamId } from '@/types/agent-dashboard';

const SLACK_QUEUE_FILE = '/tmp/cross-team/slack/queue.jsonl';

function parseSlackLog(limit: number): SlackLogEntry[] {
  try {
    const content = readFileSync(SLACK_QUEUE_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);

    const entries: SlackLogEntry[] = [];

    for (const line of lines) {
      try {
        const raw = JSON.parse(line);
        // queue.jsonl 형식에서 SlackLogEntry로 매핑
        const entry: SlackLogEntry = {
          event:   raw.event ?? raw.type ?? 'unknown',
          team:    (raw.team ?? raw.teamId ?? 'pm') as TeamId,
          title:   raw.title ?? raw.subject ?? '',
          message: raw.message ?? raw.text ?? '',
          sentAt:  raw.sentAt ?? raw.timestamp ?? raw.createdAt ?? new Date().toISOString(),
          status:  raw.status === 'failed' ? 'failed' : 'sent',
        };
        entries.push(entry);
      } catch {
        // 파싱 실패한 줄 무시
      }
    }

    // 최신 N개 반환 (줄 순서는 오래된 것이 먼저이므로 뒤에서부터 자름)
    return entries.slice(-limit).reverse();
  } catch {
    // 파일 없거나 읽기 실패 시 빈 배열 반환
    return [];
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  const logs = parseSlackLog(limit);

  return NextResponse.json({ ok: true, logs });
}
