# 🧱 Brick Engine 사용 가이드

> AI 팀이 일하는 워크플로우 엔진. TASK 넣으면 자동으로 돌아간다.

---

## 브릭이 뭔가?

브릭은 3축으로 동작한다:

```
Block (뭘)  × Team (누가)  × Link (순서)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Plan 블록      PM (Claude)     순차
Design 블록    CTO (Claude)    분기
Do 블록        사람 (Smith)     병렬
QA 블록        Gemini          루프
Review 블록    ChatGPT         경쟁
```

- *Block*: 뭘 할 건지 (Plan, Design, Do, QA, Review...)
- *Team*: 누가 할 건지 (AI, 사람, 외부 API — 아무거나)
- *Link*: 어떤 순서로 할 건지 (순차, 분기, 병렬, 루프, 경쟁...)

이 3가지를 YAML로 조합하면 워크플로우가 된다.

---

## 빠른 시작 (5분)

### 1. 서버 시작

```bash
cd /Users/smith/projects/bscamp/brick
python3 -m uvicorn brick.dashboard.server:create_app --factory --port 3202
```

### 2. 헬스체크

```bash
curl http://localhost:3202/api/v1/engine/health
```

응답:
```json
{
  "status": "ok",
  "presets": 10,
  "active_workflows": 0
}
```

### 3. 프리셋 목록 확인

```bash
curl http://localhost:3202/api/v1/presets
```

10개 프리셋 중 선택:
| 프리셋 | 용도 |
|--------|------|
| `hotfix` | 긴급 수정 (Do만) |
| `t-pdca-l0` | 최소 (Plan→Do) |
| `t-pdca-l1` | 경량 (Plan→Do→QA) |
| `t-pdca-l2` | 표준 (Plan→Design→Do→QA) |
| `t-pdca-l2-approval` | 표준 + 승인 Gate |
| `t-pdca-l3` | 아키텍처 (전체 PDCA) |
| `do-codex-qa` | Design 있을 때 (Do→QA만) |
| `research` | 리서치 전용 |
| `design-dev-qa-approve` | Design→Do→QA→승인 |

### 4. 워크플로우 시작

```bash
curl -X POST http://localhost:3202/api/v1/engine/start \
  -H "Content-Type: application/json" \
  -d '{
    "preset_name": "hotfix",
    "feature": "my-first-task",
    "task": "버그 수정: 로그인 페이지 500 에러"
  }'
```

응답:
```json
{
  "workflow_id": "hotfix-my-first-task-1234567890",
  "status": "running"
}
```

### 5. 상태 확인

```bash
curl http://localhost:3202/api/v1/engine/status/hotfix-my-first-task-1234567890
```

---

## 프리셋 YAML 만들기

프리셋 = 워크플로우 레시피. `brick/presets/` 폴더에 YAML로 작성.

### 최소 예시

```yaml
# brick/presets/my-preset.yaml
name: my-preset
project: bscamp
feature: "{feature}"   # API 호출 시 치환됨

blocks:
  - id: plan
    what: "Plan 문서 작성"
  - id: do
    what: "구현"

links:
  - from: plan
    to: do
    type: sequential

teams:
  plan:
    adapter: claude_local
    config:
      role: pm-lead
      model: claude-opus-4-6
  do:
    adapter: claude_local
    config:
      role: cto-lead
      model: claude-opus-4-6
      dangerouslySkipPermissions: true
      env:
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: "1"
```

### Gate 추가 (품질 검증)

```yaml
blocks:
  - id: plan
    what: "Plan 문서 작성"
    done:
      artifacts:
        - "brick/projects/{project}/plans/{feature}.md"
    gate:
      handlers:
        - type: artifact    # 파일 있으면 pass
      on_fail: retry        # 없으면 재작성
      max_retries: 3
```

### 승인 Gate

```yaml
    gate:
      handlers:
        - type: approval
          approval:
            approver: "smith@bscamp.kr"
      on_fail: retry    # 반려 → 재작성
```

### Link 종류

| Link | 비유 | YAML |
|------|------|------|
| `sequential` | 줄 서기 | `type: sequential` |
| `branch` | 갈림길 | `type: branch` + `condition: "..."` |
| `loop` | 되돌아가기 | `type: loop` + `condition: "..."` |
| `parallel` | 동시 출발 | `type: parallel` |
| `compete` | 경쟁 입찰 | `type: compete` |
| `cron` | 알람 시계 | `type: cron` + `schedule: "0 9 * * *"` |
| `hook` | 이벤트 트리거 | `type: hook` |

### 어댑터 종류

| 어댑터 | 누가 | 설정 |
|--------|------|------|
| `claude_local` | Claude Code | `role`, `model`, `env` |
| `human` | 사람 | `assignee: "email"` |
| `webhook` | 외부 API | `url`, `auth_type`, `auth_value` |
| `claude_agent_teams` | Claude 팀 | tmux 기반 |
| `codex` | OpenAI Codex | (Phase 2) |

---

## 에이전트 프롬프트 설정

`.claude/agents/` 디렉토리에 역할별 프롬프트 파일:

```
.claude/agents/
├── cto-lead.md          # CTO — 구현 조율
├── pm-lead.md           # PM — 기획/설계
├── qa-monitor.md        # QA — 테스트 검증
└── report-generator.md  # 보고서 작성
```

