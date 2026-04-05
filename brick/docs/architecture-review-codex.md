# Brick 엔진 아키텍처 리뷰

> 작성: Codex (subagent)  
> 기준 코드: `/Users/smith/projects/bscamp/brick/brick/`  
> 날짜: 2026-04-05

---

## 요약

3축 구조 설계는 올바르다. 문제는 설계 결함이 아니라 **구현 누락**이다. `Block.input`은 모델에 이미 정의돼 있고, `adapter.get_artifacts()`도 인터페이스에 있다. executor가 둘 다 호출하지 않는다. "안 되는 5가지" 중 4가지는 기존 뼈대에 살을 붙이는 수준으로 해결된다. ArtifactManager 분리는 맞는 방향이다.

---

## 1. 3축 구조 코드 검증

### 블록축 (업무단위)

```
models/block.py
  Block.id, Block.what, Block.done (DoneCondition)
  Block.gate (GateConfig) → 완료 조건
  Block.input (InputConfig) → 선행 산출물 참조 [모델만 존재, executor 미사용]
```

`Block`이 단일 업무 단위를 표현하고, `DoneCondition.artifacts`로 완료 기준을 명시한다. **구조 자체는 올바르다.**

### 팀축 (누가)

```
models/team.py → TeamDefinition (adapter, config)
adapters/base.py → TeamAdapter (start_block, check_status, get_artifacts, cancel)
adapters/ → ClaudeAgentTeamsAdapter, ClaudeCodeAdapter, HumanAdapter, WebhookAdapter ...
```

YAML의 `teams: {block_id: {adapter: ..., config: ...}}` → `PresetLoader._parse_preset()` → `TeamDefinition` → executor가 `adapter_pool.get(cmd.adapter)` 로 실행. **3축 중 가장 완성도 높음.**

### 링크축 (순서)

```
models/link.py → LinkDefinition
engine/state_machine.py → _find_next_blocks(), _resolve_*()
```

sequential / loop / branch / parallel / compete / cron / hook 7개 링크 타입이 StateMachine 레지스트리로 등록됨. `register_link()` 로 런타임에 확장 가능. **구조 올바름.**

### 엔진 (3축 런타임)

```
engine/executor.py → WorkflowExecutor.start(), complete_block(), _execute_command()
engine/state_machine.py → transition() = (new_instance, commands[])
engine/event_bus.py → publish(), subscribe()
engine/checkpoint.py → save(), load() (atomic tmp→rename)
```

State Machine이 순수 함수형으로 상태 전이를 계산하고, Executor가 I/O 사이드이펙트(adapter 호출, checkpoint 저장, EventBus 발행)를 처리한다. **분리 방향 올바름.**

**결론: 3축 구조는 설계 의도대로 구현됐다.**

---

## 2. 구조 냄새 (Smell) 진단

### 🔴 냄새 1 — Phantom Layer: `Block.input` (모델 있음, 구현 없음)

```python
# models/block.py
@dataclass
class InputConfig:
    from_block: str = ""
    artifacts: list[str] = field(default_factory=list)

@dataclass
class Block:
    ...
    input: InputConfig | None = None  # ← 정의됨
```

```python
# engine/executor.py _execute_command() — StartBlockCommand 처리
execution_id = await adapter.start_block(block_inst.block, {
    "workflow_id": instance.id,
    "block_id": cmd.block_id,
    "block_what": block_inst.block.what,
    "block_type": block_inst.block.type,
    "project_context": instance.context,
    "team_config": team_config,
    # ← block.input 참조 없음. 선행 블록 산출물 전달 안 됨.
})
```

`Block.input`은 모델에 있고, executor가 어댑터에 context를 넘기는 지점도 있는데, 두 개가 연결되지 않았다. "블록 간 산출물 전달 안 됨"의 직접 원인.

추가로 `BlockInstance.to_dict()` / `from_dict()` 에서 `block.input`이 직렬화/역직렬화되지 않아 체크포인트 재시작 후 input config가 소실된다.

