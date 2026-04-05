# Design: 브릭 P0 — 3축 완성 (산출물 + 컨텍스트 + 가시성)

> **피처**: brick-p0-3axis-completion
> **레벨**: L2-기능
> **작성**: PM | 2026-04-04
> **TASK**: docs/tasks/TASK-brick-p0-3axis-completion.md
> **Plan**: docs/02-design/features/brick-p0-3axis-completion.plan.md

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **피처** | brick-p0-3axis-completion |
| **핵심** | 4축(산출물/컨텍스트/가시성/사람) 추가로 브릭 엔진을 실전 운용 가능하게 |
| **제약** | 기존 Gate/Link 코드 수정 금지 (추가만), TeamAdapter ABC 불변, 578 테스트 regression 금지 |

### 결과 요약

| 지표 | 축1 Output | 축2 Context | 축3 Visibility | 축4 People | 접점 | **합계** |
|------|-----------|------------|---------------|-----------|------|---------|
| **TDD** | 12건 | 8건 | 11건 | 12건 | 7건 | **50건** |
| **불변식** | 3건 | 3건 | 3건 | 3건 | 1건 | **13건** |
| **파일** | 7건 | 6건 | 2건 | 6건 | 1건 | **22건** |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 블록 완료에 증거 없음 + 역할 모름 + 실패 원인 안 보임 + 직원 참여 불가 |
| **Solution** | artifact Gate + CLAUDE.md 네이티브 + Slack 알림 + Google Sign-In + RBAC |
| **Function UX Effect** | PM이 Plan 안 쓰면 재작성 루프. 역할 프롬프트 자동. 실패 시 Slack stderr. 직원 로그인+할당+알림 |
| **Core Value** | "TASK 넣으면 에이전트+직원이 같이 돌린다" = 브릭 엔진 실전 운용 완성 |

---

## 0. 6단계 사고 프로세스

### Step 1: TASK 재해석

"브릭 578 테스트 통과했지만 실전에서 안 돌아가는 3가지(산출물 강제/역할 프롬프트/실패 가시성)를 독립적으로 추가하여 TASK 자동 실행 파이프라인을 완성한다."

### Step 2: 영향범위

| 축 | 수정 파일 | 신규 파일 |
|---|----------|----------|
| Output | concrete.py, preset_validator.py, executor.py | projects/, templates/ 5개 |
| Context | claude_local.py | agents/ 4개, CLAUDE.md |
| Visibility | slack_subscriber.py, executor.py | — |
| People | auth/schema.sql, auth_routes.py, human.py | auth/google.py, user_notifier.py, 프론트엔드 로그인 페이지 |

### Step 3: 선행 조건

- 3×3 자유도 코어 578/578 ✅
- Gate 레지스트리 `register_gate()` 구현 완료 ✅
- claude_local 어댑터 구현 완료 (hooks 43개 제거 → `--bare` 제거 대상) ✅
- EventBus + SlackSubscriber 5개 이벤트 구독 중 ✅
- approval Gate 구현 완료 ✅

### Step 4: 의존성

- 3축 완전 독립 (병렬 구현 가능)
- 축 간 접점은 Phase C에서 연결 (축 구현 완료 후)

### Step 5: 방법 도출

| 축 | 선택 | 대안 | 이유 |
|---|------|------|------|
| Output | artifact Gate 타입 추가 | complete_block() 수정 | Gate on/off 원칙 일관 |
| Context | `--bare` 제거 + CLAUDE.md + `.claude/agents/` + `--agent {role}` 네이티브 | `--system-prompt-file` | hooks 제거 완료 → 네이티브가 가장 단순 |
| Visibility | SlackSubscriber 확장 | 별도 NotificationService | 기존 인프라 활용 |
| People | Google Sign-In + DB 세션 + RBAC (MC 패턴) | Firebase Auth | MC 코드 재사용, 외부 의존 최소화 |

### Step 6: 팀원 배정

PM: Design (이 문서) → CTO → backend-dev 1명 (3축 병렬 가능하나 접점 있어 1명이 순차가 안전)

---

# 축 1: 산출물 (Output) — "종료 = 문서"

## 1-A. 프로젝트 디렉토리 구조

```
brick/
  projects/
    bscamp/
      tasks/          # TASK 파일
      plans/          # Plan 문서
      designs/        # Design 문서
      reports/        # 완료 보고서
    brick-engine/
      tasks/
      plans/
      designs/
      reports/
    skyoffice/
      tasks/
      plans/
      designs/
      reports/
```

### 경로 규칙

```
brick/projects/{project}/{phase}/{feature}.md
```

예시:
- `brick/projects/bscamp/plans/brick-p0-3axis-completion.md`
- `brick/projects/bscamp/designs/brick-p0-3axis-completion.md`

## 1-B. 문서 템플릿

bkit 템플릿(`~/.claude/plugins/cache/bkit-marketplace/bkit/1.5.2/templates/`)을 참고하여 브릭용 단순화:

```
brick/
  templates/
    plan.md       # Plan 문서 템플릿
    design.md     # Design 문서 템플릿
    do.md         # 구현 보고 템플릿
    report.md     # 완료 보고서 템플릿
    analysis.md   # 분석 보고서 템플릿
```

각 템플릿은 `{project}`, `{feature}`, `{date}` 변수 포함:

```markdown
# {phase}: {feature}

> **프로젝트**: {project}
> **작성일**: {date}
> **블록**: {block_id}

---

(본문)
```

## 1-C. artifact Gate (8번째 Gate 타입)

### 현재 Gate 7종

`command`, `http`, `prompt`, `agent`, `review`, `metric`, `approval`

### 추가: `artifact`

```python
# brick/gates/concrete.py — ConcreteGateExecutor

def _register_builtins(self):
    # 기존 7개 (변경 없음)
    self.register_gate("command", self._run_command)
    self.register_gate("http", self._run_http)
    self.register_gate("prompt", self._run_prompt)
    self.register_gate("agent", self._run_agent)
    self.register_gate("review", self._run_review)
    self.register_gate("metric", self._run_metric)
    self.register_gate("approval", self._run_approval)
    # 신규
    self.register_gate("artifact", self._run_artifact)
```

### `_run_artifact` 구현

```python
async def _run_artifact(self, handler: GateHandler, context: dict) -> GateResult:
    """산출물 존재 검증 Gate.

    handler.command에 glob 패턴 목록 (콤마 구분) 또는
    context["done_artifacts"]에서 경로 목록을 읽어 파일 존재를 확인.

    {project}, {feature} 변수를 context에서 치환.
    """
    import glob as glob_mod
    import os

    # 검증할 경로 목록 결정
    raw_paths: list[str] = []

    # 1순위: handler.command (YAML gate.handlers[].command)
    if handler.command:
        raw_paths = [p.strip() for p in handler.command.split(",")]
    # 2순위: context의 done_artifacts (DoneCondition.artifacts에서 주입)
    elif context.get("done_artifacts"):
        raw_paths = context["done_artifacts"]

    if not raw_paths:
        return GateResult(
            passed=False,
            detail="artifact 경로 미지정",
            type="artifact",
        )

    # 변수 치환
    project = context.get("project", "")
    feature = context.get("feature", "")
    resolved_paths = []
    for p in raw_paths:
        resolved = p.replace("{project}", project).replace("{feature}", feature)
        resolved_paths.append(resolved)

    # 파일 존재 검증 (glob 지원)
    missing = []
    found = []
    for pattern in resolved_paths:
        matches = glob_mod.glob(pattern)
        if matches:
            found.extend(matches)
        else:
            # glob이 아닌 단순 경로일 수 있음
            if os.path.exists(pattern):
                found.append(pattern)
            else:
                missing.append(pattern)

    if missing:
        return GateResult(
            passed=False,
            detail=f"산출물 누락: {', '.join(missing)}",
            type="artifact",
            metadata={"missing": missing, "found": found},
        )

    return GateResult(
        passed=True,
        detail=f"산출물 {len(found)}건 확인",
        type="artifact",
        metadata={"found": found},
    )
```

