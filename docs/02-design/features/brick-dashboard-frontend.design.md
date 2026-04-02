# Design: Brick Dashboard Frontend (프론트엔드)

> 작성일: 2026-04-02
> 작성자: PM
> 레벨: L2-기능
> Plan: docs/01-plan/features/brick-dashboard-frontend.plan.md
> API Design: docs/02-design/features/brick-dashboard.design.md

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 기능 | Brick Dashboard Frontend (브라우저 워크플로우 에디터) |
| 시작일 | 2026-04-02 |
| 기술 | React Flow + zustand + Monaco Editor + dagre |
| Phase | 5단계 (기반→CRUD→인터랙션→실시간→Review+Learning) |
| TDD 케이스 | BF-001 ~ BF-120 (120건) |

| 관점 | 내용 |
|------|------|
| **문제** | Brick 워크플로우를 CLI로만 관리 가능 — 시각적 편집/모니터링 불가 |
| **해결** | React Flow 캔버스 에디터 + 3축 CRUD UI + 실시간 모니터링 |
| **기능/UX** | 블록 드래그&드롭, 링크 연결, Gate 설정, Review 승인, 실행 제어 |
| **핵심 가치** | "CLI 등가" — CLI로 할 수 있는 모든 것을 브라우저에서 |

---

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────┐
│                    브라우저 (React)                           │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌────────────────────┐    │
│  │ zustand   │  │ React Query  │  │ WebSocket Client   │    │
│  │ (canvas)  │  │ (server)     │  │ (useLiveUpdates)   │    │
│  └─────┬─────┘  └──────┬───────┘  └─────────┬──────────┘    │
│        │               │                    │               │
│  ┌─────▼─────────────────▼────────────────────▼──────────┐  │
│  │              React Flow Canvas                        │  │
│  │  ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌──────┐          │  │
│  │  │Block│→│Block│→│Block│→│Gate │→│Review│          │  │
│  │  │Node │ │Node │ │Node │ │Ind. │ │Node  │          │  │
│  │  └─────┘ └─────┘ └─────┘ └─────┘ └──────┘          │  │
│  └───────────────────────────────────────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP + WebSocket
┌────────────────────────▼────────────────────────────────────┐
│              Express Server (기존 dashboard/server)          │
│  routes/ → services/ → db/ (SQLite) + file system (YAML)   │
│  realtime/ws.ts → EventBus                                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.1 상태 관리 분리

| 상태 유형 | 저장소 | 예시 |
|----------|--------|------|
| 캔버스 로컬 | zustand | 노드 위치, 선택, 줌, 팬, undo 스택 |
| 서버 데이터 | React Query | BlockType 목록, Team 목록, 실행 이력 |
| 실시간 이벤트 | WebSocket → React Query invalidation | 블록 상태, Gate 결과, 실행 진행 |
| 파일 원본 | Express → 파일 시스템 (YAML/JSON/MD) | Preset, SKILL.md, 블록 정의 |

---

## 2. 캔버스 설계

### 2.1 커스텀 노드 타입

```typescript
// dashboard/src/components/brick/nodes/types.ts

/** 블록 노드 공통 데이터 */
interface BlockNodeData {
  blockId: string;
  name: string;
  blockType: BlockTypeName;
  teamId: string | null;
  status: BlockStatus;
  gates: GateIndicator[];
  isCore: boolean;        // Core 프리셋 블록 → readonly
  executionTime?: number; // ms
  error?: string;
}

type BlockTypeName =
  | 'plan' | 'design' | 'implement' | 'test'
  | 'review' | 'deploy' | 'monitor' | 'rollback'
  | 'custom';

type BlockStatus =
  | 'idle' | 'queued' | 'running' | 'paused'
  | 'done' | 'failed' | 'skipped' | 'cancelled';

interface GateIndicator {
  gateId: string;
  type: 'command' | 'http' | 'prompt' | 'agent' | 'review';
  status: 'pending' | 'passed' | 'failed' | 'timeout';
}

/** Review 블록 전용 데이터 */
interface ReviewNodeData extends BlockNodeData {
  blockType: 'review';
  reviewers: Reviewer[];
  checklist: ChecklistItem[];
  checklistProgress: number; // 0~100
  reviewStatus: 'pending' | 'approved' | 'changes_requested' | 'rejected';
}
```

### 2.2 노드 타입별 등록

```typescript
// dashboard/src/components/brick/nodes/index.ts

import { BlockNode } from './BlockNode';
import { ReviewNode } from './ReviewNode';
import { StartNode } from './StartNode';
import { EndNode } from './EndNode';

export const brickNodeTypes = {
  block: BlockNode,
  review: ReviewNode,
  start: StartNode,
  end: EndNode,
} as const;
```

### 2.3 BlockNode 렌더링 사양

```
┌─────────────────────────────────┐
│ ▼ (입력 핸들)                    │
├─────────────────────────────────┤
│ [아이콘] 블록 이름          [상태]│
│ 팀: {팀이름}                     │
│ Gate: ● ● ●  (passed/failed)   │
├─────────────────────────────────┤
│ ▼ (출력 핸들)                    │
└─────────────────────────────────┘
```

| 상태 | 노드 테두리 색 | 배경 | 아이콘 |
|------|-------------|------|--------|
| idle | #D1D5DB (회색) | 흰색 | ○ |
| queued | #FCD34D (노랑) | 흰색 | ◷ |
| running | #3B82F6 (파랑) | #EFF6FF | ◉ 회전 |
| paused | #F59E0B (주황) | #FFFBEB | ⏸ |
| done | #10B981 (초록) | #ECFDF5 | ✓ |
| failed | #EF4444 (빨강) | #FEF2F2 | ✕ |
| skipped | #9CA3AF (연회색) | 흰색 | ─ |

### 2.4 ReviewNode 렌더링 사양

```
┌─────────────────────────────────┐
│ ▼ (입력 핸들)                    │
├──── 보라색 테두리 #8B5CF6 ──────┤
│ [리뷰 아이콘] 리뷰 블록     [상태]│
│ 리뷰어: 👤 👤 👤                 │
│ ━━━━━━━━━━━━ 60% ━━━━          │ ← 체크리스트 진행률
│ [승인] [변경요청] [거부]         │
├─────────────────────────────────┤
│ ▼ (출력 핸들)                    │
└─────────────────────────────────┘
```

### 2.5 커스텀 엣지 타입

```typescript
interface LinkEdgeData {
  linkType: LinkType;
  condition?: string;
  isActive: boolean;       // 현재 실행 중인 링크
  matchRate?: number;      // compete/branch 조건
}

type LinkType =
  | 'sequential' | 'parallel' | 'compete'
  | 'loop' | 'cron' | 'branch';
```

