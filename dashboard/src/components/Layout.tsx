import { NavLink, Outlet } from 'react-router-dom';
import { useAgents, useUnreadCount } from '../hooks/useApi';

const NAV_ITEMS = [
  { to: '/', label: '대시보드', icon: '📊' },
  { to: '/tickets', label: '태스크', icon: '📋' },
  { to: '/agents', label: '에이전트', icon: '🤖' },
  { to: '/costs', label: '비용', icon: '💰' },
  { to: '/org', label: '조직도', icon: '👥' },
  { to: '/chains', label: '체인', icon: '🔗' },
  { to: '/activity', label: '활동', icon: '📜' },
];

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-primary',
    idle: 'bg-gray-300',
    paused: 'bg-amber-400',
    error: 'bg-red-500',
    terminated: 'bg-gray-200',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-gray-300'}`} />;
}

export function Layout() {
  const { data: agents } = useAgents();
  const { data: unreadData } = useUnreadCount();
  const unreadCount = unreadData?.count ?? 0;

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* 사이드바 */}
      <aside className="w-60 border-r border-gray-200 bg-white flex flex-col">
        {/* 로고 */}
        <div className="px-5 py-4 border-b border-gray-100">
          <h1 className="text-lg font-bold text-primary">bkit 대시보드</h1>
        </div>

        {/* 네비게이션 */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* 에이전트 목록 */}
        {agents && agents.length > 0 && (
          <div className="px-3 py-4 border-t border-gray-100">
            <p className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">에이전트</p>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600">
                  <StatusDot status={a.status} />
                  <span className="truncate">{a.displayName ?? a.name}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* 메인 */}
      <div className="flex-1 flex flex-col">
        {/* 상단바 */}
        <header className="h-14 border-b border-gray-200 bg-white flex items-center justify-end px-6">
          <button className="relative p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
            <span className="text-xl">🔔</span>
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
