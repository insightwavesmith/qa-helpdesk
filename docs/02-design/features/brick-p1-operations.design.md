# Design: 브릭 P1 — 운영 품질 (피드백 + 프로젝트 컨텍스트 + 에이전트 무장)

> **피처**: brick-p1-operations
> **레벨**: L2-기능
> **작성**: PM | 2026-04-04
> **TASK**: docs/tasks/TASK-brick-p1-operations.md
> **Plan**: docs/02-design/features/brick-p1-operations.plan.md
> **선행**: P0 4축 완성 (brick-p0-3axis-completion) 전제

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **피처** | brick-p1-operations |
| **핵심** | 3축(피드백/프로젝트컨텍스트/에이전트무장) 추가로 운영 품질 향상 |
| **제약** | 기존 Gate/Link 코드 수정 금지 (추가만), 578 테스트 regression 금지 |

### 결과 요약

| 지표 | 축A Feedback | 축B Project | 축C Arsenal | 접점 | **합계** |
|------|-------------|------------|------------|------|---------|
| **TDD** | 11건 | 8건 | 7건 | 5건 | **31건** |
| **불변식** | 3건 | 3건 | 3건 | 1건 | **10건** |
| **파일** | 1건 | 3건 | 6건 | — | **수정7+신규6=13건** |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 반려 사유 미전달 + 프로젝트 규칙 수동 전달 + 에이전트 도구 무제한 |
| **Solution** | reject_reason 자동 주입 + project.yaml 자동 로딩 + tools/disallowedTools 제한 |
| **Core Value** | "반려하면 이유를 알고 고친다, 프로젝트 규칙을 자동으로 안다, 위험한 명령은 막힌다" |

---

## 기존 설계 참조 및 정합성 (Cross-Reference)

> P1 작성 시 아래 8개 기존 Design 문서의 결정/구조를 확인하고 반영함.
> 충돌 없음. 관계만 명시.

| 기존 Design | P1과의 관계 | 충돌 여부 |
|------------|-----------|---------|
| **brick-agent-abstraction** | P1이 `ClaudeLocalAdapter` config에 `project` 필드를 추가. 기존 필드(`command`, `model`, `cwd`, `timeoutSec`, `graceSec`, `maxTurns`, `dangerouslySkipPermissions`, `env`) 변경 없음. `_build_args()` 패턴 유지, project agent 경로 검색 로직만 추가. | 없음 (additive) |
| **brick-team-adapter** | brick-team-adapter의 `TeammateSpec.permitted_tools`는 TeamCreate 시 적용. P1의 frontmatter `tools/disallowedTools`는 Claude Code agent 파일에서 적용. **두 레이어의 tools 제어는 상호 보완적** — 런타임(TeamCreate) vs 정의(agent 프롬프트) 각각 독립 동작. | 없음 (다른 레이어) |
| **agent-harness-v2** | agent-harness-v2의 `living-context-loader`는 PDCA 단계별 문서 로딩(Plan/Design/Do). P1의 `project.yaml`은 프로젝트 설정(tech_stack, constraints). **별도 레이어로 context에 각각 병합됨.** | 없음 (보완적) |
| **agent-process-v2** | PM 검수 단계 제거 + 6단계 체인 — P1은 Gate 레벨 reject_reason. 체인 프로토콜 변경 없음. | 없음 |
| **agent-process-v3** | `.bkit/runtime/` 경로 — P1은 `brick/projects/` 경로 사용. 런타임 경로 충돌 없음. PID 역추적/peer-map.json 변경 없음. | 없음 |
| **chain-100-percent** | match-rate-parser + 배포 권한 — P1은 Gate 레벨 피드백. 체인 레벨 검증 로직 변경 없음. | 없음 |
| **chain-bulletproof** | `COMPLETION_REPORT.payload.issues`는 체인 레벨 피드백 (PM reject → CTO). P1의 `context["reject_reason"]`은 **Gate 레벨 approval 반려**. 별개 메커니즘, 서로 독립. | 없음 (다른 레벨) |
| **paperclip-bkit-integration-v3** | Dashboard `agents` 테이블(tmuxSession, peerId, idle) — P1은 엔진 레벨 agent config만. Dashboard DB 변경 없음. | 없음 |

### 방향 변경 사항 (기존 X → Y 변경)

**해당 없음.** P1의 모든 설계는 기존 결정의 확장(additive)이며, 기존 인터페이스를 변경하거나 대체하지 않음.

- `ClaudeLocalAdapter` config에 `project` 필드 추가 = 기존 스키마 확장 (변경 아님)
- agent frontmatter에 `tools/disallowedTools` 추가 = Claude Code 네이티브 기능 활용 (기존 name/description/model에 추가)
- `executor.complete_block()`에 reject_reason 주입 = 기존 gate_result 처리 확장 (기존 metrics 주입 패턴과 동일)
- Slack 알림에 level/prefix/suffix 추가 = 기존 SlackSubscriber 확장 (기존 8개 이벤트 유지)

