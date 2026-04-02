import { useCallback } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { brickNodeTypes } from '../../components/brick/nodes';
import { brickEdgeTypes } from '../../components/brick/edges';
import { BlockSidebar } from '../../components/brick/BlockSidebar';
import type { BlockType } from '../../components/brick/nodes/types';

function BrickCanvasInner() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, , onEdgesChange] = useEdgesState([]);

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
        data: { blockType, label: blockType, status: 'idle' },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
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
          <button className="px-3 py-1 text-sm rounded bg-primary text-white hover:bg-primary-hover">저장</button>
        </div>

        {/* 캔버스 */}
        <div data-testid="canvas" className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onDrop={onDrop}
            onDragOver={onDragOver}
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
