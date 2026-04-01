# Brick Architecture (브릭 아키텍처) Design

> 작성일: 2026-04-02
> Plan: `docs/01-plan/features/brick-architecture.plan.md`
> TASK: `/Users/smith/.openclaw/workspace/tasks/TASK-BRICK-ARCHITECTURE.md`
> 프로세스 레벨: L3 (아키텍처 설계)
> 작성자: PM팀

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| Feature | Brick — Block × Team × Link 워크플로우 모듈화 아키텍처 |
| 핵심 철학 | "완전히 강제된 시스템 속에서 완벽한 자율화" |
| 3축 | Block (what+done+gate), Team (who+tool), Link (how) |
| 3층 | System Layer(불변) → Process Layer(조합) → Autonomy Layer(자유) |
| 기존 인프라 | gate-checker, pdca-chain-handoff, team-context, TDD 83건 → Brick 위로 래핑 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| Problem | T-PDCA가 유일한 프로세스. 새 워크플로우 = hook 하드코딩. 프로세스가 코드에 갇혀 있음 |
| Solution | 선언형 Block/Team/Link 조합. YAML 프리셋 하나로 새 워크플로우 정의 |
| Function UX Effect | 새 프로세스 추가 = `.bkit/presets/` 파일 1개 추가. 코드 변경 0 |
| Core Value | 어떤 업무든 블록 조합으로 자동화. 확장이 코드가 아닌 설정 |

---

## 1. 전체 아키텍처

### 1.1 3층 아키텍처 (3-Layer Architecture)

```
┌──────────────────────────────────────────────────────────────┐
│                    Autonomy Layer (자유)                      │
│  팀 내부 작업 방식, 도구 사용법, 산출물 구조                      │
│  "How는 자유" — 리더가 팀 안에서 알아서 판단                     │
├──────────────────────────────────────────────────────────────┤
│                    Process Layer (조합 가능)                   │
│  워크플로우 정의, 프리셋, 블록 타입 등록, 게이트 설정              │
│  .bkit/presets/*.yaml + .bkit/blocks/*.yaml                  │
├──────────────────────────────────────────────────────────────┤
│                    System Layer (불변 — 헌법)                  │
│  Block Interface, Invariants, Event History, Engine           │
│  .bkit/brick/engine.sh + .bkit/brick/schema/                 │
└──────────────────────────────────────────────────────────────┘
```

### 1.2 System Layer 불변 규칙 (Invariants)

| # | 불변 규칙 | 위반 시 |
|---|----------|--------|
| INV-1 | TASK 없이 워크플로우 시작 불가 | engine이 차단 |
| INV-2 | Block에 what + done 없으면 블록이 아님 | 스키마 검증 실패 |
| INV-3 | 산출물 없이 다음 Block 진행 불가 | gate-checker가 차단 |
| INV-4 | 모든 Block 전환은 Event History에 기록 | engine이 자동 기록 |
| INV-5 | Team 배정 없는 Block 실행 불가 | engine이 차단 |
| INV-6 | Link 정의 없는 Block 간 전환 불가 | engine이 차단 |

### 1.3 시스템 전체 흐름

```
[TASK 정의]
    │
    ▼
[프리셋 선택] ─── detect-work-type.sh OR 수동 지정
    │
    ▼
[워크플로우 인스턴스 생성]
    │  .bkit/runtime/workflows/{workflow-id}.json
    ▼
[Block 1] ──gate──▶ [Block 2] ──gate──▶ [Block 3] ...
    │                    │                    │
    ▼                    ▼                    ▼
  Team A              Team B              Team C
  (자율)              (자율)              (자율)
```

---

## 2. 축 1: Block (what + done + gate)

### 2.1 Block Interface (JSON Schema)

```jsonc
{
  "$schema": "brick/block-v1",
  
  // ─── Identity ───
  "id": "plan",                    // 블록 고유 ID (워크플로우 내 유일)
  "type": "Plan",                  // 블록 타입 (레지스트리에서 검증)
  "what": "요구사항 분석 및 Plan 문서 작성",  // 필수: 이 블록에서 뭘 하는가
  "description": "TASK 분석 → Plan 문서 작성",
  
  // ─── Done (완료 조건) ─── 필수: 뭘로 끝났다고 치는가
  "done": {
    "artifacts": [                 // 산출물 존재 확인
      "docs/01-plan/features/{feature}.plan.md"
    ],
    "metrics": {                   // 수치 기준 (선택)
      "match_rate": null,          // Plan은 match_rate 불필요
      "tdd_pass": null
    },
    "custom": []                   // 커스텀 검증 스크립트 (선택)
  },
  
  // ─── Gate (출구 조건) ─── 선택
  "gate": {
    "auto": [                      // 자동 체크 목록
      {"type": "artifact_exists", "path": "docs/01-plan/features/{feature}.plan.md"},
      {"type": "file_min_lines", "path": "docs/01-plan/features/{feature}.plan.md", "min": 20}
    ],
    "review": {                    // 검토 게이트 (on/off 가능)
      "coo": true,                 // COO 검토 필요
      "owner": false               // Smith님 검토 불필요
    },
    "on_fail": "retry"             // 실패 시: retry | rollback | escalate
  },
  
  // ─── Input (이전 블록 산출물) ─── 선택
  "input": {
    "required": [],                // 필수 입력 (없으면 시작 불가)
    "optional": [                  // 선택 입력 (없어도 시작 가능)
      "docs/adr/*.md"
    ]
  }
}
```

### 2.2 Block 최소 필수 정의

Block이 되려면 **2가지만 필수**:
- `what`: 이 블록에서 뭘 하는가 (문자열)
- `done.artifacts`: 뭘로 끝났다고 치는가 (파일 경로 1개 이상)

나머지(type, gate, input, description)는 전부 선택. 없으면 기본값 적용.

```jsonc
// 최소 블록 예시
{
  "id": "hotfix",
  "what": "프로덕션 버그 수정",
  "done": { "artifacts": ["src/**/*.ts"] }
}
```

### 2.3 Block 타입 레지스트리

**위치**: `.bkit/brick/block-types.yaml`

```yaml
# 내장 타입 (System Layer — 삭제 불가, 수정 가능)
block_types:
  Plan:
    description: "요구사항 분석 + Plan 문서 작성"
    default_done:
      artifacts: ["docs/01-plan/features/{feature}.plan.md"]
    default_gate:
      auto: [{type: "artifact_exists"}]
      review: {coo: true}

  Design:
    description: "상세 설계 + TDD 케이스 작성"
    default_done:
      artifacts: ["docs/02-design/features/{feature}.design.md"]
      metrics: {tdd_coverage: 100}
    default_gate:
      auto: [{type: "artifact_exists"}, {type: "tdd_gap_zero"}]
      review: {coo: true}

  Do:
    description: "구현 (코드 작성)"
    default_done:
      artifacts: ["src/**"]
      metrics: {match_rate: 90, tsc_errors: 0, build_pass: true}
    default_gate:
      auto: [{type: "match_rate", "min": 90}, {type: "tsc_pass"}, {type: "build_pass"}]

  Check:
    description: "검증 (Gap 분석 + QA)"
    default_done:
      artifacts: ["docs/03-analysis/{feature}.analysis.md"]
      metrics: {match_rate: 90}
    default_gate:
      auto: [{type: "match_rate", "min": 90}]

  Act:
    description: "배포 + 완료 보고"
    default_done:
      artifacts: []
      metrics: {deploy_health: true}
    default_gate:
      auto: [{type: "deploy_health"}]
      review: {owner: false}

  Research:
    description: "조사 + 분석 보고서"
    default_done:
      artifacts: ["docs/03-analysis/{feature}.analysis.md"]
    default_gate:
      auto: [{type: "artifact_exists"}, {type: "file_min_lines", "min": 50}]

  Review:
    description: "코드/설계 리뷰"
    default_done:
      artifacts: ["docs/03-analysis/{feature}.review.md"]

  Report:
    description: "보고서 작성 + 전달"
    default_done:
      artifacts: ["{output_path}"]

  Cron:
    description: "반복 실행 블록"
    default_done:
      metrics: {exit_code: 0}

# 커스텀 타입 추가 방법: 이 파일에 항목 추가
# 또는 .bkit/brick/custom-types/*.yaml 에 개별 파일로
```

