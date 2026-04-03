# Brick Engine Bridge Design

> **피처**: brick-engine-bridge (Express→Python 엔진 연결)
> **레벨**: L2 (구조 변경 + API 수정)
> **작성**: PM | 2026-04-03
> **선행**: brick-system-map.md, brick-problem-definition-2026-04-03.report.md, brick-integration-status.md
> **해결 대상**: P-STRUCT-1, P-CONN-1, P-CONN-2, P-CONN-3, P-FEAT-5

---

## 1. 문제 정의

### 1.1 핵심 문제

Python 엔진(StateMachine + Gate 10종 + Link 7종 + Adapter 8종, 374건 테스트)이 완성돼 있으나,
Express 백엔드(`executions.ts`)가 이 엔진을 **무시하고 직접 DB에 상태를 쓰고 있다**.

```
현재: 화면 → Express(executions.ts) → DB 직접 상태 쓰기
       ↳ Gate 검증 안 함 (불량품 통과)
       ↳ Link 분기 안 함 (무조건 다음 블록)
       ↳ Adapter 호출 안 함 (팀 자동 전달 불가)
       ↳ Context 저장 안 됨 (블록 간 산출물 공유 불가)
```

### 1.2 설계 방향 (Smith님 승인)

Express는 CRUD/UI용 창구로 유지. **실행(executions)만 Python 엔진을 거치도록** 재설계.

```
목표: 화면 → Express → Python 엔진(HTTP) → Gate/Link/Adapter 처리 → DB 동기화
```

### 1.3 해결 대상 문제 목록

| 문제 ID | 내용 | 이 Design의 해법 |
|---------|------|-----------------|
| P-STRUCT-1 | 이중 런타임 — Python 엔진 미사용 | Express→Python HTTP 브릿지 |
| P-CONN-1 | seed 미연결 → DB 비어있음 | seed.ts에 seedBrick(db) 추가 |
| P-CONN-2 | Hook↔API 불일치 5건 | API 3개 추가 + 파라미터 2개 통일 |
| P-CONN-3 | executions GET 목록 없음 | GET /api/brick/executions 추가 |
| P-FEAT-5 | 이중 구현 5건 | 역할 단일화 — Python=실행, Express=CRUD |

---

## 2. 아키텍처

### 2.1 변경 전후 비교

```
─── 변경 전 ──────────────────────────────────────────
                                    
  React ──→ Express(executions.ts) ──→ SQLite
                │
                ├─ POST /executions     → DB INSERT + 첫 블록 queued
                ├─ POST /:id/blocks/:b/complete → blocksState 직접 변경
                └─ POST /:id/pause      → status='paused'
                
  Python 엔진 (사용 안 함)

─── 변경 후 ──────────────────────────────────────────

  React ──→ Express(executions.ts) ──→ Python FastAPI ──→ Engine
                │                           │
                │                           ├─ StateMachine.transition()
                │                           ├─ GateExecutor.run_gates()
                │                           ├─ condition_evaluator.evaluate()
                │                           └─ TeamAdapter.start_block()
                │                           │
                └── DB 동기화 ←────────────┘
                    (Express가 Python 응답으로 DB 업데이트)
```

### 2.2 역할 분담 원칙

| 시스템 | 역할 | 하는 일 | 하지 않는 일 |
|--------|------|---------|-------------|
| **Express** | CRUD 게이트웨이 | DB 읽기/쓰기, 프론트 API, 인증 | 상태 전이, Gate 실행, Link 분기 |
| **Python Engine** | 실행 엔진 | 상태 전이, Gate/Link/Adapter, Context 관리 | DB 직접 접근, 프론트 API 제공 |
| **SQLite** | 단일 저장소 | 실행 이력, blocksState, 로그 | — |

### 2.3 Python FastAPI 엔진 API (신규)

Python 대시보드(`brick/brick/dashboard/server.py`)에 **실행 전용 라우터** 추가.
기존 `workflows.py`(파일 기반)와 별도로, Express가 호출하는 HTTP API.

**파일**: `brick/brick/dashboard/routes/engine_bridge.py` (신규)

```python
from fastapi import APIRouter

router = APIRouter(prefix="/engine", tags=["engine-bridge"])
```

---

## 3. Express → Python 엔진 HTTP 브릿지 규격

### 3.1 Python 엔진 API 엔드포인트

#### EP-1: 워크플로우 시작

```
POST /api/v1/engine/start
```

**Request**:
```json
{
  "preset_name": "t-pdca-l2",
  "feature": "brick-engine-bridge",
  "task": "엔진 브릿지 구현"
}
```

**처리 흐름**:
1. `PresetLoader.load(preset_name)` — YAML 로드 + spec wrapper 해제
2. `Validator.validate_workflow(definition)` — INV-1~8 검증 + DAG 순환 검사
3. `WorkflowInstance.from_definition(definition, feature, task)` — 인스턴스 생성
4. `StateMachine.transition(instance, Event("workflow.start"))` — 첫 블록 QUEUED
5. `CheckpointStore.save(instance)` — 파일 시스템 체크포인트

**Response** (200):
```json
{
  "workflow_id": "wf-20260403-abc123",
  "status": "running",
  "current_block_id": "plan",
  "blocks_state": {
    "plan": { "status": "queued", "started_at": null },
    "design": { "status": "pending", "started_at": null },
    "do": { "status": "pending", "started_at": null },
    "check": { "status": "pending", "started_at": null },
    "review": { "status": "pending", "started_at": null },
    "learn": { "status": "pending", "started_at": null }
  },
  "context": {},
  "definition": {
    "name": "t-pdca-l2",
    "blocks": [...],
    "links": [...],
    "teams": {...}
  }
}
```

