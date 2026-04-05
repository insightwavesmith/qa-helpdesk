import { useState } from 'react';
import { useApproval } from '../../../hooks/brick/useApproval';

export interface ApprovalPanelProps {
  workflowId: string;
  blockId: string;
  approver: string;
  artifacts: string[];
  onApprove?: () => void;
  onReject?: (reason: string) => void;
}

export function ApprovalPanel({
  workflowId,
  blockId,
  approver,
  artifacts,
  onApprove,
  onReject,
}: ApprovalPanelProps) {
  const [rejectReason, setRejectReason] = useState('');
  const { approve, reject } = useApproval(workflowId, blockId);

  const handleApprove = () => {
    approve.mutate(undefined, {
      onSuccess: () => onApprove?.(),
    });
  };

  const handleReject = () => {
    if (!rejectReason.trim()) return;
    reject.mutate(rejectReason, {
      onSuccess: () => onReject?.(rejectReason),
    });
  };

  return (
    <div data-testid="approval-panel" className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-base">⚖</span>
        <h3 className="text-sm font-semibold text-amber-600">승인 대기</h3>
      </div>

      <div className="space-y-1 text-sm text-gray-600">
        <div>
          <span className="text-gray-400">블록:</span>{' '}
          <span data-testid="approval-block-id">{blockId}</span>
        </div>
        <div>
          <span className="text-gray-400">승인자:</span>{' '}
          <span data-testid="approval-approver">{approver}</span>
        </div>
      </div>

      {artifacts.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 mb-1">산출물:</p>
          <ul data-testid="approval-artifacts" className="space-y-0.5">
            {artifacts.map((a, i) => (
              <li key={i} className="text-xs text-gray-600 flex items-center gap-1">
                <span className="text-green-500">✓</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        data-testid="approve-btn"
        onClick={handleApprove}
        disabled={approve.isPending}
        className="w-full py-2 text-sm font-medium text-white rounded-md disabled:opacity-50"
        style={{ backgroundColor: '#10B981' }}
      >
        {approve.isPending ? '처리 중...' : '✓ 승인'}
      </button>

      <div className="space-y-2">
        <label className="block text-xs text-gray-500">반려 사유</label>
        <input
          data-testid="reject-reason-input"
          type="text"
          value={rejectReason}
          onChange={(e) => setRejectReason(e.target.value)}
          placeholder="반려 사유를 입력하세요"
          className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
        />
        <button
          data-testid="reject-btn"
          onClick={handleReject}
          disabled={!rejectReason.trim() || reject.isPending}
          className="w-full py-2 text-sm font-medium text-white rounded-md disabled:opacity-50"
          style={{ backgroundColor: '#EF4444' }}
        >
          {reject.isPending ? '처리 중...' : '✗ 반려'}
        </button>
      </div>
    </div>
  );
}