### GateHandler 활용

기존 `GateHandler.command` 필드를 artifact 경로 지정에 재사용:

```yaml
gate:
  handlers:
    - type: artifact
      command: "brick/projects/{project}/plans/{feature}.md"
      on_fail: fail
```

`GateHandler` 스키마 변경 없음 — `command` 필드가 Gate 타입마다 다른 의미로 사용되는 기존 패턴.

## 1-D. PresetValidator 확장

> **참고**: `DEFAULT_GATE_TYPES`에 `"artifact"`는 **이미 포함** (preset_validator.py line 10).
> 추가 변경 불필요. 아래는 project 필드 검증만 추가.

### project 필드 검증 (워크플로우 정의에 추가)

```python
# validate() 메서드 내 추가

# project 필드 검증
if hasattr(definition, 'project') and definition.project:
    # project 디렉토리 존재 여부는 warning만 (미생성 허용)
    project_dir = Path(f"brick/projects/{definition.project}")
    if not project_dir.exists():
        errors.append(ValidationError(
            field="project",
            message=f"프로젝트 디렉토리 미존재: {project_dir} (자동 생성됨)",
            severity="warning",
        ))
```

## 1-E. Executor — project/feature context 주입

```python
# executor.py — start_workflow() 또는 _execute_command() 내

# 워크플로우 시작 시 project/feature를 context에 주입
instance.context["project"] = definition.project or ""
instance.context["feature"] = definition.feature or ""

# DoneCondition.artifacts를 context에 주입 (artifact Gate가 참조)
block_inst = instance.blocks[block_id]
if block_inst.block.done and block_inst.block.done.artifacts:
    instance.context["done_artifacts"] = block_inst.block.done.artifacts
```

## 1-F. Gate fail → 재작성 루프

기존 메커니즘 조합으로 구현 (신규 코드 불필요):

```yaml
# 프리셋 YAML 예시
blocks:
  - id: plan
    what: "Plan 문서 작성"
    done:
      artifacts:
        - "brick/projects/{project}/plans/{feature}.md"
    gate:
      handlers:
        - type: artifact
          command: "brick/projects/{project}/plans/{feature}.md"
          on_fail: fail
      on_fail: retry      # Gate 실패 → 블록 재실행
      max_retries: 3       # 최대 3번 재시도
```

동작 흐름:
```
블록 실행 → 완료 → Gate(artifact) 검사 → 파일 없음 → gate_failed
→ on_fail: retry → 블록 재실행 → 에이전트가 파일 작성 → Gate 재검사 → pass
```

## 1-G. {feature} 변수 치환

프리셋 YAML 로드 시:

```yaml
# 프리셋 정의
project: bscamp
feature: brick-p0-3axis-completion

blocks:
  - id: plan
    what: "Plan 문서 작성: {feature}"
    done:
      artifacts:
        - "brick/projects/{project}/plans/{feature}.md"
```

### WorkflowDefinition 모델 확장

```python
# brick/models/workflow.py — WorkflowDefinition에 추가
@dataclass
class WorkflowDefinition:
    # 기존 필드 ...
    project: str = ""     # 프로젝트 식별자
    feature: str = ""     # 피처 식별자
```

### PresetLoader에서 치환

```python
# executor.py — PresetLoader._parse_preset()

# project/feature 변수 치환
project = inner.get("project", "")
feature = inner.get("feature", "")

# 전체 YAML 문자열에서 치환 후 재파싱
yaml_str = yaml.dump(inner)
yaml_str = yaml_str.replace("{project}", project).replace("{feature}", feature)
inner = yaml.safe_load(yaml_str)
```

---

# 축 2: 컨텍스트 (Context) — "CLAUDE.md + .claude/agents/ 네이티브"

> **핵심 변경**: `--bare` + `--system-prompt-file` → `--bare` 제거 + `--agent {role}` (Claude Code 네이티브)
> **이유**: bkit 안 쓰고 hooks 43개 제거 완료 → `--bare` 불필요 → CLAUDE.md 정상 로딩

## 2-A. CLAUDE.md 공통 규칙

`brick/CLAUDE.md` — 브릭 엔진 프로젝트 공통 규칙. 200줄 이하.
Claude Code가 cwd에서 자동 발견하여 모든 에이전트에 적용.

```markdown
# CLAUDE.md — Brick Engine 공통 규칙

## 코딩 컨벤션
- Python 3.11+, type hints 필수
- dataclass 기반 모델
- asyncio 기반 비동기

## 테스트
- pytest + pytest-asyncio
- brick/__tests__/ 디렉토리
- 기존 578 테스트 regression 금지

## 커밋
- prefix: feat/fix/refactor/test/chore
- 한글 커밋 메시지

## 디렉토리 구조
- brick/brick/ — 엔진 코어
- brick/projects/ — 프로젝트별 산출물
- brick/templates/ — 문서 템플릿

## 산출물 경로 규칙
- brick/projects/{project}/{phase}/{feature}.md
```

## 2-B. 에이전트 프롬프트 파일 (.claude/agents/)

Claude Code 네이티브 `.claude/agents/` 디렉토리. `--agent {name}` CLI 옵션으로 활성화.
frontmatter에 name/description/tools/model 지정.

```
.claude/
  agents/
    cto-lead.md          # CTO 리더
    pm-lead.md           # PM 리더
    qa-monitor.md        # QA 모니터
    report-generator.md  # 보고서 생성
```

### 프롬프트 구조 (frontmatter 포함)

```markdown
---
name: cto-lead
description: CTO 리더. 구현 조율, 팀원 위임, 품질 검증 담당.
tools: Read, Write, Edit, Bash, Glob, Grep
model: opus
---

# CTO 리더

## 역할
구현 조율, 팀원에 위임, 코드 품질 검증.

## 규칙
1. Plan/Design 문서 없이 구현 시작 금지
2. 직접 코드 수정 금지 — 팀원에게 위임
3. 구현 완료 후 자동으로 Gap 분석 실행
4. Match Rate 90% 이상이어야 완료

## 산출물
- 이 블록의 산출물을 아래 경로에 저장:
  brick/projects/{project}/reports/{feature}.md

## 완료 기준
- 산출물 파일 존재
- tsc + build 통과
- 기존 테스트 regression 없음
```

### 기존 .claude/agents/ 파일과의 관계

현재 `.claude/agents/`에 5개 파일 존재 (protractor-expert 등). 신규 4개를 추가. 충돌 없음 — 파일명이 다름.

## 2-C. claude_local 어댑터 — `--bare` 제거 + `--agent` 주입

### 현재 코드 (line 285-293)

```python
def _build_args(self) -> list[str]:
    args = ["--print", "-", "--output-format", "stream-json", "--verbose", "--bare"]
    if self.model:
        args += ["--model", self.model]
    if self.skip_permissions:
        args.append("--dangerously-skip-permissions")
    if self.max_turns > 0:
        args += ["--max-turns", str(self.max_turns)]
    args.extend(self.extra_args)
    return args
```

