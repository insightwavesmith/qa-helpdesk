import type { BlockStatus } from '../nodes/types';
import { STATUS_ICONS } from '../nodes/types';

export interface TimelineEvent {
  timestamp: string;
  blockName: string;
  status: BlockStatus;
  error?: string;
}

export interface ExecutionTimelineProps {
  events: TimelineEvent[];
}

const STATUS_COLORS: Record<string, string> = {
  completed: 'text-green-600',
  running: 'text-blue-500',
  failed: 'text-red-600',
  queued: 'text-yellow-500',
  gate_checking: 'text-purple-500',
  suspended: 'text-amber-500',
  pending: 'text-gray-400',
};

export function ExecutionTimeline({ events }: ExecutionTimelineProps) {
  if (events.length === 0) {
    return (
      <div data-testid="execution-timeline" className="h-full flex items-center justify-center">
        <span className="text-xs text-gray-400">실행 이벤트 없음</span>
      </div>
    );
  }

  return (
    <div data-testid="execution-timeline" className="h-full overflow-x-auto">
      <div className="flex items-center gap-1 h-full px-2">
        {events.map((event, idx) => {
          const colorClass = STATUS_COLORS[event.status] ?? 'text-gray-400';
          const time = event.timestamp.length > 5 ? event.timestamp.slice(11, 16) : event.timestamp;

          return (
            <div
              key={`${event.blockName}-${idx}`}
              data-testid={`timeline-event-${idx}`}
              className={`flex items-center gap-1 px-2 py-1 rounded text-xs whitespace-nowrap ${
                event.status === 'failed' ? 'bg-red-50' : 'bg-gray-50'
              }`}
              title={event.error ?? ''}
            >
              <span className="text-gray-400">{time}</span>
              <span className="font-medium">{event.blockName}</span>
              <span className={colorClass} data-testid={`timeline-status-${idx}`}>
                {STATUS_ICONS[event.status]}
              </span>
              {event.error && (
                <span data-testid={`timeline-error-${idx}`} className="text-red-600 ml-1 truncate max-w-[120px]">
                  {event.error}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