### 2.4 Gate 메커니즘 상세

Gate = Block의 **출구 조건**. Block 자체가 아님.

#### Gate Auto 체크 타입

| gate type | 설명 | 파라미터 | 구현 |
|-----------|------|----------|------|
| `artifact_exists` | 파일 존재 확인 | `path` (glob 가능) | `ls {path}` |
| `file_min_lines` | 파일 최소 줄 수 | `path`, `min` | `wc -l` |
| `match_rate` | Gap 분석 Match Rate | `min` (0-100) | match-rate-parser.sh |
| `tsc_pass` | TypeScript 타입 체크 | — | `npx tsc --noEmit` |
| `build_pass` | 빌드 성공 | — | `npm run build` |
| `tdd_pass` | 테스트 통과 | `pattern` | `npx vitest run {pattern}` |
| `tdd_gap_zero` | TDD Gap 0건 | — | Design↔TDD 매핑 검증 |
| `deploy_health` | 배포 헬스체크 | `url` | HTTP 200 확인 |
| `custom_script` | 커스텀 스크립트 | `script` | `bash {script}` exit 0 |

#### Gate Review 설정

```jsonc
"review": {
  "coo": true,       // COO(모찌) 검토 → coo-watchdog.sh ACK 대기
  "owner": false      // Smith님 검토 → smith-report 대기
}
```

- `true` = 게이트 활성 (검토 통과해야 다음 블록)
- `false` = 게이트 비활성 (스킵)
- **on/off 토글 가능** — 프리셋에서 기본값, 런타임에서 오버라이드

#### Gate on_fail 정책

| 정책 | 동작 |
|------|------|
| `retry` | 같은 Block 재실행 (최대 3회, 설정 가능) |
| `rollback` | 이전 Block으로 돌아감 (Link 역방향) |
| `escalate` | COO/Owner에게 에스컬레이션 알림 |
| `skip` | 게이트 무시하고 다음 진행 (위험 — L0 전용) |

---

## 3. 축 2: Team (who + tool)

### 3.1 Team Interface (JSON Schema)

```jsonc
{
  "$schema": "brick/team-v1",
  
  // ─── Identity ───
  "name": "cto-team",              // 팀 고유 이름
  "display": "CTO팀",
  "session": "sdk-cto",            // Claude Code 세션 식별자
  "channel": "C0AN7ATS4DD",        // Slack 채널 (선택)
  
  // ─── Members ───
  "leader": {
    "model": "opus",               // 리더 모델
    "role": "CTO_LEADER",          // peer-resolver 역할
    "autonomy": "delegate",        // delegate | direct
    "restrictions": [              // 리더 금지 사항
      "no_src_edit",               // src/ 직접 수정 금지
      "no_infra_cli"               // gcloud 등 직접 실행 금지
    ]
  },
  "workers": [                     // 팀원 정의
    {
      "name": "frontend-dev",
      "model": "opus",
      "scope": ["src/app/", "src/components/"],
      "max_instances": 2
    },
    {
      "name": "backend-dev",
      "model": "opus",
      "scope": ["src/lib/", "src/actions/"],
      "max_instances": 2
    },
    {
      "name": "qa-engineer",
      "model": "opus",
      "scope": ["__tests__/"],
      "max_instances": 1
    }
  ],
  
  // ─── Toolkit (팀의 속성 — 블록이 아님) ───
  "toolkit": {
    "mcp": ["context7", "claude-peers"],
    "skills": [],
    "bkit": ["gap-detector", "code-analyzer"],
    "cli": ["npx", "npm", "git"]
  },
  
  // ─── Config ───
  "config": {
    "max_workers": 3,              // 동시 팀원 수 상한
    "timeout": 600000,             // 팀 작업 타임아웃 (ms)
    "permissions": "bypassPermissions"
  }
}
```

### 3.2 팀 유형

| 팀 | 역할 | 기본 블록 배정 |
|----|------|--------------|
| PM팀 | Plan + Design + TDD 케이스 | Plan, Design, Research, Review |
| CTO팀 | 구현 + QA + 배포 | Do, Check, Act |
| COO(모찌) | 게이트 검토 + 보고 | Gate review (블록 아님) |
| 마케팅팀 | 홍보 + 리포트 | Report |

### 3.3 팀-블록 배정 규칙

- 블록 1개에 팀 1개 배정 = **기본 모드**
- 블록 1개에 팀 N개 배정 = **경쟁 모드** (Link.type: compete)
- 팀 1개가 블록 N개 순차 처리 = **일반 모드**
- **팀 내부 프로세스는 자율** — COO는 what + done만 정의, 리더가 판단
  - 리더가 팀원 몇 명 쓸지, 어떤 순서로 할지, 어떤 도구 쓸지 = 자율
  - 이것이 Autonomy Layer

### 3.4 팀 내부 재귀적 프로세스

**에이전트팀 ≠ 서브에이전트**. 팀은 자체 프로세스를 가진 조직.

```
Block: Do (구현)
  └─ Team: CTO팀
       └─ 리더 내부 프로세스 (Autonomy Layer):
            ├─ 팀원 생성
            ├─ TASK 분해 → 팀원 배정
            ├─ 팀원 구현 → 리더 리뷰
            ├─ tsc + build 확인
            └─ 커밋 + 리더 보고
```

블록 바깥(Process Layer)에서 보면 "Do 블록 실행 → done 조건 충족?" 만 보임.
블록 안(Autonomy Layer)에서는 팀이 자유롭게 내부 프로세스 운영.

---

## 4. 축 3: Link (how)

### 4.1 Link Interface (JSON Schema)

```jsonc
{
  "$schema": "brick/link-v1",
  
  "from": "plan",                  // 출발 블록 ID
  "to": "design",                  // 도착 블록 ID
  "type": "sequential",            // 연결 타입
  
  // ─── 조건 (선택) ───
  "condition": {
    "type": "gate_pass",           // gate_pass | artifact_exists | metric | custom
    "params": {}
  },
  
  // ─── 실패 시 역방향 ───
  "on_fail": {
    "to": "plan",                  // 실패 시 되돌아갈 블록
    "type": "rollback"
  },
  
  // ─── 이벤트 훅 ───
  "events": {
    "on_start": ["notify-task-started.sh"],
    "on_complete": ["pdca-chain-handoff.sh"],
    "on_fail": ["notify-failure.sh"],
    "on_timeout": ["escalate.sh"]
  },
  
  // ─── 컨텍스트 전달 ───
  "context_pass": {
    "artifacts": true,             // 이전 블록 산출물 자동 주입
    "state": true                  // 이전 블록 상태 전달
  }
}
```

### 4.2 Link 타입 상세

#### 4.2.1 Sequential (순차)

```
[Block A] ──→ [Block B] ──→ [Block C]
```

- 기본 타입. A gate 통과 → B 시작.
- 역방향: B gate 실패 → on_fail 정책에 따라 A로 돌아감.
- **현행 매핑**: pdca-chain-handoff.sh의 CTO→COO→Smith 체인

#### 4.2.2 Parallel (병렬)

```
              ┌─→ [Block B1]
[Block A] ──→├─→ [Block B2] ──→ [Block C]  (merge)
              └─→ [Block B3]
```

- A 완료 → B1, B2, B3 동시 시작.
- 전부 완료 → C 시작 (merge 전략: all | any | N-of-M).
- **현행 매핑**: 없음 (신규). 구현: 각 Block에 별도 Team 배정 → TaskCreated 동시 발행

```jsonc
{
  "from": "plan",
  "to": ["design-api", "design-ui", "design-db"],
  "type": "parallel",
  "merge": {
    "strategy": "all",            // all: 전부 완료 | any: 하나만 | n_of_m: N개
    "next": "implement"
  }
}
```

#### 4.2.3 Compete (경쟁)

```
              ┌─→ [Team A: Block X]
[Block X] ──→│                      ──→ [Judge] ──→ [Block Y]
              └─→ [Team B: Block X]
```

