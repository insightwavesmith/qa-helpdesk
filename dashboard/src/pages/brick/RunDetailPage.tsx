import { useParams } from 'react-router-dom';
import { useExecutionStatus, useExecutionLogs } from '../../hooks/brick/useExecutions';
import { ExecutionTimeline, type TimelineEvent } from '../../components/brick/timeline/ExecutionTimeline';

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

  if (!id) {
    return <p className="p-6 text-gray-500">실행 ID가 없습니다</p>;
  }

  if (statusLoading) {
    return <p className="p-6 text-gray-500">로딩 중...</p>;
  }

  const timelineEvents: TimelineEvent[] = (logs ?? []).map((log: Record<string, unknown>) => ({
    timestamp: String(log.timestamp ?? ''),
    blockName: String(log.blockName ?? ''),
    status: (log.status as TimelineEvent['status']) ?? 'idle',
    error: log.error ? String(log.error) : undefined,
  }));

  return (
    <div data-testid="run-detail-page" className="p-6">
      <h1 className="text-xl font-bold mb-4">실행 상세</h1>

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
