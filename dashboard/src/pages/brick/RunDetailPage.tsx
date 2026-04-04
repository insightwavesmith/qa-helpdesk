import { useParams } from 'react-router-dom';
import { useExecutionStatus, useExecutionLogs, usePauseExecution, useCancelExecution } from '../../hooks/brick/useExecutions';
import { ExecutionTimeline, type TimelineEvent } from '../../components/brick/timeline/ExecutionTimeline';
import { RunProgressBar, type RunProgressBarBlock } from '../../components/brick/RunProgressBar';
import type { BlockStatus } from '../../components/brick/nodes/types';

const STATUS_LABELS: Record<string, string> = {
  running: '실행 중',
  completed: '완료',
  failed: '실패',
  paused: '일시정지',
  cancelled: '취소',
};

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: execution, isLoading: statusLoading } = useExecutionStatus(id ?? null);
  const { data: logs, isLoading: logsLoading } = useExecutionLogs(id ?? null);
  const pauseExecution = usePauseExecution();
  const cancelExecution = useCancelExecution();

  if (!id) {
    return <p className="p-6 text-gray-500">실행 ID가 없습니다</p>;
  }

  if (statusLoading) {
    return <p className="p-6 text-gray-500">로딩 중...</p>;
  }

  const timelineEvents: TimelineEvent[] = (logs ?? []).map((log: Record<string, unknown>) => ({
    timestamp: String(log.timestamp ?? ''),
    blockName: String(log.blockName ?? ''),
    status: (log.status as TimelineEvent['status']) ?? 'pending',
    error: log.error ? String(log.error) : undefined,
  }));

  // blocksState JSON 파싱 → RunProgressBar 블록 목록
  let progressBlocks: RunProgressBarBlock[] = [];
  if (execution?.blocksState) {
    try {
      const blocksState: Record<string, { status: string; label?: string }> =
        typeof execution.blocksState === 'string'
          ? JSON.parse(execution.blocksState)
          : execution.blocksState;
      progressBlocks = Object.entries(blocksState).map(([blockId, state]) => ({
        id: blockId,
        status: (state.status as BlockStatus) || 'pending',
        label: state.label ?? blockId,
      }));
    } catch {
      // 파싱 실패 시 빈 배열
    }
  }

  const isRunning = execution?.status === 'running';

  return (
    <div data-testid="run-detail-page" className="p-6">
      {/* 헤더: 실행명 + 상태 + 제어 버튼 */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">
            {execution?.feature ?? id}
          </h1>
          <span className="text-sm text-gray-500">
            {STATUS_LABELS[execution?.status] ?? execution?.status ?? '-'}
          </span>
        </div>
        <div className="flex gap-2">
          {isRunning && (
            <button
              data-testid="pause-btn"
              onClick={() => pauseExecution.mutate(id)}
              className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50"
            >
              ⏸ 일시정지
            </button>
          )}
          <button
            data-testid="cancel-btn"
            onClick={() => cancelExecution.mutate(execution?.engineWorkflowId ?? id)}
            className="px-3 py-1.5 text-sm rounded border border-red-300 text-red-500 hover:bg-red-50"
          >
            ⏹ 중지
          </button>
        </div>
      </div>

      {/* 블록 진행률 */}
      {progressBlocks.length > 0 && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
          <h2 className="text-sm font-semibold mb-3">진행 상황</h2>
          <RunProgressBar blocks={progressBlocks} />
        </div>
      )}

      {/* 메타데이터 */}
      <div data-testid="execution-metadata" className="mb-6 p-4 bg-gray-50 rounded-lg">
        <p><span className="font-medium">상태:</span> {STATUS_LABELS[execution?.status] ?? execution?.status ?? '-'}</p>
        <p><span className="font-medium">시작:</span> {execution?.startedAt ?? '-'}</p>
        <p><span className="font-medium">소요시간:</span> {execution?.duration ?? '-'}</p>
      </div>

      {/* 타임라인 */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold mb-2">타임라인</h2>
        <div className="h-20 border border-gray-200 rounded">
          <ExecutionTimeline events={timelineEvents} />
        </div>
      </div>

      {/* 로그 뷰어 */}
      <div>
        <h2 className="text-lg font-semibold mb-2">로그</h2>
        {logsLoading ? (
          <p className="text-gray-500">로그 로딩 중...</p>
        ) : (
          <div data-testid="log-viewer" className="bg-gray-900 text-green-400 p-4 rounded-lg text-xs font-mono max-h-64 overflow-y-auto">
            {(logs ?? []).length === 0 ? (
              <p>로그 없음</p>
            ) : (
              (logs as Record<string, unknown>[]).map((log, idx) => (
                <div key={idx} data-testid={`log-entry-${idx}`}>
                  [{String(log.timestamp ?? '')}] {String(log.blockName ?? '')} — {String(log.message ?? log.status ?? '')}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
