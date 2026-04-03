# Brick Sprint 2: 엔진 동기화 + Adapter 연결 + 실시간 표시 Design

> **피처**: brick-sprint2-engine-sync
> **레벨**: L2 (3개 Step 통합)
> **작성**: PM | 2026-04-04
> **선행**: brick-bugfix-sprint1.design.md (Phase 1~2 완료 전제)

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **DB** | SQLite (better-sqlite3 + drizzle-orm) |
| **Express 포트** | 3200 |
| **Python 엔진 포트** | 3202 |
| **프론트 dev 포트** | 3201 |
| **WebSocket (기존)** | `realtime/ws.ts` — eventBus 전체 브로드캐스트 (Brick 이벤트 미정의) |
| **WebSocket (미사용)** | `routes/brick/websocket.ts` — 스텁, 미마운트, 미호출 |
| **캔버스 폴링** | `useExecutionStatus` 3초, `useExecutionLogs` 5초 (React Query) |
| **어댑터** | claude_agent_teams: MCP + tmux 폴백 구현됨, adapter_pool 미주입 (Sprint1에서 수정) |

---

## 1. 현재 상태 분석

### 1.1 데이터 흐름 (AS-IS)

```
                    HTTP 요청 시만
React ──3초 폴링──→ Express(SQLite) ──────→ Python 엔진
                         ↑                       │
                         │     HTTP 응답에        │
                         └─────blocksState 포함───┘
                    
                    ❌ 엔진 → Express 푸시 없음
                    ❌ Express → React 푸시 없음
```

### 1.2 핵심 갭 3가지

| # | 갭 | 영향 |
|---|-----|------|
| GAP-1 | Python 엔진 → Express 푸시 채널 없음 | 어댑터가 자동 완료해도 Express DB 미갱신 |
| GAP-2 | Express → React 푸시 없음 (폴링만) | 3초 지연, 상태 전이 순간 놓침 |
| GAP-3 | adapter_pool 미주입 (Sprint1 BRK-QA-002) | 블록 시작 자체가 no-op |

### 1.3 이미 있는 것 (재사용)

| 컴포넌트 | 상태 | 재사용 |
|----------|------|--------|
| `EngineBridge` (bridge.ts) | 8개 메서드 완성 | ✅ 그대로 사용 |
| `claude_agent_teams.py` | MCP+tmux 구현 완료 | ✅ adapter_pool에 연결만 |
| `realtime/ws.ts` | eventBus→WebSocket 브로드캐스트 | ✅ Brick 이벤트 타입 추가만 |
| `BrickCanvasPage.tsx` | 노드 색상 매핑 + STATUS_BORDER_COLORS | ✅ 데이터 소스만 WebSocket으로 교체 |
| `CheckpointStore` | 파일 기반 워크플로우 상태 저장 | ✅ 폴링 대상으로 사용 |

---

## 2. 아키텍처 (TO-BE)

```
React ←── WebSocket ──── Express(SQLite) ←── 폴링(5초) ──── Python 엔진
  │                          │                                    │
  │    useExecutionWs()      │    EnginePoller                   │
  │    (실시간 상태)          │    (bridge.getStatus)             │
  │                          │    → DB 갱신 → eventBus 발행      │
  └──── HTTP (수동 조작) ────┘──── HTTP (complete-block) ────────┘
```

### 2.1 핵심 결정

| 결정 | 근거 |
|------|------|
| **Express가 Python 폴링** (Python→Express 웹훅 아님) | Python 엔진은 순수 연산. 웹훅 추가는 엔진 변경 최소화 원칙 위반 |
| **기존 `realtime/ws.ts` 활용** (새 WebSocket 안 만듦) | 이미 eventBus→클라이언트 파이프라인 구축됨. 이벤트 타입 추가만 |
| **`brick/websocket.ts` 삭제** | 스텁 데드코드. 기존 ws.ts로 통합 |
| **폴링 주기 5초** | 3초는 과도, 10초는 UX 손실. 5초 타협 |

---

## 3. Step 1: 대시보드 ↔ 엔진 데이터 동기화

### 3.1 Express → Python (다운스트림)

이미 동작함. `bridge.startWorkflow()`, `bridge.completeBlock()` 등 HTTP 호출로 엔진에 지시.

**추가 필요**: 팀/블록타입/프리셋 동기화는 불필요. Python 엔진은 `PresetLoader`로 YAML 직접 읽음. Express DB와 Python YAML은 동일 소스(`.bkit/presets/`).

### 3.2 Python → Express (업스트림) — EnginePoller

**파일**: `dashboard/server/brick/engine/poller.ts` (신규)

