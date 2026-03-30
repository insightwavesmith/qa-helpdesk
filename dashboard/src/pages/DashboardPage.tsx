import { MetricCard } from '../components/MetricCard';
import { StatusBadge } from '../components/StatusBadge';
import { useDashboardSummary, useAgents, useNotifications } from '../hooks/useApi';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export function DashboardPage() {
  const { data: summary, isLoading: summaryLoading } = useDashboardSummary();
  const { data: agents } = useAgents();
  const { data: notifications } = useNotifications(5);

  if (summaryLoading) {
    return <div className="text-gray-400 text-sm">불러오는 중...</div>;
  }

  const ticketCount = (status: string) =>
    summary?.tickets.find((t) => t.status === status)?.count ?? 0;
  const agentCount = (status: string) =>
    summary?.agents.find((a) => a.status === status)?.count ?? 0;
  const totalAgents = summary?.agents.reduce((s, a) => s + a.count, 0) ?? 0;
  const activeAgents = agentCount('running') + agentCount('idle');

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-gray-900">대시보드</h2>

      {/* 상단 메트릭 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          icon="🤖"
          label="에이전트"
          value={`${activeAgents}/${totalAgents}`}
          sub={`실행중 ${agentCount('running')}`}
        />
        <MetricCard
          icon="📋"
          label="진행중 태스크"
          value={ticketCount('in_progress')}
          sub={`전체 ${summary?.tickets.reduce((s, t) => s + t.count, 0) ?? 0}`}
        />
        <MetricCard
          icon="💰"
          label="총 비용"
          value={formatCents(summary?.totalCostCents ?? 0)}
          sub={`미해결 예산 ${summary?.openBudgetIncidents ?? 0}건`}
        />
        <MetricCard
          icon="🔄"
          label="PDCA 피처"
          value={summary?.pdcaFeatures.reduce((s, p) => s + p.count, 0) ?? 0}
          sub={summary?.pdcaFeatures.map((p) => `${p.phase} ${p.count}`).join(', ') || '없음'}
        />
      </div>

      {/* 에이전트 상태 테이블 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">에이전트 현황</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">이름</th>
                <th className="px-5 py-3 font-medium">상태</th>
                <th className="px-5 py-3 font-medium">역할</th>
                <th className="px-5 py-3 font-medium">모델</th>
                <th className="px-5 py-3 font-medium text-right">월 비용</th>
                <th className="px-5 py-3 font-medium">마지막 활동</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {agents?.map((agent) => (
                <tr key={agent.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <span className="mr-1">{agent.icon ?? '🤖'}</span>
                    {agent.displayName ?? agent.name}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge value={agent.status} />
                  </td>
                  <td className="px-5 py-3 text-gray-600">{agent.role}</td>
                  <td className="px-5 py-3 text-gray-500 text-xs font-mono">{agent.model ?? '-'}</td>
                  <td className="px-5 py-3 text-right text-gray-700">{formatCents(agent.spentMonthlyCents ?? 0)}</td>
                  <td className="px-5 py-3 text-gray-400 text-xs">
                    {agent.lastHeartbeatAt ? timeAgo(agent.lastHeartbeatAt) : '-'}
                  </td>
                </tr>
              ))}
              {(!agents || agents.length === 0) && (
                <tr><td colSpan={6} className="px-5 py-8 text-center text-gray-400">등록된 에이전트 없음</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 최근 이벤트 */}
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">최근 알림</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {notifications?.map((n) => (
            <div key={n.id} className="px-5 py-3 flex items-start gap-3">
              <span className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                n.type === 'error' ? 'bg-red-500' :
                n.type === 'warning' ? 'bg-amber-400' :
                n.type === 'success' ? 'bg-emerald-500' : 'bg-blue-400'
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900">{n.title}</p>
                <p className="text-xs text-gray-500 truncate">{n.message}</p>
              </div>
              <span className="text-xs text-gray-400 flex-shrink-0">{timeAgo(n.createdAt)}</span>
            </div>
          ))}
          {(!notifications || notifications.length === 0) && (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">알림 없음</div>
          )}
        </div>
      </div>
    </div>
  );
}