**에러 응답**:
| HTTP | 상황 | body |
|------|------|------|
| 404 | 프리셋 없음 | `{"error": "preset_not_found", "detail": "Preset t-pdca-l2 not found"}` |
| 422 | 검증 실패 | `{"error": "validation_failed", "detail": ["INV-3: DAG cycle detected"]}` |

#### EP-2: 블록 완료

```
POST /api/v1/engine/complete-block
```

**Request**:
```json
{
  "workflow_id": "wf-20260403-abc123",
  "block_id": "plan",
  "metrics": { "match_rate": 95, "artifacts_count": 3 },
  "artifacts": ["docs/01-plan/features/brick-engine-bridge.plan.md"]
}
```

**처리 흐름**:
1. `CheckpointStore.load(workflow_id)` — 인스턴스 복원
2. `StateMachine.transition(instance, Event("block.completed"))` → RUNNING→GATE_CHECKING
3. `GateExecutor.run_gates(block_instance, context)` — Gate 10종 중 해당 Gate 실행
4. `instance.context.update(gate_result.metrics)` — 메트릭을 컨텍스트에 반영
5. Gate 통과 시: `StateMachine.transition(Event("block.gate_passed"))` → COMPLETED
6. `_find_next_blocks()` — Link type/condition 평가로 다음 블록 결정
7. 다음 블록 QUEUED + `StartBlockCommand` 발행
8. `CheckpointStore.save(instance)` — 체크포인트 업데이트

**Response** (200):
```json
{
  "workflow_id": "wf-20260403-abc123",
  "block_id": "plan",
  "block_status": "completed",
  "gate_result": {
    "passed": true,
    "type": "command",
    "detail": "tsc + build 통과",
    "metrics": { "match_rate": 95 }
  },
  "next_blocks": ["design"],
  "blocks_state": {
    "plan": { "status": "completed", "completed_at": "..." },
    "design": { "status": "queued", "started_at": null },
    "do": { "status": "pending" },
    "check": { "status": "pending" },
    "review": { "status": "pending" },
    "learn": { "status": "pending" }
  },
  "context": { "match_rate": 95 }
}
```

**Gate 실패 시** (200, gate_result.passed=false):
```json
{
  "block_id": "check",
  "block_status": "gate_checking",
  "gate_result": {
    "passed": false,
    "type": "command",
    "detail": "match_rate 85 < 90",
    "metrics": { "match_rate": 85 }
  },
  "next_blocks": ["do"],
  "blocks_state": {
    "check": { "status": "completed" },
    "do": { "status": "queued" }
  },
  "context": { "match_rate": 85, "_loop_check_do": 1 }
}
```

> **PM 판단**: Gate 실패 시에도 HTTP 200 반환. `gate_result.passed`로 판별.
> 4xx/5xx는 시스템 오류에만 사용. Gate 실패는 **정상적인 비즈니스 흐름**.

#### EP-3: 워크플로우 상태 조회

```
GET /api/v1/engine/status/{workflow_id}
```

**Response** (200):
```json
{
  "workflow_id": "wf-20260403-abc123",
  "status": "running",
  "current_block_id": "design",
  "blocks_state": { ... },
  "context": { "match_rate": 95 },
  "events": [
    { "type": "workflow.start", "timestamp": "..." },
    { "type": "block.started", "data": { "block_id": "plan" }, "timestamp": "..." },
    { "type": "block.completed", "data": { "block_id": "plan" }, "timestamp": "..." }
  ]
}
```

#### EP-4: 워크플로우 일시정지

```
POST /api/v1/engine/suspend/{workflow_id}
```

**Response** (200):
```json
{
  "workflow_id": "wf-20260403-abc123",
  "status": "suspended"
}
```

#### EP-5: 워크플로우 재개

```
POST /api/v1/engine/resume/{workflow_id}
```

#### EP-6: 워크플로우 취소

```
POST /api/v1/engine/cancel/{workflow_id}
```

#### EP-7: 헬스체크

```
GET /api/v1/engine/health
```

**Response** (200):
```json
{
  "status": "ok",
  "engine_version": "0.1.0",
  "presets_loaded": 4,
  "active_workflows": 1
}
```

### 3.2 Express → Python 호출 클라이언트

**파일**: `dashboard/server/brick/engine/bridge.ts` (신규)

```typescript
interface BridgeConfig {
  baseUrl: string;          // default: "http://localhost:8100"
  timeout: number;          // default: 30000 (30초)
  retryCount: number;       // default: 2
  retryDelay: number;       // default: 1000 (1초)
  healthCheckInterval: number; // default: 30000 (30초)
}

interface EngineResponse<T> {
  ok: boolean;
  data?: T;
  error?: { error: string; detail: string | string[] };
}

class EngineBridge {
  private config: BridgeConfig;
  private healthy: boolean = false;
  private healthCheckTimer: NodeJS.Timer | null = null;

  constructor(config?: Partial<BridgeConfig>);

  // 핵심 메서드
  async startWorkflow(presetName: string, feature: string, task: string): Promise<EngineResponse<StartResult>>;
  async completeBlock(workflowId: string, blockId: string, metrics?: Record<string, unknown>, artifacts?: string[]): Promise<EngineResponse<CompleteResult>>;
  async getStatus(workflowId: string): Promise<EngineResponse<StatusResult>>;
  async suspendWorkflow(workflowId: string): Promise<EngineResponse<SuspendResult>>;
  async resumeWorkflow(workflowId: string): Promise<EngineResponse<ResumeResult>>;
  async cancelWorkflow(workflowId: string): Promise<EngineResponse<CancelResult>>;

  // 헬스체크
  async checkHealth(): Promise<boolean>;
  startHealthMonitor(): void;
  stopHealthMonitor(): void;
  isHealthy(): boolean;

  // 내부
  private async request<T>(method: string, path: string, body?: unknown): Promise<EngineResponse<T>>;
  private async retry<T>(fn: () => Promise<T>, retries: number): Promise<T>;
}
```