```typescript
import { EngineBridge } from './bridge.js';
import { db } from '../../db/index.js';
import { brickExecutions } from '../../db/schema/brick.js';
import { eq } from 'drizzle-orm';
import { eventBus } from '../../realtime/event-bus.js';

const POLL_INTERVAL = 5000; // 5초

export class EnginePoller {
  private bridge = new EngineBridge();
  private timer: NodeJS.Timeout | null = null;

  start(): void {
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL);
    console.log('[engine-poller] 시작 — 5초 간격');
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async poll(): Promise<void> {
    // 실행 중인 워크플로우만 조회
    const running = db.select().from(brickExecutions)
      .where(eq(brickExecutions.status, 'running')).all();

    for (const exec of running) {
      if (!exec.engineWorkflowId) continue;

      try {
        const result = await this.bridge.getStatus(exec.engineWorkflowId);
        if (!result.ok || !result.data) continue;

        const newBlocksState = JSON.stringify(result.data.blocks_state);
        const oldBlocksState = typeof exec.blocksState === 'string' 
          ? exec.blocksState : JSON.stringify(exec.blocksState);

        // 변경 감지
        if (newBlocksState !== oldBlocksState) {
          const allCompleted = Object.values(result.data.blocks_state).every(
            (b: { status: string }) => b.status === 'completed'
          );

          db.update(brickExecutions).set({
            blocksState: newBlocksState,
            currentBlock: result.data.current_block_id,
            status: allCompleted ? 'completed' : result.data.status,
            ...(allCompleted ? { completedAt: new Date().toISOString() } : {}),
          }).where(eq(brickExecutions.id, exec.id)).run();

          // eventBus로 변경 알림 → WebSocket으로 브로드캐스트
          eventBus.emit('brick.execution.updated', {
            executionId: exec.id,
            blocksState: result.data.blocks_state,
            currentBlock: result.data.current_block_id,
            status: allCompleted ? 'completed' : result.data.status,
          });

          // 블록별 상태 변경 이벤트
          const oldState = JSON.parse(oldBlocksState || '{}');
          for (const [blockId, blockData] of Object.entries(result.data.blocks_state)) {
            const newStatus = (blockData as { status: string }).status;
            const oldStatus = oldState[blockId]?.status;
            if (newStatus !== oldStatus) {
              eventBus.emit('brick.block.changed', {
                executionId: exec.id,
                blockId,
                oldStatus,
                newStatus,
              });
            }
          }
        }
      } catch (e) {
        // 엔진 미응답 시 조용히 스킵
      }
    }
  }
}
```

### 3.3 서버 마운트

`dashboard/server/index.ts`:

```typescript
import { EnginePoller } from './brick/engine/poller.js';

// 서버 시작 시
const enginePoller = new EnginePoller();
enginePoller.start();

// 서버 종료 시
process.on('SIGTERM', () => enginePoller.stop());
```

### 3.4 eventBus 이벤트 타입 추가

`dashboard/server/realtime/event-bus.ts`:

```typescript
// 기존 이벤트 타입에 추가
type EventType = 
  | 'agent.status' | 'agent.cost' | ... // 기존
  | 'brick.execution.updated'    // 실행 상태 변경
  | 'brick.block.changed'        // 블록 상태 변경
  | 'brick.workflow.completed'   // 워크플로우 완료
  | 'brick.gate.result';         // 게이트 결과
```

### 3.5 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| S2-01 | `test_s2_01_poller_detects_change` | blocksState 변경 감지 | DB 갱신 + eventBus 발행 |
| S2-02 | `test_s2_02_poller_skips_unchanged` | 상태 동일 시 | DB 미갱신, eventBus 미발행 |
| S2-03 | `test_s2_03_poller_handles_engine_down` | 엔진 미응답 | 에러 없이 스킵 |
| S2-04 | `test_s2_04_poller_completes_workflow` | 전체 블록 completed | status=completed, completedAt 설정 |
| S2-05 | `test_s2_05_block_changed_event` | 블록별 상태 변경 | brick.block.changed 이벤트 발행 |

---

## 4. Step 2: Adapter 실연결

### 4.1 현재 상태

Sprint1 BRK-QA-002 수정으로 `adapter_pool`이 주입됨. `claude_agent_teams.py`는 MCP+tmux 구현 완료.

**남은 작업**: `start_block`이 반환하는 `execution_id`를 `check_status`로 폴링하는 루프 연결.

### 4.2 Adapter 실행 흐름 (TO-BE)

```
1. Express → bridge.startWorkflow() → Python executor.start()
2. executor._execute_command(StartBlockCommand) 
3.   → adapter_pool["claude_agent_teams"].start_block(block, context)
4.   → MCP send_message or tmux send-keys
5.   → execution_id 저장
6. EnginePoller (5초) → bridge.getStatus() → blocks_state 변경 감지
7.   → eventBus.emit("brick.block.changed") → WebSocket → React
```

### 4.3 adapter context 보강