| 링크 타입 | 엣지 스타일 | 라벨 |
|----------|-----------|------|
| sequential | smoothstep, 실선 | (없음) |
| parallel | smoothstep, 실선, 파랑 | `∥` |
| compete | bezier, 점선, 주황 | `⚔ {judge}` |
| loop | step, 실선, 보라 | `↻ {조건}` |
| cron | smoothstep, 파선, 회색 | `⏰ {cron}` |
| branch | bezier, 실선, 초록 | `⑂ {조건}` |

### 2.6 자동 레이아웃 (dagre)

```typescript
// dashboard/src/lib/brick/layout.ts

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;
const REVIEW_NODE_HEIGHT = 160;

export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    const height = node.type === 'review' ? REVIEW_NODE_HEIGHT : NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const height = node.type === 'review' ? REVIEW_NODE_HEIGHT : NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: pos.x - NODE_WIDTH / 2,
        y: pos.y - height / 2,
      },
    };
  });
}
```

---

## 3. zustand 캔버스 스토어

```typescript
// dashboard/src/lib/brick/canvas-store.ts

import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Node, Edge, OnNodesChange, OnEdgesChange, Connection } from '@xyflow/react';
import { applyNodeChanges, applyEdgeChanges, addEdge } from '@xyflow/react';

interface CanvasState {
  // 노드/엣지
  nodes: Node[];
  edges: Edge[];
  
  // 선택
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  
  // 뷰포트
  direction: 'TB' | 'LR';
  
  // 편집 모드
  isEditing: boolean;
  isDirty: boolean;
  
  // 실행 상태
  executionId: string | null;
  isExecuting: boolean;
  
  // 액션
  onNodesChange: OnNodesChange;
  onEdgesChange: OnEdgesChange;
  onConnect: (connection: Connection) => void;
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  selectNode: (id: string | null) => void;
  selectEdge: (id: string | null) => void;
  addNode: (node: Node) => void;
  removeNode: (id: string) => void;
  updateNodeData: (id: string, data: Partial<BlockNodeData>) => void;
  setDirection: (dir: 'TB' | 'LR') => void;
  setDirty: (dirty: boolean) => void;
  
  // 실행 제어
  setExecution: (id: string | null, isRunning: boolean) => void;
  updateBlockStatus: (blockId: string, status: BlockStatus) => void;
}

export const useCanvasStore = create<CanvasState>()(
  temporal(
    (set, get) => ({
      nodes: [],
      edges: [],
      selectedNodeId: null,
      selectedEdgeId: null,
      direction: 'TB',
      isEditing: true,
      isDirty: false,
      executionId: null,
      isExecuting: false,

      onNodesChange: (changes) => {
        set({ nodes: applyNodeChanges(changes, get().nodes), isDirty: true });
      },
      onEdgesChange: (changes) => {
        set({ edges: applyEdgeChanges(changes, get().edges), isDirty: true });
      },
      onConnect: (connection) => {
        set({ edges: addEdge(connection, get().edges), isDirty: true });
      },
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),
      selectNode: (id) => set({ selectedNodeId: id, selectedEdgeId: null }),
      selectEdge: (id) => set({ selectedEdgeId: id, selectedNodeId: null }),
      addNode: (node) => set({ nodes: [...get().nodes, node], isDirty: true }),
      removeNode: (id) => set({
        nodes: get().nodes.filter((n) => n.id !== id),
        edges: get().edges.filter((e) => e.source !== id && e.target !== id),
        isDirty: true,
      }),
      updateNodeData: (id, data) => set({
        nodes: get().nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        ),
      }),
      setDirection: (direction) => set({ direction }),
      setDirty: (isDirty) => set({ isDirty }),
      setExecution: (executionId, isExecuting) => set({ executionId, isExecuting }),
      updateBlockStatus: (blockId, status) => {
        set({
          nodes: get().nodes.map((n) =>
            n.data?.blockId === blockId
              ? { ...n, data: { ...n.data, status } }
              : n
          ),
        });
      },
    }),
    { limit: 50 } // undo 50단계
  )
);
```

---

## 4. API hooks 설계

```typescript
// dashboard/src/hooks/brick/useBlockTypes.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../useApi';

export function useBlockTypes() {
  const api = useApi();
  return useQuery({
    queryKey: ['brick', 'blockTypes'],
    queryFn: () => api.get('/api/brick/block-types'),
  });
}

export function useCreateBlockType() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateBlockTypeRequest) =>
      api.post('/api/brick/block-types', data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'blockTypes'] }),
  });
}

// 동일 패턴: useTeams, usePresets, useExecutions, useLearning 등
```

### 4.1 API 연동 매핑 테이블