### 3.3 Express executions.ts 수정 규격

현재 `executions.ts` (185줄)의 5개 엔드포인트를 **Python 엔진 프록시**로 전환.

#### POST /api/brick/executions — 실행 시작 (수정)

```typescript
// 변경 전: DB에 직접 INSERT + 첫 블록 queued
// 변경 후: Python 엔진 호출 → 결과로 DB 동기화

app.post('/api/brick/executions', async (req, res) => {
  const { presetId, feature } = req.body;

  // 1. 프리셋에서 name 조회 (Express DB)
  const preset = db.select().from(brickPresets)
    .where(eq(brickPresets.id, Number(presetId))).get();
  if (!preset) return res.status(404).json({ error: '프리셋 없음' });

  // 2. Python 엔진에 실행 요청
  const result = await bridge.startWorkflow(preset.name, feature, feature);
  if (!result.ok) {
    // 엔진 호출 실패 시 fallback (§6 에러 시나리오)
    return res.status(502).json({
      error: 'engine_unavailable',
      detail: result.error?.detail,
    });
  }

  // 3. 엔진 응답으로 DB 동기화
  const execution = db.insert(brickExecutions).values({
    presetId: Number(presetId),
    feature,
    status: result.data.status,
    currentBlock: result.data.current_block_id,
    blocksState: JSON.stringify(result.data.blocks_state),
    startedAt: new Date().toISOString(),
  }).returning().get();

  // 4. 엔진 workflow_id를 execution에 매핑 (context에 저장)
  db.insert(brickExecutionLogs).values({
    executionId: execution.id,
    eventType: 'engine.mapped',
    data: { engine_workflow_id: result.data.workflow_id },
  }).run();

  res.status(201).json({ ...execution, engineWorkflowId: result.data.workflow_id });
});
```

#### POST /api/brick/executions/:id/blocks/:blockId/complete — 블록 완료 (수정)

```typescript
// 변경 전: blocksState[blockId].status = 'completed' 직접 변경
// 변경 후: Python 엔진에 complete-block 요청 → Gate/Link 처리된 결과로 DB 동기화

app.post('/api/brick/executions/:id/blocks/:blockId/complete', async (req, res) => {
  const execution = db.select()...;
  
  // 1. 엔진 workflow_id 조회
  const mappingLog = db.select().from(brickExecutionLogs)
    .where(...)
    .all()
    .find(l => l.eventType === 'engine.mapped');
  const engineWorkflowId = mappingLog?.data?.engine_workflow_id;

  // 2. Python 엔진에 블록 완료 요청
  const { metrics, artifacts } = req.body || {};
  const result = await bridge.completeBlock(
    engineWorkflowId, req.params.blockId, metrics, artifacts
  );

  if (!result.ok) {
    return res.status(502).json({ error: 'engine_unavailable' });
  }

  // 3. 엔진 결과로 DB 동기화
  //    - blocksState: 엔진이 결정한 전체 상태 (Gate/Link 반영됨)
  //    - gate_result: Gate 검증 결과 저장
  //    - next_blocks: 다음 블록 정보
  db.update(brickExecutions)
    .set({
      blocksState: JSON.stringify(result.data.blocks_state),
      currentBlock: result.data.next_blocks[0] || execution.currentBlock,
      status: result.data.blocks_state에서 모든 블록 completed면 'completed' 아니면 'running',
    })
    .where(eq(brickExecutions.id, execution.id))
    .run();

  // 4. Gate 결과 저장
  if (result.data.gate_result) {
    db.insert(brickGateResults).values({
      executionId: execution.id,
      blockId: req.params.blockId,
      handlerType: result.data.gate_result.type,
      passed: result.data.gate_result.passed,
      detail: result.data.gate_result,
    }).run();
  }

  // 5. 이벤트 로그
  db.insert(brickExecutionLogs).values({
    executionId: execution.id,
    eventType: 'block.completed',
    blockId: req.params.blockId,
    data: {
      gate_result: result.data.gate_result,
      next_blocks: result.data.next_blocks,
      context: result.data.context,
    },
  }).run();

  res.json({
    blocksState: result.data.blocks_state,
    gateResult: result.data.gate_result,
    nextBlocks: result.data.next_blocks,
  });
});
```

#### 기존 유지 엔드포인트 (변경 최소)

| 엔드포인트 | 변경 | 이유 |
|-----------|------|------|
| `GET /api/brick/executions/:id` | 없음 | DB 조회만. 엔진 무관 |
| `GET /api/brick/executions/:id/logs` | 없음 | DB 조회만 |
| `POST /api/brick/executions/:id/pause` | 엔진 suspend 호출 추가 | 엔진 상태도 동기화 |

