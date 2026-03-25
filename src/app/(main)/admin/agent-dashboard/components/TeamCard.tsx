'use client';

import type { TeamState, TeamStatus } from '@/types/agent-dashboard';
import { TeamMemberChip } from './TeamMemberChip';
import { TaskList } from './TaskList';

interface TeamCardProps {
  team: TeamState;
}

const TEAM_STATUS_CONFIG: Record<
  TeamStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  active: {
    label: '운영 중',
    dotClass: 'bg-green-500',
    textClass: 'text-green-600',
  },
  planned: {
    label: '계획',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-600',
  },
  idle: {
    label: '대기',
    dotClass: 'bg-gray-400',
    textClass: 'text-gray-500',
  },
};

export function TeamCard({ team }: TeamCardProps) {
  const statusConfig = TEAM_STATUS_CONFIG[team.status];

  return (
    <div
      className="bg-[#F8FAFC] rounded-xl border border-gray-100 border-l-4 shadow-sm flex flex-col gap-0 overflow-hidden"
      style={{
        borderLeftColor: team.color,
        fontFamily: 'Pretendard, system-ui, sans-serif',
      }}
    >
      {/* 상단: 팀명 + 상태 */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{team.emoji}</span>
          <span className="font-semibold text-[#0F172A] text-base">
            {team.name}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-block w-2 h-2 rounded-full ${statusConfig.dotClass}`}
          />
          <span className={`text-xs font-medium ${statusConfig.textClass}`}>
            {statusConfig.label}
          </span>
        </div>
      </div>

      <div className="border-t border-gray-100 mx-4" />

      {/* 중단: 멤버 목록 */}
      <div className="px-4 py-3 flex flex-col gap-1.5">
        {team.members.map((member) => (
          <TeamMemberChip key={member.name} member={member} />
        ))}
        {team.members.length === 0 && (
          <p className="text-xs text-[#64748B]">멤버 없음</p>
        )}
      </div>

      <div className="border-t border-gray-100 mx-4" />

      {/* 하단: TASK 목록 */}
      <div className="px-4 py-3">
        <TaskList tasks={team.tasks} />
      </div>
    </div>
  );
}
