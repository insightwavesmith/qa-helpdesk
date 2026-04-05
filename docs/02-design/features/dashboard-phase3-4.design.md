# Design: Dashboard Phase 3-4 — WebSocket 실시간 상태 + 승인/반려 연결

> 작성일: 2026-04-05
> 작성자: PM
> 레벨: L2-기능
> Plan: docs/01-plan/features/dashboard-phase3-4.plan.md
> TASK: docs/tasks/TASK-dashboard-phase3-4.md
> 선행: brick-dashboard-ux-improve.design.md (BD-001~062)
> 리비전: v2 (v1 TDD ID 규약 위반 + isDirty 미처리 + Express 프록시 누락 수정)

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 기능 | WebSocket 실시간 상태 반영 + 승인/반려 버튼 연결 |
| 핵심 | "빌딩 블록은 모두 존재, 연결(wiring)만 필요" |
| 백엔드 변경 | 4파일 (신규 1, 수정 3) |
| 프론트엔드 변경 | 6파일 (신규 0, 수정 6) |
| TDD | BD-201 ~ BD-230 (30건) — Gap 100% |

---

## 코드 검증 결과 (Read/Grep 기반 — 추측 0건)

### 이미 구현된 것 (재사용)

| 컴포넌트 | 파일 | 줄 수 | 상태 | 비고 |
|----------|------|-------|------|------|
| EventBridge | `brick/brick/dashboard/event_bridge.py` | 135 | ✅ 구현+테스트 완료 | BD-57~63 통과. buffer 1000, TTL 300s, reconnect/snapshot |
| ReviewBlockService | `brick/brick/dashboard/review_block.py` | 220 | ✅ 구현+테스트 완료 | BD-132~140 통과. approve/reject/request_changes |
| useBrickLiveUpdates | `dashboard/src/hooks/brick/useBrickLiveUpdates.ts` | 146 | ✅ 구현됨 | 7종 메시지 핸들러, 3s 재연결, **미마운트** |
| canvas-store | `dashboard/src/lib/brick/canvas-store.ts` | 103 | ✅ 구현됨 | zustand + zundo temporal(50), **미사용** |
| ws-throttle | `dashboard/src/lib/brick/ws-throttle.ts` | 33 | ✅ 구현됨 | rAF 배칭, canvas-store.updateNodeData 호출 |
| ApprovalPanel | `dashboard/src/components/brick/panels/ApprovalPanel.tsx` | 101 | ✅ 구현됨 | 승인/반려 버튼, 사유 입력, useApproval 연동 |
| useApproval | `dashboard/src/hooks/brick/useApproval.ts` | 42 | ✅ 구현됨 | POST approve/reject mutation |
| DetailPanel | `dashboard/src/components/brick/panels/DetailPanel.tsx` | 74 | ✅ 라우팅됨 | `gate_checking + approval` → ApprovalPanel (BD-028) |
| BlockNode | `dashboard/src/components/brick/nodes/BlockNode.tsx` | 135 | ✅ 구현됨 | pulsing amber badge on approval (BD-027) |

### 연결이 필요한 것 (Gap)

| Gap | 현재 | 필요 |
|-----|------|------|
| G1: WS 엔드포인트 없음 | server.py에 WS 라우트 미등록 | `routes/ws.py` 신규 + server.py 마운트 |
| G2: EventBridge 고아 | init_engine()에서 EventBus 생성하지만 EventBridge 미연결 | init_engine()에서 EventBridge 인스턴스 생성 → EventBus 연결 |
| G3: useBrickLiveUpdates 미마운트 | BrickCanvasPage에서 import 안 함 (0개 consumer) | BrickCanvasPage에서 import + 호출 |
| G4: canvas-store 미사용 | BrickCanvasPage가 useNodesState/useEdgesState 로컬 사용 | canvas-store로 전환 |
| G5: 폴링 미제거 | useExecutionStatus 3s, useExecutionLogs 5s | WS 연결 시 폴링 제거 |
| G6: approve/reject 미연결 | workflows.py가 파일 command만 기록 (executor 미호출) | executor.complete_block() 직접 호출 |
| G7: BlockStatus 불일치 | 프론트 7종 vs 백엔드 9종 (`waiting_approval`, `rejected` 누락) | 프론트에 2종 추가 |
| G8: 연결 상태 표시 없음 | WS 연결/끊김 상태가 UI에 미표시 | 연결 상태 인디케이터 추가 |
| G9: isDirty 오염 (v2 신규) | canvas-store.updateNodeData가 isDirty=true 강제 설정 | WS 업데이트 전용 액션 필요 (isDirty 미변경) |
| G10: Express→Python WS 프록시 미설정 (v2 신규) | Express dev server가 WS를 Python에 프록시 안 함 | vite.config.ts 또는 Express 미들웨어 WS 프록시 추가 |
| G11: sync.snapshot 미처리 (v2 신규) | useBrickLiveUpdates가 BrickWsMessage 7종만 처리 (snapshot/replay 없음) | sync.snapshot → canvas-store 초기화 + sync.replay → 순차 적용 |
| G12: onApprove/onReject 미전달 (v2 신규) | BrickCanvasPage가 DetailPanel에 콜백 미전달 | 콜백 체인 연결 |

---

## 1. 아키텍처 개요

```
┌───────────────────────────────────────────────────────────────────────┐
│  Browser (BrickCanvasPage)                                           │
│                                                                       │
│  ┌────────────┐   ┌──────────────────┐   ┌──────────────────────┐    │
│  │canvas-store│◄──│useBrickLiveUpdates│◄──│ WebSocket            │    │
│  │  (zustand) │   │  (message router) │   │ ws://host/api/brick/ws│   │
│  │            │   │  + sync.snapshot  │   └──────────┬───────────┘   │
│  │ ★isDirty   │   │  + sync.replay   │              │               │
│  │  분리 관리  │   └──────────────────┘              │               │
│  └─────┬──────┘                                      │               │
│        │ nodes/edges                                 │               │
│  ┌─────▼──────┐                                      │               │
│  │ React Flow │                                      │               │
│  │  BlockNode │ ──────► DetailPanel                   │               │
│  └────────────┘   selectedNode ──► ApprovalPanel      │               │
│                        │              │               │               │
│                        │    ┌─────────▼───────┐       │               │
│                        └───►│ useApproval      │──────┘               │
│                             │ POST /approve    │                      │
│                             │ POST /reject     │                      │
│                             └─────────────────┘                      │
└──────────────────────────────┼────────────────────────────────────────┘
                               │ Express proxy (WS upgrade)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  Express (dev) / nginx (prod)                                        │
│  /api/brick/ws → ws://python-host:8000/api/v1/ws (WS proxy)         │
└──────────────────────────────┼───────────────────────────────────────┘
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│  FastAPI (server.py)                                                 │
│                                                                      │
│  ┌───────────┐   ┌──────────────┐   ┌────────────┐                  │
│  │ routes/   │   │ engine_      │   │ routes/    │                  │
│  │ ws.py     │◄──│ bridge.py    │──►│ workflows  │                  │
│  │ (WS 엔드) │   │ init_engine()│   │ (approve/  │                  │
│  └─────┬─────┘   │ + EventBridge│   │  reject)   │                  │
│        │         └──────┬───────┘   └────────────┘                  │
│        │                │                                            │
│  ┌─────▼────────────────▼───────┐                                   │
│  │       EventBridge            │                                   │
│  │  connect/disconnect/         │                                   │
│  │  broadcast/reconnect         │                                   │
│  └──────────────┬───────────────┘                                   │
│                 │ subscribe("*")                                     │
│  ┌──────────────▼───────────────┐                                   │
│  │       EventBus               │                                   │
│  │  block.started/completed     │                                   │
│  │  gate.pending/passed/failed  │                                   │
│  └──────────────────────────────┘                                   │
└──────────────────────────────────────────────────────────────────────┘
```

