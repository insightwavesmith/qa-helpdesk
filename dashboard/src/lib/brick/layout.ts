import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 100;
export const REVIEW_NODE_HEIGHT = 160;
export const NOTIFY_NODE_HEIGHT = 130;

export type LayoutDirection = 'TB' | 'LR';

function getNodeHeight(node: Node): number {
  if (node.type === 'review') return REVIEW_NODE_HEIGHT;
  // notify 타입 체크: data에 blockType이 있으면 사용
  const blockType = (node.data as Record<string, unknown>)?.blockType;
  if (blockType === 'notify') return NOTIFY_NODE_HEIGHT;
  return NODE_HEIGHT;
}

export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB',
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));

  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 80,
  });

  for (const node of nodes) {
    const height = getNodeHeight(node);
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const height = getNodeHeight(node);
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - height / 2,
      },
    };
  });
}