- 같은 블록을 2개 이상 팀이 동시 수행 → 우수 산출물 선택.
- Judge = auto(metric 비교) 또는 review(COO/Owner 판단).
- **현행 매핑**: 없음 (신규). 구현: tmux 2세션 병렬 → judge gate

```jsonc
{
  "from": "research",
  "to": "research",              // 자기 자신 (같은 블록)
  "type": "compete",
  "teams": ["pm-team-a", "pm-team-b"],
  "judge": {
    "type": "review",            // auto | review
    "reviewer": "coo"
  },
  "next": "report"
}
```

#### 4.2.4 Loop (반복)

```
[Block A] ──→ [Block B] ──→ gate 실패 ──→ [Block A] (재시도)
                              │
                              gate 성공 ──→ [Block C]
```

- Gate 실패 시 이전 블록 재실행. 최대 횟수 제한.
- **현행 매핑**: pdca-iterator (gap < 90% → Do 재실행)

```jsonc
{
  "from": "check",
  "to": "do",
  "type": "loop",
  "condition": {"type": "metric", "key": "match_rate", "op": "<", "value": 90},
  "max_retries": 3,
  "on_exhaust": "escalate"       // 최대 횟수 소진 시
}
```

#### 4.2.5 Cron (반복 스케줄)

```
[Schedule: 05:00 KST] ──→ [Block: collect] ──→ [Block: process]
```

- 블록(들)에 반복 스케줄. 별도 개념이 아님 — Link의 한 타입.
- TASK도 크론도 같은 것: 크론은 "자동으로 TASK가 반복 생성"되는 Link.

```jsonc
{
  "from": "__cron__",            // 특수 소스: 스케줄러
  "to": "collect",
  "type": "cron",
  "schedule": "0 5 * * *",       // cron 표현식
  "timezone": "Asia/Seoul",
  "chain": ["collect", "process", "analyze"]  // 크론이 트리거하는 블록 체인
}
```

#### 4.2.6 Branch (조건 분기)

```
                  ┌─ condition A ──→ [Block B]
[Block A] ──→ ───┤
                  └─ condition B ──→ [Block C]
```

- 조건에 따라 다른 블록으로 분기.
- **현행 매핑**: detect-work-type.sh의 L0/L1/L2/L3 분기

```jsonc
{
  "from": "triage",
  "type": "branch",
  "branches": [
    {"condition": {"level": "L0"}, "to": "hotfix-do"},
    {"condition": {"level": "L1"}, "to": "design"},
    {"condition": {"level": "L2"}, "to": "plan"},
    {"condition": {"level": "L3"}, "to": "plan"}
  ]
}
```

#### 4.2.7 확장 (Custom)

새 Link 타입 추가 방법: `.bkit/brick/link-types/` 에 타입 정의 + 실행 스크립트.

```yaml
# .bkit/brick/link-types/approval.yaml
name: approval
description: "외부 승인 대기"
handler: ".bkit/brick/handlers/approval-handler.sh"
params:
  - approver     # 승인자
  - timeout      # 대기 시간
```

### 4.3 이벤트 훅 (Event Hooks)

모든 Link는 4개 이벤트에 hook을 바인딩할 수 있다:

| 이벤트 | 발화 시점 | 기본 hook |
|--------|----------|----------|
| `on_start` | 블록 실행 시작 | notify-task-started.sh |
| `on_complete` | 블록 gate 통과 | pdca-chain-handoff.sh |
| `on_fail` | 블록 gate 실패 | notify-failure.sh (신규) |
| `on_timeout` | 블록 타임아웃 | escalate.sh (신규) |

hook은 **기존 .bkit/hooks/ 디렉토리의 스크립트 재사용**. Brick 전용 hook 추가 시 `.bkit/brick/hooks/`에 배치.

---

## 5. 워크플로우 엔진

### 5.1 Workflow = Block[] × Team[] × Link[]

워크플로우 = 블록 목록 + 팀 배정 + 연결 정의의 **조합**.

```jsonc
{
  "$schema": "brick/workflow-v1",
  "id": "feature-signup-fix",
  "name": "회원가입 버그 수정",
  "preset": "t-pdca-l1",          // 프리셋 기반 (선택)
  "task": "TASK-SIGNUP-PROFILE-FIX",
  
  "blocks": [
    {"id": "design", "type": "Design", "what": "UUID v5 변환 설계", "done": {"artifacts": ["docs/02-design/features/signup-profile-fix.design.md"]}},
    {"id": "do", "type": "Do", "what": "코드 구현", "done": {"metrics": {"match_rate": 90, "tsc_errors": 0}}},
    {"id": "check", "type": "Check", "what": "Gap 분석", "done": {"metrics": {"match_rate": 90}}},
    {"id": "act", "type": "Act", "what": "배포 + 보고", "done": {"metrics": {"deploy_health": true}}}
  ],
  
  "teams": {
    "design": "pm-team",
    "do": "cto-team",
    "check": "cto-team",
    "act": "cto-team"
  },
  
  "links": [
    {"from": "design", "to": "do", "type": "sequential"},
    {"from": "do", "to": "check", "type": "sequential"},
    {"from": "check", "to": "do", "type": "loop", "condition": {"match_rate_below": 90}, "max_retries": 3},
    {"from": "check", "to": "act", "type": "sequential", "condition": {"match_rate_gte": 90}}
  ]
}
```

### 5.2 워크플로우 엔진 (engine.sh)

**위치**: `.bkit/brick/engine.sh`

**역할**:
1. 프리셋 또는 커스텀 워크플로우 YAML/JSON 로드
2. 워크플로우 인스턴스 생성 (`.bkit/runtime/workflows/{id}.json`)
3. 현재 블록 추적 + gate 판정 → 다음 블록 결정
4. Link 이벤트 훅 발화
5. Event History 기록

**인터페이스**:
```bash
# 워크플로우 시작
brick-engine start --preset t-pdca-l2 --feature signup-fix

# 현재 상태 확인
brick-engine status --workflow {id}

# 블록 완료 보고 (gate 판정 트리거)
brick-engine complete --block do --workflow {id}

# 수동 게이트 통과 (review gate)
brick-engine approve --block design --reviewer coo --workflow {id}

# 워크플로우 시각화
brick-engine viz --workflow {id}
```

### 5.3 워크플로우 인스턴스 상태

**위치**: `.bkit/runtime/workflows/{workflow-id}.json`

```jsonc
{
  "workflow_id": "feature-signup-fix-20260402",
  "preset": "t-pdca-l1",
  "task": "TASK-SIGNUP-PROFILE-FIX",
  "feature": "signup-fix",
  "status": "running",            // pending | running | completed | failed
  "created_at": "2026-04-02T10:00:00+09:00",
  
  "blocks": {
    "design": {"status": "completed", "started_at": "...", "completed_at": "...", "artifacts": ["..."]},
    "do":     {"status": "in_progress", "started_at": "...", "team": "cto-team", "worker": "backend-dev"},
    "check":  {"status": "pending"},
    "act":    {"status": "pending"}
  },
  
  "current_block": "do",
  "history": [
    {"event": "block_start", "block": "design", "at": "...", "team": "pm-team"},
    {"event": "gate_pass", "block": "design", "at": "...", "gates": ["artifact_exists: pass"]},
    {"event": "block_start", "block": "do", "at": "...", "team": "cto-team"}
  ]
}
```

### 5.4 컨텍스트 자동 주입

Block 전환 시 이전 Block의 산출물을 다음 Block에 자동 주입.

```
Design 블록 완료
  산출물: signup-profile-fix.design.md
      │
      ▼ (Link.context_pass.artifacts = true)
Do 블록 시작
  input.required = ["docs/02-design/features/signup-profile-fix.design.md"]
  → 팀 리더에게 "이 Design 기반으로 구현하라" 자동 컨텍스트
```

**구현**: engine.sh가 Block 전환 시 이전 Block의 `done.artifacts` → 다음 Block의 `input` 으로 자동 매핑.
현행 living-context-loader.sh의 Phase별 문서 로딩이 이 역할 수행 → Brick engine으로 통합.

---

