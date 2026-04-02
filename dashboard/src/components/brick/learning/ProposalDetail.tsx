interface ProposalDetailProps {
  before: string;
  after: string;
  reasoning: string;
}

export function ProposalDetail({ before, after, reasoning }: ProposalDetailProps) {
  return (
    <div data-testid="proposal-detail" className="space-y-4 p-4 border rounded-lg bg-white">
      {/* Diff 뷰 */}
      <div data-testid="proposal-diff" className="grid grid-cols-2 gap-4">
        <div>
          <span className="text-xs font-medium text-gray-500">변경 전:</span>
          <div data-testid="diff-before" className="mt-1 p-2 bg-red-50 rounded text-sm font-mono whitespace-pre-wrap">
            {before}
          </div>
        </div>
        <div>
          <span className="text-xs font-medium text-gray-500">변경 후:</span>
          <div data-testid="diff-after" className="mt-1 p-2 bg-green-50 rounded text-sm font-mono whitespace-pre-wrap">
            {after}
          </div>
        </div>
      </div>

      {/* 근거 */}
      <div>
        <span className="text-xs font-medium text-gray-500">근거:</span>
        <p data-testid="proposal-reasoning" className="mt-1 text-sm text-gray-700">
          {reasoning}
        </p>
      </div>
    </div>
  );
}
