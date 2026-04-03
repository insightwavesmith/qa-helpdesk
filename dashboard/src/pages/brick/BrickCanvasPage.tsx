import { useCallback, useEffect, useState, useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { brickNodeTypes } from '../../components/brick/nodes';
import { brickEdgeTypes } from '../../components/brick/edges';
import { BlockSidebar } from '../../components/brick/BlockSidebar';
import { LINK_TYPES, STATUS_BORDER_COLORS, type BlockType, type BlockStatus, type LinkType } from '../../components/brick/nodes/types';
import { validateConnection } from '../../lib/brick/connection-validator';
import { yamlToFlow, flowToYamlFull } from '../../lib/brick/serializer';
import { DetailPanel } from '../../components/brick/panels/DetailPanel';
import { ExecutionTimeline, type TimelineEvent } from '../../components/brick/timeline/ExecutionTimeline';
import { CanvasToolbar } from '../../components/brick/toolbar/CanvasToolbar';
import { ExecuteDialog } from '../../components/brick/dialogs/ExecuteDialog';
import { useExecutionStatus, useExecutionLogs } from '../../hooks/brick/useExecutions';

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  sequential: '순차',
  parallel: '병렬',
  compete: '경쟁',
  loop: '반복',
  cron: '크론',
  branch: '분기',
};

// 백엔드 → 프론트엔드 블록 상태 매핑
const BACKEND_STATUS_MAP: Record<string, BlockStatus> = {
  pending: 'idle',
  queued: 'queued',
  running: 'running',
  gate_checking: 'running',
  completed: 'done',
  failed: 'failed',
  suspended: 'paused',
};

function BrickCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  // 링크 타입 선택 다이얼로그
  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);
  const [showLinkDialog, setShowLinkDialog] = useState(false);

  // 실행 상태
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [executionId, setExecutionId] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([]);

  // 실행 다이얼로그
  const [showExecuteDialog, setShowExecuteDialog] = useState(false);

  // 프리셋 ID (URL에서 가져올 수 있음)
  const presetId = 'default';

  // 실행 상태 폴링 (3초)
  const { data: executionData } = useExecutionStatus(executionId);

  // 실행 로그 폴링 (5초)
  const { data: logs } = useExecutionLogs(executionId);

  // BF-092: 실행 중 블록 상태 변경 시 노드 테두리 색상 실시간 반영
  const styledNodes = useMemo(() => {
    return nodes.map((node) => {
      const status = (node.data as Record<string, unknown>).status as BlockStatus | undefined;
      if (status && STATUS_BORDER_COLORS[status]) {
        return {
          ...node,
          style: {
            ...node.style,
            borderColor: STATUS_BORDER_COLORS[status],
            borderWidth: 2,
            borderStyle: 'solid' as const,
          },
        };
      }
      return node;
    });
  }, [nodes]);

  // BF-093: 실행 중 활성 링크 isActive 설정
  const styledEdges = useMemo(() => {
    if (!isExecuting) return edges;
    return edges.map((edge) => {
      const data = edge.data as Record<string, unknown> | undefined;
      if (data?.isActive) {
        return { ...edge, animated: true };
      }
      return edge;
    });
  }, [edges, isExecuting]);

  // 캔버스 로드 (BF-079)
  useEffect(() => {
    fetch(`/api/brick/presets/${presetId}`)
      .then((res) => res.json())
      .then((data) => {
        const { nodes: loadedNodes, edges: loadedEdges } = yamlToFlow(data);
        setNodes(loadedNodes);
        setEdges(loadedEdges);
      })
      .catch(() => {
        // 로드 실패 시 빈 캔버스
      });
  }, [presetId, setNodes, setEdges]);

  // blocksState → 노드 상태 동기화
  useEffect(() => {
    if (!executionData?.blocksState) return;

    let blocksState: Record<string, { status: string }>;
    try {
      blocksState = typeof executionData.blocksState === 'string'
        ? JSON.parse(executionData.blocksState)
        : executionData.blocksState;
    } catch {
      return;
    }

    setNodes((nds) =>
      nds.map((node) => {
        const blockId = (node.data as Record<string, unknown>).blockId as string;
        const blockState = blocksState[blockId];
        if (!blockState) return node;

        const frontStatus = BACKEND_STATUS_MAP[blockState.status] || 'idle';
        return {
          ...node,
          data: { ...node.data, status: frontStatus },
        };
      })
    );

    // 실행 완료/실패 감지
    if (executionData.status === 'completed' || executionData.status === 'failed') {
      setIsExecuting(false);
    }
    if (executionData.status === 'paused') {
      setIsPaused(true);
    } else {
      setIsPaused(false);
    }
  }, [executionData, setNodes]);

  // 활성 엣지 판정
  useEffect(() => {
    if (!executionData?.blocksState) return;

    let blocksState: Record<string, { status: string }>;
    try {
      blocksState = typeof executionData.blocksState === 'string'
        ? JSON.parse(executionData.blocksState)
        : executionData.blocksState;
    } catch {
      return;
    }

    const runningBlockIds = Object.entries(blocksState)
      .filter(([, v]) => v.status === 'running')
      .map(([k]) => k);

    setEdges((eds) =>
      eds.map((edge) => {
        const isActive = runningBlockIds.includes(edge.source);
        return {
          ...edge,
          data: { ...edge.data, isActive },
        };
      })
    );
  }, [executionData, setEdges]);

  // 로그 → 타임라인 이벤트 변환
  useEffect(() => {
    if (!logs || !Array.isArray(logs)) return;

    const statusMap: Record<string, BlockStatus> = {
      'block.started': 'running',
      'block.completed': 'done',
      'block.failed': 'failed',
      'block.gate_passed': 'done',
      'block.gate_failed': 'failed',
    };

    const events: TimelineEvent[] = logs.map((log: {
      id: number;
      eventType: string;
      blockId?: string;
      timestamp: string;
      data?: string;
    }) => ({
      timestamp: log.timestamp,
      blockName: log.blockId || '',
      status: statusMap[log.eventType] || 'idle',
    }));

    setTimelineEvents(events);
  }, [logs]);

  // beforeunload 경고 (unsaved changes)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // 캔버스 저장 (BF-078)
  const handleSave = useCallback(async () => {
    const yaml = flowToYamlFull(nodes, edges, presetId);
    await fetch(`/api/brick/presets/${presetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yaml),
    });
    setIsDirty(false);
  }, [nodes, edges, presetId]);

  // 실행 핸들러
  const handleExecute = useCallback(async (feature: string) => {
    // isDirty면 자동 저장
    if (isDirty) {
      await handleSave();
    }

    const res = await fetch('/api/brick/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId, feature }),
    });

    if (!res.ok) {
      const err = await res.json();
      alert(`실행 실패: ${err.error}`);
      return;
    }

    const execution = await res.json();
    setExecutionId(String(execution.id));
    setIsExecuting(true);
    setShowExecuteDialog(false);
  }, [isDirty, handleSave, presetId]);

  // BF-137: isValidConnection — ReactFlow 내장 연결 유효성 검사
  const isValidConnection = useCallback(
    (connection: Edge | Connection) => {
      if (!("source" in connection) || !connection.source || !connection.target) return false;
      return validateConnection(connection.source as string, connection.target as string, edges).valid;
    },
    [edges],
  );

  // 연결 시 유효성 검사 + 링크 타입 다이얼로그 (BF-068)
  const onConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return;
      const result = validateConnection(connection.source, connection.target, edges);
      if (!result.valid) {
        alert(result.reason);
        return;
      }
      setPendingConnection(connection);
      setShowLinkDialog(true);
    },
    [edges],
  );

  const handleLinkTypeSelect = useCallback(
    (linkType: LinkType) => {
      if (!pendingConnection) return;
      const newEdge: Edge = {
        id: `e-${pendingConnection.source}-${pendingConnection.target}`,
        source: pendingConnection.source!,
        target: pendingConnection.target!,
        type: 'link',
        data: { linkType, isActive: false },
      };
      setEdges((eds) => [...eds, newEdge]);
      setIsDirty(true);
      setShowLinkDialog(false);
      setPendingConnection(null);
    },
    [pendingConnection, setEdges],
  );

  // 노드 삭제 시 코어 프리셋 보호 (BF-080)
  const handleNodesChange = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      const removeChanges = changes.filter((c) => c.type === 'remove');
      for (const change of removeChanges) {
        if (change.type === 'remove') {
          const node = nodes.find((n) => n.id === change.id);
          if (node && (node.data as Record<string, unknown>).isCore === true) {
            alert('코어 프리셋 블록은 삭제할 수 없습니다');
            return;
          }
        }
      }
      onNodesChange(changes);
      setIsDirty(true);
    },
    [nodes, onNodesChange],
  );

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const blockType = event.dataTransfer?.getData('application/brick-block') as BlockType;
      if (!blockType) return;

      const reactFlowBounds = (event.target as HTMLElement).closest('.react-flow')?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = {
        x: event.clientX - reactFlowBounds.left,
        y: event.clientY - reactFlowBounds.top,
      };

      const newNode: Node = {
        id: `node-${Date.now()}`,
        type: 'block',
        position,
        data: { blockType, label: blockType, status: 'idle', isCore: false },
      };

      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
    },
    [setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
    setSelectedEdgeId(null);
  }, []);

  const onEdgeClick = useCallback((_: React.MouseEvent, edge: Edge) => {
    setSelectedEdgeId(edge.id);
    setSelectedNodeId(null);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
  }, []);

  return (
    <div data-testid="brick-canvas-page" className="flex h-[calc(100vh-3.5rem)] -m-6">
      {/* 사이드바 */}
      <BlockSidebar />

      <div className="flex-1 flex flex-col">
        {/* BF-096: INV 위반 경고 배너 */}
        {validationErrors.length > 0 && (
          <div data-testid="inv-warning-banner" className="px-4 py-2 text-sm text-white" style={{ backgroundColor: '#DC2626' }}>
            INV 위반: {validationErrors.join(', ')}
          </div>
        )}

        {/* 툴바 — CanvasToolbar 사용 */}
        <CanvasToolbar
          presetId={presetId}
          executionId={executionId}
          isExecuting={isExecuting}
          isPaused={isPaused}
          onSave={handleSave}
          onExecute={() => setShowExecuteDialog(true)}
        />

        {/* 캔버스 */}
        <div
          data-testid="canvas"
          className="flex-1 relative"
          style={validationErrors.length > 0 ? { border: '2px solid #DC2626' } : undefined}
        >
          {/* BF-145: 빈 캔버스 온보딩 가이드 */}
          {nodes.length === 0 && (
            <div
              data-testid="onboarding-guide"
              className="absolute inset-0 flex flex-col items-center justify-center z-10 pointer-events-none"
            >
              <div className="text-center space-y-3 bg-white/80 rounded-xl px-8 py-6 shadow-sm">
                <p className="text-lg font-medium text-gray-700">
                  블록을 왼쪽 팔레트에서 드래그하여 캔버스에 놓으세요
                </p>
                <p className="text-sm text-gray-400">← 사이드바에서 블록을 선택하세요</p>
              </div>
            </div>
          )}
          <ReactFlow
            nodes={styledNodes}
            edges={styledEdges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            isValidConnection={isValidConnection}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onNodeClick={onNodeClick}
            onEdgeClick={onEdgeClick}
            onPaneClick={onPaneClick}
            nodeTypes={brickNodeTypes}
            edgeTypes={brickEdgeTypes}
            fitView
          >
            <MiniMap data-testid="minimap" />
            <Controls data-testid="controls" />
            <Background variant={BackgroundVariant.Dots} data-testid="background" />
          </ReactFlow>
        </div>

        {/* 타임라인 */}
        <div data-testid="timeline" className="h-24 border-t border-gray-200 bg-white px-4 py-2">
          <ExecutionTimeline events={timelineEvents} />
        </div>
      </div>

      {/* 상세 패널 */}
      <div data-testid="detail-panel-container" className="w-72 border-l border-gray-200 bg-white overflow-y-auto">
        <DetailPanel
          nodes={nodes}
          edges={edges}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
        />
      </div>

      {/* 링크 타입 선택 다이얼로그 (BF-068) */}
      {showLinkDialog && (
        <div data-testid="link-type-dialog" className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-4 w-64">
            <h3 className="text-sm font-semibold mb-3">링크 타입 선택</h3>
            <div className="space-y-1">
              {LINK_TYPES.map((lt) => (
                <button
                  key={lt}
                  data-testid={`link-type-option-${lt}`}
                  onClick={() => handleLinkTypeSelect(lt)}
                  className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-100"
                >
                  {LINK_TYPE_LABELS[lt]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 실행 다이얼로그 */}
      <ExecuteDialog
        open={showExecuteDialog}
        onConfirm={handleExecute}
        onCancel={() => setShowExecuteDialog(false)}
      />
    </div>
  );
}

export function BrickCanvasPage() {
  return (
    <ReactFlowProvider>
      <BrickCanvasInner />
    </ReactFlowProvider>
  );
}
