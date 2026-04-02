import { Link } from 'react-router-dom';

interface ExecutionSummary {
  id: string;
  name: string;
  status: string;
  startedAt: string;
  duration: string;
}

// 실제로는 useQuery로 데이터 fetch
function useExecutionHistory() {
  // placeholder — 실제 API 연동 시 교체
  return { data: [] as ExecutionSummary[], isLoading: false };
}

const STATUS_LABELS: Record<string, string> = {
  running: '실행 중',
  completed: '완료',
  failed: '실패',
  paused: '일시정지',
  cancelled: '취소',
};

export function RunHistoryPage() {
  const { data: executions, isLoading } = useExecutionHistory();

  return (
    <div data-testid="run-history-page" className="p-6">
      <h1 className="text-xl font-bold mb-4">실행 이력</h1>

      {isLoading ? (
        <p className="text-gray-500">로딩 중...</p>
      ) : executions.length === 0 ? (
        <p data-testid="empty-state" className="text-gray-500">실행 이력이 없습니다</p>
      ) : (
        <table data-testid="execution-table" className="w-full border-collapse">
          <thead>
            <tr className="border-b border-gray-200 text-left text-sm text-gray-500">
              <th className="pb-2 font-medium">이름</th>
              <th className="pb-2 font-medium">상태</th>
              <th className="pb-2 font-medium">시작시간</th>
              <th className="pb-2 font-medium">소요시간</th>
            </tr>
          </thead>
          <tbody>
            {executions.map((exec) => (
              <tr key={exec.id} data-testid={`execution-row-${exec.id}`} className="border-b border-gray-100">
                <td className="py-2">
                  <Link to={`/brick/runs/${exec.id}`} className="text-blue-600 hover:underline">
                    {exec.name}
                  </Link>
                </td>
                <td className="py-2 text-sm">{STATUS_LABELS[exec.status] ?? exec.status}</td>
                <td className="py-2 text-sm text-gray-500">{exec.startedAt}</td>
                <td className="py-2 text-sm text-gray-500">{exec.duration}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
