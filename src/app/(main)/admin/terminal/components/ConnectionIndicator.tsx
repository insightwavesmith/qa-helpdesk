'use client';

import type { ConnectionStatus } from '@/types/web-terminal';

interface Props {
  status: ConnectionStatus;
  retryCount?: number;
  maxRetries?: number;
}

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; dotColor: string; textColor: string; pulse: boolean }
> = {
  connected:    { label: 'LIVE',         dotColor: '#10b981', textColor: '#059669', pulse: true },
  connecting:   { label: '연결 중...',   dotColor: '#f59e0b', textColor: '#d97706', pulse: true },
  disconnected: { label: '연결 끊김',    dotColor: '#6b7280', textColor: '#6b7280', pulse: false },
  error:        { label: '연결 오류',    dotColor: '#ef4444', textColor: '#dc2626', pulse: false },
};

export default function ConnectionIndicator({ status, retryCount, maxRetries = 10 }: Props) {
  const config = STATUS_CONFIG[status];

  return (
    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-gray-100 border border-gray-200">
      <span
        className={`w-2 h-2 rounded-full ${config.pulse ? 'animate-pulse' : ''}`}
        style={{ backgroundColor: config.dotColor }}
      />
      <span className="text-xs font-medium" style={{ color: config.textColor }}>
        {config.label}
        {status === 'disconnected' && retryCount !== undefined && retryCount > 0 && (
          <span className="ml-1 text-gray-400">
            ({retryCount}/{maxRetries})
          </span>
        )}
      </span>
    </div>
  );
}
