import { useState } from 'react';

interface ApproveRejectFormProps {
  onApprove: (comment?: string) => void;
  onReject: (reason: string) => void;
}

export function ApproveRejectForm({ onApprove, onReject }: ApproveRejectFormProps) {
  const [comment, setComment] = useState('');
  const [reason, setReason] = useState('');

  return (
    <div data-testid="approve-reject-form" className="space-y-3 p-4 border rounded-lg bg-white">
      {/* 승인 */}
      <div className="space-y-2">
        <textarea
          data-testid="approve-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="승인 코멘트 (선택)"
          className="w-full p-2 border rounded text-sm"
          rows={2}
        />
        <button
          data-testid="btn-approve"
          onClick={() => onApprove(comment || undefined)}
          className="px-3 py-1.5 text-sm rounded bg-green-500 text-white hover:bg-green-600"
        >
          승인
        </button>
      </div>

      {/* 거부 */}
      <div className="space-y-2 border-t pt-3">
        <textarea
          data-testid="reject-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="거부 사유 (필수)"
          className="w-full p-2 border rounded text-sm"
          rows={2}
        />
        <button
          data-testid="btn-reject"
          onClick={() => {
            if (reason.trim()) {
              onReject(reason);
            }
          }}
          className="px-3 py-1.5 text-sm rounded bg-red-500 text-white hover:bg-red-600"
        >
          거부
        </button>
      </div>
    </div>
  );
}
