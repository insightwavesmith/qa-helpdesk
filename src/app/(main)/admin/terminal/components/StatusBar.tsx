'use client';

import type { TerminalSessionId, TerminalSession, ConnectionStatus } from '@/types/web-terminal';
import { TERMINAL_SESSIONS } from '@/types/web-terminal';

interface Props {
  activeSession: TerminalSessionId;
  session: TerminalSession | null;
  connectionStatus: ConnectionStatus;
  latencyMs?: number;
}

const STATUS_COLOR: Record<ConnectionStatus, string> = {
  connected:    '#10b981',
  connecting:   '#f59e0b',
  disconnected: '#6b7280',
  error:        '#ef4444',
};

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected:    '연결됨',
  connecting:   '연결 중...',
  disconnected: '연결 끊김',
  error:        '연결 오류',
};

export default function StatusBar({ activeSession, session, connectionStatus, latencyMs }: Props) {
  const config = TERMINAL_SESSIONS[activeSession];
  const statusColor = STATUS_COLOR[connectionStatus];

  return (
    <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500 font-mono">
      <span className="font-semibold text-gray-700">
        {config.emoji} {config.displayName}
      </span>
      <span className="text-gray-300">|</span>
      <span>{config.tmuxSession}</span>
      <span className="text-gray-300">|</span>
      <span style={{ color: statusColor }}>
        {STATUS_LABEL[connectionStatus]}
      </span>
      {session?.bufferSize != null && session.bufferSize > 0 && (
        <>
          <span className="text-gray-300">|</span>
          <span>버퍼 {session.bufferSize}줄</span>
        </>
      )}
      {latencyMs != null && (
        <>
          <span className="text-gray-300">|</span>
          <span>지연 {latencyMs}ms</span>
        </>
      )}
      {session?.lastOutputAt && (
        <>
          <span className="text-gray-300">|</span>
          <span>
            마지막 출력:{' '}
            {new Date(session.lastOutputAt).toLocaleTimeString('ko-KR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false,
            })}
          </span>
        </>
      )}
    </div>
  );
}
