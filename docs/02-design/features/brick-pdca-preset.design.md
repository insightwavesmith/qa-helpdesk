# Design: Brick PDCA 기본 프리셋 구조

> 작성일: 2026-04-03
> 작성자: PM
> 레벨: L2-기능
> 선행: brick-dashboard.design.md (원본 설계), brick-backend-api.design.md (API), harness-patterns.md (HP-001~006)
> Smith님 결정: PDCA 체인을 Brick 3축(Block/Team/Link)으로 이전. 각 축 독립 관리 → 조합.

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | 현행 hook 기반 PDCA 체인을 Brick Preset YAML로 선언적 전환 |
| **핵심 변경** | 3축 독립 설계 (Block 6개 + Team 4개 + Link 7개) + Gate 5종 + 하네스 패턴 3종 |
| **하네스 패턴** | HP-001(판단 로그), HP-002(깊이 제한), HP-003(역할별 도구 세트) |
| **TDD** | BP-001 ~ BP-035 (35건) |

| 관점 | 내용 |
|------|------|
| **Problem** | PDCA 체인이 hook 스크립트 30+개에 분산 — 흐름 파악/수정 어려움 |
| **Solution** | 단일 YAML 프리셋에 블록/팀/링크/게이트 선언 → Brick Engine이 실행 |
| **Function UX** | Dashboard에서 PDCA 흐름 시각화 + 블록별 상태 실시간 모니터링 |
| **Core Value** | "제어+자율성" — Gate가 제어, 팀 자율 실행이 자율성 |

---

## 1. 설계 원칙

### 1.1 3축 독립 + 조합

```
Block (무엇을)     ─── 독립 정의 → brick_block_types 테이블
Team  (누가)       ─── 독립 정의 → brick_teams 테이블
Link  (어떤 순서로) ─── 독립 정의 → brick_links 테이블

Preset = Block[] + Team{} + Link[] + Gate{} 조합
```

**왜 독립인가**: Block "plan"은 여러 Preset에서 재사용. Team "pm-team"은 PDCA뿐 아니라 다른 프리셋에서도 배정 가능. Link 타입 "sequential"은 범용. 조합만 바뀜.

### 1.2 하네스 패턴 적용 매핑

| 패턴 | 원본 | Brick 적용 | 적용 위치 |
|------|------|-----------|----------|
| **HP-001** ThinkTool | AI 사고 로그 | `think_log_required: true` — Plan/Design 블록 | Block config |
| **HP-002** 재귀 차단 | Agent가 Agent 부름 방지 | `max_depth: 1` — 팀 깊이 제한 | Team adapter_config |
| **HP-003** 읽기 전용 설계자 | FS_EXPLORATION_TOOLS만 | `permitted_tools` — 역할별 도구 세트 | Team adapter_config |
| **HP-004** 도구=권한 | 목록에서 제거 | permitted_tools 미포함 = 존재조차 모름 | Team adapter_config |

---

## 2. PDCA 프리셋 YAML 전체 구조

