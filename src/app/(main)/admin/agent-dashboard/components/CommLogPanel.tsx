'use client';

import type { CommLog, TeamId } from '@/types/agent-dashboard';

interface CommLogPanelProps {
  logs: CommLog[];
}

const TEAM_COLORS: Record<TeamId, string> = {
  pm: '#8B5CF6',
  marketing: '#F59E0B',
  cto: '#6366F1',
};

function formatLogTime(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

export function CommLogPanel({ logs }: CommLogPanelProps) {
  // 최신 순 정렬
  const sortedLogs = [...logs].sort(
    (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
  );

  return (
    <div
      className="bg-[#F8FAFC] rounded-xl border border-gray-100 p-4"
      style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">💬</span>
        <h2 className="text-sm font-semibold text-[#0F172A]">
          팀 간 소통 로그
        </h2>
      </div>

      <div className="border-t border-gray-100 mb-3" />

      {/* 로그 목록 */}
      <div className="flex flex-col gap-3 max-h-64 overflow-y-auto pr-1">
        {sortedLogs.length === 0 ? (
          <p className="text-xs text-[#64748B]">소통 로그 없음</p>
        ) : (
          sortedLogs.map((log, idx) => {
            const fromColor = TEAM_COLORS[log.team] ?? '#64748B';
            return (
              <div key={idx} className="flex gap-3">
                {/* 시간 */}
                <span className="text-xs text-[#64748B] shrink-0 w-10 mt-0.5">
                  {formatLogTime(log.time)}
                </span>

                {/* 내용 */}
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-semibold" style={{ color: fromColor }}>
                      {log.from}
                    </span>
                    {log.to && (
                      <>
                        <span className="text-[#64748B]">→</span>
                        <span className="text-[#64748B]">{log.to}</span>
                      </>
                    )}
                  </div>
                  <p className="text-sm text-[#0F172A] leading-snug">
                    &ldquo;{log.msg}&rdquo;
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