frontmatter로 도구 제한:
```yaml
---
name: pm-lead
model: opus
permissionMode: plan
tools: [Read, Write, Grep, Glob]
disallowedTools: [Bash]    # PM은 명령어 실행 불가
---
```

---

## 프로젝트 설정

`brick/projects/{프로젝트명}/project.yaml`:

```yaml
name: bscamp
tech_stack: [Next.js, Cloud SQL, GCS]
constraints:
  - "DB는 SQLite (PostgreSQL 아님)"
  - "포트 3202는 브릭 전용"
agents:
  cto: cto-lead
  pm: pm-lead
```

블록 실행 시 이 규칙이 자동으로 에이전트한테 전달된다.

---

## API 레퍼런스

### 엔진

| 메서드 | 경로 | 권한 | 설명 |
|--------|------|------|------|
| GET | `/api/v1/engine/health` | 없음 | 헬스체크 |
| POST | `/api/v1/engine/start` | operator | 워크플로우 시작 |
| GET | `/api/v1/engine/status/{id}` | viewer | 상태 조회 |
| POST | `/api/v1/engine/complete-block` | operator | 블록 완료/승인/반려 |
| POST | `/api/v1/engine/suspend/{id}` | operator | 일시중지 |
| POST | `/api/v1/engine/resume/{id}` | operator | 재개 |
| POST | `/api/v1/engine/cancel/{id}` | operator | 취소 |
| POST | `/api/v1/engine/hook/{id}/{link}` | operator | Hook Link 트리거 |
| GET | `/api/v1/engine/human/tasks` | operator | 수동 블록 목록 |

### 인증

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/v1/auth/login` | 로컬 로그인 |
| POST | `/api/v1/auth/google` | Google Sign-In |
| POST | `/api/v1/auth/logout` | 로그아웃 |
| GET | `/api/v1/auth/me` | 현재 사용자 |
| POST | `/api/v1/auth/users` | 사용자 생성 (admin) |

### 리소스

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET/POST | `/api/v1/presets` | 프리셋 CRUD |
| GET/POST | `/api/v1/block-types` | 블록 타입 CRUD |
| GET/POST | `/api/v1/teams` | 팀 CRUD |

### RBAC 권한

```
viewer:   조회만 (GET)
operator: 실행 + 승인 (POST)
admin:    모든 것 + 사용자 관리
```

---

## 승인/반려 흐름

```
블록 완료 → approval Gate → Slack 알림 "검토해라"
→ 승인:
  curl -X POST /api/v1/engine/complete-block \
    -d '{"workflow_id":"...", "block_id":"review", "approval_action":"approve"}'
→ 반려:
  curl -X POST /api/v1/engine/complete-block \
    -d '{"workflow_id":"...", "block_id":"review", "approval_action":"reject", "reject_reason":"TDD 누락"}'
→ 반려 시 → 이전 블록으로 되돌아감 (loop Link)
→ 에이전트에게 "⚠️ 반려 사유: TDD 누락" 자동 전달
```

---

## Slack 알림

`SLACK_BOT_TOKEN` 환경변수 설정 시 agent-ops 채널에 자동 알림:

```
기본(basic): 워크플로우 완료, 블록 실패, Gate 실패, 승인 대기
상세(verbose): + 블록 시작/완료, 링크 이동
```

실패 시 stderr 마지막 10줄 + exit code 표시. 토큰/시크릿 자동 마스킹.

---

## 문서 산출물 강제

`artifact` Gate를 설정하면 블록이 끝날 때 파일이 있어야 통과:

```yaml
gate:
  handlers:
    - type: artifact
      command: "brick/projects/{project}/plans/{feature}.md"
  on_fail: retry
```

파일 없으면 → Gate fail → 블록 재실행 (최대 3회)
파일 있으면 → Gate pass → 다음 블록으로

---

## 보안

- path traversal 방어: `..` 또는 절대경로 자동 차단
- 토큰 마스킹: `xoxb-*`, `sk-*`, `Bearer`, `TOKEN=` 패턴
- RBAC: API 권한 3단계 (viewer/operator/admin)
- 세션: SHA-256 해시, 7일 만료
- Google Sign-In: aud 검증

---

## 파일 구조

```
brick/
├── brick/              # 엔진 코어 (Python)
│   ├── engine/         # 상태머신, executor, EventBus
│   ├── gates/          # Gate 8종
│   ├── adapters/       # 어댑터 10종
│   ├── models/         # 데이터 모델
│   ├── auth/           # 인증 (Google, RBAC, 세션)
│   └── dashboard/      # FastAPI 서버 + 라우트
├── presets/            # 프리셋 YAML 10개
├── projects/           # 프로젝트별 산출물
│   ├── bscamp/
│   └── brick-engine/
├── templates/          # 문서 템플릿 5개
└── docs/               # 문서
    ├── GUIDE.md        # ← 이 파일
    ├── TASK-ROADMAP.md
    └── QA-brick-full.md

.claude/agents/         # 에이전트 프롬프트
.claude/skills/         # 스킬 (PM Discovery, Security 등)
```

---

## 다음 단계 (P2)

- 🔧 플러그인 레지스트리: 커스텀 Gate/Link/어댑터 `pip install`
- 🏢 SkyOffice UI: 에이전트가 일하는 걸 실시간으로 보는 메타버스
- 🔄 하네스 교체: Gas Town, Multiclaude 등 다른 오케스트레이터 연결
- 🌐 오픈소스: `pip install brick-engine`