```yaml
# .bkit/presets/t-pdca-l2.yaml
kind: Preset
name: t-pdca-l2
labels:
  level: l2
  type: standard
  phase: pdca
spec:

  # ── 블록 정의 (6개) ──
  blocks:
    - id: plan
      type: plan
      what: "기능 계획 수립 + 옵션 비교"
      done:
        artifacts:
          - "docs/01-plan/features/{feature}.plan.md"
      config:
        think_log_required: true     # HP-001: 판단 로그 강제

    - id: design
      type: design
      what: "상세 설계 + TDD 케이스 작성"
      done:
        artifacts:
          - "docs/02-design/features/{feature}.design.md"
      config:
        think_log_required: true     # HP-001: 판단 로그 강제

    - id: do
      type: implement
      what: "설계 기반 구현 + 테스트"
      done:
        artifacts:
          - "src/**/*.ts"
          - "__tests__/**/*.test.ts"
      config:
        think_log_required: false

    - id: check
      type: test
      what: "Gap 분석 (설계 vs 구현)"
      done:
        artifacts:
          - "docs/03-analysis/features/{feature}.gap.md"
      config:
        min_match_rate: 90           # Match Rate 90% 이상

    - id: review
      type: review
      what: "산출물 검토 + 승인"
      done:
        artifacts: []
      config:
        reviewers: ["smith"]
        required_approvals: 1

    - id: learn
      type: custom
      what: "회고 + 교훈 기록"
      done:
        artifacts:
          - "docs/04-report/features/{feature}.report.md"
      config:
        think_log_required: false

  # ── 링크 정의 (7개) ──
  links:
    - from: plan
      to: design
      type: sequential

    - from: design
      to: do
      type: sequential

    - from: do
      to: check
      type: sequential

    - from: check
      to: do
      type: loop
      condition: "match_rate < 90"   # 90% 미달 시 Do로 회귀

    - from: check
      to: review
      type: branch
      condition: "match_rate >= 90"  # 90% 이상 시 Review로 진행

    - from: review
      to: do
      type: loop
      condition: "review_status == 'changes_requested'"  # 변경 요청 시 Do로 회귀

    - from: review
      to: learn
      type: branch
      condition: "review_status == 'approved'"  # 승인 시 Learn으로

  # ── 팀 배정 ──
  teams:
    plan: pm-team
    design: pm-team
    do: cto-team
    check: cto-team       # Gap 분석은 CTO가 실행
    review: null           # human (Smith님 직접)
    learn: coo-team

  # ── 게이트 정의 ──
  gates:
    plan:
      - type: command
        command: "test -f docs/01-plan/features/{feature}.plan.md"
        description: "Plan 문서 존재 확인"
      - type: prompt
        prompt: "Plan 문서에 think_log(판단 근거)가 포함되어 있는가? 옵션이 2개 이상인가?"
        threshold: 0.8
        description: "판단 로그 + 옵션 2개 이상"

    design:
      - type: command
        command: "test -f docs/02-design/features/{feature}.design.md"
        description: "Design 문서 존재 확인"
      - type: prompt
        prompt: "Design TDD 섹션이 모든 동작을 1:1 커버하는가? Gap 0%인가?"
        threshold: 0.85
        description: "TDD Gap 0%"

    do:
      - type: command
        command: "npx tsc --noEmit --quiet"
        description: "TypeScript 컴파일 통과"
      - type: command
        command: "npm run build"
        description: "빌드 성공"
      - type: command
        command: "npx vitest run --reporter=json"
        description: "테스트 전체 통과"

    check:
      - type: http
        url: "http://localhost:3001/api/brick/gates/{execution_id}/gap-result"
        method: GET
        match: "match_rate >= 90"
        description: "Match Rate 90% 이상"

    review:
      - type: review
        required_approvals: 1
        description: "Smith님 승인"

    learn:
      - type: command
        command: "test -f docs/04-report/features/{feature}.report.md"
        description: "회고 문서 존재 확인"

  # ── 이벤트 핸들러 ──
  events:
    on_block_failed:
      - type: notify
        channel: slack
        message: "[{feature}] {block_id} 블록 실패: {error}"
    on_gate_failed:
      - type: notify
        channel: slack
        message: "[{feature}] {block_id} Gate 실패: {gate_description}"
    on_complete:
      - type: notify
        channel: slack
        message: "[{feature}] PDCA 사이클 완료. Match Rate: {match_rate}%"

readonly: true    # Core 프리셋 — 수정 불가, Remix(복제)만 가능
```

---

## 3. 역할별 도구 세트 (HP-003 + HP-004)

### 3.1 설계 원칙

> "도구가 곧 권한이다" (HP-004) — hook으로 차단하는 게 아니라, 도구 목록에서 제거.

```
차단 방식 (현행):  AI가 Write 시도 → hook 검사 → 거부 → 재시도 (토큰 낭비)
제거 방식 (목표):  AI가 Write 존재를 모름 → 시도 자체 불가 (비용 0)
```

### 3.2 역할별 도구 매핑

| 역할 | 블록 | permitted_tools | 금지 도구 | 근거 |
|------|------|----------------|----------|------|
| **Plan/Design** | plan, design | `Read, Glob, Grep, Think, WebSearch, WebFetch` | Write, Edit, Bash(위험), Agent | HP-003: 읽기 전용 설계자 |
| **Do** (구현) | do | `Read, Glob, Grep, Write, Edit, Bash, Agent, Think` | — (전부 가능) | 구현자는 제한 없음 |
| **Check** (검증) | check | `Read, Glob, Grep, Think, Bash(읽기)` | Write, Edit, Agent | 검증자는 코드 수정 불가 |
| **Review** | review | `Read, Glob, Grep, Think` | Write, Edit, Bash, Agent | 검토만, 수정 안 함 |
| **Learn** (회고) | learn | `Read, Glob, Grep, Write, Think` | Edit, Bash(위험), Agent | 새 파일 작성만, 기존 수정 금지 |