---

### 🔴 냄새 2 — Phantom Method: `adapter.get_artifacts()` (인터페이스 있음, 호출 없음)

```python
# adapters/base.py
class TeamAdapter(ABC):
    @abstractmethod
    async def get_artifacts(self, execution_id: str) -> list[str]:
        """Get artifacts produced by execution."""
        ...
```

```python
# adapters/claude_agent_teams.py — 구현됨
async def get_artifacts(self, execution_id: str) -> list[str]:
    state_file = self.team_context_dir / f"task-state-{execution_id}.json"
    if state_file.exists():
        data = json.loads(state_file.read_text())
        return data.get("artifacts", [])
    return []
```

`executor.complete_block()` 어디에도 `adapter.get_artifacts()`를 호출하는 코드가 없다. 에이전트가 만든 실제 파일 목록을 엔진이 수집하지 않는다. `BlockInstance.artifacts`는 `CompleteBlockRequest`에서 직접 넣어줘야만 채워진다.

---

### 🔴 냄새 3 — Impure StateMachine (`_extra_link_commands` 인스턴스 변수)

```python
# state_machine.py — 클래스 선언부
class StateMachine:
    """Pure functional state machine. transition() returns a NEW WorkflowInstance."""

    def __init__(self):
        ...
        self._extra_link_commands: list[Command] = []  # ← 인스턴스 변수

    def _find_next_blocks(self, wf, block_id) -> list[str]:
        ...
        self._extra_link_commands = extra_commands  # ← side-effect!
        return next_ids

    def _handle_block_event(self, wf, event):
        ...
        next_blocks = self._find_next_blocks(wf, block_id)
        for cc in self._extra_link_commands:  # ← 이전 호출 결과 읽기
            commands.append(cc)
```

"Pure functional, zero side effects"라고 명시했는데 `_extra_link_commands`를 인스턴스 변수로 쓴다. 병렬로 여러 워크플로우가 동시에 `transition()`을 호출하면 경쟁 상태(race condition)가 발생할 수 있다. compete 링크의 `CompeteStartCommand`를 전달하기 위한 임시 workaround로 보이는데, 이 방식은 문서화된 설계 원칙과 충돌한다.

**수정 방향**: `_find_next_blocks`가 `(next_ids, extra_commands)` 튜플을 반환하도록.

---

### 🟡 냄새 4 — Leaky Abstraction: 대시보드가 executor private 메서드 직접 호출

```python
# dashboard/routes/engine_bridge.py — EP-8 retry-adapter
cmd = StartBlockCommand(block_id=req.block_id, adapter=block_inst.adapter)
instance = await executor._execute_command(instance, cmd)  # _로 시작하는 private

# EP-9 hook trigger
cmd = StartBlockCommand(block_id=target_link.to_block, adapter=to_block.adapter)
instance = await executor._execute_command(instance, cmd)
```

`_execute_command`는 internal 메서드다. 대시보드 라우터가 직접 호출하면 executor 내부 구현이 변경될 때 라우터도 깨진다.

---

### 🟡 냄새 5 — God Context Dict

`WorkflowInstance.context: dict`에 이질적인 것들이 모두 혼재:

| 키 | 출처 | 타입 |
|---|---|---|
| `project` | executor.start() | dict |
| `done_artifacts` | executor.complete_block() | list[str] |
| `reject_reason`, `reject_count` | executor.complete_block() | str, int |
| `_loop_{a}_{b}` | state_machine._resolve_loop() | int |
| `approval_action`, `review_action` | API 호출자 | str |
| `match_rate`, `tsc_errors` | gate 결과 | float |

타입 없는 dict가 엔진 전체 공유 상태로 쓰인다. 어떤 키가 어느 시점에 있는지 코드를 추적해야만 알 수 있다.

---

### 🟡 냄새 6 — done_artifacts에 계획 경로가 저장됨 (실제 파일 아님)

