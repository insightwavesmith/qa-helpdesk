import type { LearningProposal } from '../../hooks/brick/useLearning';

interface LearningHarnessPageProps {
  proposals?: LearningProposal[];
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDetail?: (id: string) => void;
}

export function LearningHarnessPage({
  proposals = [],
  onApprove,
  onReject,
  onDetail,
}: LearningHarnessPageProps) {
  return (
    <div data-testid="learning-harness-page" className="p-6">
      <h1 className="text-xl font-bold mb-4">학습 하네스</h1>

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-600">제안 목록:</h2>

        {proposals.length === 0 && (
          <p className="text-sm text-gray-400">제안이 없습니다.</p>
        )}

        {proposals.map((p) => (
          <div
            key={p.id}
            data-testid="proposal-item"
            className="border rounded-lg p-4 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-800">
                  #{p.id} {p.title}
                </span>
                <span className="text-xs text-gray-500">
                  신뢰도 {p.confidence.toFixed(2)}
                </span>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                data-testid={`btn-detail-${p.id}`}
                onClick={() => onDetail?.(p.id)}
                className="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200"
              >
                상세보기
              </button>
              <button
                data-testid={`btn-approve-${p.id}`}
                onClick={() => onApprove?.(p.id)}
                className="px-2 py-1 text-xs rounded bg-green-100 text-green-700 hover:bg-green-200"
              >
                승인
              </button>
              <button
                data-testid={`btn-reject-${p.id}`}
                onClick={() => onReject?.(p.id)}
                className="px-2 py-1 text-xs rounded bg-red-100 text-red-700 hover:bg-red-200"
              >
                거부
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
