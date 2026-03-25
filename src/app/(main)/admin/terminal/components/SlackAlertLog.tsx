'use client';

import { useEffect, useState } from 'react';
import type { SlackLogEntry } from '@/types/web-terminal';

const EVENT_ICON: Record<string, string> = {
  'chain.handoff': '🔗',
  'task.completed': '✅',
  'task.started': '🚀',
  'task.failed': '❌',
  'session.started': '▶️',
  'session.ended': '⏹️',
};

function getIcon(event: string): string {
  return EVENT_ICON[event] ?? '📣';
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return '--:--';
  }
}

export default function SlackAlertLog() {
  const [logs, setLogs] = useState<SlackLogEntry[]>([]);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const res = await fetch('/api/terminal/slack-log?limit=20');
        if (res.ok) {
          const data = (await res.json()) as { ok: boolean; logs: SlackLogEntry[] };
          if (data.ok) setLogs(data.logs);
        }
      } catch {
        // 조용히 실패 (로그 없으면 그냥 빈 상태)
      }
    };

    fetchLogs();
    const interval = setInterval(fetchLogs, 10000); // 10초 폴링
    return () => clearInterval(interval);
  }, []);

  if (logs.length === 0) {
    return (
      <div className="text-xs text-gray-400 text-center py-4">
        슬랙 알림 없음
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {logs.map((log, i) => (
        <div key={i} className="flex items-start gap-1.5 py-1">
          <span className="text-xs text-gray-400 flex-shrink-0 w-10 mt-0.5">
            {formatTime(log.sentAt)}
          </span>
          <span className="text-sm flex-shrink-0">{getIcon(log.event)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-700 truncate">{log.title || log.event}</p>
            {log.message && (
              <p className="text-xs text-gray-500 truncate">{log.message}</p>
            )}
          </div>
          {log.status === 'failed' && (
            <span className="text-xs text-red-400 flex-shrink-0">실패</span>
          )}
        </div>
      ))}
    </div>
  );
}
