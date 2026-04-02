import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';

export function EndNode({ data }: NodeProps) {
  const label = (data as Record<string, unknown>).label as string | undefined;

  return (
    <div
      data-testid="end-node"
      className="rounded-full shadow-sm flex items-center justify-center w-16 h-16"
      style={{ border: '2px solid #EF4444', backgroundColor: '#FEF2F2' }}
    >
      <span className="text-sm font-medium text-red-700">
        {label || '종료'}
      </span>
      <Handle type="target" position={Position.Top} />
    </div>
  );
}