---

## 0. 6단계 사고 프로세스

### Step 1: TASK 재해석

"P0으로 브릭이 돌아가게 됐지만, 반려 후 같은 실수 반복 + 프로젝트 인프라 모름 + 에이전트가 위험한 명령 가능 → 이 3가지를 독립적으로 추가하여 운영 품질을 올린다."

### Step 2: 영향범위

| 축 | 수정 파일 | 신규 파일 |
|---|----------|----------|
| Feedback | executor.py, slack_subscriber.py | — |
| Project Context | executor.py, claude_local.py | project.yaml 2개, agents/ 1개 |
| Agent Arsenal | .claude/agents/ 4개 | .claude/skills/ 3개 |

### Step 3: 선행 조건

- P0 4축 완성 전제 (artifact Gate, --agent, Slack 알림, 인증) ✅
- approval Gate에 reject_reason 필드 구현 완료 (`concrete.py:409,414`) ✅
- SlackSubscriber 8개 이벤트 구독 중 ✅
- .claude/agents/ 네이티브 frontmatter 지원 ✅
- EventBus wildcard(*) 구독 지원 ✅

### Step 4: 의존성

- 3축 독립 (병렬 구현 가능)
- 축A 내부: A-1(reject_reason) → A-2(Slack) 순차. A-3~A-5 독립.
- 축B → 축A 접점: project.yaml의 프로젝트명이 Slack 알림에 사용됨

### Step 5: 방법 도출

| 축 | 선택 | 대안 | 이유 |
|---|------|------|------|
| Feedback | executor가 gate_result.metadata에서 reject_reason 추출 → context 주입 | 블록에 직접 주입 | context 중심 아키텍처 유지 |
| Project Context | project.yaml (파일) | DB 테이블 (project-layer Design) | P1은 YAML 충분. DB는 P2 |
| Agent Arsenal | frontmatter tools + 프롬프트 본문 제한 | 하드코딩 | Claude Code 네이티브 활용 |

### Step 6: 팀원 배정

PM: Design (이 문서) → CTO → backend-dev 1명

---

# 축 A: 피드백 루프 (Feedback) — "반려하면 이유를 알고 고친다"

## A-1. reject_reason context 주입

### 현재 동작 (concrete.py:406-416)

```python
# _run_approval — reject 분기
if action == "reject":
    return GateResult(
        passed=False,
        detail=f"CEO 반려: {context.get('reject_reason', '')}",
        type="approval",
        metadata={
            "status": "rejected",
            "approver": approval_config.approver,
            "reject_reason": context.get("reject_reason", ""),
        },
    )
```

reject_reason은 `gate_result.metadata["reject_reason"]`에 있지만, **다음 블록의 context에 주입되지 않음**.
loop Link로 돌아갈 때 에이전트는 "왜 반려됐는지" 모름.

### 변경: executor.py — complete_block() 확장

```python
# executor.py — complete_block() 내, gate 결과 처리 후

gate_result = await self.gate_executor.run_gates(block_inst, instance.context)

# Gate 결과를 context에 반영 (기존)
if gate_result.metrics:
    instance.context.update(gate_result.metrics)

# 신규: reject_reason을 context에 주입
if not gate_result.passed and gate_result.metadata:
    reject_reason = gate_result.metadata.get("reject_reason", "")
    if reject_reason:
        instance.context["reject_reason"] = reject_reason
        instance.context["reject_block_id"] = block_id
        instance.context["reject_count"] = instance.context.get("reject_count", 0) + 1
```

### 재작업 프롬프트에 자동 포함

`ClaudeLocalAdapter.start_block()`에서 프롬프트 구성 시 context에 reject_reason이 있으면 자동 포함:

```python
# claude_local.py — start_block() 내 prompt 구성

prompt = f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"

# 신규: reject_reason 있으면 강조
reject_reason = context.get("project_context", {}).get("reject_reason", "")
if reject_reason:
    reject_count = context.get("project_context", {}).get("reject_count", 1)
    prompt = (
        f"⚠️ 이전 산출물이 반려됨 (시도 {reject_count}회)\n"
        f"반려 사유: {reject_reason}\n"
        f"이 부분을 수정하여 다시 작성해라.\n\n"
        + prompt
    )
```

## A-2. Slack 알림에 반려 사유 포함

### 현재 gate_failed 메시지 (slack_subscriber.py:55-57)

```python
elif event.type == "block.gate_failed":
    error = event.data.get("error", "Gate check failed")
    return f":warning: 게이트 실패: *{block_id}*\n사유: {error}"
```

### 변경: reject_reason 포함