현재 `start_block`에 전달되는 context가 `{"workflow_id": instance.id}`뿐. 블록 정보 추가:

`brick/brick/engine/executor.py` — `_execute_command` 수정:

```python
# AS-IS (line 329)
execution_id = await adapter.start_block(block_inst.block, {"workflow_id": instance.id})

# TO-BE
execution_id = await adapter.start_block(block_inst.block, {
    "workflow_id": instance.id,
    "block_id": block_inst.block.id,
    "block_what": block_inst.block.what,
    "block_type": block_inst.block.type,
    "project_context": instance.context,
})
```

### 4.4 완료 감지 — Adapter 폴링 루프

Python 엔진에 `auto_advance` 루프 추가. 어댑터가 블록을 시작한 후, 주기적으로 `check_status`를 호출하여 완료 감지:

`brick/brick/engine/executor.py` — `start()` 메서드 끝에 추가:

```python
async def _monitor_block(self, instance: WorkflowInstance, block_id: str):
    """어댑터 완료 폴링. 10초 간격으로 check_status 호출."""
    block_inst = instance.blocks.get(block_id)
    if not block_inst or not block_inst.execution_id:
        return

    adapter = self.adapter_pool.get(block_inst.adapter)
    if not adapter:
        return

    while block_inst.status == BlockStatus.RUNNING:
        await asyncio.sleep(10)
        try:
            status = await adapter.check_status(block_inst.execution_id)
            if status.status == "completed":
                await self.complete_block(
                    instance.id,
                    block_id,
                    metrics=status.metrics or {},
                    artifacts=status.artifacts or [],
                )
                break
            elif status.status == "failed":
                event = Event(type="block.failed", data={
                    "block_id": block_id,
                    "error": status.error or "Adapter reported failure",
                })
                instance, _ = self.state_machine.transition(instance, event)
                self.checkpoint.save(instance.id, instance)
                break
        except Exception:
            pass  # 다음 폴링에서 재시도

        # 최신 상태 재로드
        instance = self.checkpoint.load(instance.id)
        if not instance:
            break
        block_inst = instance.blocks.get(block_id)
        if not block_inst:
            break
```

`_execute_command`에서 `start_block` 성공 후 모니터링 태스크 시작:

```python
if isinstance(cmd, StartBlockCommand):
    adapter = self.adapter_pool.get(cmd.adapter)
    if adapter:
        block_inst = instance.blocks.get(cmd.block_id)
        if block_inst:
            execution_id = await adapter.start_block(
                block_inst.block,
                {"workflow_id": instance.id, "block_id": cmd.block_id, ...}
            )
            block_inst.execution_id = execution_id
            # 모니터링 태스크 시작 (비동기)
            asyncio.create_task(self._monitor_block(instance, cmd.block_id))
```

### 4.5 tmux 세션명 규칙

`claude_agent_teams.py`의 `_start_via_tmux`가 사용하는 세션명:

```python
# 현재: self.config.get("tmux_session", "brick")
# 권장: 팀 ID + 블록 ID 기반
session_name = f"brick-{context.get('block_id', 'default')}"
```

### 4.6 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| S2-06 | `test_s2_06_start_block_calls_adapter` | StartBlockCommand → adapter.start_block | 호출됨, execution_id 저장 |
| S2-07 | `test_s2_07_adapter_context_enriched` | start_block context 내용 | block_id, block_what 포함 |
| S2-08 | `test_s2_08_monitor_detects_completion` | check_status → completed | complete_block 자동 호출 |
| S2-09 | `test_s2_09_monitor_detects_failure` | check_status → failed | block.failed 이벤트 |
| S2-10 | `test_s2_10_tmux_session_name` | tmux 세션명 | brick-{block_id} 형식 |

---

## 5. Step 3: 실시간 상태 표시

### 5.1 기존 WebSocket 활용

`dashboard/server/realtime/ws.ts`가 이미 `eventBus.subscribe('*', ...)` 패턴으로 전체 브로드캐스트. Step 1에서 추가한 `brick.*` 이벤트가 자동으로 WebSocket에 전달됨. 추가 코드 불필요.

### 5.2 `brick/websocket.ts` 삭제

스텁 데드코드. `createBrickWebSocket`은 미호출, `broadcast`는 미임포트. 삭제.

### 5.3 프론트엔드 — WebSocket Hook

`dashboard/src/hooks/brick/useExecutionWs.ts` (신규):

