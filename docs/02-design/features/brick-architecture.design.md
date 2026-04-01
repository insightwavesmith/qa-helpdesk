# Brick Architecture Design V2 — 범용 워크플로우 엔진

> 작성일: 2026-04-02
> V1: `docs/02-design/features/archive/brick-architecture-v1.design.md`
> Plan: `docs/01-plan/features/brick-architecture.plan.md`
> TASK: `/Users/smith/.openclaw/workspace/tasks/TASK-BRICK-DESIGN-V2.md`
> 프로세스 레벨: L3 (아키텍처 설계)
> 작성자: PM팀

---

## Executive Summary

| 항목 | V1 | V2 |
|------|-----|-----|
| 엔진 | engine.sh (bash God Script) | **Python CLI 패키지** (`pip install brick-engine`) |
| Team | JSON 정의만 | **Adapter 패턴** (Claude Agent Teams = adapter 중 하나) |
| Gate | bash script만 | **4가지 타입** (command/http/prompt/agent) |
| 아키텍처 | Claude Code hook 종속 | **독립 CLI** (어디서든 실행) |
| 상태 관리 | JSON 파일 직접 조작 | **상태 머신** + 이벤트 버스 + 체크포인트 |
| 확장 | bash script 추가 | **플러그인 아키텍처** (Python 모듈) |
| 테스트 | bash 단위 테스트 | **pytest** (자동화, 타입힌트, 커버리지) |

### 유지 (V1→V2 변경 없음)
- **3축**: Block(what+done+gate) × Team(who+tool) × Link(how)
- **3층**: System Layer(불변) → Process Layer(조합) → Autonomy Layer(자유)
- **불변 규칙 INV-1~8**: 전부 유지
- **핵심 철학**: "완전히 강제된 시스템 속에서 완벽한 자율화"
- **프리셋 YAML 형식**: 유지 (adapter 필드 추가)
- **브랜딩**: Brick, "Build it. Block by Block."

### Value Delivered

| 관점 | 내용 |
|------|------|
| Problem | V1이 Claude Code bash hook에 종속. engine.sh가 God Script. bash로 JSON 파싱 한계. Claude Code 없이 사용 불가 |
| Solution | 독립 Python CLI 엔진. Team=Adapter 패턴으로 어떤 에이전트 프레임워크든 연결. Gate에 LLM 평가 가능 |
| Core Value | Brick = 범용 워크플로우 엔진. Claude Agent Teams는 adapter 중 하나. 세계적으로 쓸 수 있는 도구 |

---

## 1. 전체 아키텍처

### 1.1 시스템 구조도