### v1 → v2 아키텍처 변경점

| 변경 | v1 | v2 |
|------|-----|-----|
| WS 프록시 | 미설계 | Express WS proxy 명시 |
| isDirty | canvas-store.updateNodeData(isDirty=true) | `applyWsUpdate` 액션 분리 (isDirty 미변경) |
| sync.snapshot | BrickWsMessage 7종에 미포함 | `sync` 타입 추가 (snapshot/replay) |
| TDD ID | DP3-XX (비표준) | BD-2XX (프로젝트 표준) |

---

## 2. 백엔드 상세 설계

### 2.1 routes/ws.py (신규)

**파일**: `brick/brick/dashboard/routes/ws.py`
**역할**: FastAPI WebSocket 엔드포인트 — EventBridge 중계

```python
# 모듈 의존성
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import json, logging, time

router = APIRouter()
logger = logging.getLogger("brick.ws")

# event_bridge 인스턴스는 engine_bridge.py에서 주입 (모듈 레벨 변수)
event_bridge = None  # type: EventBridge | None

def set_event_bridge(bridge):
    """engine_bridge.init_engine()에서 호출하여 EventBridge 주입"""
    global event_bridge
    event_bridge = bridge
```

**WebSocket 핸들러**:

```python
@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    1. 클라이언트 접속 → accept
    2. EventBridge.connect() → snapshot 전송
    3. 메시지 수신 대기 (ping/pong, filter 변경, reconnect)
    4. 연결 종료 → EventBridge.disconnect()
    """
    await websocket.accept()

    # G2 에러 처리: 엔진 미초기화 시 즉시 종료
    if event_bridge is None:
        await websocket.send_json({"type": "error", "data": {"message": "Engine not initialized"}})
        await websocket.close(code=1011, reason="Engine not initialized")
        return

    # WebSocketClient 생성 — send 콜백은 websocket.send_json
    from ..event_bridge import WebSocketClient
    client = WebSocketClient(
        send=websocket.send_json,
        workflow_filter="*",
        type_filter="*",
        last_seq=0,
        connected_at=time.time(),
    )

    await event_bridge.connect(client)
    logger.info(f"WS client connected (total: {len(event_bridge._clients)})")

    try:
        while True:
            data = await websocket.receive_text()
            msg = json.loads(data)

            # 클라이언트가 필터 변경 요청
            if msg.get("action") == "set_filter":
                client.workflow_filter = msg.get("workflow_filter", "*")
                client.type_filter = msg.get("type_filter", "*")

            # 재연결 시 놓친 이벤트 요청
            elif msg.get("action") == "reconnect":
                await event_bridge.handle_reconnect(client, msg.get("last_seq", 0))

            # ping → pong (연결 유지)
            elif msg.get("action") == "ping":
                await websocket.send_json({"type": "pong"})

    except WebSocketDisconnect:
        pass
    except json.JSONDecodeError:
        logger.warning("WS received invalid JSON")
    except Exception as e:
        logger.warning(f"WS error: {e}")
    finally:
        await event_bridge.disconnect(client)
        logger.info(f"WS client disconnected (remaining: {len(event_bridge._clients)})")
```

**메시지 프로토콜** (서버 → 클라이언트):

| 메시지 type | data 필드 | 설명 | 발생 조건 |
|------------|----------|------|----------|
| `block` | `{ blockId, status, workflowId }` | 블록 상태 변경 | EventBus `block.started`, `block.completed`, `block.failed` |
| `gate` | `{ blockId, gateType, status, message }` | Gate 상태 변경 | EventBus `gate.pending`, `gate.passed`, `gate.failed` |
| `execution` | `{ workflowId, status }` | 워크플로우 상태 변경 | EventBus `workflow.completed`, `workflow.failed` |
| `log` | `{ blockId, message, level, timestamp }` | 블록 로그 | EventBus `log.entry` |
| `sync.snapshot` | `{ workflows: [...] }` | 접속/재접속 시 현재 상태 | connect() 또는 reconnect(gap>TTL) |
| `sync.replay` | `{ events: [...], fromSeq, toSeq }` | 재연결 시 놓친 이벤트 | reconnect(gap≤TTL) |
| `pong` | `{}` | 연결 유지 응답 | 클라이언트 ping 수신 |
| `error` | `{ message }` | 에러 | 엔진 미초기화 등 |

**메시지 프로토콜** (클라이언트 → 서버):

| action | 필드 | 설명 |
|--------|------|------|
| `set_filter` | `workflow_filter`, `type_filter` | 구독 필터 변경 |
| `reconnect` | `last_seq` | 놓친 이벤트 재생 요청 |
| `ping` | 없음 | 연결 유지 확인 |

### 2.2 engine_bridge.py 수정

**파일**: `brick/brick/dashboard/routes/engine_bridge.py`
**변경**: `init_engine()` 함수에 EventBridge 인스턴스 생성 + WS 모듈에 주입

```python
# 추가 import
from ..event_bridge import EventBridge, WebSocketClient
from .ws import set_event_bridge

# 기존 global 변수에 추가
event_bridge: EventBridge | None = None

def init_engine(root: str = ".bkit/"):
    global executor, preset_loader, checkpoint_store, state_machine, event_bridge

    # ... 기존 초기화 코드 (StateMachine, EventBus, CheckpointStore 등) ...
    # 여기서 event_bus (eb), checkpoint_store (cs) 이미 생성됨

    # ── 추가: EventBridge 생성 + EventBus 연결 ──
    event_bridge = EventBridge(event_bus=eb, checkpoint=cs)
    set_event_bridge(event_bridge)
    logger.info("EventBridge initialized and connected to EventBus")

    # ... 기존 나머지 코드 (AdapterRegistry, SlackSubscriber 등) ...
```

**변경 범위**: `init_engine()` 함수 내부에 3줄 추가. 기존 코드 수정 0줄.

### 2.3 server.py 수정

**파일**: `brick/brick/dashboard/server.py`
**변경**: WS 라우터 등록

```python
# 추가 import
from .routes.ws import router as ws_router

def create_app(root: str = ".bkit/") -> FastAPI:
    app = FastAPI(...)

    # 기존 라우터들 ...
    app.include_router(engine_bridge, prefix="/api/v1")
    # ... 기존 라우터들 ...

    # ── 추가: WebSocket 라우터 ──
    app.include_router(ws_router, prefix="/api/v1")

    return app
```

**변경 범위**: import 1줄 + include_router 1줄 = 총 2줄 추가.

### 2.4 workflows.py 수정

**파일**: `brick/brick/dashboard/routes/workflows.py`
**변경**: approve/reject 라우트가 executor를 직접 호출하도록 연결

