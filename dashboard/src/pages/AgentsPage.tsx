import { useState, useMemo } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { PageSkeleton } from '../components/PageSkeleton';
import { useAgents, type Agent } from '../hooks/useApi';
import { cn, formatCents, timeAgo } from '../lib/utils';
import { Bot, List, LayoutGrid } from 'lucide-react';

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

function AgentGridCard({ agent }: { agent: Agent }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <Bot className="h-4 w-4 text-gray-500" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 overflow-hidden whitespace-nowrap text-ellipsis">
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
          <span className="text-gray-700 font-medium tabular-nums">
            {formatCents(agent.spentMonthlyCents)}
          </span>
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

function AgentListRow({ agent }: { agent: Agent }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors border-b border-gray-100 last:border-b-0">
      <div className="relative shrink-0">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
          <Bot className="h-3.5 w-3.5 text-gray-500" />
        </div>
        <span
          className={cn(
            'absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white',
            agent.status === 'running' ? 'bg-primary' :
            agent.status === 'error' ? 'bg-red-500' :
            agent.status === 'paused' ? 'bg-amber-400' : 'bg-gray-300',
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-gray-900">{agent.displayName ?? agent.name}</span>
        <span className="text-xs text-gray-400 ml-2">
          {ROLE_LABELS[agent.role] ?? agent.role}
          {agent.team ? ` · ${agent.team}` : ''}
        </span>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {agent.model && (
          <span className="text-xs text-gray-500 font-mono hidden sm:inline">{agent.model}</span>
        )}
        <span className="text-xs text-gray-400 hidden sm:inline tabular-nums">
          {agent.lastHeartbeatAt ? timeAgo(agent.lastHeartbeatAt) : '-'}
        </span>
        <StatusBadge value={agent.status} />
      </div>
    </div>
  );
}

export function AgentsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('list');
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

  const statusCounts = useMemo(() => {
    if (!agents) return {};
    const counts: Record<string, number> = {};
    for (const a of agents) {
      counts[a.status] = (counts[a.status] ?? 0) + 1;
    }
    return counts;
  }, [agents]);

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (!agents || agents.length === 0) {
    return <EmptyState icon={Bot} message="등록된 에이전트 없음" />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-900">에이전트 관리</h2>
        {/* 뷰 토글 */}
        <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
          <button
            className={cn(
              'p-2 transition-colors',
              view === 'list' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50',
            )}
            onClick={() => setView('list')}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            className={cn(
              'p-2 transition-colors',
              view === 'grid' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:bg-gray-50',
            )}
            onClick={() => setView('grid')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                statusFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
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

      {/* 리스트 뷰 */}
      {view === 'list' && filtered.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          {filtered.map((a) => (
            <AgentListRow key={a.id} agent={a} />
          ))}
        </div>
      )}

      {/* 그리드 뷰 */}
      {view === 'grid' && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((a) => (
            <AgentGridCard key={a.id} agent={a} />
          ))}
        </div>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">필터 조건에 맞는 에이전트 없음</div>
      )}
    </div>
  );
}