```
┌─────────────────────────────────────────────────────────────────┐
│                        brick CLI                                │
│  brick start / status / complete / approve / viz / validate     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Engine Core                            │  │
│  │  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐   │  │
│  │  │ StateMachine │  │ EventBus │  │ CheckpointStore  │   │  │
│  │  │ (상태 전이)   │  │ (발행/구독)│  │ (저장/복구)       │   │  │
│  │  └──────┬───────┘  └────┬─────┘  └────────┬─────────┘   │  │
│  │         │               │                  │              │  │
│  │  ┌──────┴───────────────┴──────────────────┴───────────┐ │  │
│  │  │              WorkflowExecutor                       │ │  │
│  │  │  프리셋 로드 → 인스턴스 생성 → 블록 실행 → gate 판정  │ │  │
│  │  └─────────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │  Block   │  │  Link    │  │  Gate    │  │  Team        │   │
│  │ Registry │  │ Registry │  │ Registry │  │ Adapter Pool │   │
│  │ (플러그인)│  │ (플러그인)│  │ (플러그인)│  │ (플러그인)    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
│                                                                 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                  Integration Layer                        │  │
│  │  Claude Code hook (thin wrapper) │ GitHub Actions │ n8n  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### 1.2 3층 아키텍처 (V2)

```
┌──────────────────────────────────────────────────────────────┐
│                    Autonomy Layer (자유)                      │
│  팀 내부 작업 방식 — Adapter가 팀에게 Block을 전달한 후       │
│  팀 안에서 어떻게 처리하는지는 팀 자율                         │
├──────────────────────────────────────────────────────────────┤
│                    Process Layer (조합 가능)                   │
│  워크플로우 정의 (YAML 프리셋) + Block/Link/Gate/Adapter 조합 │
│  presets/*.yaml + plugins                                    │
├──────────────────────────────────────────────────────────────┤
│                    System Layer (불변 — 헌법)                  │
│  Engine Core (StateMachine + EventBus + Checkpoint)          │
│  Invariants INV-1~8 + Plugin Interface Contracts             │
│  brick/ Python 패키지                                        │
└──────────────────────────────────────────────────────────────┘
```

### 1.3 불변 규칙 (Invariants) — V1 유지 + V2 추가

| # | 규칙 | 출처 |
|---|------|------|
| INV-1 | TASK 없이 워크플로우 시작 불가 | V1 |
| INV-2 | Block에 what + done 없으면 블록이 아님 | V1 |
| INV-3 | 산출물 없이 다음 Block 진행 불가 | V1 |
| INV-4 | 모든 Block 전환은 Event History에 기록 | V1 |
| INV-5 | Team(Adapter) 배정 없는 Block 실행 불가 | V1 (확장) |
| INV-6 | Link 정의 없는 Block 간 전환 불가 | V1 |
| INV-7 | 워크플로우 그래프에 의도하지 않은 순환 불가 | V1 §12 |
| INV-8 | Core 프리셋 무단 수정 불가 | V1 §12 |
| INV-9 | **상태 전이는 StateMachine을 통해서만** (직접 JSON 수정 금지) | V2 신규 |
| INV-10 | **모든 상태 변경은 Checkpoint에 저장** (크래시 후 복구 보장) | V2 신규 |

### 1.4 설계 원칙 (Temporal + Kestra에서 배운 것)

| 원칙 | 출처 | Brick 적용 |
|------|------|-----------|
| **Workflow = Deterministic State Machine** | Temporal | engine은 순수 함수: (현재 상태, 이벤트) → 다음 상태. side effect 없음 |
| **Activity = Side Effect** | Temporal | 실제 작업(코드 작성, 배포)은 TeamAdapter에 위임. engine은 상태만 |
| **Everything is Plugin** | Kestra | Block 타입, Gate 타입, Link 타입, Team Adapter 전부 플러그인 |
| **YAML Declarative** | Kestra | 기본은 YAML, 복잡한 건 Python 플러그인으로 확장 |
| **Event-Driven** | Kestra | 블록 전이마다 이벤트 발행 → 구독자 반응 |
| **Checkpoint + Replay** | Temporal | 크래시 후 마지막 checkpoint에서 정확히 재개 |
| **Serverless First** | Brick 고유 | 별도 서버 없이 CLI로 동작. 나중에 서버 모드 추가 가능 |
| **Task Queue (경량)** | Temporal | 블록 실행을 큐로 디스패치 → 팀 경합 해결 (초기: 파일 기반 큐) |

---

## 2. Engine Core

### 2.1 StateMachine (상태 머신)

**위치**: `brick/engine/state_machine.py`

워크플로우와 블록의 상태 전이를 관리하는 **순수 함수형** 엔진. side effect 없음.

#### 워크플로우 상태

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │ start
                    ┌────▼────┐
              ┌─────│ running │─────┐
              │     └────┬────┘     │
              │          │          │
         suspended   completed   failed
              │          │          │
              └──→ running ◄───────┘  (resume / retry)
```

```python
class WorkflowStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SUSPENDED = "suspended"     # 선점으로 일시정지
```

#### 블록 상태

```
pending → queued → running → gate_checking → completed
                      │            │
                      │        gate_failed → retry / rollback
                      │
                   failed → retry / escalate
```

```python
class BlockStatus(Enum):
    PENDING = "pending"
    QUEUED = "queued"           # TaskQueue에 들어감
    RUNNING = "running"         # Adapter가 실행 중
    GATE_CHECKING = "gate_checking"
    COMPLETED = "completed"
    FAILED = "failed"
    SUSPENDED = "suspended"
```

#### 상태 전이 함수 (핵심)

```python
class StateMachine:
    """순수 함수형 상태 머신. side effect 없음."""
    
    def transition(
        self, 
        workflow: WorkflowInstance, 
        event: Event
    ) -> tuple[WorkflowInstance, list[Command]]:
        """
        (현재 상태, 이벤트) → (다음 상태, 실행할 명령 목록)
        
        Commands는 engine 외부에서 실행:
        - StartBlock(block_id, adapter)
        - CheckGate(block_id, gates)
        - EmitEvent(event)
        - SaveCheckpoint(state)
        """
        ...
```

**핵심**: StateMachine.transition()은 **순수 함수**. 파일 I/O, 네트워크, 프로세스 실행 없음. 테스트가 극도로 쉬움.

### 2.2 EventBus (이벤트 버스)

**위치**: `brick/engine/event_bus.py`

블록 전이마다 이벤트를 발행하고, 구독자가 반응.

```python
class EventBus:
    """초기: 단순 콜백 리스트. 나중에 Redis/Kafka로 교체 가능."""
    
    def subscribe(self, event_type: str, handler: Callable) -> None: ...
    def publish(self, event: Event) -> None: ...
    def replay(self, events: list[Event]) -> None: ...  # checkpoint 복구용
```

#### 이벤트 타입

| 이벤트 | 발행 시점 | 기본 구독자 |
|--------|----------|------------|
| `workflow.started` | 워크플로우 시작 | 로거 |
| `workflow.completed` | 마지막 블록 gate 통과 | 로거, 알림 |
| `workflow.failed` | 복구 불가 실패 | 로거, 알림, escalation |
| `block.started` | 블록 실행 시작 | 로거, 알림 (on_start hook) |
| `block.completed` | 블록 gate 통과 | 로거, 알림 (on_complete hook), 체인 |
| `block.failed` | 블록 실패 | 로거, 알림 (on_fail hook) |
| `block.gate_passed` | gate 자동 통과 | 로거 |
| `block.gate_failed` | gate 실패 | retry/rollback 핸들러 |
| `block.gate_review_requested` | review gate 대기 | COO/Owner 알림 |
| `block.suspended` | 선점으로 일시정지 | 로거 |
| `block.resumed` | 선점 해제 후 재개 | 로거 |
| `adapter.started` | Adapter가 작업 시작 | 로거 |
| `adapter.heartbeat` | Adapter 생존 신호 | 타임아웃 와치독 |
| `adapter.completed` | Adapter 작업 완료 | gate 트리거 |
| `adapter.failed` | Adapter 실패 | recovery 핸들러 |

#### 이벤트-Hook 매핑 (Claude Code hook 4타입 연결)

```yaml
# 프리셋에서 이벤트-hook 바인딩
events:
  block.started:
    - type: command
      command: "echo '블록 시작: {block_id}'"
    - type: http
      url: "https://hooks.slack.com/..."
      body: {text: "🚀 {block_id} 시작"}
  block.completed:
    - type: command
      command: "brick chain-next --workflow {workflow_id}"
    - type: prompt
      prompt: "이 블록의 산출물 품질을 평가하라: {artifacts}"
      model: haiku
```

### 2.3 CheckpointStore (체크포인트)

**위치**: `brick/engine/checkpoint.py`

모든 상태 변경을 디스크에 저장. 크래시 후 정확한 상태에서 재개.

```python
class CheckpointStore:
    """파일 기반 체크포인트. 나중에 DB로 교체 가능."""
    
    def save(self, workflow_id: str, state: WorkflowInstance) -> None:
        """원자적 저장: temp 파일 → rename (반쪽짜리 쓰기 방지)"""
        ...
    
    def load(self, workflow_id: str) -> WorkflowInstance | None: ...
    
    def list_active(self) -> list[str]:
        """미완료 워크플로우 ID 목록 (세션 복구용)"""
        ...
    
    def save_event(self, workflow_id: str, event: Event) -> None:
        """이벤트 로그 append (replay용)"""
        ...
```

**저장 경로**: `.bkit/runtime/workflows/{workflow_id}/`
```
.bkit/runtime/workflows/signup-fix-20260402/
├── state.json          # 현재 상태 스냅샷
├── events.jsonl        # 이벤트 로그 (append-only)
└── blocks/
    ├── design.json     # 블록별 상세 상태
    └── do.json
```

**원자적 저장 (Atomic Write)**:
```python
def save(self, workflow_id, state):
    path = self._state_path(workflow_id)
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(state.to_dict(), indent=2))
    tmp.rename(path)  # 원자적 — 반쪽짜리 파일 불가
```

### 2.4 TaskQueue (경량 큐)

**위치**: `brick/engine/task_queue.py`

블록 실행을 큐에 넣고 순서대로 디스패치. 팀 경합 해결.

```python
class TaskQueue:
    """파일 기반 경량 큐. 별도 서버 불필요."""
    
    def enqueue(self, block_execution: BlockExecution) -> None: ...
    def dequeue(self, adapter_name: str) -> BlockExecution | None: ...
    def peek(self) -> list[BlockExecution]: ...
    
    # 우선순위 큐: L0 > L1 > L2 > L3
    def enqueue_priority(self, block_execution: BlockExecution, priority: int) -> None: ...
```

**경합 해결**: exclusive 팀에 2개 워크플로우 → 큐에 넣고 순서대로.

---

## 3. 축 1: Block (what + done + gate) — V1 유지 + V2 확장

### 3.1 Block 데이터 모델

**위치**: `brick/models/block.py`

```python
@dataclass
class Block:
    """Block = 단위 업무. what + done이 최소 필수."""
    
    id: str                              # 워크플로우 내 유일
    what: str                            # 필수: 뭘 하는가
    done: DoneCondition                  # 필수: 완료 조건
    
    type: str = "Custom"                 # 블록 타입 (레지스트리)
    description: str = ""
    gate: GateConfig | None = None       # 출구 조건
    input: InputConfig | None = None     # 이전 블록 산출물
    timeout: int | None = None           # 블록 타임아웃 (초)
    idempotent: bool = True              # 멱등성 (V1 §12.1.3)
    metadata: dict = field(default_factory=dict)

@dataclass
class DoneCondition:
    artifacts: list[str] = field(default_factory=list)   # 파일 경로 (glob)
    metrics: dict[str, Any] = field(default_factory=dict) # match_rate, tsc_errors 등
    custom: list[str] = field(default_factory=list)       # 커스텀 체크 스크립트

@dataclass
class GateConfig:
    handlers: list[GateHandler] = field(default_factory=list)  # V2: 4타입 지원
    review: ReviewConfig | None = None
    on_fail: str = "retry"              # retry | rollback | escalate | skip
    max_retries: int = 3
    on_review_reject: ReviewRejectConfig | None = None  # V1 §12.3.1

@dataclass
class GateHandler:
    """Gate = Hook 4가지 타입. Claude Code hook과 동일 구조."""
    type: str           # command | http | prompt | agent
    # type별 파라미터
    command: str | None = None          # type=command
    url: str | None = None              # type=http
    headers: dict | None = None         # type=http
    prompt: str | None = None           # type=prompt
    model: str | None = None            # type=prompt (기본: haiku)
    agent_prompt: str | None = None     # type=agent
    # 공통
    timeout: int = 30                   # 초
    on_fail: str = "fail"               # fail | warn | skip
```

### 3.2 Block 타입 레지스트리 — V1 유지

**위치**: `brick/presets/block-types.yaml` (V1과 동일 형식)

내장 9종: Plan, Design, Do, Check, Act, Research, Review, Report, Cron.
확장: `custom-types/` 디렉토리에 YAML 추가 또는 Python 플러그인.

### 3.3 Gate 4가지 타입 (V2 핵심 변경)

V1은 bash script만. V2는 Claude Code hook과 동일한 4가지 타입 지원.

| Type | 구현 | 용도 | 반환 |
|------|------|------|------|
| `command` | subprocess 실행 | 파일 존재, tsc, build, 커스텀 스크립트 | exit code 0=pass |
| `http` | HTTP POST/GET | 외부 서비스 헬스체크, webhook 검증 | status 200=pass |
| `prompt` | LLM 단일 턴 평가 | "이 Design이 요구사항을 충족하는가?" | yes/no 판정 |
| `agent` | 에이전트 스폰 (도구 사용 가능) | gap 분석, 코드 리뷰, 보안 감사 | 구조화된 결과 |

```python
class GateExecutor:
    """Gate handler를 실행하고 pass/fail 판정."""
    
    async def execute(self, handler: GateHandler, context: dict) -> GateResult:
        match handler.type:
            case "command":
                return await self._run_command(handler, context)
            case "http":
                return await self._run_http(handler, context)
            case "prompt":
                return await self._run_prompt(handler, context)
            case "agent":
                return await self._run_agent(handler, context)
    
    async def _run_prompt(self, handler, context):
        """LLM에 프롬프트 보내서 평가. 가벼운 모델(haiku) 사용."""
        prompt = handler.prompt.format(**context)
        response = await self.llm_client.evaluate(prompt, model=handler.model or "haiku")
        return GateResult(
            passed=response.decision == "yes",
            detail=response.reasoning,
            type="prompt"
        )
    
    async def _run_agent(self, handler, context):
        """서브에이전트 스폰. 도구 사용 가능 (파일 읽기, grep 등)."""
        result = await self.agent_runner.run(
            prompt=handler.agent_prompt.format(**context),
            tools=["Read", "Grep", "Glob"],
            timeout=handler.timeout
        )
        return GateResult(
            passed=result.verdict == "pass",
            detail=result.analysis,
            type="agent"
        )
```

#### Gate 순차 실행 + 혼합

```yaml
# 프리셋에서 gate 정의
gate:
  handlers:
    # 1단계: 자동 체크 (command)
    - type: command
      command: "npx tsc --noEmit --quiet"
    - type: command
      command: "npm run build"
    # 2단계: LLM 평가 (prompt)
    - type: prompt
      prompt: "다음 코드 변경이 Design 문서의 요구사항을 모두 충족하는지 평가하라: {diff}"
      model: haiku
    # 3단계: 에이전트 검증 (agent)  
    - type: agent
      agent_prompt: "변경된 파일의 테스트 커버리지를 확인하고 match_rate를 계산하라"
  
  # 평가 순서: 순차 실행. 하나라도 fail → 중단
  evaluation: sequential    # sequential | parallel | vote
  review:
    coo: true
  on_fail: retry
```

---

## 4. 축 2: Team Adapter Pattern (V2 핵심 변경)

### 4.1 TeamAdapter 인터페이스

**위치**: `brick/adapters/base.py`

```python
from abc import ABC, abstractmethod

class TeamAdapter(ABC):
    """Team = 인터페이스. 구현체는 어댑터.
    
    어댑터는 Block을 받아서 실행하고, 상태를 보고하고, 산출물을 반환.
    내부적으로 어떻게 실행하는지는 어댑터 자율 (Autonomy Layer).
    """
    
    @abstractmethod
    async def start_block(self, block: Block, context: BlockContext) -> str:
        """블록 실행 시작. execution_id 반환."""
        ...
    
    @abstractmethod
    async def check_status(self, execution_id: str) -> AdapterStatus:
        """실행 상태 확인."""
        ...
    
    @abstractmethod
    async def get_artifacts(self, execution_id: str) -> list[str]:
        """산출물 경로 목록 반환."""
        ...
    
    @abstractmethod
    async def cancel(self, execution_id: str) -> bool:
        """실행 취소."""
        ...
    
    # 선택 구현
    async def send_signal(self, execution_id: str, signal: dict) -> None:
        """실행 중인 블록에 신호 전송 (추가 지시 등)."""
        pass
    
    async def get_logs(self, execution_id: str) -> str:
        """실행 로그 반환."""
        return ""
```

### 4.2 어댑터 구현체

#### 4.2.1 ClaudeAgentTeamsAdapter (우리 기본값)

**위치**: `brick/adapters/claude_agent_teams.py`

```python
class ClaudeAgentTeamsAdapter(TeamAdapter):
    """Claude Code Agent Teams를 Brick Block 실행에 연결.
    
    동작 방식:
    1. start_block → tmux send-keys 또는 claude-peers 브로커로 리더에게 TASK 전달
    2. check_status → team-context.json / peer-map.json 확인
    3. get_artifacts → done.artifacts 경로 파일 존재 확인
    4. cancel → TeamDelete 또는 shutdown_request
    """
    
    def __init__(self, config: ClaudeTeamConfig):
        self.session: str = config.session          # tmux 세션 이름
        self.broker_port: int = config.broker_port   # claude-peers 포트 (7899)
        self.peer_role: str = config.peer_role       # CTO_LEADER 등
        self.team_context_dir: str = config.team_context_dir
    
    async def start_block(self, block, context):
        execution_id = f"{block.id}-{int(time.time())}"
        
        # 방법 1: claude-peers 메시지 (권장)
        message = {
            "type": "BLOCK_ASSIGNMENT",
            "block": block.to_dict(),
            "context": context.to_dict(),
            "execution_id": execution_id
        }
        await self._send_peer_message(self.peer_role, message)
        
        # 방법 2: tmux send-keys (fallback)
        # tmux send-keys -t {session} "TASK: {block.what}" Enter
        
        return execution_id
    
    async def check_status(self, execution_id):
        # task-state JSON 확인 또는 peer 상태 확인
        state_file = Path(self.team_context_dir) / f"task-state-{execution_id}.json"
        if state_file.exists():
            data = json.loads(state_file.read_text())
            return AdapterStatus(
                status=data.get("status", "running"),
                progress=data.get("progress"),
                message=data.get("message")
            )
        return AdapterStatus(status="running")
    
    async def get_artifacts(self, execution_id):
        # block.done.artifacts 경로의 파일을 glob으로 확인
        ...
```

#### 4.2.2 SingleClaudeCodeAdapter

```python
class SingleClaudeCodeAdapter(TeamAdapter):
    """Claude Code 단독 실행 (팀 없이).
    subprocess로 claude 명령 실행."""
    
    async def start_block(self, block, context):
        proc = await asyncio.create_subprocess_exec(
            "claude", "--print", "--dangerously-skip-permissions",
            "-m", f"TASK: {block.what}\n\nContext: {json.dumps(context.to_dict())}",
            stdout=asyncio.subprocess.PIPE
        )
        ...
```

#### 4.2.3 HumanAdapter

```python
class HumanAdapter(TeamAdapter):
    """사람이 직접 수행. CLI에서 완료 입력 대기."""
    
    async def start_block(self, block, context):
        print(f"\n🧱 Block: {block.what}")
        print(f"   Done 조건: {block.done}")
        print(f"   완료하면 'brick complete --block {block.id}' 실행\n")
        return f"human-{block.id}-{int(time.time())}"
    
    async def check_status(self, execution_id):
        # .bkit/runtime/human-completions/{execution_id} 파일 존재 확인
        if completion_file.exists():
            return AdapterStatus(status="completed")
        return AdapterStatus(status="waiting_human")
```

#### 4.2.4 WebhookAdapter

```python
class WebhookAdapter(TeamAdapter):
    """외부 서비스에 HTTP로 블록 실행 위임."""
    
    async def start_block(self, block, context):
        response = await httpx.post(
            self.config.url,
            json={"block": block.to_dict(), "context": context.to_dict()},
            headers=self.config.headers
        )
        return response.json()["execution_id"]
    
    async def check_status(self, execution_id):
        response = await httpx.get(f"{self.config.url}/status/{execution_id}")
        return AdapterStatus(**response.json())
```

#### 4.2.5 어댑터 무관성 (Adapter Agnosticism)

**핵심 원칙**: 어댑터를 교체해도 워크플로우 동작은 동일.

```yaml
# 같은 프리셋, 다른 어댑터
teams:
  do:
    adapter: claude_agent_teams    # Claude로 실행
    config: {session: sdk-cto}
  
  # 또는:
  do:
    adapter: human                 # 사람이 직접
  
  # 또는:
  do:
    adapter: webhook               # 외부 서비스에 위임
    config: {url: "https://api.example.com/execute"}
```

engine 입장에서는 전부 `TeamAdapter.start_block()` → `check_status()` → `get_artifacts()`. 내부가 Claude든 사람이든 무관.

### 4.3 Autonomy Layer 경계 — 팀이 못 하는 것

어댑터에 위임된 후 팀 내부는 자율. **하지만 이것은 불가**:

| 금지 | 이유 |
|------|------|
| Block 정의 수정 (what/done 변경) | System Layer 불변 |
| Gate 비활성화 | System Layer 불변 |
| 다른 Block으로 직접 전환 | engine만 가능 |
| 워크플로우 인스턴스 직접 수정 | StateMachine만 가능 |
| 다른 팀의 Block에 간섭 | 팀 격리 원칙 |

---

## 5. 축 3: Link — V1 유지

V1의 7가지 Link 타입 (sequential, parallel, compete, loop, cron, branch, custom) 전부 유지.

V2 변경: Link 핸들러도 **Python 플러그인**으로 구현.

**위치**: `brick/links/`

```python
class LinkHandler(ABC):
    """Link 타입별 동작 정의."""
    
    @abstractmethod
    def evaluate(self, source_block: BlockInstance, context: dict) -> LinkDecision:
        """다음 블록(들)을 결정."""
        ...

class SequentialLink(LinkHandler):
    def evaluate(self, source_block, context):
        if source_block.status == "completed":
            return LinkDecision(next_blocks=[self.target_id])
        elif source_block.status == "failed":
            return LinkDecision(next_blocks=[self.on_fail_target])

class ParallelLink(LinkHandler):
    """모든 대상 블록을 동시에 시작."""
    def evaluate(self, source_block, context):
        return LinkDecision(
            next_blocks=self.target_ids,
            parallel=True,
            merge_strategy=self.merge   # all | any | n_of_m
        )

class CompeteLink(LinkHandler):
    """같은 블록을 N개 어댑터로 동시 실행 → judge가 선택."""
    ...

class LoopLink(LinkHandler):
    """gate 실패 시 이전 블록으로. max_retries 제한."""
    ...

class BranchLink(LinkHandler):
    """조건에 따라 분기."""
    ...

class CronLink(LinkHandler):
    """스케줄 기반 반복 트리거."""
    ...
```

### Compete judge:auto 기준 정의 (V1 보완)

```yaml
# compete 타입 judge 설정
links:
  - from: research
    to: research
    type: compete
    teams: [pm-team-a, pm-team-b]
    judge:
      type: auto                 # auto | review
      metric: "file_line_count"  # 파일 줄 수 비교 (많을수록 우수)
      # 또는:
      metric: "match_rate"       # gap 분석 점수
      # 또는:
      type: prompt               # LLM이 판단
      prompt: "두 산출물을 비교하여 더 우수한 것을 선택하라: A={artifact_a}, B={artifact_b}"
```

---

## 6. 워크플로우 엔진 (WorkflowExecutor)

### 6.1 실행 흐름

```python
class WorkflowExecutor:
    """워크플로우 전체 실행 관리."""
    
    def __init__(self, state_machine, event_bus, checkpoint, gate_executor, adapter_pool):
        ...
    
    async def start(self, preset: str, feature: str, task: str) -> str:
        """워크플로우 시작."""
        # 1. 프리셋 로드 + 검증
        workflow_def = self.preset_loader.load(preset)
        self.validator.validate(workflow_def)  # DAG 검증, 스키마 검증
        
        # 2. 인스턴스 생성
        instance = WorkflowInstance.from_definition(workflow_def, feature, task)
        
        # 3. 체크포인트 저장
        self.checkpoint.save(instance.id, instance)
        
        # 4. 첫 블록 시작
        first_block = instance.get_first_block()
        await self._execute_block(instance, first_block)
        
        # 5. 이벤트 발행
        self.event_bus.publish(Event("workflow.started", instance.id))
        
        return instance.id
    
    async def complete_block(self, workflow_id: str, block_id: str):
        """블록 완료 보고 → gate 판정 → 다음 블록."""
        instance = self.checkpoint.load(workflow_id)
        
        # 1. gate 실행
        gate_result = await self.gate_executor.run_gates(
            instance.blocks[block_id],
            instance.context
        )
        
        # 2. 상태 전이
        event = Event("block.gate_passed" if gate_result.passed else "block.gate_failed")
        instance, commands = self.state_machine.transition(instance, event)
        
        # 3. 체크포인트 저장
        self.checkpoint.save(workflow_id, instance)
        self.checkpoint.save_event(workflow_id, event)
        
        # 4. 명령 실행
        for cmd in commands:
            await self._execute_command(cmd)
    
    async def resume(self, workflow_id: str):
        """크래시 후 재개. 체크포인트에서 상태 복구."""
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            raise WorkflowNotFound(workflow_id)
        
        current_block = instance.get_current_block()
        if current_block.status == "running":
            # adapter에서 상태 확인
            adapter = self.adapter_pool.get(current_block.adapter)
            status = await adapter.check_status(current_block.execution_id)
            ...
```

### 6.2 컨텍스트 자동 주입 (V1 §5.4 유지 + 확장)

```python
@dataclass
class BlockContext:
    """블록 실행 시 주입되는 컨텍스트."""
    
    workflow_id: str
    block_id: str
    feature: str
    task: str
    
    # 이전 블록 산출물 (자동 주입)
    input_artifacts: list[str]
    
    # 이전 블록 메트릭 (자동 주입)
    previous_metrics: dict
    
    # 컨텍스트 계약 (V1 §12.5.1)
    context_contract: dict | None = None
    
    # 환경 변수
    env: dict = field(default_factory=dict)
```

---

## 7. CLI 인터페이스

**위치**: `brick/cli.py` (Click 기반)

```python
import click

@click.group()
def cli():
    """🧱 Brick — Build it. Block by Block."""
    pass

@cli.command()
@click.option("--preset", required=True, help="프리셋 이름 (t-pdca-l2 등)")
@click.option("--feature", required=True, help="피처 이름")
@click.option("--task", default=None, help="TASK 파일 경로")
@click.option("--adapter", default="claude_agent_teams", help="기본 Team adapter")
def start(preset, feature, task, adapter):
    """워크플로우 시작."""
    ...

@cli.command()
@click.argument("workflow_id", required=False)
def status(workflow_id):
    """워크플로우 상태 확인."""
    ...

@cli.command()
@click.option("--block", required=True)
@click.option("--workflow", required=True)
def complete(block, workflow):
    """블록 완료 보고 → gate 판정."""
    ...

@cli.command()
@click.option("--block", required=True)
@click.option("--workflow", required=True)
@click.option("--reviewer", required=True)
def approve(block, workflow, reviewer):
    """Review gate 수동 승인."""
    ...

@cli.command()
@click.argument("workflow_id", required=False)
def viz(workflow_id):
    """워크플로우 시각화 (CLI)."""
    ...

@cli.command()
@click.option("--preset", required=True)
def validate(preset):
    """프리셋 검증 (DAG, 스키마, 참조)."""
    ...

@cli.command()
@click.option("--block", required=True)
@click.option("--workflow", required=True)
def gate(block, workflow):
    """Gate 수동 실행."""
    ...

@cli.command()
def init():
    """.bkit/ 디렉토리 초기화."""
    ...
```

---

## 8. Claude Code Integration (Thin Wrapper)

V2에서 Claude Code hook은 `brick` CLI를 호출하는 **1줄짜리 thin wrapper**.

### 8.1 settings.local.json 변경

```json
{
  "hooks": {
    "TaskCompleted": [{
      "hooks": [{
        "type": "command",
        "command": "brick complete --block $(cat /dev/stdin | python3 -c 'import sys,json; print(json.load(sys.stdin).get(\"task_subject\",\"\"))') --workflow $(cat .bkit/runtime/active-workflow)",
        "timeout": 30000
      }]
    }]
  }
}
```

### 8.2 기존 hook → brick CLI 매핑

| 기존 hook | V2 brick CLI | 역할 |
|-----------|-------------|------|
| gate-checker.sh | `brick gate --block {id}` | gate 판정 |
| pdca-chain-handoff.sh | `brick complete --block {id}` + EventBus | 체인 전달 |
| detect-work-type.sh | `brick start --preset auto` | 프리셋 자동 선택 |
| notify-task-started.sh | EventBus subscriber (http hook) | 알림 |
| notify-completion.sh | EventBus subscriber (http hook) | 알림 |
| session-resume-check.sh | `brick resume` | 미완료 워크플로우 재개 |

---

## 9. 프리셋 시스템 — V1 유지 + adapter 필드 추가

### 9.1 V2 프리셋 형식

```yaml
# .bkit/presets/t-pdca-l2.yaml
$schema: brick/preset-v2
name: "T-PDCA L2 표준"
description: "일반 기능 개발 — Plan + Design + Do + Check + Act"

blocks:
  - id: plan
    type: Plan
    what: "요구사항 분석"
  - id: design
    type: Design
    what: "상세 설계 + TDD"
  - id: do
    type: Do
    what: "구현"
  - id: check
    type: Check
    what: "Gap 분석"
  - id: act
    type: Act
    what: "배포 + 보고"

links:
  - {from: plan, to: design, type: sequential}
  - {from: design, to: do, type: sequential}
  - {from: do, to: check, type: sequential}
  - {from: check, to: do, type: loop, condition: {match_rate_below: 90}, max_retries: 3}
  - {from: check, to: act, type: sequential, condition: {match_rate_gte: 90}}

teams:                             # V2: adapter 지정
  plan: {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  design: {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  do: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  check: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  act: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}

gates:
  plan:
    handlers:
      - {type: command, command: "test -f docs/01-plan/features/{feature}.plan.md"}
    review: {coo: true}
  design:
    handlers:
      - {type: command, command: "test -f docs/02-design/features/{feature}.design.md"}
      - {type: agent, agent_prompt: "Design의 TDD 섹션이 모든 스펙을 커버하는지 확인하라"}
    review: {coo: true}
  do:
    handlers:
      - {type: command, command: "npx tsc --noEmit --quiet"}
      - {type: command, command: "npm run build"}
      - {type: agent, agent_prompt: "변경 파일과 Design 문서의 gap을 분석하라. match_rate 반환"}
  check:
    handlers:
      - {type: command, command: "brick gate-check match-rate --min 90"}
  act:
    handlers:
      - {type: command, command: "curl -sf https://bscamp.app/api/health"}

events:
  block.started:
    - {type: http, url: "${SLACK_WEBHOOK}", body: {text: "🧱 {block_id} 시작 | {feature}"}}
  block.completed:
    - {type: http, url: "${SLACK_WEBHOOK}", body: {text: "✅ {block_id} 완료 | {feature}"}}
```

---

## 10. 플러그인 아키텍처

### 10.1 플러그인 타입

| 플러그인 | 인터페이스 | 등록 방법 |
|----------|-----------|----------|
| Block Type | `BlockTypePlugin` | `block-types.yaml` 또는 Python 모듈 |
| Gate Handler | `GateHandler` | 내장 + `brick/gates/` Python 파일 |
| Link Type | `LinkHandler` | 내장 + `brick/links/` Python 파일 |
| Team Adapter | `TeamAdapter` | 내장 + `brick/adapters/` Python 파일 |
| Event Subscriber | `EventSubscriber` | `events:` 섹션 또는 Python 모듈 |

### 10.2 플러그인 등록 (entry_points)

```toml
# pyproject.toml
[project.entry-points."brick.adapters"]
claude_agent_teams = "brick.adapters.claude_agent_teams:ClaudeAgentTeamsAdapter"
claude_code = "brick.adapters.claude_code:SingleClaudeCodeAdapter"
human = "brick.adapters.human:HumanAdapter"
webhook = "brick.adapters.webhook:WebhookAdapter"

[project.entry-points."brick.gates"]
artifact_exists = "brick.gates.artifact_exists:ArtifactExistsGate"
match_rate = "brick.gates.match_rate:MatchRateGate"
prompt_eval = "brick.gates.prompt_eval:PromptEvalGate"
agent_eval = "brick.gates.agent_eval:AgentEvalGate"

[project.entry-points."brick.links"]
sequential = "brick.links.sequential:SequentialLink"
parallel = "brick.links.parallel:ParallelLink"
compete = "brick.links.compete:CompeteLink"
```

외부 패키지도 entry_points로 플러그인 등록 가능:
```bash
pip install brick-adapter-github-actions
# → brick.adapters.github_actions 자동 등록
```

---

## 11. 비교 분석 (V1 + Temporal/Kestra/n8n 추가)

| 항목 | **Brick V2** | Temporal | Kestra | n8n | CrewAI | LangGraph |
|------|-------------|----------|--------|-----|--------|-----------|
| **핵심** | Block×Team×Link | Workflow×Activity | Flow×Task | Node×Edge | Agent×Crew | Node×Edge×State |
| **정의 방식** | YAML 선언형 | 코드 (Go/Python) | YAML 선언형 | GUI + JSON | Python 코드 | Python 코드 |
| **팀 1등 시민** | ✅ Adapter | ❌ Worker Pool | ❌ 없음 | ❌ 없음 | ✅ Crew | ❌ 없음 |
| **상태 머신** | ✅ Python | ✅ Go 서버 | ✅ Java 서버 | ⚠️ 제한적 | ❌ 없음 | ✅ Python |
| **체크포인트** | ✅ 파일 기반 | ✅ DB 기반 | ✅ DB 기반 | ❌ 없음 | ❌ 없음 | ✅ 메모리 |
| **이벤트 버스** | ✅ 콜백 (→Redis) | ✅ Signal | ✅ Kafka | ⚠️ Webhook | ❌ 없음 | ❌ 없음 |
| **플러그인** | ✅ entry_points | ⚠️ Activity | ✅ 전부 플러그인 | ✅ 노드 패키지 | ❌ 없음 | ❌ 없음 |
| **서버 필요** | ❌ CLI-first | ✅ 서버 필수 | ✅ 서버 필수 | ✅ 서버 필수 | ❌ 코드 | ❌ 코드 |
| **LLM gate** | ✅ prompt/agent | ❌ 없음 | ❌ 없음 | ⚠️ AI 노드 | ❌ 없음 | ❌ 없음 |
| **게이트 on/off** | ✅ 선언적 | ❌ 코드 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 |
| **병렬/경쟁** | ✅ Link 타입 | ✅ Child WF | ✅ Parallel | ✅ Split | ❌ 없음 | ✅ 가능 |
| **가격** | 무료 (OSS) | 유료 Cloud | 유료 EE | 유료 Cloud | 무료 | 무료 |

### Brick V2 고유 차별점

1. **AI-Native Gate**: prompt/agent 타입으로 LLM이 직접 품질 판정. 다른 워크플로우 엔진은 전부 rule-based만
2. **Team Adapter**: "누가 실행하는가"가 교체 가능한 1등 시민. Temporal은 Worker Pool이지 팀이 아님
3. **Serverless + 선언형**: Kestra처럼 YAML이지만 서버 없이 CLI로 동작
4. **3층 분리**: 강제(System) × 조합(Process) × 자유(Autonomy) — 없는 개념

---

## 12. 심층 분석 — V1 유지 + Adapter 엣지케이스

### 12.1 V1 심층 분석 항목 (전부 유지)

- §12.1.1 세션 크래시 복구 → V2: CheckpointStore로 해결
- §12.1.2 순환 참조 감지 → V2: validator에서 DAG 검증
- §12.1.3 블록 멱등성 → V2: Block.idempotent 속성
- §12.2.1 팀 자원 경합 → V2: TaskQueue 우선순위 큐
- §12.2.2 팀원 크래시 → V2: adapter.check_status() heartbeat
- §12.3.1 Auto + Review Gate 충돌 → V2: GateExecutor 순차 실행
- §12.3.2 Gate 타임아웃 → V2: GateHandler.timeout
- §12.4.1 YAML 지옥 방지 → V2: 3단계 프리셋 관리
- §12.4.2 프리셋 검증 → V2: `brick validate`
- §12.5.1 암묵적 의존성 → V2: context_contract
- §12.5.2 외부 시스템 의존성 → V2: gate dependency
- §12.6.1 워크플로우 디버깅 → V2: EventBus + 상세 로깅
- §12.6.2 워크플로우 메트릭 → V2: WorkflowInstance.metrics
- §12.7.1 프리셋 변조 방지 → V2: readonly Core 프리셋
- §12.7.2 Gate 우회 방지 → V2: L1+ skip 거부

### 12.2 V2 추가 엣지케이스

#### 12.2.1 Adapter 장애 격리 (Adapter Fault Isolation)

**문제**: ClaudeAgentTeamsAdapter가 죽어도 engine은 살아있어야 함.

**해결**:
- Adapter 호출은 전부 `try/except`로 감싸고 `adapter.failed` 이벤트 발행
- Adapter 타임아웃: `start_block()` 호출 후 config.timeout 내 `check_status()` 응답 없으면 `adapter.timeout` 이벤트
- Adapter 교체: 실행 중 adapter 장애 시 fallback adapter로 전환 가능

```python
# engine 내부
try:
    execution_id = await adapter.start_block(block, context)
except AdapterError as e:
    self.event_bus.publish(Event("adapter.failed", {"error": str(e)}))
    if block.fallback_adapter:
        adapter = self.adapter_pool.get(block.fallback_adapter)
        execution_id = await adapter.start_block(block, context)
    else:
        raise
```

#### 12.2.2 Prompt Gate 비결정성 (Prompt Gate Non-Determinism)

**문제**: prompt 타입 gate는 LLM 호출이라 같은 입력에 다른 결과 가능.

**해결**:
- prompt gate 결과를 이벤트 로그에 reasoning과 함께 기록
- `gate.prompt.confidence_threshold`: 확신도 기준 (기본 0.8). 미달 시 review gate로 에스컬레이션
- `gate.prompt.retries`: 동일 프롬프트 N회 실행 → 다수결 (기본 1, 중요한 gate는 3)

```yaml
gate:
  handlers:
    - type: prompt
      prompt: "이 구현이 Design을 충족하는가?"
      model: haiku
      confidence_threshold: 0.8
      retries: 3                  # 3회 실행 → 다수결
      on_low_confidence: review   # 확신도 낮으면 COO 검토로
```

#### 12.2.3 Agent Gate 리소스 관리

**문제**: agent 타입 gate는 서브에이전트를 스폰. 토큰 비용 + 시간.

**해결**:
- agent gate에 `max_tokens` 제한
- agent gate 결과 캐싱: 같은 입력이면 이전 결과 재사용 (TTL)
- agent gate는 기본 비활성. 프리셋에서 명시적 활성화 필요

#### 12.2.4 Adapter 간 상태 동기화

**문제**: 워크플로우가 block A는 ClaudeAdapter, block B는 HumanAdapter로 실행하면, 산출물 경로가 다를 수 있음.

**해결**:
- engine이 관리하는 공유 `workspace` 디렉토리
- 모든 adapter는 workspace 내에 산출물 생성
- `BlockContext.workspace` 경로를 adapter에 전달

---

## 13. 파일 구조 (V2)

```
brick/                              # pip install brick-engine
├── __init__.py                     # 버전, 상수
├── cli.py                          # Click CLI (entry point)
├── engine/
│   ├── __init__.py
│   ├── state_machine.py            # 순수 함수형 상태 머신
│   ├── event_bus.py                # 이벤트 발행/구독
│   ├── checkpoint.py               # 상태 저장/복구 (파일 기반)
│   ├── task_queue.py               # 경량 블록 실행 큐
│   ├── executor.py                 # WorkflowExecutor
│   └── validator.py                # DAG 검증, 스키마 검증
├── models/
│   ├── __init__.py
│   ├── block.py                    # Block 데이터 모델
│   ├── team.py                     # Team 데이터 모델
│   ├── link.py                     # Link 데이터 모델
│   ├── workflow.py                 # WorkflowDefinition + WorkflowInstance
│   ├── gate.py                     # GateConfig, GateHandler, GateResult
│   └── events.py                   # Event 타입 정의
├── adapters/
│   ├── __init__.py
│   ├── base.py                     # TeamAdapter ABC
│   ├── claude_agent_teams.py       # Claude Agent Teams
│   ├── claude_code.py              # Claude Code 단독
│   ├── human.py                    # 사람 (수동)
│   ├── webhook.py                  # 외부 서비스
│   └── codex.py                    # OpenAI Codex (stub)
├── gates/
│   ├── __init__.py
│   ├── base.py                     # GateExecutor
│   ├── artifact_exists.py
│   ├── match_rate.py
│   ├── tsc_pass.py
│   ├── build_pass.py
│   ├── deploy_health.py
│   ├── prompt_eval.py              # LLM 프롬프트 평가
│   ├── agent_eval.py               # 에이전트 평가
│   └── http_check.py              # HTTP 체크
├── links/
│   ├── __init__.py
│   ├── base.py                     # LinkHandler ABC
│   ├── sequential.py
│   ├── parallel.py
│   ├── compete.py
│   ├── loop.py
│   ├── cron.py
│   └── branch.py
├── presets/
│   ├── t-pdca-l0.yaml
│   ├── t-pdca-l1.yaml
│   ├── t-pdca-l2.yaml
│   ├── t-pdca-l3.yaml
│   ├── hotfix.yaml
│   └── research.yaml
├── schema/
│   ├── block-v2.json
│   ├── team-v2.json
│   ├── link-v2.json
│   ├── workflow-v2.json
│   └── preset-v2.json
└── tests/
    ├── conftest.py                 # 공통 fixture
    ├── test_state_machine.py
    ├── test_event_bus.py
    ├── test_checkpoint.py
    ├── test_task_queue.py
    ├── test_executor.py
    ├── test_gates.py
    ├── test_adapters.py
    ├── test_links.py
    ├── test_presets.py
    ├── test_validator.py
    ├── test_cli.py
    └── test_integration.py

# Claude Code hook (thin wrapper)
.bkit/hooks/
├── brick-task-completed.sh         # brick complete 호출 (1줄)
├── brick-session-resume.sh         # brick resume 호출 (1줄)
└── brick-gate.sh                   # brick gate 호출 (1줄)
```

---

## 14. 브랜딩

| 항목 | 값 |
|------|-----|
| 이름 | **Brick** |
| 슬로건 | "Build it. Block by Block." |
| 모티프 | Structure × Freedom |
| 컬러 | #C6084A(레드) + #1C1A1A(다크) + #FF6B35(벽돌오렌지) + #00D4AA(터미널그린) |
| 폰트 | JetBrains Mono Bold(로고) + Noto Sans(본문) |
| 로고 | 그리드 블록 타이포 스타일 |
| 레퍼런스 | 레드브릭 브랜드가이드 (`~/Library/Mobile Documents/com~apple~CloudDocs/claude/Redbrick_brandGuide.pdf`) |
| CLI 아이콘 | 🧱 (brick emoji) |

---

## 15. 기존 인프라 → V2 마이그레이션

| 현행 | V2 대응 | 전환 |
|------|---------|------|
| gate-checker.sh | `brick gate` CLI + GateExecutor | gate 로직을 Python으로 |
| pdca-chain-handoff.sh | EventBus `block.completed` subscriber | 이벤트 기반으로 |
| detect-work-type.sh | `brick start --preset auto` + PresetSelector | 프리셋 자동 선택 |
| team-context.json | ClaudeAgentTeamsAdapter 내부 상태 | adapter 캡슐화 |
| task-state-{feature}.json | WorkflowInstance.blocks 상태 | CheckpointStore |
| match-rate-parser.sh | `brick.gates.match_rate:MatchRateGate` | Python 플러그인 |
| living-context-loader.sh | BlockContext.input_artifacts 자동 주입 | executor 내장 |
| notify-completion.sh | EventBus + http event handler | 이벤트 기반 |
| validate-delegate.sh | ClaudeAgentTeamsAdapter.restrictions | adapter 캡슐화 |
| enforce-teamcreate.sh | INV-5 (engine 레벨 검증) | engine 내장 |

---

## 16. TDD 케이스 + 매핑 테이블

### Engine Core

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-01 | StateMachine: pending → running 전이 | §2.1 | event(start) → status=running |
| BK-02 | StateMachine: running → completed 전이 | §2.1 | event(all_blocks_done) → status=completed |
| BK-03 | StateMachine: running → failed 전이 | §2.1 | event(unrecoverable_error) → status=failed |
| BK-04 | StateMachine: running → suspended (선점) | §2.1 | event(preempt) → status=suspended |
| BK-05 | StateMachine: suspended → running (재개) | §2.1 | event(resume) → status=running |
| BK-06 | StateMachine: transition()은 순수 함수 (side effect 없음) | §2.1 | IO mock 0개로 테스트 가능 |
| BK-07 | Block 상태: pending→queued→running→gate_checking→completed | §2.1 | 전체 전이 체인 |
| BK-08 | EventBus: publish → subscribe 수신 확인 | §2.2 | callback 호출 확인 |
| BK-09 | EventBus: 복수 subscriber 전부 수신 | §2.2 | 3개 subscriber → 3번 호출 |
| BK-10 | EventBus: replay (이벤트 재생) | §2.2 | 저장된 이벤트 순서대로 재생 |
| BK-11 | CheckpointStore: save → load 일치 | §2.3 | 저장 후 로드 → 동일 객체 |
| BK-12 | CheckpointStore: 원자적 저장 (tmp→rename) | §2.3 | 중간 크래시 → 이전 상태 유지 |
| BK-13 | CheckpointStore: list_active() 미완료 목록 | §2.3 | running 2개 → 2개 반환 |
| BK-14 | CheckpointStore: save_event() append-only | §2.3 | 3개 이벤트 → events.jsonl 3줄 |
| BK-15 | TaskQueue: enqueue → dequeue FIFO | §2.4 | 순서대로 |
| BK-16 | TaskQueue: priority queue (L0 > L2) | §2.4 | L0 먼저 dequeue |

### Invariants (INV-1~10)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-17 | INV-1: TASK 없이 시작 차단 | §1.3 | task=None → error |
| BK-18 | INV-2: what 없는 Block 거부 | §1.3 | what="" → validation error |
| BK-19 | INV-3: done 없는 Block 거부 | §1.3 | done=None → validation error |
| BK-20 | INV-4: 산출물 없이 다음 Block 차단 | §1.3 | artifact 미존재 → gate fail |
| BK-21 | INV-5: 모든 전환 Event History 기록 | §1.3 | transition → event logged |
| BK-22 | INV-6: Adapter 미배정 Block 실행 차단 | §1.3 | adapter=None → error |
| BK-23 | INV-7: Link 미정의 전환 차단 | §1.3 | link 없음 → error |
| BK-24 | INV-8: 순환 참조 거부 (non-loop) | §1.3 | A→B→A sequential → error |
| BK-25 | INV-9: Core 프리셋 수정 차단 | §1.3 | readonly → error |
| BK-26 | INV-10: 직접 JSON 수정 차단 (StateMachine만) | §1.3 | 외부에서 state.json 수정 → 감지 |
| BK-27 | INV-10: 모든 상태 변경 checkpoint 저장 | §1.3 | transition → save 호출 확인 |

### Block (축 1)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-28 | 최소 Block (what + done만) 유효 | §3.1 | validation pass |
| BK-29 | Block 타입 레지스트리 로드 | §3.2 | 9개 내장 타입 존재 |
| BK-30 | 커스텀 Block 타입 등록 | §3.2 | custom-types/ 추가 → 레지스트리 반영 |

### Gate 4타입 (축 1 확장)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-31 | Gate command: exit 0 = pass | §3.3 | subprocess → pass |
| BK-32 | Gate command: exit 1 = fail | §3.3 | subprocess → fail |
| BK-33 | Gate http: status 200 = pass | §3.3 | mock HTTP → pass |
| BK-34 | Gate http: status 500 = fail | §3.3 | mock HTTP → fail |
| BK-35 | Gate prompt: LLM "yes" = pass | §3.3 | mock LLM → pass |
| BK-36 | Gate prompt: LLM "no" = fail | §3.3 | mock LLM → fail |
| BK-37 | Gate prompt: confidence < threshold → review escalation | §12.2.2 | low confidence → review |
| BK-38 | Gate prompt: retries 다수결 | §12.2.2 | 2/3 yes → pass |
| BK-39 | Gate agent: 서브에이전트 결과 수집 | §3.3 | mock agent → result |
| BK-40 | Gate agent: max_tokens 제한 | §12.2.3 | 초과 → timeout |
| BK-41 | Gate 혼합: command + prompt + agent 순차 | §3.3 | 순서대로 실행, 하나 fail → 중단 |
| BK-42 | Gate evaluation: parallel 모드 | §3.3 | 동시 실행 → 전부 pass 필요 |
| BK-43 | Gate on_fail: retry (max 3) | §3.1 | 3회 → 4회차 escalate |
| BK-44 | Gate on_fail: rollback | §3.1 | 이전 블록 재실행 |
| BK-45 | Gate on_fail: escalate | §3.1 | 알림 이벤트 발행 |
| BK-46 | Gate review: coo=true → 대기 | §3.1 | review_requested 이벤트 |
| BK-47 | Gate review: coo=false → 스킵 | §3.1 | 즉시 통과 |
| BK-48 | Gate review: 타임아웃 → on_timeout | §V1 12.3.2 | timeout → auto_approve |
| BK-49 | Gate review: 거부 → on_review_reject | §V1 12.3.1 | reject → rollback |
| BK-50 | Gate review: max_reviews 소진 → escalate | §V1 12.3.1 | 3회 거부 → escalate |
| BK-51 | L1+ preset에서 skip 거부 | §V1 12.7.2 | L2 + skip → error |

### Team Adapter (축 2)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-52 | 모든 adapter가 TeamAdapter 인터페이스 준수 | §4.1 | isinstance 체크 |
| BK-53 | ClaudeAgentTeamsAdapter: start_block 정상 | §4.2.1 | execution_id 반환 |
| BK-54 | ClaudeAgentTeamsAdapter: check_status 정상 | §4.2.1 | AdapterStatus 반환 |
| BK-55 | ClaudeAgentTeamsAdapter: tmux 미존재 시 에러 | §4.2.1 | 적절한 에러 |
| BK-56 | HumanAdapter: start_block → CLI 출력 | §4.2.3 | print 확인 |
| BK-57 | HumanAdapter: complete 파일 생성 시 completed | §4.2.3 | 파일 → status=completed |
| BK-58 | WebhookAdapter: HTTP 실패 시 에러 | §4.2.4 | 500 → AdapterError |
| BK-59 | Adapter 교체해도 워크플로우 동일 (어댑터 무관성) | §4.2.5 | mock adapter A, B → 같은 결과 |
| BK-60 | Adapter 장애 격리: adapter 에러 → engine 생존 | §12.2.1 | exception → adapter.failed event |
| BK-61 | Adapter fallback: 장애 시 대체 adapter | §12.2.1 | fallback 호출 확인 |
| BK-62 | Adapter 타임아웃 | §12.2.1 | timeout → adapter.timeout event |
| BK-63 | Autonomy Layer 경계: adapter가 Block 수정 불가 | §4.3 | immutable Block 검증 |

### Link (축 3)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-64 | Sequential: A completed → B 시작 | §5 | next_blocks=[B] |
| BK-65 | Sequential: B failed → on_fail 경로 | §5 | rollback → A |
| BK-66 | Parallel: all merge | §5 | B1+B2+B3 완료 → C |
| BK-67 | Parallel: any merge | §5 | B1만 완료 → C |
| BK-68 | Compete: 2 adapter 동시 실행 | §5 | 2 execution_id |
| BK-69 | Compete: judge auto (metric) | §5 | 높은 점수 선택 |
| BK-70 | Compete: judge prompt (LLM) | §5 | LLM 선택 |
| BK-71 | Loop: 재시도 max_retries 내 | §5 | retry → 이전 블록 |
| BK-72 | Loop: max_retries 소진 | §5 | escalate |
| BK-73 | Cron: 스케줄 표현식 파싱 | §5 | cron → 유효 |
| BK-74 | Branch: 조건 분기 | §5 | level=L0 → hotfix |
| BK-75 | Branch: 기본 분기 | §5 | 매칭 없음 → default |

### Workflow Executor

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-76 | 프리셋 로드 + 검증 | §6.1 | YAML → WorkflowDefinition |
| BK-77 | 프리셋 extends 상속 | §V1 6.2 | L3 extends L2 → security 추가 |
| BK-78 | 프리셋 overrides 적용 | §V1 6.2 | match_rate 90→95 |
| BK-79 | 인스턴스 생성 + checkpoint 저장 | §6.1 | state.json 생성 |
| BK-80 | 컨텍스트 자동 주입 | §6.2 | Design 산출물 → Do input |
| BK-81 | 워크플로우 완료 상태 전환 | §6.1 | 마지막 블록 → completed |
| BK-82 | resume: 크래시 후 재개 | §6.1 | checkpoint → 정확한 상태 |
| BK-83 | resume: in_progress 블록 adapter 상태 확인 | §6.1 | check_status 호출 |
| BK-84 | context_contract 필수 항목 미충족 | §V1 12.5.1 | missing → gate fail |

### CLI

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-85 | `brick start` 정상 실행 | §7 | exit 0 + workflow_id 출력 |
| BK-86 | `brick status` 정상 출력 | §7 | 상태 표시 |
| BK-87 | `brick complete` gate 트리거 | §7 | gate 실행 |
| BK-88 | `brick validate` 유효한 프리셋 | §7 | exit 0 |
| BK-89 | `brick validate` 유효하지 않은 프리셋 → 상세 에러 | §7 | exit 1 + 에러 메시지 |
| BK-90 | `brick viz` 시각화 출력 | §7 | 블록 흐름도 텍스트 |
| BK-91 | `brick init` .bkit/ 생성 | §7 | 디렉토리 + 기본 파일 |

### Integration (Claude Code hook)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-92 | TaskCompleted hook → `brick complete` 호출 | §8.2 | stdin JSON → CLI 호출 |
| BK-93 | session-resume → `brick resume` 호출 | §8.2 | 미완료 WF 재개 |
| BK-94 | 기존 bash hook → brick CLI 래핑 정상 | §8.2 | 기존 동작 유지 |

### Plugin

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-95 | entry_points adapter 자동 발견 | §10.2 | 등록된 adapter 목록 |
| BK-96 | entry_points gate 자동 발견 | §10.2 | 등록된 gate 목록 |
| BK-97 | 외부 플러그인 설치 후 사용 | §10.2 | pip install → 자동 등록 |

### Integration (End-to-End)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BK-98 | T-PDCA L2 전체 E2E (mock adapter) | §9.1 | start → 5블록 순차 → completed |
| BK-99 | Hotfix 프리셋 E2E | §V1 6.2 | start → Do → QA → completed |
| BK-100 | loop 재시도 + 통과 E2E | §5 | fail → retry → pass → next |

---

### TDD 커버리지 요약

| Design 섹션 | TDD 케이스 | 건수 |
|-------------|-----------|------|
| Engine Core (§2) | BK-01~16 | 16 |
| Invariants (§1.3) | BK-17~27 | 11 |
| Block (§3) | BK-28~30 | 3 |
| Gate 4타입 (§3.3) | BK-31~51 | 21 |
| Team Adapter (§4) | BK-52~63 | 12 |
| Link (§5) | BK-64~75 | 12 |
| Workflow Executor (§6) | BK-76~84 | 9 |
| CLI (§7) | BK-85~91 | 7 |
| Integration (§8) | BK-92~94 | 3 |
| Plugin (§10) | BK-95~97 | 3 |
| E2E | BK-98~100 | 3 |
| **총계** | **BK-01~100** | **100건, Gap 0** |

---

_Design V2 끝._
