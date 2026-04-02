import type { Node, Edge } from '@xyflow/react';
import { BlockDetailPanel } from './BlockDetailPanel';
import { LinkDetailPanel } from './LinkDetailPanel';
import { ReviewDetailPanel } from './ReviewDetailPanel';
import { NotifyConfigPanel } from './NotifyConfigPanel';
import { EmptyDetailPanel } from './EmptyDetailPanel';

interface DetailPanelProps {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  onUpdateNodeData?: (nodeId: string, data: Record<string, unknown>) => void;
  onUpdateEdgeData?: (edgeId: string, data: Record<string, unknown>) => void;
  onApprove?: (nodeId: string) => void;
  onReject?: (nodeId: string) => void;
  teams?: Array<{ id: string; name: string }>;
}

export function DetailPanel({
  nodes,
  edges,
  selectedNodeId,
  selectedEdgeId,
  onUpdateNodeData,
  onUpdateEdgeData,
  onApprove,
  onReject,
  teams,
}: DetailPanelProps) {
  if (selectedNodeId) {
    const node = nodes.find((n) => n.id === selectedNodeId);
    if (!node) return <EmptyDetailPanel />;

    if (node.type === 'review') {
      return <ReviewDetailPanel node={node} onApprove={onApprove} onReject={onReject} />;
    }
    if (node.type === 'notify') {
      return <NotifyConfigPanel node={node} />;
    }
    return <BlockDetailPanel node={node} onUpdateData={onUpdateNodeData} teams={teams} />;
  }

  if (selectedEdgeId) {
    const edge = edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return <EmptyDetailPanel />;
    return <LinkDetailPanel edge={edge} onUpdateData={onUpdateEdgeData} />;
  }

  return <EmptyDetailPanel />;
}
