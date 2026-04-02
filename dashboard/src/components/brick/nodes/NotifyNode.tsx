import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { NotifyNodeData, NotifyEvent } from './types';
import { CHANNEL_ADAPTERS } from '../../../lib/brick/channel-adapter';

const NOTIFY_STATUS_STYLES: Record<string, { border: string; bg: string }> = {
  idle: { border: '#0EA5E9', bg: '#E0F2FE' },
  running: { border: '#0EA5E9', bg: '#F0F9FF' },
  done: { border: '#10B981', bg: '#ECFDF5' },
  failed: { border: '#EF4444', bg: '#FEF2F2' },
};

const EVENT_LABELS: Record<NotifyEvent, string> = {
  start: '시작',
  complete: '완료',
  fail: '실패',
};

const CHANNEL_ICONS: Record<string, string> = {
  slack: '💬',
  telegram: '✈️',
  discord: '🎮',
  webhook: '🌐',
};

export function NotifyNode({ data }: NodeProps) {
  const d = data as NotifyNodeData;
  const status = d.status ?? 'idle';

  // failed 상태에서 lastResult도 failed이면 failed 스타일
  const styleKey = d.lastResult === 'success' && status === 'done'
    ? 'done'
    : d.lastResult === 'failed' || status === 'failed'
      ? 'failed'
      : status === 'running'
        ? 'running'
        : 'idle';

  const styles = NOTIFY_STATUS_STYLES[styleKey] ?? NOTIFY_STATUS_STYLES.idle;
  const adapter = d.channel ? CHANNEL_ADAPTERS[d.channel] : null;
  const isRunning = status === 'running';
  const isFailed = d.lastResult === 'failed' || status === 'failed';

  return (
    <div
      data-testid="notify-node"
      className={`rounded-lg shadow-sm min-w-[240px]${isRunning ? ' animate-pulse' : ''}`}
      style={{
        border: `2px solid ${styles.border}`,
        backgroundColor: styles.bg,
      }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="px-3 py-2 space-y-1">
        {/* 헤더: 이름 + 상태 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🔔</span>
            <span className="text-sm font-medium text-gray-800">
              알림: {d.label || '알림'}
            </span>
          </div>
          <span data-testid="notify-status">{
            status === 'done' ? '✓' : status === 'failed' ? '✕' : status === 'running' ? '◉' : '○'
          }</span>
        </div>

        {/* 채널 정보 */}
        {adapter && (
          <div className="flex items-center gap-1.5" data-testid="notify-channel">
            <span
              data-testid={`channel-icon-${d.channel}`}
              style={{ color: adapter.color }}
            >
              {CHANNEL_ICONS[d.channel] ?? '🔔'}
            </span>
            <span className="text-xs text-gray-600">
              {adapter.name}{d.target ? ` ${d.target}` : ''}
            </span>
          </div>
        )}

        {/* 이벤트 체크마크 */}
        {d.events && d.events.length > 0 && (
          <div className="flex items-center gap-2 text-xs" data-testid="notify-events">
            <span className="text-gray-500">이벤트:</span>
            {(['start', 'complete', 'fail'] as NotifyEvent[]).map((evt) => (
              <span key={evt} data-testid={`event-${evt}`}>
                {d.events.includes(evt) ? '✓' : '✗'}{EVENT_LABELS[evt]}
              </span>
            ))}
          </div>
        )}

        {/* 최근 발송 결과 */}
        {d.lastSentAt && (
          <div className="text-xs text-gray-500" data-testid="notify-last-sent">
            최근: {d.lastResult === 'success' ? '✓' : '✕'} {d.lastSentAt} 발송 {d.lastResult === 'success' ? '성공' : '실패'}
          </div>
        )}

        {/* 재시도 버튼 (실패 시만) */}
        {isFailed && (
          <button
            data-testid="notify-retry-button"
            className="text-xs text-red-600 hover:text-red-800 underline"
          >
            재시도
          </button>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