| 그룹 | Hook | API | Method |
|------|------|-----|--------|
| BlockType | useBlockTypes | /api/brick/block-types | GET |
| BlockType | useBlockType(id) | /api/brick/block-types/:id | GET |
| BlockType | useCreateBlockType | /api/brick/block-types | POST |
| BlockType | useUpdateBlockType | /api/brick/block-types/:id | PUT |
| BlockType | useDeleteBlockType | /api/brick/block-types/:id | DELETE |
| Team | useTeams | /api/brick/teams | GET |
| Team | useTeam(id) | /api/brick/teams/:id | GET |
| Team | useCreateTeam | /api/brick/teams | POST |
| Team | useUpdateTeam | /api/brick/teams/:id | PUT |
| Team | useDeleteTeam | /api/brick/teams/:id | DELETE |
| Team | useTeamMembers(id) | /api/brick/teams/:id/members | GET |
| Team | useAddMember | /api/brick/teams/:id/members | POST |
| Team | useRemoveMember | /api/brick/teams/:id/members/:mid | DELETE |
| Team | useTeamSkills(id) | /api/brick/teams/:id/skills | GET |
| Team | useUpdateSkill | /api/brick/teams/:id/skills | PUT |
| Team | useTeamMcpServers(id) | /api/brick/teams/:id/mcp | GET |
| Team | useConfigureMcp | /api/brick/teams/:id/mcp | PUT |
| Team | useTeamModel(id) | /api/brick/teams/:id/model | GET |
| Team | useSetModel | /api/brick/teams/:id/model | PUT |
| Team | useTeamStatus(id) | /api/brick/teams/:id/status | GET |
| Link | useLinks(presetId) | /api/brick/presets/:id/links | GET |
| Link | useCreateLink | /api/brick/links | POST |
| Link | useUpdateLink | /api/brick/links/:id | PUT |
| Link | useDeleteLink | /api/brick/links/:id | DELETE |
| Preset | usePresets | /api/brick/presets | GET |
| Preset | usePreset(id) | /api/brick/presets/:id | GET |
| Preset | useCreatePreset | /api/brick/presets | POST |
| Preset | useUpdatePreset | /api/brick/presets/:id | PUT |
| Preset | useDeletePreset | /api/brick/presets/:id | DELETE |
| Preset | useExportPreset | /api/brick/presets/:id/export | GET |
| Preset | useImportPreset | /api/brick/presets/import | POST |
| Preset | useApplyPreset | /api/brick/presets/:id/apply | POST |
| Execution | useStartExecution | /api/brick/executions | POST |
| Execution | usePauseExecution | /api/brick/executions/:id/pause | POST |
| Execution | useResumeExecution | /api/brick/executions/:id/resume | POST |
| Execution | useCancelExecution | /api/brick/executions/:id/cancel | POST |
| Execution | useExecutionStatus | /api/brick/executions/:id | GET |
| Execution | useExecutionLogs | /api/brick/executions/:id/logs | GET |
| Gate | useGateResult(id) | /api/brick/gates/:id/result | GET |
| Gate | useOverrideGate | /api/brick/gates/:id/override | POST |
| Gate | useRetryGate | /api/brick/gates/:id/retry | POST |
| Learning | useLearningProposals | /api/brick/learning/proposals | GET |
| Learning | useApproveProposal | /api/brick/learning/:id/approve | POST |
| Learning | useRejectProposal | /api/brick/learning/:id/reject | POST |
| System | useInvariants | /api/brick/system/invariants | GET |
| System | useSystemHealth | /api/brick/system/health | GET |

---

## 5. WebSocket 이벤트 처리

### 5.1 useLiveUpdates 확장

```typescript
// useLiveUpdates.ts 기존 switch에 추가

case 'block':
  queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
  // zustand 직접 업데이트 (캔버스 즉시 반영)
  if (msg.data?.blockId && msg.data?.status) {
    useCanvasStore.getState().updateBlockStatus(
      msg.data.blockId,
      msg.data.status
    );
  }
  break;

case 'gate':
  queryClient.invalidateQueries({ queryKey: ['brick', 'gates'] });
  // Gate 결과 토스트
  if (msg.data?.gateId) {
    showGateToast(msg.data);
  }
  break;

case 'team':
  queryClient.invalidateQueries({ queryKey: ['brick', 'teams'] });
  break;

case 'review_requested':
  queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
  showReviewNotification(msg.data);
  break;

case 'learning_proposal':
  queryClient.invalidateQueries({ queryKey: ['brick', 'learning'] });
  showLearningToast(msg.data);
  break;

case 'execution':
  queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
  if (msg.data?.status === 'completed' || msg.data?.status === 'failed') {
    useCanvasStore.getState().setExecution(null, false);
  }
  break;
```

### 5.2 WebSocket 메시지 스로틀

```typescript
// dashboard/src/lib/brick/ws-throttle.ts

/** 같은 blockId의 status 업데이트를 16ms 내 배치 처리 */
const pendingUpdates = new Map<string, BlockStatus>();
let rafId: number | null = null;

export function throttledBlockUpdate(blockId: string, status: BlockStatus) {
  pendingUpdates.set(blockId, status);
  
  if (rafId === null) {
    rafId = requestAnimationFrame(() => {
      const store = useCanvasStore.getState();
      pendingUpdates.forEach((s, id) => store.updateBlockStatus(id, s));
      pendingUpdates.clear();
      rafId = null;
    });
  }
}
```

---

## 6. YAML ↔ React Flow 직렬화

### 6.1 YAML → React Flow 변환

```typescript
// dashboard/src/lib/brick/serializer.ts

interface PresetYaml {
  name: string;
  blocks: Record<string, {
    type: string;
    team?: string;
    gates?: GateConfig[];
    config?: Record<string, unknown>;
  }>;
  links: Array<{
    from: string;
    to: string;
    type: LinkType;
    condition?: string;
  }>;
}

export function yamlToFlow(yaml: PresetYaml): { nodes: Node[]; edges: Edge[] } {
  const blockEntries = Object.entries(yaml.blocks);
  
  const nodes: Node[] = blockEntries.map(([id, block], index) => ({
    id,
    type: block.type === 'review' ? 'review' : 'block',
    position: { x: 0, y: index * 150 }, // dagre가 재배치
    data: {
      blockId: id,
      name: id,
      blockType: block.type,
      teamId: block.team ?? null,
      status: 'idle',
      gates: (block.gates ?? []).map((g) => ({
        gateId: `${id}-gate-${g.type}`,
        type: g.type,
        status: 'pending',
      })),
      isCore: false,
    } satisfies BlockNodeData,
  }));

  const edges: Edge[] = yaml.links.map((link, i) => ({
    id: `link-${i}`,
    source: link.from,
    target: link.to,
    type: 'link',
    data: {
      linkType: link.type,
      condition: link.condition,
      isActive: false,
    } satisfies LinkEdgeData,
  }));

  // dagre 자동 레이아웃 적용
  const layoutedNodes = autoLayout(nodes, edges);
  return { nodes: layoutedNodes, edges };
}

export function flowToYaml(nodes: Node[], edges: Edge[]): PresetYaml {
  const blocks: PresetYaml['blocks'] = {};
  for (const node of nodes) {
    if (node.type === 'start' || node.type === 'end') continue;
    blocks[node.id] = {
      type: node.data.blockType,
      team: node.data.teamId ?? undefined,
      gates: node.data.gates?.map((g: GateIndicator) => ({ type: g.type })),
    };
  }

  const links: PresetYaml['links'] = edges.map((edge) => ({
    from: edge.source,
    to: edge.target,
    type: edge.data?.linkType ?? 'sequential',
    condition: edge.data?.condition,
  }));

  return { name: '', blocks, links };
}
```

---

## 7. 화면별 상세 설계