## 6. 프리셋 시스템

### 6.1 프리셋 = 워크플로우 템플릿

**위치**: `.bkit/presets/`

프리셋은 Block/Team/Link의 **기본 조합**. 실행 시 오버라이드 가능.

### 6.2 내장 프리셋

#### T-PDCA L0 (응급)

```yaml
# .bkit/presets/t-pdca-l0.yaml
name: "T-PDCA L0 응급"
description: "프로덕션 장애 — 즉시 수정 + 배포"
blocks:
  - {id: do, type: Do, what: "버그 수정", done: {metrics: {tsc_errors: 0, build_pass: true}}}
  - {id: act, type: Act, what: "배포 + 보고", done: {metrics: {deploy_health: true}}}
links:
  - {from: do, to: act, type: sequential}
teams:
  do: cto-team
  act: cto-team
gates:
  do: {auto: [tsc_pass, build_pass], review: {coo: false, owner: false}}
  act: {auto: [deploy_health], review: {coo: false}}
```

#### T-PDCA L1 (경량)

```yaml
# .bkit/presets/t-pdca-l1.yaml
name: "T-PDCA L1 경량"
description: "원인 명확한 버그 — Design + Do + Check + Act"
blocks:
  - {id: design, type: Design, what: "수정 방향 설계"}
  - {id: do, type: Do, what: "구현"}
  - {id: check, type: Check, what: "Gap 분석"}
  - {id: act, type: Act, what: "배포 + 보고"}
links:
  - {from: design, to: do, type: sequential}
  - {from: do, to: check, type: sequential}
  - {from: check, to: do, type: loop, condition: {match_rate_below: 90}, max_retries: 3}
  - {from: check, to: act, type: sequential, condition: {match_rate_gte: 90}}
teams:
  design: pm-team
  do: cto-team
  check: cto-team
  act: cto-team
```

#### T-PDCA L2 (표준)

```yaml
# .bkit/presets/t-pdca-l2.yaml
name: "T-PDCA L2 표준"
description: "일반 기능 개발 — Plan + Design + Do + Check + Act"
blocks:
  - {id: plan, type: Plan, what: "요구사항 분석"}
  - {id: design, type: Design, what: "상세 설계 + TDD"}
  - {id: do, type: Do, what: "구현"}
  - {id: check, type: Check, what: "Gap 분석"}
  - {id: act, type: Act, what: "배포 + 보고"}
links:
  - {from: plan, to: design, type: sequential}
  - {from: design, to: do, type: sequential}
  - {from: do, to: check, type: sequential}
  - {from: check, to: do, type: loop, condition: {match_rate_below: 90}, max_retries: 3}
  - {from: check, to: act, type: sequential, condition: {match_rate_gte: 90}}
teams:
  plan: pm-team
  design: pm-team
  do: cto-team
  check: cto-team
  act: cto-team
gates:
  plan: {review: {coo: true}}
  design: {review: {coo: true}, auto: [tdd_gap_zero]}
  do: {auto: [match_rate, tsc_pass, build_pass]}
  check: {auto: [match_rate]}
  act: {auto: [deploy_health]}
```

#### T-PDCA L3 (풀)

```yaml
# .bkit/presets/t-pdca-l3.yaml
name: "T-PDCA L3 풀"
description: "DB/Auth/인프라 — Plan + Design + Do + Check + 보안감사 + Act"
extends: t-pdca-l2
overrides:
  blocks:
    - {id: security, type: Review, what: "보안 감사", after: check}
  links:
    - {from: check, to: security, type: sequential, condition: {match_rate_gte: 95}}
    - {from: security, to: act, type: sequential}
  gates:
    do: {auto: [{type: match_rate, min: 95}]}     # L3은 95%
    act: {review: {owner: true}}                    # Smith님 최종 승인
```

#### Hotfix

```yaml
# .bkit/presets/hotfix.yaml
name: "Hotfix"
description: "즉시 수정 + QA + 배포"
blocks:
  - {id: do, type: Do, what: "버그 수정"}
  - {id: qa, type: Check, what: "QA"}
links:
  - {from: do, to: qa, type: sequential}
teams:
  do: cto-team
  qa: cto-team
gates:
  do: {auto: [tsc_pass, build_pass], review: {coo: false}}
  qa: {auto: [build_pass]}
```

#### Research

```yaml
# .bkit/presets/research.yaml
name: "Research"
description: "조사 + 보고서"
blocks:
  - {id: research, type: Research, what: "조사 분석"}
  - {id: report, type: Report, what: "보고서 작성 + 전달"}
links:
  - {from: research, to: report, type: sequential}
teams:
  research: pm-team
  report: pm-team
gates:
  research: {auto: [{type: file_min_lines, min: 50}]}
```

#### Custom (자유 조합)

```yaml
# .bkit/presets/custom-example.yaml
name: "경쟁가설 A/B"
description: "2팀 경쟁 → 우수 산출물 선택 → 구현"
blocks:
  - {id: research, type: Research, what: "시장 분석"}
  - {id: design, type: Design, what: "설계 (경쟁)"}
  - {id: do, type: Do, what: "구현"}
links:
  - {from: research, to: design, type: compete, teams: [pm-team-a, pm-team-b], judge: {type: review, reviewer: coo}}
  - {from: design, to: do, type: sequential}
```

### 6.3 프리셋 확장 방법

1. `.bkit/presets/` 에 YAML 파일 추가
2. `blocks`, `links`, `teams`, `gates` 정의
3. `extends` 로 기존 프리셋 상속 + `overrides` 로 부분 수정
4. `brick-engine start --preset {name}` 으로 실행

---

## 7. 기존 인프라 매핑 (마이그레이션 경로)

### 7.1 매핑 테이블

| 현행 구성요소 | Brick 대응 | 전환 방법 |
|--------------|-----------|----------|
| `gate-checker.sh` | Block.gate + engine.sh | gate 로직을 engine으로 이동, 스크립트는 gate handler로 래핑 |
| `pdca-chain-handoff.sh` | Link(sequential).on_complete | Link 이벤트 훅으로 등록 |
| `detect-work-type.sh` | 프리셋 자동 선택기 | L0→hotfix, L1→t-pdca-l1, L2→t-pdca-l2, L3→t-pdca-l3 |
| `team-context-*.json` | Team 런타임 상태 | workflow 인스턴스의 teams 섹션으로 통합 |
| `task-state-{feature}.json` | 워크플로우 인스턴스 blocks 상태 | `.bkit/runtime/workflows/` 로 이동 |
| `match-rate-parser.sh` | gate handler (match_rate) | `.bkit/brick/gates/match-rate.sh` 로 래핑 |
| `living-context-loader.sh` | Link.context_pass | engine이 블록 전환 시 자동 호출 |
| `notify-completion.sh` | Link.events.on_complete | 이벤트 훅으로 등록 |
| `notify-task-started.sh` | Link.events.on_start | 이벤트 훅으로 등록 |
| `validate-delegate.sh` | Team.leader.restrictions | 팀 정의에서 선언적으로 관리 |
| `enforce-teamcreate.sh` | INV-5 (팀 배정 없는 Block 실행 불가) | engine 레벨 검증 |

### 7.2 마이그레이션 전략

**Phase 1: 래핑 (하위 호환)**
- 기존 hook 그대로 유지
- Brick engine을 **상위 래퍼**로 추가
- engine → 기존 hook 호출 → 결과 수집
- TDD 83건 유지 + Brick 전용 테스트 추가

**Phase 2: 통합**
- gate-checker.sh → engine의 gate 판정으로 통합
- pdca-chain-handoff.sh → Link 이벤트 시스템으로 통합
- team-context → workflow 인스턴스로 통합

**Phase 3: 완전 전환**
- 기존 hook을 Brick handler로 완전 대체
- 프리셋 기반 운영으로 전환

---

## 8. 비교 분석

### 8.1 Brick vs 현존 시스템