```python
elif event.type == "block.gate_failed":
    error = event.data.get("error", "Gate check failed")
    reject_reason = event.data.get("reject_reason", "")
    retry_count = event.data.get("retry_count", 0)
    max_retries = event.data.get("max_retries", 3)
    msg = f":x: 반려: *{block_id}*\n사유: {error}"
    if reject_reason:
        msg = f":x: 반려: *{block_id}*\n사유: {reject_reason}"
    if retry_count > 0:
        msg += f"\n재시도: {retry_count}/{max_retries}"
    return msg
```

### executor에서 gate_failed 이벤트에 reject_reason 포함

```python
# executor.py — complete_block() 내

event_type = "block.gate_passed" if gate_result.passed else "block.gate_failed"
gate_event = Event(type=event_type, data={
    "block_id": block_id,
    "workflow_id": instance.id,                                    # 기존
    "error": gate_result.detail,                                   # 기존
    "reject_reason": gate_result.metadata.get("reject_reason", "") if gate_result.metadata else "",  # 신규
    "retry_count": block_inst.retry_count if block_inst else 0,    # 신규
    "max_retries": block_inst.block.gate.max_retries if block_inst and block_inst.block.gate else 3,  # 신규
})
```

## A-3. verbose/basic 알림 레벨 분리

### 레벨 정의

| 레벨 | 이벤트 |
|------|--------|
| **basic** | workflow.completed, block.adapter_failed, block.gate_failed, gate.pending |
| **verbose** | basic + block.started, block.completed, link.started, link.completed |

### 프리셋 YAML 설정

```yaml
notifications:
  level: basic       # basic | verbose (기본값: basic)
  channel: C0AN7ATS4DD
```

### SlackSubscriber 변경

```python
class SlackSubscriber:
    BASIC_EVENTS = {
        "workflow.completed", "block.adapter_failed",
        "block.gate_failed", "gate.pending",
    }
    VERBOSE_EVENTS = BASIC_EVENTS | {
        "block.started", "block.completed",
        "link.started", "link.completed",
    }

    def __init__(self, event_bus: EventBus, token: str | None = None,
                 level: str = "basic", channel: str | None = None) -> None:
        self._token = token or os.environ.get("SLACK_BOT_TOKEN", "")
        self._channel = channel or SLACK_CHANNEL
        self._level = level

        # 테스트 환경 격리 (A-4)
        if os.environ.get("BRICK_ENV") == "test":
            self._token = ""  # 토큰 비워서 전송 차단

        allowed = self.VERBOSE_EVENTS if level == "verbose" else self.BASIC_EVENTS
        for event_type in allowed:
            event_bus.subscribe(event_type, self._on_event)
```

## A-4. BRICK_ENV=test → Slack 미발송

위 A-3 코드에 포함. `BRICK_ENV=test`면 토큰을 빈 문자열로 설정 → 기존 `_on_event()`의 `if not self._token: return` 로직이 자동으로 차단.

## A-5. 알림에 프로젝트+feature 표기

### 현재

```
:arrow_forward: 블록 시작: *do*
```

### 변경

```
:arrow_forward: [bscamp] 블록 시작: *do* — brick-p1-operations
```

### _format_message 확장

```python
def _format_message(event: Event) -> str:
    block_id = event.data.get("block_id", "")
    workflow_id = event.data.get("workflow_id", "")
    project = event.data.get("project", "")
    feature = event.data.get("feature", "")

    # prefix 구성
    prefix = ""
    if project:
        prefix = f"[{project}] "
    suffix = ""
    if feature:
        suffix = f" — {feature}"

    if event.type == "block.started":
        return f":arrow_forward: {prefix}블록 시작: *{block_id}*{suffix}"
    # ... 나머지 이벤트도 prefix/suffix 적용
```

### executor에서 이벤트 data에 project/feature 포함

```python
# executor.py — 모든 이벤트 발행 시 project/feature 포함
# context에서 추출하여 event.data에 주입

def _enrich_event_data(self, instance: WorkflowInstance, data: dict) -> dict:
    """이벤트 data에 project/feature 자동 추가."""
    project_ctx = instance.context.get("project", {})
    data.setdefault("project", project_ctx.get("name", ""))
    data.setdefault("feature", instance.feature)
    data.setdefault("workflow_id", instance.id)
    return data
```

---

# 축 B: 프로젝트 컨텍스트 (Project Context) — "프로젝트 규칙을 자동으로 안다"

## B-1. project.yaml 설정 파일

### 구조