### 3.3 Team YAML 반영

```yaml
# .bkit/teams/pm-team.yaml
kind: Team
name: pm-team
labels:
  role: planning
spec:
  display_name: "기획팀"
  adapter: claude_agent_teams
  adapter_config:
    session: sdk-pm
    role: PM_LEADER
    max_depth: 1                    # HP-002: 팀원이 팀원을 만들 수 없음
    permitted_tools:                # HP-003: 읽기 전용
      - Read
      - Glob
      - Grep
      - Think                       # HP-001: 사고 로그
      - WebSearch
      - WebFetch
    # Write, Edit, Bash, Agent 없음 → AI가 존재조차 모름

# .bkit/teams/cto-team.yaml
kind: Team
name: cto-team
labels:
  role: implementation
spec:
  display_name: "개발팀"
  adapter: claude_agent_teams
  adapter_config:
    session: sdk-cto
    role: CTO_LEADER
    max_depth: 2                    # HP-002: 리더→팀원(1)→서브에이전트(2)까지만
    permitted_tools:                # Do 역할: 전부 가능
      - Read
      - Glob
      - Grep
      - Write
      - Edit
      - Bash
      - Agent
      - Think
  members:
    - name: cto-leader
      role: leader
      model: opus
    - name: frontend-dev
      role: developer
      model: opus
    - name: backend-dev
      role: developer
      model: opus

# .bkit/teams/coo-team.yaml
kind: Team
name: coo-team
labels:
  role: reporting
spec:
  display_name: "운영팀"
  adapter: claude_agent_teams
  adapter_config:
    session: mozzi
    role: COO
    max_depth: 1
    permitted_tools:
      - Read
      - Glob
      - Grep
      - Write                       # 보고서 작성용
      - Think
```

### 3.4 블록별 도구 오버라이드

Preset에서 블록별로 팀의 기본 도구를 오버라이드할 수 있음:

```yaml
# t-pdca-l2.yaml 내 teams 섹션 확장
teams:
  plan: pm-team                     # pm-team 기본 도구 사용
  design: pm-team                   # pm-team 기본 도구 사용
  do:
    team: cto-team
    override:
      permitted_tools:              # Do 블록에서만 전체 허용
        - Read
        - Glob
        - Grep
        - Write
        - Edit
        - Bash
        - Agent
        - Think
  check:
    team: cto-team
    override:
      permitted_tools:              # Check 블록에서는 읽기만
        - Read
        - Glob
        - Grep
        - Think
        - Bash                      # 읽기 전용 Bash (vitest run 등)
  review: null                      # human
  learn: coo-team
```

---

## 4. 판단 로그 강제 (HP-001)

### 4.1 ThinkTool 연동

```
Block config: think_log_required = true
    │
    ▼
Engine: 블록 실행 전 Think 도구 호출 주입
    │
    ▼
AI: Think 호출 → thought 파라미터에 판단 근거 기록
    │
    ▼
Gate: prompt gate가 think_log 존재 + 품질 검증
```

### 4.2 think_log 저장

```typescript
// Engine이 블록 실행 로그에 think_log 자동 수집
interface ThinkLog {
  blockId: string;
  executionId: number;
  thought: string;          // AI의 판단 근거
  timestamp: string;
  options_considered: number; // 고려한 옵션 수
}

// brick_execution_logs 테이블에 eventType='think_log'로 저장
// Gate에서 조회: SELECT COUNT(*) FROM brick_execution_logs
//   WHERE execution_id=? AND block_id=? AND event_type='think_log'
```

### 4.3 Plan Gate 검증 로직

```
Plan Gate 1: command — plan.md 파일 존재
Plan Gate 2: prompt — think_log 검증
  ├─ think_log가 1건 이상 존재하는가?
  ├─ 옵션이 2개 이상 비교되었는가?
  └─ 선택 근거가 명시되어 있는가?
  → threshold 0.8 이상이면 pass
```

---

## 5. 팀 깊이 제한 (HP-002)

### 5.1 max_depth 설계