```python
# executor.complete_block()
if block_inst and block_inst.block.done.artifacts:
    instance.context["done_artifacts"] = block_inst.block.done.artifacts
    # ↑ block.done.artifacts는 YAML에 정의된 경로 템플릿 (계획)
    # ↑ 에이전트가 실제로 만든 파일 경로가 아님
```

`done_artifacts`는 "에이전트가 이 경로에 파일을 만들어야 한다"는 계획이지, 실제로 만들어진 파일 목록이 아니다. 게이트에서 실존 여부를 체크하지 않으면 아무 파일도 없이 완료된다.

---

### 🟡 냄새 7 — ArtifactExistsGate 사용되지 않음 (dead code)

```python
# gates/artifact_exists.py — 구현됨
class ArtifactExistsGate:
    async def check(self, artifacts: list[str], context: dict) -> GateResult: ...
```

`ConcreteGateExecutor._register_builtins()`에 등록되지 않았다. YAML에서 참조할 방법도 없다. `_run_artifact()`는 `ConcreteGateExecutor`에 별도로 구현돼 있고 `"artifact"` 타입으로 등록돼 있는데, `ArtifactExistsGate`는 완전히 다른 경로로 만들어진 중복 구현이다.

---

### 🟡 냄새 8 — executor.py가 너무 큰 파일 (600+ 라인, 다른 책임 혼재)

`executor.py`에 들어있는 것들:
- `CompeteExecution`, `CompeteGroup` (데이터클래스)
- `PresetLoader` (파싱 책임)
- `WorkflowExecutor` (실행 책임)
- `_monitor_block`, `_monitor_compete` (폴링 루프)
- `_load_project_yaml` (파일 I/O)

특히 `PresetLoader`는 executor와 관심사가 다르다. `PresetLoader`는 YAML → 도메인 모델 변환기. 분리해야 한다.

---

## 3. ArtifactManager 분리 vs executor 내장

**결론: 분리가 맞다. SlackSubscriber 패턴 그대로 쓸 것.**

이유:

1. **패턴 일관성**: SlackSubscriber, SkyOfficeBridge, EventBridge가 이미 EventBus subscriber로 분리돼 있다. ArtifactManager도 같은 패턴을 따르면 구조가 일관된다.

2. **SRP**: executor의 책임은 블록 실행 오케스트레이션이다. 파일 복사, 폴더 정리, 통합 문서 생성은 별개의 관심사.

3. **테스트 용이**: `ArtifactManager`를 EventBus mock으로 단독 테스트할 수 있다. executor에 내장하면 같이 테스트해야 한다.

4. **선택적 활성화**: 특정 환경에서 artifact 관리가 불필요하면 그냥 구독 안 하면 된다. executor에 내장하면 항상 실행된다.

5. **executor 비대화 방지**: executor.py 이미 600+ 라인. 더 넣으면 God Object.

**executor에 내장하면 안 되는 이유가 하나 더**: Building 폴더 구조가 변경될 때 executor 코드를 건드려야 한다. 변경 영향 범위가 너무 넓어진다.

---

## 4. 블록 간 산출물 전달 — 구현 방법 제안

### 현재 데이터 흐름 (문제 있음)

```
YAML done.artifacts ["plans/{feature}.plan.md"]
    ↓ PresetLoader
Block.done.artifacts ["plans/auth.plan.md"]
    ↓ complete_block()
context["done_artifacts"] = ["plans/auth.plan.md"]   ← 계획 경로, 실존 보장 없음
    ↓ start_block() 다음 블록
에이전트에게 context 전달 → "done_artifacts" 키가 있긴 한데
에이전트가 이 경로를 읽어야 한다는 지시가 없음
```

### 제안 흐름 (executor에서 처리)

**Step 1: complete_block에서 실제 artifacts 수집**