### 변경 후

```python
def __init__(self, config: dict | None = None):
    config = config or {}
    # 기존 필드 ...
    self.role: str = config.get("role", "")        # 신규: 역할 ID

def _build_args(self) -> list[str]:
    # --bare 제거 — hooks 43개 제거 완료, CLAUDE.md 네이티브 로딩 필요
    args = ["--print", "-", "--output-format", "stream-json", "--verbose"]

    # 역할 에이전트 주입 (C-4): --agent {role}
    # Claude Code가 .claude/agents/{role}.md를 자동 로딩
    if self.role:
        args.extend(["--agent", self.role])

    if self.model:
        args += ["--model", self.model]
    if self.skip_permissions:
        args.append("--dangerously-skip-permissions")
    if self.max_turns > 0:
        args += ["--max-turns", str(self.max_turns)]
    args.extend(self.extra_args)
    return args
```

### 핵심 변경

1. `--bare` **제거** — hooks 43개 제거 완료, CLAUDE.md 간섭 원인 없음
2. `--agent {role}` 추가 — Claude Code가 `.claude/agents/{role}.md` 자동 로딩
3. role 미지정 → `--agent` 스킵, CLAUDE.md만 적용 (하위호환)
4. `--system-prompt-file` 불필요 — `.claude/agents/` 네이티브 사용
5. `agentsDir` config 불필요 — Claude Code 표준 경로 사용

### Agent Teams 환경변수 주입

`--print` 모드에서 Agent Teams(팀원 생성)를 사용하려면 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 환경변수 필수.
프리셋 YAML `teams.{block}.config.env`에서 주입:

```python
# claude_local.py — _build_env()에서 config.env 머지 시 자동 주입됨
# 프리셋 YAML 예시:
#   teams:
#     do:
#       adapter: claude_local
#       config:
#         env:
#           CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

CTO-lead 블록(Do 단계)에서 팀원을 생성해야 하므로 `env` 필드에 명시. PM/QA 블록은 불필요.

### --bare 제거의 영향

| 항목 | --bare 있을 때 | --bare 없을 때 (변경 후) |
|------|-------------|---------------------|
| CLAUDE.md | ❌ 안 읽힘 | ✅ 자동 로딩 |
| .claude/agents/ | ❌ 안 읽힘 | ✅ 자동 로딩 |
| hooks | 안 실행 (스킵) | 실행 (but hooks 제거 완료 → 무해) |
| auto-memory | ❌ 비활성 | ✅ 활성 |
| LSP | ❌ 비활성 | ✅ 활성 |

## 2-D. 프리셋 YAML role 필드

```yaml
teams:
  plan:
    adapter: claude_local
    config:
      role: pm-lead              # .claude/agents/pm-lead.md → --agent pm-lead
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
  do:
    adapter: claude_local
    config:
      role: cto-lead             # .claude/agents/cto-lead.md → --agent cto-lead
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
      env:
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

`TeamDefinition.config` dict에 `role` 키 사용. `TeamDefinition` 모델 자체는 변경 없음 (`config: dict`가 이미 자유 형식).

## 2-E. role 전달 흐름

```
프리셋 YAML → teams.{block}.config.role = "cto-lead"
→ engine_bridge.py: adapter_pool 생성 시 config 전달
→ ClaudeLocalAdapter.__init__(config={"role": "cto-lead", ...})
→ self.role = "cto-lead"
→ _build_args(): args.extend(["--agent", "cto-lead"])
→ subprocess 실행: claude --print - ... --agent cto-lead
→ Claude Code가 .claude/agents/cto-lead.md 로딩 + CLAUDE.md 로딩
```

---

# 축 3: 가시성 (Visibility) — "실패 원인 + 승인 알림"

## 3-A. adapter_failed 이벤트 — stderr/exit_code 포함

### 현재 (executor.py)

```python
# 5곳 모두 동일 패턴
event = Event(type="block.adapter_failed", data={
    "block_id": cmd.block_id,
    "error": str(e),               # ← 에러 메시지만
})
```

### 변경 후

```python
# executor.py — _monitor_block() 내 실패 처리 (line 646-654)

elif status.status == "failed":
    event = Event(type="block.adapter_failed", data={
        "block_id": block_id,
        "workflow_id": instance.id,
        "error": status.error or "Adapter reported failure",
        "stderr": _last_n_lines(status.error or "", 10),  # 신규: 마지막 10줄
        "exit_code": getattr(status, "exit_code", None),   # 신규
        "adapter": block_inst.adapter if block_inst else "",  # 신규
        "role": block_inst.block.metadata.get("role", "") if block_inst else "",  # 신규
    })
```

### AdapterStatus에 exit_code 추가

```python
# brick/models/team.py — AdapterStatus

@dataclass
class AdapterStatus:
    status: str
    progress: float | None = None
    message: str | None = None
    metrics: dict | None = None
    artifacts: list[str] | None = None
    error: str | None = None
    exit_code: int | None = None       # 신규
    stderr: str | None = None          # 신규
```

### claude_local에서 exit_code/stderr 전달

```python
# claude_local.py — _monitor_process() 내 실패 처리

elif exit_code != 0:
    stderr_str = stderr_data.decode(errors="replace")
    first_line = next(
        (l.strip() for l in stderr_str.splitlines() if l.strip()), ""
    )
    self._write_state(execution_id, {
        "status": "failed",
        "error": first_line or f"exit code {exit_code}",
        "stderr": stderr_str,              # 전체 stderr 저장
        "exit_code": exit_code,             # 신규
    })
```

### check_status에서 exit_code/stderr 반환

```python
# claude_local.py — check_status()

if status != "running":
    return AdapterStatus(
        status=status,
        artifacts=state.get("artifacts"),
        error=state.get("error"),
        exit_code=state.get("exit_code"),     # 신규
        stderr=state.get("stderr"),            # 신규
    )
```

### 헬퍼 함수

```python
# executor.py 또는 slack_subscriber.py

def _last_n_lines(text: str, n: int = 10) -> str:
    """텍스트에서 마지막 n줄 추출. 빈 줄 제거."""
    lines = [l for l in text.splitlines() if l.strip()]
    return "\n".join(lines[-n:])
```

## 3-B. SlackSubscriber — 실패 이벤트 구독

### 현재 구독 (5개)

```python
event_bus.subscribe("block.started", self._on_event)
event_bus.subscribe("block.completed", self._on_event)
event_bus.subscribe("workflow.completed", self._on_event)
event_bus.subscribe("link.started", self._on_event)
event_bus.subscribe("link.completed", self._on_event)
```

### 추가 구독 (3개)

```python
event_bus.subscribe("block.adapter_failed", self._on_event)    # V-1
event_bus.subscribe("block.gate_failed", self._on_event)       # V-1
event_bus.subscribe("gate.approval_pending", self._on_event)   # V-4
```

### _format_message 확장