```
depth 0: Leader (리더)
depth 1: Teammate (팀원) — 리더가 직접 생성
depth 2: Sub-agent (서브에이전트) — 팀원이 Explore 등으로 생성

max_depth=1: 리더→팀원만 허용 (서브에이전트 금지)
max_depth=2: 리더→팀원→서브에이전트까지 허용
```

### 5.2 역할별 깊이

| 팀 | max_depth | 이유 |
|----|-----------|------|
| pm-team | 1 | 설계자는 서브에이전트 불필요. 읽기 도구만 사용 |
| cto-team | 2 | 구현 시 Explore 서브에이전트 필요 (코드 탐색) |
| coo-team | 1 | 보고서 작성에 서브에이전트 불필요 |

### 5.3 Engine 적용

```typescript
// Engine이 TeamCreate 전에 depth 체크
function validateTeamDepth(currentDepth: number, maxDepth: number): boolean {
  if (currentDepth >= maxDepth) {
    // Agent 도구를 permitted_tools에서 자동 제거
    return false;
  }
  return true;
}
```

---

## 6. Gate 조건 상세

### 6.1 Gate 타입 × 블록 매핑

| 블록 | Gate 1 | Gate 2 | Gate 3 | 통과 조건 |
|------|--------|--------|--------|----------|
| **plan** | command: plan.md 존재 | prompt: think_log + 옵션 2개+ | — | 2/2 pass |
| **design** | command: design.md 존재 | prompt: TDD Gap 0% | — | 2/2 pass |
| **do** | command: tsc --noEmit | command: npm run build | command: vitest run | 3/3 pass |
| **check** | http: match_rate >= 90 | — | — | 1/1 pass |
| **review** | review: human approval | — | — | 1/1 pass |
| **learn** | command: report.md 존재 | — | — | 1/1 pass |

### 6.2 Gate 실패 시 흐름

```
Gate 실패
  ├─ auto gate (command/http/prompt) 실패
  │   → 이벤트: on_gate_failed → Slack 알림
  │   → 블록 status = 'failed'
  │   → Link 조건에 따라 이전 블록으로 회귀 또는 대기
  │
  └─ review gate 실패 (changes_requested)
      → 이벤트: on_gate_failed
      → review→do 루프 Link 활성화
      → reject_reason이 do 블록 context에 주입
```

### 6.3 Check→Do 루프 상세

```
check 블록 완료
  │
  ├─ match_rate < 90 → check→do Loop Link 활성화
  │   └─ do 블록 재실행 (context에 gap_items[] 주입)
  │       └─ do 완료 → check 재실행 → 반복 (최대 5회)
  │
  └─ match_rate >= 90 → check→review Branch Link 활성화
      └─ review 블록 시작
```

**최대 반복 횟수**: Loop Link에 `max_iterations: 5` 설정. 5회 초과 시 강제 escalate → Smith님 알림.

---

## 7. 레벨별 프리셋 변형

### 7.1 프리셋 파생 구조

```
t-pdca-l2.yaml (기본, Core, readonly)
  ├── t-pdca-l1.yaml  — Design+Do+Check만 (Plan 스킵)
  ├── t-pdca-l3.yaml  — L2 + ADR 블록 + 보안 감사 블록 추가
  └── t-pdca-l0.yaml  — Do+Check만 (긴급 핫픽스)
```

### 7.2 레벨별 차이

| 레벨 | 블록 | Gate 강도 | Match Rate |
|------|------|----------|-----------|
| **L0** (응급) | do → check | tsc+build만 | 없음 |
| **L1** (경량) | design → do → check | tsc+build+vitest | 없음 |
| **L2** (표준) | plan → design → do → check → review → learn | 전체 | 90%+ |
| **L3** (풀) | L2 + adr + security_audit | 전체 + 보안 감사 | 95%+ |

### 7.3 L3 추가 블록

```yaml
# t-pdca-l3.yaml 추가 블록
blocks:
  # ... L2 블록 전부 포함 +
  - id: adr
    type: design
    what: "Architecture Decision Record 작성"
    done:
      artifacts:
        - "docs/adr/ADR-{number}-{feature}.md"
    config:
      think_log_required: true

  - id: security_audit
    type: test
    what: "보안 감사 (OWASP Top 10)"
    done:
      artifacts:
        - "docs/03-analysis/features/{feature}.security.md"

# 추가 링크
links:
  # ... L2 링크 +
  - from: plan
    to: adr
    type: sequential
  - from: adr
    to: design
    type: sequential
  - from: check
    to: security_audit
    type: sequential
    condition: "match_rate >= 95"
  - from: security_audit
    to: review
    type: sequential
```

