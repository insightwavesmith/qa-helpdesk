# Plan: 브릭 P1 — 운영 품질 (피드백 + 프로젝트 컨텍스트 + 에이전트 무장)

> **피처**: brick-p1-operations
> **레벨**: L2-기능
> **작성**: PM | 2026-04-04
> **TASK**: docs/tasks/TASK-brick-p1-operations.md
> **선행**: P0 4축 완성 (brick-p0-3axis-completion) 전제

---

## 1. 목적

P0이 끝나면: TASK 넣으면 문서 나오고, 역할 알고, 실패 보이고, 직원이 참여 가능.
P1은 **"돌아가긴 하는데 잘 돌아가게"**:

| 축 | 문제 | 한 줄 요약 |
|---|------|----------|
| **피드백 (Feedback)** | 반려했는데 "왜"가 안 전달됨 + Slack 알림 노이즈 | "반려 사유 전달 + 알림 정리" |
| **프로젝트 컨텍스트 (Project Context)** | 프로젝트마다 다른 규칙/인프라가 자동 주입 안 됨 | "project.yaml로 자동 주입" |
| **에이전트 무장 (Agent Arsenal)** | 에이전트에 도구 제한/스킬/MCP 없음 | "역할별 tools + 외부 스킬 + GitHub MCP" |

3축은 독립 — **병렬 구현 가능**. 축A는 내부 순차(반려사유 먼저 → 알림정리), 축B/C는 독립.

---

## 2. 범위

### 하는 것

| 축 | 항목 | 변경 |
|---|------|------|
| **Feedback** | reject_reason을 context에 주입 → 재작업 프롬프트에 포함 | `executor.py` complete_block |
| | Slack 알림에 반려 사유 포함 | `slack_subscriber.py` _format_message |
| | verbose/basic 알림 레벨 분리 | `slack_subscriber.py` + 프리셋 YAML |
| | 테스트 환경 Slack 격리 (BRICK_ENV) | `slack_subscriber.py` |
| | 알림에 프로젝트+feature 표기 | `slack_subscriber.py` _format_message |
| **Project Context** | project.yaml 설정 파일 | `brick/projects/{name}/project.yaml` 신규 |
| | executor가 project.yaml 읽어서 context 주입 | `executor.py` start() |
| | 프로젝트별 에이전트 프롬프트 오버라이드 | `claude_local.py` _build_args |
| **Agent Arsenal** | .claude/agents/ frontmatter에 tools/disallowedTools 추가 | 프롬프트 파일 수정 |
| | 외부 스킬 3개 선별 배치 | `.claude/skills/` 신규 |
| | GitHub MCP 연결 (CTO 전용) | 프리셋 YAML config.mcp |

### 안 하는 것

- DB 테이블 기반 프로젝트 관리 (project-layer Design의 DB 설계는 P2)
- 새 Gate/Link 타입 추가
- 기존 어댑터 수정 (claude_local만 확장)
- MCP 대량 연결 (GitHub만)
- SkyOffice UI / 오픈소스 패키징

---

## 3. 의존성 체인

```
축A: Feedback               축B: Project Context     축C: Agent Arsenal
┌──────────────────┐        ┌──────────────────┐    ┌──────────────────┐
│ A-1: reject_reason│        │ B-1: project.yaml│    │ C-1: tools/      │
│     context 주입  │        │     설정 파일    │    │   disallowedTools│
│ A-2: Slack 반려   │        │ B-2: executor    │    │   frontmatter    │
│     사유 포함     │        │     context 주입 │    │ C-2: 외부 스킬   │
│ A-3: verbose/basic│        │ B-3: 프로젝트별  │    │     3개 배치     │
│     알림 분리     │        │     agent 오버   │    │ C-3: GitHub MCP  │
│ A-4: BRICK_ENV    │        │     라이드       │    │     연결         │
│     테스트 격리   │        └──────────────────┘    └──────────────────┘
│ A-5: 프로젝트+    │
│     feature 표기  │
└──────────────────┘

축 간 접점:
  ① reject_reason → Slack 알림에 사유 포함 (A-1 → A-2)
  ② project.yaml → Slack 알림에 프로젝트명 포함 (B-2 → A-5)
  ③ project.yaml → 프로젝트별 agent 프롬프트 → tools 제한 적용 (B-3 → C-1)
```

### 축 내 의존 순서

**축 A (Feedback):**
```
A-1 reject_reason 주입 → A-2 Slack 반려사유 → A-3 verbose/basic → A-4 테스트 격리 → A-5 프로젝트 표기
```
- A-1이 핵심. A-2는 A-1 의존. A-3~A-5는 독립.

**축 B (Project Context):**
```
B-1 project.yaml → B-2 executor context 주입 → B-3 프로젝트별 agent 오버라이드
```
- B-1이 기반. B-2/B-3은 B-1에 의존.

