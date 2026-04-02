import type { Node, Edge } from '@xyflow/react';

// ── 블록 타입 (10종) ──
export const BLOCK_TYPES = [
  'plan', 'design', 'implement', 'test', 'review',
  'deploy', 'monitor', 'rollback', 'notify', 'custom',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

// ── 블록 상태 (7종) ──
export const BLOCK_STATUSES = [
  'idle', 'queued', 'running', 'paused', 'done', 'failed', 'skipped',
] as const;
export type BlockStatus = (typeof BLOCK_STATUSES)[number];

// ── 상태별 테두리 색상 ──
export const STATUS_BORDER_COLORS: Record<BlockStatus, string> = {
  idle: '#D1D5DB',
  queued: '#FCD34D',
  running: '#3B82F6',
  paused: '#F59E0B',
  done: '#10B981',
  failed: '#EF4444',
  skipped: '#9CA3AF',
};

// ── 상태별 아이콘 ──
export const STATUS_ICONS: Record<BlockStatus, string> = {
  idle: '○',
  queued: '◷',
  running: '◉',
  paused: '⏸',
  done: '✓',
  failed: '✕',
  skipped: '─',
};

// ── 블록 타입별 아이콘 ──
export const BLOCK_TYPE_ICONS: Record<BlockType, string> = {
  plan: '📋',
  design: '🎨',
  implement: '⚙️',
  test: '🧪',
  review: '👀',
  deploy: '🚀',
  monitor: '📊',
  rollback: '↩️',
  notify: '🔔',
  custom: '🔧',
};

// ── 블록 타입별 한국어 이름 ──
export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  plan: '기획',
  design: '설계',
  implement: '구현',
  test: '테스트',
  review: '리뷰',
  deploy: '배포',
  monitor: '모니터링',
  rollback: '롤백',
  notify: '알림',
  custom: '커스텀',
};

// ── 카테고리별 배경색 ──
export type BlockCategory = 'Plan' | 'Do' | 'Check' | 'Act' | 'Notify';

export const BLOCK_CATEGORY_MAP: Record<BlockType, BlockCategory> = {
  plan: 'Plan',
  design: 'Plan',
  implement: 'Do',
  deploy: 'Do',
  test: 'Check',
  review: 'Check',
  monitor: 'Check',
  rollback: 'Act',
  custom: 'Act',
  notify: 'Notify',
};

export const CATEGORY_BG_COLORS: Record<BlockCategory, string> = {
  Plan: '#EFF6FF',
  Do: '#F0FDF4',
  Check: '#FEFCE8',
  Act: '#FAF5FF',
  Notify: '#F0F9FF',
};

// ── 게이트 상태 ──
export interface GateStatus {
  name: string;
  passed: boolean;
}

// ── BlockNode 데이터 ──
export interface BlockNodeData {
  blockType: BlockType;
  label: string;
  status: BlockStatus;
  team?: string;
  gates?: GateStatus[];
  [key: string]: unknown;
}

// ── ReviewNode 데이터 (BlockNode 확장) ──
export interface Reviewer {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface ChecklistItem {
  id: string;
  label: string;
  checked: boolean;
}

export type ReviewStatus = 'pending' | 'approved' | 'changes_requested' | 'rejected';

export interface ReviewNodeData extends BlockNodeData {
  blockType: 'review';
  reviewers: Reviewer[];
  checklist: ChecklistItem[];
  checklistProgress: number;
  reviewStatus: ReviewStatus;
  [key: string]: unknown;
}

// ── 링크 타입 (6종) ──
export const LINK_TYPES = [
  'sequential', 'parallel', 'compete', 'loop', 'cron', 'branch',
] as const;
export type LinkType = (typeof LINK_TYPES)[number];

// ── LinkEdge 데이터 ──
export interface LinkEdgeData {
  linkType: LinkType;
  isActive?: boolean;
  judge?: string;
  condition?: string;
  cron?: string;
  [key: string]: unknown;
}

// ── React Flow 노드/엣지 타입 ──
export type BrickNode = Node<BlockNodeData, 'block'> | Node<ReviewNodeData, 'review'>;
export type BrickEdge = Edge<LinkEdgeData>;
