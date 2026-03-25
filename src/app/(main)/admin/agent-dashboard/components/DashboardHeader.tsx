'use client';

interface ConnectionProps {
  status: 'live' | 'stale' | 'disconnected';
  lastPing: string;
}

interface DashboardHeaderProps {
  connection: ConnectionProps;
}

function formatTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--:--';
  }
}

const STATUS_CONFIG: Record<
  ConnectionProps['status'],
  { label: string; dotClass: string }
> = {
  live: { label: 'LIVE', dotClass: 'bg-green-500' },
  stale: { label: 'STALE', dotClass: 'bg-amber-500' },
  disconnected: { label: 'DISCONNECTED', dotClass: 'bg-red-500' },
};

export function DashboardHeader({ connection }: DashboardHeaderProps) {
  const config = STATUS_CONFIG[connection.status];

  return (
    <header
      className="flex items-center justify-between px-6 py-4 bg-white border-b border-gray-100"
      style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}
    >
      {/* 타이틀 */}
      <div className="flex items-center gap-2">
        <span className="text-xl">🍡</span>
        <h1 className="text-lg font-semibold text-[#0F172A]">
          bscamp 에이전트 대시보드
        </h1>
      </div>

      {/* 연결 상태 */}
      <div className="flex items-center gap-2">
        <span
          className={`inline-block w-2.5 h-2.5 rounded-full ${config.dotClass} ${
            connection.status === 'live' ? 'animate-pulse' : ''
          }`}
        />
        <span className="text-sm font-medium text-[#0F172A]">
          {config.label}
        </span>
        <span className="text-sm text-[#64748B]">
          {formatTime(connection.lastPing)}
        </span>
      </div>
    </header>
  );
}