**축 C (Agent Arsenal):**
```
C-1 tools/disallowedTools → C-2 외부 스킬 → C-3 GitHub MCP
```
- 각각 독립이지만 C-1이 가장 중요(보안).

---

## 4. 기존 자산 매핑

| 자산 | 위치 | 현황 | 활용 |
|------|------|------|------|
| `reject_reason` 필드 | `concrete.py:409,414` | ✅ approval Gate에서 `context.get("reject_reason")` 읽어 metadata에 포함 | A-1에서 context 주입 활용 |
| `_run_approval` | `concrete.py:382-461` | ✅ approve/reject/timeout/pending 4개 분기 | reject 시 reason 추출 포인트 |
| `SlackSubscriber` | `slack_subscriber.py:69-103` | ✅ 8개 이벤트 구독 (block.started/completed, workflow.completed, link.started/completed, adapter_failed, gate_failed, gate.pending) | A-2~A-5 확장 |
| `_format_message()` | `slack_subscriber.py:25-66` | ✅ 8개 이벤트별 메시지 포맷 | A-2/A-5 포맷 확장 |
| `executor.start()` | `executor.py:261-303` | ✅ `initial_context` → `instance.context["project"]` 주입 | B-2에서 project.yaml 로딩 주입 |
| `_execute_command()` | `executor.py:395-566` | ✅ `project_context` 필드로 context 전달 | B-2 context 확장 |
| `ClaudeLocalAdapter.__init__` | `claude_local.py:39-54` | ✅ `self.role = config.get("role", "")` | B-3/C-1에서 프로젝트별 role 오버라이드 |
| `_build_args()` | `claude_local.py:286-306` | ✅ `--agent {role}` 주입 + `--system-prompt-file` 폴백 | B-3에서 프로젝트별 agent 경로 |
| `.claude/agents/` | 8개 파일 존재 (protractor-expert, code-analyzer 등) | ✅ frontmatter: name, description, model | C-1에서 tools/disallowedTools 추가 |
| `EventBus` | `event_bus.py:11-38` | ✅ subscribe/publish + wildcard(*) 지원 | A-2에서 reject 이벤트 활용 |
| `WorkflowDefinition` | `workflow.py:89-100` | ✅ level, schema, extends, overrides 필드 | project 필드는 없음 — 프리셋 YAML에서 처리 |
| `LinkDefinition.notify` | `link.py:20` | ✅ `notify: dict` 필드 존재 | A-3에서 link 알림 제어 활용 가능 |
| `brick-project-layer.design.md` | `docs/02-design/features/` | ✅ TDD 34건 정의됨, DB 기반 설계 | B축 참고 (P1은 YAML만, DB는 P2) |

---

## 5. 아키텍처 결정

| # | 결정 | 대안 | 이유 |
|---|------|------|------|
| ADR-1 | reject_reason은 executor가 gate_result.metadata에서 추출 → context에 주입 | 블록 프롬프트에 직접 주입 | context 중심 아키텍처 일관 유지. 어댑터가 context에서 자동으로 읽음 |
| ADR-2 | 프로젝트 컨텍스트 = project.yaml (파일 기반) | DB 테이블 (project-layer Design) | P1에선 YAML 충분. DB 기반은 P2에서 |
| ADR-3 | Slack verbose/basic = 프리셋 YAML notifications.level | 환경변수 | 프리셋별 제어가 더 유연 |
| ADR-4 | 외부 스킬 3개만 (Discovery + Security + Playwright) | 전부(248개) / 없음 | 핵심만 선별. 노이즈 방지 |
| ADR-5 | MCP = GitHub만 (CTO 전용) | 전부(GitHub+PG+Sentry) / 없음 | CTO에게 가장 impact 큼 |
| ADR-6 | 프로젝트별 agent = brick/projects/{name}/agents/ 오버라이드 | DB 관리 | 파일 기반이 단순, YAML과 일관 |
| ADR-7 | BRICK_ENV=test → Slack 미발송 | 별도 mock 클래스 | 환경변수 하나로 제어. 기존 SlackSubscriber 코드 최소 변경 |

---

## 6. 구현 계획

### Phase A: 축A — 피드백 루프

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| A-1 | Gate reject 시 reject_reason을 context에 주입 | `executor.py` | complete_block() 내 gate_result.metadata에서 추출 |
| A-2 | Slack 알림에 반려 사유 포함 | `slack_subscriber.py` | block.gate_failed 메시지에 reject_reason 표시 |
| A-3 | verbose/basic 알림 레벨 분리 | `slack_subscriber.py` | `notifications_level` config. basic=시작/완료/실패/승인만 |
| A-4 | BRICK_ENV=test → Slack 미발송 | `slack_subscriber.py` | `__init__`에서 환경변수 체크 |
| A-5 | 알림에 프로젝트+feature 표기 | `slack_subscriber.py` | event.data에서 project/feature 읽어 prefix |

