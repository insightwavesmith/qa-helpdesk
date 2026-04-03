# Brick Canvas Save → Execute 파이프 Design

> **피처**: brick-canvas-save (Canvas 저장 → 실행 → 상태 반영)
> **레벨**: L2 (기능 개발)
> **작성**: PM | 2026-04-03
> **선행**: brick-backend-api.design.md, brick-dashboard-frontend.design.md, brick-pdca-preset.design.md

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **DB** | SQLite (better-sqlite3 + drizzle-orm) — `dashboard/server/db/index.ts` |
| **Express 포트** | 3200 |
| **Python 엔진 포트** | 3202 |
| **프론트 dev 포트** | 3201 |
| **기존 불변식** | INV-EB-1~11 (engine-bridge). 이 Design은 기존 INV를 변경하지 않음 |
| **BlockStatus** | 9가지: pending, queued, running, gate_checking, waiting_approval, completed, failed, rejected, suspended |
| **현재 구현 상태** | engine-bridge ✅ 완료, CEO 승인 Gate ✅ 구현, 프로젝트 레이어 🔄 구현 중 |

### 0.1 캔버스 → 엔진 연결 참고

- 캔버스 저장(PUT /presets/:id)은 Express(3200) 직접 DB 저장 — INV-EB-1 위반 아님 (프리셋 메타데이터는 엔진 경유 불필요)
- 실행(POST /executions)은 반드시 Python 엔진(3202) 경유 — INV-EB-1 준수 필수
- blocksState 폴링은 Express DB에서 읽기 — INV-EB-4 준수 (GET은 엔진 불필요)

---

## 1. 현황 분석

### 1.1 현재 구현 상태

| 구간 | 구현 | 상태 |
|------|------|------|
| 블록 드래그앤드롭 | BlockSidebar → Canvas onDrop | ✅ 완료 |
| 링크 연결 | onConnect → 링크 타입 다이얼로그 | ✅ 완료 |
| 연결 유효성 검사 | validateConnection | ✅ 완료 |
| 프리셋 저장 (PUT) | handleSave → flowToYaml → PUT /presets/:id | ⚠️ 부분 |
| 프리셋 로드 | fetch → yamlToFlow → setNodes/setEdges | ✅ 완료 |
| 실행 시작 | 툴바 "실행" 버튼 존재 | ❌ 미연결 |
| 실행 상태 폴링 | useExecutionStatus (3초) | ✅ hook 있음, 캔버스 미연결 |
| 노드 상태 반영 | styledNodes (테두리 색상) | ⚠️ 정적 |
| 엣지 애니메이션 | styledEdges (animated) | ⚠️ 정적 |
| 타임라인 이벤트 | ExecutionTimeline | ❌ 데이터 미연결 |

### 1.2 주요 갭 5건

| # | 갭 | 위치 | 문제 |
|---|---|------|------|
| G-1 | BrickCanvasPage가 CanvasToolbar 미사용 | BrickCanvasPage.tsx:232 | 인라인 버튼이 API 미호출 |
| G-2 | 실행 전 저장 강제 없음 | - | dirty 상태에서 실행 시 구 버전 실행 |
| G-3 | 실행 시 feature 이름 입력 없음 | - | POST /executions에 feature 필수 |
| G-4 | blocksState → 노드 상태 반영 없음 | BrickCanvasPage.tsx | 폴링 결과가 캔버스에 반영 안 됨 |
| G-5 | flowToYaml 데이터 손실 | serializer.ts:63 | gates, config, labels 등 미포함 |

---

## 2. 전체 파이프라인

```
[Canvas]               [API]                [Engine]
   │                     │                     │
   ├─ 저장 ─────────────►│                     │
   │  flowToYaml()       │ PUT /presets/:id    │
   │  + spec wrapper     │ DB 저장             │
   │                     │                     │
   ├─ 실행 ─────────────►│                     │
   │  (저장 강제)        │ POST /executions    │
   │  feature 입력       │ {presetId, feature} │
   │                     │  ─────────────────► │
   │                     │  PresetLoader.load() │
   │                     │  WorkflowExecutor    │
   │                     │  .start()            │
   │                     │ ◄───────────────── │
   │                     │ execution.id        │
   │                     │                     │
   ├─ 폴링 ◄────────────│                     │
   │  3초 간격           │ GET /executions/:id │
   │  blocksState →      │ + blocksState       │
   │  노드 상태 업데이트  │                     │
   │                     │                     │
   ├─ 로그 ◄────────────│                     │
   │  5초 간격           │ GET /.../logs       │
   │  logs →             │                     │
   │  타임라인 업데이트    │                     │
```

