import { useEffect } from 'react';
import { useAgents, useTickets, useDashboardSummary, useNotifications } from '../hooks/useApi';
import { cn } from '../lib/utils';
import { Bot, Clock, CheckCircle2, AlertCircle, Loader2, Zap } from 'lucide-react';

// 에이전트 상태별 색상 매핑
const STATUS_COLORS = {
  running: 'bg-emerald-500 text-white',
  idle: 'bg-gray-400 text-white',
  paused: 'bg-amber-500 text-white',
  error: 'bg-red-500 text-white',
  terminated: 'bg-gray-300 text-gray-600',
} as const;

const STATUS_ICONS = {
  running: CheckCircle2,
  idle: Clock,
  paused: AlertCircle,
  error: AlertCircle,
  terminated: Clock,
} as const;

// PDCA 단계별 색상
const PDCA_COLORS = {
  plan: 'bg-blue-500 text-white',
  design: 'bg-purple-500 text-white',
  do: 'bg-orange-500 text-white',
  check: 'bg-green-500 text-white',
  act: 'bg-red-500 text-white',
} as const;

export function WidgetPage() {
  const { data: agents, refetch: refetchAgents } = useAgents();
  const { data: tickets, refetch: refetchTickets } = useTickets({ status: 'in_progress' });
  const { data: summary, refetch: refetchSummary } = useDashboardSummary();
  const { data: notifications, refetch: refetchNotifications } = useNotifications(5);

  // 30초마다 자동 새로고침
  useEffect(() => {
    const interval = setInterval(() => {
      refetchAgents();
      refetchTickets();
      refetchSummary();
      refetchNotifications();
    }, 30000);
    return () => clearInterval(interval);
  }, [refetchAgents, refetchTickets, refetchSummary, refetchNotifications]);

  // 핵심 에이전트팀 필터링 (sdk-cto, sdk-cto-2, sdk-pm)
  const coreAgents = agents?.filter(agent =>
    agent.name.includes('sdk-cto') || agent.name.includes('sdk-pm')
  ).slice(0, 3) || [];

  // 활성 태스크 (첫 번째)
  const activeTask = tickets?.[0];

  // 최근 체인 이벤트 (알림에서 추출)
  const lastChainEvent = notifications?.find(notif =>
    notif.type === 'chain' || notif.message.includes('체인') || notif.message.includes('전송')
  );

  // 전체 상태 요약
  const getOverallStatus = () => {
    if (!agents || agents.length === 0) return '⚠️ 에이전트 데이터 없음';

    const errorCount = agents.filter(a => a.status === 'error').length;
    const runningCount = agents.filter(a => a.status === 'running').length;

    if (errorCount > 0) return `⚠️ ${errorCount}개 에이전트 오류`;
    if (runningCount > 0) return `✅ 팀 정상 운영 중 (${runningCount}개 활성)`;
    return '💤 모든 에이전트 대기 중';
  };

  // 시간 포맷 (상대시간)
  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}시간 전`;
    if (minutes > 0) return `${minutes}분 전`;
    return '방금 전';
  };

  if (!agents) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-gray-300">에이전트 상태 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white max-w-sm mx-auto">
      {/* PWA 헤더 */}
      <div className="bg-gray-800 px-4 py-3 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-400" />
          <h1 className="font-semibold text-sm">bkit 에이전트 모니터</h1>
          <div className="ml-auto text-xs text-gray-400">
            {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 전체 상태 요약 */}
        <div className="bg-gray-800 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-sm font-medium text-yellow-400">상태</span>
          </div>
          <p className="mt-1 text-white font-medium">{getOverallStatus()}</p>
        </div>

        {/* 핵심 에이전트팀 상태 */}
        <div className="bg-gray-800 rounded-lg p-3">
          <h2 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <Bot className="w-4 h-4" />
            핵심 에이전트팀
          </h2>
          <div className="space-y-2">
            {coreAgents.length > 0 ? (
              coreAgents.map((agent) => {
                const StatusIcon = STATUS_ICONS[agent.status as keyof typeof STATUS_ICONS] || Clock;
                return (
                  <div key={agent.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={cn(
                        'w-2 h-2 rounded-full',
                        agent.status === 'running' ? 'bg-green-400' :
                        agent.status === 'error' ? 'bg-red-400' :
                        agent.status === 'paused' ? 'bg-yellow-400' : 'bg-gray-400'
                      )} />
                      <span className="text-sm text-white font-medium">
                        {agent.displayName || agent.name}
                      </span>
                    </div>
                    <div className={cn(
                      'px-2 py-1 rounded text-xs font-medium flex items-center gap-1',
                      STATUS_COLORS[agent.status as keyof typeof STATUS_COLORS] || 'bg-gray-500 text-white'
                    )}>
                      <StatusIcon className="w-3 h-3" />
                      {agent.status}
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-gray-400 text-sm">핵심 에이전트를 찾을 수 없습니다</p>
            )}
          </div>
        </div>

        {/* 현재 활성 TASK */}
        <div className="bg-gray-800 rounded-lg p-3">
          <h2 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            활성 태스크
          </h2>
          {activeTask ? (
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-white font-medium text-sm">
                  {activeTask.title || activeTask.feature}
                </span>
                {activeTask.pdcaPhase && (
                  <span className={cn(
                    'px-2 py-1 rounded text-xs font-bold',
                    PDCA_COLORS[activeTask.pdcaPhase.toLowerCase() as keyof typeof PDCA_COLORS] || 'bg-gray-600 text-white'
                  )}>
                    {activeTask.pdcaPhase.toUpperCase()}
                  </span>
                )}
              </div>
              <p className="text-gray-400 text-xs">
                {activeTask.assigneeTeam && `팀: ${activeTask.assigneeTeam}`}
                {activeTask.assigneeAgent && ` | 담당: ${activeTask.assigneeAgent}`}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">활성 태스크 없음</p>
          )}
        </div>

        {/* 마지막 체인 이벤트 */}
        <div className="bg-gray-800 rounded-lg p-3">
          <h2 className="text-sm font-semibold text-gray-300 mb-2 flex items-center gap-2">
            <Clock className="w-4 h-4" />
            최근 이벤트
          </h2>
          {lastChainEvent ? (
            <div>
              <p className="text-white text-sm font-medium mb-1">
                {lastChainEvent.title}
              </p>
              <p className="text-gray-400 text-xs mb-1">
                {lastChainEvent.message}
              </p>
              <p className="text-gray-500 text-xs">
                {formatTimeAgo(lastChainEvent.createdAt)}
              </p>
            </div>
          ) : (
            <p className="text-gray-400 text-sm">최근 이벤트 없음</p>
          )}
        </div>

        {/* 하단 정보 */}
        <div className="text-center pt-2 pb-4">
          <p className="text-gray-500 text-xs">
            자동 새로고침 30초 |
            {notifications && ` ${notifications.length}개 알림 | `}
            {agents && `${agents.length}개 에이전트`}
          </p>
          <p className="text-gray-600 text-xs mt-1">
            마지막 업데이트: {new Date().toLocaleString('ko-KR')}
          </p>
        </div>
      </div>
    </div>
  );
}