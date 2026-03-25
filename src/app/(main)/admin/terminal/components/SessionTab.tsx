'use client';

import type { TerminalSessionId, ConnectionStatus } from '@/types/web-terminal';

interface Props {
  id: TerminalSessionId;
  displayName: string;
  emoji: string;
  color: string;
  status: ConnectionStatus;
  lastOutput?: string;
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
  displayName,
  emoji,
  status,
  lastOutput,
  isActive,
  onClick,
}: Props) {
  const indicator = STATUS_INDICATOR[status];

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-lg transition-all ${
        isActive
          ? 'bg-[#F75D5D]/10 border-l-4 border-[#F75D5D]'
          : 'hover:bg-gray-50 border-l-4 border-transparent'
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-base">{emoji}</span>
        <span
          className="font-medium text-sm flex-1 truncate"
          style={{ color: isActive ? '#F75D5D' : '#1e1e1e' }}
        >
          {displayName}
        </span>
        <span
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: indicator.color }}
          title={indicator.label}
        />
      </div>
      {lastOutput && (
        <p className="text-xs text-gray-400 mt-0.5 ml-6 truncate font-mono">
          {lastOutput}
        </p>
      )}
    </button>
  );
}
