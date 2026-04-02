import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { ReviewNodeData } from './types';
import { STATUS_BORDER_COLORS, STATUS_ICONS } from './types';

const REVIEW_BORDER_COLOR = '#8B5CF6';

export function ReviewNode({ data }: NodeProps) {
  const d = data as ReviewNodeData;
  const statusIcon = STATUS_ICONS[d.status] ?? '○';
  const isRunning = d.status === 'running';
  const progress = d.checklistProgress ?? 0;

  return (
    <div
      data-testid="review-node"
      className="rounded-lg shadow-sm min-w-[240px]"
      style={{
        border: `2px solid ${REVIEW_BORDER_COLOR}`,
        backgroundColor: '#FEFCE8',
      }}
    >
      <Handle type="target" position={Position.Top} />

      <div className="px-3 py-2">
        {/* 헤더 */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">👀</span>
            <span data-testid="block-label" className="text-sm font-medium text-gray-800">
              {d.label || '리뷰'}
            </span>
          </div>
          <span
            data-testid="status-icon"
            className={isRunning ? 'animate-spin' : ''}
            style={isRunning ? { display: 'inline-block' } : undefined}
          >
            {statusIcon}
          </span>
        </div>

        {/* 리뷰어 아바타 */}
        {d.reviewers && d.reviewers.length > 0 && (
          <div data-testid="reviewer-avatars" className="mt-2 flex items-center gap-1">
            {d.reviewers.map((r) => (
              <div
                key={r.id}
                data-testid="reviewer-avatar"
                className="w-6 h-6 rounded-full bg-purple-200 flex items-center justify-center text-[10px] font-medium text-purple-700"
                title={r.name}
              >
                {r.avatarUrl ? (
                  <img src={r.avatarUrl} alt={r.name} className="w-full h-full rounded-full" />
                ) : (
                  r.name.charAt(0).toUpperCase()
                )}
              </div>
            ))}
          </div>
        )}

        {/* 체크리스트 진행률 */}
        <div data-testid="checklist-progress" className="mt-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>체크리스트</span>
            <span>{progress}%</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              data-testid="progress-bar"
              className="h-full bg-purple-500 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 승인/변경요청/거부 버튼 */}
        <div data-testid="review-actions" className="mt-2 flex items-center gap-1">
          <button
            data-testid="btn-approve"
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-green-100 text-green-700 hover:bg-green-200"
          >
            승인
          </button>
          <button
            data-testid="btn-changes-requested"
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-amber-100 text-amber-700 hover:bg-amber-200"
          >
            변경요청
          </button>
          <button
            data-testid="btn-reject"
            className="px-2 py-0.5 text-[10px] font-medium rounded bg-red-100 text-red-700 hover:bg-red-200"
          >
            거부
          </button>
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