**현재 상태** (파일 command 방식):
```python
# 현재: 파일에 명령 기록만 함 — executor 미호출
@router.post("/workflows/{wf_id}/blocks/{bid}/approve")
async def approve_block(wf_id: str, bid: str):
    cmd_dir = runtime_root / "workflows" / wf_id / "commands"
    cmd_dir.mkdir(parents=True, exist_ok=True)
    (cmd_dir / "approve.json").write_text(json.dumps({...}))
    return {"status": "queued"}
```

**변경 후** (executor 직접 호출):
```python
from .engine_bridge import executor
from fastapi import HTTPException, Body
from datetime import datetime

@router.post("/workflows/{wf_id}/blocks/{bid}/approve")
async def approve_block(wf_id: str, bid: str):
    # G6 에러 처리: executor 미초기화
    if executor is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    result = await executor.complete_block(
        workflow_id=wf_id,
        block_id=bid,
        approval_action="approve",
    )

    # 감사 로그 유지 (기존 파일 command 패턴)
    cmd_dir = runtime_root / "workflows" / wf_id / "commands"
    cmd_dir.mkdir(parents=True, exist_ok=True)
    (cmd_dir / "approve.json").write_text(json.dumps({
        "action": "approve", "block_id": bid,
        "timestamp": datetime.now().isoformat(),
    }))

    return {"status": "approved", "result": result}


@router.post("/workflows/{wf_id}/blocks/{bid}/reject")
async def reject_block(wf_id: str, bid: str, body: dict = Body(...)):
    if executor is None:
        raise HTTPException(status_code=503, detail="Engine not initialized")

    reason = body.get("reason", "")
    if not reason.strip():
        raise HTTPException(status_code=422, detail="반려 사유는 필수입니다")

    result = await executor.complete_block(
        workflow_id=wf_id,
        block_id=bid,
        approval_action="reject",
        reject_reason=reason,
    )

    # 감사 로그
    cmd_dir = runtime_root / "workflows" / wf_id / "commands"
    cmd_dir.mkdir(parents=True, exist_ok=True)
    (cmd_dir / "reject.json").write_text(json.dumps({
        "action": "reject", "block_id": bid, "reason": reason,
        "timestamp": datetime.now().isoformat(),
    }))

    return {"status": "rejected", "result": result}
```

**변경 범위**: approve/reject 2개 함수 본문 교체. 감사로그 유지. reject에 사유 빈칸 검증 추가 (v2).

---

## 3. 프론트엔드 상세 설계

### 3.1 Express WS 프록시 설정 (v2 신규)

**문제**: 프론트엔드의 WS URL은 `ws://host/api/brick/ws`이지만, Python FastAPI는 `/api/v1/ws`에서 리슨.
Express dev server가 HTTP만 프록시하고 WS upgrade를 프록시하지 않으면 WS 연결 실패.

**파일**: `dashboard/vite.config.ts` (또는 Express 미들웨어)

```typescript
// vite.config.ts — dev server WS 프록시
export default defineConfig({
  server: {
    proxy: {
      // 기존 HTTP 프록시
      '/api/brick': {
        target: 'http://localhost:8000',
        rewrite: (path) => path.replace(/^\/api\/brick/, '/api/v1'),
        changeOrigin: true,
      },
      // WS 프록시 추가 — /api/brick/ws → ws://localhost:8000/api/v1/ws
      '/api/brick/ws': {
        target: 'ws://localhost:8000',
        ws: true,  // WebSocket 프록시 활성화
        rewrite: (path) => path.replace(/^\/api\/brick\/ws/, '/api/v1/ws'),
      },
    },
  },
});
```

**프로덕션**: Cloud Run에서 nginx 또는 로드밸런서가 동일한 경로 재작성 수행.

### 3.2 BlockStatus 타입 확장

**파일**: `dashboard/src/components/brick/nodes/types.ts`
**변경**: 백엔드 BlockStatus와 동기화 (2종 추가)

```typescript
// 변경 전 (7종)
export const BLOCK_STATUSES = [
  'pending', 'queued', 'running', 'gate_checking', 'completed', 'failed', 'suspended',
] as const;

// 변경 후 (9종 — 백엔드 동기화)
export const BLOCK_STATUSES = [
  'pending', 'queued', 'running', 'gate_checking', 'waiting_approval',
  'completed', 'failed', 'rejected', 'suspended',
] as const;

// STATUS_BORDER_COLORS 추가
export const STATUS_BORDER_COLORS: Record<BlockStatus, string> = {
  pending: '#D1D5DB',
  queued: '#FCD34D',
  running: '#3B82F6',
  gate_checking: '#8B5CF6',
  waiting_approval: '#F97316',  // 주황 (승인 대기)
  completed: '#10B981',
  failed: '#EF4444',
  rejected: '#DC2626',          // 진한 빨강 (반려)
  suspended: '#F59E0B',
};

// STATUS_ICONS 추가
export const STATUS_ICONS: Record<BlockStatus, string> = {
  pending: '○',
  queued: '◎',
  running: '◉',     // animate-spin
  gate_checking: '⚖',
  waiting_approval: '🔔',
  completed: '✓',
  failed: '✕',
  rejected: '↩',
  suspended: '⏸',
};

// BACKEND_STATUS_MAP 확장
export const BACKEND_STATUS_MAP: Record<string, BlockStatus> = {
  pending: 'pending',
  queued: 'queued',
  running: 'running',
  gate_checking: 'gate_checking',
  waiting_approval: 'waiting_approval',
  completed: 'completed',
  failed: 'failed',
  rejected: 'rejected',
  suspended: 'suspended',
};
```

### 3.3 canvas-store.ts 수정 — isDirty 분리 (v2 핵심 변경)

**파일**: `dashboard/src/lib/brick/canvas-store.ts`
**문제**: 기존 `updateNodeData`가 항상 `isDirty: true`를 설정함. WS를 통한 상태 업데이트는 사용자 편집이 아니므로 isDirty를 변경하면 안 됨. "저장하지 않은 변경 있음" 경고가 잘못 표시됨.

```typescript
// 기존 액션
export interface CanvasActions {
  // ... 기존 액션들 ...
  updateNodeData: (nodeId: string, data: Partial<Record<string, unknown>>) => void;

  // ── v2 추가: WS 전용 업데이트 (isDirty 미변경) ──
  applyWsUpdate: (nodeId: string, data: Partial<Record<string, unknown>>) => void;
  applyWsSnapshot: (nodes: Node[], edges: Edge[]) => void;
}
```

**구현**:

```typescript
applyWsUpdate: (nodeId, data) =>
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
    ),
    // isDirty 미변경 — WS 업데이트는 사용자 편집이 아님
  })),

applyWsSnapshot: (nodes, edges) =>
  set({
    nodes,
    edges,
    // isDirty 미변경 — 서버 동기화는 사용자 편집이 아님
  }),
```

### 3.4 BrickCanvasPage.tsx 리팩터링

**파일**: `dashboard/src/pages/brick/BrickCanvasPage.tsx` (498줄)
**변경 범위**: 상태 관리 전환 + WS 마운트 + 폴링 제거 + 콜백 전달

#### 3.4.1 상태 관리 전환 (로컬 → canvas-store)

