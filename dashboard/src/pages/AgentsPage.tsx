import { useState, useMemo } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { useAgents, type Agent } from '../hooks/useApi';

const STATUS_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'running', label: '실행중' },
  { value: 'idle', label: '대기' },
  { value: 'paused', label: '일시정지' },
  { value: 'error', label: '오류' },
  { value: 'terminated', label: '종료' },
];

const ROLE_LABELS: Record<string, string> = {
  leader: '리더',
  developer: '개발자',
  qa: 'QA',
  pm: 'PM',
  coo: 'COO',
};

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

function AgentGridCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <span className="text-3xl">{agent.icon ?? '🤖'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">
            {agent.displayName ?? agent.name}
          </h3>
          <div className="flex items-center gap-2 mt-1">
            <StatusBadge value={agent.status} />
            <span className="text-xs text-gray-400">
              {ROLE_LABELS[agent.role] ?? agent.role}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-3 space-y-1.5">
        {agent.team && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">팀</span>
            <span className="text-gray-700">{agent.team}</span>
          </div>
        )}
        {agent.model && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">모델</span>
            <span className="text-gray-700 font-mono">{agent.model}</span>
          </div>
        )}
        <div className="flex items-center gap-2 text-xs">
          <span className="text-gray-400">월 비용</span>
          <span className="text-gray-700 font-medium">{formatCents(agent.spentMonthlyCents)}</span>
        </div>
        {agent.lastHeartbeatAt && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400">마지막 활동</span>
            <span className="text-gray-500">{timeAgo(agent.lastHeartbeatAt)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function AgentsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const { data: agents, isLoading } = useAgents();

  const filtered = useMemo(() => {
    if (!agents) return [];
    let result = agents;
    if (statusFilter !== 'all') {
      result = result.filter((a) => a.status === statusFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (a) =>
          (a.displayName ?? a.name).toLowerCase().includes(q) ||
          a.role.toLowerCase().includes(q) ||
          (a.team ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [agents, statusFilter, search]);

  if (isLoading) {
    return <div className="text-gray-400 text-sm">불러오는 중...</div>;
  }

  const statusCounts = useMemo(() => {
    if (!agents) return {};
    const counts: Record<string, number> = {};
    for (const a of agents) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">에이전트 관리</h2>

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f.label}
              {f.value !== 'all' && statusCounts[f.value] ? (
                <span className="ml-1 opacity-70">{statusCounts[f.value]}</span>
              ) : null}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <span className="text-xs text-gray-400">{filtered.length}명</span>
      </div>

      {/* 에이전트 그리드 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((a) => (
          <AgentGridCard key={a.id} agent={a} />
        ))}
      </div>
      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">에이전트 없음</div>
      )}
    </div>
  );
}