### 3.4 Express ↔ Python ID 매핑

Express DB의 `execution.id` (integer, autoIncrement)와
Python 엔진의 `workflow_id` (string, "wf-{date}-{hash}")는 **다른 ID 체계**.

매핑 방식: `brickExecutionLogs`에 `eventType='engine.mapped'`로 기록.

```
brickExecutionLogs:
  executionId: 1
  eventType: 'engine.mapped'
  data: { "engine_workflow_id": "wf-20260403-abc123" }
```

조회 시: `executionLogs.find(l => l.eventType === 'engine.mapped')`.

> **PM 판단**: `brickExecutions` 테이블에 `engineWorkflowId` 컬럼을 추가하는 방안도 검토했으나,
> 스키마 변경 최소화를 위해 로그 기반 매핑 채택. 성능 문제 발생 시 컬럼 추가로 전환.

---

## 4. Seed 연결

### 4.1 문제

`seed-brick.ts`에 `seedAll(db)` 함수가 있으나, `seed.ts`에서 import/호출하지 않음.
→ 블록 타입 0개, 팀 0개, 프리셋 0개 → 프론트에서 아무것도 안 보임.

### 4.2 수정

**파일**: `dashboard/server/db/seed.ts`

```typescript
// 기존 import 뒤에 추가
import { seedAll as seedBrick } from './seed-brick.js';

export function seed() {
  // ... 기존 시드 로직 (체인, 스텝, 에이전트, 루틴) ...

  // Brick 시드 추가 (블록 타입 10종 + PDCA 팀 3개 + 프리셋 4개)
  seedBrick(db);

  console.log('[seed] Brick 시드 완료');
}
```

### 4.3 실행 순서

기존 시드 → Brick 시드. `onConflictDoNothing()`이므로 멱등성 보장.

---

## 5. Hook-API 불일치 5건 수정

### 5.1 API 3개 추가

#### 5.1.1 POST /api/brick/teams/:id/members — 팀원 추가

**파일**: `dashboard/server/routes/brick/teams.ts`에 라우트 추가

```typescript
app.post('/api/brick/teams/:id/members', (req, res) => {
  const id = Number(req.params.id);
  const team = db.select().from(brickTeams).where(eq(brickTeams.id, id)).get();
  if (!team) return res.status(404).json({ error: '팀 없음' });

  const { name, role } = req.body;
  if (!name || !role) return res.status(400).json({ error: '필수: name, role' });

  const members = (team.members as Array<{ name: string; role: string }>) || [];
  
  // 중복 체크
  if (members.some(m => m.name === name)) {
    return res.status(409).json({ error: `이미 존재하는 팀원: ${name}` });
  }

  members.push({ name, role, model: req.body.model || 'opus' });

  db.update(brickTeams)
    .set({ members, updatedAt: new Date().toISOString() })
    .where(eq(brickTeams.id, id))
    .run();

  res.status(201).json({ name, role });
});
```

**매칭 Hook**: `useAddMember` (`useTeams.ts:74`)

#### 5.1.2 DELETE /api/brick/teams/:id/members/:memberId — 팀원 제거

```typescript
app.delete('/api/brick/teams/:id/members/:memberId', (req, res) => {
  const id = Number(req.params.id);
  const team = db.select().from(brickTeams).where(eq(brickTeams.id, id)).get();
  if (!team) return res.status(404).json({ error: '팀 없음' });

  const members = (team.members as Array<{ name: string }>) || [];
  const memberId = req.params.memberId;
  const idx = members.findIndex(m => m.name === memberId);

  if (idx === -1) return res.status(404).json({ error: `팀원 없음: ${memberId}` });

  members.splice(idx, 1);

  db.update(brickTeams)
    .set({ members, updatedAt: new Date().toISOString() })
    .where(eq(brickTeams.id, id))
    .run();

  res.status(204).end();
});
```

**매칭 Hook**: `useRemoveMember` (`useTeams.ts:88`)

> **참고**: `memberId`는 팀원의 `name` 필드를 식별자로 사용.
> `brickTeams.members`가 JSON 배열이므로 별도 테이블이 아닌 배열 내 name으로 검색.

#### 5.1.3 PUT /api/brick/teams/:id/mcp — MCP 서버 설정

```typescript
app.put('/api/brick/teams/:id/mcp', (req, res) => {
  const id = Number(req.params.id);
  const existing = db.select().from(brickTeams).where(eq(brickTeams.id, id)).get();
  if (!existing) return res.status(404).json({ error: '팀 없음' });

  const { servers } = req.body;
  if (!servers || typeof servers !== 'object') {
    return res.status(400).json({ error: '필수: servers (object)' });
  }

  const updated = db.update(brickTeams)
    .set({ mcpServers: servers, updatedAt: new Date().toISOString() })
    .where(eq(brickTeams.id, id))
    .returning().get();

  res.json(updated);
});
```

**매칭 Hook**: `useConfigureMcp` (`useTeams.ts:112`)

### 5.2 파라미터 불일치 2건 수정

**문제**: Hook에서 `id`로 호출하지만 백엔드는 `:name`으로 받음.

**방향**: Hook을 수정하여 `name` 기반으로 통일.

> **PM 판단**: 백엔드 block-types 라우트가 `:name` 기반으로 올바르게 설계되어 있음.
> `brickBlockTypes` 테이블의 PK는 `id`(integer)이지만, `name`이 unique이고
> 비즈니스 식별자로서 더 적합. Hook 측을 수정하는 것이 올바름.