```typescript
import { useEffect, useCallback, useRef } from 'react';

interface BlockChangedEvent {
  executionId: number;
  blockId: string;
  oldStatus: string;
  newStatus: string;
}

interface ExecutionUpdatedEvent {
  executionId: number;
  blocksState: Record<string, { status: string }>;
  currentBlock: string;
  status: string;
}

export function useExecutionWs(
  executionId: number | null,
  onBlockChanged?: (e: BlockChangedEvent) => void,
  onExecutionUpdated?: (e: ExecutionUpdatedEvent) => void,
) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!executionId) return;

    const ws = new WebSocket(`ws://${window.location.host}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'brick.block.changed' && msg.data?.executionId === executionId) {
          onBlockChanged?.(msg.data);
        }
        if (msg.type === 'brick.execution.updated' && msg.data?.executionId === executionId) {
          onExecutionUpdated?.(msg.data);
        }
      } catch {}
    };

    return () => ws.close();
  }, [executionId]);
}
```

### 5.4 BrickCanvasPage 연동

`dashboard/src/pages/brick/BrickCanvasPage.tsx` 수정:

```typescript
import { useExecutionWs } from '../../hooks/brick/useExecutionWs';

// 컴포넌트 내부:
const [blocksState, setBlocksState] = useState<Record<string, { status: string }>>({});

// WebSocket으로 실시간 수신
useExecutionWs(
  executionId,
  // 블록 변경 시 — 노드 색상 즉시 업데이트
  (e) => {
    setBlocksState(prev => ({
      ...prev,
      [e.blockId]: { ...prev[e.blockId], status: e.newStatus },
    }));
  },
  // 전체 상태 업데이트 시
  (e) => {
    setBlocksState(e.blocksState);
  },
);

// 기존 useExecutionStatus 3초 폴링 → refetchInterval 제거 또는 30초로 늘림 (폴백)
// WebSocket이 주, 폴링은 보험
```

### 5.5 노드 색상 매핑 (기존 유지)

```typescript
const STATUS_BORDER_COLORS: Record<string, string> = {
  pending: '#9CA3AF',
  queued: '#F59E0B',
  running: '#3B82F6',
  gate_checking: '#8B5CF6',
  waiting_approval: '#F97316',
  completed: '#10B981',
  failed: '#EF4444',
  rejected: '#DC2626',
  suspended: '#6B7280',
};
```

이미 구현됨. WebSocket에서 `blocksState`를 받아 `styledNodes`의 `data.status`가 갱신되면 자동 반영.

### 5.6 TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| S2-11 | `test_s2_11_ws_receives_block_changed` | WebSocket brick.block.changed 수신 | 콜백 호출 |
| S2-12 | `test_s2_12_ws_updates_node_color` | blocksState → styledNodes | 색상 변경 |
| S2-13 | `test_s2_13_ws_filters_execution_id` | 다른 executionId 메시지 | 무시 |
| S2-14 | `test_s2_14_polling_fallback` | WebSocket 미연결 시 | 폴링으로 갱신 |

---

## 6. 파일 변경 목록

| 파일 | 변경 유형 | Step | 내용 |
|------|----------|------|------|
| `dashboard/server/brick/engine/poller.ts` | 신규 | 1 | EnginePoller (5초 폴링) |
| `dashboard/server/realtime/event-bus.ts` | 수정 | 1 | brick.* 이벤트 타입 추가 |
| `dashboard/server/index.ts` | 수정 | 1 | EnginePoller 마운트 |
| `dashboard/server/routes/brick/websocket.ts` | 삭제 | 3 | 데드코드 제거 |
| `brick/brick/engine/executor.py` | 수정 | 2 | context 보강 + _monitor_block |
| `dashboard/src/hooks/brick/useExecutionWs.ts` | 신규 | 3 | WebSocket Hook |
| `dashboard/src/pages/brick/BrickCanvasPage.tsx` | 수정 | 3 | WebSocket 연동 + 폴링 주기 변경 |
| `dashboard/__tests__/brick/sprint2-sync.test.ts` | 신규 | 전체 | TDD 14건 |

---

## 7. TDD 총괄

| Step | TDD ID | 건수 |
|------|--------|------|
| Step 1: 동기화 | S2-01 ~ S2-05 | 5건 |
| Step 2: Adapter | S2-06 ~ S2-10 | 5건 |
| Step 3: 실시간 | S2-11 ~ S2-14 | 4건 |
| **합계** | | **14건** |

---

## 8. 불변식

| ID | 규칙 | 검증 |
|----|------|------|
| INV-S2-1 | EnginePoller는 running 상태 실행만 폴링해야 함 | S2-02 |
| INV-S2-2 | blocksState 변경 시 eventBus 이벤트 반드시 발행 | S2-01 |
| INV-S2-3 | 어댑터 완료 감지 후 complete_block 자동 호출 | S2-08 |
| INV-S2-4 | WebSocket 메시지는 해당 executionId만 필터 | S2-13 |
| INV-S2-5 | 엔진 미응답 시 폴러는 에러 없이 스킵 | S2-03 |

---

*Design 끝 — 3-Step 통합: 폴링 동기화 + Adapter 모니터링 + WebSocket 실시간 표시*