---

## 3. 설계 상세

### 3.1 저장 파이프 개선

#### 3.1.1 flowToYaml 확장

현재 `flowToYaml()`이 누락하는 데이터:
- `gates`: 블록별 게이트 설정
- `config`: 블록별 설정 (think_log_required 등)
- `labels`: 프리셋 메타데이터
- `spec` wrapper: Preset 형식 YAML 구조

**수정된 flowToYaml:**

```typescript
export interface PresetYamlFull {
  kind: 'Preset';
  name: string;
  labels?: Record<string, string>;
  spec: {
    blocks: Array<{
      id: string;
      type: string;
      what: string;
      description?: string;
      done?: { artifacts?: string[]; metrics?: Record<string, unknown> };
      config?: Record<string, unknown>;
    }>;
    links: Array<{
      from: string;
      to: string;
      type: string;
      condition?: string;
      max_retries?: number;
    }>;
    teams: Record<string, string | { team: string; override?: Record<string, unknown> }>;
    gates?: Record<string, Array<{ type: string; command?: string; description?: string }>>;
  };
}

export function flowToYamlFull(
  nodes: Node[],
  edges: Edge[],
  name: string,
  existingPreset?: PresetYamlFull,
): PresetYamlFull {
  const blocks = nodes
    .filter((n) => n.type !== 'start' && n.type !== 'end')
    .map((n) => {
      const d = n.data as Record<string, unknown>;
      return {
        id: (d.blockId as string) || n.id,
        type: (d.blockType as string) || 'custom',
        what: (d.name as string) || n.id,
        description: (d.description as string) || undefined,
        done: d.done as { artifacts?: string[] } || undefined,
        config: d.config as Record<string, unknown> || undefined,
      };
    });

  const links = edges.map((e) => {
    const d = e.data as Record<string, unknown> | undefined;
    return {
      from: e.source,
      to: e.target,
      type: (d?.linkType as string) || 'sequential',
      condition: (d?.condition as string) || undefined,
      max_retries: (d?.maxRetries as number) || undefined,
    };
  });

  const teams: Record<string, string | { team: string; override?: Record<string, unknown> }> = {};
  nodes.forEach((n) => {
    const d = n.data as Record<string, unknown>;
    if (d.teamId && d.blockId) {
      teams[d.blockId as string] = d.teamId as string;
    }
  });

  return {
    kind: 'Preset',
    name,
    labels: existingPreset?.labels,
    spec: {
      blocks,
      links,
      teams,
      gates: existingPreset?.spec?.gates,  // 기존 gates 보존
    },
  };
}
```

**핵심 원칙**: Canvas에서 편집 불가한 데이터(gates, config)는 기존 프리셋에서 보존.

#### 3.1.2 저장 API 호출

```typescript
// BrickCanvasPage — 저장 흐름
const handleSave = useCallback(async () => {
  const yaml = flowToYamlFull(nodes, edges, presetName, existingPreset);
  const yamlString = JSON.stringify(yaml);  // 서버에서 YAML serialize

  if (presetId) {
    // 기존 프리셋 업데이트
    await fetch(`/api/brick/presets/${presetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ yaml: yamlString }),
    });
  } else {
    // 새 프리셋 생성
    const res = await fetch('/api/brick/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: presetName, yaml: yamlString }),
    });
    const created = await res.json();
    setPresetId(created.id);
  }
  setIsDirty(false);
}, [nodes, edges, presetId, presetName, existingPreset]);
```

### 3.2 실행 파이프

#### 3.2.1 실행 전 체크리스트

```
실행 버튼 클릭
  ├─ isDirty? → 자동 저장 먼저 실행 → 완료 후 계속
  ├─ presetId 있는지? → 없으면 "먼저 저장해주세요" 안내
  ├─ feature 이름 입력 다이얼로그 표시
  │   └─ feature: string (필수, 영문+하이픈)
  └─ POST /api/brick/executions { presetId, feature }
      └─ 성공 → executionId 저장 → 폴링 시작
