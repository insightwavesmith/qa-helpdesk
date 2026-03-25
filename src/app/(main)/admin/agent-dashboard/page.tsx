'use client';

import { useDashboardState } from './components/useDashboardState';
import { DashboardHeader } from './components/DashboardHeader';
import { OrgChart } from './components/OrgChart';
import { TeamCard } from './components/TeamCard';
import { CommLogPanel } from './components/CommLogPanel';
import { BackgroundPanel } from './components/BackgroundPanel';
import { PdcaStatusPanel } from './components/PdcaStatusPanel';
import type { TeamId } from '@/types/agent-dashboard';

const TEAM_ORDER: TeamId[] = ['pm', 'marketing', 'cto'];

export default function AgentDashboardPage() {
  const { data, isLoading, error, getConnectionStatus } = useDashboardState();

  if (isLoading && !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-12 bg-gray-200 rounded" />
          <div className="h-32 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-64 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 text-center text-red-500">
        데이터를 불러오지 못했습니다: {error.message}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8 text-center text-gray-500">
        데이터를 불러오는 중...
      </div>
    );
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-6">
        <DashboardHeader
          connection={{
            status: getConnectionStatus(),
            lastPing: data.updatedAt,
          }}
        />

        <OrgChart org={data.org} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {TEAM_ORDER.map((teamId) => (
            <TeamCard key={teamId} team={data.teams[teamId]} />
          ))}
        </div>

        <CommLogPanel logs={data.logs} />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <BackgroundPanel tasks={data.background} />
          </div>
          <PdcaStatusPanel pdca={data.pdca} />
        </div>
      </div>
    </div>
  );
}
