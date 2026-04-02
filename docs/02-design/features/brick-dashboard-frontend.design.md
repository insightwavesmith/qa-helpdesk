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
| TDD 케이스 | BF-001 ~ BF-145 + BF-055a~f (151건) |

| 관점 | 내용 |
|------|------|
| **문제** | Brick 워크플로우를 CLI로만 관리 가능 — 시각적 편집/모니터링 불가 |
| **해결** | React Flow 캔버스 에디터 + 3축 CRUD UI + 실시간 모니터링 |
| **기능/UX** | 블록 드래그&드롭, 링크 연결, Gate 설정, Review 승인, 실행 제어 |
| **핵심 가치** | "Scratch처럼 쉽고, n8n처럼 강력하게" — 비개발자 5분 첫 워크플로우 |

---

## 1. UX 철학: "Scratch처럼 쉽고, n8n처럼 강력하게"

> **Smith님 지시 (필수)**: MIT Scratch 3대 원칙 + Papert 프레임워크 전체 적용.

### 1.1 Scratch 3대 원칙

| 원칙 | 의미 | Brick 적용 |
|------|------|-----------|
| **Tinkerable** | 드래그하면 바로 실행. 설명서 불필요 | 블록 팔레트 → 드래그&드롭 → 선 연결 → 끝. YAML 직접 작성 절대 불필요 |
| **Meaningful** | 만든 게 바로 눈에 보임 | 실행 중 블록 하이라이트 + 실시간 프리뷰 + 즉시 피드백 |
| **Social** | 남이 만든 거 복사해서 커스텀 | 프리셋 Remix — 공유 프리셋 복제 → 내 것으로 수정 |

### 1.2 Papert 프레임워크

| 차원 | 의미 | Brick 보장 |
|------|------|-----------|
| **Low Floor** | 비개발자도 5분 안에 첫 워크플로우 생성 | 블록 3개 드래그 + 선 2개 연결 = 워크플로우 완성 |
| **High Ceiling** | 복잡한 조합 가능 | PDCA + Gate 5종 + 병렬/경쟁/분기 + Learning Harness |
| **Wide Walls** | 다양한 방식으로 같은 목표 달성 | 프리셋 기반 / 빈 캔버스 / YAML 임포트 모두 지원 |

### 1.3 구체 적용 규칙 (구현 시 강제)

1. **YAML 직접 작성 절대 불필요** — 모든 설정은 GUI에서 완결. Monaco 편집은 고급 사용자 옵션일 뿐
2. **블록 팔레트 → 드래그&드롭 → 선 연결 → 끝** — 3단계로 워크플로우 완성
3. **팀 배정**: 블록 우클릭 → 드롭다운 선택 (DetailPanel 열 필요 없이 즉시 가능)
4. **Gate 설정**: 체크박스 + 슬라이더 (threshold) — 코드/JSON 입력 없음
5. **맞는 것만 연결됨** — 유효하지 않은 Link는 스냅 안 됨 (isValidConnection 강제)
6. **실행 중 블록 하이라이트** — running 블록 즉시 시각 피드백
7. **프리셋 Remix** — "이 프리셋 복제" 버튼 → 내 프리셋으로 즉시 복사 → 수정

### 1.4 블록 카테고리 색상 체계

| 카테고리 | 블록 타입 | 팔레트 배경색 | 노드 기본 배경 |
|---------|----------|-------------|--------------|
| **Plan** (계획) | plan, design | #DBEAFE (파랑) | #EFF6FF |
| **Do** (실행) | implement, deploy | #DCFCE7 (초록) | #F0FDF4 |
| **Check** (검증) | test, review, monitor | #FEF9C3 (노랑) | #FEFCE8 |
| **Act** (조치) | rollback, custom | #F3E8FF (보라) | #FAF5FF |
| **Notify** (알림) | notify | #E0F2FE (남색) | #F0F9FF |

> 블록 테두리 색은 **상태(§2.3)**가 우선. 카테고리 색은 **배경**에만 적용.

---

## 2. 아키텍처 개요

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

### 2.1 상태 관리 분리

| 상태 유형 | 저장소 | 예시 |
|----------|--------|------|
| 캔버스 로컬 | zustand | 노드 위치, 선택, 줌, 팬, undo 스택 |
| 서버 데이터 | React Query | BlockType 목록, Team 목록, 실행 이력 |
| 실시간 이벤트 | WebSocket → React Query invalidation | 블록 상태, Gate 결과, 실행 진행 |
| 파일 원본 | Express → 파일 시스템 (YAML/JSON/MD) | Preset, SKILL.md, 블록 정의 |

---

## 3. 캔버스 설계

### 3.1 커스텀 노드 타입

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
  | 'notify' | 'custom';

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

/** Notify 블록 전용 데이터 */
interface NotifyNodeData extends BlockNodeData {
  blockType: 'notify';
  channel: NotifyChannel;
  target: string;           // 채널ID, chatID, webhook URL
  events: NotifyEvent[];    // 트리거 이벤트 목록
  payloadTemplate?: string; // 커스텀 페이로드 (Handlebars 템플릿)
  lastSentAt?: string;      // 마지막 발송 시각
  lastResult?: 'success' | 'failed';
}

type NotifyChannel = 'slack' | 'telegram' | 'discord' | 'webhook';
type NotifyEvent = 'start' | 'complete' | 'fail';
```

### 3.2 노드 타입별 등록

```typescript
// dashboard/src/components/brick/nodes/index.ts

import { BlockNode } from './BlockNode';
import { ReviewNode } from './ReviewNode';
import { NotifyNode } from './NotifyNode';
import { StartNode } from './StartNode';
import { EndNode } from './EndNode';