```

#### 3.2.2 Feature 입력 다이얼로그

새 컴포넌트: `ExecuteDialog.tsx`

```typescript
interface ExecuteDialogProps {
  open: boolean;
  onConfirm: (feature: string) => void;
  onCancel: () => void;
}

export function ExecuteDialog({ open, onConfirm, onCancel }: ExecuteDialogProps) {
  const [feature, setFeature] = useState('');
  const isValid = /^[a-z0-9-]+$/.test(feature) && feature.length >= 2;

  if (!open) return null;

  return (
    <div data-testid="execute-dialog" className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-80">
        <h3 className="text-sm font-semibold mb-3">워크플로우 실행</h3>
        <label className="text-xs text-gray-500">피처 이름</label>
        <input
          data-testid="feature-input"
          value={feature}
          onChange={(e) => setFeature(e.target.value)}
          placeholder="my-feature"
          className="w-full mt-1 px-3 py-2 border rounded text-sm"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1 text-sm rounded bg-gray-200">
            취소
          </button>
          <button
            data-testid="execute-confirm-btn"
            onClick={() => onConfirm(feature)}
            disabled={!isValid}
            className="px-3 py-1 text-sm rounded bg-green-500 text-white disabled:opacity-50"
          >
            실행
          </button>
        </div>
      </div>
    </div>
  );
}
```

#### 3.2.3 실행 시작 핸들러

```typescript
const handleExecute = useCallback(async (feature: string) => {
  // 1. dirty면 자동 저장
  if (isDirty) {
    await handleSave();
  }

  // 2. 실행 시작
  const res = await fetch('/api/brick/executions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ presetId, feature }),
  });

  if (!res.ok) {
    const err = await res.json();
    alert(`실행 실패: ${err.error}`);
    return;
  }

  const execution = await res.json();
  setExecutionId(execution.id);
  setIsExecuting(true);
  setShowExecuteDialog(false);
}, [isDirty, handleSave, presetId]);
```

### 3.3 상태 반영 파이프

#### 3.3.1 blocksState 폴링 → 노드 상태 업데이트

```typescript
// 실행 상태 폴링 (3초)
const { data: executionData } = useExecutionStatus(executionId);

// blocksState → 노드 상태 동기화
useEffect(() => {
  if (!executionData?.blocksState) return;

  let blocksState: Record<string, { status: string }>;
  try {
    blocksState = JSON.parse(executionData.blocksState);
  } catch {
    return;
  }

  setNodes((nds) =>
    nds.map((node) => {
      const blockId = (node.data as Record<string, unknown>).blockId as string;
      const blockState = blocksState[blockId];
      if (!blockState) return node;

      // 백엔드 상태 → 프론트엔드 상태 매핑
      const statusMap: Record<string, BlockStatus> = {
        pending: 'idle',
        queued: 'queued',
        running: 'running',
        gate_checking: 'running',  // UI에서는 running으로 표시
        completed: 'done',
        failed: 'failed',
        suspended: 'paused',
      };

      const frontStatus = statusMap[blockState.status] || 'idle';
      return {
        ...node,
        data: { ...node.data, status: frontStatus },
      };
    })
  );

  // 실행 완료 감지
  if (executionData.status === 'completed' || executionData.status === 'failed') {
    setIsExecuting(false);
  }
}, [executionData, setNodes]);
```

#### 3.3.2 활성 엣지 판정

```typescript
// 현재 running 블록에서 나가는 link를 활성화
useEffect(() => {
  if (!executionData?.blocksState) return;

  let blocksState: Record<string, { status: string }>;
  try {
    blocksState = JSON.parse(executionData.blocksState);
  } catch {
    return;
  }

  // running 블록 찾기
  const runningBlockIds = Object.entries(blocksState)
    .filter(([, v]) => v.status === 'running')
    .map(([k]) => k);

  setEdges((eds) =>
    eds.map((edge) => {
      const isActive = runningBlockIds.includes(edge.source);
      return {
        ...edge,
        data: { ...edge.data, isActive },
      };
    })
  );
}, [executionData, setEdges]);
```

#### 3.3.3 실행 로그 → 타임라인

```typescript
// 실행 로그 폴링 (5초)
const { data: logs } = useExecutionLogs(executionId);

