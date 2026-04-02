import type { Node } from '@xyflow/react';

interface ReviewDetailPanelProps {
  node: Node;
  onApprove?: (nodeId: string) => void;
  onReject?: (nodeId: string) => void;
}

export function ReviewDetailPanel({ node, onApprove, onReject }: ReviewDetailPanelProps) {
  const data = node.data as Record<string, unknown>;
  const checklist = (data.checklist as Array<{ id: string; label: string; checked: boolean }>) || [];
  const label = (data.label as string) || '리뷰';

  return (
    <div data-testid="review-detail-panel" className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">리뷰 상세</h3>

      <div className="text-sm text-gray-600">{label}</div>

      {/* 체크리스트 */}
      {checklist.length > 0 && (
        <div data-testid="review-checklist" className="space-y-1">
          <span className="text-xs text-gray-500">체크리스트</span>
          {checklist.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={item.checked} readOnly />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* 승인/거부 */}
      <div className="flex gap-2">
        <button
          data-testid="btn-approve"
          onClick={() => onApprove?.(node.id)}
          className="px-3 py-1 text-sm rounded bg-green-500 text-white hover:bg-green-600"
        >
          승인
        </button>
        <button
          data-testid="btn-reject"
          onClick={() => onReject?.(node.id)}
          className="px-3 py-1 text-sm rounded bg-red-500 text-white hover:bg-red-600"
        >
          거부
        </button>
      </div>
    </div>
  );
}
