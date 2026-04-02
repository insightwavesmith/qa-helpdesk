import { useState } from 'react';
import type { Node } from '@xyflow/react';

interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

interface DiffArtifact {
  before: string;
  after: string;
}

interface ReviewDetailPanelProps {
  node: Node;
  onApprove?: (nodeId: string) => void;
  onReject?: (nodeId: string, reason: string) => void;
  onRequestChanges?: (nodeId: string) => void;
}

export function ReviewDetailPanel({ node, onApprove, onReject, onRequestChanges }: ReviewDetailPanelProps) {
  const data = node.data as Record<string, unknown>;
  const initialChecklist = (data.checklist as ChecklistItem[]) || [];
  const label = (data.label as string) || '리뷰';
  const diff = (data.diff as DiffArtifact) || null;
  const wfId = (data.workflowId as string) || '';
  const blockId = node.id;

  const [checklist, setChecklist] = useState<ChecklistItem[]>(initialChecklist);
  const [comments, setComments] = useState<string[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [reviewStatus, setReviewStatus] = useState<string>((data.reviewStatus as string) || 'pending');
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const handleToggleChecklist = (itemId: string) => {
    setChecklist((prev) =>
      prev.map((item) =>
        item.id === itemId ? { ...item, checked: !item.checked } : item,
      ),
    );
  };

  const handleAddComment = () => {
    if (commentInput.trim()) {
      setComments((prev) => [...prev, commentInput.trim()]);
      setCommentInput('');
    }
  };

  const handleApprove = async () => {
    try {
      await fetch(`/api/brick/workflows/${wfId}/blocks/${blockId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setReviewStatus('approved');
      onApprove?.(node.id);
    } catch {
      // 에러 무시
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) return;
    try {
      await fetch(`/api/brick/workflows/${wfId}/blocks/${blockId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason }),
      });
      setReviewStatus('rejected');
      onReject?.(node.id, rejectReason);
      setShowRejectInput(false);
    } catch {
      // 에러 무시
    }
  };

  const handleRequestChanges = () => {
    onRequestChanges?.(node.id);
  };

  const checkedCount = checklist.filter((c) => c.checked).length;

  return (
    <div data-testid="review-detail-panel" className="p-4 space-y-4">
      <h3 className="text-sm font-semibold text-gray-700">리뷰 상세</h3>
      <div className="text-sm text-gray-600">{label}</div>

      {/* 상태 표시 */}
      <div data-testid="review-status" className="text-xs text-gray-500">
        상태: {reviewStatus}
      </div>

      {/* 체크리스트 */}
      {checklist.length > 0 && (
        <div data-testid="review-checklist" className="space-y-1">
          <span className="text-xs text-gray-500">
            체크리스트 ({checkedCount}/{checklist.length})
          </span>
          {checklist.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 text-sm cursor-pointer"
              onClick={() => handleToggleChecklist(item.id)}
              data-testid={`checklist-item-${item.id}`}
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleToggleChecklist(item.id)}
              />
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Diff 뷰 */}
      {diff && (
        <div data-testid="review-diff" className="space-y-2">
          <span className="text-xs text-gray-500">산출물 비교</span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-[10px] text-gray-400">변경 전</span>
              <div data-testid="diff-before" className="p-2 bg-red-50 rounded text-xs font-mono whitespace-pre-wrap">
                {diff.before}
              </div>
            </div>
            <div>
              <span className="text-[10px] text-gray-400">변경 후</span>
              <div data-testid="diff-after" className="p-2 bg-green-50 rounded text-xs font-mono whitespace-pre-wrap">
                {diff.after}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 인라인 코멘트 */}
      <div data-testid="review-comments" className="space-y-2">
        <span className="text-xs text-gray-500">코멘트</span>
        <div className="flex gap-2">
          <input
            data-testid="comment-input"
            type="text"
            value={commentInput}
            onChange={(e) => setCommentInput(e.target.value)}
            placeholder="코멘트를 입력하세요"
            className="flex-1 px-2 py-1 text-sm border rounded"
          />
          <button
            data-testid="btn-add-comment"
            onClick={handleAddComment}
            className="px-3 py-1 text-sm rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            등록
          </button>
        </div>
        {comments.length > 0 && (
          <ul data-testid="comment-list" className="space-y-1">
            {comments.map((c, i) => (
              <li key={i} className="text-sm text-gray-600 bg-gray-50 px-2 py-1 rounded">
                {c}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 승인/거부/변경요청 */}
      <div className="flex gap-2">
        <button
          data-testid="btn-approve"
          onClick={handleApprove}
          className="px-3 py-1 text-sm rounded bg-green-500 text-white hover:bg-green-600"
        >
          승인
        </button>
        <button
          data-testid="btn-reject"
          onClick={() => setShowRejectInput(true)}
          className="px-3 py-1 text-sm rounded bg-red-500 text-white hover:bg-red-600"
        >
          거부
        </button>
        <button
          data-testid="btn-request-changes"
          onClick={handleRequestChanges}
          className="px-3 py-1 text-sm rounded bg-amber-500 text-white hover:bg-amber-600"
        >
          변경요청
        </button>
      </div>

      {/* 거부 사유 입력 */}
      {showRejectInput && (
        <div data-testid="reject-reason-form" className="space-y-2">
          <textarea
            data-testid="reject-reason-input"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            placeholder="거부 사유를 입력하세요"
            className="w-full p-2 text-sm border rounded"
            rows={2}
          />
          <button
            data-testid="btn-confirm-reject"
            onClick={handleReject}
            className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700"
          >
            거부 확인
          </button>
        </div>
      )}

      {/* 변경요청 시 코멘트 목록 표시 */}
      {comments.length > 0 && (
        <div data-testid="change-request-comments" className="space-y-1">
          <span className="text-xs text-gray-500">변경요청 코멘트 ({comments.length}건)</span>
          <ul>
            {comments.map((c, i) => (
              <li key={i} className="text-sm text-gray-600">{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
