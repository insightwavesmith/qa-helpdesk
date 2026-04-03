# 🧱 Brick — 상세 기획서 (Product Specification)

> **버전**: v1.0 | **작성일**: 2026-04-03 | **작성자**: 모찌 (COO)
> **목적**: 개발자 + 비개발자 모두가 이해할 수 있는 브릭 전체 구조·기능·동작 상세 문서
> **용도**: QA 기준, 기능 사용 가이드, 베타 테스트 체크리스트

---

## 목차

1. [브릭이란?](#1-브릭이란)
2. [핵심 개념 — 3축 구조](#2-핵심-개념--3축-구조)
3. [아키텍처 — 시스템 구조도](#3-아키텍처--시스템-구조도)
4. [데이터 모델 — DB 스키마](#4-데이터-모델--db-스키마)
5. [엔진 — 워크플로우 실행](#5-엔진--워크플로우-실행)
6. [Gate — 품질 검증 시스템](#6-gate--품질-검증-시스템)
7. [Link — 블록 간 연결 규칙](#7-link--블록-간-연결-규칙)
8. [Adapter — 실행자 연결](#8-adapter--실행자-연결)
9. [프리셋 — 워크플로우 템플릿](#9-프리셋--워크플로우-템플릿)
10. [프로젝트 레이어 — 컨텍스트 자동 주입](#10-프로젝트-레이어--컨텍스트-자동-주입)
11. [CEO 승인 Gate](#11-ceo-승인-gate)
12. [R-Brick — 자동 회고 시스템](#12-r-brick--자동-회고-시스템)
13. [대시보드 — 프론트엔드](#13-대시보드--프론트엔드)
14. [API 전체 목록](#14-api-전체-목록)
15. [Hook 시스템 — 자동 강제 규칙](#15-hook-시스템--자동-강제-규칙)
16. [불변식 (Invariants) — 깨지면 안 되는 규칙](#16-불변식-invariants--깨지면-안-되는-규칙)
17. [미구현 항목 (베타 이후)](#17-미구현-항목-베타-이후)
18. [QA 체크리스트](#18-qa-체크리스트)

---

## 1. 브릭이란?

### 비유로 이해하기

레고 블록을 생각해보자. 각 블록은 하나의 작업(기획, 설계, 구현, 검증...)이고, 이 블록들을 순서대로 연결하면 하나의 워크플로우가 된다. 브릭은 이 **레고 블록 워크플로우를 자동으로 실행**해주는 엔진이다.

```
일반적인 개발 프로세스:
"이거 만들어" → 기획 → 설계 → 구현 → 테스트 → 배포

브릭이 하는 것:
"이거 만들어" → [Plan 블록] → [Design 블록] → [CEO 승인] → [Do 블록] → [Check 블록] → [Act 블록]
                   PM팀         PM팀       Smith님 클릭    CTO팀        CTO팀        CTO팀
                               ↕ 자동              ↕ 자동         ↕ 자동
```

### 한 줄 정의

> **브릭 = AI 에이전트팀의 작업을 자동으로 흘려보내는 워크플로우 엔진.**
> 각 블록이 끝나면 품질 검증(Gate) 후, 다음 블록으로 자동 전달(Link), 실행자(Adapter)가 작업.

### 왜 만들었나?

| 이전 (수동) | 이후 (브릭) |
|------------|-----------|
| COO가 PM한테 "기획해" → 기다림 → "설계해" → 기다림 → CTO한테 "구현해" | Smith님이 "이거 해" → 브릭이 전부 자동으로 흘려보냄 |
| COO가 독단으로 CTO한테 직접 전달 (사고) | CEO 승인 Gate에서 Smith님이 승인해야 다음 단계 진행 |
| 같은 실수 반복 (교훈이 전달 안 됨) | R-Brick이 자동 회고 → 다음 TASK에 교훈 자동 주입 |
| PM이 "우리 DB가 뭐지?" 모르고 Design 작성 | 프로젝트 컨텍스트가 자동 주입 (SQLite, 포트 등) |

### 코드 규모

| 영역 | 파일 수 | 코드 라인 | 언어 |
|------|--------|----------|------|
| Python 엔진 | 80+ | 6,720줄 | Python |
| Express 서버 | 20 | 2,312줄 | TypeScript |
| 프론트엔드 | 50+ | 4,516줄 | React + TypeScript |
| 프리셋 YAML | 7 | ~400줄 | YAML |
| **합계** | **150+** | **~14,000줄** | — |

---

## 2. 핵심 개념 — 3축 구조

브릭의 핵심은 3가지 축이다. 이 3축이 모든 동작을 제어한다.

```
┌─────────────────────────────────────────────┐
│              Brick 엔진                      │
│                                             │
│   🚪 Gate (품질 검증)                        │
│   "이 블록 결과가 기준을 통과했나?"            │
│   → 통과: 다음으로 / 실패: 재시도 또는 중단    │
│                                             │
│   🔗 Link (연결 규칙)                        │
│   "다음에 어떤 블록을 실행할까?"               │
│   → 순차 / 분기 / 루프 / 병렬               │
│                                             │
│   🔌 Adapter (실행자 연결)                   │
│   "누가 이 블록을 실행할까?"                  │
│   → Claude Agent Teams / Human / Webhook    │
│                                             │
└─────────────────────────────────────────────┘
```

### 비유

| 축 | 비유 | 예시 |
|----|------|------|
| **Gate** | 시험관 | "match_rate가 90% 넘어야 통과" |
| **Link** | 철로 스위치 | "check 실패하면 do로 돌아가" (루프) |
| **Adapter** | 전화 연결원 | "plan 블록은 PM팀한테 보내" |

### 기술 상세

#### Gate 7종
| 타입 | 설명 | 예시 |
|------|------|------|
| `command` | 셸 명령 실행 후 exit code 검사 | `tsc --noEmit` (TypeScript 에러 0개) |
| `http` | HTTP 요청 후 응답 코드 검사 | 서버 헬스체크 |
| `prompt` | LLM에게 판단 요청 | "이 코드 품질이 충분한가?" |
| `agent` | 에이전트에게 검토 요청 | COO 산출물 검토 |
| `review` | 코드/산출물 품질 검토 | PR 리뷰 |
| `metric` | 숫자 기준 검증 | `match_rate >= 90` |
| `approval` | **사람의 명시적 승인** | CEO 승인 Gate |

#### Link 7종
| 타입 | 설명 | 비유 |
|------|------|------|
| `sequential` | A 끝나면 B 시작 | 직선 철로 |
| `branch` | 조건에 따라 분기 | Y자 갈림길 |
| `loop` | 조건 불충족 시 반복 | 원형 철로 |
| `parallel` | 동시 실행 | 복선 철로 |
| `compete` | 가장 빨리 끝난 것 채택 | 경쟁 |
| `cron` | 시간 기반 트리거 | 정기 열차 |

#### Adapter 9종
| 타입 | 설명 | 용도 |
|------|------|------|
| `claude_agent_teams` | Claude Agent Teams tmux | CTO 구현 작업 |
| `claude_code` | Claude Code 단독 세션 | 단순 작업 |
| `codex` | OpenAI Codex | 코드 생성 |
| `human` | **사람** (승인/리뷰) | CEO 승인 |
| `human_management` | 사람 관리 작업 | — |
| `management` | 관리 도구 | — |
| `mcp_bridge` | MCP 프로토콜 | 외부 도구 연결 |
| `webhook` | HTTP webhook | 외부 서비스 |
| `base` | 추상 베이스 | (상속용) |

---

## 3. 아키텍처 — 시스템 구조도

### 전체 구조

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   프론트엔드  │     │   Express 서버    │     │   Python 엔진     │
│   (React)    │────▶│   (TypeScript)   │────▶│   (FastAPI)       │
│   :3201      │ API │   :3200          │Bridge│   :3202           │
│              │     │                  │     │                   │
│ 10개 페이지   │     │ 62개 API 라우트   │     │ 엔진 코어          │
│ 9개 hooks    │     │ DB (SQLite)      │     │ Gate 7종          │
│ 캔버스 편집기  │     │ WebSocket        │     │ Link 7종          │
│              │     │                  │     │ Adapter 9종       │
└─────────────┘     └──────────────────┘     └──────────────────┘
                              │                        │
                              ▼                        ▼
                    ┌──────────────┐          ┌──────────────┐
                    │  SQLite DB   │          │  tmux 세션들   │
                    │ .data/bkit.db│          │ sdk-cto       │
                    │ 24개 테이블   │          │ sdk-pm        │
                    └──────────────┘          └──────────────┘
```

### 데이터 흐름 (워크플로우 시작 → 완료)

```
1. Smith님: "처방 V3 구현해"

2. Express: POST /api/brick/executions
   → 프리셋(t-pdca-l2) 로드
   → ProjectContextBuilder로 프로젝트 컨텍스트 빌드
   → Python 엔진에 start 요청 (Bridge)

3. Python 엔진: WorkflowExecutor.start()
   → StateMachine: 첫 블록(plan) QUEUED
   → Adapter(claude_agent_teams): PM팀 tmux에 TASK 전달
   → 블록 상태: plan = RUNNING

4. PM팀: Plan 문서 작성 완료
   → Express: POST /executions/{id}/blocks/plan/complete
   → Python 엔진: complete_block("plan")
   → Gate 검증: 산출물 존재 확인
   → Gate 통과 → Link 평가: sequential → design QUEUED
   → design 블록 시작

5. (반복: design → coo_review → ceo_approval → do → check → act)

6. check 블록:
   → Gate: match_rate >= 90 확인
   → 실패 시: Link(loop) → do로 회귀 (최대 3회)
   → 통과 시: Link(sequential) → act 진행

7. act 블록 완료 → 워크플로우 COMPLETED
```

### 기술 스택

| 계층 | 기술 | 버전 |
|------|------|------|
| 프론트엔드 | React + TypeScript + Vite | React 19 |
| UI 라이브러리 | React Flow (캔버스) | v12 |
| 백엔드 API | Express.js | v5 |
| 워크플로우 엔진 | Python (자체 구현) | 3.14 |
| 웹 프레임워크 | FastAPI (Python) | — |
| DB | SQLite (better-sqlite3) | — |
| ORM | drizzle-orm | — |
| 실시간 통신 | WebSocket | — |
| 에이전트 연동 | tmux + Claude Agent Teams | v2.1.91 |

---

## 4. 데이터 모델 — DB 스키마

### 테이블 목록 (24개)

| 카테고리 | 테이블 | 설명 |
|---------|--------|------|
| **코어** | `brick_executions` | 워크플로우 실행 인스턴스 |
| | `brick_presets` | 프리셋 (워크플로우 템플릿) |
| | `brick_block_types` | 블록 타입 정의 (Plan, Design, Do...) |
| | `brick_teams` | 팀 정의 (PM, CTO, COO...) |
| | `brick_links` | 블록 간 연결 규칙 |
| **실행** | `brick_execution_logs` | 실행 로그 (이벤트 기록) |
| | `brick_gate_results` | Gate 검증 결과 |
| **학습** | `brick_learning_proposals` | R-Brick 개선 제안 |
| **승인** | `brick_approvals` | CEO 승인 요청/결과 |
| **프로젝트** | `brick_projects` | 프로젝트 (bscamp) |
| | `brick_invariants` | 불변식 레지스트리 |
| | `brick_invariant_history` | 불변식 변경 이력 |
| **운영** | `agents` | 에이전트 목록 |
| | `workflow_chains` | PDCA 체인 |
| | `workflow_steps` | 체인 내 단계 |
| | `pdca_features` | 피처별 PDCA 상태 |
| | `events` | 시스템 이벤트 |
| | `notifications` | 알림 |
| | `heartbeat_runs` | 하트비트 기록 |
| | `budget_policies` | 예산 정책 |
| | `budget_incidents` | 예산 초과 사건 |
| | `cost_events` | 비용 이벤트 |
| | `tickets` | 티켓 |
| | `knowledge_entries` | 지식 베이스 |
| | `routines` | 반복 작업 |

### 핵심 테이블 상세

#### brick_executions (워크플로우 실행)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | INTEGER PK | 자동 증가 |
| `preset_id` | INTEGER FK | 사용된 프리셋 |
| `feature` | TEXT | 피처 이름 ("engine-bridge") |
| `status` | TEXT | 실행 상태 (pending/running/completed/failed) |
| `current_block` | TEXT | 현재 실행 중인 블록 ID |
| `blocks_state` | TEXT (JSON) | 각 블록의 상태 JSON |
| `engine_workflow_id` | TEXT | Python 엔진의 워크플로우 ID |
| `project_id` | TEXT FK | 프로젝트 (nullable, 하위호환) |
| `started_at` | TEXT | 시작 시간 |
| `completed_at` | TEXT | 완료 시간 |
| `created_at` | TEXT | 생성 시간 |

#### brick_approvals (CEO 승인)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT PK | UUID (앱 레이어 생성) |
| `execution_id` | INTEGER FK | 워크플로우 ID |
| `block_id` | TEXT | 승인 대상 블록 |
| `approver` | TEXT | 승인자 ("smith") |
| `status` | TEXT | waiting/approved/rejected/escalated/timeout |
| `summary` | TEXT | LLM 생성 요약 |
| `artifacts` | TEXT (JSON) | 첨부 산출물 |
| `reject_reason` | TEXT | 반려 사유 |
| `reminder_count` | INTEGER | 리마인더 횟수 |
| `timeout_at` | TEXT | 타임아웃 시각 |
| `resolved_at` | TEXT | 처리 시각 |

#### brick_invariants (불변식)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| `id` | TEXT | 불변식 ID ("INV-EB-3") |
| `project_id` | TEXT FK | 프로젝트 |
| `design_source` | TEXT | 출처 Design 파일명 |
| `description` | TEXT | 설명 |
| `constraint_type` | TEXT | enum_values/port/syntax/count/rule |
| `constraint_value` | TEXT (JSON) | 제약 내용 |
| `status` | TEXT | active/deprecated/superseded |
| `version` | INTEGER | 버전 (갱신 시 +1) |

---

## 5. 엔진 — 워크플로우 실행

### 핵심 클래스

| 클래스 | 파일 | 역할 |
|--------|------|------|
| `WorkflowExecutor` | `engine/executor.py` | 워크플로우 시작/완료/중단 |
| `StateMachine` | `engine/state_machine.py` | 상태 전이 (블록 PENDING→QUEUED→RUNNING→COMPLETED) |
| `PresetLoader` | `engine/executor.py` | YAML 프리셋 로드 + 파싱 |
| `ConcreteGateExecutor` | `gates/concrete.py` | Gate 7종 실행 |
| `TeammateLifecycleManager` | `engine/lifecycle.py` | 팀원 수명 관리 (미완성) |

### 블록 상태 전이 (BlockStatus)

```
PENDING → QUEUED → RUNNING → GATE_CHECKING → COMPLETED
                       ↓                         ↓
                   SUSPENDED              WAITING_APPROVAL
                       ↓                         ↓
                   (resume)               APPROVED → COMPLETED
                                          REJECTED → (loop back)
                                               ↓
                                           FAILED (max retries)
```

**9가지 상태:**

| 상태 | 설명 | 비유 |
|------|------|------|
| `pending` | 대기 중 (선행 블록 미완료) | 줄 서서 기다리는 중 |
| `queued` | 실행 대기 (선행 완료, 차례 됨) | 다음 순서 |
| `running` | 실행 중 | 작업 중 |
| `gate_checking` | Gate 검증 중 | 시험 보는 중 |
| `waiting_approval` | 사람 승인 대기 | Smith님 결재 대기 |
| `completed` | 완료 | 끝 |
| `failed` | 실패 (재시도 초과) | 포기 |
| `rejected` | 반려 (CEO가 반려) | 돌려보냄 |
| `suspended` | 일시정지 | 잠시 멈춤 |

### Express → Python 엔진 연결 (Engine Bridge)

```
Express (TypeScript)                    Python (FastAPI)
┌──────────────────┐                   ┌──────────────────┐
│ POST /executions │──── HTTP ────────▶│ POST /engine/start│
│                  │  localhost:3202   │                  │
│ POST /blocks/    │──── HTTP ────────▶│ POST /engine/    │
│   {id}/complete  │                   │   complete-block │
│                  │                   │                  │
│ GET /executions  │◀── DB 직접 읽기    │ (엔진은 상태만    │
│                  │   (SQLite)        │  반환, DB는      │
│                  │                   │  Express가 저장)  │
└──────────────────┘                   └──────────────────┘
```

**규칙 (INV-EB-1):** POST(쓰기)는 반드시 Python 엔진을 거쳐야 한다. Express가 DB에 직접 쓰면 Gate/Link/Adapter가 동작하지 않는다.

---

## 6. Gate — 품질 검증 시스템

### 동작 원리

```
블록 실행 완료
  ↓
Gate 검증 시작 (gate_checking 상태)
  ↓
handlers 순서대로 실행:
  ├─ handler 1: metric (match_rate >= 90)  → passed
  ├─ handler 2: command (tsc --noEmit)     → passed
  └─ handler 3: approval (CEO 승인)        → waiting
  ↓
전부 통과 → 다음 블록으로 (Link 평가)
하나라도 실패 → on_fail 정책 실행:
  ├─ retry: 같은 블록 재실행 (max_retries까지)
  ├─ fail: 블록 FAILED → 워크플로우 중단
  └─ loop: Link(loop)로 이전 블록 회귀
```

### Gate 타입별 상세

#### metric Gate (가장 자주 사용)
```yaml
# 프리셋 YAML 설정
gate:
  handlers:
    - type: metric
      metric: match_rate
      threshold: 90
  on_fail: retry
  max_retries: 3
```
- `metric`: 검사할 메트릭 이름
- `threshold`: 최소 기준값
- 블록 완료 시 `metrics.match_rate`가 90 이상인지 확인

#### approval Gate (CEO 승인)
```yaml
gate:
  handlers:
    - type: approval
      approval:
        approver: smith
        channel: both              # slack + dashboard
        slack_channel: "C0AN7ATS4DD"
        timeout_seconds: 86400     # 24시간
        on_timeout: escalate       # 자동 승인 안 함
        reminder_interval: 3600    # 1시간마다 리마인더
        max_reminders: 3
```
- `adapter: human` — 에이전트가 우회 불가. 사람만 승인
- 반려 시 사유 포함해서 Design 블록으로 회귀

#### command Gate
```
gate:
  handlers:
    - type: command
      command: "npx tsc --noEmit"
      timeout: 60
```
- 셸 명령 실행 → exit code 0이면 통과

---

## 7. Link — 블록 간 연결 규칙

### 동작 원리

Gate 통과 후, Link가 "다음에 어떤 블록을 실행할지" 결정한다.

```
블록 A 완료 + Gate 통과
  ↓
Link 평가:
  ├─ sequential(A→B): 무조건 B 실행
  ├─ loop(check→do, condition: match_rate < 90): 조건 만족 시 do로 회귀
  ├─ branch(A→B, condition: status == 'error'): 조건 분기
  └─ parallel(A→[B,C]): B와 C 동시 실행
```

### 프리셋에서의 Link 정의

```yaml
# t-pdca-l2-approval.yaml
links:
  - {from: plan, to: design, type: sequential}
  - {from: design, to: coo_review, type: sequential}
  - {from: coo_review, to: ceo_approval, type: sequential}
  - {from: ceo_approval, to: do, type: sequential}          # 승인 시
  - {from: ceo_approval, to: design, type: loop,             # 반려 시
     condition: {approval_status: rejected}, max_retries: 3}
  - {from: do, to: check, type: sequential}
  - {from: check, to: do, type: loop,                        # 품질 미달 시
     condition: {match_rate_below: 90}, max_retries: 3}
  - {from: check, to: act, type: sequential}
```

### 비유

```
plan ──────▶ design ──────▶ coo_review ──────▶ ceo_approval
                                                    │
                                          ┌─────────┤
                                          │ 승인    │ 반려
                                          ▼         ▼
                                         do    design (다시)
                                          │
                                          ▼
                                        check
                                          │
                                ┌─────────┤
                                │ 통과    │ 실패
                                ▼         ▼
                               act    do (다시, 최대 3회)
```

---

## 8. Adapter — 실행자 연결

### 동작 원리

블록이 QUEUED 되면, Adapter가 "누가 이 블록을 실행할지" 결정하고 연결한다.

```python
# TeamAdapter 인터페이스
class TeamAdapter(ABC):
    async def start_block(block, context) -> execution_id   # 블록 실행 시작
    async def check_status(execution_id) -> AdapterStatus   # 실행 상태 확인
    async def get_artifacts(execution_id) -> list[str]      # 산출물 수집
    async def cancel(execution_id) -> bool                  # 실행 취소
```

### 프리셋에서의 팀 배정

```yaml
# t-pdca-l2-approval.yaml
teams:
  plan:         {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  design:       {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  coo_review:   {adapter: claude_agent_teams, config: {session: sdk-coo, role: COO}}
  ceo_approval: {adapter: human, config: {approver: smith}}     # 사람!
  do:           {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  check:        {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  act:          {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
```

### claude_agent_teams Adapter 동작

```
1. start_block() 호출
2. MCP 프로토콜로 Claude Agent Teams에 TASK 전달 시도
3. MCP 실패 시 → fallback_to_tmux = true → tmux send-keys로 직접 전달
4. 팀 리더가 받아서 팀원한테 delegate
5. check_status()로 상태 폴링
6. 완료 시 get_artifacts()로 산출물 수집
```

---

## 9. 프리셋 — 워크플로우 템플릿

### 프리셋 목록 (7개)

| 프리셋 | 용도 | 블록 수 | 승인 Gate |
|--------|------|--------|----------|
| `hotfix.yaml` | 프로덕션 긴급 대응 | 1 | ❌ |
| `research.yaml` | 조사/탐색 | 2 | ❌ |
| `t-pdca-l0.yaml` | 응급 (최소 PDCA) | 2 | ❌ |
| `t-pdca-l1.yaml` | 경량 (Plan+Do+Check) | 3 | ❌ |
| `t-pdca-l2.yaml` | 표준 (전체 PDCA) | 5 | ❌ |
| `t-pdca-l2-approval.yaml` | 표준 + CEO 승인 | 7 | ✅ |
| `t-pdca-l3.yaml` | 풀 (보안 감사 포함) | 6 | ✅ (예정) |

### T-PDCA L2 (표준) 블록 구성

```
[Plan] → [Design] → [Do] → [Check] → [Act]
  PM        PM       CTO     CTO      CTO
```

### T-PDCA L2 + CEO 승인 블록 구성

```
[Plan] → [Design] → [COO 검토] → [CEO 승인] → [Do] → [Check] → [Act]
  PM        PM        COO       Smith님(사람)   CTO     CTO      CTO
```

### 프리셋 YAML 구조 (스키마: brick/preset-v2)

```yaml
$schema: brick/preset-v2
name: "프리셋 이름"
description: "설명"
level: 2                    # 0~3

blocks:                     # 블록 목록
  - id: plan
    type: Plan
    what: "요구사항 분석"
    done:
      artifacts: ["docs/01-plan/features/{feature}.plan.md"]
      metrics: {}

links:                      # 블록 간 연결
  - {from: plan, to: design, type: sequential}

teams:                      # 블록별 실행자 배정
  plan: {adapter: claude_agent_teams, config: {session: sdk-pm}}
```

---

## 10. 프로젝트 레이어 — 컨텍스트 자동 주입

### 문제

PM이 Design 쓸 때 "우리 DB가 뭐지?" 모르고 PostgreSQL 문법으로 작성하는 일이 반복됐다.

### 해결

프로젝트 레벨에서 인프라 제약을 정의하고, **모든 브릭 시작 시 자동 주입**.

### .bkit/project.yaml

```yaml
id: bscamp
name: "자사몰사관학교"
infrastructure:
  db:
    type: sqlite
    orm: drizzle-orm
    driver: better-sqlite3
    constraints:
      - "UUID 컬럼은 TEXT 타입 + 앱에서 uuid() 생성"
      - "JSON 컬럼은 TEXT 타입 + JSON.parse() 사용"
      - "RLS 미지원 — Express 미들웨어에서 권한 검증"
  services:
    - {name: dashboard, port: 3200, language: typescript}
    - {name: engine, port: 3202, language: python}
```

### 자동 주입 흐름

```
POST /api/brick/executions {feature: "v3", projectId: "bscamp"}
  ↓
ProjectContextBuilder.build("bscamp")
  ├─ loadProject()        → 인프라 제약 (SQLite, 포트...)
  ├─ loadInvariants()     → INV-EB-1~11 목록
  ├─ loadRecentFailures() → 최근 실패 10건
  └─ loadRecentArtifacts()→ 최근 산출물 20건
  ↓
Python 엔진: context.project = { infrastructure, invariants, ... }
  ↓
모든 블록에서 context.project.* 접근 가능
  → PM이 "db.type = sqlite" 자동으로 알게 됨
```

### 불변식 레지스트리

현재 등록된 불변식 11건 (INV-EB-1~11):

| ID | 설명 |
|----|------|
| INV-EB-1 | POST /executions는 반드시 Python 엔진 경유 |
| INV-EB-2 | complete-block 시 Gate 결과 저장 필수 |
| INV-EB-3 | BlockStatus 9가지만 허용 |
| INV-EB-4 | 엔진 다운 시 GET 정상, POST 502 |
| INV-EB-5 | seed 시 블록 타입 10종, 팀 3개, 프리셋 4개 |
| INV-EB-6~11 | (기타 엔진 규칙) |

---

## 11. CEO 승인 Gate

### 왜 만들었나

COO(모찌)가 Design 검토 후 Smith님 승인 없이 CTO한테 직접 구현을 넘기는 사고가 발생했다. 이걸 시스템으로 강제하기 위해 만든 Gate.

### 동작 흐름

```
Design 완료 → COO 검토 통과 → CEO 승인 Gate 진입
  ↓
1. 산출물 수집 (Plan + Design 문서)
2. Slack #brick-approvals에 승인 요청 메시지
3. 대시보드 /approvals 페이지에 승인 UI
4. 블록 상태: WAITING_APPROVAL
  ↓
Smith님 선택:
  ✅ 승인 → Do 블록 시작
  ❌ 반려 (사유 입력) → Design 블록으로 회귀 (최대 3회)
  ⏰ 24시간 무응답 → Slack DM으로 긴급 알림 (자동 승인 안 함)
```

### API

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/brick/approvals` | 승인 요청 생성 |
| GET | `/api/brick/approvals?status=waiting` | 대기 중 목록 |
| POST | `/api/brick/approve/:executionId` | 승인 |
| POST | `/api/brick/reject/:executionId` | 반려 (reason 필수) |

### 핵심 규칙
- `adapter: human` — 에이전트가 우회 불가
- `on_timeout: escalate` — 자동 승인 절대 안 함 (L2 이상)
- 반려 시 사유가 Design 블록 context에 자동 포함

---

## 12. R-Brick — 자동 회고 시스템

### 왜 만들었나

PDCA가 끝나면 보고서를 쓰지만, 교훈이 다음 TASK에 전달되지 않아 같은 실수가 반복됐다.

### 3단계 동작

```
PDCA 완료 (Act 블록 끝)
  ↓
[R1: Collect] ReviewCollector
  ├─ Plan/Design/Report 문서 수집
  ├─ Gate 통과/실패 이력 분석
  ├─ Git 커밋 히스토리 분석
  ├─ 블록 실행 시간 분석
  └─ 교훈 구조화 (Lesson 객체)
  ↓
[R2: Propose] LearningHarness
  ├─ 교훈 → 제안 변환 (카테고리별)
  │   design_gap     → tdd_addition, gate_addition
  │   process_bottleneck → preset_adjustment
  │   tool_misuse    → claudemd_update
  │   positive_pattern → memory_update
  ├─ 리스크 레벨 산정 (low/medium/high)
  └─ 자동 적용 가능 여부 판단
  ↓
[R3: Apply] Applier
  ├─ 자동 적용 (low risk): memory 업데이트, postmortem 기록
  └─ 수동 승인 (medium+): hook 수정, TDD 추가, CLAUDE.md 갱신
      → Smith님 승인 후 적용
```

### 교훈 카테고리

| 카테고리 | 설명 | 제안 타입 |
|---------|------|----------|
| `design_gap` | 설계 누락 | TDD 추가, Gate 추가 |
| `implementation_bug` | 구현 버그 패턴 | TDD 추가, memory 업데이트 |
| `process_bottleneck` | 프로세스 병목 | 프리셋 조정 |
| `tool_misuse` | 도구 오용 | CLAUDE.md 갱신 |
| `communication_fail` | 팀 간 소통 실패 | hook 개선 |
| `gate_weakness` | Gate가 못 잡은 문제 | Gate 추가 |
| `positive_pattern` | 잘한 점 (반복) | memory 업데이트 |

---

## 13. 대시보드 — 프론트엔드

### 페이지 목록 (10개)

| 경로 | 페이지 | 설명 |
|------|--------|------|
| `/brick` | BrickOverviewPage | 전체 워크플로우 목록 + 상태 |
| `/brick/canvas/:id` | BrickCanvasPage | 캔버스 편집기 (React Flow) |
| `/brick/blocks` | BlockCatalogPage | 블록 타입 카탈로그 |
| `/brick/teams` | TeamManagePage | 팀 관리 |
| `/brick/teams/:id` | TeamDetailPage | 팀 상세 (멤버, MCP, 스킬) |
| `/brick/presets` | PresetListPage | 프리셋 목록 |
| `/brick/presets/:id` | PresetEditorPage | 프리셋 편집기 |
| `/brick/runs` | RunHistoryPage | 실행 이력 |
| `/brick/runs/:id` | RunDetailPage | 실행 상세 (블록별 상태, 로그) |
| `/brick/learning` | LearningHarnessPage | R-Brick 학습 제안 관리 |

### 컴포넌트 구조

```
pages/
  ├── BrickOverviewPage      → hooks/useExecutions
  ├── BrickCanvasPage         → components/nodes/*, edges/*, panels/*
  ├── RunDetailPage           → components/timeline/ExecutionTimeline
  └── LearningHarnessPage     → components/learning/ProposalDetail

components/brick/
  ├── nodes/           (캔버스 노드)
  │   ├── BlockNode    (일반 블록)
  │   ├── StartNode    (시작점)
  │   ├── EndNode      (종료점)
  │   ├── NotifyNode   (알림 노드)
  │   └── ReviewNode   (회고 노드)
  ├── edges/
  │   └── LinkEdge     (연결선)
  ├── panels/          (상세 패널)
  │   ├── BlockDetailPanel
  │   ├── GateConfigPanel
  │   ├── LinkDetailPanel
  │   └── NotifyConfigPanel
  ├── toolbar/
  │   └── CanvasToolbar
  ├── timeline/
  │   └── ExecutionTimeline
  └── team/
      ├── TeamMemberList
      ├── AdapterSelector
      ├── ModelSelector
      └── SkillEditor
```

### React Hooks (9개)

| Hook | 용도 |
|------|------|
| `useBlockTypes` | 블록 타입 CRUD |
| `useBrickLiveUpdates` | WebSocket 실시간 업데이트 |
| `useExecutions` | 워크플로우 실행 CRUD |
| `useGates` | Gate 결과 조회/오버라이드 |
| `useLearning` | R-Brick 학습 제안 |
| `useLinks` | 블록 간 연결 CRUD |
| `usePresets` | 프리셋 CRUD |
| `useSystem` | 시스템 불변식 조회 |
| `useTeams` | 팀 CRUD |

---

## 14. API 전체 목록

### 워크플로우 실행 (Executions)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/brick/executions` | 워크플로우 시작 |
| GET | `/api/brick/executions` | 목록 조회 |
| GET | `/api/brick/executions/:id` | 상세 조회 |
| GET | `/api/brick/executions/:id/logs` | 실행 로그 |
| POST | `/api/brick/executions/:id/blocks/:blockId/complete` | 블록 완료 |
| POST | `/api/brick/executions/:id/pause` | 일시정지 |

### 워크플로우 제어

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/brick/workflows/:id/resume` | 재개 |
| POST | `/api/brick/workflows/:id/cancel` | 취소 |

### 프리셋

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/presets` | 목록 |
| GET | `/api/brick/presets/:id` | 상세 |
| POST | `/api/brick/presets` | 생성 |
| PUT | `/api/brick/presets/:id` | 수정 |
| DELETE | `/api/brick/presets/:id` | 삭제 |
| GET | `/api/brick/presets/:id/export` | YAML 내보내기 |
| POST | `/api/brick/presets/import` | YAML 가져오기 |
| POST | `/api/brick/presets/:id/apply` | 프리셋 적용 (실행 시작) |

### 블록 타입

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/block-types` | 목록 |
| POST | `/api/brick/block-types` | 생성 |
| PUT | `/api/brick/block-types/:name` | 수정 |
| DELETE | `/api/brick/block-types/:name` | 삭제 |

### 팀

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/teams` | 목록 |
| GET | `/api/brick/teams/:id` | 상세 |
| POST | `/api/brick/teams` | 생성 |
| PUT | `/api/brick/teams/:id` | 수정 |
| DELETE | `/api/brick/teams/:id` | 삭제 |
| GET | `/api/brick/teams/:id/members` | 멤버 목록 |
| POST | `/api/brick/teams/:id/members` | 멤버 추가 |
| DELETE | `/api/brick/teams/:id/members/:memberId` | 멤버 제거 |
| GET | `/api/brick/teams/:id/mcp` | MCP 설정 |
| PUT | `/api/brick/teams/:id/mcp` | MCP 수정 |
| PUT | `/api/brick/teams/:id/model` | 모델 변경 |
| PUT | `/api/brick/teams/:id/skills` | 스킬 설정 |
| GET | `/api/brick/teams/:id/status` | 팀 상태 |

### 링크

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/links` | 목록 |
| GET | `/api/brick/link-types` | 링크 타입 목록 |
| POST | `/api/brick/links` | 생성 |
| PUT | `/api/brick/links/:id` | 수정 |
| DELETE | `/api/brick/links/:id` | 삭제 |

### Gate

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/gates/:gateId/result` | 결과 조회 |
| POST | `/api/brick/gates/:gateId/override` | 강제 통과 |

### 승인

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/brick/approvals` | 승인 요청 생성 |
| GET | `/api/brick/approvals` | 대기 목록 |
| POST | `/api/brick/approve/:executionId` | 승인 |
| POST | `/api/brick/reject/:executionId` | 반려 |

### 회고 (Review)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/brick/review/:executionId/:blockId/approve` | 회고 승인 |
| POST | `/api/brick/review/:executionId/:blockId/reject` | 회고 반려 |

### 학습 (Learning)

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/learning/proposals` | 제안 목록 |
| POST | `/api/brick/learning/:id/approve` | 제안 승인 |
| POST | `/api/brick/learning/:id/reject` | 제안 반려 |

### 프로젝트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/projects` | 목록 |
| GET | `/api/brick/projects/:id` | 상세 |
| GET | `/api/brick/projects/:id/dashboard` | 프로젝트 대시보드 |
| POST | `/api/brick/projects` | 생성 |
| PUT | `/api/brick/projects/:id` | 수정 |
| POST | `/api/brick/projects/sync` | project.yaml 동기화 |

### 불변식

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/invariants` | 목록 |
| GET | `/api/brick/invariants/:id` | 상세 (이력 포함) |
| POST | `/api/brick/invariants` | 등록 |
| PUT | `/api/brick/invariants/:id` | 갱신 (version +1) |
| PATCH | `/api/brick/invariants/:id/deprecate` | 폐기 |

### 시스템

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/api/brick/system/invariants` | 시스템 불변식 |
| POST | `/api/brick/notify/test` | 알림 테스트 |

**총 62개 API 엔드포인트**

---

## 15. Hook 시스템 — 자동 강제 규칙

### Hook이란?

Claude Code의 도구 호출 전후에 자동 실행되는 스크립트. `exit 0`이면 통과, `exit 2`이면 차단.

**비유:** 공항 보안 검색대. 모든 도구 호출이 이 검색대를 통과해야 한다.

### 등록된 Hook 목록

#### PreToolUse (도구 실행 전)

**Bash 실행 시:**
| Hook | 역할 | exit 2 시 |
|------|------|----------|
| `enforce-agent-teams.sh` | Agent Teams 환경변수 확인 | 단독 세션 차단 |
| `destructive-detector.sh` | rm -rf, force push 등 감지 | 위험 작업 차단 |
| `pane-access-guard.sh` | 리더가 팀원 pane 접근 차단 | 접근 거부 |
| `enforce-spawn.sh` | — | — |
| `prevent-tmux-kill.sh` | tmux kill-session 차단 | 세션 보호 |
| `validate-coo-approval.sh` | COO 승인 없이 진행 차단 | 진행 차단 |
| `validate-task-fields.sh` | TASK 필수 필드 검증 | 불완전 TASK 차단 |
| `validate-qa.sh` | QA 없이 머지 차단 | 머지 차단 |
| `validate-pdca.sh` | PDCA 단계 검증 | 순서 위반 차단 |
| `validate-task.sh` | TASK 존재 확인 | TASK 없이 작업 차단 |
| `enforce-qa-before-merge.sh` | QA 통과 확인 후 머지 | 머지 차단 |

**Edit/Write 실행 시:**
| Hook | 역할 |
|------|------|
| `enforce-agent-teams.sh` | 단독 세션 차단 |
| `validate-delegate.sh` | 리더 직접 코드 수정 차단 |
| `validate-plan.sh` | Plan 없이 코드 수정 차단 |
| `validate-design.sh` | Design 없이 구현 차단 |

**Agent 실행 시:**
| Hook | 역할 |
|------|------|
| `enforce-teamcreate.sh` | 단독 Agent spawn 차단, TeamCreate 강제 |

#### TaskCompleted (태스크 완료 시)
| Hook | 역할 |
|------|------|
| `task-completed.sh` | 완료 기록 |
| `task-quality-gate.sh` | 품질 검증 |
| `gap-analysis.sh` | Design vs 구현 갭 분석 |
| `pdca-update.sh` | PDCA 상태 갱신 |
| `notify-completion.sh` | 완료 알림 |
| `deploy-trigger.sh` | 배포 트리거 |
| `pdca-chain-handoff.sh` | 다음 PDCA 단계 전달 |

---

## 16. 불변식 (Invariants) — 깨지면 안 되는 규칙

### 현재 등록된 불변식 (11건)

| ID | 설명 | 검증 방법 |
|----|------|----------|
| **INV-EB-1** | POST /executions는 반드시 Python 엔진 경유 | bridge.ts 코드 검사 |
| **INV-EB-2** | complete-block 시 Gate 결과 저장 필수 | DB 쿼리 |
| **INV-EB-3** | BlockStatus 9가지만 허용 | enum 검사 |
| **INV-EB-4** | 엔진 다운 시 GET 정상, POST 502 | 장애 시뮬레이션 |
| **INV-EB-5** | seed 시 블록 타입 10종, 팀 3개, 프리셋 4개 | seed 후 카운트 |
| **INV-EB-6** | 같은 블록 중복 완료 불가 | complete_block 2회 호출 |
| **INV-EB-7** | 워크플로우 상태 전이 일관성 | StateMachine 검사 |
| **INV-EB-8** | Gate 실패 시 다음 블록 진행 불가 | Gate mock 실패 |
| **INV-EB-9** | Adapter 응답 타임아웃 처리 | 타임아웃 시뮬레이션 |
| **INV-EB-10** | 프리셋 스키마 검증 | YAML 파싱 + 스키마 |
| **INV-EB-11** | 동시 실행 안전성 | 병렬 요청 테스트 |

---

## 17. 미구현 항목 (베타 이후)

### Design 있음 — 구현 대기 (5건)

| # | 항목 | Design | TDD | 우선순위 |
|---|------|--------|-----|---------|
| 1 | **TeammateLifecycleManager** | brick-team-adapter.design.md §4 | 39건 | P0 |
| 2 | **canvas-save** (캔버스 저장) | brick-canvas-save.design.md | 55건 | P1 |
| 3 | **loop-exit** (루프 탈출 정밀 제어) | brick-loop-exit.design.md | 40건 | P1 |
| 4 | **spec-wrapper** (스키마 검증) | brick-spec-wrapper.design.md | 18건 | P2 |
| 5 | **cli-state-sync** (CLI↔대시보드 동기화) | brick-cli-state-sync.design.md | 29건 | P2 |

### 프론트 Phase 6~7 (25건)

| Phase | 항목 | 범위 |
|-------|------|------|
| 6 | Notify (알림) | BF-121~135 (15건) |
| 7 | Scratch UX (드래그앤드롭) | BF-136~145 (10건) |

### Adapter 실제 연동

현재 `claude_agent_teams` adapter에 tmux 코드가 있지만, 실제 MCP 연동은 시뮬레이션 수준. 
`TeammateLifecycleManager`가 구현되면 팀원 자동 생성/종료/좀비 감지가 가능해진다.

---

## 18. QA 체크리스트

### A. 엔진 코어

| # | 테스트 | 방법 | 기대 |
|---|--------|------|------|
| A1 | 워크플로우 시작 | `POST /api/brick/executions {presetId:3, feature:"qa-test"}` | status=running, currentBlock=plan |
| A2 | 블록 완료 + Gate 통과 | `POST /executions/{id}/blocks/plan/complete` | nextBlocks=["design"] |
| A3 | Gate 실패 → 재시도 | check 블록에 match_rate=50 전달 | loop back to do |
| A4 | Gate 실패 3회 → FAILED | 3번 연속 실패 | status=failed |
| A5 | Suspend/Resume | `POST /workflows/{id}/suspend` → resume | 상태 복구 |
| A6 | Cancel | `POST /workflows/{id}/cancel` | status=cancelled |
| A7 | 전체 PDCA 완주 | plan→design→do→check(통과)→act | status=completed |

### B. CEO 승인 Gate

| # | 테스트 | 방법 | 기대 |
|---|--------|------|------|
| B1 | 승인 요청 생성 | approval Gate 진입 | brick_approvals에 1건 INSERT |
| B2 | 승인 | `POST /approve/{id}` | Do 블록 시작 |
| B3 | 반려 | `POST /reject/{id} {reason:"..."}` | Design으로 회귀 |
| B4 | 반려 3회 → FAILED | 3번 연속 반려 | 워크플로우 FAILED |
| B5 | adapter: human 우회 불가 | 에이전트가 approve 시도 | 차단 |

### C. 프로젝트 레이어

| # | 테스트 | 방법 | 기대 |
|---|--------|------|------|
| C1 | 프로젝트 자동 등록 | 서버 시작 | bscamp 프로젝트 존재 |
| C2 | 불변식 시드 | 서버 시작 | INV-EB-1~11 (11건) |
| C3 | 컨텍스트 주입 | `POST /executions {projectId:"bscamp"}` | context에 infrastructure 포함 |
| C4 | project.yaml 동기화 | `POST /projects/sync` | DB 갱신 |
| C5 | 불변식 갱신 이력 | `PUT /invariants/INV-EB-3` | version +1, history 기록 |

### D. 프론트엔드

| # | 테스트 | 방법 | 기대 |
|---|--------|------|------|
| D1 | 대시보드 로드 | `http://localhost:3201/brick` | 워크플로우 목록 표시 |
| D2 | 캔버스 열기 | `/brick/canvas/1` | 블록 노드 + 연결선 |
| D3 | 프리셋 목록 | `/brick/presets` | 4+ 프리