export const brickNodeTypes = {
  block: BlockNode,
  review: ReviewNode,
  notify: NotifyNode,
  start: StartNode,
  end: EndNode,
} as const;
```

### 3.3 BlockNode 렌더링 사양

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

### 3.4 ReviewNode 렌더링 사양

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

### 3.5 NotifyNode 렌더링 사양

```
┌─────────────────────────────────┐
│ ▼ (입력 핸들)                    │
├──── 남색 테두리 #0EA5E9 ────────┤
│ [🔔] 알림: {이름}          [상태]│
│ 채널: [Slack 아이콘] #channel    │
│ 이벤트: ✓시작 ✓완료 ✗실패       │
│ 최근: ✓ 10:30 발송 성공          │
├─────────────────────────────────┤
│ ▼ (출력 핸들)                    │
└─────────────────────────────────┘
```

| 상태 | 노드 테두리 | 배경 |
|------|-----------|------|
| idle | #0EA5E9 (남색) | 흰색 |
| running | #0EA5E9 + pulse 애니메이션 | #F0F9FF |
| done (발송 성공) | #10B981 (초록) | #ECFDF5 |
| failed (발송 실패) | #EF4444 (빨강) | #FEF2F2 |

**채널 아이콘**: Slack=#4A154B, Telegram=#0088CC, Discord=#5865F2, Webhook=#6B7280

> 알림 = 블록. 체인에 끼워넣어 이전 블록 완료 → Notify 실행 → 다음 블록 진행.
> 알림 블록이 실행됐으면 = 이전 블록 완료 확인. 알림 안 왔으면 = 체인 끊김.

### 3.6 커스텀 엣지 타입

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

### 3.7 자동 레이아웃 (dagre)

```typescript
// dashboard/src/lib/brick/layout.ts

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

const NODE_WIDTH = 240;
const NODE_HEIGHT = 100;
const REVIEW_NODE_HEIGHT = 160;
const NOTIFY_NODE_HEIGHT = 130;