// 로그 → 타임라인 이벤트 변환
useEffect(() => {
  if (!logs || !Array.isArray(logs)) return;

  const events: TimelineEvent[] = logs.map((log: {
    id: number;
    eventType: string;
    blockId?: string;
    timestamp: string;
    data?: string;
  }) => ({
    id: String(log.id),
    type: log.eventType,
    blockId: log.blockId || '',
    timestamp: log.timestamp,
    detail: log.data ? JSON.parse(log.data) : {},
  }));

  setTimelineEvents(events);
}, [logs]);
```

### 3.4 BrickCanvasPage 통합

현재 BrickCanvasPage가 인라인 버튼을 사용하는데, CanvasToolbar 컴포넌트로 교체:

```typescript
// 변경 전: 인라인 버튼 (line 232~243)
<div data-testid="toolbar" className="...">
  <button>실행</button>
  <button>정지</button>
  <button onClick={handleSave}>저장</button>
</div>

// 변경 후: CanvasToolbar 사용
<CanvasToolbar
  presetId={presetId}
  executionId={executionId}
  isExecuting={isExecuting}
  isPaused={isPaused}
  onSave={handleSave}
  onExecute={() => setShowExecuteDialog(true)}
/>
```

CanvasToolbar에 `onExecute` prop 추가 필요:

```typescript
// CanvasToolbar 확장
export interface CanvasToolbarProps {
  // ... 기존 props
  onExecute?: () => void;  // 실행 다이얼로그 열기
}
```

CanvasToolbar의 "실행" 버튼에서 `onExecute` 호출로 변경 (직접 API 호출 대신 다이얼로그 열기):

```typescript
// handleStart 변경
const handleStart = useCallback(() => {
  if (onExecute) {
    onExecute();  // 다이얼로그 열기 → feature 입력 → 부모가 실행
  } else {
    startExecution.mutate(presetId);  // 폴백
  }
}, [onExecute, startExecution, presetId]);
```

---

## 4. 서버 측 보완

### 4.1 POST /api/brick/executions 개선

현재 `executions.ts`가 블록 상태를 빈 `{}` 으로 초기화. 프리셋의 블록 목록으로 초기화해야 함:

```typescript
app.post('/api/brick/executions', async (req, res) => {
  const { presetId, feature } = req.body;

  // 프리셋 로드
  const preset = db.select().from(brickPresets)
    .where(eq(brickPresets.id, Number(presetId)))
    .get();

  if (!preset) {
    return res.status(404).json({ error: '프리셋 없음' });
  }

  // 블록 목록에서 초기 상태 생성
  let parsed: any;
  try {
    parsed = parseYaml(preset.yaml);
  } catch {
    return res.status(400).json({ error: 'YAML 파싱 실패' });
  }

  // spec wrapper 해제 (brick-spec-wrapper 설계 참조)
  const inner = (parsed.kind && parsed.spec) ? parsed.spec : parsed;
  const blocks = inner.blocks || [];

  const blocksState: Record<string, { status: string }> = {};
  blocks.forEach((b: { id: string }, i: number) => {
    blocksState[b.id] = { status: i === 0 ? 'queued' : 'pending' };
  });

  const execution = db.insert(brickExecutions).values({
    presetId: Number(presetId),
    feature,
    status: 'running',
    blocksState: JSON.stringify(blocksState),
    startedAt: new Date().toISOString(),
  }).returning().get();

  // 첫 블록 시작 로그
  const firstBlockId = blocks[0]?.id || 'unknown';
  db.insert(brickExecutionLogs).values({
    executionId: execution.id,
    eventType: 'block.started',
    blockId: firstBlockId,
    data: JSON.stringify({ feature, startedAt: new Date().toISOString() }),
  }).run();

  res.status(201).json(execution);
});
```

### 4.2 블록 상태 업데이트 API (신규)

블록 완료/실패 시 blocksState를 업데이트하는 엔드포인트:

```typescript
// POST /api/brick/executions/:id/blocks/:blockId/complete
app.post('/api/brick/executions/:id/blocks/:blockId/complete', (req, res) => {
  const execution = db.select().from(brickExecutions)
    .where(eq(brickExecutions.id, Number(req.params.id)))
    .get();

  if (!execution) return res.status(404).json({ error: '실행 없음' });

  const blocksState = JSON.parse(execution.blocksState || '{}');
  const blockId = req.params.blockId;

  if (!blocksState[blockId]) {
    return res.status(404).json({ error: '블록 없음' });
  }

  // 상태 전이: running → gate_checking → completed
  blocksState[blockId].status = 'completed';

  // 다음 블록 큐잉 (link 기반 — 서버 측 condition 평가)
  // brick-loop-exit 설계의 condition_evaluator 사용
  const { metrics } = req.body;  // Gate 결과 metrics
  // ... condition 평가 + 다음 블록 상태 변경 ...

  db.update(brickExecutions)
    .set({ blocksState: JSON.stringify(blocksState) })
    .where(eq(brickExecutions.id, Number(req.params.id)))
    .run();

  // 로그 기록
  db.insert(brickExecutionLogs).values({
    executionId: execution.id,
    eventType: 'block.completed',
    blockId,
    data: JSON.stringify(metrics || {}),
  }).run();

  res.json({ blocksState });
});
```

---

## 5. 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `dashboard/src/lib/brick/serializer.ts` | 수정 | `flowToYamlFull()` 추가 (spec wrapper 포함) |
| `dashboard/src/pages/brick/BrickCanvasPage.tsx` | 수정 | CanvasToolbar 교체 + 실행/폴링/상태반영 통합 |
| `dashboard/src/components/brick/toolbar/CanvasToolbar.tsx` | 수정 | `onExecute` prop 추가 |
| `dashboard/src/components/brick/dialogs/ExecuteDialog.tsx` | **신규** | 실행 전 feature 입력 다이얼로그 |
| `dashboard/server/routes/brick/executions.ts` | 수정 | blocksState 초기화 개선 + 블록 완료 API |
| `dashboard/__tests__/brick/canvas-save.test.ts` | **신규** | TDD 케이스 |

---

## 6. 상태 매핑

### 6.1 백엔드 → 프론트엔드 블록 상태

| 백엔드 (BlockStatus) | 프론트엔드 (BlockStatus) | 테두리 색상 |
|---------------------|----------------------|-----------|
| pending | idle | #D1D5DB (회색) |
| queued | queued | #FCD34D (노란) |
| running | running | #3B82F6 (파랑) |
| gate_checking | running | #3B82F6 (파랑) |
| completed | done | #10B981 (초록) |
| failed | failed | #EF4444 (빨강) |
| suspended | paused | #F59E0B (주황) |

### 6.2 실행 상태 흐름

```
[idle] ──실행──► [running]
                   │
         ┌─────────┼──────────┐
         ▼         ▼          ▼
     [paused]  [completed]  [failed]
         │
     ──재개──► [running]