```python
# executor.complete_block() 수정
# 기존 adapter.get_artifacts() 호출 추가
adapter = self.adapter_pool.get(block_inst.adapter)
if adapter and block_inst.execution_id:
    try:
        actual_artifacts = await adapter.get_artifacts(block_inst.execution_id)
        if actual_artifacts:
            block_inst.artifacts = actual_artifacts  # 실제 파일 경로 저장
    except Exception:
        pass  # 실패해도 gate로 진행
```

**Step 2: StartBlockCommand 시 input 해석 (executor에서)**

```python
# _execute_command() StartBlockCommand 처리 부분에 추가
block_inst = instance.blocks.get(cmd.block_id)
input_artifacts: list[str] = []
input_summary: str = ""

if block_inst.block.input and block_inst.block.input.from_block:
    from_id = block_inst.block.input.from_block
    from_inst = instance.blocks.get(from_id)
    if from_inst:
        # 1순위: 어댑터가 보고한 실제 파일
        # 2순위: YAML done.artifacts 계획 경로
        input_artifacts = from_inst.artifacts or from_inst.block.done.artifacts

execution_id = await adapter.start_block(block_inst.block, {
    "workflow_id": instance.id,
    "block_id": cmd.block_id,
    "block_what": block_inst.block.what,
    "block_type": block_inst.block.type,
    "project_context": instance.context,
    "team_config": team_config,
    "input_artifacts": input_artifacts,        # ← 추가
    "input_from_block": (
        block_inst.block.input.from_block
        if block_inst.block.input else ""
    ),                                          # ← 추가
})
```

**Step 3: YAML에서 input 선언**

```yaml
blocks:
  - id: design
    type: Design
    what: "상세 설계 작성"
    input:
      from_block: plan       # plan 블록의 산출물을 가져다 쓴다
    done:
      artifacts: ["brick/projects/{project}/designs/{feature}.design.md"]
```

**구현 레이어 결정**: executor에서 처리가 맞다. 이유:
- adapter는 "어떻게 실행하는가"만 안다. "뭘 받아서 뭘 해야 하는가"는 워크플로우 오케스트레이션 레이어(executor)의 책임.
- 별도 레이어(artifact resolver)로 분리하면 executor → resolver → adapter 순서로 의존이 늘어나 복잡도만 증가.
- adapter는 이미 `context` dict를 받는다. `input_artifacts` 키를 추가하는 것만으로 충분.

---

## 5. Building 폴더 구조 제안

### 현재 문제

```
brick/projects/bscamp/
  plans/       ← 모든 실행의 plan 파일이 덮어씌워짐
  designs/
  reports/
  tasks/
```

feature-standard.yaml 기준:
- plan: `brick/projects/{project}/plans/{feature}.plan.md`
- design: `brick/projects/{project}/designs/{feature}.design.md`

같은 feature를 두 번 실행하면 두 번째 실행이 첫 번째 결과를 덮어씀. 어느 Building이 어떤 산출물을 만들었는지 추적 불가.

### 제안: Building별 폴더

```
brick/
  projects/
    {project}/                          # 프로젝트
      buildings/                        # 모든 Building 실행 이력
        {workflow_id}/                  # Building 단위 (실행 ID)
          meta.json                     # {preset, feature, task, started_at, status}
          plan/
            auth.plan.md
          design/
            auth.design.md
          reports/
            security-auth.md
          summary.md                    # ArtifactManager가 완료 시 자동 생성
          events.jsonl                  # 이 Building의 이벤트 로그
      
      latest -> buildings/{최신 id}    # 최신 완료 Building symlink (선택)
```

**프리셋 YAML 경로 전략** (두 가지 옵션):

옵션 A: 절대 경로를 Building 폴더 기준으로 변경 (권장)
```yaml
done:
  artifacts: ["plan/{feature}.plan.md"]   # Building 폴더 내 상대 경로
```
ArtifactManager가 실제 전체 경로 `brick/projects/{project}/buildings/{wf_id}/plan/auth.plan.md`로 확장.