---

## 8. 캔버스 시각화

### 8.1 PDCA 프리셋 캔버스 레이아웃

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ┌──────┐    ┌──────┐    ┌──────┐    ┌──────┐            │
│   │ Plan │──→│Design│──→│  Do  │──→│Check │            │
│   │ 📋   │    │ 🎨   │    │ ⚙️   │    │ 🧪   │            │
│   │pm-team│   │pm-team│   │cto   │   │cto   │            │
│   │Gate:2│    │Gate:2│    │Gate:3│    │Gate:1│            │
│   └──────┘    └──────┘    └──┬───┘    └──┬───┘            │
│                              │           │                 │
│                              │     ┌─────┘                 │
│                              │     │  ↺ loop               │
│                              │     │  (match_rate<90)      │
│                              ◄─────┘                       │
│                                    │                       │
│                                    │ branch                │
│                                    │ (match_rate>=90)      │
│                                    ▼                       │
│                              ┌──────┐    ┌──────┐         │
│                              │Review│──→│Learn │         │
│                              │ 👀   │    │ 🔧   │         │
│                              │human │    │coo   │         │
│                              │Gate:1│    │Gate:1│         │
│                              └──┬───┘    └──────┘         │
│                                 │                          │
│                                 │ ↺ loop                   │
│                                 │ (changes_requested)      │
│                                 ▼                          │
│                              ┌──────┐                      │
│                              │  Do  │ (재실행)              │
│                              └──────┘                      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 8.2 블록 상태 표현

| 상태 | 테두리 색 | 아이콘 | Gate 표시 |
|------|----------|--------|----------|
| idle | #D1D5DB (회색) | ○ | Gate 아이콘 회색 |
| running | #3B82F6 (파랑) | ◉ 회전 | 현재 실행 중인 Gate 하이라이트 |
| done + all gates pass | #10B981 (초록) | ✓ | 모든 Gate ● 초록 |
| done + gate failed | #EF4444 (빨강) | ✕ | 실패 Gate ● 빨강 |
| loop (재실행 대기) | #F59E0B (주황) | ↺ | 이전 Gate 결과 유지 |

---

## 9. DB 스키마 영향

### 9.1 기존 테이블 활용

이 프리셋은 `brick-backend-api.design.md`의 기존 스키마를 그대로 사용:

| 테이블 | 용도 |
|--------|------|
| `brick_block_types` | plan/design/implement/test/review/custom 타입 |
| `brick_teams` | pm-team/cto-team/coo-team |
| `brick_links` | 7개 Link 인스턴스 |
| `brick_presets` | t-pdca-l2 프리셋 YAML |
| `brick_executions` | 실행 인스턴스 |
| `brick_execution_logs` | think_log, gate 결과 등 |
| `brick_gate_results` | Gate 판정 결과 |

### 9.2 추가 필요 컬럼/데이터

```typescript
// brick_block_types 추가 config 필드 (JSON 내부)
interface BlockTypeConfig {
  // 기존 필드 ...
  think_log_required?: boolean;    // HP-001: 판단 로그 강제
  min_match_rate?: number;         // Check 블록용
}

// brick_teams adapter_config 추가 필드 (JSON 내부)
interface AdapterConfig {
  // 기존 필드 ...
  max_depth?: number;              // HP-002: 팀 깊이 제한
  permitted_tools?: string[];      // HP-003: 역할별 도구 세트
}

// brick_links 추가 활용
// condition 필드: "match_rate < 90", "review_status == 'approved'" 등
// Loop Link: max_iterations은 condition과 함께 저장
```

### 9.3 시딩 데이터