### 7.1 BrickCanvasPage 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│ CanvasToolbar                                               │
│ [▶ 실행] [⏸ 일시정지] [⏹ 중지] │ [↕ 세로] [↔ 가로] [⌗ 정렬]│ [💾 저장] │
├────────┬────────────────────────────────────┬────────────────┤
│ Block  │                                    │ Detail Panel   │
│ Side-  │     React Flow Canvas              │                │
│ bar    │                                    │ (선택된 블록    │
│        │   ┌─────┐   ┌─────┐               │  상세 편집)     │
│ [Plan] │   │plan │──→│impl │               │                │
│ [Impl] │   └─────┘   └─────┘               │ - 이름 편집    │
│ [Test] │       │       │                    │ - 팀 배정      │
│ [Rev.] │       ▼       ▼                    │ - Gate 설정    │
│ [Depl] │   ┌─────┐   ┌──────┐              │ - 조건 편집    │
│ [Mon.] │   │test │──→│review│              │                │
│ [Roll] │   └─────┘   └──────┘              │                │
│ [Cust] │                                    │                │
├────────┴────────────────────────────────────┴────────────────┤
│ ExecutionTimeline                                            │
│ 10:01 plan ✓ │ 10:05 impl ✓ │ 10:12 test ● running │ ...   │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 BlockSidebar 드래그&드롭

```typescript
// dashboard/src/components/brick/sidebar/BlockSidebar.tsx

const BLOCK_TYPES = [
  { type: 'plan',      icon: '📋', label: '계획' },
  { type: 'design',    icon: '📐', label: '설계' },
  { type: 'implement', icon: '💻', label: '구현' },
  { type: 'test',      icon: '🧪', label: '테스트' },
  { type: 'review',    icon: '👁', label: '리뷰' },
  { type: 'deploy',    icon: '🚀', label: '배포' },
  { type: 'monitor',   icon: '📊', label: '모니터' },
  { type: 'rollback',  icon: '⏪', label: '롤백' },
  { type: 'custom',    icon: '⚙️', label: '커스텀' },
] as const;

function BlockSidebarItem({ type, icon, label }: BlockTypeInfo) {
  const onDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('application/brick-block', type);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="flex items-center gap-2 p-2 rounded cursor-grab
                 hover:bg-gray-100 border border-gray-200"
    >
      <span>{icon}</span>
      <span className="text-sm">{label}</span>
    </div>
  );
}
```

### 7.3 DetailPanel 구조

```typescript
// 선택된 노드/엣지에 따라 다른 패널 렌더링
function DetailPanel() {
  const { selectedNodeId, selectedEdgeId } = useCanvasStore();

  if (selectedNodeId) {
    const node = useCanvasStore.getState().nodes.find(n => n.id === selectedNodeId);
    if (node?.type === 'review') return <ReviewDetailPanel nodeId={selectedNodeId} />;
    return <BlockDetailPanel nodeId={selectedNodeId} />;
  }
  
  if (selectedEdgeId) return <LinkDetailPanel edgeId={selectedEdgeId} />;
  
  return <EmptyDetailPanel />;
}
```

### 7.4 GateConfigPanel — Gate 5종 설정 UI

```
┌─────────────────────────────────┐
│ Gate 설정                        │
├─────────────────────────────────┤
│ [+ Gate 추가]                    │
│                                 │
│ ┌─ Gate 1: command ──────────┐  │
│ │ 명령어: [npm run build    ]│  │
│ │ 타임아웃: [30] 초          │  │
│ │ 실패 시: [중단 ▼]         │  │
│ │ [삭제]                     │  │
│ └────────────────────────────┘  │
│                                 │
│ ┌─ Gate 2: prompt ───────────┐  │
│ │ 프롬프트: [코드 품질 확인  ]│  │
│ │ 모델: [Sonnet ▼]          │  │
│ │ 신뢰도 임계값: [0.7]      │  │
│ │ 투표 횟수: [3]             │  │
│ │ [삭제]                     │  │
│ └────────────────────────────┘  │
│                                 │
│ ┌─ Gate 3: review ───────────┐  │
│ │ 리뷰어: [Smith, 모찌]      │  │
│ │ 전략: [any ▼]             │  │
│ │ 타임아웃: [24] 시간        │  │
│ │ 에스컬레이션: [Smith ▼]    │  │
│ │ [삭제]                     │  │
│ └────────────────────────────┘  │
├─────────────────────────────────┤
│ 실행 순서: auto gates → review  │
│ Auto 실행: [sequential ▼]      │
└─────────────────────────────────┘
```

### 7.5 TeamDetailPage 레이아웃

```
┌─────────────────────────────────────────────┐
│ 팀: CTO팀                    [idle] [Claude]│
├─────────┬───────────────────────────────────┤
│ 탭:     │                                   │
│ [팀원]  │ ┌─ 팀원 목록 ────────────────┐   │
│ [스킬]  │ │ 👤 CTO-Leader (leader)  [✕]│   │
│ [MCP]   │ │ 👤 frontend-dev (dev)   [✕]│   │
│ [모델]  │ │ 👤 qa-engineer (qa)     [✕]│   │
│         │ │ [+ 팀원 추가]              │   │
│         │ └────────────────────────────┘   │
│         │                                   │
│ [스킬]  │ ┌─ Monaco Editor ─────────────┐  │
│         │ │ # SKILL.md                   │  │
│         │ │ ## 역할                       │  │
│         │ │ CTO팀은 구현 + QA를 담당...   │  │
│         │ │                              │  │
│         │ └──────────────────────────────┘  │
│         │ [저장]                             │
│         │                                   │
│ [MCP]   │ ┌─ MCP 서버 ─────────────────┐  │
│         │ │ ☑ context7    ☑ bkit-pdca   │  │
│         │ │ ☐ github      ☑ bkit-analysis│  │
│         │ │ ☐ slack       ☐ custom-api  │  │
│         │ └────────────────────────────┘   │
│         │                                   │
│ [모델]  │ ┌─ LLM 모델 선택 ────────────┐  │
│         │ │ ◉ Claude Opus 4.6           │  │
│         │ │ ○ Claude Sonnet 4.6         │  │
│         │ │ ○ Claude Haiku 4.5          │  │
│         │ │ ○ GPT-4o                    │  │
│         │ └────────────────────────────┘   │
├─────────┴───────────────────────────────────┤
│ Adapter: [Claude Agent Teams ▼]             │
└─────────────────────────────────────────────┘
```

### 7.6 LearningHarnessPage