옵션 B: 기존 경로 유지 + ArtifactManager가 사후에 Building 폴더로 복사
```yaml
done:
  artifacts: ["brick/projects/{project}/plans/{feature}.plan.md"]  # 기존 유지
```
ArtifactManager가 `block.gate_passed` 이벤트에서 Building 폴더로 복사. 하위 호환성 유지됨.

**추천**: 옵션 B로 시작. 기존 YAML 수정 없이 ArtifactManager만 추가하면 된다.

**Building별 vs 플랫 비교**:

| | Building별 폴더 | 플랫 (현재) |
|---|---|---|
| 재실행 보존 | ✅ | ❌ 덮어씌워짐 |
| 이력 추적 | ✅ | ❌ |
| 통합문서 위치 | ✅ 명확 | ❌ 어디? |
| 블록 간 파일 참조 | ✅ workflow_id 경로로 명확 | ❌ 충돌 위험 |
| 최신 파일 빠른 접근 | 추가 구현 필요 | ✅ 바로 |

---

## 6. 놓치고 있는 구조적 문제

### 🔴 BlockInstance 직렬화에서 `input` 소실

```python
# workflow.py BlockInstance.to_dict()
return {
    "block": {
        "id": self.block.id,
        "what": self.block.what,
        "done": {...},
        # ← block.input 없음!
    },
    ...
}

# BlockInstance.from_dict()
block = Block(
    id=block_data["id"],
    what=block_data["what"],
    done=...,
    # ← input= 없음!
)
```

서버 재시작 또는 체크포인트 복구 후 `Block.input`이 None으로 초기화된다. 재시작 후 블록 간 산출물 전달이 깨진다.

### 🔴 산출물 필수 강제 로직 없음

`block.done.artifacts`에 경로가 명시돼 있어도 게이트에 `artifact` 타입 핸들러를 명시하지 않으면 파일이 없어도 완료된다. `ConcreteGateExecutor._run_artifact()`는 구현돼 있지만 자동으로 적용되지 않는다.

**수정 방향**: `PresetLoader._parse_preset()`에서 `done.artifacts`가 있는데 `artifact` gate가 없는 경우 자동으로 추가:

```python
# PresetLoader._parse_preset() 블록 파싱 후
if done_data.get("artifacts") and (not gate_data or not any(
    h["type"] == "artifact" for h in gate_data.get("handlers", [])
)):
    if not gate_config:
        gate_config = GateConfig(handlers=[], on_fail="fail", max_retries=0)
    gate_config.handlers.insert(0, GateHandler(type="artifact"))
```

### 🔴 `artifact` gate가 context에서 artifacts를 읽는데, 그 artifacts가 항상 비어있음

```python
# concrete.py _run_artifact()
artifacts = context.get("artifacts", [])   # ← context["artifacts"] 키
if not artifacts:
    return GateResult(passed=False, detail="산출물 없음", type="artifact")
```

executor가 gate_executor.run_gates()를 호출할 때 넘기는 context에 `"artifacts"` 키가 없다. `done_artifacts`는 있지만 `artifacts`는 없다. gate가 항상 "산출물 없음"으로 실패한다.

수정: `complete_block()`에서 game context에 `artifacts` 키 추가:
```python
context["artifacts"] = block_inst.artifacts or block_inst.block.done.artifacts
```

### 🟡 WorkflowInstance ID 충돌 위험

```python
# workflow.py
id=f"{feature}-{int(time.time())}"
```
같은 feature를 1초 안에 두 번 실행하면 ID 충돌 → checkpoint 덮어씌움. UUID4 사용 권장.

### 🟡 adapter 매 블록마다 재생성

```python
# executor._execute_command()
if team_config:
    adapter = adapter.__class__(team_config)  # 매 번 새 인스턴스
```

`ClaudeAgentTeamsAdapter.__init__()`에서 `MCPBridge` 초기화, 커넥션 설정 등이 발생한다. 실행마다 재생성은 낭비.

### 🟡 `ArtifactExistsGate` dead code

