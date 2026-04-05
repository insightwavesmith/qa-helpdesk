# Brick Engine v2.1 리팩토링 설계서

- **버전**: 2.1.0
- **작성일**: 2026-04-05
- **작성자**: PM
- **대상**: brick/engine/ 모듈 전반
- **기준 테스트 베이스라인**: 638 passed, 3 skipped

---

## 1. 개요

### 1.1 목적

현재 brick engine의 핵심 코드베이스(executor.py 871줄, engine_bridge.py 560줄)는 다음 문제를 내포한다:

1. **경쟁 조건(Race Condition)**: `state_machine.py:36`의 `_extra_link_commands` 인스턴스 변수로 인해 병렬 블록 실행 시 커맨드가 덮어쓰여짐
2. **아티팩트 단절**: `claude_local.py`의 `_write_state()`가 artifacts 키를 저장하지 않아 블록 간 데이터 흐름이 0
3. **순환 의존성**: `claude_local._notify_complete()`가 `engine_bridge.executor`를 직접 임포트
4. **전역 변수 6개**: `engine_bridge.py`의 전역 상태로 인한 테스트 격리 불가
5. **비공개 메서드 직접 호출**: `engine_bridge.py`에서 `executor._monitor_block()`, `executor._execute_command()` 호출
6. **비동기 이벤트 핸들러 누락**: `event_bus.py`의 `publish()`가 동기 전용 — async 핸들러 코루틴 반환만 되고 await 안 됨
7. **게이트 보안 취약점**: `command_allowlist.py`에 `codex` 미등록으로 게이트 항상 실패 (interpreter flag 차단은 기존 코드에서 -c, -e, -r, --eval 대응 완료)

### 1.2 범위

- **대상 파일**: `brick/engine/executor.py`, `brick/engine/state_machine.py`, `brick/engine/event_bus.py`, `brick/engine/engine_bridge.py`, `brick/adapters/claude_local.py`, `brick/engine/command_allowlist.py`, `brick/engine/models/block.py`, `brick/engine/models/workflow.py`
- **신규 파일**: `brick/engine/input_resolver.py`, `brick/engine/artifact_manager.py`, `brick/engine/command_dispatcher.py`, `brick/engine/block_monitor.py`, `brick/engine/compete_manager.py`, `brick/engine/preset_loader.py`, `brick/engine/container.py`

### 1.3 개선 항목 목록 (26건)

| 번호 | 항목 | 단계 | 우선순위 |
|------|------|------|----------|
| #14 | StateMachine _extra_link_commands 경쟁 조건 | Phase 0 | Critical |
| #15 | BlockInstance 직렬화 input+gate 누락 | Phase 0 | Critical |
| #18 | command gate 보안 — interpreter args 차단 | Phase 0 | Critical |
| #21 | codex allowlist 추가 | Phase 0 | Critical |
| #1 | executor.py → 6모듈 분리 | Phase 1 | High |
| #2 | engine_bridge.py → 3부분 분리 | Phase 1 | High |
| #3 | 전역 변수 → DI 컨테이너 (app.state.engine) | Phase 1 | High |
| #4 | CommandDispatcher | Phase 1 | High |
| #16 | 비공개 메서드 → 3개 공개 API | Phase 1 | High |
| #17 | claude_local 순환 의존성 → EventBus | Phase 1 | High |
| #23 | PresetLoader 변수치환 → recursive dict walk | Phase 1 | Medium |
| #5 | InputResolver — 이전 블록 아티팩트 흐름 | Phase 2 | High |
| #6 | ArtifactManager — block.completed 시 수집 | Phase 2 | High |
| #7 | claude_local._write_state() → artifacts 키 추가 | Phase 2 | High |
| #8 | 에이전트 구조화 프롬프트 | Phase 2 | Medium |
| #9 | Building 폴더 자동 생성 | Phase 2 | Medium |
| #10 | BOARD.md 자동 생성 | Phase 2 | Medium |
| #11 | TASK.md 자동 생성 | Phase 2 | Medium |
| #12 | 재시도 버전 분리 | Phase 2 | Medium |
| #13 | BOARD.md 동시성 보호 | Phase 2 | Medium |
| #22 | 동일 feature 중복 실행 방지 | Phase 2 | Medium |
| #26 | Legacy→Building 경로 매핑 레이어 | Phase 2 | Low |
| #19 | 서버 재시작 복구 공개 API | Phase 3 | High |
| #20 | cancel → adapter.cancel() | Phase 3 | High |
| #24 | preset extends deep merge | Phase 3 | Medium |
| #25 | EventBus async 핸들러 지원 | Phase 3 | Medium |

---

## 2. Phase 0: 크리티컬 버그 수정

### 2.1 #14 — StateMachine _extra_link_commands 경쟁 조건

**파일**: `brick/engine/state_machine.py`

**현재 코드 (line 36)**:
```python
_extra_link_commands: list[Command] = []
```

**문제**: `_find_next_blocks()`(line 307)가 `self._extra_link_commands`에 쓰고, `_handle_block_event()`(lines 139-140)가 읽는 구조. 병렬 블록 A, B가 동시에 완료되면 A의 커맨드를 B가 덮어씀.

**수정 방향**: `_find_next_blocks()`가 추가 커맨드를 반환값으로 넘기고, 인스턴스 변수 제거.

**수정 후 시그니처**:
```python
# BEFORE (state_machine.py:307)
def _find_next_blocks(self, instance, block_id) -> list[Block]:
    # ... self._extra_link_commands = [SomeCommand(...)] ...
    return next_blocks

# AFTER
def _find_next_blocks(self, instance, block_id) -> tuple[list[Block], list[Command]]:
    extra_commands: list[Command] = []
    # ... extra_commands.append(SomeCommand(...)) ...
    return next_blocks, extra_commands
```

**`_handle_block_event()` 수정** (lines 139-140):
```python
# BEFORE
next_blocks = self._find_next_blocks(instance, block_id)
commands.extend(self._extra_link_commands)

# AFTER
next_blocks, extra_commands = self._find_next_blocks(instance, block_id)
commands.extend(extra_commands)
```

**클래스 변수 제거**: `_extra_link_commands: list[Command] = []` 라인 삭제.

**gate_failed → skip 경로 수정** (state_machine.py line 175):
```python
# skip path — BEFORE
next_blocks = self._find_next_blocks(wf, block_id)

# skip path — AFTER (tuple 반환 처리 추가)
next_blocks, extra_commands = self._find_next_blocks(wf, block_id)
commands.extend(extra_commands)
```

> **참고**: gate_failed → route 경로(line 186)는 `_find_next_blocks()`를 호출하지 않고 links를 직접 순회하므로 변경 불필요.

### 2.2 #15 — BlockInstance 직렬화 input+gate 누락

**파일**: `brick/engine/models/workflow.py`

**문제**: `BlockInstance.to_dict()`와 `BlockInstance.from_dict()`에서 `input`(InputConfig)과 `gate`(GateConfig) 필드가 누락됨. 체크포인트 저장/복원 시 데이터 손실.

**수정 — to_dict() 추가**:
```python
def to_dict(self) -> dict:
    d = {
        "id": self.id,
        "block_id": self.block_id,
        "status": self.status,
        "context": self.context,
        "artifacts": self.artifacts,
        "retry_count": self.retry_count,
        "started_at": self.started_at,
        "completed_at": self.completed_at,
    }
    # 누락된 필드 추가
    if self.block.input is not None:
        d["input"] = {
            "from_block": self.block.input.from_block,
            "artifacts": self.block.input.artifacts,
        }
    if self.block.gate is not None:
        d["gate"] = self.block.gate.to_dict()  # GateConfig에 to_dict 추가
    return d
```

**수정 — from_dict() 추가**:
```python
@classmethod
def from_dict(cls, data: dict) -> "BlockInstance":
    instance = cls(...)
    if "input" in data:
        instance.block.input = InputConfig(
            from_block=data["input"]["from_block"],
            artifacts=data["input"]["artifacts"],
        )
    if "gate" in data:
        instance.block.gate = GateConfig.from_dict(data["gate"])
    return instance
```

### 2.3 #18 — Command Gate 보안 강화

**파일**: `brick/gates/command_allowlist.py`

**문제**: 기존 `INTERPRETER_BLOCKED_ARGS = {"-c", "-e", "-r", "--eval"}`은 있으나 불완전. 그러나 `-m`은 `python -m pytest` 등 정상 게이트 실행에 필수이므로 차단하면 안 됨.

**현재 코드 분석** (command_allowlist.py):
- `validate_command(cmd_parts: list[str]) -> tuple[bool, str]` — 이미 리스트 기반
- `INTERPRETER_COMMANDS = {"python", "python3", "node", "perl", "ruby", "php"}`
- `INTERPRETER_BLOCKED_ARGS = {"-c", "-e", "-r", "--eval"}` — `-m` 미포함 (정상)
- `BLOCKED_ARGS`: --force, -rf, rm, sudo, chmod 등

**판단**: 현재 코드의 보안 수준이 이미 충분함. `-c`, `-e`, `-r`, `--eval` 차단으로 임의 코드 실행 방지. `-m`은 모듈 실행용(pytest, pip 등)이므로 의도적 허용.

**수정 범위**: #18은 현행 유지 (추가 수정 없음). #21(codex allowlist)만 변경.

> **근거**: 실제 코드의 `validate_command(cmd_parts: list[str])`는 이미 리스트 파싱 기반이라 공백 주입(space injection) 공격도 불가. `INTERPRETER_BLOCKED_ARGS`에 `-m`을 추가하면 `python -m pytest` 게이트가 실패하여 기존 프리셋 3개가 깨짐.