```
┌─────────────────────────────────────────────┐
│ 학습 하네스                    [설정]        │
├─────────────────────────────────────────────┤
│ ┌─ 제안 목록 ──────────────────────────┐   │
│ │ #12 Gate 추가 제안: test 블록에 lint  │   │
│ │     2026-04-02 10:30 │ 신뢰도 0.87   │   │
│ │     [상세보기] [승인] [거부]          │   │
│ ├──────────────────────────────────────┤   │
│ │ #11 링크 최적화: parallel → compete   │   │
│ │     2026-04-02 09:15 │ 신뢰도 0.72   │   │
│ │     [상세보기] [승인] [거부]          │   │
│ └──────────────────────────────────────┘   │
│                                             │
│ ┌─ 제안 #12 상세 ─────────────────────┐    │
│ │ 변경 전:                             │    │
│ │   gates: []                          │    │
│ │ 변경 후:                             │    │
│ │   gates:                             │    │
│ │     - type: command                  │    │
│ │       command: npm run lint          │    │
│ │                                      │    │
│ │ 근거: 최근 3회 실행에서 lint 에러로   │    │
│ │ 배포 후 롤백 발생. 자동 Gate로 방지.  │    │
│ │                                      │    │
│ │ [승인 + 코멘트] [거부 + 사유]         │    │
│ └──────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
```

---

## 8. 연결 유효성 검증

```typescript
// dashboard/src/lib/brick/connection-validator.ts

import type { Connection, Node, Edge } from '@xyflow/react';

interface ValidationResult {
  valid: boolean;
  reason?: string;
  inv?: string; // 위반된 INV 번호
}

export function validateConnection(
  connection: Connection,
  nodes: Node[],
  edges: Edge[]
): ValidationResult {
  const { source, target } = connection;
  if (!source || !target) return { valid: false, reason: '소스/타겟 누락' };

  // INV-1: DAG 순환 방지
  if (wouldCreateCycle(source, target, edges)) {
    return { valid: false, reason: '순환 연결 불가', inv: 'INV-1' };
  }

  // INV-2: 자기 참조 방지
  if (source === target) {
    return { valid: false, reason: '자기 참조 불가', inv: 'INV-2' };
  }

  // INV-3: 중복 연결 방지
  if (edges.some(e => e.source === source && e.target === target)) {
    return { valid: false, reason: '이미 연결됨', inv: 'INV-3' };
  }

  return { valid: true };
}

function wouldCreateCycle(
  source: string,
  target: string,
  edges: Edge[]
): boolean {
  // BFS로 target에서 source까지 도달 가능한지 확인
  const visited = new Set<string>();
  const queue = [target];
  
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === source) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    
    for (const edge of edges) {
      if (edge.source === current) queue.push(edge.target);
    }
  }
  
  return false;
}
```

---

## 9. System Layer 표현

### 9.1 INV 위반 경고 UI

| INV | 규칙 | UI 표현 |
|-----|------|---------|
| INV-1 | DAG 순환 금지 | 연결 시도 시 빨간 점선 + 토스트 "순환 연결 불가" |
| INV-2 | 자기 참조 금지 | 핸들 hover 시 금지 커서 |
| INV-3 | 중복 연결 금지 | 연결 시도 시 토스트 "이미 연결됨" |
| INV-4 | 필수 필드 검증 | 저장 시 빨간 테두리 + 필드 하이라이트 |
| INV-5 | Core 프리셋 수정 차단 | readonly 노드 (회색 잠금 아이콘), 드래그/삭제 불가 |
| INV-6~10 | 기타 불변 규칙 | 배너 경고: "⚠ INV-{N} 위반: {설명}" |

### 9.2 Core 프리셋 보호

```typescript
// Core 프리셋 블록은 수정 불가
const isReadonly = (node: Node) => node.data?.isCore === true;

// ReactFlow 이벤트에서 필터링
const onNodesDelete = useCallback((deleted: Node[]) => {
  const coreBlocks = deleted.filter(isReadonly);
  if (coreBlocks.length > 0) {
    toast.error('Core 프리셋 블록은 삭제할 수 없습니다');
    return; // 삭제 차단
  }
  // 나머지 삭제 진행
}, []);
```

---

## 10. 파일 구조

```
dashboard/
├── src/
│   ├── pages/
│   │   ├── brick/
│   │   │   ├── BrickOverviewPage.tsx    — 워크플로우 목록
│   │   │   ├── BrickCanvasPage.tsx      — React Flow 캔버스
│   │   │   ├── BlockCatalogPage.tsx     — 블록 타입 카탈로그
│   │   │   ├── TeamManagePage.tsx       — 팀 목록
│   │   │   ├── TeamDetailPage.tsx       — 팀 상세
│   │   │   ├── PresetListPage.tsx       — 프리셋 목록
│   │   │   ├── PresetEditorPage.tsx     — 프리셋 YAML 편집
│   │   │   ├── RunHistoryPage.tsx       — 실행 이력
│   │   │   ├── RunDetailPage.tsx        — 실행 상세
│   │   │   └── LearningHarnessPage.tsx  — 학습 하네스
│   │   └── ... (기존 페이지)
│   ├── components/
│   │   ├── brick/
│   │   │   ├── nodes/
│   │   │   │   ├── BlockNode.tsx        — 블록 노드 컴포넌트
│   │   │   │   ├── ReviewNode.tsx       — 리뷰 노드 컴포넌트
│   │   │   │   ├── StartNode.tsx        — 시작 노드
│   │   │   │   ├── EndNode.tsx          — 종료 노드
│   │   │   │   ├── types.ts            — 노드 타입 정의
│   │   │   │   └── index.ts            — nodeTypes 등록
│   │   │   ├── edges/
│   │   │   │   ├── LinkEdge.tsx         — 링크 엣지 컴포넌트
│   │   │   │   ├── types.ts            — 엣지 타입 정의
│   │   │   │   └── index.ts            — edgeTypes 등록
│   │   │   ├── sidebar/
│   │   │   │   └── BlockSidebar.tsx     — 블록 드래그 팔레트
│   │   │   ├── panels/
│   │   │   │   ├── DetailPanel.tsx      — 상세 패널 라우터
│   │   │   │   ├── BlockDetailPanel.tsx — 블록 상세 편집
│   │   │   │   ├── LinkDetailPanel.tsx  — 링크 조건 편집
│   │   │   │   ├── GateConfigPanel.tsx  — Gate 5종 설정
│   │   │   │   ├── TeamAssignPanel.tsx  — 팀 배정
│   │   │   │   └── ReviewDetailPanel.tsx — 리뷰 상세
│   │   │   ├── toolbar/
│   │   │   │   └── CanvasToolbar.tsx    — 상단 도구 모음
│   │   │   ├── timeline/
│   │   │   │   └── ExecutionTimeline.tsx — 실행 타임라인
│   │   │   ├── team/
│   │   │   │   ├── TeamMemberList.tsx   — 팀원 목록
│   │   │   │   ├── SkillEditor.tsx      — SKILL.md 편집
│   │   │   │   ├── McpServerList.tsx    — MCP 서버 토글
│   │   │   │   ├── ModelSelector.tsx    — 모델 선택
│   │   │   │   └── AdapterSelector.tsx  — 어댑터 교체
│   │   │   └── learning/
│   │   │       ├── ProposalList.tsx     — 제안 목록
│   │   │       ├── ProposalDetail.tsx   — 제안 상세 + diff
│   │   │       └── ApproveRejectForm.tsx — 승인/거부
│   │   └── ... (기존 컴포넌트)
│   ├── hooks/
│   │   ├── brick/
│   │   │   ├── useBlockTypes.ts        — BlockType CRUD hooks
│   │   │   ├── useTeams.ts             — Team CRUD hooks
│   │   │   ├── usePresets.ts           — Preset CRUD hooks
│   │   │   ├── useExecutions.ts        — Execution hooks
│   │   │   ├── useGates.ts             — Gate hooks
│   │   │   └── useLearning.ts          — Learning hooks
│   │   └── ... (기존 hooks)
│   └── lib/
│       └── brick/
│           ├── canvas-store.ts          — zustand 캔버스 상태
│           ├── serializer.ts            — YAML ↔ React Flow 변환
│           ├── layout.ts                — dagre 자동 레이아웃
│           ├── connection-validator.ts   — 연결 유효성 검증
│           └── ws-throttle.ts           — WebSocket 스로틀
└── __tests__/
    └── brick/
        ├── canvas-store.test.ts
        ├── serializer.test.ts
        ├── layout.test.ts
        ├── connection-validator.test.ts
        ├── nodes/BlockNode.test.tsx
        ├── nodes/ReviewNode.test.tsx
        ├── edges/LinkEdge.test.tsx
        ├── panels/GateConfigPanel.test.tsx
        ├── panels/BlockDetailPanel.test.tsx
        ├── hooks/useBlockTypes.test.ts
        ├── hooks/useTeams.test.ts
        ├── hooks/useExecutions.test.ts
        ├── pages/BrickCanvasPage.test.tsx
        ├── pages/TeamDetailPage.test.tsx
        └── pages/LearningHarnessPage.test.tsx
```

