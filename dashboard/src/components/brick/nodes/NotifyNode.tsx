import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { BlockNodeData } from './types';
import { STATUS_BORDER_COLORS, STATUS_ICONS } from './types';

export function NotifyNode({ data }: NodeProps) {
  const d = data as BlockNodeData;
  const borderColor = STATUS_BORDER_COLORS[d.status] ?? '#D1D5DB';
  const statusIcon = STATUS_ICONS[d.status] ?? '○';

  return (
    <div
      data-testid="notify-node"
      className="rounded-lg shadow-sm min-w-[240px]"
      style={{ border: `2px solid ${borderColor}`, backgroundColor: '#F0F9FF' }}
    >
      <Handle type="target" position={Position.Top} />
      <div className="px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-sm">🔔</span>
            <span className="text-sm font-medium text-gray-800">
              {d.label || '알림'}
            </span>
          </div>
          <span>{statusIcon}</span>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
