import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useAgents, useUnreadCount } from '../hooks/useApi';
import { cn } from '../lib/utils';
import {
  LayoutDashboard,
  ClipboardList,
  Bot,
  DollarSign,
  Users,
  Link as LinkIcon,
  Activity,
  Bell,
  ChevronRight,
  Repeat,
  Blocks,
  Workflow,
  Box,
  UserCog,
  FileStack,
} from 'lucide-react';

const NAV_ITEMS = [
  { to: '/', label: '대시보드', icon: LayoutDashboard },
  { to: '/tickets', label: '태스크', icon: ClipboardList },
  { to: '/agents', label: '에이전트', icon: Bot },
  { to: '/costs', label: '비용', icon: DollarSign },
  { to: '/org', label: '조직도', icon: Users },
  { to: '/chains', label: '체인', icon: LinkIcon },
  { to: '/routines', label: '루틴', icon: Repeat },
  { to: '/activity', label: '활동', icon: Activity },
];

const BRICK_NAV_ITEMS = [
  { to: '/brick', label: '워크플로우', icon: Workflow },
  { to: '/brick/blocks', label: '블록 카탈로그', icon: Box },
  { to: '/brick/teams', label: '팀 관리', icon: UserCog },
  { to: '/brick/presets', label: '프리셋', icon: FileStack },
];

const STATUS_DOT: Record<string, string> = {
  running: 'bg-primary',
  idle: 'bg-gray-300',
  paused: 'bg-amber-400',
  error: 'bg-red-500',
  terminated: 'bg-gray-200',
};

export function Layout() {
  const { data: agents } = useAgents();
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;
  const [agentsOpen, setAgentsOpen] = useState(true);

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-60 border-r border-gray-200 bg-white flex flex-col shrink-0">
        {/* 로고 */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-lg font-bold text-primary">bkit 대시보드</h1>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                  )
                }
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}

          {/* Brick 섹션 */}
          <div data-testid="brick-nav-section" className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-1 px-3 py-1.5">
              <Blocks className="h-3 w-3 text-gray-400" />
              <span className="text-[10px] font-medium uppercase tracking-widest text-gray-400">
                Brick
              </span>
            </div>
            <div className="space-y-0.5 mt-1">
              {BRICK_NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/brick'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors',
                        isActive
                          ? 'bg-primary/10 text-primary'
                          : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
                      )
                    }
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>

          {/* 에이전트 목록 (Collapsible) */}
          {agents && agents.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <button
                onClick={() => setAgentsOpen(!agentsOpen)}
                className="flex items-center gap-1 px-3 py-1.5 w-full group"
              >
                <ChevronRight
                  className={cn(
                    'h-3 w-3 text-gray-400 transition-transform',
                    agentsOpen && 'rotate-90',
                  )}
                />
                <span className="text-[10px] font-medium uppercase tracking-widest text-gray-400">
                  에이전트
                </span>
              </button>
              {agentsOpen && (
                <div className="space-y-0.5 mt-1">
                  {agents.map((a) => (
                    <div
                      key={a.id}
                      className="flex items-center gap-2.5 px-3 py-1.5 text-[13px] font-medium text-gray-600"
                    >
                      <span
                        className={cn(
                          'inline-block w-2 h-2 rounded-full shrink-0',
                          STATUS_DOT[a.status] ?? 'bg-gray-300',
                        )}
                      />
                      <span className="overflow-hidden whitespace-nowrap text-ellipsis">
                        {a.displayName ?? a.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </nav>
      </aside>

      {/* 메인 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 상단바 */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-end px-6 shrink-0">
          <button className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-primary rounded-full">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
        </header>

        {/* 콘텐츠 */}
        <main className="flex-1 p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