### 2.4 #21 — codex Allowlist 추가

**파일**: `brick/engine/command_allowlist.py`

**문제**: `codex`가 `ALLOWED_COMMANDS` 집합에 없어서 codex 게이트를 사용하는 3개 프리셋이 항상 실패.

**수정**:
```python
ALLOWED_COMMANDS = {
    # ... 기존 항목 ...
    "codex",  # 추가
}
```

---

## 3. Phase 1: 구조 분리

### 3.1 #1 — executor.py 모듈 분리 (871줄 → 6모듈)

**현재**: `brick/engine/executor.py` 871줄에 PresetLoader(56-228) + WorkflowExecutor(231-871) 혼재.

**분리 후 구조**:

```
brick/engine/
├── executor.py          # WorkflowExecutor 핵심만 (~200줄)
├── preset_loader.py     # PresetLoader 클래스 (현 56-228줄 이동)
├── block_monitor.py     # BlockMonitor 클래스 (현 652-741줄 이동)
├── compete_manager.py   # CompeteManager 클래스 (현 743-829줄 이동)
├── input_resolver.py    # InputResolver 클래스 (신규 — Phase 2)
├── artifact_manager.py  # ArtifactManager 클래스 (신규 — Phase 2)
└── command_dispatcher.py # CommandDispatcher 클래스 (현 465-643줄 이동)
```

#### 3.1.1 preset_loader.py 인터페이스

**이동 대상**: `executor.py` lines 56-228 (`PresetLoader` 클래스)

```python
# brick/engine/preset_loader.py
class PresetLoader:
    def __init__(self, preset_dir: str):
        self.preset_dir = preset_dir

    def load(self, preset_name: str, variables: dict[str, str]) -> WorkflowDefinition:
        """
        YAML 파일 로드 + 변수 치환 + WorkflowDefinition 반환
        
        입력: preset_name (예: "feature-standard"), variables (예: {"project": "myapp", "feature": "login"})
        출력: WorkflowDefinition
        예외: PresetNotFoundError, PresetValidationError
        """
        ...

    def _substitute_variables(self, data: dict, variables: dict[str, str]) -> dict:
        """
        재귀적 dict walk로 변수 치환 (#23 수정 반영)
        현재의 yaml.dump→replace→parse 패턴을 제거하고 재귀 순회로 교체
        """
        ...
```

**#23 변수치환 수정 상세**:
```python
# BEFORE (fragile — yaml.dump로 직렬화 후 문자열 replace)
yaml_str = yaml.dump(data)
for key, value in variables.items():
    yaml_str = yaml_str.replace(f"{{{key}}}", value)
return yaml.safe_load(yaml_str)

# AFTER (안전 — 재귀 dict walk)
def _substitute_variables(self, data: Any, variables: dict[str, str]) -> Any:
    if isinstance(data, str):
        for key, value in variables.items():
            data = data.replace(f"{{{key}}}", value)
        return data
    elif isinstance(data, dict):
        return {k: self._substitute_variables(v, variables) for k, v in data.items()}
    elif isinstance(data, list):
        return [self._substitute_variables(item, variables) for item in data]
    return data
```

#### 3.1.2 block_monitor.py 인터페이스

**이동 대상**: `executor.py` lines 652-741 (`_monitor_block()` 메서드)

```python
# brick/engine/block_monitor.py
class BlockMonitor:
    POLL_INTERVAL_SEC = 10
    STALE_WARN_SEC = 300   # 5분
    STALE_TIMEOUT_SEC = 600  # 10분

    def __init__(
        self,
        checkpoint: CheckpointStore,
        adapter_pool: AdapterPool,
        event_bus: EventBus,
    ):
        ...

    async def monitor(self, workflow_id: str, block_id: str) -> None:
        """
        폴링 루프: 10초 간격으로 어댑터 완료 확인
        5분 경과 → WARN 로그
        10분 경과 → 타임아웃 처리
        어댑터 완료 → block.completed 이벤트 발행
        
        입력: workflow_id, block_id
        출력: None (이벤트로 완료 알림)
        """
        ...
```

#### 3.1.3 compete_manager.py 인터페이스

**이동 대상**: `executor.py` lines 743-829 (`_monitor_compete()` 메서드)

```python
# brick/engine/compete_manager.py
@dataclass
class CompeteExecution:
    workflow_id: str
    block_id: str
    adapter_id: str
    started_at: float

@dataclass
class CompeteGroup:
    group_id: str
    executions: list[CompeteExecution]
    winner: str | None = None

class CompeteManager:
    POLL_INTERVAL_SEC = 5

    def __init__(
        self,
        checkpoint: CheckpointStore,
        adapter_pool: AdapterPool,
        event_bus: EventBus,
    ):
        ...

    async def monitor_compete(self, group: CompeteGroup) -> str:
        """
        경쟁 그룹 모니터링
        5초 간격 폴링, 첫 완료자 = 승자
        패자 → adapter.cancel() 호출 (#20 반영)
        
        입력: CompeteGroup
        출력: 승자 adapter_id
        """
        ...
```

#### 3.1.4 command_dispatcher.py 인터페이스

**이동 대상**: `executor.py` lines 465-643 (`_execute_command()` 메서드)

```python
# brick/engine/command_dispatcher.py
class CommandDispatcher:
    """
    Command 타입별 처리 라우팅
    지원 커맨드: StartBlockCommand, RetryAdapterCommand,
                CompeteStartCommand, NotifyCommand,
                EmitEventCommand, SaveCheckpointCommand
    """
    def __init__(
        self,
        checkpoint: CheckpointStore,
        adapter_pool: AdapterPool,
        event_bus: EventBus,
        block_monitor: BlockMonitor,
        compete_manager: CompeteManager,
        input_resolver: "InputResolver",  # Phase 2
    ):
        ...

    async def dispatch(self, command: Command, instance: WorkflowInstance) -> None:
        """
        커맨드 타입에 따라 적절한 핸들러로 라우팅
        
        입력: Command 객체, WorkflowInstance
        출력: None
        예외: UnknownCommandError
        """
        handler = self._handlers.get(type(command))
        if handler is None:
            raise UnknownCommandError(f"알 수 없는 커맨드: {type(command)}")
        await handler(command, instance)
```

#### 3.1.5 executor.py (리팩터링 후)

```python
# brick/engine/executor.py (리팩터링 후 ~200줄)
class WorkflowExecutor:
    def __init__(
        self,
        state_machine: StateMachine,
        event_bus: EventBus,
        checkpoint: CheckpointStore,
        gate_executor: GateExecutor,
        adapter_pool: AdapterPool,
        preset_loader: PresetLoader,      # 분리된 모듈
        validator: WorkflowValidator,
        cron_scheduler: CronScheduler,
        block_monitor: BlockMonitor,      # 분리된 모듈
        compete_manager: CompeteManager,  # 분리된 모듈
        command_dispatcher: CommandDispatcher,  # 분리된 모듈
    ):
        self._checkpoint_lock = asyncio.Lock()
        # ... 나머지 필드 ...

    async def start(self, preset_name: str, variables: dict) -> str:
        """워크플로우 시작. workflow_id 반환."""
        ...

    async def complete_block(self, workflow_id: str, block_id: str, artifacts: list[str]) -> None:
        """블록 완료 처리."""
        ...

    # #16 공개 API (기존 private 메서드 대체)
    async def resume_monitoring(self, workflow_id: str, block_id: str) -> None:
        """서버 재시작 후 모니터링 재개 (#19 반영)"""
        await self._block_monitor.monitor(workflow_id, block_id)

    async def retry_block(self, workflow_id: str, block_id: str) -> None:
        """블록 재시도"""
        ...

    async def trigger_hook(self, workflow_id: str, hook_name: str) -> None:
        """훅 트리거"""
        ...
```

### 3.2 #2 — engine_bridge.py 분리

**현재**: `brick/engine/engine_bridge.py` 560줄에 Bootstrap + Routes + 전역 변수 혼재.

**분리 후 구조**:

```
brick/engine/
├── container.py         # EngineContainer — DI 컨테이너 (#3)
├── engine_bootstrap.py  # init_engine() 로직
└── engine_routes.py     # FastAPI 라우트 핸들러
```

#### 3.2.1 container.py 인터페이스

```python
# brick/engine/container.py
@dataclass
class EngineContainer:
    """
    전역 변수 6개를 단일 컨테이너로 교체
    app.state.engine에 저장
    
    기존 전역:
    - executor (WorkflowExecutor)
    - preset_loader (PresetLoader)
    - checkpoint_store (CheckpointStore)
    - state_machine (StateMachine)
    - engine_event_bus (EventBus)
    - skyoffice_bridge (SkyOfficeBridge)
    """
    executor: WorkflowExecutor
    preset_loader: PresetLoader
    checkpoint_store: CheckpointStore
    state_machine: StateMachine
    event_bus: EventBus
    skyoffice_bridge: SkyOfficeBridge

def get_engine(request: Request) -> EngineContainer:
    """FastAPI dependency — app.state.engine 반환"""
    return request.app.state.engine
```

#### 3.2.2 engine_bootstrap.py 인터페이스

```python
# brick/engine/engine_bootstrap.py
async def create_engine(config: EngineConfig) -> EngineContainer:
    """
    모든 컴포넌트 생성 + 조립 + 어댑터 등록
    기존 init_engine() 로직 이동
    
    입력: EngineConfig
    출력: EngineContainer
    """
    ...

async def shutdown_engine(container: EngineContainer) -> None:
    """엔진 종료 — 실행 중인 모니터 태스크 취소"""
    ...
```