**파일**: `dashboard/src/hooks/brick/useBlockTypes.ts`

```typescript
// 변경 전: { id, ...data }
// 변경 후: { name, ...data }

export function useUpdateBlockType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, ...data }: { name: string; displayName?: string; icon?: string; color?: string }) =>
      fetchJson<BlockTypeItem>(`/block-types/${name}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'blockTypes'] }),
  });
}

export function useDeleteBlockType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      fetchJson(`/block-types/${name}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'blockTypes'] }),
  });
}
```

---

## 6. Executions GET 목록 API

### 6.1 문제

`GET /api/brick/executions` (전체 목록)이 없다.
`RunHistoryPage`가 실행 이력을 표시할 수 없음.

### 6.2 수정

**파일**: `dashboard/server/routes/brick/executions.ts`에 엔드포인트 추가

```typescript
// GET /api/brick/executions — 실행 목록 (최신순)
app.get('/api/brick/executions', (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;
    const status = req.query.status as string | undefined;

    let query = db.select().from(brickExecutions);

    if (status) {
      query = query.where(eq(brickExecutions.status, status));
    }

    const executions = query
      .orderBy(desc(brickExecutions.id))
      .limit(limit)
      .offset(offset)
      .all();

    // 전체 카운트 (페이지네이션용)
    const total = db.select({ count: count() }).from(brickExecutions).get();

    res.json({
      data: executions,
      total: total?.count || 0,
      limit,
      offset,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});
```

### 6.3 프론트 Hook 추가

**파일**: `dashboard/src/hooks/brick/useExecutions.ts`에 추가

```typescript
export function useExecutions(options?: { status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();

  return useQuery({
    queryKey: ['brick', 'executions', options],
    queryFn: async () => {
      const res = await fetch(`/api/brick/executions${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error('실행 목록 조회 실패');
      return res.json();
    },
  });
}
```

---

## 7. 이중 구현 해소

### 7.1 이중 구현 현황과 단일화 방침

| 로직 | Python | TypeScript | 단일 소스 | 이유 |
|------|--------|-----------|----------|------|
| spec wrapper 해제 | `executor.py._parse_preset()` | `executions.ts POST` | **Python** | 엔진이 YAML을 직접 로드하므로 Express에서 파싱 불필요 |
| YAML 파싱 | `yaml.safe_load` | `js-yaml` + `yaml` | **Python** | 실행 시 YAML 해석은 엔진 담당 |
| DAG 순환 검증 | `validator.py` | `links.ts POST` | **둘 다 유지** | Express는 CRUD 저장 시 즉시 검증, Python은 실행 시 재검증 |
| 블록 상태 매핑 | `BlockStatus` enum (7값) | `BlockStatus` type | **Python이 정본** | Express는 엔진 응답의 status 문자열을 그대로 DB에 저장 |
| 프리셋 변환 | `converters.py` | `serializer.ts` | **TypeScript** | 프론트 캔버스 표시용 변환은 프론트 담당 |

### 7.2 Express executor.ts 역할 변경

**현재**: `startBlock()`, `completeBlock()`, `emitThinkLog()`, `validateThinkLogGate()` — 직접 DB 쓰기.

**변경 후**: `emitThinkLog()`만 유지. 나머지는 Python 엔진이 담당.

| 함수 | 현재 | 변경 후 |
|------|------|---------|
| `emitThinkLog()` | ThinkLog를 DB에 기록 | **유지** — HP-001 요건. 엔진 무관하게 항상 기록 |
| `startBlock()` | DB에 직접 block.started 쓰기 | **제거** — 엔진이 StartBlockCommand로 처리 |
| `completeBlock()` | DB에 직접 block.completed 쓰기 | **제거** — 엔진이 Gate/Link 포함 처리 |
| `validateThinkLogGate()` | think_log 존재 확인 | **유지** — Express DB 확인용 (Gate 결과와 별도) |
| `isThinkLogRequired()` | blockType 조회 | **유지** — Express DB 조회 |

### 7.3 Express blocksState 상태값 통일

Python 엔진의 `BlockStatus` enum:
```python
class BlockStatus(str, Enum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    GATE_CHECKING = "gate_checking"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
```

Express DB에 저장되는 `blocksState`의 status 값을 Python enum과 동일하게 통일.
프론트엔드의 `BlockStatus` type도 이 7개 값으로 맞춤.

---

## 8. 에러 시나리오

### 8.1 Python 엔진 프로세스 다운

```
시나리오: Express가 Python FastAPI에 HTTP 요청 → connection refused
```

**대응**:
1. `EngineBridge.request()`에서 `ECONNREFUSED` 감지
2. `retryCount`만큼 재시도 (기본 2회, 1초 간격)
3. 재시도 실패 시 Express가 `502 Bad Gateway` 반환

```json
{
  "error": "engine_unavailable",
  "detail": "Python 엔진 연결 실패. 엔진 프로세스 상태를 확인하세요.",
  "retried": 2
}
```

4. 헬스체크 모니터가 `healthy=false` 마킹
5. 이후 요청은 즉시 502 반환 (불필요한 재시도 방지)
6. 헬스체크 성공 시 `healthy=true` 복구

### 8.2 HTTP 타임아웃

```
시나리오: Gate 실행이 30초 초과 (복잡한 command gate 등)
```

**대응**:
1. `timeout: 30000`(30초) 기본값
2. 타임아웃 시 `504 Gateway Timeout` 반환
3. Python 엔진 측에서는 워크플로우가 중단되지 않음 (체크포인트에 상태 유지)
4. 프론트에서 재시도하면 `getStatus()`로 현재 상태 확인 후 이어서 진행 가능

```json
{
  "error": "engine_timeout",
  "detail": "엔진 응답 대기 시간 초과 (30초). 실행은 계속 진행 중일 수 있습니다.",
  "workflow_id": "wf-20260403-abc123"
}
```

### 8.3 엔진 응답 불일치

```
시나리오: 엔진이 예상과 다른 JSON 형식 반환
```

**대응**:
1. `EngineBridge`에서 응답 스키마 검증 (필수 필드 존재 확인)
2. 필수 필드 누락 시 `502` + 상세 로그
3. Express 로그에 원본 응답 기록 (디버깅용)

### 8.4 헬스체크 스펙

```typescript
// 30초마다 GET /api/v1/engine/health 호출
// 3회 연속 실패 → healthy=false
// 1회 성공 → healthy=true (즉시 복구)

class EngineBridge {
  private healthFailCount = 0;
  private readonly MAX_FAIL = 3;

  startHealthMonitor() {
    this.healthCheckTimer = setInterval(async () => {
      const ok = await this.checkHealth();
      if (ok) {
        this.healthy = true;
        this.healthFailCount = 0;
      } else {
        this.healthFailCount++;
        if (this.healthFailCount >= this.MAX_FAIL) {
          this.healthy = false;
          console.error('[EngineBridge] 엔진 헬스체크 3회 연속 실패. 비활성화.');
        }
      }
    }, this.config.healthCheckInterval);
  }
}
```

### 8.5 Graceful Degradation

엔진 다운 시 Express가 **읽기(GET)는 정상**, **쓰기(POST)만 차단**.

| 엔드포인트 | 엔진 다운 시 |
|-----------|-------------|
| `GET /executions` | 정상 — DB 조회만 |
| `GET /executions/:id` | 정상 — DB 조회만 |
| `GET /executions/:id/logs` | 정상 — DB 조회만 |
| `POST /executions` | 502 — 엔진 필요 |
| `POST /:id/blocks/:b/complete` | 502 — 엔진 필요 |
| `POST /:id/pause` | 502 — 엔진 필요 |

---

## 9. Python FastAPI 엔진 서버 구성

### 9.1 신규 라우터

**파일**: `brick/brick/dashboard/routes/engine_bridge.py` (신규)

기존 `server.py`의 `create_app()`에 라우터 등록:

```python
# server.py에 추가
from brick.dashboard.routes import engine_bridge
app.include_router(engine_bridge.router, prefix="/api/v1", tags=["engine-bridge"])
```

### 9.2 라우터 구현 핵심

```python
router = APIRouter(prefix="/engine", tags=["engine-bridge"])

# 전역 인스턴스 — create_app()에서 초기화
executor: WorkflowExecutor | None = None
preset_loader: PresetLoader | None = None

@router.post("/start")
async def start_workflow(body: StartRequest):
    """EP-1: 워크플로우 시작."""
    defn = preset_loader.load(body.preset_name)
    workflow_id = await executor.start(body.preset_name, body.feature, body.task)
    instance = executor.checkpoint.load(workflow_id)
    return _serialize_instance(instance)

@router.post("/complete-block")
async def complete_block(body: CompleteBlockRequest):
    """EP-2: 블록 완료 → Gate → Link → 다음 블록."""
    # context에 metrics 주입 (Gate 조건 평가용)
    instance = executor.checkpoint.load(body.workflow_id)
    if body.metrics:
        instance.context.update(body.metrics)
        executor.checkpoint.save(body.workflow_id, instance)

    gate_result = await executor.complete_block(body.workflow_id, body.block_id)
    instance = executor.checkpoint.load(body.workflow_id)

    return {
        "workflow_id": body.workflow_id,
        "block_id": body.block_id,
        "block_status": instance.blocks[body.block_id].status.value,
        "gate_result": {
            "passed": gate_result.passed,
            "type": gate_result.type,
            "detail": gate_result.detail,
            "metrics": gate_result.metrics,
        },
        "next_blocks": _get_next_blocks(instance, body.block_id),
        "blocks_state": _serialize_blocks_state(instance),
        "context": instance.context,
    }

@router.get("/status/{workflow_id}")
async def get_status(workflow_id: str):
    """EP-3: 워크플로우 상태 조회."""
    instance = executor.checkpoint.load(workflow_id)
    if not instance:
        raise HTTPException(404, f"Workflow {workflow_id} not found")
    events = executor.checkpoint.load_events(workflow_id)
    return {
        **_serialize_instance(instance),
        "events": events,
    }

@router.get("/health")
async def health():
    """EP-7: 헬스체크."""
    presets_count = len(list(preset_loader.presets_dir.glob("*.yaml")))
    active_count = _count_active_workflows()
    return {
        "status": "ok",
        "engine_version": "0.1.0",
        "presets_loaded": presets_count,
        "active_workflows": active_count,
    }
```

### 9.3 Python 서버 포트

기존 Python FastAPI 대시보드와 동일 프로세스에서 실행.
포트: **8100** (Express와 충돌 방지).

```bash
# 엔진 서버 기동
cd brick && python -m uvicorn brick.dashboard.server:app --host 0.0.0.0 --port 8100
```

Express의 `EngineBridge` 기본 URL: `http://localhost:8100`.

---

## 10. 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `brick/brick/dashboard/routes/engine_bridge.py` | **신규** | Python 엔진 브릿지 API (EP-1~7) |
| `brick/brick/dashboard/server.py` | 수정 | engine_bridge 라우터 등록 |
| `dashboard/server/brick/engine/bridge.ts` | **신규** | EngineBridge 클라이언트 클래스 |
| `dashboard/server/routes/brick/executions.ts` | 수정 | Python 엔진 프록시로 전환 (POST 3개) |
| `dashboard/server/brick/engine/executor.ts` | 수정 | startBlock/completeBlock 제거, ThinkLog만 유지 |
| `dashboard/server/db/seed.ts` | 수정 | seedBrick(db) 호출 1줄 추가 |
| `dashboard/server/routes/brick/teams.ts` | 수정 | API 3개 추가 (members POST/DELETE, mcp PUT) |
| `dashboard/src/hooks/brick/useBlockTypes.ts` | 수정 | id→name 파라미터 통일 |
| `dashboard/src/hooks/brick/useExecutions.ts` | 수정 | useExecutions 목록 Hook 추가 |
| `brick/brick/tests/dashboard/test_engine_bridge.py` | **신규** | TDD 케이스 |
| `dashboard/server/__tests__/brick/test_engine_bridge.test.ts` | **신규** | TDD 케이스 |

---

## 11. TDD

### 테스트 파일 (Python): `brick/brick/tests/dashboard/test_engine_bridge.py`
### 테스트 파일 (TypeScript): `dashboard/server/__tests__/brick/test_engine_bridge.test.ts`

| ID | 테스트명 | 검증 내용 | 기대 결과 | 파일 |
|----|---------|----------|----------|------|
| EB-001 | `test_eb01_start_workflow_returns_blocks` | EP-1: 워크플로우 시작 시 blocks_state 반환 | status=running, 첫 블록=queued, 나머지=pending | Python |
| EB-002 | `test_eb02_start_workflow_preset_not_found` | 존재하지 않는 프리셋으로 시작 | 404 + preset_not_found | Python |
| EB-003 | `test_eb03_start_workflow_validation_error` | DAG 순환 있는 프리셋 | 422 + validation_failed | Python |
| EB-004 | `test_eb04_complete_block_gate_pass` | EP-2: Gate 통과 시 다음 블록 queued | gate_result.passed=true, next_blocks=[다음] | Python |
| EB-005 | `test_eb05_complete_block_gate_fail_loop` | Gate 실패 + loop Link | next_blocks=[루프 대상], context._loop_ 증가 | Python |
| EB-006 | `test_eb06_complete_block_gate_fail_branch` | Gate 실패 + branch condition 불충족 | next_blocks=[] (branch 조건 미충족) | Python |
| EB-007 | `test_eb07_complete_block_with_metrics` | metrics가 context에 반영 | context.match_rate == 요청값 | Python |
| EB-008 | `test_eb08_get_status_with_events` | EP-3: 이벤트 포함 상태 조회 | events 배열 포함, 시간순 | Python |
| EB-009 | `test_eb09_get_status_not_found` | 없는 workflow_id | 404 | Python |
| EB-010 | `test_eb10_suspend_resume_cycle` | EP-4,5: 일시정지 → 재개 | suspended → running | Python |
| EB-011 | `test_eb11_cancel_workflow` | EP-6: 취소 | status=cancelled | Python |
| EB-012 | `test_eb12_health_check` | EP-7: 헬스체크 | status=ok, presets_loaded >= 1 | Python |
| EB-013 | `test_eb13_workflow_complete_all_blocks` | 모든 블록 완료 시 workflow.completed | workflow status=completed | Python |
| EB-014 | `test_eb14_loop_max_iterations` | loop max_retries 초과 | 루프 탈출, 다른 link으로 진행 | Python |
| EB-015 | `test_eb15_parallel_next_blocks` | parallel link 시 복수 다음 블록 | next_blocks=[b1, b2] | Python |
| EB-016 | `test_eb16_bridge_start_success` | EngineBridge.startWorkflow() 정상 | ok=true, data에 workflow_id | TS |
| EB-017 | `test_eb17_bridge_start_engine_down` | 엔진 다운 시 startWorkflow() | ok=false, error=engine_unavailable | TS |
| EB-018 | `test_eb18_bridge_retry_on_failure` | 첫 번째 실패 → 두 번째 성공 | ok=true (재시도 성공) | TS |
| EB-019 | `test_eb19_bridge_timeout` | 30초 타임아웃 | ok=false, error=engine_timeout | TS |
| EB-020 | `test_eb20_bridge_health_check_healthy` | 헬스체크 성공 | isHealthy()=true | TS |
| EB-021 | `test_eb21_bridge_health_check_3_fails` | 헬스체크 3회 연속 실패 | isHealthy()=false | TS |
| EB-022 | `test_eb22_bridge_health_recovery` | 실패 후 1회 성공 | isHealthy()=true 즉시 복구 | TS |
| EB-023 | `test_eb23_executions_post_via_bridge` | POST /executions → 엔진 호출 → DB 동기화 | execution 생성 + engineWorkflowId 매핑 | TS |
| EB-024 | `test_eb24_executions_post_engine_down` | 엔진 다운 시 POST /executions | 502 + engine_unavailable | TS |
| EB-025 | `test_eb25_complete_block_via_bridge` | POST /:id/blocks/:b/complete → 엔진 → DB | gateResult + blocksState 업데이트 | TS |
| EB-026 | `test_eb26_complete_block_gate_result_saved` | Gate 결과가 brickGateResults에 저장 | handlerType, passed, detail 일치 | TS |
| EB-027 | `test_eb27_id_mapping_engine_to_express` | execution.id ↔ engine workflow_id 매핑 | engine.mapped 로그에서 조회 가능 | TS |
| EB-028 | `test_eb28_seed_brick_called` | seed() 호출 시 Brick 시드 실행 | blockTypes 10개, teams 3개, presets 4개 | TS |
| EB-029 | `test_eb29_seed_idempotent` | seed() 2회 호출 | 중복 생성 없음 (onConflictDoNothing) | TS |
| EB-030 | `test_eb30_add_member_api` | POST /teams/:id/members | 201 + 멤버 추가 확인 | TS |
| EB-031 | `test_eb31_add_member_duplicate` | 동일 이름 멤버 추가 | 409 conflict | TS |
| EB-032 | `test_eb32_remove_member_api` | DELETE /teams/:id/members/:name | 204 + 멤버 제거 확인 | TS |
| EB-033 | `test_eb33_remove_member_not_found` | 없는 멤버 제거 | 404 | TS |
| EB-034 | `test_eb34_configure_mcp_api` | PUT /teams/:id/mcp | mcpServers 업데이트 | TS |
| EB-035 | `test_eb35_block_type_name_param` | PUT /block-types/:name (Hook 수정 후) | name으로 조회 + 수정 정상 | TS |
| EB-036 | `test_eb36_delete_block_type_name_param` | DELETE /block-types/:name | name으로 삭제 정상 | TS |
| EB-037 | `test_eb37_get_executions_list` | GET /api/brick/executions | 목록 반환 (data, total, limit, offset) | TS |
| EB-038 | `test_eb38_get_executions_filter_status` | GET /executions?status=running | running만 필터 | TS |
| EB-039 | `test_eb39_get_executions_pagination` | GET /executions?limit=10&offset=5 | 페이지네이션 동작 | TS |
| EB-040 | `test_eb40_graceful_degradation_read` | 엔진 다운 + GET /executions/:id | 정상 200 (DB 조회만) | TS |
| EB-041 | `test_eb41_executor_ts_thinklog_preserved` | executor.ts emitThinkLog() | 엔진 도입 후에도 ThinkLog 정상 기록 | TS |
| EB-042 | `test_eb42_executor_ts_start_block_removed` | executor.ts startBlock() 제거 확인 | import 시 startBlock 없음 | TS |
| EB-043 | `test_eb43_blocks_state_status_values` | blocksState의 status 값 | 7가지만 허용 (pending/queued/running/gate_checking/completed/failed/skipped) | TS |
| EB-044 | `test_eb44_engine_response_schema` | 엔진 응답 필수 필드 검증 | workflow_id, blocks_state, status 필수 | TS |
| EB-045 | `test_eb45_context_persists_across_blocks` | 블록 A 완료 시 context → 블록 B에서 조회 | context.match_rate 유지 | Python |

---

## 12. 불변식 (Invariant)

| ID | 규칙 | 검증 시점 |
|----|------|----------|
| INV-EB-1 | POST /executions는 반드시 Python 엔진을 거쳐야 한다. DB 직접 상태 전이 금지 | EB-023, EB-024 |
| INV-EB-2 | complete-block 시 Gate 결과가 brickGateResults에 반드시 저장되어야 한다 | EB-026 |
| INV-EB-3 | blocksState의 status 값은 Python BlockStatus enum의 7가지만 허용 | EB-043 |
| INV-EB-4 | 엔진 다운 시 GET(읽기)는 정상, POST(쓰기)는 502 반환 | EB-040, EB-024 |
| INV-EB-5 | seed() 호출 시 Brick 테이블에 블록 타입 10종, 팀 3개, 프리셋 4개 존재 | EB-028 |
| INV-EB-6 | Hook의 API 호출 경로와 Express 라우트 경로가 1:1 매칭 | EB-030~036 |
| INV-EB-7 | Express execution.id ↔ Python workflow_id 매핑이 항상 존재 | EB-027 |
| INV-EB-8 | context는 블록 간 전파되어야 한다. 블록 A의 metrics가 블록 B의 Gate 조건에서 참조 가능 | EB-045, EB-005 |

---

## 13. 구현 순서 (권장)

| 순서 | 작업 | 의존성 | 이유 |
|------|------|--------|------|
| 1 | seed 연결 (§4) | 없음 | 1줄 추가. 즉시 DB에 데이터 생김 |
| 2 | Hook-API 불일치 수정 (§5) | 없음 | 프론트 오류 즉시 해결 |
| 3 | GET /executions 목록 (§6) | 없음 | RunHistoryPage 동작 |
| 4 | Python engine_bridge.py (§9) | 없음 | 엔진 API 준비 |
| 5 | Express bridge.ts (§3.2) | 4 완료 | 엔진 호출 클라이언트 |
| 6 | executions.ts 수정 (§3.3) | 4+5 완료 | 핵심 — 엔진 프록시 전환 |
| 7 | executor.ts 정리 (§7.2) | 6 완료 | 이중 구현 제거 |
| 8 | BlockStatus 통일 (§7.3) | 6 완료 | 상태값 일관성 |

순서 1~3은 **병렬 가능** (독립적).
순서 4~8은 **순차** (의존성 있음).
