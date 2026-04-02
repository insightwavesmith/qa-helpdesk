import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function StartNode({ data }: NodeProps) {
  const label = (data as Record<string, unknown>).label as string | undefined;

  return (
    <div
      data-testid="start-node"
      className="rounded-full shadow-sm flex items-center justify-center w-16 h-16"
      style={{ border: '2px solid #10B981', backgroundColor: '#ECFDF5' }}
    >
      <span className="text-sm font-medium text-green-700">
        {label || '시작'}
      </span>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}