#### 3.2.3 engine_routes.py 인터페이스

```python
# brick/engine/engine_routes.py
router = APIRouter(prefix="/engine")

@router.post("/workflows")
async def start_workflow(
    request: StartWorkflowRequest,
    engine: EngineContainer = Depends(get_engine),
) -> StartWorkflowResponse:
    ...

@router.post("/workflows/{workflow_id}/blocks/{block_id}/complete")
async def complete_block(
    workflow_id: str,
    block_id: str,
    request: CompleteBlockRequest,
    engine: EngineContainer = Depends(get_engine),
) -> None:
    ...
```

### 3.3 #17 — claude_local 순환 의존성 제거

**파일**: `brick/adapters/claude_local.py`

**현재 문제** (claude_local.py의 `_notify_complete()` 메서드):
```python
# 순환 의존성: claude_local → engine_bridge → claude_local
from brick.dashboard.routes.engine_bridge import executor
```

**수정 방향**: `engine_bridge` 직접 임포트 대신 `EventBus` 이벤트로 교체.

**수정 후**:
```python
# _notify_complete() 수정
async def _notify_complete(self, workflow_id: str, block_id: str, artifacts: list[str]) -> None:
    """
    순환 임포트 제거: engine_bridge.executor 직접 호출 → EventBus 이벤트 발행
    """
    await self._event_bus.publish(
        AdapterCompletedEvent(
            workflow_id=workflow_id,
            block_id=block_id,
            artifacts=artifacts,
        )
    )
```

**이벤트 정의** (`brick/engine/events.py` 또는 기존 이벤트 파일):
```python
@dataclass
class AdapterCompletedEvent:
    workflow_id: str
    block_id: str
    artifacts: list[str]
    event_type: str = "adapter.completed"
```

**WorkflowExecutor에서 구독**:
```python
# executor.py __init__에서
self._event_bus.subscribe(
    "adapter.completed",
    self._on_adapter_completed,
)

async def _on_adapter_completed(self, event: AdapterCompletedEvent) -> None:
    await self.complete_block(event.workflow_id, event.block_id, event.artifacts)
```

---

## 4. Phase 2: 아티팩트 관리

### 4.1 #6 + #7 — ArtifactManager

**신규 파일**: `brick/engine/artifact_manager.py`

**역할**: 블록 완료 시 아티팩트 수집 → 체크포인트 저장 → 다음 블록 컨텍스트에 주입 지원.

#### 4.1.1 ArtifactManager 클래스

```python
# brick/engine/artifact_manager.py
import asyncio
from pathlib import Path

@dataclass
class ArtifactRecord:
    block_id: str
    path: str
    collected_at: float
    size_bytes: int | None = None

class ArtifactManager:
    def __init__(
        self,
        checkpoint: CheckpointStore,
        event_bus: EventBus,
        building_root: str = "brick/projects",
    ):
        self._checkpoint = checkpoint
        self._event_bus = event_bus
        self._building_root = building_root
        self._board_lock = asyncio.Lock()  # #13 BOARD.md 동시성 보호

    async def collect(
        self,
        workflow_id: str,
        block_id: str,
        artifact_paths: list[str],
    ) -> list[ArtifactRecord]:
        """
        블록 완료 시 아티팩트 수집
        1. 각 경로 파일 존재 확인
        2. ArtifactRecord 생성
        3. 체크포인트에 저장
        4. artifact.collected 이벤트 발행
        
        입력: workflow_id, block_id, artifact_paths
        출력: list[ArtifactRecord]
        """
        records = []
        for path in artifact_paths:
            p = Path(path)
            record = ArtifactRecord(
                block_id=block_id,
                path=str(p),
                collected_at=time.time(),
                size_bytes=p.stat().st_size if p.exists() else None,
            )
            records.append(record)
        
        await self._checkpoint.save_artifacts(workflow_id, block_id, records)
        await self._event_bus.publish(
            ArtifactCollectedEvent(
                workflow_id=workflow_id,
                block_id=block_id,
                artifacts=records,
            )
        )
        return records

    async def get_artifacts(
        self, workflow_id: str, block_id: str
    ) -> list[ArtifactRecord]:
        """이전 블록의 아티팩트 조회 (InputResolver가 사용)"""
        return await self._checkpoint.load_artifacts(workflow_id, block_id)

    async def ensure_building_folder(
        self, project: str, workflow_id: str
    ) -> Path:
        """
        #9 Building 폴더 자동 생성
        brick/projects/{project}/buildings/{workflow_id}/ 폴더 구조 생성
        workflow_id = "{feature}-{timestamp}" (WorkflowInstance 기존 ID 포맷 재활용)
        """
        root = Path(self._building_root) / project / "buildings" / workflow_id
        root.mkdir(parents=True, exist_ok=True)
        (root / "plans").mkdir(exist_ok=True)
        (root / "designs").mkdir(exist_ok=True)
        (root / "implementations").mkdir(exist_ok=True)
        (root / "reports").mkdir(exist_ok=True)
        return root

    async def generate_board(
        self, workflow_id: str, instance: "WorkflowInstance"
    ) -> Path:
        """
        #10 BOARD.md 자동 생성
        #13 _board_lock으로 동시성 보호
        """
        async with self._board_lock:
            board_path = self._get_board_path(instance)
            content = self._render_board(instance)
            board_path.write_text(content, encoding="utf-8")
            return board_path

    async def generate_task_md(
        self, block_id: str, block: "Block", context: dict
    ) -> Path:
        """
        #11 TASK.md 자동 생성
        에이전트 실행 전 TASK.md 파일 생성
        """
        ...

    def _render_board(self, instance: "WorkflowInstance") -> str:
        """
        BOARD.md 내용 렌더링
        | 블록 ID | 상태 | 시작 시각 | 완료 시각 | 아티팩트 |
        """
        lines = ["# 워크플로우 보드\n"]
        lines.append(f"- **workflow_id**: {instance.id}")
        lines.append(f"- **feature**: {instance.feature}")
        lines.append(f"- **생성 시각**: {instance.created_at}\n")
        lines.append("| 블록 | 상태 | 시작 | 완료 | 아티팩트 |")
        lines.append("|------|------|------|------|----------|")
        for bi in instance.block_instances.values():
            artifacts_str = ", ".join(bi.artifacts) if bi.artifacts else "-"
            lines.append(
                f"| {bi.block_id} | {bi.status} | {bi.started_at or '-'} "
                f"| {bi.completed_at or '-'} | {artifacts_str} |"
            )
        return "\n".join(lines) + "\n"
```

#### 4.1.2 EventBus 이벤트 (ArtifactManager 관련)

```python
@dataclass
class ArtifactCollectedEvent:
    workflow_id: str
    block_id: str
    artifacts: list[ArtifactRecord]
    event_type: str = "artifact.collected"

@dataclass
class BoardUpdatedEvent:
    workflow_id: str
    board_path: str
    event_type: str = "board.updated"
```

### 4.2 #5 — InputResolver

**신규 파일**: `brick/engine/input_resolver.py`

**역할**: 다음 블록 실행 전, 이전 블록 아티팩트 → 다음 블록 프롬프트 컨텍스트로 주입.

#### 4.2.1 현재 Block 모델의 input 필드

```python
# models/block.py (이미 존재하지만 executor가 읽지 않음)
@dataclass
class InputConfig:
    from_block: str = ""
    artifacts: list[str] = field(default_factory=list)

@dataclass
class Block:
    ...
    input: InputConfig | None = None  # EXISTS but executor never reads it
```

#### 4.2.2 InputResolver 클래스

```python
# brick/engine/input_resolver.py
class InputResolver:
    def __init__(self, artifact_manager: ArtifactManager):
        self._artifact_manager = artifact_manager

    async def resolve(
        self,
        block: Block,
        instance: WorkflowInstance,
    ) -> dict[str, Any]:
        """
        블록의 input 설정을 읽어 이전 블록 아티팩트를 컨텍스트에 주입
        
        입력:
          - block: 실행할 블록 (block.input 필드 읽음)
          - instance: 현재 워크플로우 인스턴스 (이전 블록 결과 포함)
        
        출력:
          - 주입된 컨텍스트 dict
          예: {
                "previous_artifacts": [
                    {"path": "brick/projects/.../plan.md", "content": "..."}
                ],
                "from_block": "plan",
              }
        """
        if block.input is None:
            return {}

        from_block_id = block.input.from_block
        if not from_block_id:
            return {}

        # 이전 블록 아티팩트 조회
        artifacts = await self._artifact_manager.get_artifacts(
            instance.id, from_block_id
        )

        # 지정된 아티팩트 필터링
        if block.input.artifacts:
            artifacts = [a for a in artifacts if a.path in block.input.artifacts]

        # 파일 내용 읽기
        resolved = []
        for record in artifacts:
            path = Path(record.path)
            content = path.read_text(encoding="utf-8") if path.exists() else ""
            resolved.append({"path": record.path, "content": content})

        return {
            "from_block": from_block_id,
            "previous_artifacts": resolved,
        }
```

#### 4.2.3 프롬프트 주입 흐름

**흐름**: `StartBlockCommand` 처리 → `InputResolver.resolve()` → `context` 딕셔너리 병합 → 어댑터 `start_block()` 호출

