import { useState, useMemo } from 'react';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState } from '../components/EmptyState';
import { PageSkeleton } from '../components/PageSkeleton';
import { useTickets, type Ticket } from '../hooks/useApi';
import { cn, timeAgo } from '../lib/utils';
import { ClipboardList, FolderOpen, Users, Bot, Ruler } from 'lucide-react';

const STATUS_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'in_progress', label: '진행중' },
  { value: 'completed', label: '완료' },
  { value: 'backlog', label: '대기' },
  { value: 'todo', label: '할 일' },
  { value: 'in_review', label: '검토중' },
];

function ChecklistBar({ checklist }: { checklist: string }) {
  try {
    const items: { done: boolean }[] = JSON.parse(checklist);
    if (items.length === 0) return null;
    const done = items.filter((i) => i.done).length;
    const pct = Math.round((done / items.length) * 100);
    return (
      <div className="flex items-center gap-2">
        <div className="w-16 bg-gray-100 rounded-full h-1.5">
          <div
            className={cn(
              'h-1.5 rounded-full transition-all',
              pct === 100 ? 'bg-emerald-500' : 'bg-primary',
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 tabular-nums">{done}/{items.length}</span>
      </div>
    );
  } catch {
    return null;
  }
}

function TicketCard({ ticket: t }: { ticket: Ticket }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <StatusBadge value={t.status} />
            <StatusBadge value={t.priority} />
            {t.pdcaPhase && <StatusBadge value={t.pdcaPhase} />}
          </div>
          <h3 className="font-medium text-gray-900 overflow-hidden whitespace-nowrap text-ellipsis">{t.title}</h3>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <FolderOpen className="h-3 w-3" /> {t.feature}
            </span>
            {t.assigneeTeam && (
              <span className="flex items-center gap-1">
                <Users className="h-3 w-3" /> {t.assigneeTeam}
              </span>
            )}
            {t.assigneeAgent && (
              <span className="flex items-center gap-1">
                <Bot className="h-3 w-3" /> {t.assigneeAgent}
              </span>
            )}
            {t.processLevel && (
              <span className="flex items-center gap-1">
                <Ruler className="h-3 w-3" /> {t.processLevel}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <ChecklistBar checklist={t.checklist} />
          {t.commitHash && (
            <span className="text-xs font-mono text-gray-400 flex items-center gap-1">
              {t.pushVerified ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              ) : (
                <span className="w-2 h-2 rounded-full bg-amber-400" />
              )}
              {t.commitHash.slice(0, 7)}
            </span>
          )}
          {t.startedAt && (
            <span className="text-[10px] text-gray-300">{timeAgo(t.startedAt)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function TicketsPage() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState('');
  const [search, setSearch] = useState('');

  const { data: tickets, isLoading } = useTickets({
    status: statusFilter !== 'all' ? statusFilter : undefined,
    team: teamFilter || undefined,
  });

  const filtered = useMemo(() => {
    if (!tickets) return [];
    if (!search) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.feature.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q),
    );
  }, [tickets, search]);

  const teams = useMemo(() => {
    if (!tickets) return [];
    return [...new Set(tickets.map((t) => t.assigneeTeam).filter(Boolean))] as string[];
  }, [tickets]);

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">태스크</h2>

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
            </button>
          ))}
        </div>

        {teams.length > 0 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 bg-white"
          >
            <option value="">전체 팀</option>
            {teams.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <input
          type="text"
          placeholder="검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm flex-1 min-w-[200px] focus:outline-none focus:ring-2 focus:ring-primary/30"
        />

        <span className="text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* 태스크 카드 */}
      <div className="space-y-2">
        {filtered.map((t) => (
          <TicketCard key={t.id} ticket={t} />
        ))}
        {filtered.length === 0 && (
          <EmptyState icon={ClipboardList} message="태스크 없음" />
        )}
      </div>
    </div>
  );
}
