import { useMemo } from 'react';
import { useAgents, type Agent } from '../hooks/useApi';

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-primary',
  idle: 'bg-gray-300',
  paused: 'bg-amber-400',
  error: 'bg-red-500',
  terminated: 'bg-gray-200',
};

const STATUS_LABELS: Record<string, string> = {
  running: '실행중',
  idle: '대기',
  paused: '일시정지',
  error: '오류',
  terminated: '종료',
};

const ROLE_LABELS: Record<string, string> = {
  leader: '리더',
  developer: '개발자',
  qa: 'QA',
  pm: 'PM',
  coo: 'COO',
};

interface OrgNode {
  agent: Agent | null;
  label: string;
  icon: string;
  children: OrgNode[];
}

function buildOrgTree(agents: Agent[]): OrgNode {
  // Smith → 모찌(COO) → CTO/PM 팀 리더 → 각 팀원
  const byId = new Map(agents.map((a) => [a.id, a]));

  // 그룹: 리더(reportsTo=null 또는 COO), 팀원(reportsTo=리더)
  const coo = agents.find((a) => a.role === 'coo');
  const leaders = agents.filter((a) => a.role === 'leader');
  const others = agents.filter((a) => a.role !== 'coo' && a.role !== 'leader');

  // 팀별 그룹핑
  const teamMap = new Map<string, Agent[]>();
  for (const a of others) {
    const team = a.team ?? '미배정';
    if (!teamMap.has(team)) teamMap.set(team, []);
    teamMap.get(team)!.push(a);
  }

  // 리더 노드 생성
  const leaderNodes: OrgNode[] = leaders.map((l) => {
    const teamMembers = teamMap.get(l.team ?? '') ?? [];
    // reportsTo로도 매칭
    const directReports = others.filter((a) => a.reportsTo === l.id && !teamMembers.includes(a));
    const allMembers = [...teamMembers, ...directReports];

    return {
      agent: l,
      label: l.displayName ?? l.name,
      icon: l.icon ?? '👑',
      children: allMembers.map((m) => ({
        agent: m,
        label: m.displayName ?? m.name,
        icon: m.icon ?? '🤖',
        children: [],
      })),
    };
  });

  // 리더 없는 팀원은 "미배정" 그룹
  const assignedIds = new Set<string>();
  leaderNodes.forEach((ln) => {
    if (ln.agent) assignedIds.add(ln.agent.id);
    ln.children.forEach((c) => { if (c.agent) assignedIds.add(c.agent.id); });
  });
  if (coo) assignedIds.add(coo.id);

  const unassigned = agents.filter((a) => !assignedIds.has(a.id));
  if (unassigned.length > 0) {
    leaderNodes.push({
      agent: null,
      label: '미배정',
      icon: '📂',
      children: unassigned.map((a) => ({
        agent: a,
        label: a.displayName ?? a.name,
        icon: a.icon ?? '🤖',
        children: [],
      })),
    });
  }

  // 모찌 → 리더들
  const cooNode: OrgNode = {
    agent: coo ?? null,
    label: coo ? (coo.displayName ?? coo.name) : '모찌',
    icon: coo?.icon ?? '🐹',
    children: leaderNodes,
  };

  // Smith → 모찌
  return {
    agent: null,
    label: 'Smith',
    icon: '👤',
    children: [cooNode],
  };
}

function AgentCard({ node }: { node: OrgNode }) {
  const { agent } = node;

  return (
    <div className="inline-flex flex-col items-center">
      <div className="relative bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm hover:shadow-md transition-shadow min-w-[120px] text-center">
        <span className="text-2xl block mb-1">{node.icon}</span>
        <p className="text-sm font-medium text-gray-900 truncate">{node.label}</p>
        {agent && (
          <>
            <p className="text-xs text-gray-400">{ROLE_LABELS[agent.role] ?? agent.role}</p>
            <div className="flex items-center justify-center gap-1 mt-1">
              <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[agent.status] ?? 'bg-gray-300'}`} />
              <span className="text-[10px] text-gray-400">
                {STATUS_LABELS[agent.status] ?? agent.status}
              </span>
            </div>
            {agent.model && (
              <p className="text-[10px] text-gray-300 mt-0.5 font-mono">{agent.model}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function OrgBranch({ node, isRoot }: { node: OrgNode; isRoot?: boolean }) {
  return (
    <div className="flex flex-col items-center">
      <AgentCard node={node} />

      {node.children.length > 0 && (
        <>
          {/* 수직선 */}
          <div className="w-px h-6 bg-gray-200" />

          {/* 자식들 */}
          <div className="relative">
            {/* 수평선 */}
            {node.children.length > 1 && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px bg-gray-200"
                style={{
                  width: `calc(100% - 120px)`,
                  left: '60px',
                  right: '60px',
                }}
              />
            )}
            <div className="flex gap-8 pt-0">
              {node.children.map((child, i) => (
                <div key={child.agent?.id ?? `group-${i}`} className="flex flex-col items-center">
                  {/* 자식 수직선 */}
                  <div className="w-px h-6 bg-gray-200" />
                  <OrgBranch node={child} />
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function OrgChartPage() {
  const { data: agents, isLoading } = useAgents();

  const tree = useMemo(() => {
    if (!agents || agents.length === 0) return null;
    return buildOrgTree(agents);
  }, [agents]);

  if (isLoading) {
    return <div className="text-gray-400 text-sm">불러오는 중...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">조직도</h2>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-8 overflow-x-auto">
        {tree ? (
          <div className="inline-flex justify-center w-full">
            <OrgBranch node={tree} isRoot />
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400 text-sm">등록된 에이전트 없음</div>
        )}
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-4 px-2">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[key]}`} />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