```python
# command_dispatcher.py의 StartBlockCommand 핸들러
async def _handle_start_block(
    self, command: StartBlockCommand, instance: WorkflowInstance
) -> None:
    block = instance.get_block(command.block_id)
    
    # InputResolver로 이전 블록 컨텍스트 주입
    input_context = await self._input_resolver.resolve(block, instance)
    
    # 기존 컨텍스트와 병합
    merged_context = {**instance.context, **input_context}
    
    # #8 구조화 프롬프트 생성
    prompt = self._build_structured_prompt(block, merged_context)
    
    await self._adapter_pool.start_block(
        adapter_id=command.adapter_id,
        block=block,
        context=merged_context,
        prompt=prompt,
    )
```

### 4.3 #7 — claude_local._write_state() artifacts 키 추가

**파일**: `brick/adapters/claude_local.py`

**문제**: `_write_state()` 메서드가 artifacts 키를 저장하지 않고, `get_artifacts()`가 "artifacts" 키를 읽으려 하지만 항상 빈 배열 반환.

**수정**:
```python
# claude_local.py의 _write_state()
def _write_state(
    self,
    status: str,
    stdout: str = "",
    stderr: str = "",
    exit_code: int | None = None,
    error: str | None = None,
    session_id: str | None = None,
    artifacts: list[str] | None = None,  # 파라미터 추가
) -> None:
    state = {
        "status": status,
        "stdout": stdout,
        "stderr": stderr,
        "exit_code": exit_code,
        "error": error,
        "session_id": session_id,
        "artifacts": artifacts or [],  # 추가
    }
    # ... 파일 저장 ...
```

### 4.4 #8 — 에이전트 구조화 프롬프트

**파일**: `brick/engine/command_dispatcher.py`

**현재** (`claude_local.py`의 `start_block()`):
```python
prompt = f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"
```

**수정 후 구조화 프롬프트**:
```python
def _build_structured_prompt(self, block: Block, context: dict) -> str:
    lines = []
    lines.append(f"# TASK: {block.what}")
    lines.append("")
    
    if context.get("previous_artifacts"):
        lines.append("## 이전 블록 산출물")
        for artifact in context["previous_artifacts"]:
            lines.append(f"### {artifact['path']}")
            lines.append("```")
            lines.append(artifact.get("content", "(파일 없음)"))
            lines.append("```")
        lines.append("")
    
    lines.append("## 컨텍스트")
    # previous_artifacts는 제외하고 나머지 컨텍스트만
    clean_context = {k: v for k, v in context.items() if k != "previous_artifacts"}
    lines.append(f"```json\n{json.dumps(clean_context, ensure_ascii=False, indent=2)}\n```")
    
    if block.done:
        lines.append("")
        lines.append("## 완료 기준")
        if block.done.artifacts:
            lines.append("산출물:")
            for a in block.done.artifacts:
                lines.append(f"- {a}")
        if block.done.metrics:
            lines.append("메트릭:")
            for k, v in block.done.metrics.items():
                lines.append(f"- {k}: {v}")
    
    return "\n".join(lines)
```

### 4.5 #12 — 재시도 버전 분리

**파일**: `brick/engine/models/workflow.py`

**문제**: 재시도 시 아티팩트가 이전 시도분과 섞임.

**수정**: `BlockInstance`에 `retry_version` 필드 추가, 아티팩트 저장 시 버전 포함.

```python
@dataclass
class BlockInstance:
    ...
    retry_count: int = 0
    retry_version: int = 0  # 추가: 재시도마다 증가
    artifacts_by_version: dict[int, list[str]] = field(default_factory=dict)  # 추가

    @property
    def artifacts(self) -> list[str]:
        """현재 버전의 아티팩트"""
        return self.artifacts_by_version.get(self.retry_version, [])
```

### 4.6 #22 — 동일 feature 중복 실행 방지

**파일**: `brick/engine/executor.py`

**수정**: `start()` 메서드에 중복 체크 추가.

```python
async def start(self, preset_name: str, variables: dict) -> str:
    feature = variables.get("feature", "")
    project = variables.get("project", "")
    
    # 중복 실행 체크
    if feature and project:
        existing = await self._checkpoint.find_running_workflow(project, feature)
        if existing:
            raise DuplicateWorkflowError(
                f"이미 실행 중인 워크플로우: {project}/{feature} (id: {existing})"
            )
    ...
```

**`CheckpointStore`에 추가 메서드**:
```python
async def find_running_workflow(self, project: str, feature: str) -> str | None:
    """실행 중인 동일 feature 워크플로우 ID 반환, 없으면 None"""
    ...
```

### 4.7 #26 — Legacy→Building 경로 매핑 레이어

**파일**: `brick/engine/path_mapper.py` (신규)

**역할**: 기존 `brick/projects/{project}/plans/` 경로를 새 Building 구조 `brick/projects/{project}/buildings/{workflow_id}/plans/`로 매핑.

```python
# brick/engine/path_mapper.py
class PathMapper:
    """
    레거시 경로 → Building 경로 변환
    workflow_id = "{feature}-{timestamp}" (WorkflowInstance 기존 ID 포맷)
    """
    LEGACY_PATTERNS = [
        (r"brick/projects/(.+)/plans/(.+)", "brick/projects/{project}/buildings/{workflow_id}/plans/{filename}"),
        (r"brick/projects/(.+)/designs/(.+)", "brick/projects/{project}/buildings/{workflow_id}/designs/{filename}"),
    ]

    def to_building(self, legacy_path: str, workflow_id: str) -> str:
        """레거시 경로를 Building 구조 경로로 변환"""
        ...

    def from_building(self, building_path: str) -> str:
        """Building 경로를 레거시 경로로 역변환 (하위 호환)"""
        ...
```

---

## 5. Phase 3: 안정화

### 5.1 #19 — 서버 재시작 복구 공개 API

**파일**: `brick/engine/executor.py`

**현재**: `engine_bridge.py`의 `_auto_recover_workflows()`가 `executor._monitor_block()` 비공개 메서드 직접 호출 (line 122).

**수정**: `resume_monitoring()` 공개 API 노출.

```python
# executor.py
async def resume_monitoring(self, workflow_id: str, block_id: str) -> None:
    """
    서버 재시작 후 실행 중이던 블록 모니터링 재개
    engine_bridge._auto_recover_workflows()가 호출
    """
    await self._block_monitor.monitor(workflow_id, block_id)
```

**engine_bootstrap.py에서 사용**:
```python
async def _auto_recover_workflows(container: EngineContainer) -> None:
    running = await container.checkpoint_store.find_running_blocks()
    for workflow_id, block_id in running:
        asyncio.create_task(
            container.executor.resume_monitoring(workflow_id, block_id)
        )
```

### 5.2 #20 — cancel → adapter.cancel()

**파일**: `brick/engine/compete_manager.py`

**현재**: 경쟁에서 진 어댑터를 중단할 때 `adapter.cancel()` 호출 없이 그냥 무시.

**수정**:
```python
async def _cancel_loser(self, execution: CompeteExecution) -> None:
    adapter = self._adapter_pool.get(execution.adapter_id)
    if adapter and hasattr(adapter, "cancel"):
        try:
            await adapter.cancel(execution.workflow_id, execution.block_id)
        except Exception as e:
            logger.warning(f"어댑터 취소 실패: {execution.adapter_id} — {e}")
```

### 5.3 #24 — preset extends deep merge

**파일**: `brick/engine/preset_loader.py`

**현재**: 프리셋 상속 시 shallow merge만 됨.

**수정**:
```python
def _deep_merge(self, base: dict, override: dict) -> dict:
    """
    재귀적 dict merge
    list 필드: override가 base를 완전 교체 (append 아님)
    dict 필드: 재귀 merge
    scalar 필드: override 우선
    """
    result = {**base}
    for key, value in override.items():
        if key in result and isinstance(result[key], dict) and isinstance(value, dict):
            result[key] = self._deep_merge(result[key], value)
        else:
            result[key] = value
    return result
```

### 5.4 #25 — EventBus async 핸들러 지원

**파일**: `brick/engine/event_bus.py`

**현재** (`event_bus.py:publish()`):
```python
def publish(self, event: Any) -> None:
    for handler in self._handlers.get(event.event_type, []):
        try:
            handler(event)  # async 핸들러는 코루틴만 반환되고 await 안 됨
        except Exception as e:
            logger.error(f"이벤트 핸들러 오류: {e}")
```

**수정**:
```python
async def publish(self, event: Any) -> None:
    for handler in self._handlers.get(event.event_type, []):
        try:
            result = handler(event)
            if asyncio.iscoroutine(result):
                await result
        except Exception as e:
            logger.error(f"이벤트 핸들러 오류: {e}")
```

**주의**: `publish()`를 async로 변경하면 모든 호출부를 `await`로 업데이트해야 함. 또는 `publish_async()`로 별도 추가하고 기존 `publish()`는 `asyncio.create_task()`로 위임.

**권장 방식 (하위 호환)**:
```python
def publish(self, event: Any) -> None:
    """동기 publish — async 핸들러는 태스크로 스케줄"""
    for handler in self._handlers.get(event.event_type, []):
        try:
            result = handler(event)
            if asyncio.iscoroutine(result):
                asyncio.create_task(result)
        except Exception as e:
            logger.error(f"이벤트 핸들러 오류: {e}")

async def publish_async(self, event: Any) -> None:
    """async publish — 모든 핸들러 await"""
    for handler in self._handlers.get(event.event_type, []):
        try:
            result = handler(event)
            if asyncio.iscoroutine(result):
                await result
        except Exception as e:
            logger.error(f"이벤트 핸들러 오류: {e}")
```

---

## 6. 모듈 의존성 다이어그램

```
                    EngineContainer (container.py)
                           │
                    WorkflowExecutor (executor.py)
                   /        │         \
          StateMachine   EventBus   CommandDispatcher
                                   /    │    │    \
                         BlockMonitor  CompeteManager  InputResolver  ...
                                                       │
                                              ArtifactManager
                                                       │
                                              CheckpointStore
