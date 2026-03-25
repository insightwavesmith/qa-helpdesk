'use client';

import type { BackgroundTask, TeamId } from '@/types/agent-dashboard';

interface BackgroundPanelProps {
  tasks: BackgroundTask[];
}

const TEAM_LABELS: Record<TeamId, string> = {
  pm: 'PM팀',
  marketing: '마케팅팀',
  cto: 'CTO팀',
};

const STATUS_CONFIG: Record<
  BackgroundTask['status'],
  { label: string; icon: string; textClass: string }
> = {
  running: { label: '진행', icon: '', textClass: 'text-blue-500' },
  completed: { label: '완료', icon: '✓', textClass: 'text-green-500' },
  error: { label: '오류', icon: '⚠', textClass: 'text-red-500' },
  paused: { label: '일시정지', icon: '⏸', textClass: 'text-amber-500' },
};

export function BackgroundPanel({ tasks }: BackgroundPanelProps) {
  // 팀별 그룹화
  const grouped = tasks.reduce<Record<string, BackgroundTask[]>>((acc, task) => {
    const key = task.team;
    if (!acc[key]) acc[key] = [];
    acc[key].push(task);
    return acc;
  }, {});

  const teamIds = Object.keys(grouped) as TeamId[];

  return (
    <div
      className="bg-[#F8FAFC] rounded-xl border border-gray-100 p-4"
      style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⏳</span>
        <h2 className="text-sm font-semibold text-[#0F172A]">
          백그라운드 작업
        </h2>
      </div>

      <div className="border-t border-gray-100 mb-3" />

      {/* 팀별 목록 */}
      <div className="flex flex-col gap-4">
        {teamIds.length === 0 && (
          <p className="text-xs text-[#64748B]">진행 중인 작업 없음</p>
        )}
        {teamIds.map((teamId) => {
          const teamTasks = grouped[teamId];
          const teamLabel = TEAM_LABELS[teamId as TeamId] ?? teamId;
          return (
            <div key={teamId}>
              {/* 팀 헤더 */}
              <div className="text-xs font-semibold text-[#64748B] mb-2">
                [{teamLabel}]
              </div>

              {/* 작업 목록 */}
              <div className="flex flex-col gap-2">
                {teamTasks.map((task) => {
                  const progress =
                    task.total > 0
                      ? Math.min(100, Math.round((task.current / task.total) * 100))
                      : 0;
                  const statusConfig = STATUS_CONFIG[task.status];
                  const isCompleted = task.status === 'completed';

                  return (
                    <div key={task.id} className="flex flex-col gap-1">
                      {/* 라벨 + 숫자 */}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#0F172A] font-medium">
                          {task.label}
                        </span>
                        <div className="flex items-center gap-1 text-[#64748B]">
                          {isCompleted ? (
                            <span className={`font-bold ${statusConfig.textClass}`}>
                              {statusConfig.icon}
                            </span>
                          ) : (
                            <>
                              <span>
                                {task.current.toLocaleString()}/
                                {task.total.toLocaleString()}
                              </span>
                              <span className={`font-semibold ${statusConfig.textClass}`}>
                                {progress}%
                              </span>
                              {statusConfig.icon && (
                                <span className={statusConfig.textClass}>
                                  {statusConfig.icon}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>

                      {/* 진행 바 */}
                      <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${progress}%`,
                            backgroundColor: task.color,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
