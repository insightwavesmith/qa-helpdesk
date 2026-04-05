# Design: Brick Dashboard UX 개선 — 스크래치 + 3축 직관화

> 작성일: 2026-04-05
> 작성자: PM
> 레벨: L2-기능
> Plan: docs/01-plan/features/brick-dashboard-ux-improve.plan.md
> TASK: docs/tasks/TASK-brick-dashboard-ux-improve.md
> 선행: brick-dashboard-frontend.design.md (초기 구현)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 기능 | 브릭 대시보드 UX 6건 개선 |
| 핵심 | "스크래치처럼 쉽게 3축 조합" — YAML 작성 0줄 |
| 범위 | 기존 코드 연결 + 신규 컴포넌트 추가 (6 Phase) |
| 기술 | 기존 스택 100% 활용 (React Flow, zustand, dagre, TanStack Query, WebSocket) |
| TDD | BD-001 ~ BD-062 (62건) |

---

## 기존 설계 참조 및 정합성

| 문서 | 관계 | 충돌 |
|------|------|------|
| brick-dashboard.design.md | API 백엔드 설계 — 본 문서는 프론트 UX 개선 | 없음 |
| brick-dashboard-frontend.design.md | 초기 프론트 구현 — 본 문서는 그 위에 UX 개선 적용 | 없음 |
| brick-dashboard-frontend.plan.md | 초기 프론트 Plan — 본 문서의 Plan은 UX 개선 전용 | 없음 |
| brick-architecture.design.md | 엔진 아키텍처 — API 인터페이스 참조 | 없음 |
| brick-p0-agent-abstraction.design.md | 어댑터/Gate 모델 — Gate 타입 참조 | 없음 (P0 8종 Gate 정합) |
| brick-p1-operations.design.md | reject_reason/approval — UX-4 승인 UI에 반영 | 없음 |

방향 변경 사항: 해당 없음 — 모든 UX 개선은 기존 설계 위에 additive.

---

## 1. 아키텍처 변경 요약

### 1.1 변경하는 것

| 항목 | 현재 | 개선 |
|------|------|------|
| 캔버스 상태 관리 | 로컬 useState (BrickCanvasPage) | **Zustand canvas-store** (undo/redo 포함) |
| 실시간 업데이트 | 3s/5s 폴링 (TanStack refetchInterval) | **WebSocket** (useBrickLiveUpdates) |
| presetId | 하드코딩 `'default'` | **URL 파라미터** `/brick/canvas/:presetId` |
| 자동 레이아웃 | 함수만 존재 (layout.ts) | **CanvasToolbar 버튼 연결** |
| 승인/반려 | review 노드에만 | **approval Gate 전용 UI** |
| 3축 설정 | 기본 폼 (팀 select + GateConfig) | **통합 3축 패널** |

### 1.2 변경하지 않는 것

- React Flow 노드/엣지 타입 (block, review, notify, start, end, link)
- Express 서버 구조
- 직렬화 로직 (serializer.ts)
- 연결 검증 (connection-validator.ts)
- 색상/폰트/디자인 시스템

### 1.3 상태 관리 전환 다이어그램

```
현재:
  BrickCanvasPage
    ├── useNodesState (로컬)
    ├── useEdgesState (로컬)
    ├── useState(selectedNodeId)
    ├── useState(isExecuting, isPaused, executionId)
    └── useExecutionStatus (3s 폴링)

개선:
  BrickCanvasPage
    ├── useCanvasStore (Zustand — 노드/엣지/선택/dirty)
    │     └── temporal(50 step undo/redo)
    ├── useBrickLiveUpdates (WebSocket — 블록 상태 즉시 반영)
    ├── useExecutionControl (실행 상태 로컬)
    └── useProjectContext (프로젝트/프리셋 선택)
```

---

## 2. Phase별 상세 설계

---

### Phase 1: 프로젝트 선택 (UX-5)

#### 2.1.1 컴포넌트: ProjectSelector

```
파일: src/components/brick/ProjectSelector.tsx (신규)
```

