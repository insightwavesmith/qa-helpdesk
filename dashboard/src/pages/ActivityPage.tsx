import { useState, useMemo } from 'react';
import { EmptyState } from '../components/EmptyState';
import { PageSkeleton } from '../components/PageSkeleton';
import { useNotifications, type Notification } from '../hooks/useApi';
import { cn, timeAgo, formatTime } from '../lib/utils';
import {
  Activity,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Info,
} from 'lucide-react';

const TYPE_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'success', label: '성공' },
  { value: 'warning', label: '경고' },
  { value: 'error', label: '오류' },
  { value: 'info', label: '정보' },
];

const TYPE_ICONS: Record<string, typeof CheckCircle> = {
  success: CheckCircle,
  warning: AlertTriangle,
  error: XCircle,
  info: Info,
};

const TYPE_STYLES: Record<string, string> = {
  success: 'border-l-emerald-400',
  warning: 'border-l-amber-400',
  error: 'border-l-red-400',
  info: 'border-l-blue-400',
};

const TYPE_ICON_STYLES: Record<string, string> = {
  success: 'text-emerald-500',
  warning: 'text-amber-500',
  error: 'text-red-500',
  info: 'text-blue-500',
};

export function ActivityPage() {
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: notifications, isLoading } = useNotifications(100);

  const filtered = useMemo(() => {
    if (!notifications) return [];
    let result = notifications;
    if (typeFilter !== 'all') {
      result = result.filter((n) => n.type === typeFilter);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q),
      );
    }
    return result;
  }, [notifications, typeFilter, search]);

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">활동 로그</h2>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                typeFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
              )}
            >
              {f.label}
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
        <span className="text-xs text-gray-400">{filtered.length}건</span>
      </div>

      {/* 활동 목록 */}
      {filtered.length === 0 ? (
        <EmptyState icon={Activity} message="활동 기록 없음" />
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
          <div className="divide-y divide-gray-100">
            {filtered.map((n) => {
              const IconComp = TYPE_ICONS[n.type] ?? Info;
              return (
                <div
                  key={n.id}
                  className={cn(
                    'border-l-4 cursor-pointer hover:bg-gray-50 transition-colors',
                    TYPE_STYLES[n.type] ?? 'border-l-gray-200',
                  )}
                  onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
                >
                  <div className="px-5 py-3 flex items-center gap-3">
                    <IconComp className={cn('h-4 w-4 shrink-0', TYPE_ICON_STYLES[n.type] ?? 'text-gray-400')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">{n.title}</p>
                      <p className="text-xs text-gray-500 overflow-hidden whitespace-nowrap text-ellipsis">{n.message}</p>
                    </div>
                    <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                      <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                      <span className="text-[10px] text-gray-300">{formatTime(n.createdAt)}</span>
                    </div>
                    {n.read === 0 && (
                      <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                    )}
                  </div>
                  {expandedId === n.id && (
                    <div className="px-5 pb-3 ml-8">
                      <pre className="text-xs bg-gray-50 p-3 rounded-lg text-gray-600 whitespace-pre-wrap break-words">
                        {n.message}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