```python
def _format_message(event: Event) -> str:
    block_id = event.data.get("block_id", "")
    workflow_id = event.data.get("workflow_id", "")

    # 기존 5개 (변경 없음) ...

    elif event.type == "block.adapter_failed":
        error = event.data.get("error", "알 수 없는 에러")
        stderr = event.data.get("stderr", "")
        exit_code = event.data.get("exit_code", "?")
        role = event.data.get("role", "")
        role_label = f" ({role})" if role else ""
        msg = f":x: 블록 실패: *{block_id}*{role_label}\n"
        msg += f"exit code: `{exit_code}`\n"
        if stderr:
            # 마지막 10줄만, 환경변수/토큰 마스킹
            safe_stderr = _mask_sensitive(stderr)
            last_lines = _last_n_lines(safe_stderr, 10)
            msg += f"```\n{last_lines}\n```"
        return msg

    elif event.type == "block.gate_failed":
        return f":no_entry: Gate 실패: *{block_id}* — 산출물 누락 또는 조건 미충족"

    elif event.type == "gate.approval_pending":
        approver = event.data.get("approver", "")
        artifacts = event.data.get("artifacts", [])
        artifact_list = "\n".join(f"  • `{a}`" for a in artifacts) if artifacts else "(없음)"
        return (
            f":raising_hand: 승인 대기: *{block_id}*\n"
            f"검토 대상:\n{artifact_list}\n"
            f"승인자: {approver}"
        )

    return f"{event.type}: {event.data}"
```

### 민감 정보 마스킹

```python
import re

_SENSITIVE_PATTERNS = [
    (re.compile(r'(SLACK_BOT_TOKEN|API_KEY|SECRET|PASSWORD|TOKEN)=[^\s]+', re.I), r'\1=***'),
    (re.compile(r'(Bearer\s+)[^\s]+', re.I), r'\1***'),
]

def _mask_sensitive(text: str) -> str:
    for pattern, replacement in _SENSITIVE_PATTERNS:
        text = pattern.sub(replacement, text)
    return text
```

## 3-C. approval 대기 Slack 알림

### 현재: approval Gate는 `pending` 상태를 반환하지만 이벤트 발행 없음

### 변경: executor가 Gate 실행 시 approval pending 이벤트 발행

```python
# executor.py — complete_block() 내, gate 실행 후

gate_result = await self.gate_executor.run_gates(block_inst, instance.context)

# approval 대기 상태인 경우 이벤트 발행 (V-4)
if (not gate_result.passed
    and gate_result.metadata
    and gate_result.metadata.get("status") == "waiting"):

    approval_meta = gate_result.metadata
    self.event_bus.publish(Event(type="gate.approval_pending", data={
        "block_id": block_id,
        "workflow_id": workflow_id,
        "approver": approval_meta.get("approver", ""),
        "channel": approval_meta.get("channel", ""),
        "artifacts": instance.context.get("done_artifacts", []),
    }))
```

## 3-D. approve/reject API

기존 `_run_approval`이 `context["approval_action"]`으로 결정. API 엔드포인트는 이미 `engine_bridge.py`의 `complete-block` 경유:

```
POST /engine/complete-block
  body: {workflow_id, block_id, approval_action: "approve" | "reject", reject_reason: "..."}
  → context에 주입 → Gate 재실행 → _run_approval이 action 읽어 판단
```

이 흐름은 이미 동작함. 추가 구현 불필요 — Slack 메시지에 API URL만 포함하면 됨:

```python
# approval pending 메시지에 API 호출 예시 포함
msg += f"\n승인: `POST /engine/complete-block` + `approval_action: approve`"
```

---

# 축 4: 사람 (People) — "직원이 같이 브릭을 굴린다"

> **레퍼런스**: Mission Control (`/Users/smith/projects/mission-control`)
> **서버**: Python FastAPI (`brick/brick/dashboard/server.py`, `brick/brick/auth/*`)
> **핵심**: 기존 Python 인증 시���템에 Google Sign-In 추가 + notifications 직원 라우팅

## 4-A. 기존 자산 (이미 구현됨)

| 모듈 | 파일 | 현황 |
|------|------|------|
| BrickUser 모델 + RBAC | `brick/auth/models.py` | ✅ `admin/operator/viewer`, `ROLE_LEVELS`, `require_role()` |
| DB 스키마 (SQLite) | `brick/auth/schema.sql` | ✅ `users`, `user_sessions`, `api_keys`, `workspaces`, `agents` |
| 세션 (DB-backed, SHA-256) | `brick/auth/session.py` | ✅ `create_session()`, `validate_session()`, 7일 만료 |
| 인증 미들웨어 (3중) | `brick/auth/middleware.py` | ✅ 세션쿠키 → API키 → 개발모드 |
| 비밀번호 해싱 (scrypt) | `brick/auth/password.py` | ✅ 타이밍 공격 방어 (DUMMY_HASH) |
| 사용자 CRUD | `brick/auth/users.py` | ✅ `create_user()`, `authenticate_user()` |
| Auth API 라우트 | `brick/dashboard/routes/auth_routes.py` | ✅ `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/users` |
| requireRole 의존성 | `brick/auth/middleware.py:119-128` | ✅ `require_role_dep("admin")` FastAPI Depends |

**추가 구현 필요:**

| 요구사항 | 현황 | 변경 |
|---------|------|------|
| M-2 Google Sign-In | 미구현 (username+password만) | `brick/auth/google.py` 신규 + `/auth/google` 라우트 |
| M-4 notifications 직원 라우팅 | 미구현 | `schema.sql`에 notifications 테이블 + EventBus 구독 |
| M-5 assignee = user 매핑 | 부분 (string만) | HumanAdapter → user_id 연결 |
| M-6 대시보드 로그인 화면 | 미구현 | 프론트엔드 로그인 페이지 |
| M-7 workspace = project | 부분 (workspace_id 있음) | workspace → brick project 매핑 |

## 4-B. DB 스키마 확장 (`brick/auth/schema.sql`)

기존 `users` 테이블에 Google 관�� 컬럼 추가:

```sql
-- 기존 users 테이블 확장 (ALTER TABLE)
ALTER TABLE users ADD COLUMN email TEXT UNIQUE;          -- Google email
ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'local';  -- local | google
ALTER TABLE users ADD COLUMN avatar_url TEXT;
ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 1;  -- 0=대기, 1=승인

-- notifications 테이블 신규
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER,                                    -- NULL = 전체 알림
    type TEXT NOT NULL,                                      -- assignment, approval, gate_failed
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source_type TEXT,                                         -- block, gate, workflow
    source_id TEXT,
    read_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id, read_at);
```

## 4-C. Google Sign-In — Python 구현

MC `google-auth.ts` 패턴을 Python으로 포팅:

```python
# brick/auth/google.py

from __future__ import annotations

import os
from dataclasses import dataclass
from urllib.parse import quote

import httpx

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")


@dataclass
class GoogleIdTokenPayload:
    sub: str
    email: str
    name: str | None = None
    picture: str | None = None


async def verify_google_id_token(id_token: str) -> GoogleIdTokenPayload:
    """Google ID 토큰 검증 (MC google-auth.ts 패턴)."""
    url = f"https://oauth2.googleapis.com/tokeninfo?id_token={quote(id_token)}"
    async with httpx.AsyncClient() as client:
        resp = await client.get(url)
    if resp.status_code != 200:
        raise ValueError("Invalid Google token")

    payload = resp.json()
    # aud 검증
    if GOOGLE_CLIENT_ID and payload.get("aud") != GOOGLE_CLIENT_ID:
        raise ValueError("Google token audience mismatch")
    # email 필수 + 인증 필수
    if not payload.get("email"):
        raise ValueError("Google token missing email")
    if payload.get("email_verified") not in (True, "true"):
        raise ValueError("Google email not verified")

    return GoogleIdTokenPayload(
        sub=payload["sub"],
        email=payload["email"],
        name=payload.get("name"),
        picture=payload.get("picture"),
    )
```

