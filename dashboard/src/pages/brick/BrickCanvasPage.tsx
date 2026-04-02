import { useCallback, useEffect, useState } from 'react';
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
import { LINK_TYPES, type BlockType, type LinkType } from '../../components/brick/nodes/types';
import { validateConnection } from '../../lib/brick/connection-validator';
import { yamlToFlow, flowToYaml } from '../../lib/brick/serializer';
import { DetailPanel } from '../../components/brick/panels/DetailPanel';

const LINK_TYPE_LABELS: Record<LinkType, string> = {
  sequential: '순차',
  parallel: '병렬',
  compete: '경쟁',
  loop: '반복',
  cron: '크론',
  branch: '분기',
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

  // 프리셋 ID (URL에서 가져올 수 있음)
  const presetId = 'default';

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

  // 캔버스 저장 (BF-078)
  const handleSave = useCallback(() => {
    const yaml = flowToYaml(nodes, edges, presetId);
    fetch(`/api/brick/presets/${presetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yaml),
    }).then(() => {
      setIsDirty(false);
    });
  }, [nodes, edges, presetId]);

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
        {/* 툴바 */}
        <div data-testid="toolbar" className="h-12 border-b border-gray-200 bg-white flex items-center px-4 gap-2">
          <button className="px-3 py-1 text-sm rounded bg-green-500 text-white hover:bg-green-600">실행</button>
          <button className="px-3 py-1 text-sm rounded bg-gray-200 text-gray-700 hover:bg-gray-300">정지</button>
          <div className="flex-1" />
          <button
            data-testid="save-btn"
            onClick={handleSave}
            className="px-3 py-1 text-sm rounded bg-primary text-white hover:bg-primary-hover"
          >
            저장
          </button>
        </div>

        {/* 캔버스 */}
        <div data-testid="canvas" className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
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
          <span className="text-xs text-gray-400">실행 타임라인</span>
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