`gates/artifact_exists.py`는 등록되지 않고 사용되지 않는다. `ConcreteGateExecutor`의 `_run_artifact()`와 중복. 삭제하거나 통합해야 한다.

### 🟡 블록 라이브러리 없음 (재사용 불가)

모든 블록 정의가 preset YAML 안에 인라인으로 존재한다. "plan 블록"을 여러 preset에서 재사용하려면 복사-붙여넣기가 유일한 방법.

---

## 7. 외부 레퍼런스에서 배울 점

### GitHub Actions — 블록 간 outputs/inputs

가장 직접적인 레퍼런스. Jobs간 데이터 전달을 `outputs` → `needs.{job}.outputs.{key}` 패턴으로 처리.

```yaml
jobs:
  plan:
    outputs:
      plan_path: ${{ steps.write.outputs.plan_path }}
    steps:
      - id: write
        run: echo "plan_path=plans/auth.plan.md" >> $GITHUB_OUTPUT

  design:
    needs: plan
    steps:
      - run: echo "이전 블록 산출물: ${{ needs.plan.outputs.plan_path }}"
```

**Brick에 적용**: Block에 `outputs` 필드 추가 → 다음 블록 context에 `blocks.{id}.outputs.{key}` 형태로 주입. YAML:

```yaml
blocks:
  - id: plan
    outputs:
      plan_path: "brick/projects/{project}/plans/{feature}.plan.md"
  - id: design
    input:
      from_block: plan
      # executor가 blocks.plan.outputs.plan_path를 context에서 가져다 줌
```

---

### Temporal — Activity Input/Output 타입 보장

Temporal의 Workflow는 Activity에 typed input을 넘기고, typed output을 받는다. 런타임에 직렬화/역직렬화 오류를 즉시 잡는다.

```python
# Temporal 패턴
@activity.defn
async def plan_activity(input: PlanInput) -> PlanOutput:
    ...
    return PlanOutput(plan_path="plans/auth.plan.md")

# Workflow에서
output = await workflow.execute_activity(plan_activity, PlanInput(feature="auth"))
design_input = DesignInput(plan_path=output.plan_path)
```

**Brick에 적용 (단기)**: context를 untyped dict에서 `ContextKey` 상수로 최소화:

```python
class ContextKey:
    DONE_ARTIFACTS = "done_artifacts"
    INPUT_ARTIFACTS = "input_artifacts"
    INPUT_FROM_BLOCK = "input_from_block"
    REJECT_REASON = "reject_reason"
    REJECT_COUNT = "reject_count"
```

중장기에는 `BlockInput` / `BlockOutput` dataclass로 typed context 도입.

---

### Airflow — XCom (Cross-task communication)

Airflow는 태스크 간 소량 데이터를 DB에 key-value로 저장한다. 명시적 push/pull API.

```python
# 업스트림
task_instance.xcom_push(key='plan_path', value='plans/auth.plan.md')

# 다운스트림
plan_path = task_instance.xcom_pull(task_ids='plan_task', key='plan_path')
```

**Brick에 적용**: `CheckpointStore`가 이미 WorkflowInstance를 저장한다. XCom에 해당하는 것은 `BlockInstance.artifacts`. executor에 helper 추가:

```python
def get_block_output(instance: WorkflowInstance, block_id: str) -> list[str]:
    bi = instance.blocks.get(block_id)
    return bi.artifacts if bi else []
```

이걸 `_execute_command` StartBlockCommand에서 호출해서 `input_artifacts`로 전달.

---

### Prefect — Artifact 등록 API

Prefect는 task가 만든 artifact를 명시적으로 등록하고, UI에서 조회할 수 있다.

```python
create_link_artifact(link="s3://bucket/design.md", description="설계 문서")
create_markdown_artifact(markdown="# 요약\n...", key="summary")
```

