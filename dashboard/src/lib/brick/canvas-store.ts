import { create } from 'zustand';
import { temporal } from 'zundo';
import {
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
  type Connection,
} from '@xyflow/react';

export interface CanvasState {
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  isDirty: boolean;
}

export interface CanvasActions {
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: Node) => void;
  removeNode: (nodeId: string) => void;
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setDirty: (dirty: boolean) => void;
}

export type CanvasStore = CanvasState & CanvasActions;

export const useCanvasStore = create<CanvasStore>()(
  temporal(
    (set, get) => ({
      // ── State ──
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      isDirty: false,

      // ── Actions ──
      onNodesChange: (changes) =>
        set((state) => ({
          nodes: applyNodeChanges(changes, state.nodes),
          isDirty: true,
        })),

      onEdgesChange: (changes) =>
        set((state) => ({
          edges: applyEdgeChanges(changes, state.edges),
          isDirty: true,
        })),

      onConnect: (connection) =>
        set((state) => ({
          edges: addEdge(connection, state.edges),
          isDirty: true,
        })),

      addNode: (node) =>
        set((state) => ({
          nodes: [...state.nodes, node],
          isDirty: true,
        })),

      removeNode: (nodeId) =>
        set((state) => ({
          nodes: state.nodes.filter((n) => n.id !== nodeId),
          edges: state.edges.filter(
            (e) => e.source !== nodeId && e.target !== nodeId,
          ),
          isDirty: true,
        })),

      updateNodeData: (nodeId, data) =>
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n,
          ),
          isDirty: true,
        })),

      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      selectNode: (nodeId) =>
        set({ selectedNodeId: nodeId, selectedEdgeId: null }),

      selectEdge: (edgeId) =>
        set({ selectedEdgeId: edgeId, selectedNodeId: null }),

      setDirty: (dirty) => set({ isDirty: dirty }),
    }),
    { limit: 50 },
  ),
);