export function autoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: 'TB' | 'LR' = 'TB'
): Node[] {
  const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: direction, nodesep: 60, ranksep: 80 });

  nodes.forEach((node) => {
    const height = node.type === 'review' ? REVIEW_NODE_HEIGHT
                 : node.type === 'notify' ? NOTIFY_NODE_HEIGHT
                 : NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  });

  edges.forEach((edge) => {
    g.setEdge(edge.source, edge.target);
  });

  dagre.layout(g);

  return nodes.map((node) => {
    const pos = g.node(node.id);
    const height = node.type === 'review' ? REVIEW_NODE_HEIGHT
                 : node.type === 'notify' ? NOTIFY_NODE_HEIGHT
                 : NODE_HEIGHT;
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

## 4. zustand 캔버스 스토어

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

## 5. API hooks 설계

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

### 5.2 useLinks.ts — Link 독립 CRUD hooks

> **Smith님 결정 (2026-04-03)**: Link도 Block/Team과 동등한 독립 CRUD. 기존 useLinkTypes(카탈로그)에 인스턴스 CRUD 추가.

```typescript
// dashboard/src/hooks/brick/useLinks.ts

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useApi } from '../useApi';

/** Link 타입 카탈로그 (6종 — 읽기전용) */
export function useLinkTypes() {
  const api = useApi();
  return useQuery({
    queryKey: ['brick', 'linkTypes'],
    queryFn: () => api.get('/api/brick/link-types'),
    staleTime: Infinity, // 6종 고정값, 리페치 불필요
  });
}

/** 워크플로우의 Link 인스턴스 목록 */
export function useLinks(workflowId: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: ['brick', 'links', workflowId],
    queryFn: () => api.get(`/api/brick/links?workflowId=${workflowId}`),
    enabled: workflowId !== null,
  });
}

/** Link 생성 */
export function useCreateLink() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      workflowId: number;
      fromBlock: string;
      toBlock: string;
      linkType?: string;
      condition?: string;
      judge?: string;
      cron?: string;
    }) => api.post('/api/brick/links', data),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['brick', 'links', variables.workflowId] }),
  });
}

/** Link 수정 (타입 변경, 조건 변경) */
export function useUpdateLink() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: {
      id: number;
      workflowId: number;
      linkType?: string;
      condition?: string;
      judge?: string;
      cron?: string;
    }) => api.put(`/api/brick/links/${id}`, data),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['brick', 'links', variables.workflowId] }),
  });
}

/** Link 삭제 */
export function useDeleteLink() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId }: { id: number; workflowId: number }) =>
      api.delete(`/api/brick/links/${id}`),
    onSuccess: (_data, variables) =>
      qc.invalidateQueries({ queryKey: ['brick', 'links', variables.workflowId] }),
  });
}
```

### 5.1 API 연동 매핑 테이블

| 그룹 | Hook | API | Method |
|------|------|-----|--------|
| BlockType | useBlockTypes | /api/v1/block-types | GET |
| BlockType | useBlockType(name) | /api/v1/block-types/:name | GET |
| BlockType | useCreateBlockType | /api/v1/block-types | POST |
| BlockType | useUpdateBlockType | /api/v1/block-types/:name | PUT |
| BlockType | useDeleteBlockType | /api/v1/block-types/:name | DELETE |
| Team | useTeams | /api/v1/teams | GET |
| Team | useTeam(name) | /api/v1/teams/:name | GET |
| Team | useCreateTeam | /api/v1/teams | POST |
| Team | useUpdateTeam | /api/v1/teams/:name | PUT |
| Team | useDeleteTeam | /api/v1/teams/:name | DELETE |
| Team | useTeamMembers(name) | /api/v1/teams/:name/members | GET |
| Team | useAddMember | /api/v1/teams/:name/members | POST |
| Team | useUpdateMemberRole | /api/v1/teams/:name/members/:mid | PUT |
| Team | useRemoveMember | /api/v1/teams/:name/members/:mid | DELETE |
| Team | useTeamSkills(name) | /api/v1/teams/:name/skills | GET |
| Team | useSkillContent(name, sid) | /api/v1/teams/:name/skills/:sid | GET |
| Team | useUpdateSkill | /api/v1/teams/:name/skills/:sid | PUT |
| Team | useTeamMcpServers(name) | /api/v1/teams/:name/mcp | GET |
| Team | useConfigureMcp | /api/v1/teams/:name/mcp/:sid | PUT |
| Team | useTeamModel(name) | /api/v1/teams/:name/model | GET |
| Team | useSetModel | /api/v1/teams/:name/model | PUT |
| Team | useTeamStatus(name) | /api/v1/teams/:name/status | GET |
| Link | useLinkTypes | /api/brick/link-types | GET |
| Link | useLinks(workflowId) | /api/brick/links?workflowId=:id | GET |
| Link | useCreateLink | /api/brick/links | POST |
| Link | useUpdateLink | /api/brick/links/:id | PUT |
| Link | useDeleteLink | /api/brick/links/:id | DELETE |
| Catalog | useGateTypes | /api/v1/gate-types | GET |
| Catalog | useAdapterTypes | /api/v1/adapter-types | GET |
| Preset | usePresets | /api/v1/presets | GET |
| Preset | usePreset(name) | /api/v1/presets/:name | GET |
| Preset | useCreatePreset | /api/v1/presets | POST |
| Preset | useUpdatePreset | /api/v1/presets/:name | PUT |
| Preset | useDeletePreset | /api/v1/presets/:name | DELETE |
| Preset | useValidatePreset | /api/v1/presets/:name/validate | POST |
| Workflow | useWorkflows | /api/v1/workflows | GET |
| Workflow | useStartWorkflow | /api/v1/workflows | POST |
| Workflow | useWorkflowStatus | /api/v1/workflows/:id | GET |
| Workflow | useWorkflowEvents | /api/v1/workflows/:id/events | GET |
| Workflow | useBlockDetail | /api/v1/workflows/:id/blocks/:bid | GET |
| Workflow | useCompleteBlock | /api/v1/workflows/:id/blocks/:bid/complete | POST |
| Workflow | useApproveBlock | /api/v1/workflows/:id/blocks/:bid/approve | POST |
| Workflow | useRejectBlock | /api/v1/workflows/:id/blocks/:bid/reject | POST |
| Workflow | useCancelWorkflow | /api/v1/workflows/:id/cancel | POST |
| Workflow | useResumeWorkflow | /api/v1/workflows/:id/resume | POST |
| Learning | useLearningProposals | /api/v1/learning/proposals | GET |
| Learning | useProposalDetail | /api/v1/learning/proposals/:id | GET |
| Learning | useApproveProposal | /api/v1/learning/proposals/:id/approve | POST |
| Learning | useRejectProposal | /api/v1/learning/proposals/:id/reject | POST |
| Learning | useModifyProposal | /api/v1/learning/proposals/:id/modify | POST |
| Learning | useLearningHistory | /api/v1/learning/history | GET |
| Learning | useLearningStats | /api/v1/learning/stats | GET |
| Learning | useDetectPatterns | /api/v1/learning/detect | POST |
| Validate | useValidatePresetYaml | /api/v1/validate/preset | POST |
| Validate | useValidateBlockType | /api/v1/validate/block-type | POST |
| Validate | useValidateGraph | /api/v1/validate/workflow-graph | POST |
| System | useInvariants | /api/v1/invariants | GET |
| Resource | useResources | /api/v1/resources | GET |

---

## 6. WebSocket 이벤트 처리

### 6.1 useLiveUpdates 확장

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

case 'notify':
  queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
  // Notify 블록 발송 결과 → 노드 상태 업데이트
  if (msg.data?.blockId && msg.data?.result) {
    useCanvasStore.getState().updateBlockStatus(
      msg.data.blockId,
      msg.data.result === 'success' ? 'done' : 'failed'
    );
    showNotifyToast(msg.data);
  }
  break;

case 'execution':
  queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
  if (msg.data?.status === 'completed' || msg.data?.status === 'failed') {
    useCanvasStore.getState().setExecution(null, false);
  }
  break;
```

### 6.2 WebSocket 메시지 스로틀

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

## 7. YAML ↔ React Flow 직렬화

### 7.1 YAML → React Flow 변환

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
    type: block.type === 'review' ? 'review'
        : block.type === 'notify' ? 'notify'
        : 'block',
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

## 8. 화면별 상세 설계

### 8.1 BrickCanvasPage 레이아웃

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

### 8.2 BlockSidebar 드래그&드롭

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
  { type: 'notify',    icon: '🔔', label: '알림' },
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

### 8.3 DetailPanel 구조

```typescript
// 선택된 노드/엣지에 따라 다른 패널 렌더링
function DetailPanel() {
  const { selectedNodeId, selectedEdgeId } = useCanvasStore();

  if (selectedNodeId) {
    const node = useCanvasStore.getState().nodes.find(n => n.id === selectedNodeId);
    if (node?.type === 'review') return <ReviewDetailPanel nodeId={selectedNodeId} />;
    if (node?.type === 'notify') return <NotifyConfigPanel nodeId={selectedNodeId} />;
    return <BlockDetailPanel nodeId={selectedNodeId} />;
  }
  
  if (selectedEdgeId) return <LinkDetailPanel edgeId={selectedEdgeId} />;
  
  return <EmptyDetailPanel />;
}
```

### 8.4 GateConfigPanel — Gate 5종 설정 UI

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

### 8.5 TeamDetailPage 레이아웃

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

### 8.6 LearningHarnessPage

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

## 9. 연결 유효성 검증

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

## 10. System Layer 표현

### 10.1 INV 위반 경고 UI

| INV | 규칙 | UI 표현 |
|-----|------|---------|
| INV-1 | DAG 순환 금지 | 연결 시도 시 빨간 점선 + 토스트 "순환 연결 불가" |
| INV-2 | 자기 참조 금지 | 핸들 hover 시 금지 커서 |
| INV-3 | 중복 연결 금지 | 연결 시도 시 토스트 "이미 연결됨" |
| INV-4 | 필수 필드 검증 | 저장 시 빨간 테두리 + 필드 하이라이트 |
| INV-5 | Core 프리셋 수정 차단 | readonly 노드 (회색 잠금 아이콘), 드래그/삭제 불가 |
| INV-6~10 | 기타 불변 규칙 | 배너 경고: "⚠ INV-{N} 위반: {설명}" |

### 10.2 Core 프리셋 보호

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

## 11. Notify 블록 + Channel Adapter

> **핵심 원칙**: 알림 = 블록. 체인의 시작/완료/실패 이벤트를 외부로 전달하는 것도 블록으로 표현한다.

### 11.1 Channel Adapter 타입 정의

```typescript
// dashboard/src/lib/brick/channel-adapter.ts

/** Channel Adapter 공통 인터페이스 */
interface ChannelAdapterConfig {
  type: NotifyChannel;
  name: string;         // 어댑터 표시명
  icon: string;         // 채널 아이콘
  color: string;        // 채널 브랜드 색상
}

/** Slack Adapter */
interface SlackAdapterConfig extends ChannelAdapterConfig {
  type: 'slack';
  webhookUrl?: string;        // Incoming Webhook URL
  botToken?: string;          // Bot API Token (대안)
  defaultChannel?: string;    // 기본 채널 (#general)
}

/** Telegram Adapter */
interface TelegramAdapterConfig extends ChannelAdapterConfig {
  type: 'telegram';
  botToken: string;           // Bot API Token
  chatId: string;             // Chat ID (그룹/개인)
}

/** Discord Adapter */
interface DiscordAdapterConfig extends ChannelAdapterConfig {
  type: 'discord';
  webhookUrl: string;         // Discord Webhook URL
}

/** Generic Webhook Adapter */
interface WebhookAdapterConfig extends ChannelAdapterConfig {
  type: 'webhook';
  url: string;                // POST 대상 URL
  headers?: Record<string, string>; // 커스텀 헤더
  payloadTemplate?: string;   // Handlebars 템플릿
}

type AnyAdapterConfig =
  | SlackAdapterConfig
  | TelegramAdapterConfig
  | DiscordAdapterConfig
  | WebhookAdapterConfig;

/** Channel Adapter 레지스트리 */
const CHANNEL_ADAPTERS: Record<NotifyChannel, ChannelAdapterConfig> = {
  slack:    { type: 'slack',    name: 'Slack',    icon: 'slack',    color: '#4A154B' },
  telegram: { type: 'telegram', name: 'Telegram', icon: 'send',     color: '#0088CC' },
  discord:  { type: 'discord',  name: 'Discord',  icon: 'message-circle', color: '#5865F2' },
  webhook:  { type: 'webhook',  name: 'Webhook',  icon: 'globe',    color: '#6B7280' },
};
```

### 11.2 Notify 블록 실행 흐름

```
이전 블록 완료
     │
     ▼
┌──────────┐
│ Notify   │  1. config에서 channel + target 읽기
│ 블록     │  2. Channel Adapter 인스턴스 생성
│          │  3. 페이로드 조립 (템플릿 + 컨텍스트)
│          │  4. adapter.send(target, payload)
│          │  5. 결과 기록 (lastSentAt, lastResult)
└──────┬───┘
       │
       ▼
  다음 블록 진행
```

**YAML 사용 예시**:
```yaml
blocks:
  - id: do
    type: implement
    team: cto-team
  - id: notify-done
    type: notify
    config:
      channel: slack
      target: C0AN7ATS4DD
      events: [complete, fail]
  - id: qa
    type: test
    team: qa-team

links:
  - { from: do, to: notify-done, type: sequential }
  - { from: notify-done, to: qa, type: sequential }
```

### 11.3 NotifyConfigPanel 와이어프레임

```
┌─────────────────────────────────┐
│ 알림 설정                        │
├─────────────────────────────────┤
│ 채널 선택:                       │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐   │
│ │Slack│ │Tele│ │Disc│ │Hook│   │
│ │ ●  │ │ ○  │ │ ○  │ │ ○  │   │
│ └────┘ └────┘ └────┘ └────┘   │
│                                 │
│ ┌─ Slack 설정 ───────────────┐  │
│ │ 대상: [C0AN7ATS4DD      ]  │  │
│ │ 방식: ◉ Webhook ○ Bot API  │  │
│ │ URL:  [https://hooks.sl...] │  │
│ └────────────────────────────┘  │
│                                 │
│ 트리거 이벤트:                    │
│ ☑ 시작 (이전 블록 시작 시)        │
│ ☑ 완료 (이전 블록 완료 시)        │
│ ☑ 실패 (이전 블록 실패 시)        │
│                                 │
│ 페이로드 템플릿: (선택)           │
│ ┌─ 편집기 ───────────────────┐  │
│ │ {{blockName}} {{status}}   │  │
│ │ 실행: {{executionId}}       │  │
│ └────────────────────────────┘  │
│                                 │
│ [테스트 발송]        [적용]      │
└─────────────────────────────────┘
```

### 11.4 체인 모니터링 관점

| 상황 | 의미 | UI 표현 |
|------|------|---------|
| Notify 블록 done | 이전 블록 완료 확인 + 알림 발송 성공 | 초록 테두리 + ✓ |
| Notify 블록 failed | 알림 발송 실패 (채널 오류) | 빨간 테두리 + 재시도 버튼 |
| Notify 블록 idle | 아직 도달하지 않음 = 이전 블록 미완료 | 남색 테두리 |
| 알림 안 옴 | 체인 끊김 (이전 블록에서 멈춤) | 타임라인에 ⚠ 경고 |

---

## 12. 파일 구조

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
│   │   │   │   ├── NotifyNode.tsx       — 알림 노드 컴포넌트
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
│   │   │   │   ├── NotifyConfigPanel.tsx — 알림 채널 설정
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
│   │   │   ├── useLinks.ts             — Link CRUD hooks (§5.2)
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
│           ├── channel-adapter.ts       — Channel Adapter 타입 + 레지스트리
│           └── ws-throttle.ts           — WebSocket 스로틀
└── __tests__/
    └── brick/
        ├── canvas-store.test.ts
        ├── serializer.test.ts
        ├── layout.test.ts
        ├── connection-validator.test.ts
        ├── nodes/BlockNode.test.tsx
        ├── nodes/ReviewNode.test.tsx
        ├── nodes/NotifyNode.test.tsx
        ├── edges/LinkEdge.test.tsx
        ├── panels/GateConfigPanel.test.tsx
        ├── panels/NotifyConfigPanel.test.tsx
        ├── panels/BlockDetailPanel.test.tsx
        ├── hooks/useBlockTypes.test.ts
        ├── hooks/useTeams.test.ts
        ├── hooks/useLinks.test.ts
        ├── hooks/useExecutions.test.ts
        ├── pages/BrickCanvasPage.test.tsx
        ├── pages/TeamDetailPage.test.tsx
        └── pages/LearningHarnessPage.test.tsx
```

---

## 13. TDD 매핑 테이블

### Phase 1: 기반 구축 (BF-001 ~ BF-025)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-001 | §3.1 | BlockNode 렌더링 — 10종 블록 타입별 아이콘+이름 표시 (notify 포함) | BlockNode.tsx |
| BF-002 | §3.3 | BlockNode 상태별 테두리 색상 변경 (7가지 상태) | BlockNode.tsx |
| BF-003 | §3.3 | BlockNode running 상태 시 회전 아이콘 애니메이션 | BlockNode.tsx |
| BF-004 | §3.4 | ReviewNode 보라색 테두리 #8B5CF6 렌더링 | ReviewNode.tsx |
| BF-005 | §3.4 | ReviewNode 체크리스트 진행률 바 표시 | ReviewNode.tsx |
| BF-006 | §3.4 | ReviewNode 리뷰어 아바타 표시 | ReviewNode.tsx |
| BF-007 | §3.4 | ReviewNode 승인/변경요청/거부 버튼 렌더링 | ReviewNode.tsx |
| BF-008 | §3.5 | LinkEdge 6종 타입별 스타일 (실선/점선/색상) | LinkEdge.tsx |
| BF-009 | §3.5 | LinkEdge 라벨 표시 (sequential=없음, parallel=∥, compete=⚔) | LinkEdge.tsx |
| BF-010 | §3.5 | LinkEdge isActive=true 시 애니메이션 | LinkEdge.tsx |
| BF-011 | §3.7 | autoLayout TB 방향 노드 배치 | layout.ts |
| BF-012 | §3.7 | autoLayout LR 방향 노드 배치 | layout.ts |
| BF-013 | §3.7 | autoLayout ReviewNode 높이 차이 반영 (160px vs 100px) | layout.ts |
| BF-014 | §8.1 | BrickCanvasPage 4영역 레이아웃 (toolbar/sidebar/canvas/timeline) | BrickCanvasPage.tsx |
| BF-015 | §8.2 | BlockSidebar 10종 블록 타입 드래그 가능 (notify 포함) | BlockSidebar.tsx |
| BF-016 | §8.2 | 캔버스에 드롭 시 새 노드 생성 | BrickCanvasPage.tsx |
| BF-017 | §8.2 | 드롭 위치 → screenToFlowPosition 변환 | BrickCanvasPage.tsx |
| BF-018 | §3.2 | brickNodeTypes 5종 등록 (block/review/notify/start/end) | nodes/index.ts |
| BF-019 | §3.5 | brickEdgeTypes 1종 등록 (link) | edges/index.ts |
| BF-020 | §8.1 | MiniMap 렌더링 | BrickCanvasPage.tsx |
| BF-021 | §8.1 | Controls (줌인/줌아웃) 렌더링 | BrickCanvasPage.tsx |
| BF-022 | §8.1 | Background (도트 그리드) 렌더링 | BrickCanvasPage.tsx |
| BF-023 | §10 | 라우트 /brick/canvas/:id 접근 가능 | App.tsx |
| BF-024 | §10 | 라우트 /brick 접근 가능 | App.tsx |
| BF-025 | §3.1 | 사이드바에 Brick 섹션 메뉴 표시 | Layout.tsx |

### Phase 2: 리소스 CRUD (BF-026 ~ BF-055)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-026 | §6.1 | useBlockTypes — GET /api/brick/block-types 호출 | useBlockTypes.ts |
| BF-027 | §6.1 | useCreateBlockType — POST /api/brick/block-types 호출 | useBlockTypes.ts |
| BF-028 | §6.1 | useUpdateBlockType — PUT 호출 후 queryKey 무효화 | useBlockTypes.ts |
| BF-029 | §6.1 | useDeleteBlockType — DELETE 호출 후 queryKey 무효화 | useBlockTypes.ts |
| BF-030 | §9 | BlockCatalogPage 블록 타입 그리드 렌더링 | BlockCatalogPage.tsx |
| BF-031 | §9 | BlockCatalogPage 생성 모달 열기/닫기 | BlockCatalogPage.tsx |
| BF-032 | §6.1 | useTeams — GET /api/brick/teams 호출 | useTeams.ts |
| BF-033 | §6.1 | useCreateTeam — POST /api/brick/teams 호출 | useTeams.ts |
| BF-034 | §6.1 | useDeleteTeam — DELETE 후 무효화 | useTeams.ts |
| BF-035 | §8.5 | TeamManagePage 팀 목록 카드 렌더링 | TeamManagePage.tsx |
| BF-036 | §8.5 | TeamDetailPage 4탭 렌더링 (팀원/스킬/MCP/모델) | TeamDetailPage.tsx |
| BF-037 | §8.5 | TeamMemberList 팀원 추가/제거 | TeamMemberList.tsx |
| BF-038 | §8.5 | SkillEditor Monaco 에디터 렌더링 + 저장 | SkillEditor.tsx |
| BF-039 | §8.5 | McpServerList 토글 ON/OFF | McpServerList.tsx |
| BF-040 | §8.5 | ModelSelector 라디오 버튼 선택 | ModelSelector.tsx |
| BF-041 | §8.5 | AdapterSelector 드롭다운 선택 | AdapterSelector.tsx |
| BF-042 | §6.1 | useTeamMembers — GET /api/brick/teams/:id/members 호출 | useTeams.ts |
| BF-043 | §6.1 | useAddMember — POST 호출 | useTeams.ts |
| BF-044 | §6.1 | useRemoveMember — DELETE 호출 | useTeams.ts |
| BF-045 | §6.1 | useUpdateSkill — PUT /api/brick/teams/:id/skills 호출 | useTeams.ts |
| BF-046 | §6.1 | useConfigureMcp — PUT /api/brick/teams/:id/mcp 호출 | useTeams.ts |
| BF-047 | §6.1 | useSetModel — PUT /api/brick/teams/:id/model 호출 | useTeams.ts |
| BF-048 | §6.1 | usePresets — GET /api/brick/presets 호출 | usePresets.ts |
| BF-049 | §6.1 | useCreatePreset — POST 호출 | usePresets.ts |
| BF-050 | §9 | PresetListPage 프리셋 카드 그리드 렌더링 | PresetListPage.tsx |
| BF-051 | §9 | PresetEditorPage Monaco YAML 에디터 렌더링 | PresetEditorPage.tsx |
| BF-052 | §6.1 | useExportPreset — GET /api/brick/presets/:id/export 호출 | usePresets.ts |
| BF-053 | §6.1 | useImportPreset — POST /api/brick/presets/import 호출 | usePresets.ts |
| BF-054 | §6.1 | useApplyPreset — POST 호출 후 캔버스 갱신 | usePresets.ts |
| BF-055 | §8.5 | useTeamStatus — 실시간 상태 배지 (idle/running/stuck/dead) | useTeams.ts |
| BF-055a | §5.2 | useLinkTypes — GET /api/brick/link-types → 6종 카탈로그 반환 | useLinks.ts |
| BF-055b | §5.2 | useLinks(workflowId) — GET /api/brick/links?workflowId=1 → 해당 워크플로우 Link 목록 | useLinks.ts |
| BF-055c | §5.2 | useLinks(null) — enabled=false로 쿼리 스킵 | useLinks.ts |
| BF-055d | §5.2 | useCreateLink — POST /api/brick/links → 201 + queryKey 무효화 | useLinks.ts |
| BF-055e | §5.2 | useUpdateLink — PUT /api/brick/links/:id → 200 + queryKey 무효화 | useLinks.ts |
| BF-055f | §5.2 | useDeleteLink — DELETE /api/brick/links/:id → 204 + queryKey 무효화 | useLinks.ts |

### Phase 3: 캔버스 인터랙션 (BF-056 ~ BF-080)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-056 | §8.3 | DetailPanel 노드 선택 시 BlockDetailPanel 표시 | DetailPanel.tsx |
| BF-057 | §8.3 | DetailPanel 엣지 선택 시 LinkDetailPanel 표시 | DetailPanel.tsx |
| BF-058 | §8.3 | DetailPanel 리뷰 노드 선택 시 ReviewDetailPanel 표시 | DetailPanel.tsx |
| BF-059 | §8.3 | DetailPanel 선택 해제 시 EmptyDetailPanel 표시 | DetailPanel.tsx |
| BF-060 | §8.4 | GateConfigPanel Gate 추가 버튼 | GateConfigPanel.tsx |
| BF-061 | §8.4 | GateConfigPanel command Gate 설정 (명령어/타임아웃/실패시) | GateConfigPanel.tsx |
| BF-062 | §8.4 | GateConfigPanel http Gate 설정 (URL/메서드/상태코드) | GateConfigPanel.tsx |
| BF-063 | §8.4 | GateConfigPanel prompt Gate 설정 (프롬프트/모델/신뢰도/투표) | GateConfigPanel.tsx |
| BF-064 | §8.4 | GateConfigPanel agent Gate 설정 (프롬프트/도구/최대턴) | GateConfigPanel.tsx |
| BF-065 | §8.4 | GateConfigPanel review Gate 설정 (리뷰어/전략/타임아웃) | GateConfigPanel.tsx |
| BF-066 | §8.4 | GateConfigPanel Gate 삭제 | GateConfigPanel.tsx |
| BF-067 | §8.4 | GateConfigPanel auto 실행 방식 선택 (sequential/parallel/voting) | GateConfigPanel.tsx |
| BF-068 | §9 | 연결 시 Link 타입 선택 다이얼로그 | BrickCanvasPage.tsx |
| BF-069 | §9 | validateConnection DAG 순환 방지 (INV-1) | connection-validator.ts |
| BF-070 | §9 | validateConnection 자기 참조 방지 (INV-2) | connection-validator.ts |
| BF-071 | §9 | validateConnection 중복 연결 방지 (INV-3) | connection-validator.ts |
| BF-072 | §9 | yamlToFlow — YAML → Node/Edge 변환 | serializer.ts |
| BF-073 | §9 | flowToYaml — Node/Edge → YAML 변환 | serializer.ts |
| BF-074 | §9 | yamlToFlow + flowToYaml 왕복 일관성 | serializer.ts |
| BF-075 | §4 | useCanvasStore undo — 노드 추가 후 undo 시 복원 | canvas-store.ts |
| BF-076 | §4 | useCanvasStore redo — undo 후 redo 시 재적용 | canvas-store.ts |
| BF-077 | §4 | useCanvasStore isDirty — 변경 시 true, 저장 후 false | canvas-store.ts |
| BF-078 | §8.1 | 캔버스 저장 버튼 클릭 → flowToYaml → PUT API | BrickCanvasPage.tsx |
| BF-079 | §8.1 | 캔버스 로드 → GET API → yamlToFlow → 노드/엣지 세팅 | BrickCanvasPage.tsx |
| BF-080 | §10.2 | Core 프리셋 블록 삭제 시도 → 차단 + 토스트 | BrickCanvasPage.tsx |

### Phase 4: 실시간 모니터링 (BF-081 ~ BF-100)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-081 | §6.1 | WebSocket block 메시지 → updateBlockStatus 호출 | useLiveUpdates.ts |
| BF-082 | §6.1 | WebSocket gate 메시지 → Gate 토스트 표시 | useLiveUpdates.ts |
| BF-083 | §6.1 | WebSocket team 메시지 → teams 쿼리 무효화 | useLiveUpdates.ts |
| BF-084 | §6.1 | WebSocket review_requested → 리뷰 알림 팝업 | useLiveUpdates.ts |
| BF-085 | §6.1 | WebSocket learning_proposal → 학습 토스트 | useLiveUpdates.ts |
| BF-086 | §6.1 | WebSocket execution completed → isExecuting false | useLiveUpdates.ts |
| BF-087 | §6.2 | throttledBlockUpdate — 16ms 내 배치 처리 | ws-throttle.ts |
| BF-088 | §8.1 | CanvasToolbar 실행 버튼 → useStartExecution 호출 | CanvasToolbar.tsx |
| BF-089 | §8.1 | CanvasToolbar 일시정지 버튼 → usePauseExecution 호출 | CanvasToolbar.tsx |
| BF-090 | §8.1 | CanvasToolbar 재개 버튼 → useResumeExecution 호출 | CanvasToolbar.tsx |
| BF-091 | §8.1 | CanvasToolbar 중지 버튼 → useCancelExecution 호출 | CanvasToolbar.tsx |
| BF-092 | §8.1 | 실행 중 블록 상태 변경 시 노드 색상 실시간 변경 | BrickCanvasPage.tsx |
| BF-093 | §8.1 | 실행 중 활성 링크 isActive=true → 애니메이션 | BrickCanvasPage.tsx |
| BF-094 | §8.1 | ExecutionTimeline 블록 완료 이벤트 표시 | ExecutionTimeline.tsx |
| BF-095 | §8.1 | ExecutionTimeline 에러 이벤트 빨간 표시 | ExecutionTimeline.tsx |
| BF-096 | §11.1 | INV 위반 시 빨간 테두리 + 경고 배너 | BrickCanvasPage.tsx |
| BF-097 | §6.1 | useExecutionStatus — GET /api/brick/executions/:id 호출 | useExecutions.ts |
| BF-098 | §6.1 | useExecutionLogs — GET /api/brick/executions/:id/logs 호출 | useExecutions.ts |
| BF-099 | §9 | RunHistoryPage 실행 이력 목록 렌더링 | RunHistoryPage.tsx |
| BF-100 | §9 | RunDetailPage 실행 상세 + 로그 표시 | RunDetailPage.tsx |

### Phase 5: Review + Learning + 마무리 (BF-101 ~ BF-120)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-101 | §8.4 | ReviewDetailPanel 체크리스트 항목 체크/언체크 | ReviewDetailPanel.tsx |
| BF-102 | §8.4 | ReviewDetailPanel 산출물 diff 뷰 | ReviewDetailPanel.tsx |
| BF-103 | §8.4 | ReviewDetailPanel 인라인 코멘트 작성 | ReviewDetailPanel.tsx |
| BF-104 | §8.4 | ReviewDetailPanel 승인 → API 호출 + 상태 변경 | ReviewDetailPanel.tsx |
| BF-105 | §8.4 | ReviewDetailPanel 거부 → 사유 입력 + 팀 컨텍스트 주입 | ReviewDetailPanel.tsx |
| BF-106 | §8.4 | ReviewDetailPanel 변경요청 → 코멘트 목록 | ReviewDetailPanel.tsx |
| BF-107 | §3.4 | ReviewNode 승인 시 초록 테두리 전환 | ReviewNode.tsx |
| BF-108 | §3.4 | ReviewNode 거부 시 빨간 테두리 전환 | ReviewNode.tsx |
| BF-109 | §8.6 | LearningHarnessPage 제안 목록 렌더링 | LearningHarnessPage.tsx |
| BF-110 | §8.6 | ProposalDetail 변경 전/후 diff 표시 | ProposalDetail.tsx |
| BF-111 | §8.6 | ProposalDetail 근거 텍스트 표시 | ProposalDetail.tsx |
| BF-112 | §8.6 | ApproveRejectForm 승인 + 코멘트 → API 호출 | ApproveRejectForm.tsx |
| BF-113 | §8.6 | ApproveRejectForm 거부 + 사유 → API 호출 | ApproveRejectForm.tsx |
| BF-114 | §6.1 | useLearningProposals — GET /api/brick/learning/proposals | useLearning.ts |
| BF-115 | §6.1 | useApproveProposal — POST /api/brick/learning/:id/approve | useLearning.ts |
| BF-116 | §6.1 | useRejectProposal — POST /api/brick/learning/:id/reject | useLearning.ts |
| BF-117 | §6.1 | useGateResult — GET /api/brick/gates/:id/result | useGates.ts |
| BF-118 | §6.1 | useOverrideGate — POST /api/brick/gates/:id/override | useGates.ts |
| BF-119 | §6.1 | useInvariants — GET /api/brick/system/invariants | hooks |
| BF-120 | §9 | BrickOverviewPage 워크플로우 목록 + 상태 배지 | BrickOverviewPage.tsx |

### Phase 6: Notify 블록 + Channel Adapter (BF-121 ~ BF-135)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-121 | §3.5 | NotifyNode 남색 테두리 #0EA5E9 렌더링 | NotifyNode.tsx |
| BF-122 | §3.5 | NotifyNode 채널 아이콘 표시 (Slack/Telegram/Discord/Webhook) | NotifyNode.tsx |
| BF-123 | §3.5 | NotifyNode 이벤트 체크마크 표시 (시작/완료/실패) | NotifyNode.tsx |
| BF-124 | §3.5 | NotifyNode 발송 성공 시 초록 테두리 전환 | NotifyNode.tsx |
| BF-125 | §3.5 | NotifyNode 발송 실패 시 빨간 테두리 + 재시도 버튼 | NotifyNode.tsx |
| BF-126 | §3.5 | NotifyNode running 상태 시 pulse 애니메이션 | NotifyNode.tsx |
| BF-127 | §11.1 | CHANNEL_ADAPTERS 4종 레지스트리 (slack/telegram/discord/webhook) | channel-adapter.ts |
| BF-128 | §11.3 | NotifyConfigPanel 채널 선택 라디오 4종 | NotifyConfigPanel.tsx |
| BF-129 | §11.3 | NotifyConfigPanel Slack 설정 — 대상 + Webhook/Bot 방식 | NotifyConfigPanel.tsx |
| BF-130 | §11.3 | NotifyConfigPanel Telegram 설정 — Bot Token + Chat ID | NotifyConfigPanel.tsx |
| BF-131 | §11.3 | NotifyConfigPanel Discord 설정 — Webhook URL | NotifyConfigPanel.tsx |
| BF-132 | §11.3 | NotifyConfigPanel Webhook 설정 — URL + 헤더 + 페이로드 템플릿 | NotifyConfigPanel.tsx |
| BF-133 | §11.3 | NotifyConfigPanel 이벤트 체크박스 (시작/완료/실패) | NotifyConfigPanel.tsx |
| BF-134 | §11.3 | NotifyConfigPanel 테스트 발송 버튼 → API 호출 | NotifyConfigPanel.tsx |
| BF-135 | §3.7 | autoLayout NotifyNode 높이 130px 반영 | layout.ts |

### Phase 7: Scratch UX 원칙 (BF-136 ~ BF-145)

| ID | 섹션 | 테스트 케이스 | 검증 대상 |
|----|------|-------------|----------|
| BF-136 | §1.3 | 블록 우클릭 → 팀 배정 드롭다운 즉시 표시 | BlockNode.tsx |
| BF-137 | §1.3 | 유효하지 않은 연결 시 스냅 안 됨 (isValidConnection 반환 false) | BrickCanvasPage.tsx |
| BF-138 | §1.4 | Plan 카테고리 블록 (plan/design) 배경색 #DBEAFE | BlockNode.tsx |
| BF-139 | §1.4 | Do 카테고리 블록 (implement/deploy) 배경색 #DCFCE7 | BlockNode.tsx |
| BF-140 | §1.4 | Check 카테고리 블록 (test/review/monitor) 배경색 #FEF9C3 | BlockNode.tsx |
| BF-141 | §1.4 | Act 카테고리 블록 (rollback/custom) 배경색 #F3E8FF | BlockNode.tsx |
| BF-142 | §1.4 | Notify 카테고리 블록 배경색 #E0F2FE | NotifyNode.tsx |
| BF-143 | §1.3 | 프리셋 Remix — "복제" 버튼 → 새 프리셋으로 복사 | PresetListPage.tsx |
| BF-144 | §1.3 | Gate threshold 슬라이더 UI (코드 입력 없음) | GateConfigPanel.tsx |
| BF-145 | §1.2 | 빈 캔버스 시작 시 온보딩 가이드 표시 (Low Floor) | BrickCanvasPage.tsx |

---

## 14. Gap 검증 체크리스트

| 섹션 | 내용 | TDD 커버 | 상태 |
|------|------|----------|------|
| §1 UX 철학 | Scratch 3원칙 + Papert + 카테고리 색상 | 설계 원칙 — 구현 시 적용 | ✅ |
| §2 아키텍처 | zustand/React Query/WebSocket 분리 | BF-075~077, 081~087 | ✅ |
| §3 커스텀 노드 | BlockNode 10종 + ReviewNode + NotifyNode + 엣지 6종 | BF-001~010, 121~126 | ✅ |
| §4 zustand 스토어 | undo/redo, isDirty, 상태 관리 | BF-075~077 | ✅ |
| §5 API hooks | 53개 엔드포인트 연동 | BF-026~055, 097~098, 114~119 | ✅ |
| §6 WebSocket | 6종 이벤트 처리 + 스로틀 | BF-081~087 | ✅ |
| §7 직렬화 | YAML↔Flow 양방향 + 왕복 | BF-072~074 | ✅ |
| §8 화면 설계 | 10개 페이지 + 패널 | BF-014~025, 030~031, 035~041, 050~051, 056~068, 094~095, 099~100, 109~113, 120 | ✅ |
| §9 연결 검증 | INV-1~3 + 순환/자기참조/중복 | BF-069~071 | ✅ |
| §10 System Layer | INV 경고 + Core readonly | BF-080, 096 | ✅ |
| §11 Notify+Adapter | NotifyNode + Channel 4종 + 체인 모니터링 | BF-121~135 | ✅ |
| §12 파일 구조 | 디렉토리 + 파일 목록 | 구조적 — 구현 시 확인 | ✅ |
| 자동 레이아웃 | dagre TB/LR + ReviewNode/NotifyNode 높이 | BF-011~013, 135 | ✅ |
| 실행 제어 | 실행/일시정지/재개/중지 | BF-088~093 | ✅ |
| Review 블록 | 체크리스트/diff/코멘트/승인/거부 | BF-101~108 | ✅ |
| Learning Harness | 제안/상세/승인/거부 | BF-109~116 | ✅ |
| Scratch UX | 카테고리 색상/우클릭 팀배정/Remix/온보딩 | BF-136~145 | ✅ |

**전체 TDD: 145건, 섹션 커버: 17/17 = Gap 0%**

---

## 관련 문서
- Plan: `docs/01-plan/features/brick-dashboard-frontend.plan.md`
- Dashboard API Design: `docs/02-design/features/brick-dashboard.design.md`
- Engine Design V2: `docs/02-design/features/brick-architecture.design.md`
- React Flow: https://reactflow.dev
