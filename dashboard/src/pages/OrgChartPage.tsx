import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { EmptyState } from '../components/EmptyState';
import { PageSkeleton } from '../components/PageSkeleton';
import { useAgents, type Agent } from '../hooks/useApi';
import { cn } from '../lib/utils';
import { Users, Bot } from 'lucide-react';

// Layout constants
const CARD_W = 160;
const CARD_H = 80;
const GAP_X = 24;
const GAP_Y = 60;
const PADDING = 40;

const STATUS_COLORS: Record<string, string> = {
  running: '#F75D5D',
  idle: '#d1d5db',
  paused: '#fbbf24',
  error: '#ef4444',
  terminated: '#e5e7eb',
};

const ROLE_LABELS: Record<string, string> = {
  leader: '리더',
  developer: '개발자',
  qa: 'QA',
  pm: 'PM',
  coo: 'COO',
};

const STATUS_LABELS: Record<string, string> = {
  running: '실행중',
  idle: '대기',
  paused: '일시정지',
  error: '오류',
  terminated: '종료',
};

interface OrgNode {
  id: string;
  name: string;
  role: string;
  status: string;
  model: string | null;
  children: OrgNode[];
}

interface LayoutNode extends OrgNode {
  x: number;
  y: number;
  layoutChildren: LayoutNode[];
}

function buildOrgTree(agents: Agent[]): OrgNode[] {
  const coo = agents.find((a) => a.role === 'coo');
  const leaders = agents.filter((a) => a.role === 'leader');
  const others = agents.filter((a) => a.role !== 'coo' && a.role !== 'leader');

  const teamMap = new Map<string, Agent[]>();
  for (const a of others) {
    const team = a.team ?? '미배정';
    if (!teamMap.has(team)) teamMap.set(team, []);
    teamMap.get(team)!.push(a);
  }

  const assignedIds = new Set<string>();

  const leaderNodes: OrgNode[] = leaders.map((l) => {
    assignedIds.add(l.id);
    const teamMembers = teamMap.get(l.team ?? '') ?? [];
    const directReports = others.filter(
      (a) => a.reportsTo === l.id && !teamMembers.includes(a),
    );
    const allMembers = [...teamMembers, ...directReports];
    for (const m of allMembers) assignedIds.add(m.id);

    return {
      id: l.id,
      name: l.displayName ?? l.name,
      role: l.role,
      status: l.status,
      model: l.model,
      children: allMembers.map((m) => ({
        id: m.id,
        name: m.displayName ?? m.name,
        role: m.role,
        status: m.status,
        model: m.model,
        children: [],
      })),
    };
  });

  if (coo) assignedIds.add(coo.id);

  const unassigned = agents.filter((a) => !assignedIds.has(a.id));
  if (unassigned.length > 0) {
    leaderNodes.push({
      id: 'unassigned',
      name: '미배정',
      role: 'group',
      status: 'idle',
      model: null,
      children: unassigned.map((a) => ({
        id: a.id,
        name: a.displayName ?? a.name,
        role: a.role,
        status: a.status,
        model: a.model,
        children: [],
      })),
    });
  }

  const cooNode: OrgNode = {
    id: coo?.id ?? 'coo-placeholder',
    name: coo ? (coo.displayName ?? coo.name) : '모찌',
    role: 'coo',
    status: coo?.status ?? 'idle',
    model: coo?.model ?? null,
    children: leaderNodes,
  };

  const smithNode: OrgNode = {
    id: 'smith',
    name: 'Smith',
    role: 'owner',
    status: 'running',
    model: null,
    children: [cooNode],
  };

  return [smithNode];
}

function subtreeWidth(node: OrgNode): number {
  if (node.children.length === 0) return CARD_W;
  const childrenW = node.children.reduce((sum, c) => sum + subtreeWidth(c), 0);
  const gaps = (node.children.length - 1) * GAP_X;
  return Math.max(CARD_W, childrenW + gaps);
}