```typescript
interface Project {
  id: string;
  name: string;
  description?: string;
  presetCount: number;
}

interface ProjectSelectorProps {
  projects: Project[];
  selectedProjectId: string | null;
  onSelect: (projectId: string) => void;
}
```

**UI**: 사이드바 상단 드롭다운. 선택 시 프리셋 목록 필터.

```
┌─────────────────────────────────┐
│ 📦 프로젝트 선택          ▼    │
│ ├── bscamp (5개 프리셋)        │
│ ├── brick-engine (3개 프리셋)  │
│ └── skyoffice (2개 프리셋)     │
└─────────────────────────────────┘
```

#### 2.1.2 훅: useProjects

```
파일: src/hooks/brick/useProjects.ts (신규)
```

```typescript
function useProjects(): UseQueryResult<Project[]>
// GET /api/brick/projects

function useProjectPresets(projectId: string | null): UseQueryResult<Preset[]>
// GET /api/brick/presets?project={projectId}
```

#### 2.1.3 라우팅 변경

```
현재: /brick/canvas → presetId = 'default'
개선: /brick/canvas/:presetId → URL에서 presetId 획득
```

**BrickCanvasPage 변경**:
```typescript
// 현재
const presetId = 'default';

// 개선
const { presetId } = useParams<{ presetId: string }>();
```

#### 2.1.4 서버 API

```
GET /api/brick/projects
→ brickProjects 테이블 조회 (기존 sync.ts가 project.yaml 읽어서 넣음)
→ Response: { data: Project[] }

GET /api/brick/presets?project={projectId}
→ 기존 usePresets에 project 필터 파라미터 추가
```

---

### Phase 2: 원클릭 실행 (UX-1)

#### 2.2.1 PresetListPage 개선

```
파일: src/pages/brick/PresetListPage.tsx (수정)
```

프리셋 카드에 실행 버튼 추가:

```
┌──────────────────────────┐
│ 📋 t-pdca-l2             │
│ 블록 6개 · 링크 5개       │
│                           │
│ [📝 편집]  [▶ 실행]      │
└──────────────────────────┘
```

**[▶ 실행]** 클릭 → ExecuteDialog(feature명 입력) → POST /api/brick/executions → `navigate(/brick/runs/${id})`

#### 2.2.2 실행 후 자동 이동

```typescript
// PresetListPage 또는 BrickCanvasPage에서
const startExecution = useStartExecution();

const handleExecute = async (presetId: string, feature: string) => {
  const result = await startExecution.mutateAsync({
    presetId,
    feature,
    task: `${feature} 워크플로우 실행`,
  });
  navigate(`/brick/runs/${result.id}`);
};
```

#### 2.2.3 RunDetailPage 개선

현재 RunDetailPage는 기본 구조만 있음. 개선:

```
┌───────────────────────────────────────────────────┐
│ ▶ brick-p1-ops (실행 중)           ⏸ 일시정지  ⏹ │
├───────────────────────────────────────────────────┤
│                                                    │
│  [Plan ✓] ──→ [Design ✓] ──→ [Do ◉] ──→ [QA ○]  │
│                                                    │
│  진행률: ████████░░░░░░░░ 50%                      │
│                                                    │
├───────────────────────────────────────────────────┤
│ 로그:                                              │
│ 11:23:05  Plan 블록 완료 (claude_local)            │
│ 11:23:08  Design 블록 시작 (claude_local)          │
│ 11:24:15  Design 블록 완료                         │
│ 11:24:17  Do 블록 시작 (claude_local)              │
└───────────────────────────────────────────────────┘
```

**신규 컴포넌트**:
```
파일: src/components/brick/RunProgressBar.tsx (신규)
```

```typescript
interface RunProgressBarProps {
  blocks: Array<{ id: string; status: BlockStatus; label: string }>;
}
```

수평 블록 체인 + 진행률 바. 상태별 색상은 기존 `STATUS_BORDER_COLORS` 재사용.

---

### Phase 3: 실시간 상태 (UX-3)

#### 2.3.1 BrickCanvasPage → Zustand + WebSocket 전환