### Phase B: 축B — 프로젝트 컨텍스트

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| B-1 | project.yaml 설정 파일 생성 | `brick/projects/bscamp/project.yaml` 신규 | name, tech_stack, constraints, agents |
| B-2 | executor.start()에서 project.yaml 로딩 → context 주입 | `executor.py` | PresetLoader에서 project 필드 읽고 YAML 로딩 |
| B-3 | 프로젝트별 agent 프롬프트 오버라이드 | `claude_local.py` | project agents/ 경로 우선, 없으면 기본 .claude/agents/ |

### Phase C: 축C — 에이전트 무장

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| C-1 | agent 프롬프트 frontmatter에 tools/disallowedTools 추가 | `.claude/agents/*.md` | Claude Code 네이티브 frontmatter 지원 |
| C-2 | 외부 스킬 3개 배치 | `.claude/skills/` 신규 | PM Discovery, Security Auditor, Playwright Pro |
| C-3 | GitHub MCP 연결 (CTO 전용) | 프리셋 YAML + `.claude/settings.json` | CTO 블록에서만 활성화 |

### Phase D: 축 간 접점 + 통합

| # | 작업 | 접점 | 비고 |
|---|------|------|------|
| D-1 | reject_reason → Slack 알림 연결 | A-1→A-2 | gate_failed 메시지에 사유 포함 |
| D-2 | project.yaml → Slack 프로젝트명 | B-2→A-5 | context.project.name 표기 |
| D-3 | project.yaml → 프로젝트별 agent → tools 적용 | B-3→C-1 | 프로젝트 agent에 tools 제한 |

---

## 7. 변경 파일 요약

| 파일 | 유형 | 변경 |
|------|------|------|
| `brick/brick/engine/executor.py` | 수정 | reject_reason context 주입 + project.yaml 로딩 |
| `brick/brick/engine/slack_subscriber.py` | 수정 | 반려사유 + verbose/basic + BRICK_ENV + 프로젝트 표기 |
| `brick/brick/adapters/claude_local.py` | 수정 | 프로젝트별 agent 경로 오버라이드 |
| `.claude/agents/cto-lead.md` | 수정 | tools/disallowedTools frontmatter 추가 |
| `.claude/agents/pm-lead.md` | 수정 | tools/permissionMode frontmatter 추가 |
| `.claude/agents/qa-monitor.md` | 수정 | tools/disallowedTools frontmatter 추가 |
| `.claude/agents/report-generator.md` | 수정 | tools frontmatter 추가 |
| `brick/projects/bscamp/project.yaml` | **신규** | bscamp 프로젝트 설정 (tech_stack, constraints, agents) |
| `brick/projects/brick-engine/project.yaml` | **신규** | brick-engine 프로젝트 설정 |
| `brick/projects/bscamp/agents/cto-lead.md` | **신규** | bscamp 전용 CTO 프롬프트 |
| `.claude/skills/pm-discovery.md` | **신규** | PM Discovery 체인 스킬 |
| `.claude/skills/security-auditor.md` | **신규** | Security Auditor 스킬 |
| `.claude/skills/playwright-pro.md` | **신규** | Playwright E2E 스킬 |

총: 수정 7건 + 신규 6건 = **13건**

---

## 8. 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| Claude Code가 frontmatter tools/disallowedTools 미지원 | 축C C-1 무효 | 프롬프트 본문에 "사용 금지 도구" 텍스트로 명시 (소프트 제한) |
| project.yaml 미존재 시 executor 시작 실패 | 축B 전체 | 미존재 시 빈 context — warning만 (에러 아님) |
| GitHub MCP 미설치 환경에서 CTO 블록 실패 | 축C C-3 | MCP 미설치 → 경고 로그만, 블록은 정상 진행 |
| Slack 알림 verbose 설정 누락 시 기본값 혼동 | 축A A-3 | 기본값 = "basic" (안전한 쪽) |
| 외부 스킬이 Claude Code 버전 호환 안 될 수 있음 | 축C C-2 | 스킬 로딩 실패 → 경고만, 블록 정상 |

---

## 9. 완료 기준

- [ ] reject_reason이 context에 주입되고 재작업 블록 프롬프트에 포함
- [ ] Slack 알림에 반려 사유 표시
- [ ] verbose/basic 알림 레벨 분리 동작
- [ ] BRICK_ENV=test에서 Slack 미발송
- [ ] project.yaml → executor context 자동 주입
- [ ] 프로젝트별 agent 프롬프트 오버라이드 동작
- [ ] agent 프롬프트에 tools/disallowedTools 설정
- [ ] TDD 전건 PASS (Design에서 정의)
- [ ] 기존 578 테스트 regression 없음