```typescript
// 변경 전 (로컬 상태)
const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);

// 변경 후 (canvas-store)
import { useCanvasStore } from '../../lib/brick/canvas-store';

const {
  nodes, edges, selectedNodeId, selectedEdgeId,
  onNodesChange, onEdgesChange, setNodes, setEdges,
  selectNode, selectEdge,
} = useCanvasStore();
```

#### 3.4.2 useBrickLiveUpdates 마운트 + 연결 상태

```typescript
import { useBrickLiveUpdates } from '../../hooks/brick/useBrickLiveUpdates';
import { useToast } from '../../hooks/useToast';

function BrickCanvasInner() {
  const { toast } = useToast();

  // WS 실시간 업데이트 마운트 (G3 해소)
  const { isConnected } = useBrickLiveUpdates({ onToast: toast });

  // ... 나머지 컴포넌트 로직 ...
}
```

#### 3.4.3 폴링 제거

```typescript
// 변경 전
const { data: executionData } = useExecutionStatus(executionId);  // refetchInterval: 3000
const { data: logs } = useExecutionLogs(executionId);              // refetchInterval: 5000

// 변경 후 — WS가 queryClient를 직접 업데이트하므로 폴링 불필요
const { data: executionData } = useExecutionStatus(executionId);  // refetchInterval 제거
const { data: logs } = useExecutionLogs(executionId);              // refetchInterval 제거
```

#### 3.4.4 onApprove/onReject 콜백 전달 (v2 신규 — G12 해소)

```typescript
// 현재: DetailPanel에 콜백 미전달
<DetailPanel
  nodes={nodes}
  edges={edges}
  selectedNodeId={selectedNodeId}
  selectedEdgeId={selectedEdgeId}
  // onApprove, onReject → 빈 콜백 (미전달)
/>

// 변경 후: 콜백 연결
import { useApproval } from '../../hooks/brick/useApproval';

const { approve, reject } = useApproval();

const handleApprove = useCallback(async (nodeId: string) => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  const wfId = (node.data as Record<string, unknown>).workflowId as string;
  await approve({ workflowId: wfId, blockId: nodeId });
}, [nodes, approve]);

const handleReject = useCallback(async (nodeId: string, reason: string) => {
  const node = nodes.find(n => n.id === nodeId);
  if (!node) return;
  const wfId = (node.data as Record<string, unknown>).workflowId as string;
  await reject({ workflowId: wfId, blockId: nodeId, reason });
}, [nodes, reject]);

<DetailPanel
  nodes={styledNodes}
  edges={edges}
  selectedNodeId={selectedNodeId}
  selectedEdgeId={selectedEdgeId}
  onApprove={handleApprove}
  onReject={handleReject}
/>
```

#### 3.4.5 styledNodes 로직 유지

기존 `useMemo(() => styledNodes)` 로직은 canvas-store의 `nodes`를 참조하도록 변경만 하면 된다.
`useBrickLiveUpdates` → `ws-throttle` → `canvas-store.applyWsUpdate`가 이미 블록 상태를 반영하므로 styledNodes useMemo는 자동 재계산.

```typescript
const styledNodes = useMemo(() => {
  return nodes.map((node) => {
    const status = (node.data as Record<string, unknown>).status as BlockStatus | undefined;
    if (status && STATUS_BORDER_COLORS[status]) {
      return {
        ...node,
        style: { ...node.style, borderColor: STATUS_BORDER_COLORS[status], borderWidth: 2 },
      };
    }
    return node;
  });
}, [nodes]);
```

#### 3.4.6 연결 상태 인디케이터 (G8 해소)

```tsx
// JSX — 캔버스 좌측 하단 오버레이
<div className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 text-xs text-gray-500">
  <span
    data-testid="ws-status-indicator"
    className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}
  />
  <span>{isConnected ? '실시간 연결됨' : '재연결 중...'}</span>
</div>
```

### 3.5 useBrickLiveUpdates.ts 확장

**파일**: `dashboard/src/hooks/brick/useBrickLiveUpdates.ts` (146줄)
**변경**: sync 메시지 처리 + isConnected 반환 + 지수 백오프 + isDirty 분리

#### 3.5.1 BrickWsMessage 타입 확장 (v2 신규 — G11 해소)

```typescript
// 변경 전 (7종)
export interface BrickWsMessage {
  type: 'block' | 'gate' | 'team' | 'review_requested' | 'learning_proposal' | 'execution' | 'log';
  data: Record<string, unknown>;
}

// 변경 후 (9종 — sync, pong 추가)
export interface BrickWsMessage {
  type: 'block' | 'gate' | 'team' | 'review_requested' | 'learning_proposal'
    | 'execution' | 'log' | 'sync.snapshot' | 'sync.replay';
  data: Record<string, unknown>;
  sequence?: number;
  timestamp?: string;
}
```

#### 3.5.2 sync.snapshot 핸들러 (v2 신규)

```typescript
// handleMessage 내부 switch에 추가
case 'sync.snapshot': {
  const { applyWsSnapshot } = useCanvasStore.getState();
  const workflows = msg.data.workflows as Array<{
    id: string; status: string; current_block: string; feature: string;
  }>;
  // snapshot → 현재 노드 상태 일괄 업데이트
  const currentNodes = useCanvasStore.getState().nodes;
  const updatedNodes = currentNodes.map((node) => {
    const wf = workflows.find(w => w.current_block === node.id);
    if (wf) {
      return { ...node, data: { ...node.data, status: wf.status } };
    }
    return node;
  });
  applyWsSnapshot(updatedNodes, useCanvasStore.getState().edges);
  // sequence 추적
  if (msg.sequence) lastSeqRef.current = msg.sequence;
  break;
}
```

#### 3.5.3 sync.replay 핸들러 (v2 신규)

```typescript
case 'sync.replay': {
  const events = msg.data.events as BrickWsMessage[];
  // 놓친 이벤트를 순차 적용
  for (const event of events) {
    handleMessage(event);
  }
  break;
}
```

#### 3.5.4 ws-throttle → applyWsUpdate 전환 (v2 isDirty 수정)

```typescript
// ws-throttle.ts 수정
// 변경 전
import { useCanvasStore } from './canvas-store';
export const throttledBlockUpdate = (blockId: string, status: string) => {
  requestAnimationFrame(() => {
    useCanvasStore.getState().updateNodeData(blockId, { status });  // isDirty=true 문제
  });
};

// 변경 후
export const throttledBlockUpdate = (blockId: string, status: string) => {
  requestAnimationFrame(() => {
    useCanvasStore.getState().applyWsUpdate(blockId, { status });  // isDirty 미변경
  });
};
```

#### 3.5.5 isConnected + 지수 백오프 + last_seq 추적