function layoutTree(node: OrgNode, x: number, y: number): LayoutNode {
  const totalW = subtreeWidth(node);
  const layoutChildren: LayoutNode[] = [];

  if (node.children.length > 0) {
    const childrenW = node.children.reduce((sum, c) => sum + subtreeWidth(c), 0);
    const gaps = (node.children.length - 1) * GAP_X;
    let cx = x + (totalW - childrenW - gaps) / 2;

    for (const child of node.children) {
      const cw = subtreeWidth(child);
      layoutChildren.push(layoutTree(child, cx, y + CARD_H + GAP_Y));
      cx += cw + GAP_X;
    }
  }

  return {
    ...node,
    x: x + (totalW - CARD_W) / 2,
    y,
    layoutChildren,
  };
}

function flattenLayout(nodes: LayoutNode[]): LayoutNode[] {
  const result: LayoutNode[] = [];
  function walk(n: LayoutNode) {
    result.push(n);
    n.layoutChildren.forEach(walk);
  }
  nodes.forEach(walk);
  return result;
}

function collectEdges(nodes: LayoutNode[]): Array<{ parent: LayoutNode; child: LayoutNode }> {
  const edges: Array<{ parent: LayoutNode; child: LayoutNode }> = [];
  function walk(n: LayoutNode) {
    for (const c of n.layoutChildren) {
      edges.push({ parent: n, child: c });
      walk(c);
    }
  }
  nodes.forEach(walk);
  return edges;
}

