'use client';

import type { OrgChart as OrgChartType, TeamId } from '@/types/agent-dashboard';

interface OrgChartProps {
  org: OrgChartType;
}

const TEAM_COLORS: Record<TeamId, string> = {
  pm: '#8B5CF6',
  marketing: '#F59E0B',
  cto: '#6366F1',
};

export function OrgChart({ org }: OrgChartProps) {
  return (
    <div
      className="bg-[#F8FAFC] rounded-xl border border-gray-100 p-6"
      style={{ fontFamily: 'Pretendard, system-ui, sans-serif' }}
    >
      <h2 className="text-sm font-semibold text-[#64748B] mb-4 uppercase tracking-wide">
        조직도
      </h2>

      {/* CEO */}
      <div className="flex flex-col items-center gap-1">
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm text-center">
          <div className="text-sm font-semibold text-[#0F172A]">
            {org.ceo.name}
          </div>
          <div className="text-xs text-[#64748B]">{org.ceo.title}</div>
        </div>

        {/* CEO → COO 화살표 */}
        <div className="text-gray-400 text-lg leading-none">↓</div>

        {/* COO */}
        <div className="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm text-center">
          <div className="text-sm font-semibold text-[#0F172A]">
            {org.coo.name}
          </div>
          <div className="text-xs text-[#64748B]">{org.coo.title}</div>
        </div>

        {/* COO → 팀들 화살표 */}
        <div className="flex items-start gap-2">
          {/* 세로선 + 가로 분기 */}
          <div className="flex flex-col items-center">
            <div className="w-px h-4 bg-gray-300" />
            <div
              className="h-px bg-gray-300"
              style={{ width: `${Math.max(org.teams.length - 1, 1) * 140}px` }}
            />
          </div>
        </div>

        {/* 팀들 */}
        <div className="flex gap-4 mt-1">
          {org.teams.map((team) => {
            const color = TEAM_COLORS[team.id] ?? '#64748B';
            return (
              <div
                key={team.id}
                className="flex flex-col items-center gap-1"
              >
                <div className="w-px h-4 bg-gray-300" />
                <div
                  className="bg-white rounded-lg px-4 py-3 shadow-sm text-center border-t-4 min-w-[120px]"
                  style={{ borderTopColor: color }}
                >
                  <div className="text-base mb-1">{team.emoji}</div>
                  <div className="text-sm font-semibold text-[#0F172A]">
                    {team.name}
                  </div>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    {team.memberCount}명
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