```typescript
export function useBrickLiveUpdates(options?: {
  onToast?: ToastFn;
  onConnectionChange?: (connected: boolean) => void;
}): { handleMessage: (msg: BrickWsMessage) => void; isConnected: boolean } {
  const [isConnected, setIsConnected] = useState(false);
  const reconnectCount = useRef(0);
  const lastSeqRef = useRef(0);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/brick/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        options?.onConnectionChange?.(true);
        // 재연결인 경우 놓친 이벤트 요청
        if (reconnectCount.current > 0 && lastSeqRef.current > 0) {
          ws.send(JSON.stringify({ action: 'reconnect', last_seq: lastSeqRef.current }));
        }
        reconnectCount.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const msg: BrickWsMessage = JSON.parse(event.data);
          // sequence 추적 (last_seq)
          if (msg.sequence && msg.sequence > lastSeqRef.current) {
            lastSeqRef.current = msg.sequence;
          }
          handleMessage(msg);
        } catch {
          // 파싱 실패 무시
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        setIsConnected(false);
        options?.onConnectionChange?.(false);
        reconnectCount.current += 1;
        // 재연결 간격: 3s, 6s, 12s, max 30s (지수 백오프)
        const delay = Math.min(3000 * Math.pow(2, reconnectCount.current - 1), 30000);
        reconnectTimer.current = setTimeout(connect, delay);
      };

      ws.onerror = () => { ws.close(); };
    } catch {
      reconnectTimer.current = setTimeout(connect, 5000);
    }
  }, [handleMessage, options]);

  // cleanup on unmount
  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) wsRef.current.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  return { handleMessage, isConnected };
}
```

### 3.6 useExecutions.ts 수정

**파일**: `dashboard/src/hooks/brick/useExecutions.ts` (142줄)
**변경**: refetchInterval 제거

```typescript
// 변경 전
export function useExecutionStatus(executionId: string | null) {
  return useQuery({
    queryKey: ['brick', 'executions', executionId],
    queryFn: ...,
    enabled: !!executionId,
    refetchInterval: 3000,  // ← 제거
  });
}

export function useExecutionLogs(executionId: string | null) {
  return useQuery({
    queryKey: ['brick', 'executions', executionId, 'logs'],
    queryFn: ...,
    enabled: !!executionId,
    refetchInterval: 5000,  // ← 제거
  });
}
```

**근거**: WS `block`/`execution` 메시지가 `queryClient.invalidateQueries`로 리페치 트리거.
WS `log` 메시지가 `queryClient.setQueryData`로 직접 캐시 업데이트. 폴링 제거해도 최신 상태 유지.

### 3.7 DetailPanel 라우팅 확장

**파일**: `dashboard/src/components/brick/panels/DetailPanel.tsx`
**변경**: `waiting_approval` 상태도 ApprovalPanel으로 라우팅

```typescript
// 변경 전 (BD-028)
if (nodeData.status === 'gate_checking' && nodeData.gateType === 'approval') {
  return <ApprovalPanel ... />;
}

// 변경 후 — waiting_approval 상태도 포함
if (
  (nodeData.status === 'gate_checking' && nodeData.gateType === 'approval') ||
  nodeData.status === 'waiting_approval'
) {
  return <ApprovalPanel ... />;
}
```

---

## 4. E2E 시나리오 워크스루

### 시나리오 1: Building 실행 → 실시간 상태 확인

```
단계    누가              뭘 하는지                                     어떻게 아는지 (알림/트리거)

1.      Smith님           브라우저 /brick/canvas/:presetId 접속
2.      BrickCanvasPage   마운트 → useBrickLiveUpdates() 호출
3.      useBrickLiveUpdates   WebSocket ws://host/api/brick/ws 접속
4.      Express/vite      WS proxy → ws://python:8000/api/v1/ws 전달     vite.config proxy 설정
5.      routes/ws.py      websocket.accept() → EventBridge.connect()
6.      EventBridge       _build_snapshot() → sync.snapshot 전송          WS send_json
7.      useBrickLiveUpdates   handleMessage('sync.snapshot') →
                              applyWsSnapshot(updatedNodes, edges)        canvas-store 상태 변경
8.      React Flow        canvas-store nodes 변경 → 노드 색상 렌더링       화면에 노드 색상 표시
9.      연결 인디케이터    isConnected=true → 녹색 점 + "실시간 연결됨"     좌측 하단 인디케이터

10.     Smith님           ▶실행 버튼 클릭 → POST /api/brick/executions
11.     Express           Python /api/v1/engine/start 프록시
12.     WorkflowExecutor  plan 블록 → QUEUED → RUNNING
13.     EventBus          block.started { blockId: 'plan', status: 'running' } emit
14.     EventBridge       _on_engine_event → buffer 적재 → broadcast()
15.     routes/ws.py      WS 클라이언트에 { type: 'block', data: { blockId: 'plan', status: 'running' }, sequence: N }
16.     useBrickLiveUpdates   handleMessage('block') → throttledBlockUpdate('plan', 'running')
17.     ws-throttle       rAF → canvas-store.applyWsUpdate('plan', { status: 'running' })
                          ★ isDirty 미변경 (applyWsUpdate 사용)
18.     React Flow        styledNodes 재계산 → plan 노드 테두리 #3B82F6 (파랑)    < 1초 반영

19.     plan 블록 완료    EventBus → block.completed
20.     EventBridge       broadcast({ type: 'block', data: { blockId: 'plan', status: 'completed' } })
21.     ws-throttle       canvas-store.applyWsUpdate('plan', { status: 'completed' })
22.     React Flow        plan 노드 테두리 → #10B981 (초록)
```

### 시나리오 2: 승인 대기 → 대시보드에서 승인/반려 처리

```
단계    누가              뭘 하는지                                     어떻게 아는지

1.      워크플로우        design-review 블록 → gate.pending 이벤트
2.      EventBridge       broadcast({ type: 'gate', data: { blockId: 'design-review',
                          gateType: 'approval', status: 'waiting' } })
3.      useBrickLiveUpdates   handleMessage('gate') →
                              a) onToast({ title: '승인 요청', variant: 'warning' })      토스트 알림
                              b) throttledBlockUpdate('design-review', 'waiting_approval')
4.      ws-throttle       applyWsUpdate('design-review', { status: 'waiting_approval' })
5.      BlockNode         design-review 노드 → 주황 테두리(#F97316) + 🔔 펄스    시각적 강조

6.      Smith님           design-review 노드 클릭
7.      canvas-store      selectNode('design-review')
8.      DetailPanel       nodeData.status === 'waiting_approval' → ApprovalPanel 렌더링
9.      ApprovalPanel     워크플로우ID + 블록ID + 산출물 목록 + 체크리스트 표시

[승인 경로]
10-a.   Smith님           체크리스트 완료 → [승인] 버튼 클릭
11-a.   BrickCanvasPage   handleApprove('design-review') 호출  ← G12 해소: 콜백 체인 연결
12-a.   useApproval       POST /api/v1/workflows/{wid}/blocks/{bid}/approve
13-a.   workflows.py      executor.complete_block(approval_action="approve")
14-a.   WorkflowExecutor  design-review → completed → implement 시작
15-a.   EventBridge       block.completed(design-review) + block.started(implement) broadcast
16-a.   useBrickLiveUpdates   2개 이벤트 순차 처리
17-a.   캔버스            design-review → 초록(#10B981), implement → 파랑(#3B82F6)

[반려 경로]
10-b.   Smith님           [반려] 버튼 클릭 → 반려 사유 입력 모달 표시
11-b.   Smith님           사유: "TDD 누락" 입력 → 확인
12-b.   BrickCanvasPage   handleReject('design-review', 'TDD 누락') 호출
13-b.   useApproval       POST /api/v1/workflows/{wid}/blocks/{bid}/reject { reason: "TDD 누락" }
14-b.   workflows.py      executor.complete_block(approval_action="reject", reject_reason="TDD 누락")
15-b.   WorkflowExecutor  design-review → rejected → design 루프백 (loop link)
                          design 블록이 reject_reason을 context로 받아 재실행
16-b.   EventBridge       block.completed(design-review, rejected) + block.started(design) broadcast
17-b.   캔버스            design-review → 빨강(#DC2626), design → 파랑(#3B82F6)
```