**Brick에 적용**: `ArtifactManager`가 `block.gate_passed` 이벤트에서:
1. 파일을 Building 폴더로 복사
2. `artifact_registry.json`에 등록 (block_id, path, created_at, workflow_id)
3. `workflow.completed` 이벤트에서 registry 기반 summary.md 생성

---

## 8. ArtifactManager 구현 설계

```python
# engine/artifact_manager.py

from __future__ import annotations
import json
import shutil
import time
from pathlib import Path

from brick.engine.checkpoint import CheckpointStore
from brick.engine.event_bus import EventBus
from brick.models.events import Event


class ArtifactManager:
    """
    EventBus subscriber. SlackSubscriber 패턴과 동일 구조.
    
    구독:
      block.gate_passed  → 산출물 Building 폴더로 복사 + registry 등록
      workflow.completed → 통합 summary.md 생성
    """

    def __init__(
        self,
        event_bus: EventBus,
        checkpoint: CheckpointStore,
        projects_dir: Path = Path("brick/projects"),
    ):
        self.checkpoint = checkpoint
        self.projects_dir = projects_dir
        
        event_bus.subscribe("block.gate_passed", self._on_gate_passed)
        event_bus.subscribe("workflow.completed", self._on_workflow_completed)

    def _on_gate_passed(self, event: Event) -> None:
        workflow_id = event.data.get("workflow_id", "")
        block_id = event.data.get("block_id", "")
        if not workflow_id or not block_id:
            return

        instance = self.checkpoint.load(workflow_id)
        if not instance:
            return

        block_inst = instance.blocks.get(block_id)
        if not block_inst:
            return

        artifacts = block_inst.artifacts or block_inst.block.done.artifacts
        if not artifacts:
            return

        project_ctx = instance.context.get("project", {})
        project = (
            project_ctx.get("name", "") if isinstance(project_ctx, dict) else ""
        ) or instance.definition.project or "default"

        building_dir = self.projects_dir / project / "buildings" / workflow_id / block_id
        building_dir.mkdir(parents=True, exist_ok=True)

        registered = []
        for artifact_path in artifacts:
            src = Path(artifact_path)
            if src.exists():
                dst = building_dir / src.name
                shutil.copy2(src, dst)
                registered.append(str(dst))
            else:
                registered.append(artifact_path)  # 경로만 등록 (파일 없어도)

        self._register(workflow_id, block_id, registered, project)

    def _on_workflow_completed(self, event: Event) -> None:
        workflow_id = event.data.get("workflow_id", "")
        if not workflow_id:
            return
        instance = self.checkpoint.load(workflow_id)
        if not instance:
            return
        self._generate_summary(instance)

    def _register(
        self,
        workflow_id: str,
        block_id: str,
        paths: list[str],
        project: str,
    ) -> None:
        registry_path = (
            self.projects_dir / project / "buildings" / workflow_id / "artifact_registry.json"
        )
        registry: list[dict] = []
        if registry_path.exists():
            try:
                registry = json.loads(registry_path.read_text())
            except Exception:
                pass
        for p in paths:
            registry.append({
                "block_id": block_id,
                "path": p,
                "registered_at": time.time(),
            })
        registry_path.write_text(
            json.dumps(registry, indent=2, ensure_ascii=False)
        )

    def _generate_summary(self, instance) -> None:
        project_ctx = instance.context.get("project", {})
        project = (
            project_ctx.get("name", "") if isinstance(project_ctx, dict) else ""
        ) or instance.definition.project or "default"

        building_dir = self.projects_dir / project / "buildings" / instance.id
        registry_path = building_dir / "artifact_registry.json"

        lines = [
            f"# Building Summary: {instance.feature}",
            "",
            f"- Workflow ID: `{instance.id}`",
            f"- Preset: `{instance.definition.name}`",
            f"- Feature: `{instance.feature}`",
            f"- Task: {instance.task}",
            f"- Status: **{instance.status.value}**",
            "",
            "## 블록별 산출물",
            "",
        ]

        if registry_path.exists():
            try:
                registry = json.loads(registry_path.read_text())
                by_block: dict[str, list[str]] = {}
                for item in registry:
                    by_block.setdefault(item["block_id"], []).append(item["path"])
                for block_id, paths in by_block.items():
                    lines.append(f"### {block_id}")
                    for p in paths:
                        lines.append(f"- `{p}`")
                    lines.append("")
            except Exception:
                lines.append("*(registry 파싱 실패)*")

        summary_path = building_dir / "summary.md"
        summary_path.write_text("\n".join(lines), encoding="utf-8")
```