```yaml
# brick/projects/bscamp/project.yaml

name: bscamp
description: "자사몰사관학교 — 메타 광고 자동화 플랫폼"

tech_stack:
  - Next.js 15 (App Router)
  - Cloud SQL (PostgreSQL이 아닌 SQLite 주의!)
  - Firebase Auth
  - GCS (Google Cloud Storage)
  - Cloud Run
  - Tailwind CSS + Pretendard 폰트

constraints:
  - "DB는 SQLite (better-sqlite3 + drizzle-orm). PostgreSQL 문법 사용 금지"
  - "배포는 Cloud Run. Vercel 아님"
  - "포트 3200=Express, 3202=Python 엔진"
  - "Primary 색상: #F75D5D, hover: #E54949"
  - "한국어 UI 전용. 영어 라벨 금지"
  - "라이트 모드만. 다크 모드 토글 없음"

agents:
  cto: cto-lead              # 기본 .claude/agents/cto-lead.md 사용
  pm: pm-lead
  qa: qa-monitor

# 프로젝트별 agent 오버라이드 (선택)
# cto: cto-lead-bscamp → brick/projects/bscamp/agents/cto-lead-bscamp.md
```

### brick-engine 프로젝트

```yaml
# brick/projects/brick-engine/project.yaml

name: brick-engine
description: "브릭 엔진 — 워크플로우 오케스트레이션"

tech_stack:
  - Python 3.11+
  - FastAPI
  - SQLite (brick.db)
  - asyncio
  - pytest + pytest-asyncio

constraints:
  - "Python 코어. TypeScript 아님"
  - "dataclass 기반 모델. Pydantic은 API 계층만"
  - "asyncio 기반 비동기"
  - "기존 578 테스트 regression 금지"

agents:
  cto: cto-lead
  pm: pm-lead
```

## B-2. executor.start()에서 project.yaml 로딩

### 현재 코드 (executor.py:261-291)

```python
async def start(self, preset_name: str, feature: str, task: str, initial_context: dict | None = None) -> str:
    # ...
    instance = WorkflowInstance.from_definition(workflow_def, feature, task)
    if initial_context:
        instance.context["project"] = initial_context
```

### 변경: project.yaml 자동 로딩

```python
async def start(self, preset_name: str, feature: str, task: str, initial_context: dict | None = None) -> str:
    # ...
    instance = WorkflowInstance.from_definition(workflow_def, feature, task)

    # 프로젝트 컨텍스트 주입
    project_context = {}
    if initial_context:
        project_context = initial_context

    # project.yaml 로딩 (프리셋에 project 필드가 있으면)
    project_name = initial_context.get("name", "") if initial_context else ""
    if project_name:
        project_yaml = self._load_project_yaml(project_name)
        if project_yaml:
            # YAML 내용을 project_context에 병합 (initial_context가 우선)
            merged = {**project_yaml, **project_context}
            project_context = merged

    instance.context["project"] = project_context
    # ...
```

### _load_project_yaml 헬퍼

```python
def _load_project_yaml(self, project_name: str) -> dict | None:
    """brick/projects/{name}/project.yaml 로딩. 없으면 None."""
    candidates = [
        Path(f"brick/projects/{project_name}/project.yaml"),
        Path(f"projects/{project_name}/project.yaml"),
    ]
    for path in candidates:
        if path.exists():
            return yaml.safe_load(path.read_text()) or {}
    return None
```

### 프롬프트에 project context 자동 포함

`ClaudeLocalAdapter.start_block()`에서 context 전달 시 project.yaml 내용이 자동으로 포함됨 (이미 `json.dumps(context)` 하고 있으므로 추가 코드 불필요).

에이전트는 프롬프트에서 다음과 같이 받음:
```
CONTEXT:
{
  "project": {
    "name": "bscamp",
    "tech_stack": ["Next.js 15", "Cloud SQL", ...],
    "constraints": ["DB는 SQLite...", ...]
  },
  ...
}
```

## B-3. 프로젝트별 에이전트 프롬프트 오버라이드

### 경로 우선순위

1. `brick/projects/{project}/agents/{role}.md` (프로젝트별 오버라이드)
2. `.claude/agents/{role}.md` (기본)

### claude_local.py _build_args() 변경

```python
def _build_args(self) -> list[str]:
    args = ["--print", "-", "--output-format", "stream-json", "--verbose"]

    if self.role:
        # 프로젝트별 오버라이드 검색
        agent_name = self.role
        if self.project:
            project_agent_dir = Path(f"brick/projects/{self.project}/agents")
            project_agent = project_agent_dir / f"{self.role}.md"
            if project_agent.exists():
                # 프로젝트별 agent를 --system-prompt-file로 주입
                args.extend(["--system-prompt-file", str(project_agent)])
            else:
                args.extend(["--agent", self.role])
        else:
            args.extend(["--agent", self.role])

    # ... 나머지 기존 코드
```

### __init__에 project 필드 추가

```python
def __init__(self, config: dict | None = None):
    config = config or {}
    # 기존 필드 ...
    self.role = config.get("role", "")
    self.project = config.get("project", "")    # 신규
```

---

# 축 C: 에이전트 무장 (Agent Arsenal) — "위험한 명령은 막힌다"

## C-1. agent 프롬프트 frontmatter — tools/disallowedTools