### 시나리오 3: WebSocket 끊김 → 자동 재연결

```
단계    누가              뭘 하는지                                     어떻게 아는지

1.      네트워크          WebSocket 연결 끊김
2.      useBrickLiveUpdates   ws.onclose → isConnected=false, reconnectCount++
3.      연결 인디케이터    빨간 점 + "재연결 중..." 표시                    좌측 하단 인디케이터

4.      (끊김 동안 블록 상태 2건 변경)

5.      useBrickLiveUpdates   3초 후 connect() 재호출 (지수 백오프: 3→6→12→max 30s)
6.      routes/ws.py      새 WebSocket accept → EventBridge.connect(newClient)
7.      useBrickLiveUpdates   onopen → reconnectCount > 0이므로
                              ws.send({ action: 'reconnect', last_seq: lastSeqRef.current })

[Case A: TTL 이내 (< 5분)]
8-a.    EventBridge       handle_reconnect(last_seq=N) → buffer에서 N 이후 이벤트 추출
9-a.    routes/ws.py      sync.replay { events: [...], fromSeq: N+1, toSeq: N+2 } 전송
10-a.   useBrickLiveUpdates   handleMessage('sync.replay') → events 순차 적용
11-a.   캔버스            끊김 동안 변경된 2건 이벤트가 순서대로 반영

[Case B: TTL 초과 (≥ 5분)]
8-b.    EventBridge       handle_reconnect → buffer 만료 → _build_snapshot()
9-b.    routes/ws.py      sync.snapshot 전송
10-b.   useBrickLiveUpdates   handleMessage('sync.snapshot') → 전체 상태 동기화
11-b.   캔버스            현재 전체 상태가 한 번에 반영

12.     useBrickLiveUpdates   isConnected=true, reconnectCount=0
13.     연결 인디케이터    녹색 점 + "실시간 연결됨" 복구
```

---

## 5. 변경 파일 요약