### 로그인 흐름 (기존 auth_routes.py 확장)

```python
# brick/dashboard/routes/auth_routes.py — 추가 엔드포인트

class GoogleLoginRequest(BaseModel):
    credential: str  # Google ID token

@router.post("/google")
async def google_login(body: GoogleLoginRequest, request: Request, response: Response):
    """Google Sign-In → 세션 생성."""
    from brick.auth.google import verify_google_id_token
    payload = await verify_google_id_token(body.credential)

    conn = get_db()
    row = conn.execute("SELECT * FROM users WHERE email = ?", (payload.email,)).fetchone()

    if row is None:
        # 신규 사용자: 테이블 비어있으면 admin, 아니면 viewer + is_approved=0
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        role = "admin" if count == 0 else "viewer"
        is_approved = 1 if count == 0 else 0
        conn.execute(
            "INSERT INTO users (username, display_name, password_hash, email, provider, "
            "avatar_url, role, is_approved, workspace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (payload.email, payload.name or payload.email, "google-oauth",
             payload.email, "google", payload.picture, role, is_approved, 1),
        )
        conn.commit()
        if is_approved == 0:
            raise HTTPException(status_code=403, detail="관리자 승인 대기")
        row = conn.execute("SELECT * FROM users WHERE email = ?", (payload.email,)).fetchone()
    else:
        if row["is_approved"] == 0:
            raise HTTPException(status_code=403, detail="관리자 승인 대기")

    # 세션 생성
    ip = request.client.host if request.client else None
    token = create_session(row["id"], row["workspace_id"], ip)
    response.set_cookie(
        key="brick_session", value=token,
        httponly=True, samesite="lax", max_age=7 * 24 * 3600,
    )
    return {"ok": True, "user": {"id": row["id"], "email": row["email"], "role": row["role"]}}
```

## 4-D. RBAC + 인증 경계

기존 `brick/auth/middleware.py`의 3중 인증이 **이미 동작**:
1. 세션 쿠키 (`brick_session`) → `validate_session()`
2. API 키 (`X-API-Key`) → SHA-256 → DB 조회
3. 개발 모드 (`BRICK_DEV_MODE=1`) → admin 자동

기존 `require_role_dep()` 팩토리도 **이미 동작**:
```python
# 기존 코드 — 변경 ��필요
@router.post("/users")
async def create_user_endpoint(
    body: CreateUserRequest,
    user: BrickUser = Depends(require_role_dep("admin")),  # admin만
):
```

### 인증 경계: Express ↔ Python

```
브라우저 → Express(:3200) → [brick-auth 미들웨어] → EngineBridge.request() → Python(:3202)
                                                        ↑
                                                   X-Brick-API-Key 헤더 주입
```

**Express가 인증 후 Python에 프록시.** Python의 `/engine/*` API는 Express `EngineBridge`만 호출하며, `X-Brick-API-Key` 헤더로 보호. 외부에서 Python 포트 직접 접근 시 `verify_brick_api_key`가 차단.

### API별 최소 권한