| 항목 | Brick | CrewAI | LangGraph | MetaGPT | AutoGen | Temporal |
|------|-------|--------|-----------|---------|---------|----------|
| **핵심 개념** | Block×Team×Link | Agent×Task×Crew | Node×Edge×State | Role×Action×SOP | Agent×Chat×Group | Workflow×Activity×Signal |
| **팀 개념** | ✅ 1등 시민 | ✅ Crew | ❌ 없음 | ✅ Role 고정 | ✅ Group | ❌ Worker 풀 |
| **프로세스 자유도** | ✅ 임의 조합 | ⚠️ 순차/계층만 | ✅ 그래프 | ⚠️ SOP 고정 | ⚠️ 채팅 기반 | ✅ 임의 조합 |
| **병렬/경쟁** | ✅ Link 타입 | ❌ 없음 | ✅ 가능 | ❌ 없음 | ⚠️ 제한적 | ✅ 가능 |
| **양방향 (실패→이전)** | ✅ on_fail | ❌ 단방향 | ⚠️ 수동 | ❌ 없음 | ❌ 없음 | ✅ Signal |
| **게이트 on/off** | ✅ 선언적 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ⚠️ 코드 |
| **도구 귀속** | ✅ 팀 속성 | ✅ Agent 속성 | ✅ Node 속성 | ✅ Action | ✅ Agent | ❌ Activity 속성 |
| **크론/스케줄** | ✅ Link 타입 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ✅ Schedule |
| **프리셋 (템플릿)** | ✅ YAML 프리셋 | ❌ 코드 | ❌ 코드 | ⚠️ SOP | ❌ 코드 | ⚠️ 코드 |
| **재귀적 팀 프로세스** | ✅ Autonomy Layer | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 | ✅ Child Workflow |
| **선언형 정의** | ✅ YAML/JSON | ❌ Python | ❌ Python | ❌ Python | ❌ Python | ❌ Go/Python |
| **런타임** | bash+JSON | Python | Python | Python | Python | Go 서버 |
| **이벤트 훅** | ✅ 4개 | ⚠️ callback | ⚠️ 제한적 | ❌ 없음 | ⚠️ 제한적 | ✅ Signal |

### 8.2 Brick의 차별점

1. **팀 + 프로세스 조합**: CrewAI처럼 팀이 있지만, LangGraph처럼 프로세스가 자유로움. 둘 다 가진 건 Brick뿐
2. **선언형 워크플로우**: 모든 경쟁자가 코드(Python) 기반. Brick은 YAML/JSON 선언
3. **3층 분리**: System(불변) / Process(조합) / Autonomy(자유) — 강제와 자유의 공존
4. **게이트 on/off**: 유일하게 검증 강도를 동적으로 조절 가능
5. **기존 인프라 재사용**: 별도 서버 없이 bash hook + JSON으로 구현

### 8.3 ln-1000 (levnikolaevich) vs Brick

| 항목 | ln-1000 | Brick |
|------|---------|-------|
| 구조 | 고정 4단계 파이프라인 (300→310→400→500) | 임의 블록 조합 |
| 확장 | 각 Stage 내부 수정 | 프리셋 파일 추가 |
| 비유 | "기차 노선" — 정해진 역 순서대로 | "레고" — 벽돌 자유 조합 |
| 적합 | 단일 Story 처리 | 다양한 업무 유형 (개발/분석/보고/크론) |

---

## 9. 시각화 설계

### 9.1 CLI 출력 (brick-engine viz)

```
┌─── Workflow: signup-fix (T-PDCA L1) ──────────────────────┐
│                                                            │
│  [Design] ──→ [Do] ──→ [Check] ──→ [Act]                  │
│   ✅ PM팀     🔄 CTO팀   ⏳ CTO팀    ⏳ CTO팀             │
│   12분         진행중                                      │
│                    │         │                              │
│                    └── loop ─┘ (match_rate < 90%)          │
│                                                            │
│  Current: Do (3/4 blocks)                                  │
│  Match Rate: — (Check 미실행)                              │
│  Started: 2026-04-02 10:00 KST                            │
└────────────────────────────────────────────────────────────┘
```

### 9.2 대시보드 블록 흐름도

대시보드(dashboard/)에 Brick 시각화 컴포넌트 추가:
- 블록을 사각형으로, 연결을 화살표로 표시
- 블록 상태별 색상: ✅ 완료(초록), 🔄 진행(파랑), ⏳ 대기(회색), ❌ 실패(빨강)
- 클릭하면 해당 블록 상세 (산출물, gate 상태, 팀 정보)
- **구현은 별도 TASK** — 이 Design에서는 데이터 구조만 정의

---

## 10. 파일 구조

```
.bkit/
├── brick/                          # System Layer
│   ├── engine.sh                   # 워크플로우 엔진 (핵심)
│   ├── schema/                     # JSON Schema 정의
│   │   ├── block-v1.json
│   │   ├── team-v1.json
│   │   ├── link-v1.json
│   │   └── workflow-v1.json
│   ├── block-types.yaml            # 블록 타입 레지스트리
│   ├── link-types/                 # Link 타입 확장
│   │   └── approval.yaml
│   ├── gates/                      # gate handler 스크립트
│   │   ├── artifact-exists.sh
│   │   ├── match-rate.sh
│   │   ├── tsc-pass.sh
│   │   ├── build-pass.sh
│   │   └── deploy-health.sh
│   └── hooks/                      # Brick 전용 이벤트 훅
│       ├── block-start.sh
│       └── block-complete.sh
├── presets/                        # Process Layer
│   ├── t-pdca-l0.yaml
│   ├── t-pdca-l1.yaml
│   ├── t-pdca-l2.yaml
│   ├── t-pdca-l3.yaml
│   ├── hotfix.yaml
│   ├── research.yaml
│   └── custom/                     # 사용자 정의 프리셋
├── runtime/
│   └── workflows/                  # 워크플로우 인스턴스 (런타임)
│       └── {workflow-id}.json
├── hooks/                          # 기존 hook (래핑 대상)
│   ├── gate-checker.sh
│   ├── pdca-chain-handoff.sh
│   └── ...
└── state/                          # 기존 상태 파일
```

---

## 11. TDD 케이스 (Gap 100%)

Design의 모든 항목을 1:1로 커버. "Design에 있는데 테스트에 없음" = 0건.

### System Layer 불변 규칙 (INV-1~6)

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-01 | TASK 없이 워크플로우 시작 시 차단 | INV-1 | engine start → exit 2 |
| BK-02 | what 없는 Block 스키마 검증 실패 | INV-2 | JSON Schema 검증 → error |
| BK-03 | done 없는 Block 스키마 검증 실패 | INV-2 | JSON Schema 검증 → error |
| BK-04 | 산출물 없이 다음 Block 진행 차단 | INV-3 | gate artifact_exists → fail → 다음 블록 미진행 |
| BK-05 | 모든 Block 전환 Event History 기록 | INV-4 | 블록 완료 → history[] 엔트리 추가 확인 |
| BK-06 | Team 미배정 Block 실행 차단 | INV-5 | teams 섹션에 블록 없음 → exit 2 |
| BK-07 | Link 미정의 Block 간 전환 차단 | INV-6 | links에 from→to 없음 → 전환 불가 |

### Block (축 1)

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-08 | 최소 Block (what + done만) 생성 성공 | §2.2 | 최소 JSON → 유효 |
| BK-09 | Block 타입 레지스트리 로드 | §2.3 | block-types.yaml 파싱 → Plan/Design/Do/Check/Act 존재 |
| BK-10 | 커스텀 Block 타입 등록 | §2.3 | custom-types/ 파일 추가 → 레지스트리에 반영 |
| BK-11 | Gate auto: artifact_exists 통과 | §2.4 | 파일 존재 → gate pass |
| BK-12 | Gate auto: artifact_exists 차단 | §2.4 | 파일 미존재 → gate fail |
| BK-13 | Gate auto: match_rate 통과 (≥90) | §2.4 | match_rate=92 → pass |
| BK-14 | Gate auto: match_rate 차단 (<90) | §2.4 | match_rate=85 → fail |
| BK-15 | Gate auto: tsc_pass 통과 | §2.4 | tsc exit 0 → pass |
| BK-16 | Gate auto: build_pass 통과 | §2.4 | build exit 0 → pass |
| BK-17 | Gate auto: tdd_gap_zero 검증 | §2.4 | Design↔TDD 전수 매핑 → pass |
| BK-18 | Gate auto: custom_script 실행 | §2.4 | 스크립트 exit 0 → pass |
| BK-19 | Gate review: coo=true → ACK 대기 | §2.4 | coo review → pending 상태 |
| BK-20 | Gate review: coo=false → 스킵 | §2.4 | coo review false → 즉시 통과 |
| BK-21 | Gate on_fail: retry (최대 3회) | §2.4 | 실패 3회 → retry → 4회차 escalate |
| BK-22 | Gate on_fail: rollback → 이전 블록 | §2.4 | rollback → 이전 블록 재실행 |
| BK-23 | Gate on_fail: escalate → 알림 | §2.4 | escalate → notify hook 발화 |