### Claude Code 네이티브 frontmatter 지원 확인

현재 `.claude/agents/` 파일들은 `name`, `description`, `model` frontmatter 사용 중 (예: `code-analyzer.md:1-19`).
Claude Code는 `tools`, `disallowedTools`, `permissionMode` frontmatter도 지원.

### 역할별 설정

**cto-lead.md:**
```markdown
---
name: cto-lead
description: CTO 리더. 구현 조율, 팀원 위임, 품질 검증.
model: opus
tools:
  - Read
  - Write
  - Edit
  - Bash
  - Grep
  - Glob
  - Agent
disallowedTools:
  - "Bash(rm -rf*)"
  - "Bash(git push --force*)"
  - "Bash(git reset --hard*)"
  - "Bash(DROP TABLE*)"
  - "Bash(DELETE FROM*)"
---

# CTO 리더
(본문)
```

**pm-lead.md:**
```markdown
---
name: pm-lead
description: PM 리더. Plan/Design 작성, TDD 정의.
model: opus
permissionMode: plan
tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
disallowedTools:
  - Bash
---

# PM 리더
(본문)
```

**qa-monitor.md:**
```markdown
---
name: qa-monitor
description: QA 모니터. 로그 분석, 테스트 검증.
model: sonnet
tools:
  - Read
  - Grep
  - Glob
  - Bash
disallowedTools:
  - Write
  - Edit
---

# QA 모니터
(본문)
```

**report-generator.md:**
```markdown
---
name: report-generator
description: 보고서 생성. PDCA 완료 보고.
model: sonnet
tools:
  - Read
  - Write
  - Edit
  - Grep
  - Glob
---

# 보고서 생성
(본문)
```

## C-2. 외부 스킬 3개 배치

### 스킬 선정 기준

| 스킬 | 대상 역할 | 소스 | 선정 이유 |
|------|----------|------|----------|
| PM Discovery | PM | phuryn/pm-skills | 5단계 Discovery 체인 (Brainstorm→Assumptions→Prioritize→Experiments→OST) |
| Security Auditor | CTO | alirezarezvani/claude-skills | OWASP Top 10 점검, 코드 보안 분석 |
| Playwright Pro | CTO/QA | alirezarezvani/claude-skills | E2E 테스트 55 템플릿 |

### 스킬 파일 구조

```
.claude/
  skills/
    pm-discovery.md       # PM Discovery 체인
    security-auditor.md   # Security Auditor
    playwright-pro.md     # Playwright E2E
```

스킬은 `--agent` 프롬프트에서 "사용 가능한 스킬" 섹션으로 참조:

```markdown
# CTO 리더

## 사용 가능한 스킬
- /security-audit — OWASP Top 10 보안 점검
- /playwright — E2E 테스트 생성

## 규칙
...
```

## C-3. GitHub MCP 연결 (CTO 전용)

### 프리셋 YAML에서 MCP 활성화

```yaml
teams:
  do:
    adapter: claude_local
    config:
      role: cto-lead
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
      env:
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
      # MCP는 .claude/settings.json에서 전역 설정
      # CTO agent 프롬프트에서 "GitHub MCP 사용" 안내
```

### .claude/settings.json 설정 (이미 존재하는 파일)

GitHub MCP는 이미 설치되어 있는 경우가 많음. 프롬프트에서 사용을 안내:

```markdown
# CTO 리더

## MCP 도구
- GitHub MCP: PR 생성, 이슈 관리, 코드 검색에 활용
  - mcp__github__create_pull_request
  - mcp__github__create_issue
  - mcp__github__list_pull_requests
```

---

# 축 간 접점

## 접점 1: reject_reason → Slack 알림 (A-1 → A-2)

executor의 `complete_block()`에서 gate_result.metadata["reject_reason"]을 event.data에 포함 → SlackSubscriber가 알림에 표시.

```python
# 흐름:
# 1. approval Gate → reject → GateResult.metadata["reject_reason"] = "TDD 3건 누락"
# 2. executor.complete_block() → context["reject_reason"] = "TDD 3건 누락"
# 3. gate_failed 이벤트 data에 reject_reason 포함
# 4. SlackSubscriber._format_message() → ":x: 반려: *design-review* 사유: TDD 3건 누락"
```

## 접점 2: project.yaml → Slack 프로젝트명 (B-2 → A-5)

executor가 이벤트 발행 시 `_enrich_event_data()`로 project.name 주입 → Slack 메시지에 `[bscamp]` 표기.

## 접점 3: project.yaml → 프로젝트별 agent → tools 적용 (B-3 → C-1)

`project.yaml`의 `agents.cto: cto-lead-bscamp` → `claude_local._build_args()`에서 `brick/projects/bscamp/agents/cto-lead-bscamp.md` 로딩 → frontmatter의 tools/disallowedTools 적용.

## 접점 4: reject_reason → 재작업 프롬프트 (A-1 → 블록 실행)