```

**순환 의존성 제거 후**:
- `claude_local.py` → `EventBus` (단방향, engine_bridge 임포트 없음)
- `engine_routes.py` → `EngineContainer` (DI, 전역 변수 없음)
- `ArtifactManager` → `CheckpointStore` (단방향)

---

## 7. 불변식 (Invariants)

아래 불변식은 리팩터링 전후 모두 성립해야 한다.

### 7.1 StateMachine 불변식

| ID | 불변식 | 검증 방법 |
|----|--------|-----------|
| INV-01 | `_extra_link_commands` 인스턴스 변수가 StateMachine에 없어야 한다 | `hasattr(state_machine, '_extra_link_commands')` is False |
| INV-02 | `_find_next_blocks()`의 반환 타입은 `tuple[list[Block], list[Command]]`여야 한다 | 타입 힌트 + 런타임 체크 |
| INV-03 | 병렬 블록 A, B 완료 시 양쪽 커맨드 모두 보존 | 병렬 완료 후 커맨드 수 검증 |

### 7.2 Artifact 불변식

| ID | 불변식 | 검증 방법 |
|----|--------|-----------|
| INV-04 | 블록 완료 후 `BlockInstance.artifacts`는 빈 배열이 아니어야 한다 (done.artifacts 명시 시) | `len(block_instance.artifacts) > 0` |
| INV-05 | `_write_state()`는 항상 `artifacts` 키를 포함해야 한다 | 저장된 JSON에 "artifacts" 키 존재 |
| INV-06 | 다음 블록 컨텍스트에 `previous_artifacts` 키가 있어야 한다 (input 설정 시) | 어댑터 호출 시 context 검증 |

### 7.3 Serialization 불변식

| ID | 불변식 | 검증 방법 |
|----|--------|-----------|
| INV-07 | `to_dict()` → `from_dict()` 왕복 후 input, gate 필드가 동일해야 한다 | `original == restored` |
| INV-08 | 체크포인트 저장/복원 후 모든 BlockInstance 필드가 복원되어야 한다 | 필드별 equality check |

### 7.4 Security 불변식

| ID | 불변식 | 검증 방법 |
|----|--------|-----------|
| INV-09 | `validate_command(["python", "-c", "..."])` 는 항상 `(False, ...)` 를 반환해야 한다 | 단위 테스트 |
| INV-10 | `ALLOWED_COMMANDS`에 `codex`가 포함되어야 한다 | `"codex" in ALLOWED_COMMANDS` |

### 7.5 Dependency 불변식

| ID | 불변식 | 검증 방법 |
|----|--------|-----------|
| INV-11 | `claude_local.py`는 `engine_bridge`를 임포트하지 않아야 한다 | `grep "engine_bridge" claude_local.py` = 0 |
| INV-12 | `engine_routes.py`는 전역 변수를 사용하지 않아야 한다 | `grep "^executor\|^preset_loader\|^checkpoint" engine_routes.py` = 0 |

---

## 8. E2E 시나리오 워크스루

### 8.1 정상 흐름 (feature-standard.yaml 기준)

```
[1] Smith님이 대시보드에서 "실행" 버튼 클릭
    → POST /engine/workflows
    → engine_routes.py: start_workflow()
    → EngineContainer.executor.start("feature-standard", {project, feature})
    
[2] WorkflowExecutor.start()
    → preset_loader.load("feature-standard", variables)
    → _substitute_variables() 재귀 dict walk (변수 치환)
    → WorkflowInstance 생성 (ID = "{feature}-{timestamp}")
    → ArtifactManager.ensure_building_folder(project, feature) 호출
    → ArtifactManager.generate_board() 호출 → BOARD.md 생성
    → StateMachine.transition(workflow.start)
    → StartBlockCommand(block_id="plan") 생성

[3] CommandDispatcher.dispatch(StartBlockCommand)
    → InputResolver.resolve(plan_block, instance) → {} (plan은 input 없음)
    → _build_structured_prompt(plan_block, context) 호출
    → adapter_pool.start_block(adapter="claude_agent_teams", block=plan, context=...)
    → BlockMonitor.monitor("wf-id", "plan") 태스크 시작

[4] PM 에이전트가 plan.md 작성 완료
    → claude_local._write_state(status="done", artifacts=["brick/.../plan.md"])
    → EventBus.publish(AdapterCompletedEvent(workflow_id, block_id="plan", artifacts=[...]))
    
[5] WorkflowExecutor._on_adapter_completed() 수신
    → ArtifactManager.collect(workflow_id, "plan", artifacts)
    → ArtifactRecord 생성 + checkpoint 저장
    → artifact.collected 이벤트 발행
    → complete_block(workflow_id, "plan", artifacts)
    
[6] WorkflowExecutor.complete_block()
    → BlockInstance.artifacts 업데이트
    → StateMachine.transition(block.completed) 호출
    → _find_next_blocks() → ([design_block], []) (tuple 반환 — race condition 해결)
    → StartBlockCommand(block_id="design") 생성
    
[7] CommandDispatcher.dispatch(StartBlockCommand(design))
    → InputResolver.resolve(design_block, instance)
      → from_block="plan" → ArtifactManager.get_artifacts(workflow_id, "plan")
      → plan.md 내용 읽어서 context에 주입
      → returns {"from_block": "plan", "previous_artifacts": [{"path": "...", "content": "..."}]}
    → _build_structured_prompt(design_block, merged_context) — plan.md 내용 포함된 프롬프트
    → adapter_pool.start_block(adapter="claude_agent_teams", block=design, context=...)
    
[8] ... (design → do → check → act 동일 패턴) ...
    
[9] check 블록 gate 평가
    → GateExecutor.run(match_rate_gate)
    → match_rate >= 90 → gate_passed → act 진행
    → match_rate < 90 → gate_failed → loop back to do (max 3회)
    
[10] act 블록 완료
    → BOARD.md 업데이트 (전체 블록 완료 상태)
    → WorkflowInstance.status = "completed"
    → EventBus.publish(WorkflowCompletedEvent)
    → 대시보드에 완료 상태 표시
```

### 8.2 서버 재시작 복구 흐름

```
[1] 서버 재시작
    → engine_bootstrap.create_engine() 호출
    → _auto_recover_workflows(container)
    
[2] CheckpointStore.find_running_blocks() 조회
    → 실행 중이던 블록 목록 반환 [(workflow_id, block_id), ...]
    
[3] 각 블록에 대해
    → container.executor.resume_monitoring(workflow_id, block_id)
      (비공개 _monitor_block() 대신 공개 API 호출)
    → BlockMonitor.monitor() 재시작
    
[4] 어댑터가 이미 완료한 경우
    → 상태 파일에서 "done" 상태 감지
    → complete_block() 호출
    
[5] 어댑터가 아직 실행 중인 경우
    → 10초 폴링 재개
```

### 8.3 경쟁 실행 흐름

```
[1] compete 링크 타입 블록 시작
    → CompeteStartCommand 생성

[2] CommandDispatcher.dispatch(CompeteStartCommand)
    → CompeteGroup 생성
    → 여러 어댑터에 동시 시작
    → CompeteManager.monitor_compete(group) 태스크 시작

