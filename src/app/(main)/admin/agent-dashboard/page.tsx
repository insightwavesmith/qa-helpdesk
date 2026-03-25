'use client';

import { useState } from 'react';
import { useDashboardState } from './components/useDashboardState';
import { DashboardHeader } from './components/DashboardHeader';
import { OrgChart } from './components/OrgChart';
import { TeamCard } from './components/TeamCard';
import { CommLogPanel } from './components/CommLogPanel';
import { BackgroundPanel } from './components/BackgroundPanel';
import { PdcaStatusPanel } from './components/PdcaStatusPanel';
import dynamic from 'next/dynamic';
import type { TeamId } from '@/types/agent-dashboard';

const TerminalTab = dynamic(() => import('./components/TerminalTab'), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-96 text-gray-400 text-sm">
      터미널 로딩 중...
    </div>
  ),
});

const PdcaTab = dynamic(() => import('./components/PdcaTab'), {
  ssr: false,
});

type TabId = 'dashboard' | 'terminal' | 'pdca';

const TABS: { id: TabId; label: string; emoji: string }[] = [
  { id: 'dashboard', label: '대시보드', emoji: '📊' },
  { id: 'terminal', label: '터미널', emoji: '📡' },
  { id: 'pdca', label: 'PDCA', emoji: '🔄' },
];

const TEAM_ORDER: TeamId[] = ['pm', 'marketing', 'cto'];

export default function AgentDashboardPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
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
        {/* 헤더 + 탭 */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <DashboardHeader
            connection={{
              status: getConnectionStatus(),
              lastPing: data.updatedAt,
            }}
          />

          {/* 탭 네비게이션 */}
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-md transition-all ${
                  activeTab === tab.id
                    ? 'bg-white text-[#F75D5D] shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <span>{tab.emoji}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 대시보드 탭 */}
        {activeTab === 'dashboard' && (
          <>
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
          </>
        )}

        {/* 터미널 탭 */}
        {activeTab === 'terminal' && <TerminalTab />}

        {/* PDCA 탭 */}
        {activeTab === 'pdca' && <PdcaTab pdca={data.pdca} />}
      </div>
    </div>
  );
}
