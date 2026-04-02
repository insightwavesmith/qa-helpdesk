import type { Node } from '@xyflow/react';

interface NotifyConfigPanelProps {
  node: Node;
}

export function NotifyConfigPanel({ node }: NotifyConfigPanelProps) {
  const data = node.data as Record<string, unknown>;
  const label = (data.label as string) || (data.name as string) || '알림';

  return (
    <div data-testid="notify-config-panel" className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">알림 설정</h3>
      <div className="text-sm text-gray-600">{label}</div>
    </div>
  );
}