### Team (축 2)

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-24 | Team 정의 JSON 파싱 | §3.1 | team-v1 스키마 검증 → 유효 |
| BK-25 | Team-Block 1:1 배정 | §3.3 | blocks.do → teams.do=cto-team 매핑 |
| BK-26 | Team-Block N:1 경쟁 배정 | §3.3 | compete 타입 → 2팀 동시 배정 |
| BK-27 | 리더 restrictions 적용 | §3.1 | no_src_edit → src/ 수정 시 차단 |
| BK-28 | Toolkit MCP/skills 바인딩 | §3.1 | toolkit.mcp → context7 사용 가능 |
| BK-29 | max_workers 상한 적용 | §3.1 | max=3 → 4번째 팀원 생성 차단 |

### Link (축 3)

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-30 | Link sequential 정상 전환 | §4.2.1 | A gate pass → B 시작 |
| BK-31 | Link sequential 역방향 (on_fail) | §4.2.1 | B gate fail → A 재실행 |
| BK-32 | Link parallel: all merge | §4.2.2 | B1+B2+B3 완료 → C 시작 |
| BK-33 | Link parallel: any merge | §4.2.2 | B1만 완료 → C 시작 |
| BK-34 | Link compete: 2팀 동시 실행 | §4.2.3 | 같은 블록 2팀 → 2인스턴스 |
| BK-35 | Link compete: judge 선택 | §4.2.3 | judge → 우수 산출물 선택 |
| BK-36 | Link loop: 재시도 (max_retries 내) | §4.2.4 | 실패 → 이전 블록 재실행 |
| BK-37 | Link loop: max_retries 소진 → on_exhaust | §4.2.4 | 3회 실패 → escalate |
| BK-38 | Link cron: 스케줄 정의 | §4.2.5 | cron expression → 유효 |
| BK-39 | Link branch: 조건 분기 | §4.2.6 | level=L0 → hotfix-do |
| BK-40 | Link branch: 기본 분기 (조건 없음) | §4.2.6 | 매칭 없음 → default |

### Event Hook

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-41 | on_start 이벤트 발화 | §4.3 | 블록 시작 → notify-task-started.sh 호출 |
| BK-42 | on_complete 이벤트 발화 | §4.3 | 블록 완료 → pdca-chain-handoff.sh 호출 |
| BK-43 | on_fail 이벤트 발화 | §4.3 | 블록 실패 → notify-failure.sh 호출 |
| BK-44 | on_timeout 이벤트 발화 | §4.3 | 타임아웃 → escalate.sh 호출 |

### Workflow Engine

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-45 | 프리셋 로드 (t-pdca-l2) | §6.2 | YAML 로드 → blocks/links/teams 파싱 성공 |
| BK-46 | 프리셋 extends 상속 | §6.2 (L3 extends L2) | L3 = L2 + security 블록 추가 |
| BK-47 | 프리셋 overrides 적용 | §6.2 | match_rate 90→95 오버라이드 |
| BK-48 | 워크플로우 인스턴스 생성 | §5.3 | engine start → workflows/{id}.json 생성 |
| BK-49 | 현재 블록 추적 | §5.3 | current_block 업데이트 확인 |
| BK-50 | 컨텍스트 자동 주입 | §5.4 | Design 산출물 → Do input에 자동 매핑 |
| BK-51 | 워크플로우 완료 상태 전환 | §5.3 | 마지막 블록 gate pass → status: completed |

### 기존 인프라 하위 호환

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-52 | gate-checker.sh 래핑 동작 | §7.1 | engine → gate-checker 호출 → 결과 수집 |
| BK-53 | pdca-chain-handoff.sh 이벤트 연동 | §7.1 | on_complete → 기존 handoff 호출 |
| BK-54 | detect-work-type → 프리셋 매핑 | §7.1 | L0→hotfix, L2→t-pdca-l2 |
| BK-55 | 기존 TDD 83건 통과 유지 | §7.2 | Brick 추가 후 기존 테스트 전체 green |

### 비교 분석 검증

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-56 | Brick 프리셋에 CrewAI 미지원 기능 포함 | §8.1 | parallel + compete + loop 타입 존재 |
| BK-57 | 선언형(YAML) 워크플로우 정의 | §8.2 | Python 코드 0줄로 워크플로우 정의 가능 |

### 시각화

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-58 | CLI viz 출력 형식 | §9.1 | brick-engine viz → 블록 흐름도 텍스트 출력 |
| BK-59 | 워크플로우 인스턴스 JSON 대시보드 호환 | §9.2 | workflows/{id}.json → 대시보드 읽기 가능 |

---

### TDD 커버리지 요약

| Design 섹션 | TDD 케이스 | 커버리지 |
|-------------|-----------|---------|
| System Layer 불변 규칙 (§1.2) | BK-01~07 (7건) | 6/6 INV = 100% |
| Block (§2) | BK-08~23 (16건) | 스키마+타입+gate 전체 = 100% |
| Team (§3) | BK-24~29 (6건) | 정의+배정+제한 = 100% |
| Link (§4) | BK-30~44 (15건) | 7타입+4이벤트 = 100% |
| Workflow Engine (§5-6) | BK-45~51 (7건) | 프리셋+인스턴스+컨텍스트 = 100% |
| 기존 인프라 호환 (§7) | BK-52~55 (4건) | 래핑+매핑+하위호환 = 100% |
| 비교 분석 (§8) | BK-56~57 (2건) | 차별점 검증 = 100% |
| 시각화 (§9) | BK-58~59 (2건) | CLI+대시보드 = 100% |
| **총계** | **59건** | **Gap 0건 = 100%** |

---

## 12. 심층 분석 — 엣지케이스, 숨은 의존성, 실패 시나리오, 확장 병목

> 3축 뼈대 너머, COO/CEO가 사고하지 못한 구조적 문제와 해결책.

### 12.1 워크플로우 생명주기 문제

#### 12.1.1 세션 크래시 복구 (Workflow Recovery)

**문제**: Block 실행 중 Claude Code 세션이 죽으면?
- 현행: session-resume-check.sh가 미완료 TASK/좀비 팀원 감지
- Brick: 워크플로우 인스턴스 JSON이 디스크에 있으므로 상태는 보존됨
- **하지만**: Block 내부 팀원의 작업 진행 상태는 유실 가능

**해결**:
```jsonc
// 워크플로우 인스턴스에 checkpoint 추가
"blocks": {
  "do": {
    "status": "in_progress",
    "checkpoint": {
      "last_commit": "abc1234",        // 마지막 커밋 해시
      "worker_state": "implementing",  // 팀원 작업 단계
      "files_modified": ["src/lib/auth.ts"],
      "saved_at": "2026-04-02T10:30:00+09:00"
    }
  }
}
```
- engine이 세션 시작 시 `runtime/workflows/` 스캔
- `in_progress` 블록 발견 → 해당 팀+블록부터 재개
- checkpoint 없으면 블록 처음부터 재시작 (멱등성 필요 — §12.1.3)

#### 12.1.2 순환 참조 감지 (Circular Link Detection)

**문제**: A→B→C→A 같은 순환 Link를 정의하면 무한 루프.
- loop 타입은 의도적 순환이지만 max_retries가 있음
- branch + sequential 조합으로 **의도하지 않은 순환** 가능