[3] 첫 번째 어댑터 완료
    → CompeteManager가 승자 감지 (5초 폴링)
    → _cancel_loser() 호출: adapter.cancel() (#20)
    → complete_block(winner) 호출

[4] 패자 어댑터 취소 완료
    → 워크플로우 계속 진행
```

### 8.4 gate 실패 → 재시도 흐름

```
[1] check 블록 완료
    → GateExecutor.run(): match_rate = 75 (< 90)
    → gate_failed 이벤트

[2] StateMachine이 loop 링크 처리
    → do 블록으로 루프백
    → BlockInstance.retry_count += 1
    → BlockInstance.retry_version += 1 (#12 버전 분리)

[3] do 블록 재실행
    → ArtifactManager는 retry_version별 아티팩트 분리 저장
    → 이전 시도 아티팩트 오염 없음

[4] max_retries (3회) 도달 시
    → 워크플로우 failed 상태로 종료
    → BOARD.md 업데이트
```

---

## 9. TDD 케이스

> **Gap 100% 기준**: 설계의 모든 동작 명세에 1:1 대응하는 테스트 ID가 있어야 한다.
> 테스트 함수명에 `be_XX` ID를 포함해야 한다.

### 9.1 Phase 0 — 크리티컬 버그

#### be_01 — StateMachine _extra_link_commands 경쟁 조건

| 항목 | 내용 |
|------|------|
| **Test ID** | be_01 |
| **Function** | `test_be01_state_machine_no_extra_link_commands_instance_var` |
| **대상** | `brick/engine/state_machine.py` |
| **검증** | `StateMachine` 인스턴스에 `_extra_link_commands` 속성이 없어야 함 |
| **Assert** | `assert not hasattr(sm, '_extra_link_commands')` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_02 |
| **Function** | `test_be02_find_next_blocks_returns_tuple` |
| **대상** | `StateMachine._find_next_blocks()` |
| **검증** | 반환 타입이 `tuple[list, list]`여야 함 |
| **Assert** | `assert isinstance(result, tuple) and len(result) == 2` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_03 |
| **Function** | `test_be03_parallel_blocks_commands_not_overwritten` |
| **대상** | `StateMachine._handle_block_event()` 병렬 처리 |
| **검증** | 병렬 블록 A, B 완료 시 A의 커맨드와 B의 커맨드 모두 보존 |
| **Setup** | 병렬 링크로 연결된 A→[C,D] B→[E] 워크플로우 |
| **Assert** | A 완료 커맨드 수: 1, B 완료 커맨드 수: 1, 서로 덮어쓰지 않음 |

#### be_04 — BlockInstance 직렬화

| 항목 | 내용 |
|------|------|
| **Test ID** | be_04 |
| **Function** | `test_be04_block_instance_to_dict_includes_input` |
| **대상** | `BlockInstance.to_dict()` |
| **검증** | input 필드가 있는 Block의 to_dict() 결과에 "input" 키 포함 |
| **Assert** | `assert "input" in result_dict` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_05 |
| **Function** | `test_be05_block_instance_to_dict_includes_gate` |
| **대상** | `BlockInstance.to_dict()` |
| **검증** | gate 필드가 있는 Block의 to_dict() 결과에 "gate" 키 포함 |
| **Assert** | `assert "gate" in result_dict` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_06 |
| **Function** | `test_be06_block_instance_roundtrip_input_gate` |
| **대상** | `BlockInstance.to_dict()` + `BlockInstance.from_dict()` |
| **검증** | to_dict → from_dict 왕복 후 input, gate 필드가 원본과 동일 |
| **Assert** | `assert original.block.input == restored.block.input` |
| **Assert** | `assert original.block.gate == restored.block.gate` |

#### be_07 — Command Gate 보안

| 항목 | 내용 |
|------|------|
| **Test ID** | be_07 |
| **Function** | `test_be07_command_allowlist_blocks_python_c_flag` |
| **대상** | `command_allowlist.validate_command()` |
| **검증** | `python -c "..."` 커맨드가 차단됨 |
| **Assert** | `allowed, reason = validate_command(["python", "-c", "print(1)"])`<br>`assert allowed is False` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_08 |
| **Function** | `test_be08_command_allowlist_blocks_node_eval_flag` |
| **대상** | `command_allowlist.validate_command()` |
| **검증** | `node -e "..."` 커맨드가 차단됨 |
| **Assert** | `assert validate_command(["node", "-e", "console.log(1)"])[0] is False` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_09 |
| **Function** | `test_be09_command_allowlist_blocks_bash_not_in_allowlist` |
| **대상** | `command_allowlist.validate_command()` |
| **검증** | `bash` 커맨드가 ALLOWED_COMMANDS에 없어 차단됨 |
| **Assert** | `assert validate_command(["bash", "-c", "rm -rf /"])[0] is False` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_10 |
| **Function** | `test_be10_command_allowlist_allows_python_m_flag` |
| **대상** | `command_allowlist.validate_command()` |
| **검증** | `python -m pytest` 커맨드가 **허용**됨 (`-m`은 모듈 실행 플래그, 의도적 비차단) |
| **Assert** | `assert validate_command(["python", "-m", "pytest"])[0] is True` |

#### be_11 — codex Allowlist

| 항목 | 내용 |
|------|------|
| **Test ID** | be_11 |
| **Function** | `test_be11_codex_in_allowed_commands` |
| **대상** | `command_allowlist.ALLOWED_COMMANDS` |
| **검증** | `codex`가 허용 목록에 포함됨 |
| **Assert** | `assert "codex" in ALLOWED_COMMANDS` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_12 |
| **Function** | `test_be12_codex_command_allowed` |
| **대상** | `command_allowlist.validate_command()` |
| **검증** | `codex review ...` 커맨드가 허용됨 |
| **Assert** | `assert validate_command(["codex", "review", "--uncommitted"])[0] is True` |

### 9.2 Phase 1 — 구조 분리

#### be_13 — PresetLoader 모듈 분리

| 항목 | 내용 |
|------|------|
| **Test ID** | be_13 |
| **Function** | `test_be13_preset_loader_importable_from_own_module` |
| **대상** | `brick/engine/preset_loader.py` |
| **검증** | `from brick.engine.preset_loader import PresetLoader` 임포트 성공 |
| **Assert** | `PresetLoader` 클래스가 존재함 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_14 |
| **Function** | `test_be14_preset_loader_variable_substitution_recursive` |
| **대상** | `PresetLoader._substitute_variables()` |
| **검증** | 중첩 dict/list 내부의 변수까지 치환됨 |
| **Setup** | `data = {"blocks": [{"what": "요구사항 {feature}"}]}` |
| **Assert** | 결과의 `data["blocks"][0]["what"] == "요구사항 login"` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_15 |
| **Function** | `test_be15_preset_loader_no_yaml_dump_replace_pattern` |
| **대상** | `PresetLoader._substitute_variables()` 구현 |
| **검증** | `yaml.dump`를 호출하지 않음 (fragile 패턴 제거 확인) |
| **Assert** | mock으로 `yaml.dump` 미호출 확인 |

#### be_16 — BlockMonitor 모듈 분리

| 항목 | 내용 |
|------|------|
| **Test ID** | be_16 |
| **Function** | `test_be16_block_monitor_importable` |
| **대상** | `brick/engine/block_monitor.py` |
| **검증** | `from brick.engine.block_monitor import BlockMonitor` 임포트 성공 |
| **Assert** | `BlockMonitor` 클래스가 존재함 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_17 |
| **Function** | `test_be17_block_monitor_publishes_event_on_completion` |
| **대상** | `BlockMonitor.monitor()` |
| **검증** | 어댑터 완료 시 `AdapterCompletedEvent` 발행 |
| **Assert** | `event_bus.publish.called_once_with(AdapterCompletedEvent(...))` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_18 |
| **Function** | `test_be18_block_monitor_warn_at_5min` |
| **대상** | `BlockMonitor.monitor()` staleness detection |
| **검증** | 5분 경과 시 WARN 로그 발생 |
| **Assert** | `logger.warning` 호출 확인 (5분 시뮬레이션) |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_19 |
| **Function** | `test_be19_block_monitor_timeout_at_10min` |
| **대상** | `BlockMonitor.monitor()` timeout |
| **검증** | 10분 경과 시 타임아웃 처리 (timeout 이벤트 발행) |
| **Assert** | `BlockTimeoutEvent` 발행 확인 |

#### be_20 — CompeteManager 모듈 분리

| 항목 | 내용 |
|------|------|
| **Test ID** | be_20 |
| **Function** | `test_be20_compete_manager_importable` |
| **대상** | `brick/engine/compete_manager.py` |
| **검증** | `from brick.engine.compete_manager import CompeteManager` 임포트 성공 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_21 |
| **Function** | `test_be21_compete_manager_cancels_loser` |
| **대상** | `CompeteManager.monitor_compete()` |
| **검증** | 승자 결정 후 패자에게 `adapter.cancel()` 호출 |
| **Assert** | `loser_adapter.cancel.called_once()` |

#### be_22 — CommandDispatcher 모듈 분리

| 항목 | 내용 |
|------|------|
| **Test ID** | be_22 |
| **Function** | `test_be22_command_dispatcher_importable` |
| **대상** | `brick/engine/command_dispatcher.py` |
| **검증** | `from brick.engine.command_dispatcher import CommandDispatcher` 임포트 성공 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_23 |
| **Function** | `test_be23_command_dispatcher_raises_unknown_command` |
| **대상** | `CommandDispatcher.dispatch()` |
| **검증** | 알 수 없는 커맨드 타입 시 `UnknownCommandError` 발생 |
| **Assert** | `pytest.raises(UnknownCommandError)` |

#### be_24 — EngineContainer (DI)

| 항목 | 내용 |
|------|------|
| **Test ID** | be_24 |
| **Function** | `test_be24_engine_container_importable` |
| **대상** | `brick/engine/container.py` |
| **검증** | `EngineContainer` 데이터클래스 임포트 성공 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_25 |
| **Function** | `test_be25_engine_bridge_no_global_variables` |
| **대상** | `brick/engine/engine_routes.py` (또는 리팩터링 후 engine_bridge.py) |
| **검증** | 모듈 레벨 전역 변수(executor, preset_loader 등) 없음 |
| **Assert** | `grep "^executor\s*=" engine_routes.py` = 빈 결과 |

#### be_26 — 공개 API (Private → Public)

| 항목 | 내용 |
|------|------|
| **Test ID** | be_26 |
| **Function** | `test_be26_executor_has_resume_monitoring_public` |
| **대상** | `WorkflowExecutor.resume_monitoring()` |
| **검증** | `resume_monitoring` 메서드가 공개(leading underscore 없음) |
| **Assert** | `hasattr(executor, 'resume_monitoring') and callable(executor.resume_monitoring)` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_27 |
| **Function** | `test_be27_executor_has_retry_block_public` |
| **대상** | `WorkflowExecutor.retry_block()` |
| **검증** | `retry_block` 메서드가 공개 |
| **Assert** | `hasattr(executor, 'retry_block')` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_28 |
| **Function** | `test_be28_executor_no_private_monitor_block` |
| **대상** | `WorkflowExecutor` |
| **검증** | `_monitor_block` 비공개 메서드가 삭제됨 |
| **Assert** | `assert not hasattr(executor, '_monitor_block')` |

#### be_29 — 순환 의존성 제거

| 항목 | 내용 |
|------|------|
| **Test ID** | be_29 |
| **Function** | `test_be29_claude_local_no_engine_bridge_import` |
| **대상** | `brick/adapters/claude_local.py` 임포트 |
| **검증** | `engine_bridge` 임포트 없음 |
| **Assert** | `"engine_bridge" not in open("claude_local.py").read()` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_30 |
| **Function** | `test_be30_claude_local_notify_publishes_event` |
| **대상** | `claude_local._notify_complete()` |
| **검증** | EventBus에 `AdapterCompletedEvent` 발행 (executor 직접 호출 아님) |
| **Assert** | `event_bus.publish.called_with(AdapterCompletedEvent(...))` |

### 9.3 Phase 2 — 아티팩트 관리

#### be_31 — ArtifactManager

| 항목 | 내용 |
|------|------|
| **Test ID** | be_31 |
| **Function** | `test_be31_artifact_manager_collect_saves_checkpoint` |
| **대상** | `ArtifactManager.collect()` |
| **검증** | collect() 후 checkpoint에 ArtifactRecord 저장됨 |
| **Assert** | `checkpoint.save_artifacts.called_once()` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_32 |
| **Function** | `test_be32_artifact_manager_collect_publishes_event` |
| **대상** | `ArtifactManager.collect()` |
| **검증** | collect() 후 `ArtifactCollectedEvent` 발행 |
| **Assert** | `event_bus.publish.called_with(ArtifactCollectedEvent(...))` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_33 |
| **Function** | `test_be33_artifact_manager_get_artifacts_returns_records` |
| **대상** | `ArtifactManager.get_artifacts()` |
| **검증** | 이전에 collect()한 아티팩트 조회 가능 |
| **Assert** | `len(await manager.get_artifacts(wf_id, block_id)) == 1` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_34 |
| **Function** | `test_be34_artifact_manager_ensure_building_folder_creates_dirs` |
| **대상** | `ArtifactManager.ensure_building_folder()` |
| **검증** | plans/, designs/, implementations/, reports/ 폴더 모두 생성 |
| **Assert** | 4개 폴더 모두 `Path.exists() is True` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_35 |
| **Function** | `test_be35_artifact_manager_generate_board_creates_file` |
| **대상** | `ArtifactManager.generate_board()` |
| **검증** | BOARD.md 파일 생성, 블록 상태 포함 |
| **Assert** | `board_path.exists() is True and "| plan |" in board_path.read_text()` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_36 |
| **Function** | `test_be36_artifact_manager_board_concurrent_protection` |
| **대상** | `ArtifactManager.generate_board()` 동시성 |
| **검증** | 동시 10개 generate_board() 호출 시 파일 손상 없음 |
| **Assert** | 최종 BOARD.md가 유효한 마크다운이고 내용이 정합적 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_37 |
| **Function** | `test_be37_artifact_manager_generate_task_md` |
| **대상** | `ArtifactManager.generate_task_md()` |
| **검증** | TASK.md 파일 생성, block.what 내용 포함 |
| **Assert** | `task_path.exists() and block.what in task_path.read_text()` |

#### be_38 — InputResolver

| 항목 | 내용 |
|------|------|
| **Test ID** | be_38 |
| **Function** | `test_be38_input_resolver_returns_empty_when_no_input_config` |
| **대상** | `InputResolver.resolve()` |
| **검증** | block.input이 None이면 빈 dict 반환 |
| **Assert** | `assert result == {}` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_39 |
| **Function** | `test_be39_input_resolver_fetches_from_block_artifacts` |
| **대상** | `InputResolver.resolve()` |
| **검증** | block.input.from_block="plan"이면 plan 블록 아티팩트 조회 |
| **Assert** | `result["from_block"] == "plan"` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_40 |
| **Function** | `test_be40_input_resolver_reads_file_content` |
| **대상** | `InputResolver.resolve()` |
| **검증** | 아티팩트 파일 내용이 previous_artifacts에 포함 |
| **Assert** | `result["previous_artifacts"][0]["content"] == "파일 내용"` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_41 |
| **Function** | `test_be41_input_resolver_filters_specified_artifacts` |
| **대상** | `InputResolver.resolve()` |
| **검증** | block.input.artifacts에 지정된 경로만 필터링 |
| **Setup** | from_block 아티팩트 3개, input.artifacts에 1개만 지정 |
| **Assert** | `len(result["previous_artifacts"]) == 1` |

#### be_42 — claude_local artifacts 저장

| 항목 | 내용 |
|------|------|
| **Test ID** | be_42 |
| **Function** | `test_be42_write_state_includes_artifacts_key` |
| **대상** | `claude_local._write_state()` |
| **검증** | 저장된 JSON에 "artifacts" 키 포함 |
| **Assert** | `assert "artifacts" in json.loads(state_file.read_text())` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_43 |
| **Function** | `test_be43_get_artifacts_returns_written_artifacts` |
| **대상** | `claude_local.get_artifacts()` |
| **검증** | _write_state()로 저장한 artifacts를 get_artifacts()로 조회 가능 |
| **Assert** | `await adapter.get_artifacts() == ["path/to/plan.md"]` |

#### be_44 — 구조화 프롬프트

| 항목 | 내용 |
|------|------|
| **Test ID** | be_44 |
| **Function** | `test_be44_structured_prompt_includes_task_section` |
| **대상** | `CommandDispatcher._build_structured_prompt()` |
| **검증** | 프롬프트에 `# TASK:` 섹션 포함 |
| **Assert** | `"# TASK:" in prompt` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_45 |
| **Function** | `test_be45_structured_prompt_includes_previous_artifacts` |
| **대상** | `CommandDispatcher._build_structured_prompt()` |
| **검증** | previous_artifacts가 있으면 프롬프트에 이전 블록 산출물 섹션 포함 |
| **Assert** | `"## 이전 블록 산출물" in prompt` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_46 |
| **Function** | `test_be46_structured_prompt_includes_done_criteria` |
| **대상** | `CommandDispatcher._build_structured_prompt()` |
| **검증** | block.done.artifacts가 있으면 완료 기준 섹션 포함 |
| **Assert** | `"## 완료 기준" in prompt` |

#### be_47 — 재시도 버전 분리

| 항목 | 내용 |
|------|------|
| **Test ID** | be_47 |
| **Function** | `test_be47_retry_increments_retry_version` |
| **대상** | `BlockInstance.retry_version` |
| **검증** | 재시도 시 retry_version이 1 증가 |
| **Assert** | `block_instance.retry_version == 1` after first retry |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_48 |
| **Function** | `test_be48_artifacts_isolated_by_retry_version` |
| **대상** | `BlockInstance.artifacts_by_version` |
| **검증** | 재시도 버전별 아티팩트가 분리 저장됨 |
| **Assert** | `block_instance.artifacts_by_version[0] != block_instance.artifacts_by_version[1]` |

#### be_49 — 중복 실행 방지

| 항목 | 내용 |
|------|------|
| **Test ID** | be_49 |
| **Function** | `test_be49_duplicate_workflow_raises_error` |
| **대상** | `WorkflowExecutor.start()` |
| **검증** | 동일 project/feature 워크플로우 실행 중 재시작 시 `DuplicateWorkflowError` 발생 |
| **Assert** | `pytest.raises(DuplicateWorkflowError)` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_50 |
| **Function** | `test_be50_completed_workflow_allows_restart` |
| **대상** | `WorkflowExecutor.start()` |
| **검증** | 완료된 워크플로우와 동일 feature라도 재시작 가능 |
| **Assert** | `start()` 예외 없이 새 workflow_id 반환 |

#### be_51 — Legacy→Building 경로 매핑

| 항목 | 내용 |
|------|------|
| **Test ID** | be_51 |
| **Function** | `test_be51_path_mapper_to_building` |
| **대상** | `PathMapper.to_building()` |
| **검증** | 레거시 경로를 Building 구조로 변환 |
| **Assert** | `mapper.to_building("brick/projects/myapp/plans/login.plan.md", "login") == "brick/projects/myapp/features/login/plans/login.plan.md"` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_52 |
| **Function** | `test_be52_path_mapper_from_building` |
| **대상** | `PathMapper.from_building()` |
| **검증** | Building 경로를 레거시 경로로 역변환 |
| **Assert** | `mapper.from_building("brick/projects/myapp/features/login/plans/login.plan.md") == "brick/projects/myapp/plans/login.plan.md"` |

### 9.4 Phase 3 — 안정화

#### be_53 — 서버 재시작 복구

| 항목 | 내용 |
|------|------|
| **Test ID** | be_53 |
| **Function** | `test_be53_resume_monitoring_public_api` |
| **대상** | `WorkflowExecutor.resume_monitoring()` |
| **검증** | 공개 메서드로 BlockMonitor.monitor() 위임 |
| **Assert** | `block_monitor.monitor.called_with(workflow_id, block_id)` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_54 |
| **Function** | `test_be54_auto_recover_uses_public_api` |
| **대상** | `engine_bootstrap._auto_recover_workflows()` |
| **검증** | `executor._monitor_block()` 비공개 메서드 직접 호출 없음 |
| **Assert** | `executor.resume_monitoring.called()` (비공개 메서드 미호출) |

#### be_55 — adapter.cancel()

| 항목 | 내용 |
|------|------|
| **Test ID** | be_55 |
| **Function** | `test_be55_compete_loser_calls_adapter_cancel` |
| **대상** | `CompeteManager._cancel_loser()` |
| **검증** | 패자 어댑터에 `cancel()` 호출 |
| **Assert** | `adapter.cancel.called_once_with(workflow_id, block_id)` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_56 |
| **Function** | `test_be56_compete_loser_cancel_failure_does_not_crash` |
| **대상** | `CompeteManager._cancel_loser()` |
| **검증** | adapter.cancel() 예외 시 경고 로그만 남기고 계속 진행 |
| **Assert** | `pytest.raises` 없음, `logger.warning` 호출 확인 |

#### be_57 — preset extends deep merge

| 항목 | 내용 |
|------|------|
| **Test ID** | be_57 |
| **Function** | `test_be57_preset_deep_merge_nested_dict` |
| **대상** | `PresetLoader._deep_merge()` |
| **검증** | 중첩 dict 필드 재귀 merge |
| **Assert** | `base = {"a": {"b": 1, "c": 2}}`, `override = {"a": {"c": 3}}` → `{"a": {"b": 1, "c": 3}}` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_58 |
| **Function** | `test_be58_preset_deep_merge_list_override` |
| **대상** | `PresetLoader._deep_merge()` |
| **검증** | list 필드는 override가 base를 완전 교체 |
| **Assert** | `base = {"links": [1,2]}`, `override = {"links": [3]}` → `{"links": [3]}` |

#### be_59 — EventBus async 핸들러

| 항목 | 내용 |
|------|------|
| **Test ID** | be_59 |
| **Function** | `test_be59_event_bus_publishes_to_async_handler` |
| **대상** | `EventBus.publish()` |
| **검증** | async 핸들러가 실제로 await됨 (코루틴 누락 없음) |
| **Setup** | async 핸들러 등록, 이벤트 발행 |
| **Assert** | `handler_called is True` (await된 후 설정되는 플래그) |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_60 |
| **Function** | `test_be60_event_bus_sync_handler_still_works` |
| **대상** | `EventBus.publish()` |
| **검증** | 동기 핸들러 기존 동작 유지 (하위 호환) |
| **Assert** | `sync_handler_called is True` |

### 9.5 E2E 통합 테스트

| 항목 | 내용 |
|------|------|
| **Test ID** | be_61 |
| **Function** | `test_be61_e2e_artifacts_flow_plan_to_design` |
| **대상** | plan → design 블록 아티팩트 흐름 |
| **검증** | plan 블록 완료 후 design 블록 컨텍스트에 plan.md 내용 포함 |
| **Setup** | feature-standard.yaml 기반 워크플로우, mock 어댑터 |
| **Assert** | `design_adapter_call.context["previous_artifacts"][0]["path"].endswith("plan.md")` |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_62 |
| **Function** | `test_be62_e2e_gate_fail_retry_success` |
| **대상** | gate 실패 → 재시도 → 성공 흐름 |
| **검증** | match_rate=75로 첫 check 실패 → do 재실행 → match_rate=95로 성공 |
| **Assert** | 워크플로우 최종 상태 "completed", do 블록 retry_count=1 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_63 |
| **Function** | `test_be63_e2e_server_restart_recovery` |
| **대상** | 서버 재시작 후 실행 중 워크플로우 복구 |
| **검증** | 재시작 후 resume_monitoring() 호출로 모니터링 재개 |
| **Assert** | 복구 후 블록이 정상 완료됨 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_64 |
| **Function** | `test_be64_e2e_board_md_updated_on_completion` |
| **대상** | BOARD.md 자동 업데이트 |
| **검증** | 각 블록 완료 시 BOARD.md가 업데이트됨 |
| **Assert** | plan 완료 후 `BOARD.md`에 `| plan | completed |` 포함 |

| 항목 | 내용 |
|------|------|
| **Test ID** | be_65 |
| **Function** | `test_be65_e2e_parallel_blocks_no_race_condition` |
| **대상** | 병렬 블록 경쟁 조건 없음 |
| **검증** | 병렬 블록 10쌍 동시 완료 시 모든 커맨드 정확히 처리 |
| **Assert** | 누락된 StartBlockCommand 0건 |

### 9.6 테스트 파일 위치 및 구조

```
brick/__tests__/engine/
├── test_be00_phase0_critical/
│   ├── test_state_machine_race.py      # be_01 ~ be_03
│   ├── test_block_serialization.py     # be_04 ~ be_06
│   ├── test_command_security.py        # be_07 ~ be_10
│   └── test_codex_allowlist.py         # be_11 ~ be_12
├── test_be01_phase1_structure/
│   ├── test_preset_loader.py           # be_13 ~ be_15
│   ├── test_block_monitor.py           # be_16 ~ be_19
│   ├── test_compete_manager.py         # be_20 ~ be_21
│   ├── test_command_dispatcher.py      # be_22 ~ be_23
│   ├── test_engine_container.py        # be_24 ~ be_25
│   ├── test_public_api.py              # be_26 ~ be_28
│   └── test_circular_dependency.py     # be_29 ~ be_30
├── test_be02_phase2_artifacts/
│   ├── test_artifact_manager.py        # be_31 ~ be_37
│   ├── test_input_resolver.py          # be_38 ~ be_41
│   ├── test_claude_local_artifacts.py  # be_42 ~ be_43
│   ├── test_structured_prompt.py       # be_44 ~ be_46
│   ├── test_retry_version.py           # be_47 ~ be_48
│   ├── test_duplicate_prevention.py    # be_49 ~ be_50
│   └── test_path_mapper.py             # be_51 ~ be_52
├── test_be03_phase3_stability/
│   ├── test_server_recovery.py         # be_53 ~ be_54
│   ├── test_adapter_cancel.py          # be_55 ~ be_56
│   ├── test_preset_deep_merge.py       # be_57 ~ be_58
│   └── test_event_bus_async.py         # be_59 ~ be_60
└── test_be04_e2e/
    ├── test_artifact_flow.py           # be_61
    ├── test_gate_retry.py              # be_62
    ├── test_server_recovery.py         # be_63
    ├── test_board_update.py            # be_64
    └── test_parallel_no_race.py        # be_65
```

---

## 10. 구현 순서 및 의존성

```
Phase 0 (병렬 가능)
  ├── be_01~03: state_machine.py 수정 (독립)
  ├── be_04~06: workflow.py 수정 (독립)
  ├── be_07~10: command_allowlist.py 수정 (독립)
  └── be_11~12: command_allowlist.py 수정 (#18과 같은 파일, 순차)

Phase 1 (Phase 0 완료 후)
  ├── be_13~15: preset_loader.py 신규 (executor.py에서 분리)
  ├── be_16~19: block_monitor.py 신규 (executor.py에서 분리)
  ├── be_20~21: compete_manager.py 신규 (executor.py에서 분리)
  ├── be_22~23: command_dispatcher.py 신규 (executor.py에서 분리)
  ├── be_24~25: container.py 신규 (engine_bridge.py에서 분리) ← Phase 1 마지막
  ├── be_26~28: executor.py 공개 API
  └── be_29~30: claude_local.py 순환 의존성 제거 ← container.py 완료 후

Phase 2 (Phase 1 완료 후)
  ├── be_31~37: artifact_manager.py 신규
  ├── be_38~41: input_resolver.py 신규 ← artifact_manager 완료 후
  ├── be_42~43: claude_local.py artifacts 저장 (독립)
  ├── be_44~46: command_dispatcher.py 프롬프트 (#4와 함께)
  ├── be_47~48: workflow.py retry_version
  ├── be_49~50: executor.py 중복 방지
  └── be_51~52: path_mapper.py 신규 (독립)

Phase 3 (Phase 2 완료 후)
  ├── be_53~54: executor.py resume_monitoring (Phase 1에서 일부 완료)
  ├── be_55~56: compete_manager.py cancel
  ├── be_57~58: preset_loader.py deep merge
  └── be_59~60: event_bus.py async

E2E (Phase 3 완료 후)
  └── be_61~65: 통합 시나리오
```

---

## 11. 완료 기준 (Gap 검증)

### 11.1 테스트 커버리지

| 단계 | 테스트 ID | 최소 통과 기준 |
|------|-----------|--------------|
| Phase 0 | be_01 ~ be_12 | 12/12 (100%) |
| Phase 1 | be_13 ~ be_30 | 18/18 (100%) |
| Phase 2 | be_31 ~ be_52 | 22/22 (100%) |
| Phase 3 | be_53 ~ be_60 | 8/8 (100%) |
| E2E | be_61 ~ be_65 | 5/5 (100%) |
| **전체** | **be_01 ~ be_65** | **65/65 (100%)** |

### 11.2 빌드 품질

- `npx tsc --noEmit --quiet` — 타입 에러 0개
- `npx next lint --quiet` — lint 에러 0개
- `npm run build` — 빌드 성공
- 기존 638개 테스트 모두 통과 (regression 없음)

### 11.3 불변식 검증

| ID | 상태 |
|----|------|
| INV-01 ~ INV-12 | 각 Phase 완료 시 검증 |

---

## 12. 리스크 및 마이그레이션

### 12.1 하위 호환성 위험

| 변경 | 위험 | 완화 방법 |
|------|------|-----------|
| `executor._monitor_block()` 제거 | 외부 코드가 비공개 메서드 직접 호출 중 (engine_bridge.py 3곳) | Phase 1에서 engine_bridge.py도 함께 수정 |
| `EventBus.publish()` → async 추가 | 기존 동기 호출부 await 누락 | `publish()` 유지 + `publish_async()` 추가 방식 선택 |
| `BlockInstance.to_dict()` 변경 | 저장된 체크포인트 포맷 변경 | 마이그레이션 스크립트 작성 + from_dict() 하위 호환 처리 |

### 12.2 Phase별 롤백 전략

- **Phase 0**: 각 버그 수정이 독립적이므로 개별 롤백 가능
- **Phase 1**: 모듈 분리는 기능 변경 없이 구조만 변경 → 기존 테스트 통과 시 rollback 불필요
- **Phase 2**: ArtifactManager/InputResolver는 신규 기능 → 기존 동작에 영향 없음
- **Phase 3**: EventBus async는 기존 동기 동작 유지하는 방식으로 구현

---

*설계서 끝. 구현 시 이 문서를 기준으로 Gap 분석 수행.*