```typescript
// dashboard/server/db/seed-brick.ts 추가

// PDCA 전용 팀 3개
const PDCA_TEAMS = [
  {
    name: 'pm-team', displayName: '기획팀',
    adapter: 'claude_agent_teams',
    adapterConfig: { session: 'sdk-pm', role: 'PM_LEADER', max_depth: 1,
      permitted_tools: ['Read','Glob','Grep','Think','WebSearch','WebFetch'] },
  },
  {
    name: 'cto-team', displayName: '개발팀',
    adapter: 'claude_agent_teams',
    adapterConfig: { session: 'sdk-cto', role: 'CTO_LEADER', max_depth: 2,
      permitted_tools: ['Read','Glob','Grep','Write','Edit','Bash','Agent','Think'] },
  },
  {
    name: 'coo-team', displayName: '운영팀',
    adapter: 'claude_agent_teams',
    adapterConfig: { session: 'mozzi', role: 'COO', max_depth: 1,
      permitted_tools: ['Read','Glob','Grep','Write','Think'] },
  },
];

// Core 프리셋: t-pdca-l0, t-pdca-l1, t-pdca-l2, t-pdca-l3
// §2 YAML을 그대로 저장. isCore=true.
```

---

## 10. 현행 hook → Brick 전환 매핑

### 10.1 대체 관계

| 현행 hook | Brick 대체 | 비고 |
|-----------|-----------|------|
| `validate-plan.sh` | Plan 블록 Gate 1 (command: plan.md 존재) | 동일 검증 |
| `validate-design.sh` | Design 블록 Gate 1 (command: design.md 존재) | 동일 검증 |
| `validate-delegate.sh` | HP-003 permitted_tools (Write/Edit 제거) | 더 근본적 |
| `enforce-teamcreate.sh` | Team adapter가 자동 처리 | Engine이 팀 생성 |
| `pdca-chain-handoff.sh` | Link sequential + Gate | 선언적 전환 |
| `detect-process-level.sh` | 프리셋 선택 (L0/L1/L2/L3) | CLI 선택 |
| `filter-completion-dm.sh` | events.on_complete | 이벤트 기반 |
| `route-to-coo.sh` | review 블록 (human) + learn 블록 (coo-team) | 구조적 보장 |

### 10.2 공존 전략

Brick 완성까지 hook과 공존:

```
Phase 1 (현재): hook만 운영
Phase 2 (Brick MVP): hook + Brick 병렬 (Brick은 읽기 전용 시각화)
Phase 3 (전환): Brick이 실행 주도, hook은 안전망(fallback)
Phase 4 (완전 전환): hook 비활성화, Brick 단독
```

---

## 11. TDD 케이스

### 프리셋 구조 검증

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BP-001 | t-pdca-l2 프리셋 YAML 파싱 성공 | §2 | blocks 6개, links 7개, teams 6배정, gates 6블록 |
| BP-002 | blocks에 plan/design/do/check/review/learn 6개 존재 | §2 | id 목록 일치 |
| BP-003 | links DAG 순환 없음 (loop Link 제외) | §2 | DAG 검증 통과 |
| BP-004 | loop Link에 condition 필수 | §2 | check→do, review→do 조건 존재 |
| BP-005 | branch Link에 condition 필수 | §2 | check→review, review→learn 조건 존재 |
| BP-006 | 모든 블록에 teams 배정 존재 (review=null 허용) | §2 | INV-5 통과 |
| BP-007 | readonly=true → 수정 시도 시 403 | §2 | Core 프리셋 보호 |

### 역할별 도구 세트 (HP-003)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BP-008 | pm-team permitted_tools에 Write 없음 | §3.2 | Read/Glob/Grep/Think/WebSearch/WebFetch만 |
| BP-009 | pm-team permitted_tools에 Edit 없음 | §3.2 | HP-003 준수 |
| BP-010 | pm-team permitted_tools에 Bash 없음 | §3.2 | HP-003 준수 |
| BP-011 | cto-team permitted_tools에 Write/Edit/Bash/Agent 포함 | §3.2 | Do 역할 전체 허용 |
| BP-012 | coo-team permitted_tools에 Write 포함, Edit 없음 | §3.2 | 새 파일만, 기존 수정 불가 |
| BP-013 | check 블록 override — Write/Edit 없음 | §3.4 | cto-team이지만 Check에서는 읽기만 |
| BP-014 | do 블록 override — 전체 도구 허용 | §3.4 | 오버라이드 정상 |

### 판단 로그 강제 (HP-001)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BP-015 | plan 블록 config.think_log_required = true | §4.1 | 설정값 확인 |
| BP-016 | design 블록 config.think_log_required = true | §4.1 | 설정값 확인 |
| BP-017 | do 블록 config.think_log_required = false | §4.1 | 구현자는 강제 안 함 |
| BP-018 | think_log 이벤트가 execution_logs에 기록됨 | §4.2 | eventType='think_log' |
| BP-019 | Plan Gate prompt가 think_log 존재 + 옵션 2개 검증 | §4.3 | threshold 0.8 |