**해결**:
- engine이 워크플로우 로드 시 **DAG 검증** (Directed Acyclic Graph)
- loop 타입만 역방향 허용, 나머지 타입에서 순환 감지 → 즉시 거부
- loop 타입도 max_retries 필수 (기본 3, 최대 10)
- **INV-7 추가**: 워크플로우 그래프에 의도하지 않은 순환 존재 불가

```
BK-60: 순환 참조 워크플로우 로드 시 거부 (A→B→C→A, loop 아닌 sequential)
BK-61: loop 타입 max_retries 미지정 시 기본값 3 적용
```

#### 12.1.3 블록 멱등성 (Block Idempotency)

**문제**: 크래시 후 재시작, 또는 loop 재실행 시 Block이 안전하게 재실행 가능한가?
- Do 블록: 이전 커밋 위에 추가 커밋 → 안전
- Design 블록: 파일 덮어쓰기 → 안전
- Act 블록: **배포 2회 실행** → 위험할 수 있음
- Report 블록: **Slack 메시지 2회 전송** → 중복

**해결**:
- Block 정의에 `idempotent` 속성 추가 (기본: true)
- `idempotent: false` 블록은 재실행 전 **명시적 확인** 요구
- engine이 재실행 시 `blocks.{id}.execution_count` 체크
- Act 블록 기본: `idempotent: false` → 재실행 시 경고 + review gate 강제

```jsonc
// Block 정의 확장
{
  "id": "act",
  "type": "Act",
  "idempotent": false,           // 재실행 위험 표시
  "on_rerun": "require_review"   // 재실행 시 강제 검토
}
```

```
BK-62: idempotent=false 블록 재실행 시 review gate 강제 활성화
BK-63: execution_count 추적 (블록 실행 횟수)
```

### 12.2 팀 자원 경합 (Resource Contention)

#### 12.2.1 동시 워크플로우의 팀 경합

**문제**: 워크플로우 2개가 동시에 CTO팀을 필요로 하면?
- 현행: 팀은 하나만 존재, 동시 사용 불가
- Brick: 여러 워크플로우가 같은 팀 참조 가능

**해결 — 팀 스케줄링 정책**:

```jsonc
// Team 정의 확장
"scheduling": {
  "policy": "exclusive",         // exclusive | shared | priority
  "max_concurrent_blocks": 1,    // 동시 처리 블록 수
  "queue_strategy": "fifo"       // fifo | priority | deadline
}
```

| 정책 | 동작 | 적합 |
|------|------|------|
| `exclusive` | 한 번에 1개 워크플로우만 사용 | CTO팀 (기본) |
| `shared` | 여러 워크플로우 동시 사용 (workers 분배) | PM팀 (분석 병렬) |
| `priority` | 높은 레벨(L0>L1>L2>L3) 우선 | 응급 대응 시 |

**선점(Preemption)**: L0 워크플로우가 들어오면 L2 블록을 일시정지하고 L0 먼저.
- 일시정지된 블록은 `status: suspended` → L0 완료 후 자동 재개
- checkpoint 기반 재개

```
BK-64: exclusive 팀에 2개 워크플로우 동시 요청 → 큐 대기
BK-65: priority 정책: L0 워크플로우가 L2 블록 선점
BK-66: suspended 블록 자동 재개 (선점 해제 후)
```

#### 12.2.2 팀원 크래시 (Worker Failure)

**문제**: Do 블록 실행 중 팀원(backend-dev)이 크래시하면?
- 현행: TeamDelete 후 재생성이지만, 작업 유실 가능
- tmux pane 죽으면 좀비 상태

**해결**:
- engine이 블록 실행 중 팀원 heartbeat 모니터링 (idle notification 추적)
- heartbeat 타임아웃 → worker_failure 이벤트 발화
- 블록에 `worker_recovery` 정책 추가:
  - `recreate`: 새 팀원 생성 → checkpoint부터 재시작
  - `reassign`: 다른 팀원에게 재배정
  - `escalate`: 리더에게 보고

```
BK-67: 팀원 heartbeat 타임아웃 → worker_failure 이벤트
BK-68: worker_recovery: recreate → 새 팀원 + checkpoint 재개
```

### 12.3 게이트 상호작용 문제

#### 12.3.1 Auto + Review Gate 충돌

**문제**: Auto gate는 통과했는데 Review gate에서 COO가 거부하면?
- Auto 결과를 버리나? Review 거부 사유에 따라 블록을 어디로 보내나?

**해결 — Gate 평가 순서와 거부 경로**:

```
Gate 평가 순서: auto → review (순차적)
- auto 실패 → 즉시 on_fail (review 미진행)
- auto 통과 + review 거부 → review_reject 경로
- auto 통과 + review 승인 → 다음 블록
```

```jsonc
// Gate 확장
"gate": {
  "auto": [...],
  "review": {"coo": true},
  "on_review_reject": {
    "action": "rollback",        // retry | rollback | revise
    "feedback_to": "team",       // 거부 사유를 팀에 전달
    "max_reviews": 3             // 최대 리뷰 횟수 (무한 핑퐁 방지)
  }
}
```

```
BK-69: auto 통과 + review 거부 → on_review_reject 경로
BK-70: max_reviews 소진 → escalate (무한 핑퐁 방지)
```

#### 12.3.2 Gate 타임아웃

**문제**: Review gate에서 COO/Owner가 장기간 미응답이면?
- 현행: coo-watchdog.sh 5분 타임아웃
- Brick: 블록마다 다른 타임아웃 필요할 수 있음

**해결**:
```jsonc
"gate": {
  "review": {
    "coo": true,
    "timeout": 300000,           // 5분 (ms)
    "on_timeout": "auto_approve" // auto_approve | escalate | retry
  }
}
```

```
BK-71: review gate 타임아웃 → on_timeout 정책 실행
```

### 12.4 프리셋 확장 시 복잡도 관리

#### 12.4.1 YAML 지옥 방지 (Preset Sprawl)

**문제**: 프리셋이 50개가 되면 관리 불가능. 비슷한 프리셋이 미세하게 다른 변형으로 난립.

**해결 — 3단계 프리셋 관리**:

```
Level 1: Core Presets (System Layer — 수정 금지)
  t-pdca-l0.yaml, t-pdca-l1.yaml, t-pdca-l2.yaml, t-pdca-l3.yaml
  hotfix.yaml, research.yaml

Level 2: Extended Presets (Process Layer — extends로 파생)
  custom/competitor-analysis.yaml (extends: research)
  custom/landing-page-audit.yaml (extends: t-pdca-l2)

Level 3: One-shot Presets (Autonomy Layer — 일회성, 자동 정리)
  runtime/presets/temp-{workflow-id}.yaml
  → 워크플로우 완료 후 자동 삭제
```

- Core 프리셋은 6개 이하로 제한
- Extended는 반드시 `extends` 사용 (처음부터 작성 금지)
- One-shot은 런타임에서 자동 생성/삭제

#### 12.4.2 프리셋 검증 (Preset Validation)

```bash
# 프리셋 검증 명령
brick-engine validate --preset custom/my-workflow.yaml

# 검증 항목:
# 1. Block 스키마 유효성
# 2. Link 순환 참조 검사
# 3. Team 참조 존재 확인
# 4. Gate 타입 레지스트리 검증
# 5. extends 체인 충돌 검사
```

```
BK-72: 유효하지 않은 프리셋 로드 시 상세 에러 메시지
BK-73: extends 체인 충돌 (부모-자식 gate 모순) 감지
```

### 12.5 숨은 의존성

#### 12.5.1 블록 간 암묵적 의존성

**문제**: Link로 명시하지 않았지만 실제로 의존하는 관계.
- 예: Check 블록이 Do 블록의 **특정 커밋 해시**를 참조
- 예: Act 블록이 Check의 **match_rate 숫자**를 참조
- Link에는 "sequential" 이라고만 돼 있음

**해결 — Explicit Context Contract**:

```jsonc
// Link에 context contract 명시
{
  "from": "do",
  "to": "check",
  "type": "sequential",
  "context_contract": {
    "required": ["commit_hash", "files_changed"],  // 필수 전달
    "optional": ["test_results"]                    // 선택 전달
  }
}
```