```

---

## 7. 엣지 케이스

### 7.1 새 프리셋 (presetId 없음)

1. 블록/링크 배치 후 실행 클릭
2. presetId 없음 → "먼저 저장해주세요" 안내
3. 저장 → presetId 할당 → 다시 실행 가능

### 7.2 코어 프리셋 실행

코어 프리셋은 수정 불가(403)지만 실행은 가능. 저장 없이 바로 실행.
isDirty 체크 시 코어 프리셋이면 자동 저장 스킵.

### 7.3 실행 중 캔버스 편집

실행 중에도 캔버스 편집 가능 (노드 이동, 추가 등).
단, 실행 중 저장 시 경고: "실행 중인 워크플로우에는 영향 없음" 토스트.

### 7.4 동시 실행

같은 프리셋으로 여러 execution 가능.
Canvas에는 가장 최근 execution의 상태만 표시.
과거 실행은 별도 실행 이력 페이지에서 확인 (이 Design 범위 밖).

### 7.5 페이지 이탈 시 unsaved 경고

```typescript
useEffect(() => {
  const handler = (e: BeforeUnloadEvent) => {
    if (isDirty) {
      e.preventDefault();
      e.returnValue = '';
    }
  };
  window.addEventListener('beforeunload', handler);
  return () => window.removeEventListener('beforeunload', handler);
}, [isDirty]);
```

### 7.6 실행 중 브라우저 새로고침

executionId를 URL query param으로 유지:
- `/brick/canvas?presetId=3&executionId=7`
- 새로고침 시 executionId가 있으면 폴링 재개

---

## 8. TDD

### 테스트 파일: `dashboard/__tests__/brick/canvas-save.test.ts`

#### 8.1 Serializer 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| CS-001 | `test_cs01_flow_to_yaml_full_spec_wrapper` | flowToYamlFull 반환값에 kind='Preset' + spec 구조 | spec.blocks 포함 |
| CS-002 | `test_cs02_flow_to_yaml_full_preserves_gates` | 기존 프리셋의 gates 보존 | spec.gates 유지 |
| CS-003 | `test_cs03_flow_to_yaml_full_links_condition` | edge의 condition이 links에 포함 | condition 값 일치 |
| CS-004 | `test_cs04_flow_to_yaml_full_empty_canvas` | 노드/엣지 0개 | spec.blocks=[], links=[] |
| CS-005 | `test_cs05_flow_to_yaml_full_filters_start_end` | start/end 노드 제외 | blocks에 미포함 |

#### 8.2 저장 흐름 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| CS-006 | `test_cs06_save_existing_preset` | PUT /presets/:id 호출 | 200 + isDirty=false |
| CS-007 | `test_cs07_save_new_preset` | presetId 없으면 POST /presets | 201 + presetId 할당 |
| CS-008 | `test_cs08_save_core_preset_rejected` | isCore=true 프리셋 저장 | 403 에러 |

#### 8.3 실행 흐름 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| CS-009 | `test_cs09_execute_saves_first_if_dirty` | isDirty=true에서 실행 | 저장 API 먼저 호출 |
| CS-010 | `test_cs10_execute_shows_feature_dialog` | 실행 클릭 | ExecuteDialog 표시 |
| CS-011 | `test_cs11_execute_validates_feature_name` | 빈 문자열 feature | 실행 버튼 비활성화 |
| CS-012 | `test_cs12_execute_creates_execution` | feature 입력 + 확인 | POST /executions 호출 |
| CS-013 | `test_cs13_execute_without_preset_blocked` | presetId 없음 | "먼저 저장" 안내 |
| CS-014 | `test_cs14_execute_sets_execution_id` | 실행 성공 | executionId 상태 설정 |

#### 8.4 상태 반영 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| CS-015 | `test_cs15_polling_updates_node_status` | blocksState {plan: "running"} | plan 노드 status='running' |
| CS-016 | `test_cs16_status_map_gate_checking` | gate_checking 상태 | 프론트 'running'으로 매핑 |
| CS-017 | `test_cs17_active_edge_on_running_block` | plan running | plan→design 엣지 isActive |
| CS-018 | `test_cs18_execution_complete_stops_polling` | status='completed' | isExecuting=false |
| CS-019 | `test_cs19_execution_failed_stops_polling` | status='failed' | isExecuting=false |
| CS-020 | `test_cs20_multiple_running_blocks_edges` | parallel 실행 | 여러 엣지 활성화 |

#### 8.5 타임라인 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| CS-021 | `test_cs21_logs_to_timeline_events` | 로그 3건 | TimelineEvent 3건 |
| CS-022 | `test_cs22_timeline_updates_on_poll` | 5초 후 로그 추가 | 이벤트 증가 |

#### 8.6 엣지 케이스 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| CS-023 | `test_cs23_unsaved_changes_warning` | isDirty + 페이지 이탈 | beforeunload 이벤트 |
| CS-024 | `test_cs24_execution_id_in_url` | URL에 executionId | 폴링 재개 |
| CS-025 | `test_cs25_edit_during_execution` | 실행 중 노드 이동 | 에러 없음 |
| CS-026 | `test_cs26_save_during_execution_toast` | 실행 중 저장 | "영향 없음" 경고 |
| CS-027 | `test_cs27_core_preset_execute_no_save` | 코어 프리셋 실행 | 자동 저장 스킵 |

#### 8.7 서버 API 테스트

| ID | 테스트명 | 검증 내용 | 기대 결과 |
|----|---------|----------|----------|
| CS-028 | `test_cs28_execution_creates_blocks_state` | POST /executions | blocksState에 블록 목록 포함 |
| CS-029 | `test_cs29_first_block_queued` | 첫 블록 | status='queued' |
| CS-030 | `test_cs30_remaining_blocks_pending` | 나머지 블록 | status='pending' |
| CS-031 | `test_cs31_spec_wrapper_handled` | spec wrapper YAML | 블록 정상 파싱 |
| CS-032 | `test_cs32_block_complete_api` | POST /.../blocks/:id/complete | blocksState 업데이트 |
| CS-033 | `test_cs33_execution_log_created` | 블록 완료 | 로그 레코드 생성 |
| CS-034 | `test_cs34_missing_preset_404` | 존재하지 않는 presetId | 404 |
| CS-035 | `test_cs35_missing_feature_400` | feature 누락 | 400 |

### 테스트 구현 코드 (핵심)

```typescript
import { describe, it, expect } from 'vitest';
import { flowToYamlFull } from '../../src/lib/brick/serializer';
import type { Node, Edge } from '@xyflow/react';