context에 주입된 reject_reason이 다음 블록 실행 시 프롬프트에 자동 포함 → 에이전트가 "왜 반려됐는지" 알고 수정.

## 접점 5: 통합 프리셋 YAML 예시

```yaml
# P1 통합 프리셋 예시
project: bscamp
feature: brick-p1-operations

notifications:
  level: basic
  channel: C0AN7ATS4DD

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
      on_fail: retry
      max_retries: 3

  - id: design
    what: "Design 문서 작성"
    done:
      artifacts:
        - "brick/projects/{project}/designs/{feature}.md"
    gate:
      handlers:
        - type: artifact
          command: "brick/projects/{project}/designs/{feature}.md"
      on_fail: retry

  - id: review
    what: "Smith님 검토"
    gate:
      handlers:
        - type: approval
          approval:
            approver: "smith@bscamp.kr"
            slack_channel: "C0AN7ATS4DD"
      on_fail: retry   # reject → reject_reason context 주입 → design 블록 재실행

  - id: do
    what: "구현"
    done:
      artifacts:
        - "brick/projects/{project}/reports/{feature}.md"

links:
  - from: plan
    to: design
    type: sequential
  - from: design
    to: review
    type: sequential
  - from: review
    to: do
    type: sequential
  - from: review
    to: design
    type: loop           # reject 시 design 재작업
    condition: "approval_action == reject"

teams:
  plan:
    adapter: claude_local
    config:
      role: pm-lead
      project: bscamp
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
  design:
    adapter: claude_local
    config:
      role: pm-lead
      project: bscamp
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
  review:
    adapter: human
    config:
      assignee: "smith@bscamp.kr"
  do:
    adapter: claude_local
    config:
      role: cto-lead
      project: bscamp
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
      env:
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

---

# TDD 케이스 (31건)

## 축 A: 피드백 — Feedback (11건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **FB-01** | test_fb01_reject_reason_to_context — approval reject → context["reject_reason"] 주입 | context에 reject_reason 존재 |
| **FB-02** | test_fb02_reject_count_increment — 연속 reject → reject_count 증가 | context["reject_count"] == 2 |
| **FB-03** | test_fb03_reject_block_id — reject 시 reject_block_id 기록 | context["reject_block_id"] == "review" |
| **FB-04** | test_fb04_slack_reject_reason — gate_failed Slack 메시지에 reject_reason 포함 | "사유: TDD 3건 누락" |
| **FB-05** | test_fb05_slack_retry_count — gate_failed Slack에 재시도 횟수 표시 | "재시도: 2/3" |
| **FB-06** | test_fb06_basic_level_filter — basic 레벨 → block.started 이벤트 미수신 | subscribe 호출 안 됨 |
| **FB-07** | test_fb07_verbose_level_all — verbose 레벨 → 8개 이벤트 전부 수신 | 8개 subscribe |
| **FB-08** | test_fb08_brick_env_test — BRICK_ENV=test → Slack 전송 안 됨 | httpx.post 호출 0회 |
| **FB-09** | test_fb09_project_prefix — 알림에 `[bscamp]` prefix 표시 | 메시지에 "[bscamp]" 포함 |
| **FB-10** | test_fb10_feature_suffix — 알림에 `— brick-p1-operations` suffix | 메시지에 "— brick-p1" 포함 |
| **FB-11** | test_fb11_reject_prompt_injection — reject_reason이 재작업 프롬프트에 포함 | 프롬프트에 "반려 사유:" 포함 |

## 축 B: 프로젝트 컨텍스트 — Project (8건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **PC-01** | test_pc01_project_yaml_load — project.yaml 로딩 성공 | name, tech_stack, constraints 존재 |
| **PC-02** | test_pc02_project_yaml_missing — project.yaml 미존재 → warning, 에러 아님 | 빈 dict 반환, exception 없음 |
| **PC-03** | test_pc03_context_injection — executor.start()에서 project.yaml → context["project"] 주입 | context["project"]["name"] == "bscamp" |
| **PC-04** | test_pc04_constraints_in_context — constraints 배열이 context에 포함 | context["project"]["constraints"] 비어있지 않음 |
| **PC-05** | test_pc05_project_agent_override — project agents/ 경로에 파일 존재 → 우선 사용 | --system-prompt-file 사용 |
| **PC-06** | test_pc06_no_project_agent_fallback — project agents/ 미존재 → 기본 .claude/agents/ 사용 | --agent {role} 사용 |
| **PC-07** | test_pc07_initial_context_priority — initial_context가 project.yaml보다 우선 | 병합 시 initial_context 우선 |
| **PC-08** | test_pc08_project_field_in_config — team config에 project 필드 전달 | adapter.__init__에서 self.project 설정 |

## 축 C: 에이전트 무장 — Arsenal (7건)

| ID | 테스트 | 검증 |
|----|--------|------|
| **AR-01** | test_ar01_cto_tools_frontmatter — cto-lead.md frontmatter에 tools 배열 존재 | YAML 파싱 → tools 키 |
| **AR-02** | test_ar02_cto_disallowed — cto-lead.md에 disallowedTools 존재 | "Bash(rm -rf*)" 포함 |
| **AR-03** | test_ar03_pm_no_bash — pm-lead.md disallowedTools에 Bash 포함 | "Bash" in disallowedTools |
| **AR-04** | test_ar04_qa_no_write — qa-monitor.md disallowedTools에 Write/Edit 포함 | "Write" in disallowedTools |
| **AR-05** | test_ar05_skills_dir_exists — .claude/skills/ 디렉토리에 3개 파일 존재 | pm-discovery, security-auditor, playwright-pro |
| **AR-06** | test_ar06_agent_frontmatter_valid — 모든 agent.md의 frontmatter 파싱 가능 | YAML 파싱 에러 없음 |
| **AR-07** | test_ar07_permission_mode_pm — pm-lead.md permissionMode == "plan" | frontmatter["permissionMode"] == "plan" |

## 축 간 접점 (5건)

| ID | 테스트 | 접점 | 검증 |
|----|--------|------|------|
| **XP-01** | test_xp01_reject_to_slack — reject → context 주입 → Slack 알림에 사유 포함 | A→A | 전체 흐름 E2E |
| **XP-02** | test_xp02_project_to_slack — project.yaml name → Slack [prefix] | B→A | 메시지에 "[bscamp]" |
| **XP-03** | test_xp03_project_agent_tools — project agent 오버라이드 + tools 제한 적용 | B→C | 프롬프트 파일에 disallowedTools |
| **XP-04** | test_xp04_reject_loop_rerun — reject → loop Link → 재작업 블록에 reject_reason | A→실행 | 재작업 프롬프트에 사유 |
| **XP-05** | test_xp05_integrated_preset — P1 통합 프리셋 → 파싱 + notifications.level 적용 | 전체 | level/project/role 전부 동작 |

---

# 불변식 (10건)

## 축 A: Feedback (3건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-A1** | reject_reason은 gate_result.metadata에서만 추출. 외부 주입 불가 | context["reject_reason"] 설정은 executor만 |
| **INV-A2** | 알림 기본 레벨 = basic. verbose는 명시 설정 필요 | level 미지정 → basic 동작 |
| **INV-A3** | BRICK_ENV=test → Slack 전송 0건. 엔진 동작에 영향 없음 | 테스트에서 httpx.post 미호출 |

## 축 B: Project Context (3건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-B1** | project.yaml 미존재 → 빈 context. 에러 아님 (warning 로그만) | exception 없음 |
| **INV-B2** | initial_context가 project.yaml보다 우선 (병합 시) | 동일 키 → initial_context 값 유지 |
| **INV-B3** | 프로젝트 agent 미존재 → 기본 .claude/agents/ 폴백 | --agent {role} 그대로 사용 |

## 축 C: Agent Arsenal (3건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-C1** | PM은 Bash 실행 불가 (disallowedTools) | pm-lead.md frontmatter 검증 |
| **INV-C2** | QA는 Write/Edit 불가 (읽기 전용) | qa-monitor.md frontmatter 검증 |
| **INV-C3** | frontmatter 파싱 실패 → agent 로딩은 정상 진행 (본문만 적용) | exception 없음 |

## 접점 (1건)

| ID | 불변식 | 검증 |
|----|--------|------|
| **INV-X1** | 축 간 연결은 context dict와 event.data로만. 모듈 직접 import 없음 | import 그래프에 축 간 순환 없음 |

---

# 엣지케이스

## 축 A: Feedback

| 케이스 | 동작 |
|--------|------|
| reject_reason 빈 문자열 | context에 주입 안 함 (빈 문자열 체크) |
| 연속 reject 3회 → max_retries 초과 | gate.on_fail 정책에 따라 workflow 실패 또는 escalate |
| approve 후 다시 완료 → reject_reason 잔존 | approve 시 context["reject_reason"] 제거 |
| Slack rate limit | 기존 처리 유지: httpx timeout 5초 + try/except → 스킵 |
| verbose 설정인데 이벤트 타입 오타 | subscribe 안 됨 → 해당 이벤트 무시 |

## 축 B: Project Context

| 케이스 | 동작 |
|--------|------|
| project.yaml 문법 오류 (잘못된 YAML) | yaml.safe_load → exception → warning 로그, 빈 context |
| project 이름에 `../` (path traversal) | 경로 정규화 후 `..` 포함 시 거부 |
| project.yaml에 constraints 키 없음 | constraints = [] (빈 배열) |
| 프리셋에 project 미지정 | project context 비어있음 → 기존 동작과 동일 |

## 축 C: Agent Arsenal

| 케이스 | 동작 |
|--------|------|
| Claude Code가 frontmatter tools 미지원 | 프롬프트 본문에 "사용 금지 도구" 텍스트로 소프트 제한 |
| disallowedTools에 없는 도구명 | 무시 (에러 아님) |
| .claude/skills/ 디렉토리 미존재 | 스킬 없이 진행 (에러 아님) |
| MCP 미설치 환경 | MCP 도구 호출 시 Claude Code가 "도구 없음" 처리 → 블록 정상 |

---

# 파일 목록 (13건)

## 수정 (7건)

| 파일 | 변경 |
|------|------|
| `brick/brick/engine/executor.py` | reject_reason context 주입 + _enrich_event_data() + _load_project_yaml() |
| `brick/brick/engine/slack_subscriber.py` | 반려사유 포맷 + verbose/basic + BRICK_ENV + prefix/suffix |
| `brick/brick/adapters/claude_local.py` | project 필드 + 프로젝트별 agent 경로 오버라이드 |
| `.claude/agents/cto-lead.md` | tools + disallowedTools + MCP 안내 frontmatter |
| `.claude/agents/pm-lead.md` | tools + permissionMode + disallowedTools frontmatter |
| `.claude/agents/qa-monitor.md` | tools + disallowedTools (Write/Edit 금지) frontmatter |
| `.claude/agents/report-generator.md` | tools frontmatter |

## 신규 (6건)

| 파일 | 용도 |
|------|------|
| `brick/projects/bscamp/project.yaml` | bscamp 프로젝트 설정 (tech_stack, constraints, agents) |
| `brick/projects/brick-engine/project.yaml` | brick-engine 프로젝트 설정 |
| `brick/projects/bscamp/agents/cto-lead.md` | bscamp 전용 CTO 프롬프트 (선택: 오버라이드 예시) |
| `.claude/skills/pm-discovery.md` | PM Discovery 체인 스킬 |
| `.claude/skills/security-auditor.md` | Security Auditor 스킬 |
| `.claude/skills/playwright-pro.md` | Playwright E2E 스킬 |

---

# 보안 고려사항

| 항목 | 위험 | 대응 |
|------|------|------|
| project 이름에 path traversal | 디렉토리 탈출 | `..` 포함 시 거부 |
| reject_reason에 프롬프트 주입 | 에이전트 조작 | reject_reason을 JSON 문자열로 이스케이프 |
| CTO가 disallowedTools 우회 | 위험 명령 실행 | Claude Code 네이티브 차단 (frontmatter) + 모니터링 |
| MCP 토큰 노출 | GitHub 접근 | .claude/settings.json에 토큰, Slack에 미노출 |
| 외부 스킬에 악의적 프롬프트 | 에이전트 행동 변조 | 검증된 3개만 사용, 내용 수동 검토 후 배치 |

---

# E2E 시나리오 워크스루

## 시나리오: Design 반려 → 재작업 → 승인

```
1. Smith님: "P1 운영 품질 Design 검토해라"
   → POST /engine/start (preset: t-pdca-l2, project: bscamp, feature: brick-p1)