- engine이 블록 완료 시 context_contract 필수 항목 검증
- 필수 항목 없으면 gate 실패 처리

```
BK-74: context_contract 필수 항목 미충족 시 gate 실패
```

#### 12.5.2 외부 시스템 의존성

**문제**: Gate 체크가 외부 시스템에 의존.
- `deploy_health` → Cloud Run URL 호출 (네트워크 필요)
- `tsc_pass` → node_modules 존재 필요
- Slack 알림 → webhook URL 유효 필요

**해결**:
- Gate에 `dependencies` 필드 추가
- engine이 gate 실행 전 dependency 체크
- 실패 시 gate 실행 자체를 보류 (`gate_blocked` 상태)

```jsonc
"gate": {
  "auto": [{
    "type": "deploy_health",
    "dependencies": ["network", "cloud_run_service"],
    "fallback": "skip_with_warning"    // 의존성 미충족 시
  }]
}
```

```
BK-75: gate dependency 미충족 → gate_blocked 상태 + 재시도 큐
```

### 12.6 관측성 (Observability)

#### 12.6.1 워크플로우 디버깅

**문제**: 블록이 왜 안 넘어가는지 파악 어려움. "gate 실패"만 나오고 뭐가 실패인지 모름.

**해결 — Gate 실행 상세 로그**:

```jsonc
// history 엔트리 확장
{
  "event": "gate_check",
  "block": "do",
  "at": "2026-04-02T11:00:00+09:00",
  "gates": [
    {"type": "tsc_pass", "result": "pass", "duration_ms": 3200},
    {"type": "match_rate", "result": "fail", "actual": 82, "required": 90, "duration_ms": 150},
    {"type": "build_pass", "result": "skip", "reason": "previous gate failed"}
  ],
  "overall": "fail",
  "on_fail_action": "retry (attempt 2/3)"
}
```

```
BK-76: gate 실패 시 개별 gate 체크 결과 상세 로깅
```

#### 12.6.2 워크플로우 메트릭

```jsonc
// 워크플로우 인스턴스에 메트릭 추가
"metrics": {
  "total_duration_ms": null,       // 전체 소요 시간
  "block_durations": {
    "plan": 720000,                // 12분
    "design": null                 // 아직 미완료
  },
  "gate_attempts": {
    "do": 2                        // Do 블록 gate 2번 시도
  },
  "retry_count": 1,
  "escalation_count": 0
}
```

```
BK-77: 워크플로우 완료 시 메트릭 자동 집계
```

### 12.7 보안 고려사항

#### 12.7.1 프리셋 변조 방지

**문제**: 팀원이 `.bkit/presets/` 파일을 수정해서 gate를 우회할 수 있음.

**해결**:
- Core 프리셋은 `readonly` 플래그 + validate-delegate.sh에서 수정 차단
- 프리셋 변경 시 git diff 감지 → COO 승인 필요
- **INV-8 추가**: Core 프리셋 무단 수정 불가

```
BK-78: Core 프리셋 수정 시도 → 차단 (INV-8)
```

#### 12.7.2 Gate 우회 방지

**문제**: `on_fail: skip` 이 gate 우회 수단으로 악용 가능.

**해결**:
- `skip` 정책은 L0 프리셋에서만 허용
- L1 이상에서 `skip` 사용 시 engine이 거부
- gate skip 이력은 별도 로그 (audit trail)

```
BK-79: L1+ 프리셋에서 gate on_fail: skip 사용 시 거부
BK-80: gate skip 실행 시 audit trail 기록
```

### 12.8 미래 확장 포인트 (Phase 2+)

#### 12.8.1 워크플로우 합성 (Workflow Composition)

워크플로우 안에 워크플로우를 블록으로 포함:

```yaml
# 메타 워크플로우
blocks:
  - {id: frontend, type: Workflow, preset: t-pdca-l2, what: "프론트엔드 개발"}
  - {id: backend, type: Workflow, preset: t-pdca-l2, what: "백엔드 개발"}
links:
  - {from: frontend, to: backend, type: parallel}
```

→ Phase 2 이후 구현. 현재는 설계만.

#### 12.8.2 블록 마켓플레이스

커뮤니티가 Block 타입 + 프리셋을 공유:
```
brick install @community/security-audit-block
brick install @community/performance-test-preset
```

→ 장기 비전. Brick이 CLI 도구로 발전할 때.

#### 12.8.3 실시간 워크플로우 수정 (Hot Reload)

실행 중 워크플로우에 블록 추가/제거:
```bash
brick-engine add-block --workflow {id} --block '{"id":"hotfix","type":"Do"}' --after do
```

→ 위험성 높음. Phase 3+ 에서 안전 장치와 함께.

---

## 13. 추가 TDD 케이스 (심층 분석 항목)

| ID | 테스트 | Design 항목 | 검증 |
|----|--------|------------|------|
| BK-60 | 순환 참조 워크플로우 거부 | §12.1.2 | A→B→C→A (non-loop) → 로드 실패 |
| BK-61 | loop max_retries 기본값 | §12.1.2 | 미지정 → 3 적용 |
| BK-62 | idempotent=false 재실행 시 review 강제 | §12.1.3 | Act 재실행 → review gate on |
| BK-63 | execution_count 추적 | §12.1.3 | 블록 2회 실행 → count=2 |
| BK-64 | exclusive 팀 동시 요청 큐 | §12.2.1 | 2 workflow → 1 실행 + 1 대기 |
| BK-65 | L0 선점 L2 블록 | §12.2.1 | L0 진입 → L2 suspended |
| BK-66 | suspended 블록 자동 재개 | §12.2.1 | L0 완료 → L2 resume |
| BK-67 | 팀원 heartbeat 타임아웃 | §12.2.2 | heartbeat 없음 → worker_failure |
| BK-68 | worker_recovery: recreate | §12.2.2 | crash → 새 팀원 + 재개 |
| BK-69 | auto 통과 + review 거부 경로 | §12.3.1 | reject → rollback |
| BK-70 | max_reviews 소진 escalate | §12.3.1 | 3회 거부 → escalate |
| BK-71 | review gate 타임아웃 | §12.3.2 | timeout → auto_approve |
| BK-72 | 유효하지 않은 프리셋 거부 | §12.4.2 | 스키마 에러 → 상세 메시지 |
| BK-73 | extends 충돌 감지 | §12.4.2 | 부모-자식 gate 모순 → 에러 |
| BK-74 | context_contract 미충족 | §12.5.1 | 필수 항목 없음 → gate fail |
| BK-75 | gate dependency 미충족 | §12.5.2 | network 없음 → gate_blocked |
| BK-76 | gate 실패 상세 로깅 | §12.6.1 | 개별 gate 결과 + duration 기록 |
| BK-77 | 워크플로우 메트릭 집계 | §12.6.2 | 완료 시 duration + attempts 합산 |
| BK-78 | Core 프리셋 수정 차단 | §12.7.1 | readonly → 수정 거부 |
| BK-79 | L1+ skip 정책 거부 | §12.7.2 | L2 preset + skip → 거부 |
| BK-80 | gate skip audit trail | §12.7.2 | L0 skip 실행 → 로그 기록 |

---

### 최종 TDD 커버리지 요약

| Design 섹션 | TDD 케이스 | 커버리지 |
|-------------|-----------|---------|
| System Layer 불변 규칙 (§1.2) | BK-01~07 (7건) | 100% |
| Block (§2) | BK-08~23 (16건) | 100% |
| Team (§3) | BK-24~29 (6건) | 100% |
| Link (§4) | BK-30~44 (15건) | 100% |
| Workflow Engine (§5-6) | BK-45~51 (7건) | 100% |
| 기존 인프라 호환 (§7) | BK-52~55 (4건) | 100% |
| 비교 분석 (§8) | BK-56~57 (2건) | 100% |
| 시각화 (§9) | BK-58~59 (2건) | 100% |
| **심층 분석 (§12)** | **BK-60~80 (21건)** | **100%** |
| **총계** | **80건** | **Gap 0건 = 100%** |

---

_Design 완료. 모찌리포트 배포로 넘어간다._