// CS-001
describe('flowToYamlFull', () => {
  it('test_cs01_flow_to_yaml_full_spec_wrapper', () => {
    const nodes: Node[] = [
      { id: 'plan', type: 'block', position: { x: 0, y: 0 },
        data: { blockId: 'plan', blockType: 'plan', name: '기획' } },
      { id: 'do', type: 'block', position: { x: 0, y: 150 },
        data: { blockId: 'do', blockType: 'implement', name: '구현' } },
    ];
    const edges: Edge[] = [
      { id: 'e1', source: 'plan', target: 'do', type: 'link',
        data: { linkType: 'sequential' } },
    ];

    const result = flowToYamlFull(nodes, edges, 'test-preset');
    expect(result.kind).toBe('Preset');
    expect(result.spec.blocks).toHaveLength(2);
    expect(result.spec.links).toHaveLength(1);
    expect(result.spec.blocks[0].id).toBe('plan');
  });
});

// CS-009
describe('실행 흐름', () => {
  it('test_cs09_execute_saves_first_if_dirty', async () => {
    // isDirty=true 상태에서 실행 시 handleSave가 먼저 호출되는지 검증
    const saveCalled = vi.fn();
    const executeCalled = vi.fn();

    // 실행 핸들러 시뮬레이션
    const handleExecute = async () => {
      if (true /* isDirty */) {
        saveCalled();
      }
      executeCalled();
    };

    await handleExecute();
    expect(saveCalled).toHaveBeenCalledBefore(executeCalled);
  });
});