**핵심 변경**: BrickCanvasPage의 로컬 state를 canvas-store로 전환하고, useBrickLiveUpdates를 연결.

```typescript
// 현재 (로컬 state)
const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

// 개선 (Zustand)
const { nodes, edges, onNodesChange, onEdgesChange, setNodes, setEdges } = useCanvasStore();
```

#### 2.3.2 WebSocket 연결

```typescript
// BrickCanvasPage 내부
useBrickLiveUpdates({
  onToast: (msg) => {
    // toast 알림 표시 (기존 UI에 맞게)
  },
});
```

**이미 구현된 플로우**:
1. WebSocket `block` 메시지 수신
2. `throttledBlockUpdate(blockId, status)` 호출 (ws-throttle.ts)
3. `useCanvasStore.getState().updateNodeData(blockId, { status })` 실행
4. React Flow 노드 리렌더 → 테두리 색상 반영

**제거 대상**:
```typescript
// 이것들 제거:
const { data: executionData } = useExecutionStatus(executionId);  // 3s 폴링
const { data: logs } = useExecutionLogs(executionId);              // 5s 폴링
```

#### 2.3.3 실행 로그 실시간 스트리밍

WebSocket에 로그 메시지 타입 추가 (useBrickLiveUpdates 확장):

```typescript
// BrickWsMessage type 확장
type: 'block' | 'gate' | 'team' | 'review_requested' | 'learning_proposal' | 'execution' | 'log';

// log 메시지 핸들러
case 'log': {
  const { blockId, message, level, timestamp } = msg.data;
  // RunDetailPage의 로그 영역에 append
  queryClient.setQueryData(['brick', 'execution-logs', executionId], (old) => [...old, msg.data]);
  break;
}
```

#### 2.3.4 실패 시 stderr 표시

BlockNode에 실패 시 에러 요약 표시:

```typescript
// BlockNode.tsx 수정
// status === 'failed' 일 때 에러 텍스트 표시
{status === 'failed' && data.error && (
  <div className="text-[10px] text-red-500 mt-1 truncate max-w-[200px]">
    {maskTokens(data.error)}  {/* 토큰 마스킹 */}
  </div>
)}
```

토큰 마스킹 유틸:
```
파일: src/lib/brick/mask-tokens.ts (신규)
```
```typescript
export function maskTokens(text: string): string {
  return text
    .replace(/xoxb-[a-zA-Z0-9-]+/g, 'xoxb-***')
    .replace(/sk-[a-zA-Z0-9]+/g, 'sk-***');
}
```

---

### Phase 4: 승인/반려 (UX-4)

#### 2.4.1 ApprovalPanel

```
파일: src/components/brick/panels/ApprovalPanel.tsx (신규)
```

```typescript
interface ApprovalPanelProps {
  workflowId: string;
  blockId: string;
  approver: string;
  artifacts: string[];
  onApprove: () => void;
  onReject: (reason: string) => void;
}
```

**UI**:
```
┌─────────────────────────────────┐
│ ⚖ 승인 대기                     │
│                                  │
│ 블록: review                     │
│ 승인자: smith@bscamp.kr          │
│ 산출물:                          │
│   ✓ plans/brick-p1.md            │
│   ✓ designs/brick-p1.md          │
│                                  │
│ [✓ 승인]                         │
│                                  │
│ 반려 사유: ________________       │
│ [✗ 반려]                         │
└─────────────────────────────────┘
```

#### 2.4.2 훅: useApproval

```
파일: src/hooks/brick/useApproval.ts (신규)
```

