import { useState, useMemo } from 'react';
import { useNotifications, type Notification } from '../hooks/useApi';

const TYPE_FILTERS = [
  { value: 'all', label: '전체' },
  { value: 'success', label: '성공' },
  { value: 'warning', label: '경고' },
  { value: 'error', label: '오류' },
  { value: 'info', label: '정보' },
];

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '방금 전';
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const TYPE_ICONS: Record<string, string> = {
  success: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️',
};

const TYPE_STYLES: Record<string, string> = {
  success: 'border-l-emerald-400',
  warning: 'border-l-amber-400',
  error: 'border-l-red-400',
  info: 'border-l-blue-400',
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
    return <div className="text-gray-400 text-sm">불러오는 중...</div>;
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
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                typeFilter === f.value
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
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
      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`border-l-4 ${TYPE_STYLES[n.type] ?? 'border-l-gray-200'} cursor-pointer hover:bg-gray-50 transition-colors`}
              onClick={() => setExpandedId(expandedId === n.id ? null : n.id)}
            >
              <div className="px-5 py-3 flex items-center gap-3">
                <span>{TYPE_ICONS[n.type] ?? '📌'}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">{n.title}</p>
                  <p className="text-xs text-gray-500 truncate">{n.message}</p>
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
          ))}
          {filtered.length === 0 && (
            <div className="px-5 py-12 text-center text-gray-400 text-sm">활동 기록 없음</div>
          )}
        </div>
      </div>
    </div>
  );
}