### 팀 깊이 제한 (HP-002)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BP-020 | pm-team max_depth=1 | §5.2 | 설정값 확인 |
| BP-021 | cto-team max_depth=2 | §5.2 | 설정값 확인 |
| BP-022 | depth >= max_depth 시 Agent 도구 자동 제거 | §5.3 | permitted_tools에서 Agent 빠짐 |

### Gate 조건

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BP-023 | Plan Gate: plan.md 존재 + prompt pass → 블록 pass | §6.1 | 2/2 |
| BP-024 | Plan Gate: plan.md 미존재 → 블록 fail | §6.1 | command gate fail |
| BP-025 | Design Gate: TDD Gap prompt fail → 블록 fail | §6.1 | threshold 미달 |
| BP-026 | Do Gate: tsc fail → 블록 fail | §6.1 | command exit code ≠ 0 |
| BP-027 | Do Gate: tsc+build pass, vitest fail → 블록 fail | §6.1 | 3/3 아닌 2/3 |
| BP-028 | Check Gate: match_rate=85 → fail → check→do loop | §6.3 | Loop Link 활성화 |
| BP-029 | Check Gate: match_rate=92 → pass → check→review branch | §6.3 | Branch Link 활성화 |
| BP-030 | Review Gate: approved → review→learn branch | §6.2 | Branch Link 활성화 |
| BP-031 | Review Gate: changes_requested → review→do loop | §6.2 | Loop Link 활성화 |
| BP-032 | Learn Gate: report.md 존재 → pass → 사이클 완료 | §6.1 | on_complete 이벤트 |

### 레벨 변형

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BP-033 | t-pdca-l0 블록 2개 (do, check) | §7.2 | blocks.length=2 |
| BP-034 | t-pdca-l3 블록 8개 (L2 + adr + security_audit) | §7.3 | blocks.length=8 |
| BP-035 | t-pdca-l3 match_rate 95%+ (L2보다 높음) | §7.2 | Gate threshold 95 |

### TDD 매핑 요약

| Design 섹션 | TDD 범위 | 케이스 수 |
|------------|---------|----------|
| §2 프리셋 구조 | BP-001~07 | 7 |
| §3 역할별 도구 | BP-008~14 | 7 |
| §4 판단 로그 | BP-015~19 | 5 |
| §5 팀 깊이 제한 | BP-020~22 | 3 |
| §6 Gate 조건 | BP-023~32 | 10 |
| §7 레벨 변형 | BP-033~35 | 3 |
| **합계** | | **35** |

**Gap 0%**: 모든 하네스 패턴, Gate 조건, 레벨 변형에 대응 TDD 존재.

---

## 12. 파일 구조

```
.bkit/
├── presets/
│   ├── t-pdca-l0.yaml              # (신규) L0 응급 프리셋
│   ├── t-pdca-l1.yaml              # (신규) L1 경량 프리셋
│   ├── t-pdca-l2.yaml              # (신규) L2 표준 프리셋 (Core)
│   └── t-pdca-l3.yaml              # (신규) L3 풀 프리셋 (Core)
├── teams/
│   ├── pm-team.yaml                # (신규) 기획팀 정의
│   ├── cto-team.yaml               # (신규) 개발팀 정의
│   └── coo-team.yaml               # (신규) 운영팀 정의
└── presets/.layout/
    ├── t-pdca-l2.json              # (신규) 캔버스 레이아웃
    └── t-pdca-l3.json              # (신규) 캔버스 레이아웃

dashboard/
├── server/db/seed-brick.ts         # (수정) PDCA 팀 3개 + 프리셋 4개 시딩
└── __tests__/brick/
    └── pdca-preset.test.ts         # (신규) BP-001~035 TDD
```

---

## 13. 관련 문서

| 문서 | 경로 |
|------|------|
| 하네스 패턴 레퍼런스 | docs/05-reference/harness-patterns.md |
| Brick 원본 설계 | docs/02-design/features/brick-dashboard.design.md |
| Brick 백엔드 API | docs/02-design/features/brick-backend-api.design.md |
| Brick 프론트 설계 | docs/02-design/features/brick-dashboard-frontend.design.md |
| CLAUDE.md (PDCA 규칙) | CLAUDE.md §T-PDCA |
