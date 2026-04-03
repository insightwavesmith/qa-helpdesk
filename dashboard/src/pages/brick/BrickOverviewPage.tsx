interface WorkflowItem {
  id: string;
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  lastRunAt?: string;
}

interface BrickOverviewPageProps {
  workflows?: WorkflowItem[];
  onNewWorkflow?: () => void;
}

const STATUS_BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  idle: { bg: 'bg-gray-100', text: 'text-gray-600', label: '대기' },
  running: { bg: 'bg-blue-100', text: 'text-blue-700', label: '실행중' },
  done: { bg: 'bg-green-100', text: 'text-green-700', label: '완료' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: '실패' },
};

export function BrickOverviewPage({ workflows = [], onNewWorkflow }: BrickOverviewPageProps) {
  return (
    <div data-testid="brick-overview-page" className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold">Brick 워크플로우</h1>
        <button
          data-testid="btn-new-workflow"
          onClick={onNewWorkflow}
          className="px-3 py-1.5 text-sm rounded bg-[#F75D5D] text-white hover:bg-[#E54949]"
        >
          새 워크플로우
        </button>
      </div>

      {workflows.length === 0 && (
        <p className="text-gray-600">워크플로우 목록이 여기에 표시됩니다.</p>
      )}

      {workflows.length > 0 && (
        <div data-testid="workflow-list" className="space-y-2">
          {workflows.map((wf) => {
            const badge = STATUS_BADGE_STYLES[wf.status] || STATUS_BADGE_STYLES.idle;
            return (
              <div
                key={wf.id}
                data-testid="workflow-item"
                className="flex items-center justify-between p-3 border rounded-lg bg-white shadow-sm"
              >
                <div>
                  <div className="text-sm font-medium text-gray-800">{wf.name}</div>
                  <div className="text-xs text-gray-500">{wf.description}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    data-testid="status-badge"
                    className={`px-2 py-0.5 text-xs rounded-full ${badge.bg} ${badge.text}`}
                  >
                    {badge.label}
                  </span>
                  {wf.lastRunAt && (
                    <span className="text-xs text-gray-400">{wf.lastRunAt}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
