import type { Node, Edge } from '@xyflow/react';
import { ThreeAxisPanel, DEFAULT_ADAPTERS, DEFAULT_MODELS, DEFAULT_AGENTS } from './ThreeAxisPanel';
import { LinkDetailPanel } from './LinkDetailPanel';
import { ReviewDetailPanel } from './ReviewDetailPanel';
import { NotifyConfigPanel } from './NotifyConfigPanel';
import { EmptyDetailPanel } from './EmptyDetailPanel';
import { ApprovalPanel } from './ApprovalPanel';

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
    // BD-028: gate_checking + approval → ApprovalPanel
    const nodeData = node.data as Record<string, unknown>;
    if (nodeData.status === 'gate_checking' && nodeData.gateType === 'approval') {
      return (
        <ApprovalPanel
          workflowId={String(nodeData.workflowId ?? '')}
          blockId={String(nodeData.blockId ?? node.id)}
          approver={String(nodeData.approver ?? '')}
          artifacts={(nodeData.artifacts as string[]) ?? []}
        />
      );
    }

    return (
      <ThreeAxisPanel
        node={node}
        onUpdateData={onUpdateNodeData ?? (() => {})}
        teams={teams}
        adapters={DEFAULT_ADAPTERS}
        models={DEFAULT_MODELS}
        agents={DEFAULT_AGENTS}
      />
    );
  }

  if (selectedEdgeId) {
    const edge = edges.find((e) => e.id === selectedEdgeId);
    if (!edge) return <EmptyDetailPanel />;
    return <LinkDetailPanel edge={edge} onUpdateData={onUpdateEdgeData} />;
  }

  return <EmptyDetailPanel />;
}