---

## 11. TDD 매핑 테이블

### Phase 1: 기반 구축 (BF-001 ~ BF-025)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-001 | §2.1 | BlockNode 렌더링 — 9종 블록 타입별 아이콘+이름 표시 | BlockNode.tsx |
| BF-002 | §2.3 | BlockNode 상태별 테두리 색상 변경 (7가지 상태) | BlockNode.tsx |
| BF-003 | §2.3 | BlockNode running 상태 시 회전 아이콘 애니메이션 | BlockNode.tsx |
| BF-004 | §2.4 | ReviewNode 보라색 테두리 #8B5CF6 렌더링 | ReviewNode.tsx |
| BF-005 | §2.4 | ReviewNode 체크리스트 진행률 바 표시 | ReviewNode.tsx |
| BF-006 | §2.4 | ReviewNode 리뷰어 아바타 표시 | ReviewNode.tsx |
| BF-007 | §2.4 | ReviewNode 승인/변경요청/거부 버튼 렌더링 | ReviewNode.tsx |
| BF-008 | §2.5 | LinkEdge 6종 타입별 스타일 (실선/점선/색상) | LinkEdge.tsx |
| BF-009 | §2.5 | LinkEdge 라벨 표시 (sequential=없음, parallel=∥, compete=⚔) | LinkEdge.tsx |
| BF-010 | §2.5 | LinkEdge isActive=true 시 애니메이션 | LinkEdge.tsx |
| BF-011 | §2.6 | autoLayout TB 방향 노드 배치 | layout.ts |
| BF-012 | §2.6 | autoLayout LR 방향 노드 배치 | layout.ts |
| BF-013 | §2.6 | autoLayout ReviewNode 높이 차이 반영 (160px vs 100px) | layout.ts |
| BF-014 | §7.1 | BrickCanvasPage 4영역 레이아웃 (toolbar/sidebar/canvas/timeline) | BrickCanvasPage.tsx |
| BF-015 | §7.2 | BlockSidebar 9종 블록 타입 드래그 가능 | BlockSidebar.tsx |
| BF-016 | §7.2 | 캔버스에 드롭 시 새 노드 생성 | BrickCanvasPage.tsx |
| BF-017 | §7.2 | 드롭 위치 → screenToFlowPosition 변환 | BrickCanvasPage.tsx |
| BF-018 | §2.2 | brickNodeTypes 4종 등록 (block/review/start/end) | nodes/index.ts |
| BF-019 | §2.5 | brickEdgeTypes 1종 등록 (link) | edges/index.ts |
| BF-020 | §7.1 | MiniMap 렌더링 | BrickCanvasPage.tsx |
| BF-021 | §7.1 | Controls (줌인/줌아웃) 렌더링 | BrickCanvasPage.tsx |
| BF-022 | §7.1 | Background (도트 그리드) 렌더링 | BrickCanvasPage.tsx |
| BF-023 | §10 | 라우트 /brick/canvas/:id 접근 가능 | App.tsx |
| BF-024 | §10 | 라우트 /brick 접근 가능 | App.tsx |
| BF-025 | §3.1 | 사이드바에 Brick 섹션 메뉴 표시 | Layout.tsx |