| API 그룹 | 최소 권한 | 예시 |
|----------|----------|------|
| GET /api/v1/* (조회) | viewer | 대시보드, 실행 이력, 블록 상태 |
| POST /api/v1/engine/start | operator | 워크플로우 시작 |
| POST /api/v1/auth/approve/* | admin | 사용자 승인 |
| POST /api/v1/auth/users | admin | 사용자 생성 |

## 4-E. notifications — 직원별 알림 라우팅

`brick/auth/schema.sql`에 notifications 테이블 추가 (4-B 참조).

EventBus 이벤트 → 직원 알림:

```python
# brick/engine/user_notifier.py — EventBus 구독

class UserNotifier:
    def __init__(self, event_bus: EventBus, db_path: str = ".bkit/brick.db"):
        self.db_path = db_path
        event_bus.subscribe("gate.approval_pending", self._on_approval_pending)
        event_bus.subscribe("block.adapter_failed", self._on_failure)

    def _on_approval_pending(self, event: Event) -> None:
        """approval 대기 → approver user에게 알림."""
        approver_email = event.data.get("approver_email", "")
        if not approver_email:
            return
        conn = get_db(self.db_path)
        user = conn.execute("SELECT id FROM users WHERE email = ?", (approver_email,)).fetchone()
        if user:
            conn.execute(
                "INSERT INTO notifications (recipient_id, type, title, message, source_type, source_id) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (user["id"], "approval", "승인 대기",
                 f"블록 '{event.data.get('block_id')}' 검토 필요", "block", event.data.get("block_id")),
            )
            conn.commit()

    def _on_failure(self, event: Event) -> None:
        """실패 → 해당 블록 assignee에게 알림."""
        # assignee email → user_id → notification INSERT
        ...
```

## 4-F. assignee = user 매핑

현재 `HumanAdapter.assignee`는 문자열. email로 매핑:

```yaml
teams:
  review:
    adapter: human
    config:
      assignee: "smith@bscamp.kr"    # email → users 테이블에서 조회
      timeout_seconds: 86400
```

```python
# brick/adapters/human.py — start_block() 확장
self._write_state(execution_id, {
    "status": "waiting_human",
    "assignee": self.assignee,        # email
    # ...
})
```

대시보드 API에서 human task 목록 조회 시 인증된 사용자의 email로 필터:

```python
# brick/dashboard/routes/engine_bridge.py — human tasks 조회
@router.get("/human/tasks")
async def get_human_tasks(user: BrickUser = Depends(authenticate_request)):
    tasks = _read_human_tasks()
    if user.role != "admin":
        # operator/viewer는 자기 assignee만
        user_email = get_user_email(user.id)
        tasks = [t for t in tasks if t.get("assignee") == user_email]
    return tasks
```

## 4-G. 대시보드 로그인 화면

> 프론트엔드 구조는 기존 dashboard/ 확인 후 맞춤.

```
/login → 로그인 페이지
  - Google Sign-In 버튼
  - 미승인 상태 안내 화면
  - 미인증 → /login 리디렉트 (AuthGuard)
```

프론트엔드에서 `GET /api/v1/auth/me` → 401이면 로그인 페이지로 리디렉트.
로그인 성공 → `brick_session` 쿠키 설정 → 대시보드 표시.

## 4-H. workspace = project 매핑

기존 `users.workspace_id` → `workspaces.id` 연결 있음.
추가: `workspaces` ↔ brick project 매핑.

```sql
-- brick/auth/schema.sql 확장
ALTER TABLE workspaces ADD COLUMN brick_project TEXT;  -- brick project name (e.g., 'bscamp')
```

```python
# API에서 workspace 기반 필터링
async def filter_by_workspace(user: BrickUser, query_fn):
    """viewer/operator는 자기 workspace의 데이터만."""
    if user.role == "admin":
        return query_fn()  # 전체
    return query_fn(workspace_id=user.workspace_id)
```

---

# 축 간 접점

## 접점 1: artifact 경로 → approval 알림 포함 (Output → Visibility)

approval Gate `pending` 이벤트 발행 시 `done_artifacts` 경로를 포함:

```python
self.event_bus.publish(Event(type="gate.approval_pending", data={
    # ...
    "artifacts": instance.context.get("done_artifacts", []),  # ← Output 축에서 주입
}))
```

Slack 메시지에 "검토 대상: `brick/projects/bscamp/designs/xxx.md`" 표시.

## 접점 2: role → 산출물 경로 결정 (Context → Output)

프리셋 YAML에서 role에 따라 산출물 경로가 달라짐:

```yaml
blocks:
  - id: plan
    what: "Plan 작성"
    done:
      artifacts: ["brick/projects/{project}/plans/{feature}.md"]
    # team role: pm-lead → agents/pm-lead.md 프롬프트가 산출물 경로를 안내

  - id: do
    what: "구현"
    done:
      artifacts: ["brick/projects/{project}/reports/{feature}.md"]
    # team role: cto-lead → agents/cto-lead.md 프롬프트가 산출물 경로를 안내
```

에이전트 프롬프트에 산출물 경로를 명시:

```markdown
## 산출물 경로
- 이 블록의 산출물을 아래 경로에 저장하세요:
  {done.artifacts 경로}
```

이는 프리셋 로드 시 `{feature}` 치환 → 프롬프트 파일의 `{project}` 치환으로 연결됨.

## 접점 3: role → 실패 알림에 포함 (Context → Visibility)

`block.adapter_failed` 이벤트 data에 `role` 포함 (3-A에서 구현):

```python
"role": block_inst.block.metadata.get("role", "")
```

Slack 메시지: `:x: 블록 실패: *do* (cto-lead)`

### role을 block metadata에 기록

```python
# executor.py — _execute_command(StartBlockCommand) 내

# team config에서 role 추출하여 block metadata에 기록
team_def = instance.teams.get(cmd.block_id)
if team_def and team_def.config.get("role"):
    block_inst.block.metadata["role"] = team_def.config["role"]
```

## 접점 4: Gate 실패 상세 → Slack (Output → Visibility)

artifact Gate 실패 시 `gate_failed` 이벤트에 어떤 산출물이 누락됐는지 포함:

```python
# executor.py — complete_block() 내

event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"
gate_event = Event(type=event_type, data={
    "block_id": block_id,
    "workflow_id": workflow_id,
    "gate_detail": gate_result.detail,           # 신규: "산출물 누락: xxx.md"
    "gate_metadata": gate_result.metadata or {},  # 신규: {missing: [...], found: [...]}
})
```

SlackSubscriber가 gate_failed에서 상세 표시:

```python
elif event.type == "block.gate_failed":
    detail = event.data.get("gate_detail", "")
    missing = event.data.get("gate_metadata", {}).get("missing", [])
    msg = f":no_entry: Gate 실패: *{block_id}*\n{detail}"
    if missing:
        msg += "\n누락 파일:\n" + "\n".join(f"  • `{m}`" for m in missing)
    return msg
```

## 접점 5: approval → assignee 직원 알림 (Visibility → People)

approval Gate `pending` 이벤트 발행 시 approver email로 해당 직원에게 알림:

```python
# executor.py — approval pending 이벤트
event_data["approver_email"] = gate_handler.approval.approver  # "smith@bscamp.kr"
```

대시보드 서버에서 `approver_email` → `brick_users` 조회 → `notifications` INSERT.

## 접점 6: human assignee → 직원별 task 필터 (People → Output)

human 어댑터의 `assignee` email → 대시보드에서 해당 직원만 자기 task 조회:

```python
# brick/dashboard/routes/engine_bridge.py — human tasks 조회
@router.get("/human/tasks")
async def get_human_tasks(user: BrickUser = Depends(authenticate_request)):
    tasks = _read_human_tasks()
    if user.role != "admin":
        user_email = get_user_email(user.id)
        tasks = [t for t in tasks if t.get("assignee") == user_email]
    return tasks
```

## 접점 7: 프리셋 통합 예시 (4축)

```yaml
# 4축 완전 통합 프리셋 예시
project: bscamp
feature: brick-p0-3axis-completion

blocks:
  - id: plan
    type: Plan
    what: "Plan 문서 작성"
    done:
      artifacts:
        - "brick/projects/{project}/plans/{feature}.md"
    gate:
      handlers:
        - type: artifact
          command: "brick/projects/{project}/plans/{feature}.md"
          on_fail: fail
      on_fail: retry
      max_retries: 3

  - id: design
    type: Design
    what: "Design 문서 작성"
    done:
      artifacts:
        - "brick/projects/{project}/designs/{feature}.md"
    gate:
      handlers:
        - type: artifact
          command: "brick/projects/{project}/designs/{feature}.md"
          on_fail: fail
      on_fail: retry
      max_retries: 3

  - id: do
    type: Do
    what: "구현"
    done:
      artifacts:
        - "brick/projects/{project}/reports/{feature}.md"
    gate:
      handlers:
        - type: artifact
          command: "brick/projects/{project}/reports/{feature}.md"
      on_fail: retry
      max_retries: 3

  - id: review                    # ← 축4: 사람 블록
    type: Review
    what: "Smith님 검토"
    gate:
      handlers:
        - type: approval
          approval:
            approver: "smith@bscamp.kr"    # email → user_id 매핑
            slack_channel: "C0AN7ATS4DD"
      on_fail: retry

links:
  - from: plan
    to: design
    type: sequential
  - from: design
    to: do
    type: sequential
  - from: do
    to: review
    type: sequential

teams:
  plan:
    adapter: claude_local
    config:
      role: pm-lead
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
  design:
    adapter: claude_local
    config:
      role: pm-lead
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
  do:
    adapter: claude_local
    config:
      role: cto-lead
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
      env:
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
  review:                         # ← 축4: human 어댑터
    adapter: human
    config:
      assignee: "smith@bscamp.kr"
      timeout_seconds: 86400
```

---

# TDD 케이스 (48건)

## 축 1: 산출물 — Output (12건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **OP-01** | test_op01_project_dir_exists — `brick/projects/bscamp/` 4개 하위 디렉토리 존재 | tasks, plans, designs, reports 존재 |
| **OP-02** | test_op02_templates_exist — `brick/templates/` 5개 파일 존재 | plan, design, do, report, analysis |
| **OP-03** | test_op03_artifact_gate_register — ConcreteGateExecutor에 "artifact" 등록됨 | `registered_gate_types()`에 포함 |
| **OP-04** | test_op04_artifact_gate_pass — 파일 존재 → GateResult(passed=True) | found 목록에 파일 경로 |
| **OP-05** | test_op05_artifact_gate_fail — 파일 미존재 → GateResult(passed=False) | missing 목록에 경로, detail에 "누락" |
| **OP-06** | test_op06_artifact_gate_glob — glob 패턴(*.md) → 매칭 파일 존재 시 pass | glob 확장 동작 |
| **OP-07** | test_op07_artifact_gate_no_paths — 경로 미지정 → GateResult(passed=False) | detail에 "경로 미지정" |
| **OP-08** | test_op08_feature_var_substitution — {feature} 치환 동작 | context["feature"]="test" → "test" 치환 |
| **OP-09** | test_op09_project_var_substitution — {project} 치환 동작 | context["project"]="bscamp" → 치환 |
| **OP-10** | test_op10_gate_fail_retry_loop — artifact Gate 실패 → on_fail: retry → 블록 재실행 | 재실행 후 파일 생성 → pass |
| **OP-11** | test_op11_preset_project_field — WorkflowDefinition.project 필드 파싱 | YAML에서 project 읽힘 |
| **OP-12** | test_op12_done_artifacts_to_context — DoneCondition.artifacts → context["done_artifacts"] | Gate에서 접근 가능 |

## 축 2: 컨텍스트 — Context (8건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **CX-01** | test_cx01_agent_prompts_exist — `.claude/agents/` 4개 파일 존재 | cto-lead.md, pm-lead.md, qa-monitor.md, report-generator.md |
| **CX-02** | test_cx02_role_to_agent_arg — role="cto-lead" → args에 `--agent cto-lead` 포함 | args 배열 검증 |
| **CX-03** | test_cx03_no_role_no_agent — role="" → `--agent` 미포함 | 기존 동작 유지 |
| **CX-04** | test_cx04_claude_md_exists — `brick/CLAUDE.md` 공통 규칙 파일 존재 + 200줄 이하 | 파일 존재 + 라인 수 검증 |
| **CX-05** | test_cx05_bare_removed — `--bare` 플래그 args에 **미포함** | `"--bare" not in args` |
| **CX-06** | test_cx06_agent_frontmatter — `.claude/agents/cto-lead.md`에 name/description frontmatter 존재 | YAML frontmatter 파싱 |
| **CX-07** | test_cx07_preset_role_field — YAML teams.plan.config.role 파싱 | config["role"] = "pm-lead" |
| **CX-08** | test_cx08_role_to_agent_flow — 프리셋 role → config → _build_args → `--agent {role}` 전체 흐름 | E2E 검증 |

## 축 3: 가시성 — Visibility (11건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **VS-01** | test_vs01_subscriber_failure_events — SlackSubscriber가 adapter_failed, gate_failed 구독 | 이벤트 수신 + Slack 호출 |
| **VS-02** | test_vs02_stderr_in_failure_event — adapter_failed 이벤트에 stderr 필드 존재 | event.data["stderr"] 비어있지 않음 |
| **VS-03** | test_vs03_exit_code_in_failure_event — adapter_failed에 exit_code 필드 존재 | event.data["exit_code"] = 1 |
| **VS-04** | test_vs04_slack_failure_message — 실패 Slack 메시지에 stderr 마지막 10줄 포함 | 코드블록 내 stderr |
| **VS-05** | test_vs05_sensitive_masking — Slack 메시지에서 TOKEN/SECRET 마스킹 | `TOKEN=***` 형태 |
| **VS-06** | test_vs06_approval_pending_event — approval Gate waiting → gate.approval_pending 이벤트 발행 | event.type == "gate.approval_pending" |
| **VS-07** | test_vs07_approval_slack_message — approval 대기 Slack에 산출물 경로 포함 | "검토 대상:" + 경로 |
| **VS-08** | test_vs08_role_in_failure — 실패 Slack에 role 표시 | "(cto-lead)" 포함 |
| **VS-09** | test_vs09_adapter_status_exit_code — AdapterStatus.exit_code 필드 존재 | dataclass 필드 접근 |
| **VS-10** | test_vs10_adapter_status_stderr — AdapterStatus.stderr 필드 존재 | dataclass 필드 접근 |
| **VS-11** | test_vs11_no_token_no_crash — SLACK_BOT_TOKEN 미설정 → warning만, 예외 없음 | 기존 동작 유지 |

## 축 4: 사람 — People (12건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **MU-01** | test_mu01_users_table_exists — brick_users 테이블 생성 + RBAC 컬럼 | email, role(admin/operator/viewer), is_approved 컬럼 존재 |
| **MU-02** | test_mu02_google_signin — verifyGoogleIdToken 유효 토큰 → email 추출 | payload.email 반환 |
| **MU-03** | test_mu03_new_user_auto_create — 신규 Google 사용자 → viewer + is_approved=0 | DB에 INSERT + 403 반환 |
| **MU-04** | test_mu04_first_user_admin — 테이블 비어있을 때 첫 사용자 → admin + is_approved=1 | role='admin', is_approved=1 |
| **MU-05** | test_mu05_session_db_backed — 세션 토큰 SHA-256 해시로 DB 저장 | brick_user_sessions에 token_hash 존재, 원문 없음 |
| **MU-06** | test_mu06_session_7day_expiry — 7일 경과 세션 → 401 | 만료 세션 validateSession() → null |
| **MU-07** | test_mu07_require_role_403 — viewer가 operator API → 403 | requireRole('operator') 미달 → 403 |
| **MU-08** | test_mu08_notification_recipient — notifications.recipient_id로 특정 유저 알림 | recipient_id 필터 조회 |
| **MU-09** | test_mu09_human_assignee_email — HumanAdapter assignee email → 대시보드에서 user 매칭 | assignee="smith@bscamp.kr" → user.id 조회 |
| **MU-10** | test_mu10_login_page_render — /login 라우트 → LoginPage 렌더 | Google 버튼 존재 |
| **MU-11** | test_mu11_auth_guard_redirect — 미인증 → /login 리디렉트 | Navigate to="/login" |
| **MU-12** | test_mu12_project_access_filter — viewer가 타 project API → 403 | project_id 불일치 → 403 |

## 축 간 접점 (7건)

| ID | 테스트 | 접점 | 검증 |
|----|--------|------|------|
| **XP-01** | test_xp01_artifact_in_approval_alert — approval 알림에 done_artifacts 경로 포함 | Output→Visibility | event.data["artifacts"]에 경로 |
| **XP-02** | test_xp02_role_in_adapter_failed — adapter_failed에 role 포함 | Context→Visibility | event.data["role"] = "cto-lead" |
| **XP-03** | test_xp03_gate_detail_in_slack — gate_failed Slack에 누락 파일 목록 | Output→Visibility | missing 파일 이름 표시 |
| **XP-04** | test_xp04_role_metadata_recorded — StartBlockCommand 실행 시 block.metadata에 role 기록 | Context→Visibility | metadata["role"] 존재 |
| **XP-05** | test_xp05_integrated_preset — 4축 통합 프리셋 YAML → 정상 파싱 + 실행 | 전체 | project/feature/role/artifact/assignee 모두 동작 |
| **XP-06** | test_xp06_approval_to_user_notification — approval pending → approver email → brick_users → notification | Visibility→People | notifications.recipient_id 일치 |
| **XP-07** | test_xp07_human_task_user_filter — human task 목록 → 인증된 user의 task만 | People→Output | operator는 자기 assignee만 |

---

# 불변식 (13건)

## 축 1: Output (3건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-O1** | artifact Gate는 파일 존재만 확인, 내용 검증 안 함 | `os.path.exists` / `glob.glob`만 사용 |
| **INV-O2** | 기존 7개 Gate 타입 동작 변경 없음 | 기존 Gate TDD regression 0건 |
| **INV-O3** | {project}/{feature} 미지정 시 빈 문자열로 치환 (에러 아님) | context에 키 없으면 "" |

## 축 2: Context (3건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-C1** | `--bare` 플래그 **제거됨** — args에 포함 금지 | `"--bare" not in args` |
| **INV-C2** | role 미지정 시 `--agent` 미포함 + CLAUDE.md만 네이티브 로딩 | args에 `--agent` 없음 |
| **INV-C3** | `.claude/agents/{role}.md` 부재 시 `--agent` 그대로 전달 (Claude Code가 처리) | exception 없음 |

## 축 3: Visibility (3건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-V1** | SLACK_BOT_TOKEN 미설정 → warning만, 에러 없음 | 기존 동작 유지 |
| **INV-V2** | Slack 전송 실패 → 엔진 동작에 영향 없음 | try/except 처리 |
| **INV-V3** | stderr에서 환경변수/토큰 마스킹 필수 | regex 마스킹 검증 |

## 축 4: People (3건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-M1** | Google OAuth가 주 인증. 기존 로컬 로그인은 관리자 부트스트랩용 유지 | 신규 사용자는 Google only, 기존 users.py는 변경 없음 |
| **INV-M2** | 세션 토큰은 DB에 SHA-256 해시로만 저장 — 원문 저장 금지 | brick_user_sessions.token_hash = SHA-256 |
| **INV-M3** | RBAC 계층: viewer < operator < admin. 상위 역할은 하위 권한 포함 | ROLE_LEVELS 단조 증가 |

## 접점 (1건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-X1** | 축 간 접점은 EventBus 이벤트 data 필드로만 연결. 직접 import 없음 | 축별 모듈 간 import 그래프에 순환 없음 |

---

# 엣지케이스

## 축 1: Output

| 케이스 | 동작 |
|--------|------|
| done.artifacts 비어있음 + artifact Gate 설정 | Gate handler.command로 판단. 둘 다 없으면 fail |
| glob 패턴이 디렉토리 매칭 | `os.path.exists()` → True (디렉토리도 존재로 인정) |
| {feature}에 특수문자(`/`, `..`) | 치환 후 경로가 부모 탈출 시 → 보안: `..` 포함 경로 거부 |
| 파일 존재하지만 0바이트 | 존재로 인정 (내용 검증 안 함 — INV-O1) |
| max_retries 초과 | on_fail: retry → 재시도 3회 → 최종 실패 → gate_failed 이벤트 |

## 축 2: Context

| 케이스 | 동작 |
|--------|------|
| role="cto-lead" + `.claude/agents/cto-lead.md` 없음 | `--agent cto-lead` 그대로 전달 (Claude Code 네이티브 에러 처리) |
| role에 path traversal(`../../../etc/passwd`) | `--agent` 인자로 전달 — Claude Code가 `.claude/agents/` 내부만 검색 (네이티브 보안) |
| CLAUDE.md 없음 | Claude Code 정상 동작 (CLAUDE.md는 optional) |
| `--bare` 잔존 코드 | `--bare` args에 포함 시 INV-C1 위반 — TDD CX-05가 탐지 |

## 축 3: Visibility

| 케이스 | 동작 |
|--------|------|
| stderr 32KB (최대) → Slack | 마지막 10줄만 전송 |
| stderr에 ANSI 컬러 코드 포함 | Slack code block 안이므로 무해 |
| Slack rate limit | httpx timeout 5초 + try/except → 스킵 |
| approval 이벤트 중복 발행 (Gate 재검사) | 문제 없음 — Slack은 idempotent 아님이지만, 알림 중복은 알림 누락보다 낫다 |
| exit_code = None (signal로 종료) | `exit_code: null` 표시 |

## 축 4: People

| 케이스 | 동작 |
|--------|------|
| Google 토큰 만료/위조 | verifyGoogleIdToken → Error → 401 "Invalid Google token" |
| is_approved=0 사용자 로그인 | 세션 미생성 → 403 "관리자 승인 대기" |
| admin 0명 (빈 테이블) | 최초 사용자 → admin + is_approved=1 자동 (seed 패턴) |
| 세션 만료 + API 호출 | validateSession → null → 401 → 프론트 /login 리디렉트 |
| Google email 미인증 (email_verified=false) | verifyGoogleIdToken → Error "Google email not verified" |
| GOOGLE_CLIENT_ID 미설정 | aud 검증 스킵 (개발 모드 호환) |
| 동일 email 중복 가입 시도 | UNIQUE 제약 → 기존 사용자 반환 (INSERT 무시) |
| project_id=NULL 사용자 | 모든 project 접근 허용 (관리자 패턴) |

---

# 파일 목록 (26건)

## 수정 (5건)

| 파일 | 변경 |
|------|------|
| `brick/brick/gates/concrete.py` | `_run_artifact()` 추가 + `_register_builtins`에 등록 |
| `brick/brick/adapters/claude_local.py` | `_build_args`에서 `--bare` 제거 + `--agent {role}` 추가 |
| `brick/brick/engine/slack_subscriber.py` | 3개 이벤트 추가 구독 + 메시지 포맷 확장 + 마스킹 |
| `brick/brick/engine/executor.py` | adapter_failed에 stderr/exit_code/role, approval pending 이벤트, project/feature context |
| `brick/brick/engine/preset_validator.py` | project 필드 검증 추가 (※ "artifact"는 이미 DEFAULT_GATE_TYPES에 포함) |

## 수정 (모델, 2건)

| 파일 | 변경 |
|------|------|
| `brick/brick/models/team.py` | AdapterStatus에 exit_code, stderr 필드 추가 |
| `brick/brick/models/workflow.py` | WorkflowDefinition에 project, feature 필드 추가 |

## 신규 — 에이전트 프롬프트 (4건)

| 파일 |
|------|
| `.claude/agents/cto-lead.md` |
| `.claude/agents/pm-lead.md` |
| `.claude/agents/qa-monitor.md` |
| `.claude/agents/report-generator.md` |

## 신규 — 공통 규칙 (1건)

| 파일 |
|------|
| `brick/CLAUDE.md` |

## 신규 — 문서 템플릿 (5건)

| 파일 |
|------|
| `brick/templates/plan.md` |
| `brick/templates/design.md` |
| `brick/templates/do.md` |
| `brick/templates/report.md` |
| `brick/templates/analysis.md` |

## 신규 — 프로젝트 디렉토리 (3건)

| 디렉토리 |
|----------|
| `brick/projects/bscamp/{tasks,plans,designs,reports}/` |
| `brick/projects/brick-engine/{tasks,plans,designs,reports}/` |
| `brick/projects/skyoffice/{tasks,plans,designs,reports}/` |

## 수정 — 축4 People (3건)

| 파일 | 변경 |
|------|------|
| `brick/brick/auth/schema.sql` | users 테이블 Google 컬럼 추가 (email, provider, avatar_url, is_approved) + notifications 테이블 신규 |
| `brick/brick/dashboard/routes/auth_routes.py` | `/auth/google` 엔드포인트 추가 + human tasks 조회 |
| `brick/brick/dashboard/routes/engine_bridge.py` | `/engine/human/tasks` 인증 기반 필터 추가 |

## 신규 — 축4 People (3건)

| 파일 | 용도 |
|------|------|
| `brick/brick/auth/google.py` | Google ID 토큰 검증 (MC 패턴 포팅, httpx) |
| `brick/brick/engine/user_notifier.py` | EventBus → 직원별 알림 라우팅 (notifications INSERT) |
| 프론트엔드 로그인 페이지 | Google Sign-In 버튼 + AuthGuard (기존 대시보드 구조에 맞춤) |

---

# 보안 고려사항

| 항목 | 위험 | 대응 |
|------|------|------|
| artifact 경로에 `..` | 디렉토리 탈출 | 경로 정규화 후 `..` 포함 시 거부 |
| role에 path traversal | 파일 시스템 접근 | `os.path.join` + 결과 경로가 agents_dir 내인지 확인 |
| stderr에 시크릿 노출 | Slack으로 유출 | `_mask_sensitive()` regex 마스킹 |
| approval API 무인증 | 무단 승인 | 기존 인증 미들웨어 적용 (현재 dev 모드 — Phase 2에서 RBAC) |