```typescript
function useApproval(workflowId: string, blockId: string) {
  const approve = useMutation({
    mutationFn: () => fetch(`/api/brick/workflows/${workflowId}/blocks/${blockId}/approve`, {
      method: 'POST',
    }),
  });

  const reject = useMutation({
    mutationFn: (reason: string) => fetch(`/api/brick/workflows/${workflowId}/blocks/${blockId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  });

  return { approve, reject };
}
```

#### 2.4.3 블록 노드에 승인 대기 표시

```typescript
// BlockNode.tsx 수정
// status === 'gate_checking' && data.gateType === 'approval' 일 때
{isApprovalWaiting && (
  <div className="absolute -top-2 -right-2 w-5 h-5 bg-amber-500 rounded-full
                  flex items-center justify-center text-white text-[10px] animate-pulse">
    !
  </div>
)}
```

#### 2.4.4 DetailPanel 라우팅 추가

```typescript
// DetailPanel.tsx 수정
// gate_checking + approval 상태 감지 시 ApprovalPanel 표시
if (nodeData.status === 'gate_checking' && nodeData.gateType === 'approval') {
  return <ApprovalPanel {...approvalProps} />;
}
```

#### 2.4.5 WebSocket 승인 알림

useBrickLiveUpdates의 기존 `gate` 메시지에서 approval_pending 감지:

```typescript
case 'gate': {
  const { gateType, status } = msg.data;
  if (gateType === 'approval' && status === 'waiting') {
    onToast?.({
      title: '승인 요청',
      description: `${msg.data.blockId} 블록이 승인을 대기 중입니다`,
      variant: 'warning',
    });
  }
  // ...
}
```

---

### Phase 5: 드래그 조합 개선 (UX-2)

#### 2.5.1 BlockSidebar 카테고리 그룹핑

```
파일: src/components/brick/BlockSidebar.tsx (수정)
```

PDCA 카테고리별 그룹핑 + 접기/펼치기:

```
┌───────────────────────┐
│ 🔍 검색...            │
├───────────────────────┤
│ ▼ Plan (계획)          │
│   📋 기획              │
│   🎨 설계              │
├───────────────────────┤
│ ▼ Do (실행)            │
│   ⚙️ 구현             │
│   🚀 배포              │
├───────────────────────┤
│ ▼ Check (검증)         │
│   🧪 테스트            │
│   👀 리뷰              │
│   📊 모니터링          │
├───────────────────────┤
│ ▼ Act (조치)           │
│   ↩️ 롤백             │
│   🔧 커스텀            │
├───────────────────────┤
│ 🔔 알림               │
└───────────────────────┘
```

```typescript
interface BlockSidebarProps {
  onDragStart?: (blockType: BlockType) => void;
  filter?: string;  // 신규: 검색 필터
}
```

기존 `BLOCK_CATEGORY_MAP`, `CATEGORY_BG_COLORS` 활용.

#### 2.5.2 자동 레이아웃 연결

```typescript
// BrickCanvasPage 수정 — CanvasToolbar에 콜백 전달
import { autoLayout } from '../../lib/brick/layout';

const handleAutoLayout = useCallback((direction: 'TB' | 'LR') => {
  const { nodes: currentNodes, edges: currentEdges } = useCanvasStore.getState();
  const layouted = autoLayout(currentNodes, currentEdges, direction);
  useCanvasStore.getState().setNodes(layouted);
}, []);

<CanvasToolbar
  onLayoutVertical={() => handleAutoLayout('TB')}
  onLayoutHorizontal={() => handleAutoLayout('LR')}
  onAutoLayout={() => handleAutoLayout('TB')}
  // ... 기존 props