export function OrgChartPage() {
  const { data: agents, isLoading } = useAgents();
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });
  const hasInitialized = useRef(false);

  const tree = useMemo(() => {
    if (!agents || agents.length === 0) return [];
    return buildOrgTree(agents);
  }, [agents]);

  const layout = useMemo(() => {
    if (tree.length === 0) return [];
    let x = PADDING;
    return tree.map((root) => {
      const node = layoutTree(root, x, PADDING);
      x += subtreeWidth(root) + GAP_X;
      return node;
    });
  }, [tree]);

  const allNodes = useMemo(() => flattenLayout(layout), [layout]);
  const edges = useMemo(() => collectEdges(layout), [layout]);

  const bounds = useMemo(() => {
    if (allNodes.length === 0) return { width: 800, height: 600 };
    let maxX = 0;
    let maxY = 0;
    for (const n of allNodes) {
      maxX = Math.max(maxX, n.x + CARD_W);
      maxY = Math.max(maxY, n.y + CARD_H);
    }
    return { width: maxX + PADDING, height: maxY + PADDING };
  }, [allNodes]);

  // Center chart on first load
  useEffect(() => {
    if (hasInitialized.current || allNodes.length === 0 || !containerRef.current) return;
    hasInitialized.current = true;

    const container = containerRef.current;
    const cW = container.clientWidth;
    const cH = container.clientHeight;
    const scaleX = (cW - 40) / bounds.width;
    const scaleY = (cH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;

    setZoom(fitZoom);
    setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
  }, [allNodes, bounds]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement;
      if (target.closest('[data-org-card]')) return;
      setDragging(true);
      dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y };
    },
    [pan],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - dragStart.current.x;
      const dy = e.clientY - dragStart.current.y;
      setPan({ x: dragStart.current.panX + dx, y: dragStart.current.panY + dy });
    },
    [dragging],
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const rect = container.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      const newZoom = Math.min(Math.max(zoom * factor, 0.3), 2);
      const scale = newZoom / zoom;
      setPan({
        x: mouseX - scale * (mouseX - pan.x),
        y: mouseY - scale * (mouseY - pan.y),
      });
      setZoom(newZoom);
    },
    [zoom, pan],
  );

  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const cW = containerRef.current.clientWidth;
    const cH = containerRef.current.clientHeight;
    const scaleX = (cW - 40) / bounds.width;
    const scaleY = (cH - 40) / bounds.height;
    const fitZoom = Math.min(scaleX, scaleY, 1);
    const chartW = bounds.width * fitZoom;
    const chartH = bounds.height * fitZoom;
    setZoom(fitZoom);
    setPan({ x: (cW - chartW) / 2, y: (cH - chartH) / 2 });
  }, [bounds]);

  if (isLoading) {
    return <PageSkeleton variant="list" />;
  }

  if (!agents || agents.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-gray-900">조직도</h2>
        <EmptyState icon={Users} message="등록된 에이전트 없음" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-gray-900">조직도</h2>

      <div
        ref={containerRef}
        className="w-full h-[600px] overflow-hidden relative bg-gray-50 border border-gray-200 rounded-xl"
        style={{ cursor: dragging ? 'grabbing' : 'grab' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        {/* Zoom controls */}
        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1">
          <button
            className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors"
            onClick={() => {
              const newZoom = Math.min(zoom * 1.2, 2);
              if (containerRef.current) {
                const cx = containerRef.current.clientWidth / 2;
                const cy = containerRef.current.clientHeight / 2;
                const scale = newZoom / zoom;
                setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
              }
              setZoom(newZoom);
            }}
          >
            +
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded text-sm hover:bg-gray-50 transition-colors"
            onClick={() => {
              const newZoom = Math.max(zoom * 0.8, 0.3);
              if (containerRef.current) {
                const cx = containerRef.current.clientWidth / 2;
                const cy = containerRef.current.clientHeight / 2;
                const scale = newZoom / zoom;
                setPan({ x: cx - scale * (cx - pan.x), y: cy - scale * (cy - pan.y) });
              }
              setZoom(newZoom);
            }}
          >
            &minus;
          </button>
          <button
            className="w-7 h-7 flex items-center justify-center bg-white border border-gray-200 rounded text-[10px] hover:bg-gray-50 transition-colors"
            onClick={fitToScreen}
            title="화면에 맞추기"
          >
            맞춤
          </button>
        </div>

        {/* SVG edges */}
        <svg className="absolute inset-0 pointer-events-none" style={{ width: '100%', height: '100%' }}>
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {edges.map(({ parent, child }) => {
              const x1 = parent.x + CARD_W / 2;
              const y1 = parent.y + CARD_H;
              const x2 = child.x + CARD_W / 2;
              const y2 = child.y;
              const midY = (y1 + y2) / 2;
              return (
                <path
                  key={`${parent.id}-${child.id}`}
                  d={`M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`}
                  fill="none"
                  stroke="#e5e7eb"
                  strokeWidth={1.5}
                />
              );
            })}
          </g>
        </svg>

        {/* Card layer */}
        <div
          className="absolute inset-0"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {allNodes.map((node) => {
            const dotColor = STATUS_COLORS[node.status] ?? '#d1d5db';
            return (
              <div
                key={node.id}
                data-org-card
                className="absolute bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-gray-300 transition-all cursor-default select-none"
                style={{
                  left: node.x,
                  top: node.y,
                  width: CARD_W,
                  minHeight: CARD_H,
                }}
              >
                <div className="flex items-center px-3 py-2.5 gap-2.5">
                  <div className="relative shrink-0">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      {node.role === 'owner' ? (
                        <Users className="h-3.5 w-3.5 text-gray-500" />
                      ) : (
                        <Bot className="h-3.5 w-3.5 text-gray-500" />
                      )}
                    </div>
                    <span
                      className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white"
                      style={{ backgroundColor: dotColor }}
                    />
                  </div>
                  <div className="flex flex-col items-start min-w-0 flex-1">
                    <span className="text-xs font-semibold text-gray-900 leading-tight overflow-hidden whitespace-nowrap text-ellipsis w-full">
                      {node.name}
                    </span>
                    <span className="text-[10px] text-gray-400 leading-tight mt-0.5">
                      {ROLE_LABELS[node.role] ?? node.role}
                    </span>
                    <span className="text-[10px] text-gray-300 leading-tight">
                      {STATUS_LABELS[node.status] ?? node.status}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 범례 */}
      <div className="flex flex-wrap gap-4 px-2">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: STATUS_COLORS[key] ?? '#d1d5db' }}
            />
            <span className="text-xs text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