**init_engine()에 추가 (engine_bridge.py)**:

```python
# init_engine() 마지막 부분
from brick.engine.artifact_manager import ArtifactManager
ArtifactManager(
    event_bus=eb,
    checkpoint=cs,
    projects_dir=root_path / "projects",
)
```

---

## 9. 우선순위별 액션 아이템

### P0 — 지금 당장 (executor.py 수정만으로 해결)

| # | 문제 | 수정 위치 | 공수 |
|---|---|---|---|
| 1 | `adapter.get_artifacts()` 미호출 | `executor.complete_block()` | 30분 |
| 2 | `block.input` 미사용 | `executor._execute_command()` | 1시간 |
| 3 | `artifact` gate context["artifacts"] 키 누락 | `executor.complete_block()` | 30분 |
| 4 | `BlockInstance.to_dict/from_dict`에서 `input` 소실 | `workflow.py` | 30분 |

### P1 — 이번 스프린트

| # | 문제 | 수정 위치 | 공수 |
|---|---|---|---|
| 5 | ArtifactManager 분리 + Building 폴더 | `engine/artifact_manager.py` (신규) | 4시간 |
| 6 | 산출물 필수 강제 자동화 | `PresetLoader._parse_preset()` | 1시간 |
| 7 | `_extra_link_commands` side-effect 제거 | `state_machine.py` | 1시간 |
| 8 | `executor._execute_command` public API 추출 | `executor.py` | 30분 |

### P2 — 다음 스프린트

| # | 문제 | 수정 위치 | 공수 |
|---|---|---|---|
| 9 | 통합 summary.md 자동 생성 | `ArtifactManager` | P1에 포함 |
| 10 | 블록 라이브러리 (`brick/blocks/*.yaml`) | `PresetLoader` 확장 | 3시간 |
| 11 | WorkflowInstance.id UUID4 | `workflow.py` | 30분 |
| 12 | PresetLoader를 executor.py에서 분리 | `engine/preset_loader.py` | 1시간 |
| 13 | `ArtifactExistsGate` dead code 제거 | `gates/artifact_exists.py` 삭제 | 5분 |

---

## 10. 최종 진단

```
설계 방향: ✅ 올바름
  - 3축(블록×팀×링크)이 코드에 정확히 반영됨
  - EventBus + Subscriber 패턴 이미 확립 (SlackSubscriber, SkyOfficeBridge)
  - StateMachine 순수성 방향 올바름 (minor bug 있음)
  - Gate/Link 레지스트리로 런타임 확장 가능

구현 누락: ❌ 4개 (설계 결함 아님, 연결 안 된 것)
  - Block.input → executor에서 읽지 않음
  - adapter.get_artifacts() → complete_block에서 호출 안 함
  - artifact gate context["artifacts"] → 키 안 넣음
  - BlockInstance 직렬화에서 input 소실

구조적 개선 필요: ⚠️ 
  - _extra_link_commands side-effect (StateMachine 순수성 위반)
  - executor.py 비대화 (PresetLoader 분리 필요)
  - God Context Dict (ContextKey 상수화)
  - adapter 매 블록마다 재생성

가장 빠른 경로:
  P0 (2시간): executor.py 3곳 수정 → 블록 간 산출물 전달 + artifact gate 작동
  P1 (5시간): ArtifactManager 신규 파일 → Building 폴더 + 통합문서
  → "안 되는 5가지" 중 4가지 해결
```