| # | 파일 | 유형 | 변경 내용 | 줄 수 | 영향 범위 |
|---|------|------|----------|-------|----------|
| 1 | `brick/brick/dashboard/routes/ws.py` | **신규** | WebSocket 엔드포인트 | ~55 | 백엔드 |
| 2 | `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | init_engine()에 EventBridge 3줄 추가 | +3 | 백엔드 |
| 3 | `brick/brick/dashboard/server.py` | 수정 | WS 라우터 import + 등록 | +2 | 백엔드 |
| 4 | `brick/brick/dashboard/routes/workflows.py` | 수정 | approve/reject → executor 호출 | ~30 교체 | 백엔드 |
| 5 | `dashboard/src/components/brick/nodes/types.ts` | 수정 | BlockStatus 2종 + 색상/아이콘 | +6 | 프론트 |
| 6 | `dashboard/src/lib/brick/canvas-store.ts` | 수정 | applyWsUpdate + applyWsSnapshot 액션 추가 | +15 | 프론트 |
| 7 | `dashboard/src/pages/brick/BrickCanvasPage.tsx` | 수정 | canvas-store 전환 + WS 마운트 + 폴링 제거 + 콜백 | ~40 교체 | 프론트 |
| 8 | `dashboard/src/hooks/brick/useBrickLiveUpdates.ts` | 수정 | sync 처리 + isConnected + 지수 백오프 + lastSeq | ~30 추가 | 프론트 |
| 9 | `dashboard/src/hooks/brick/useExecutions.ts` | 수정 | refetchInterval 제거 (2곳) | -2 | 프론트 |
| 10 | `dashboard/src/components/brick/panels/DetailPanel.tsx` | 수정 | waiting_approval 라우팅 (1줄) | +1 | 프론트 |
| 11 | `dashboard/src/lib/brick/ws-throttle.ts` | 수정 | updateNodeData → applyWsUpdate | 1줄 교체 | 프론트 |
| 12 | `dashboard/vite.config.ts` | 수정 | WS 프록시 추가 | +5 | 프론트 빌드 |

---

## 6. TDD 케이스 (Gap 100% 기준)

> 모든 설계 동작을 1:1로 커버. 테스트 함수명에 `test_bd2XX_` 형식 TDD ID 필수.
> BD-201 ~ BD-230 (30건). 누락 = 미구현 판정.

### 6.1 백엔드 테스트 (`brick/tests/test_dashboard_phase3_4.py`)

| ID | 테스트명 | 검증 내용 | 관련 Gap | 설계 섹션 |
|----|---------|----------|---------|----------|
| BD-201 | `test_bd201_ws_endpoint_accepts_and_sends_snapshot` | `/api/v1/ws` WebSocket 접속 → 200 upgrade → sync.snapshot 메시지 수신, `workflows[]` 배열 포함 | G1 | §2.1 |
| BD-202 | `test_bd202_ws_broadcasts_block_started` | 블록 RUNNING 전환 → EventBus emit → WS 클라이언트에 `{ type: 'block', data: { blockId, status: 'running' }, sequence: int }` 수신 | G1, G2 | §2.1, §2.2 |
| BD-203 | `test_bd203_ws_broadcasts_block_completed` | 블록 COMPLETED 전환 → WS에 `{ type: 'block', data: { status: 'completed' } }` 수신 | G1, G2 | §2.1, §2.2 |
| BD-204 | `test_bd204_ws_broadcasts_gate_pending` | Gate approval_pending → WS에 `{ type: 'gate', data: { gateType: 'approval', status: 'waiting' } }` 수신 | G1, G2 | §2.1 |
| BD-205 | `test_bd205_ws_reconnect_replays_missed_events` | WS 재접속 시 `{ action: 'reconnect', last_seq: N }` 전송 → `sync.replay` 메시지 수신, `events[]` 배열에 N+1부터 이벤트 포함 | G1 | §2.1 |
| BD-206 | `test_bd206_ws_disconnect_removes_client` | WS 종료 → EventBridge._clients에서 제거됨 (len 감소), 메모리 누수 없음 | G1 | §2.1 |
| BD-207 | `test_bd207_init_engine_creates_eventbridge` | init_engine() 호출 후 → `event_bridge` 전역변수가 EventBridge 인스턴스, EventBus subscriber에 등록됨 | G2 | §2.2 |
| BD-208 | `test_bd208_approve_calls_executor_complete_block` | POST /approve → executor.complete_block(approval_action="approve") 호출 + `{"status": "approved"}` 반환 | G6 | §2.4 |
| BD-209 | `test_bd209_reject_calls_executor_with_reason` | POST /reject `{ reason: "TDD 누락" }` → executor.complete_block(reject_reason="TDD 누락") 호출 | G6 | §2.4 |
| BD-210 | `test_bd210_ws_message_format_has_sequence` | broadcast 메시지가 `{ type, data, sequence, timestamp }` 포맷 준수, sequence가 단조 증가 | G1 | §2.1 |
| BD-211 | `test_bd211_ws_returns_error_when_engine_not_initialized` | event_bridge=None 상태에서 WS 접속 → `{ type: 'error', data: { message: 'Engine not initialized' } }` 수신 + 1011 close | G1 | §2.1 |
| BD-212 | `test_bd212_approve_returns_503_when_executor_none` | executor=None 상태에서 POST /approve → 503 응답 | G6 | §2.4 |
| BD-213 | `test_bd213_reject_returns_422_when_reason_empty` | POST /reject `{ reason: "" }` → 422 응답 "반려 사유는 필수입니다" | G6 | §2.4 |
| BD-214 | `test_bd214_ws_ping_pong` | WS에서 `{ action: 'ping' }` 전송 → `{ type: 'pong' }` 응답 수신 | G1 | §2.1 |

### 6.2 프론트엔드 테스트 (`dashboard/__tests__/brick/phase3-4-wiring.test.tsx`)

| ID | 테스트명 | 검증 내용 | 관련 Gap | 설계 섹션 |
|----|---------|----------|---------|----------|
| BD-215 | `test_bd215_canvas_uses_canvas_store` | BrickCanvasPage 렌더 → useCanvasStore 호출됨 (useNodesState/useEdgesState import 없음) | G4 | §3.4.1 |
| BD-216 | `test_bd216_ws_hook_mounted_in_canvas` | BrickCanvasPage 렌더 → useBrickLiveUpdates가 마운트됨 (useEffect에서 WS 연결 시도) | G3 | §3.4.2 |
| BD-217 | `test_bd217_block_event_updates_node_via_applyWsUpdate` | WS `{ type: 'block', data: { blockId: 'plan', status: 'running' } }` → canvas-store 노드 status='running', **isDirty=false** 유지 | G3, G4, G9 | §3.3, §3.4 |
| BD-218 | `test_bd218_node_border_color_all_9_statuses` | 9종 상태별 borderColor: pending=#D1D5DB, queued=#FCD34D, running=#3B82F6, gate_checking=#8B5CF6, waiting_approval=#F97316, completed=#10B981, failed=#EF4444, rejected=#DC2626, suspended=#F59E0B | G7 | §3.2 |
| BD-219 | `test_bd219_gate_pending_shows_toast` | WS gate 메시지 (gateType=approval, status=waiting) → onToast 호출 (title에 '승인' 포함) | G3 | §E2E-2 |
| BD-220 | `test_bd220_polling_intervals_removed` | useExecutionStatus에 refetchInterval 미설정, useExecutionLogs에 refetchInterval 미설정 | G5 | §3.6 |
| BD-221 | `test_bd221_ws_auto_reconnect_exponential_backoff` | WS close → 3초 후 재연결 시도, 다시 close → 6초 후, 다시 → 12초 후, max 30초 | G3 | §3.5.5 |
| BD-222 | `test_bd222_log_streaming_appends_to_cache` | WS `{ type: 'log', data: { blockId, message, level, timestamp } }` → queryClient ['brick','logs',blockId] 캐시에 추가됨 | G3 | §3.5 |
| BD-223 | `test_bd223_connection_indicator_green_when_connected` | isConnected=true → data-testid="ws-status-indicator"에 bg-green-500 클래스, 텍스트 "실시간 연결됨" | G8 | §3.4.6 |
| BD-224 | `test_bd224_connection_indicator_red_when_disconnected` | isConnected=false → data-testid="ws-status-indicator"에 bg-red-500 + animate-pulse, 텍스트 "재연결 중..." | G8 | §3.4.6 |
| BD-225 | `test_bd225_block_status_includes_new_types` | BLOCK_STATUSES 배열에 'waiting_approval', 'rejected' 포함, STATUS_BORDER_COLORS/STATUS_ICONS에 해당 키 존재 | G7 | §3.2 |
| BD-226 | `test_bd226_detail_panel_routes_waiting_approval` | nodeData.status='waiting_approval' → ApprovalPanel 렌더링됨 (data-testid="approval-panel") | G7 | §3.7 |
| BD-227 | `test_bd227_approval_callback_chain_connected` | BrickCanvasPage에서 DetailPanel의 onApprove props가 함수. 호출 시 POST /approve API 트리거 | G12 | §3.4.4 |
| BD-228 | `test_bd228_reject_callback_requires_reason` | handleReject 호출 시 reason 파라미터 포함하여 POST /reject 호출. 빈 사유 → 버튼 disabled | G12 | §3.4.4 |
| BD-229 | `test_bd229_sync_snapshot_initializes_canvas` | sync.snapshot 메시지 → applyWsSnapshot 호출, 노드 상태 일괄 반영, isDirty=false 유지 | G11 | §3.5.2 |
| BD-230 | `test_bd230_sync_replay_applies_events_sequentially` | sync.replay { events: [e1, e2, e3] } → handleMessage 3회 호출, 순서대로 적용 | G11 | §3.5.3 |

### 6.3 TDD ↔ 설계 매핑 (Gap 100% 체크)

| 설계 섹션 | 동작 | TDD ID | Gap |
|----------|------|--------|-----|
| §2.1 ws.py 접속 | WS accept + snapshot 전송 | BD-201 | G1 |
| §2.1 ws.py 메시지 포맷 | sequence 포함, 단조 증가 | BD-210 | G1 |
| §2.1 ws.py 재연결 | reconnect → replay | BD-205 | G1 |
| §2.1 ws.py 종료 | disconnect → client 제거 | BD-206 | G1 |
| §2.1 ws.py 에러 | 엔진 미초기화 시 error + close | BD-211 | G1 |
| §2.1 ws.py ping/pong | 연결 유지 | BD-214 | G1 |
| §2.2 engine_bridge | init_engine EventBridge 생성 | BD-207 | G2 |
| §2.2 EventBridge block.started | broadcast block running | BD-202 | G1, G2 |
| §2.2 EventBridge block.completed | broadcast block completed | BD-203 | G1, G2 |
| §2.2 EventBridge gate.pending | broadcast gate approval | BD-204 | G1, G2 |
| §2.4 workflows approve | executor.complete_block 호출 | BD-208 | G6 |
| §2.4 workflows reject | executor + reason 호출 | BD-209 | G6 |
| §2.4 workflows 503 에러 | executor None → 503 | BD-212 | G6 |
| §2.4 workflows 422 에러 | reason 빈칸 → 422 | BD-213 | G6 |
| §3.2 BlockStatus 확장 | 2종 추가 + 색상/아이콘 | BD-225, BD-218 | G7 |
| §3.3 canvas-store isDirty | applyWsUpdate isDirty 미변경 | BD-217 | G9 |
| §3.3 canvas-store snapshot | applyWsSnapshot isDirty 미변경 | BD-229 | G9, G11 |
| §3.4.1 canvas-store 전환 | useCanvasStore 사용 | BD-215 | G4 |
| §3.4.2 WS 마운트 | useBrickLiveUpdates 호출 | BD-216 | G3 |
| §3.4.3 폴링 제거 | refetchInterval 제거 | BD-220 | G5 |
| §3.4.4 콜백 전달 approve | onApprove 체인 연결 | BD-227 | G12 |
| §3.4.4 콜백 전달 reject | onReject + 사유 필수 | BD-228 | G12 |
| §3.4.6 연결 인디케이터 (연결) | 녹색 점 + "실시간 연결됨" | BD-223 | G8 |
| §3.4.6 연결 인디케이터 (끊김) | 빨간 점 + "재연결 중..." | BD-224 | G8 |
| §3.5.2 sync.snapshot 처리 | snapshot → 캔버스 초기화 | BD-229 | G11 |
| §3.5.3 sync.replay 처리 | replay → 순차 적용 | BD-230 | G11 |
| §3.5.5 지수 백오프 | 3s→6s→12s→max 30s | BD-221 | G3 |
| §3.5.5 last_seq 추적 | reconnect 시 last_seq 전송 | BD-205, BD-221 | G3 |
| §3.6 폴링 제거 상세 | useExecutions refetchInterval 삭제 | BD-220 | G5 |
| §3.7 DetailPanel 확장 | waiting_approval → ApprovalPanel | BD-226 | G7 |
| §E2E 토스트 알림 | gate pending → toast | BD-219 | G3 |
| §E2E 로그 스트리밍 | WS log → queryClient 캐시 | BD-222 | G3 |

**누락 동작 0건. 설계 ↔ TDD 1:1 매핑 100%. 총 30건.**

### 6.4 Gap 매핑 완전성 확인

| Gap | TDD 커버 | 누락 |
|-----|----------|------|
| G1: WS 엔드포인트 | BD-201~206, BD-210, BD-211, BD-214 (9건) | 0 |
| G2: EventBridge 연결 | BD-202~204, BD-207 (4건) | 0 |
| G3: WS 마운트 | BD-216~217, BD-219, BD-221~222 (5건) | 0 |
| G4: canvas-store 전환 | BD-215, BD-217 (2건) | 0 |
| G5: 폴링 제거 | BD-220 (1건) | 0 |
| G6: approve/reject 연결 | BD-208, BD-209, BD-212, BD-213 (4건) | 0 |
| G7: BlockStatus 불일치 | BD-218, BD-225, BD-226 (3건) | 0 |
| G8: 연결 상태 표시 | BD-223, BD-224 (2건) | 0 |
| G9: isDirty 오염 | BD-217, BD-229 (2건) | 0 |
| G10: Express WS 프록시 | §3.1 설계 (코드 설정만, 런타임 테스트 대상 아님) | N/A |
| G11: sync 메시지 | BD-229, BD-230 (2건) | 0 |
| G12: 콜백 미전달 | BD-227, BD-228 (2건) | 0 |

---

## 7. 위험 및 대응

| 위험 | 심각도 | 대응 |
|------|--------|------|
| engine 피처와 engine_bridge.py 동시 수정 | 중 | init_engine() 맨 끝에 3줄만 추가. 기존 코드 0줄 수정. CTO에 파일 경계 명시 |
| BrickCanvasPage 498줄 리팩터링 | 중 | 상태 변수 선언부만 교체 (useState → useCanvasStore). 로직 변경 최소화 |
| WS 폴링 제거 후 데이터 불일치 | 중 | WS 실패 시 queryClient staleTime이 데이터 만료 → 자동 리페치. react-query의 기본 윈도우 포커스 리페치도 작동 |
| BlockStatus 타입 추가 → 빌드 에러 | 저 | Record<BlockStatus, string> 타입이므로 tsc가 누락 키 즉시 감지 |
| isDirty 분리 → 기존 updateNodeData 사용처 확인 필요 | 중 | updateNodeData는 사용자 편집 전용으로 유지. WS만 applyWsUpdate 사용. 호출 경로 분리 |
| Express/vite WS 프록시 미작동 | 중 | vite.config.ts의 `ws: true` 옵션 확인. 프로덕션은 Cloud Run 로드밸런서가 WS 프록시 기본 지원 |

---

## 8. 롤백 전략

1. **WS 엔드포인트만 문제**: server.py에서 ws_router include 주석 처리 → WS 비활성화, 프론트는 react-query 윈도우 포커스 리페치로 동작 (useExecutions에 refetchInterval 복원)
2. **approve/reject 문제**: workflows.py의 executor 호출 제거 → 기존 파일 command 패턴으로 복구
3. **isDirty 문제**: applyWsUpdate → updateNodeData 롤백 (isDirty 경고 감수)
4. **전체 롤백**: git revert — 변경 파일 12개 모두 additive/교체이므로 충돌 없음

---

## 9. 기존 설계 참조 및 정합성

| 문서 | 관계 | 충돌 |
|------|------|------|
| brick-dashboard-ux-improve.design.md | 상위 UX Design — 본 문서는 그 중 P3+P4 wiring | 없음 |
| brick-dashboard.design.md | API 백엔드 — BD-57~63 EventBridge, BD-132~140 ReviewBlock | 없음 (테스트 유지) |
| brick-dashboard-frontend.design.md | 초기 프론트 구현 | 없음 (additive 변경) |
| brick-architecture.design.md | 엔진 아키텍처 — EventBus/executor 인터페이스 참조 | 없음 |
| ADR-001 | 계정 종속 원칙 — WS에 해당 없음 (워크플로우 범위) | 없음 |
| ADR-002 | 서비스 맥락 — 대시보드 실시간 기능 추가 | 없음 |

---

## 10. 성공 기준 (Do 완료 판정)

- [ ] `npx tsc --noEmit --quiet` — 타입 에러 0개
- [ ] `npm run build` — 빌드 성공
- [ ] BD-201 ~ BD-214 (백엔드 14건) — 전체 PASS
- [ ] BD-215 ~ BD-230 (프론트 16건) — 전체 PASS
- [ ] 기존 테스트 BD-57~63, BD-132~140 — 전체 PASS 유지
- [ ] WS 접속 후 블록 상태 변경 반영 < 1초
- [ ] 승인 버튼 → 다음 블록 진행 확인
- [ ] 반려 버튼 → 사유 필수 + 루프백 확인
- [ ] isDirty가 WS 업데이트에 의해 true로 변경되지 않음
- [ ] WS 끊김 후 지수 백오프 재연결 작동

---

## v1 → v2 변경 이력

| 항목 | v1 | v2 | 이유 |
|------|-----|-----|------|
| TDD ID | DP3-01~24 | BD-201~230 | 프로젝트 BD-XXX 규약 준수 |
| TDD 건수 | 24건 | 30건 | 에러 처리(BD-211~213), isDirty(BD-217,229), 콜백(BD-227,228), sync(BD-229,230) 추가 |
| isDirty | 미처리 | applyWsUpdate/applyWsSnapshot 분리 | WS 업데이트가 "저장하지 않은 변경" 경고 유발 방지 |
| Express WS 프록시 | 누락 | §3.1 추가 | 프론트 → 백엔드 WS 연결 경로 명시 |
| sync 메시지 | BrickWsMessage 미포함 | sync.snapshot + sync.replay 타입 추가 | 초기 상태 동기화 + 재연결 이벤트 재생 |
| onApprove/onReject | BrickCanvasPage 미전달 | §3.4.4 콜백 체인 명시 | 승인/반려 버튼 클릭이 실제 API 호출로 이어지지 않는 버그 방지 |
| reject 검증 | 없음 | 서버 422 + 프론트 disabled | 빈 사유로 반려 방지 |
| ping/pong | 없음 | §2.1 추가 | 프록시/로드밸런서 idle 타임아웃 방지 |