### Phase 2: 리소스 CRUD (BF-026 ~ BF-055)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-026 | §4.1 | useBlockTypes — GET /api/brick/block-types 호출 | useBlockTypes.ts |
| BF-027 | §4.1 | useCreateBlockType — POST /api/brick/block-types 호출 | useBlockTypes.ts |
| BF-028 | §4.1 | useUpdateBlockType — PUT 호출 후 queryKey 무효화 | useBlockTypes.ts |
| BF-029 | §4.1 | useDeleteBlockType — DELETE 호출 후 queryKey 무효화 | useBlockTypes.ts |
| BF-030 | §7 | BlockCatalogPage 블록 타입 그리드 렌더링 | BlockCatalogPage.tsx |
| BF-031 | §7 | BlockCatalogPage 생성 모달 열기/닫기 | BlockCatalogPage.tsx |
| BF-032 | §4.1 | useTeams — GET /api/brick/teams 호출 | useTeams.ts |
| BF-033 | §4.1 | useCreateTeam — POST /api/brick/teams 호출 | useTeams.ts |
| BF-034 | §4.1 | useDeleteTeam — DELETE 후 무효화 | useTeams.ts |
| BF-035 | §7.5 | TeamManagePage 팀 목록 카드 렌더링 | TeamManagePage.tsx |
| BF-036 | §7.5 | TeamDetailPage 4탭 렌더링 (팀원/스킬/MCP/모델) | TeamDetailPage.tsx |
| BF-037 | §7.5 | TeamMemberList 팀원 추가/제거 | TeamMemberList.tsx |
| BF-038 | §7.5 | SkillEditor Monaco 에디터 렌더링 + 저장 | SkillEditor.tsx |
| BF-039 | §7.5 | McpServerList 토글 ON/OFF | McpServerList.tsx |
| BF-040 | §7.5 | ModelSelector 라디오 버튼 선택 | ModelSelector.tsx |
| BF-041 | §7.5 | AdapterSelector 드롭다운 선택 | AdapterSelector.tsx |
| BF-042 | §4.1 | useTeamMembers — GET /api/brick/teams/:id/members 호출 | useTeams.ts |
| BF-043 | §4.1 | useAddMember — POST 호출 | useTeams.ts |
| BF-044 | §4.1 | useRemoveMember — DELETE 호출 | useTeams.ts |
| BF-045 | §4.1 | useUpdateSkill — PUT /api/brick/teams/:id/skills 호출 | useTeams.ts |
| BF-046 | §4.1 | useConfigureMcp — PUT /api/brick/teams/:id/mcp 호출 | useTeams.ts |
| BF-047 | §4.1 | useSetModel — PUT /api/brick/teams/:id/model 호출 | useTeams.ts |
| BF-048 | §4.1 | usePresets — GET /api/brick/presets 호출 | usePresets.ts |
| BF-049 | §4.1 | useCreatePreset — POST 호출 | usePresets.ts |
| BF-050 | §7 | PresetListPage 프리셋 카드 그리드 렌더링 | PresetListPage.tsx |
| BF-051 | §7 | PresetEditorPage Monaco YAML 에디터 렌더링 | PresetEditorPage.tsx |
| BF-052 | §4.1 | useExportPreset — GET /api/brick/presets/:id/export 호출 | usePresets.ts |
| BF-053 | §4.1 | useImportPreset — POST /api/brick/presets/import 호출 | usePresets.ts |
| BF-054 | §4.1 | useApplyPreset — POST 호출 후 캔버스 갱신 | usePresets.ts |
| BF-055 | §7.5 | useTeamStatus — 실시간 상태 배지 (idle/running/stuck/dead) | useTeams.ts |

### Phase 3: 캔버스 인터랙션 (BF-056 ~ BF-080)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-056 | §7.3 | DetailPanel 노드 선택 시 BlockDetailPanel 표시 | DetailPanel.tsx |
| BF-057 | §7.3 | DetailPanel 엣지 선택 시 LinkDetailPanel 표시 | DetailPanel.tsx |
| BF-058 | §7.3 | DetailPanel 리뷰 노드 선택 시 ReviewDetailPanel 표시 | DetailPanel.tsx |
| BF-059 | §7.3 | DetailPanel 선택 해제 시 EmptyDetailPanel 표시 | DetailPanel.tsx |
| BF-060 | §7.4 | GateConfigPanel Gate 추가 버튼 | GateConfigPanel.tsx |
| BF-061 | §7.4 | GateConfigPanel command Gate 설정 (명령어/타임아웃/실패시) | GateConfigPanel.tsx |
| BF-062 | §7.4 | GateConfigPanel http Gate 설정 (URL/메서드/상태코드) | GateConfigPanel.tsx |
| BF-063 | §7.4 | GateConfigPanel prompt Gate 설정 (프롬프트/모델/신뢰도/투표) | GateConfigPanel.tsx |
| BF-064 | §7.4 | GateConfigPanel agent Gate 설정 (프롬프트/도구/최대턴) | GateConfigPanel.tsx |
| BF-065 | §7.4 | GateConfigPanel review Gate 설정 (리뷰어/전략/타임아웃) | GateConfigPanel.tsx |
| BF-066 | §7.4 | GateConfigPanel Gate 삭제 | GateConfigPanel.tsx |
| BF-067 | §7.4 | GateConfigPanel auto 실행 방식 선택 (sequential/parallel/voting) | GateConfigPanel.tsx |
| BF-068 | §8 | 연결 시 Link 타입 선택 다이얼로그 | BrickCanvasPage.tsx |
| BF-069 | §8 | validateConnection DAG 순환 방지 (INV-1) | connection-validator.ts |
| BF-070 | §8 | validateConnection 자기 참조 방지 (INV-2) | connection-validator.ts |
| BF-071 | §8 | validateConnection 중복 연결 방지 (INV-3) | connection-validator.ts |
| BF-072 | §6 | yamlToFlow — YAML → Node/Edge 변환 | serializer.ts |
| BF-073 | §6 | flowToYaml — Node/Edge → YAML 변환 | serializer.ts |
| BF-074 | §6 | yamlToFlow + flowToYaml 왕복 일관성 | serializer.ts |
| BF-075 | §3 | useCanvasStore undo — 노드 추가 후 undo 시 복원 | canvas-store.ts |
| BF-076 | §3 | useCanvasStore redo — undo 후 redo 시 재적용 | canvas-store.ts |
| BF-077 | §3 | useCanvasStore isDirty — 변경 시 true, 저장 후 false | canvas-store.ts |
| BF-078 | §7.1 | 캔버스 저장 버튼 클릭 → flowToYaml → PUT API | BrickCanvasPage.tsx |
| BF-079 | §7.1 | 캔버스 로드 → GET API → yamlToFlow → 노드/엣지 세팅 | BrickCanvasPage.tsx |
| BF-080 | §9.2 | Core 프리셋 블록 삭제 시도 → 차단 + 토스트 | BrickCanvasPage.tsx |