/>
```

#### 2.5.3 링크 타입 선택 개선

현재 BrickCanvasPage에 인라인 다이얼로그가 있음. 개선: 연결 시 위치 기반 팝오버.

```
파일: src/components/brick/dialogs/LinkTypePopover.tsx (신규)
```

```typescript
interface LinkTypePopoverProps {
  position: { x: number; y: number };  // 캔버스 좌표
  onSelect: (linkType: LinkType) => void;
  onCancel: () => void;
}
```

연결 드래그 완료 시 마우스 위치에 팝오버 표시:
```
┌──────────────┐
│ 순차  병렬   │
│ 경쟁  반복   │
│ 크론  분기   │
└──────────────┘
```

---

### Phase 6: 3축 직관화 (UX-6)

#### 2.6.1 통합 3축 패널

```
파일: src/components/brick/panels/ThreeAxisPanel.tsx (신규)
```

블록 선택 시 우측 패널에 3축을 탭으로 분리:

```
┌─────────────────────────────────┐
│ [Block] [Team] [Gate]           │
├─────────────────────────────────┤
│ Block 탭:                        │
│   이름: ________________         │
│   뭘 할 건지: ________________   │
│   완료 조건:                     │
│     산출물: ________________     │
│                                  │
│ Team 탭:                         │
│   어댑터: [claude_local    ▼]    │
│   모델:   [claude-opus-4-6 ▼]   │
│   에이전트: [cto-lead      ▼]   │
│   스킬: [편집]                   │
│                                  │
│ Gate 탭:                         │
│   ☑ artifact  ☐ command          │
│   ☐ http      ☐ prompt           │
│   ☐ agent     ☐ review           │
│   ☑ approval  ☐ metric           │
│   재시도: [3]  실패 시: [retry ▼]│
└─────────────────────────────────┘
```

```typescript
interface ThreeAxisPanelProps {
  node: Node;
  onUpdateData: (nodeId: string, data: Record<string, unknown>) => void;
  teams: Array<{ id: string; name: string }>;
  adapters: string[];    // ['claude_local', 'claude_agent_teams', 'human', ...]
  models: string[];      // ['claude-opus-4-6', 'claude-sonnet-4-6', ...]
  agents: string[];      // ['cto-lead', 'pm-lead', ...]
}
```

#### 2.6.2 GateConfigPanel 간소화

현재 GateConfigPanel (318줄) — 5종 Gate만 지원. 개선:

1. **8종 Gate 전부 지원**: command, http, prompt, agent, review, metric, approval, artifact
2. **체크박스 토글**: 활성화할 Gate를 체크박스로 선택
3. **슬라이더**: threshold (metric), confidence (prompt), timeout (command/http)
4. **approval 전용 설정**: approver, channel, timeout, on_timeout

```typescript
// GateConfigPanel.tsx 수정
export type GateType = 'command' | 'http' | 'prompt' | 'agent' | 'review' | 'metric' | 'approval' | 'artifact';