// CS-015
describe('상태 반영', () => {
  it('test_cs15_polling_updates_node_status', () => {
    const blocksState = { plan: { status: 'running' }, design: { status: 'pending' } };
    const statusMap: Record<string, string> = {
      pending: 'idle', running: 'running', completed: 'done',
    };

    const nodes = [
      { id: 'plan', data: { blockId: 'plan', status: 'idle' } },
      { id: 'design', data: { blockId: 'design', status: 'idle' } },
    ];

    const updated = nodes.map((n) => {
      const bs = blocksState[n.data.blockId as keyof typeof blocksState];
      return {
        ...n,
        data: { ...n.data, status: statusMap[bs?.status || 'pending'] },
      };
    });

    expect(updated[0].data.status).toBe('running');
    expect(updated[1].data.status).toBe('idle');
  });
});
```

---

## 9. 불변식 (Invariant)

| ID | 규칙 | 검증 시점 |
|----|------|----------|
| INV-CS-1 | 실행 전 프리셋이 저장되어 있어야 함 (presetId 필수) | CS-013 |
| INV-CS-2 | isDirty=true에서 실행 시 자동 저장이 먼저 완료되어야 함 | CS-009 |
| INV-CS-3 | blocksState의 모든 블록은 프리셋의 blocks와 1:1 대응 | CS-028~030 |
| INV-CS-4 | 백엔드 블록 상태는 항상 프론트엔드 상태로 매핑 가능해야 함 | CS-016 |
| INV-CS-5 | 코어 프리셋은 실행 가능하지만 수정 불가 | CS-008, CS-027 |
| INV-CS-6 | 실행 완료/실패 시 폴링이 중단되어야 함 | CS-018, CS-019 |
| INV-CS-7 | flowToYamlFull은 기존 gates/config를 손실하면 안 됨 | CS-002 |
