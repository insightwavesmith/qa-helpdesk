import { EmptyState } from '../components/EmptyState';
import { PageSkeleton } from '../components/PageSkeleton';
import { useRoutines, useToggleRoutine, type Routine } from '../hooks/useApi';
import { cn, timeAgo } from '../lib/utils';
import { Repeat, Clock, Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const STATUS_ICON: Record<string, typeof CheckCircle2> = {
  success: CheckCircle2,
  failed: XCircle,
  running: Loader2,
};

const STATUS_COLOR: Record<string, string> = {
  success: 'text-emerald-500',
  failed: 'text-red-500',
  running: 'text-amber-500 animate-spin',
};

function RoutineCard({ routine }: { routine: Routine }) {
  const toggle = useToggleRoutine();
  const enabled = routine.enabled === 1;
  const StatusIcon = routine.lastRunStatus ? STATUS_ICON[routine.lastRunStatus] : null;
  const statusColor = routine.lastRunStatus ? STATUS_COLOR[routine.lastRunStatus] : '';

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900">{routine.name}</h3>
            {StatusIcon && (
              <StatusIcon className={cn('h-4 w-4', statusColor)} />
            )}
          </div>
          {routine.description && (
            <p className="text-sm text-gray-500 mb-2">{routine.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-gray-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {routine.cronExpression}
            </span>
            {routine.lastRunAt && (
              <span className="flex items-center gap-1">
                <Play className="h-3 w-3" />
                마지막 실행: {timeAgo(routine.lastRunAt)}
              </span>
            )}
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => toggle.mutate({ id: routine.id, enabled: !enabled })}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
            enabled ? 'bg-[#F75D5D]' : 'bg-gray-200',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform',
              enabled ? 'translate-x-5' : 'translate-x-0',
            )}
          />
        </button>
      </div>
    </div>
  );
}

export function RoutinesPage() {
  const { data: routines, isLoading } = useRoutines();

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">루틴</h2>
      <div className="space-y-2">
        {routines && routines.length > 0 ? (
          routines.map((r) => <RoutineCard key={r.id} routine={r} />)
        ) : (
          <EmptyState icon={Repeat} message="등록된 루틴 없음" />
        )}
      </div>
    </div>
  );
}