2. executor.start():
   - project.yaml 로딩 → context["project"] = {name: "bscamp", constraints: [...]}
   - 첫 블록 plan 시작
   - Slack: "[bscamp] 블록 시작: *plan* — brick-p1"

3. plan 블록 완료 → design 블록 시작
   - claude_local: --agent pm-lead (project agent 없으면 기본)
   - 프롬프트에 context.project.constraints 포함
   - PM이 "DB는 SQLite" 자동 인지

4. design 완료 → review 블록 (human adapter)
   - Slack: "[bscamp] 검토 대기: *review*"
   - Smith님에게 알림

5. Smith님: "TDD 3건 누락" → POST /engine/complete-block (approval_action: reject, reject_reason: "TDD 3건 누락")

6. executor.complete_block():
   - approval Gate → reject → GateResult.metadata["reject_reason"] = "TDD 3건 누락"
   - context["reject_reason"] = "TDD 3건 누락"
   - context["reject_count"] = 1
   - gate_failed 이벤트 발행 (reject_reason 포함)
   - Slack: "[bscamp] :x: 반려: *review* 사유: TDD 3건 누락 재시도: 1/3"

7. loop Link 발동 → design 블록 재실행
   - claude_local: 프롬프트에 "⚠️ 이전 산출물이 반려됨. 사유: TDD 3건 누락" 포함
   - PM이 TDD 3건 추가 작성

8. design 재완료 → review 재실행 → approve
   - context["reject_reason"] 제거
   - Slack: "[bscamp] :white_check_mark: 블록 완료: *review*"

9. do 블록 시작 → CTO
   - claude_local: --agent cto-lead, tools/disallowedTools 적용
   - rm -rf 차단, GitHub MCP 사용 가능
```