const GATE_TYPE_LABELS: Record<GateType, string> = {
  command: '명령어',
  http: 'HTTP',
  prompt: '프롬프트',
  agent: '에이전트',
  review: '리뷰',
  metric: '수치',      // 신규
  approval: '승인',    // 신규
  artifact: '산출물',  // 신규
};
```

#### 2.6.3 LinkDetailPanel 개선

조건 빌더:

```
┌─────────────────────────────────┐
│ 링크 타입: [순차 ▼]             │
│                                  │
│ 조건 (loop/branch만):           │
│   대상: [match_rate ▼]          │
│   연산: [<  ▼]                  │
│   값:   [90]                    │
│                                  │
│ → match_rate < 90               │
└─────────────────────────────────┘
```

```
파일: src/components/brick/panels/ConditionBuilder.tsx (신규)
```

```typescript
interface ConditionBuilderProps {
  condition: string;
  onChange: (condition: string) => void;
  availableMetrics: string[];  // ['match_rate', 'coverage', 'score', ...]
}
```

---

## 3. 파일 변경 목록

### 3.1 신규 파일

| Phase | 파일 | 설명 |
|-------|------|------|
| P1 | `src/components/brick/ProjectSelector.tsx` | 프로젝트 드롭다운 |
| P1 | `src/hooks/brick/useProjects.ts` | 프로젝트 목록 훅 |
| P2 | `src/components/brick/RunProgressBar.tsx` | 실행 진행률 바 |
| P3 | `src/lib/brick/mask-tokens.ts` | 토큰 마스킹 유틸 |
| P4 | `src/components/brick/panels/ApprovalPanel.tsx` | 승인/반려 패널 |
| P4 | `src/hooks/brick/useApproval.ts` | 승인/반려 훅 |
| P5 | `src/components/brick/dialogs/LinkTypePopover.tsx` | 링크 타입 팝오버 |
| P6 | `src/components/brick/panels/ThreeAxisPanel.tsx` | 통합 3축 패널 |
| P6 | `src/components/brick/panels/ConditionBuilder.tsx` | 조건 빌더 |

### 3.2 수정 파일

| Phase | 파일 | 변경 내용 |
|-------|------|----------|
| P1 | `BrickCanvasPage.tsx` | presetId를 URL param으로 전환 |
| P1 | `PresetListPage.tsx` | 프로젝트 필터 추가 |
| P2 | `PresetListPage.tsx` | 프리셋 카드에 실행 버튼 |
| P2 | `RunDetailPage.tsx` | RunProgressBar 통합, 로그 개선 |
| P3 | `BrickCanvasPage.tsx` | Zustand store + WebSocket 전환 |
| P3 | `useBrickLiveUpdates.ts` | log 메시지 타입 추가 |
| P3 | `BlockNode.tsx` | 실패 시 에러 텍스트 표시 |
| P4 | `BlockNode.tsx` | 승인 대기 뱃지 표시 |
| P4 | `DetailPanel.tsx` | ApprovalPanel 라우팅 추가 |
| P5 | `BlockSidebar.tsx` | 카테고리 그룹핑 + 검색 |
| P5 | `BrickCanvasPage.tsx` | autoLayout 콜백 연결 |
| P6 | `GateConfigPanel.tsx` | 8종 Gate + 체크박스 UI |
| P6 | `DetailPanel.tsx` | ThreeAxisPanel 통합 |

---

## 4. API 인터페이스

### 4.1 신규 엔드포인트

| Method | Path | 용도 | Phase |
|--------|------|------|-------|
| GET | `/api/brick/projects` | 프로젝트 목록 | P1 |
| POST | `/api/brick/workflows/:wfId/blocks/:blockId/approve` | 승인 | P4 |
| POST | `/api/brick/workflows/:wfId/blocks/:blockId/reject` | 반려 (body: {reason}) | P4 |

### 4.2 수정 엔드포인트

| Method | Path | 변경 | Phase |
|--------|------|------|-------|
| GET | `/api/brick/presets` | `?project=` 필터 추가 | P1 |

### 4.3 WebSocket 메시지 확장

| type | data | 설명 | Phase |
|------|------|------|-------|
| `log` | `{ blockId, message, level, timestamp }` | 실행 로그 스트림 | P3 |
| `gate` (기존) | `{ gateType: 'approval', status: 'waiting' }` | 승인 대기 알림 | P4 |

---

## 5. E2E 시나리오 워크스루

### 시나리오 1: "Smith님이 대시보드에서 워크플로우 실행"

```
1. Smith님 → 브라우저에서 /brick 접속
2. ProjectSelector → "bscamp" 선택
3. PresetListPage → 프리셋 목록 표시
4. "t-pdca-l2" 프리셋 카드에서 [▶ 실행] 클릭
5. ExecuteDialog → feature명 "brick-p1-ops" 입력 → [확인]
6. POST /api/brick/executions → { id: 42 }
7. 자동 이동 → /brick/runs/42
8. RunDetailPage → RunProgressBar 표시
9. WebSocket → block 메시지 수신 → 블록 상태 실시간 반영
10. Plan 블록 완료 → Design 시작 → Do 시작...
11. Do 블록에 approval Gate → "승인 대기" 뱃지 표시
12. Smith님 → 블록 클릭 → ApprovalPanel 표시
13. 산출물 확인 → [✓ 승인] 클릭
14. POST /api/brick/workflows/42/blocks/do/approve
15. 다음 블록 진행 → 완료
```

### 시나리오 2: "반려 후 재작성 루프"

```
1. approval Gate 대기 중 → ApprovalPanel
2. Smith님 → 사유 입력: "TDD 누락"
3. [✗ 반려] 클릭
4. POST /api/brick/workflows/42/blocks/review/reject { reason: "TDD 누락" }
5. 엔진: reject_reason → context 주입 → loop Link → Do 블록 재실행
6. WebSocket → block 메시지 → Do 블록 상태 "running" 표시
7. 재작성 완료 → 다시 approval Gate 도달
8. Smith님 → 승인 → 완료
```

---

## 6. TDD 케이스

### Phase 1: 프로젝트 선택

| ID | 테스트 | 검증 |
|----|--------|------|
| BD-001 | ProjectSelector 렌더 | 드롭다운 + 프로젝트 목록 표시 |
| BD-002 | 프로젝트 선택 → onSelect 호출 | 콜백 파라미터 정확 |
| BD-003 | useProjects 훅 | GET /api/brick/projects 호출 |
| BD-004 | useProjectPresets 훅 | project 파라미터 필터링 |
| BD-005 | BrickCanvasPage presetId URL param | useParams에서 획득 |
| BD-006 | presetId 없으면 PresetListPage로 리다이렉트 | 빈 state 방어 |

### Phase 2: 원클릭 실행

| ID | 테스트 | 검증 |
|----|--------|------|
| BD-007 | PresetListPage 실행 버튼 렌더 | ▶ 버튼 존재 |
| BD-008 | 실행 버튼 클릭 → ExecuteDialog 표시 | 다이얼로그 열림 |
| BD-009 | ExecuteDialog 확인 → POST /api/brick/executions | 요청 전송 |
| BD-010 | 실행 성공 → /brick/runs/:id 이동 | navigate 호출 |
| BD-011 | RunProgressBar 렌더 | 블록 체인 + 진행률 바 |
| BD-012 | RunProgressBar 상태별 색상 | STATUS_BORDER_COLORS 적용 |
| BD-013 | 실행 실패 시 에러 표시 | 에러 메시지 표시 |

### Phase 3: 실시간 상태

| ID | 테스트 | 검증 |
|----|--------|------|
| BD-014 | BrickCanvasPage → useCanvasStore 사용 | Zustand store 연결 |
| BD-015 | useBrickLiveUpdates → 노드 상태 업데이트 | WebSocket block 메시지 → 노드 반영 |
| BD-016 | WebSocket 연결/재연결 | 3s 자동 재연결 |
| BD-017 | 폴링 코드 제거 확인 | refetchInterval 미사용 |
| BD-018 | throttledBlockUpdate → canvas-store 반영 | RAF 배치 업데이트 |
| BD-019 | BlockNode 실패 시 에러 텍스트 | status=failed → 에러 표시 |
| BD-020 | maskTokens 유틸 | xoxb-/sk- 마스킹 |
| BD-021 | WebSocket log 메시지 → 로그 영역 append | 실시간 로그 |
| BD-022 | canvas-store undo/redo | temporal middleware 동작 |

### Phase 4: 승인/반려

| ID | 테스트 | 검증 |
|----|--------|------|
| BD-023 | ApprovalPanel 렌더 | 승인/반려 버튼 + 사유 필드 |
| BD-024 | 승인 클릭 → POST .../approve | API 호출 |
| BD-025 | 반려 클릭 → POST .../reject + reason | reason 전달 |
| BD-026 | 반려 사유 빈칸 → 버튼 비활성 | 필수 입력 검증 |
| BD-027 | BlockNode 승인 대기 뱃지 | gate_checking + approval → 뱃지 |
| BD-028 | DetailPanel → ApprovalPanel 라우팅 | approval 상태 감지 |
| BD-029 | useApproval approve mutation | 성공 시 invalidateQueries |
| BD-030 | useApproval reject mutation | reason 포함 POST |
| BD-031 | WebSocket gate approval_pending → toast | 알림 표시 |
| BD-032 | 산출물 목록 표시 | artifacts 배열 렌더 |

### Phase 5: 드래그 조합 개선

| ID | 테스트 | 검증 |
|----|--------|------|
| BD-033 | BlockSidebar 카테고리 그룹핑 | Plan/Do/Check/Act/Notify 그룹 |
| BD-034 | BlockSidebar 검색 필터 | 입력 → 필터링 |
| BD-035 | BlockSidebar 접기/펼치기 | 카테고리 토글 |
| BD-036 | 자동 레이아웃 세로 | autoLayout('TB') 호출 |
| BD-037 | 자동 레이아웃 가로 | autoLayout('LR') 호출 |
| BD-038 | CanvasToolbar 레이아웃 버튼 → 콜백 | onLayoutVertical/Horizontal 전달 |
| BD-039 | LinkTypePopover 렌더 | 6종 링크 타입 버튼 |
| BD-040 | LinkTypePopover 선택 → onSelect | 링크 타입 전달 |
| BD-041 | LinkTypePopover 캔버스 좌표 위치 | position prop 적용 |
| BD-042 | 연결 드래그 완료 → LinkTypePopover 표시 | onConnect → popover |

### Phase 6: 3축 직관화

| ID | 테스트 | 검증 |
|----|--------|------|
| BD-043 | ThreeAxisPanel 렌더 | 3개 탭 (Block/Team/Gate) |
| BD-044 | Block 탭: 이름 수정 | onUpdateData 호출 |
| BD-045 | Block 탭: what 입력 | done.what 반영 |
| BD-046 | Block 탭: 산출물 설정 | done.artifacts 반영 |
| BD-047 | Team 탭: 어댑터 선택 | adapter 드롭다운 |
| BD-048 | Team 탭: 모델 선택 | model 드롭다운 |
| BD-049 | Team 탭: 에이전트 선택 | agent 드롭다운 |
| BD-050 | Gate 탭: 8종 체크박스 | 전체 Gate 타입 토글 |
| BD-051 | Gate 탭: metric threshold 슬라이더 | 0~100 범위 |
| BD-052 | Gate 탭: approval approver 입력 | 이메일 필드 |
| BD-053 | Gate 탭: artifact 파일 경로 | 경로 입력 필드 |
| BD-054 | Gate 탭: 재시도 횟수 | max_retries 숫자 입력 |
| BD-055 | Gate 탭: 실패 시 동작 | on_fail 드롭다운 (retry/fail/skip) |
| BD-056 | GateConfigPanel 8종 지원 | GATE_TYPES 배열 8개 |
| BD-057 | ConditionBuilder 렌더 | 대상/연산/값 필드 |
| BD-058 | ConditionBuilder → 조건 문자열 생성 | "match_rate < 90" |
| BD-059 | LinkDetailPanel 조건 빌더 통합 | loop/branch → ConditionBuilder |
| BD-060 | DetailPanel → ThreeAxisPanel 라우팅 | block 노드 선택 시 |
| BD-061 | flowToYamlFull 8종 Gate 직렬화 | YAML 출력 정확 |
| BD-062 | yamlToFlow 8종 Gate 역직렬화 | 노드 데이터 복원 |

---

## 7. 불변식 (Invariant)

| ID | 불변식 | 검증 방법 |
|----|--------|----------|
| INV-UX-1 | 사이클 감지 차단 유지 | connection-validator.ts 미변경 |
| INV-UX-2 | 토큰 마스킹 | stderr에 xoxb-/sk- 원문 노출 금지 |
| INV-UX-3 | 반려 사유 필수 | reject 시 reason 빈 문자열 차단 |
| INV-UX-4 | 한국어 UI | 모든 사용자 노출 텍스트 한국어 |
| INV-UX-5 | presetId 없이 캔버스 접근 불가 | 리다이렉트 방어 |

---

## 8. 구현 시 주의사항

1. **BrickCanvasPage 리팩터링 크기**: 490줄 → Zustand 전환 시 useState 제거하면 ~350줄로 줄어듦. 한 번에 하지 말고 P3에서만.
2. **WebSocket 서버**: Express 서버에 `/api/brick/ws` 엔드포인트가 이미 있는지 확인 필요. 없으면 P3에서 추가.
3. **기존 폴링 제거 타이밍**: WebSocket 안정적 연결 확인 후 폴링 제거. 동시 운영 기간 두기.
4. **GateConfigPanel 호환성**: 기존 5종 Gate 데이터 → 8종으로 확장 시 기존 프리셋 YAML 깨지지 않게.
5. **approval API 라우팅**: Express 서버 → EngineBridge → Python 엔진 `complete-block` API에 `approval_action` context 전달.