### Phase 4: 실시간 모니터링 (BF-081 ~ BF-100)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-081 | §5.1 | WebSocket block 메시지 → updateBlockStatus 호출 | useLiveUpdates.ts |
| BF-082 | §5.1 | WebSocket gate 메시지 → Gate 토스트 표시 | useLiveUpdates.ts |
| BF-083 | §5.1 | WebSocket team 메시지 → teams 쿼리 무효화 | useLiveUpdates.ts |
| BF-084 | §5.1 | WebSocket review_requested → 리뷰 알림 팝업 | useLiveUpdates.ts |
| BF-085 | §5.1 | WebSocket learning_proposal → 학습 토스트 | useLiveUpdates.ts |
| BF-086 | §5.1 | WebSocket execution completed → isExecuting false | useLiveUpdates.ts |
| BF-087 | §5.2 | throttledBlockUpdate — 16ms 내 배치 처리 | ws-throttle.ts |
| BF-088 | §7.1 | CanvasToolbar 실행 버튼 → useStartExecution 호출 | CanvasToolbar.tsx |
| BF-089 | §7.1 | CanvasToolbar 일시정지 버튼 → usePauseExecution 호출 | CanvasToolbar.tsx |
| BF-090 | §7.1 | CanvasToolbar 재개 버튼 → useResumeExecution 호출 | CanvasToolbar.tsx |
| BF-091 | §7.1 | CanvasToolbar 중지 버튼 → useCancelExecution 호출 | CanvasToolbar.tsx |
| BF-092 | §7.1 | 실행 중 블록 상태 변경 시 노드 색상 실시간 변경 | BrickCanvasPage.tsx |
| BF-093 | §7.1 | 실행 중 활성 링크 isActive=true → 애니메이션 | BrickCanvasPage.tsx |
| BF-094 | §7.1 | ExecutionTimeline 블록 완료 이벤트 표시 | ExecutionTimeline.tsx |
| BF-095 | §7.1 | ExecutionTimeline 에러 이벤트 빨간 표시 | ExecutionTimeline.tsx |
| BF-096 | §9.1 | INV 위반 시 빨간 테두리 + 경고 배너 | BrickCanvasPage.tsx |
| BF-097 | §4.1 | useExecutionStatus — GET /api/brick/executions/:id 호출 | useExecutions.ts |
| BF-098 | §4.1 | useExecutionLogs — GET /api/brick/executions/:id/logs 호출 | useExecutions.ts |
| BF-099 | §7 | RunHistoryPage 실행 이력 목록 렌더링 | RunHistoryPage.tsx |
| BF-100 | §7 | RunDetailPage 실행 상세 + 로그 표시 | RunDetailPage.tsx |

### Phase 5: Review + Learning + 마무리 (BF-101 ~ BF-120)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-101 | §7.4 | ReviewDetailPanel 체크리스트 항목 체크/언체크 | ReviewDetailPanel.tsx |
| BF-102 | §7.4 | ReviewDetailPanel 산출물 diff 뷰 | ReviewDetailPanel.tsx |
| BF-103 | §7.4 | ReviewDetailPanel 인라인 코멘트 작성 | ReviewDetailPanel.tsx |
| BF-104 | §7.4 | ReviewDetailPanel 승인 → API 호출 + 상태 변경 | ReviewDetailPanel.tsx |
| BF-105 | §7.4 | ReviewDetailPanel 거부 → 사유 입력 + 팀 컨텍스트 주입 | ReviewDetailPanel.tsx |
| BF-106 | §7.4 | ReviewDetailPanel 변경요청 → 코멘트 목록 | ReviewDetailPanel.tsx |
| BF-107 | §2.4 | ReviewNode 승인 시 초록 테두리 전환 | ReviewNode.tsx |
| BF-108 | §2.4 | ReviewNode 거부 시 빨간 테두리 전환 | ReviewNode.tsx |
| BF-109 | §7.6 | LearningHarnessPage 제안 목록 렌더링 | LearningHarnessPage.tsx |
| BF-110 | §7.6 | ProposalDetail 변경 전/후 diff 표시 | ProposalDetail.tsx |
| BF-111 | §7.6 | ProposalDetail 근거 텍스트 표시 | ProposalDetail.tsx |
| BF-112 | §7.6 | ApproveRejectForm 승인 + 코멘트 → API 호출 | ApproveRejectForm.tsx |
| BF-113 | §7.6 | ApproveRejectForm 거부 + 사유 → API 호출 | ApproveRejectForm.tsx |
| BF-114 | §4.1 | useLearningProposals — GET /api/brick/learning/proposals | useLearning.ts |
| BF-115 | §4.1 | useApproveProposal — POST /api/brick/learning/:id/approve | useLearning.ts |
| BF-116 | §4.1 | useRejectProposal — POST /api/brick/learning/:id/reject | useLearning.ts |
| BF-117 | §4.1 | useGateResult — GET /api/brick/gates/:id/result | useGates.ts |
| BF-118 | §4.1 | useOverrideGate — POST /api/brick/gates/:id/override | useGates.ts |
| BF-119 | §4.1 | useInvariants — GET /api/brick/system/invariants | hooks |
| BF-120 | §7 | BrickOverviewPage 워크플로우 목록 + 상태 배지 | BrickOverviewPage.tsx |

---

## 12. Gap 검증 체크리스트

| 섹션 | 내용 | TDD 커버 | 상태 |
|------|------|----------|------|
| §1 아키텍처 | zustand/React Query/WebSocket 분리 | BF-075~077, 081~087 | ✅ |
| §2 커스텀 노드 | BlockNode 9종 + ReviewNode + 엣지 6종 | BF-001~010 | ✅ |
| §3 zustand 스토어 | undo/redo, isDirty, 상태 관리 | BF-075~077 | ✅ |
| §4 API hooks | 37개 엔드포인트 연동 | BF-026~055, 097~098, 114~119 | ✅ |
| §5 WebSocket | 6종 이벤트 처리 + 스로틀 | BF-081~087 | ✅ |
| §6 직렬화 | YAML↔Flow 양방향 + 왕복 | BF-072~074 | ✅ |
| §7 화면 설계 | 10개 페이지 + 패널 | BF-014~025, 030~031, 035~041, 050~051, 056~068, 094~095, 099~100, 109~113, 120 | ✅ |
| §8 연결 검증 | INV-1~3 + 순환/자기참조/중복 | BF-069~071 | ✅ |
| §9 System Layer | INV 경고 + Core readonly | BF-080, 096 | ✅ |
| §10 파일 구조 | 디렉토리 + 파일 목록 | 구조적 — 구현 시 확인 | ✅ |
| 자동 레이아웃 | dagre TB/LR + ReviewNode 높이 | BF-011~013 | ✅ |
| 실행 제어 | 실행/일시정지/재개/중지 | BF-088~093 | ✅ |
| Review 블록 | 체크리스트/diff/코멘트/승인/거부 | BF-101~108 | ✅ |
| Learning Harness | 제안/상세/승인/거부 | BF-109~116 | ✅ |

**전체 TDD: 120건, 섹션 커버: 14/14 = Gap 0%**

---

## 관련 문서
- Plan: `docs/01-plan/features/brick-dashboard-frontend.plan.md`
- Dashboard API Design: `docs/02-design/features/brick-dashboard.design.md`
- Engine Design V2: `docs/02-design/features/brick-architecture.design.md`
- React Flow: https://reactflow.dev
