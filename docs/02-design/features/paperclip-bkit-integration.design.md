# Paperclip × bkit 통합 설계서

> 작성일: 2026-03-30 | PDCA Level: L2 | 상태: Design
> Plan: `docs/01-plan/features/paperclip-dashboard-adoption.plan.md`

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Paperclip × bkit Integration (Paperclip 이식 통합) |
| 작성일 | 2026-03-30 |
| 예상 기간 | 7~10일 |

| 관점 | 내용 |
|------|------|
| Problem | 파일 기반 PDCA 상태(pdca-status.json)는 동시성 경합, 이벤트 순서 미보장, 실시간 모니터링 불가. 대시보드는 텍스트 CLI 수준. 비용 추적 없음 |
| Solution | Paperclip의 DB+이벤트+대시보드를 bkit에 이식. tmux/OpenClaw 유지하면서 Ticket/이벤트/UI 레이어만 교체 |
| Function UX Effect | 실시간 대시보드, 자동 체인 완료, UI 팀 관리, 예산 통제 |
| Core Value | 파일 기반→DB+이벤트 기반 전환으로 에이전트팀 운영 신뢰도 + 가시성 확보 |

---

## 1. 아키텍처 개요

### 1.1 현재 시스템 (AS-IS)

```
┌─────────────────────────────────────────────────────────────┐
│  현재 bkit 시스템                                            │
│                                                             │
│  ┌───────────────┐     ┌───────────────────┐               │
│  │ Claude Code   │     │ .bkit/state/       │               │
│  │ Agent Teams   │────→│ pdca-status.json   │  ← 파일 기반  │
│  │ (tmux pane)   │     │ session-history    │               │
│  └───────┬───────┘     └────────┬──────────┘               │
│          │                      │                           │
│  ┌───────┴───────┐     ┌───────┴──────────┐               │
│  │ .bkit/hooks/  │     │ .bkit/runtime/    │               │
│  │ 40개 bash     │────→│ peer-map.json     │  ← 런타임 상태 │
│  │ 스크립트      │     │ team-context-*.json│               │
│  └───────┬───────┘     │ agent-state.json  │               │
│          │              └──────────────────┘               │
│  ┌───────┴───────┐     ┌───────────────────┐               │
│  │ chain-handoff │────→│ MOZZI (OpenClaw)   │               │
│  │ webhook/broker│     │ 127.0.0.1:18789   │               │
│  └───────────────┘     └───────────────────┘               │
│                                                             │
│  한계: 동시성 경합, 이벤트 순서 미보장, 실시간 UI 없음        │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 목표 시스템 (TO-BE)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Paperclip × bkit 통합 시스템                                        │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────┐        │
│  │  대시보드 UI (React + Vite) — localhost:3200             │        │
│  │                                                         │        │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐        │        │
│  │  │메인   │ │비용   │ │Org   │ │체인   │ │팀관리 │        │        │
│  │  │대시보드│ │추적   │ │Chart │ │편집   │ │CRUD  │        │        │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘        │        │
│  │     └────────┴────────┴────────┴────────┘              │        │
│  │                    │                                    │        │
│  │         WebSocket (LiveUpdatesProvider)                  │        │
│  └────────────────────┼────────────────────────────────────┘        │
│                       │                                              │
│  ┌────────────────────┼────────────────────────────────────┐        │
│  │  통합 서버 (Express) — localhost:3201                     │        │
│  │                    │                                     │        │
│  │  ┌─────────────────┴──────────────────┐                 │        │
│  │  │        이벤트 버스 (EventEmitter)     │                 │        │
│  │  └──┬──────┬──────┬──────┬──────┬────┘                 │        │
│  │     │      │      │      │      │                       │        │
│  │  ┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐                  │        │
│  │  │Ticket││Cost ││Agent││Chain││Hook │ ← 서비스 레이어    │        │
│  │  │서비스 ││서비스 ││서비스 ││서비스 ││브릿지│                  │        │
│  │  └──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘                  │        │
│  │     └──────┴──────┴──────┴──────┘                       │        │
│  │                    │                                     │        │
│  │              ┌─────┴─────┐                              │        │
│  │              │ SQLite DB │  ← 로컬 단일 파일 DB          │        │
│  │              └───────────┘                              │        │
│  └─────────────────────┬───────────────────────────────────┘        │
│                        │                                             │
│  ┌─────────────────────┼──────────────────┐                         │
│  │  bkit Hook 브릿지 레이어                │                         │
│  │                     │                   │                         │
│  │  ┌─────────────┐ ┌─┴───────────────┐  │                         │
│  │  │기존 bash hook│→│Hook→이벤트 변환기 │  │  ← 점진적 마이그레이션  │
│  │  │(읽기 전용)   │ │(DB 쓰기)        │  │                         │
│  │  └──────┬──────┘ └────────┬────────┘  │                         │
│  │         │                 │            │                         │
│  │  ┌──────┴─────────────────┴──────┐    │                         │
│  │  │  .bkit/runtime/ (호환 유지)    │    │                         │
│  │  │  pdca-status.json (동기 미러)  │    │                         │
│  │  └───────────────────────────────┘    │                         │
│  └────────────────────┬──────────────────┘                         │
│                       │                                             │
│  ┌────────────────────┼───────────────────┐                         │
│  │  에이전트 런타임 (변경 없음)             │                         │
│  │                    │                    │                         │
│  │  ┌────────┐  ┌─────┴──────┐  ┌───────┐│                         │
│  │  │ tmux   │  │ OpenClaw   │  │MOZZI  ││  ← 기존 유지             │
│  │  │ panes  │  │ Gateway    │  │webhook││                         │
│  │  └────────┘  └────────────┘  └───────┘│                         │
│  └────────────────────────────────────────┘                         │
└──────────────────────────────────────────────────────────────────────┘
```

### 1.3 레이어 분리 원칙

| 레이어 | 역할 | Paperclip 차용 | 자체 구현 | 기존 유지 |
|--------|------|---------------|-----------|-----------|
| **L1: UI** | 대시보드 렌더링 | ✅ 컴포넌트 15개+ | 한국어화, 체인 편집기 | — |
| **L2: API** | REST + WebSocket | ✅ 라우트 6개 | bkit 어댑터 | — |
| **L3: 서비스** | 비즈니스 로직 | ✅ 서비스 5개 | Hook 브릿지, 체인 엔진 | — |
| **L4: 데이터** | 저장소 | ✅ Drizzle 스키마 (경량화) | SQLite 전환 | pdca-status.json (미러) |
| **L5: 런타임** | 에이전트 실행 | — | — | ✅ tmux + OpenClaw 전체 |

---

## 2. DB 스키마 설계

### 2.1 DB 선택: SQLite (better-sqlite3)

**PostgreSQL이 아닌 SQLite를 선택하는 이유:**
- 로컬 개발 도구이므로 별도 DB 서버 불필요
- 단일 파일(`dashboard/.data/bkit.db`) — 백업/이동 간편
- Drizzle ORM이 SQLite 지원 → Paperclip 스키마를 최소 수정으로 이식
- WAL 모드로 읽기/쓰기 동시 접근 가능

### 2.2 테이블 설계 (Paperclip 경량화)

**Paperclip 58개 테이블 → 우리 10개 테이블으로 경량화**

```sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T1: tickets — PDCA 태스크 (기존 TASK-*.md 대체)
-- Paperclip 원본: issues 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE tickets (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  feature       TEXT NOT NULL,                     -- PDCA 피처명
  title         TEXT NOT NULL,                     -- 태스크 제목
  description   TEXT,                              -- 상세 설명
  status        TEXT NOT NULL DEFAULT 'backlog'
                CHECK(status IN ('backlog','todo','in_progress','in_review','completed','cancelled')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK(priority IN ('critical','high','medium','low')),

  -- 배정 (에이전트 또는 팀)
  assignee_agent TEXT,                             -- 'frontend-dev', 'backend-dev'
  assignee_team  TEXT,                             -- 'cto', 'pm', 'marketing'

  -- PDCA 연결
  pdca_phase    TEXT CHECK(pdca_phase IN ('plan','design','do','check','act','deploy')),
  process_level TEXT CHECK(process_level IN ('L0','L1','L2','L3')),
  match_rate    REAL,                              -- 0~100

  -- 체인 연결
  chain_id      TEXT REFERENCES workflow_chains(id),
  chain_step_id TEXT,

  -- 실행 추적
  execution_run_id TEXT REFERENCES heartbeat_runs(id),
  commit_hash   TEXT,
  changed_files INTEGER DEFAULT 0,

  -- 체크리스트 (JSON 배열)
  checklist     TEXT DEFAULT '[]',                 -- [{"text":"tsc 통과","done":false}, ...]

  -- 타임스탬프
  started_at    TEXT,                              -- ISO-8601
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tickets_feature ON tickets(feature);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assignee ON tickets(assignee_team, status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T2: agents — 에이전트 레지스트리
-- Paperclip 원본: agents 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE agents (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name          TEXT NOT NULL UNIQUE,              -- 'cto-leader', 'frontend-dev'
  role          TEXT NOT NULL DEFAULT 'developer', -- 'leader', 'developer', 'qa'
  team          TEXT,                              -- 'cto', 'pm', 'marketing'
  status        TEXT NOT NULL DEFAULT 'idle'
                CHECK(status IN ('idle','running','paused','error','terminated')),
  pause_reason  TEXT,

  -- 계층 구조 (Org Chart)
  reports_to    TEXT REFERENCES agents(id),        -- 상위 에이전트

  -- 런타임 연결
  tmux_session  TEXT,                              -- tmux 세션명
  tmux_pane     TEXT,                              -- tmux pane ID
  peer_id       TEXT,                              -- Claude Code peer ID
  pid           INTEGER,                           -- OS 프로세스 ID

  -- 비용 추적
  budget_monthly_cents INTEGER DEFAULT 0,          -- 월 예산 (센트)
  spent_monthly_cents  INTEGER DEFAULT 0,          -- 월 사용 (센트)

  -- 메타데이터
  icon          TEXT DEFAULT '🤖',
  capabilities  TEXT,                              -- 역할 설명
  last_heartbeat_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T3: heartbeat_runs — 에이전트 실행 기록
-- Paperclip 원본: heartbeat_runs 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE heartbeat_runs (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  ticket_id     TEXT REFERENCES tickets(id),

  status        TEXT NOT NULL DEFAULT 'running'
                CHECK(status IN ('queued','running','completed','failed','cancelled')),
  started_at    TEXT,
  finished_at   TEXT,

  -- 프로세스 정보
  pid           INTEGER,
  exit_code     INTEGER,

  -- 토큰 사용량
  input_tokens  INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_tokens INTEGER DEFAULT 0,

  -- 로그
  stdout_excerpt TEXT,                             -- 마지막 500자
  result_json   TEXT,                              -- 실행 결과 JSON

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_runs_agent ON heartbeat_runs(agent_id, started_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T4: cost_events — 비용 이벤트 (불변)
-- Paperclip 원본: cost_events 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE cost_events (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  ticket_id     TEXT REFERENCES tickets(id),
  run_id        TEXT REFERENCES heartbeat_runs(id),

  -- 제공자 정보
  provider      TEXT NOT NULL DEFAULT 'anthropic',  -- 'anthropic', 'google'
  model         TEXT NOT NULL,                      -- 'claude-opus-4-6', 'claude-sonnet-4-6'

  -- 토큰 수량
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents    INTEGER NOT NULL,                   -- 비용 (센트 단위)

  occurred_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cost_agent ON cost_events(agent_id, occurred_at);
CREATE INDEX idx_cost_model ON cost_events(model, occurred_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T5: budget_policies — 예산 정책
-- Paperclip 원본: budget_policies 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE budget_policies (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),

  -- 범위 (전체 / 에이전트별 / 팀별)
  scope_type    TEXT NOT NULL DEFAULT 'global'
                CHECK(scope_type IN ('global','agent','team')),
  scope_id      TEXT,                               -- agent_id 또는 team명

  -- 한도
  amount_cents  INTEGER NOT NULL,                   -- 월 예산 (센트)
  warn_percent  INTEGER NOT NULL DEFAULT 80,        -- 소프트 한도 (%)
  hard_stop     INTEGER NOT NULL DEFAULT 1,         -- 하드 한도 활성화 (boolean)

  -- 윈도우
  window_kind   TEXT NOT NULL DEFAULT 'monthly'
                CHECK(window_kind IN ('monthly','weekly','daily')),

  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T6: budget_incidents — 예산 초과 이력
-- Paperclip 원본: budget_incidents 테이블 (암시적)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE budget_incidents (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  policy_id     TEXT NOT NULL REFERENCES budget_policies(id),
  agent_id      TEXT REFERENCES agents(id),

  kind          TEXT NOT NULL CHECK(kind IN ('warn','hard_stop')),
  amount_at_trigger INTEGER NOT NULL,               -- 트리거 시점 사용량
  threshold_amount  INTEGER NOT NULL,               -- 한도 금액
  resolved      INTEGER NOT NULL DEFAULT 0,         -- 해결 여부
  resolved_at   TEXT,

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T7: workflow_chains — 워크플로 체인 정의
-- 신규 (Paperclip approvals + routines 기반)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE workflow_chains (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name          TEXT NOT NULL,                      -- '기본 PDCA 체인'
  description   TEXT,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T8: workflow_steps — 체인 단계 정의
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE workflow_steps (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  chain_id      TEXT NOT NULL REFERENCES workflow_chains(id) ON DELETE CASCADE,
  step_order    INTEGER NOT NULL,                   -- 실행 순서 (1, 2, 3...)

  -- 단계 정의
  team_role     TEXT NOT NULL,                      -- 'pm', 'cto', 'deploy'
  phase         TEXT NOT NULL,                      -- 'plan', 'design', 'do', 'check', 'deploy'
  label         TEXT NOT NULL,                      -- '설계 작성', '구현', '배포'

  -- 완료 조건 (JSON 표현식)
  completion_condition TEXT NOT NULL DEFAULT '{"type":"manual"}',
  -- 예: {"type":"match_rate","min":90}
  -- 예: {"type":"build_success"}
  -- 예: {"type":"checklist_all_done"}
  -- 예: {"type":"manual"}

  -- 자동화
  auto_trigger_next INTEGER NOT NULL DEFAULT 1,     -- 완료 시 다음 단계 자동 시작
  assignee      TEXT,                               -- 기본 담당 에이전트 ID

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_steps_chain ON workflow_steps(chain_id, step_order);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T9: events — 이벤트 로그 (불변, 시간순)
-- Paperclip 원본: activity_log 테이블
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,  -- 순차 보장
  event_type    TEXT NOT NULL,                      -- 아래 이벤트 타입 참조
  actor         TEXT NOT NULL,                      -- 'cto-leader', 'hook:task-completed'
  target_type   TEXT,                               -- 'ticket', 'agent', 'chain'
  target_id     TEXT,                               -- 대상 ID
  payload       TEXT,                               -- JSON 상세 데이터
  created_at    TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX idx_events_type ON events(event_type, created_at);
CREATE INDEX idx_events_target ON events(target_type, target_id);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T10: pdca_features — PDCA 피처 상태 (pdca-status.json 대체)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE pdca_features (
  id            TEXT PRIMARY KEY,                   -- 피처명 (영문 kebab-case)
  display_name  TEXT NOT NULL,                      -- 한국어 표시명
  phase         TEXT NOT NULL DEFAULT 'planning'
                CHECK(phase IN ('planning','designing','implementing','checking','acting','completed','archived')),
  process_level TEXT DEFAULT 'L2',

  -- PDCA 단계별 상태
  plan_done     INTEGER DEFAULT 0,
  plan_doc      TEXT,                               -- docs/01-plan/features/*.plan.md
  plan_at       TEXT,
  design_done   INTEGER DEFAULT 0,
  design_doc    TEXT,
  design_at     TEXT,
  do_done       INTEGER DEFAULT 0,
  do_commit     TEXT,
  do_at         TEXT,
  check_done    INTEGER DEFAULT 0,
  check_doc     TEXT,
  match_rate    REAL,
  act_done      INTEGER DEFAULT 0,
  act_commit    TEXT,
  deployed_at   TEXT,

  -- 워크플로 연결
  chain_id      TEXT REFERENCES workflow_chains(id),
  current_step  INTEGER,                            -- 현재 체인 단계 순서

  -- 메타
  automation_level INTEGER DEFAULT 2,               -- L0~L4
  iteration_count  INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 2.3 이벤트 타입 정의

```typescript
// events 테이블의 event_type 값 (Paperclip activity_log 기반)
type EventType =
  // Ticket 생명주기
  | 'ticket.created'           // 태스크 생성
  | 'ticket.assigned'          // 에이전트에 배정
  | 'ticket.status_changed'    // 상태 전환 (in_progress → completed 등)
  | 'ticket.checklist_updated' // 체크리스트 항목 변경
  | 'ticket.completed'         // 전체 완료 (체크리스트 100%)

  // Agent 생명주기
  | 'agent.registered'         // TeamCreate 시
  | 'agent.status_changed'     // running/paused/error
  | 'agent.terminated'         // TeamDelete 시
  | 'agent.heartbeat'          // 주기적 상태 보고

  // 비용
  | 'cost.recorded'            // 비용 이벤트 기록
  | 'budget.warn'              // 소프트 한도 초과
  | 'budget.hard_stop'         // 하드 한도 → 자동 정지
  | 'budget.resolved'          // 인시던트 해결

  // PDCA
  | 'pdca.phase_changed'       // plan→design→do→check→act
  | 'pdca.match_rate_recorded' // Gap 분석 결과
  | 'pdca.completed'           // 피처 완료

  // 체인
  | 'chain.step_started'       // 체인 단계 시작
  | 'chain.step_completed'     // 체인 단계 완료
  | 'chain.auto_triggered'     // 다음 단계 자동 트리거
  | 'chain.handoff'            // CTO→COO 핸드오프

  // 시스템
  | 'system.webhook_sent'      // MOZZI 웹훅 전송
  | 'system.hook_executed'     // bkit hook 실행
  | 'system.error';            // 에러 발생
```

---

## 3. 서비스 레이어 설계

### 3.1 Paperclip 모듈 → bkit 서비스 매핑

```
Paperclip 원본                    우리 서비스                  변환 사항
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
server/src/services/issues.ts  → dashboard/server/services/   companyId 제거,
(65.4KB)                         tickets.ts                   status enum 축소,
                                                              PDCA 필드 추가

server/src/services/costs.ts   → dashboard/server/services/   companyId 제거,
(16.6KB)                         costs.ts                     PostgreSQL→SQLite 쿼리

server/src/services/budgets.ts → dashboard/server/services/   scope 단순화
(31.7KB)                         budgets.ts                   (global/agent/team만)

server/src/services/agents.ts  → dashboard/server/services/   adapterConfig 제거,
(23.5KB)                         agents.ts                    tmux 필드 추가

server/src/services/           → dashboard/server/services/   companyId 제거
  dashboard.ts (3.7KB)           dashboard.ts

server/src/services/           → dashboard/server/services/   규모 축소 (3KB→1KB)
  heartbeat.ts (135KB)           heartbeat.ts                 핵심 이벤트만

server/src/realtime/           → dashboard/server/realtime/   companyId 스코핑 제거
  live-events-ws.ts (8.2KB)      ws.ts                        (단일 조직)

신규                           → dashboard/server/services/   완전 신규 구현
                                 chains.ts
                                 hook-bridge.ts
```

### 3.2 핵심 서비스 인터페이스

```typescript
// ━━━ TicketService (Paperclip issues.ts 기반) ━━━

interface TicketService {
  // CRUD
  create(input: CreateTicketInput): Promise<Ticket>;
  update(id: string, input: UpdateTicketInput): Promise<Ticket>;
  get(id: string): Promise<Ticket | null>;
  list(filter: TicketFilter): Promise<Ticket[]>;

  // 상태 전환 (이벤트 발생)
  changeStatus(id: string, newStatus: TicketStatus): Promise<void>;
  // → events 테이블에 'ticket.status_changed' 기록
  // → WebSocket으로 실시간 전파
  // → 체크리스트 전부 완료 시 자동 'completed' 전환

  // 체크리스트 관리
  updateChecklist(id: string, checklist: ChecklistItem[]): Promise<void>;
  // → 전체 항목 done=true 시 ticket.completed 이벤트 발생
  // → chain_step_id 있으면 체인 엔진에 완료 알림

  // PDCA 연결
  linkToFeature(id: string, feature: string, phase: PdcaPhase): Promise<void>;
}

// ━━━ ChainService (신규 — Paperclip approvals + routines 기반) ━━━

interface ChainService {
  // 체인 정의 CRUD
  createChain(input: CreateChainInput): Promise<WorkflowChain>;
  updateChain(id: string, input: UpdateChainInput): Promise<WorkflowChain>;
  getChain(id: string): Promise<WorkflowChain>;
  listChains(): Promise<WorkflowChain[]>;

  // 단계 관리
  addStep(chainId: string, step: CreateStepInput): Promise<WorkflowStep>;
  removeStep(stepId: string): Promise<void>;
  reorderSteps(chainId: string, stepIds: string[]): Promise<void>;

  // 실행
  evaluateCompletion(stepId: string, context: EvalContext): Promise<boolean>;
  // → completion_condition JSON 평가
  // → true이면 'chain.step_completed' 이벤트
  // → auto_trigger_next이면 다음 단계 자동 시작

  triggerNextStep(chainId: string, currentOrder: number): Promise<void>;
  // → 다음 step의 assignee에게 ticket 자동 배정
  // → 'chain.auto_triggered' 이벤트
  // → 마지막 단계 완료 시 MOZZI 웹훅 호출
}

// ━━━ HookBridgeService (신규 — 기존 hook ↔ DB 변환) ━━━

interface HookBridgeService {
  // 기존 hook → DB 이벤트 변환
  onTaskCompleted(hookPayload: TaskCompletedPayload): Promise<void>;
  // 1) tickets 테이블 상태 업데이트
  // 2) events 테이블에 기록
  // 3) pdca_features 테이블 동기화
  // 4) 체인 완료 조건 평가
  // 5) WebSocket 실시간 전파

  onQualityGateResult(result: QualityGateResult): Promise<void>;
  // match_rate, tsc/build 결과 → tickets + pdca_features 업데이트

  onChainHandoff(report: CompletionReport): Promise<void>;
  // 기존 chain-handoff 로직을 DB 이벤트로 변환
  // MOZZI 웹훅도 이 서비스가 담당

  // DB → 파일 동기화 (하위 호환)
  syncToPdcaStatusJson(): Promise<void>;
  // pdca_features → .bkit/state/pdca-status.json 미러링
  // 기존 hook들이 이 파일을 아직 읽으므로 동기 유지
}

// ━━━ CostService (Paperclip costs.ts 거의 그대로) ━━━

interface CostService {
  recordCost(event: CreateCostEvent): Promise<void>;

  // 집계 쿼리
  summary(dateRange?: DateRange): Promise<CostSummary>;
  byAgent(dateRange?: DateRange): Promise<CostByAgent[]>;
  byModel(dateRange?: DateRange): Promise<CostByModel[]>;
  windowSpend(): Promise<WindowSpend>;  // 1시간/24시간/7일

  // 예산 평가
  evaluateBudget(agentId: string, costCents: number): Promise<BudgetResult>;
  // → 소프트 한도 초과 시 budget_incidents 기록 + 'budget.warn'
  // → 하드 한도 초과 시 agent.status='paused' + 'budget.hard_stop'
}
```

### 3.3 이벤트 흐름 다이어그램

```
┌──────────────────────────────────────────────────────────────────┐
│  이벤트 흐름: 태스크 생성 → 완료 → 체인 핸드오프 → 웹훅         │
└──────────────────────────────────────────────────────────────────┘

  UI (대시보드)                서버 (Express)              외부
  ━━━━━━━━━━━━              ━━━━━━━━━━━━━━━           ━━━━━━━━
      │                          │                        │
  [태스크 생성]                   │                        │
      │──POST /tickets──────────→│                        │
      │                    TicketService.create()          │
      │                          │──INSERT tickets────→   │
      │                          │──INSERT events─────→   │
      │                          │   (ticket.created)     │
      │←──WebSocket──────────────│                        │
      │   {ticket.created}       │                        │
      │                          │                        │
  [체크리스트 항목 완료]           │                        │
      │──PATCH /tickets/:id─────→│                        │
      │                    TicketService                   │
      │                    .updateChecklist()              │
      │                          │                        │
      │               전체 done? ─┤                        │
      │                    YES   │                        │
      │                          │──UPDATE tickets         │
      │                          │   status='completed'    │
      │                          │──INSERT events          │
      │                          │   (ticket.completed)    │
      │                          │                        │
      │                    ChainService                    │
      │                    .evaluateCompletion()           │
      │                          │                        │
      │               조건 충족? ─┤                        │
      │                    YES   │                        │
      │                          │──INSERT events          │
      │                          │  (chain.step_completed) │
      │                          │                        │
      │               다음 단계? ─┤                        │
      │                    YES   │                        │
      │                          │──ChainService           │
      │                          │  .triggerNextStep()     │
      │                          │──INSERT events          │
      │                          │  (chain.auto_triggered) │
      │                          │                        │
      │               마지막?   ─┤                        │
      │                    YES   │                        │
      │                          │──HookBridgeService      │
      │                          │  .onChainHandoff()     │
      │                          │──INSERT events          │
      │                          │  (chain.handoff)       │
      │                          │                        │
      │                          │──POST webhook──────────→│ MOZZI
      │                          │  /hooks/wake            │ (OpenClaw)
      │                          │──INSERT events          │
      │                          │  (system.webhook_sent)  │
      │                          │                        │
      │←──WebSocket (all)────────│                        │
      │                          │                        │
      │                    HookBridgeService               │
      │                    .syncToPdcaStatusJson()         │
      │                          │──WRITE file─────→      │
      │                          │  pdca-status.json       │
      │                          │  (하위 호환 미러)        │
```

---

## 4. UI 컴포넌트 설계

### 4.1 Paperclip 컴포넌트 → bkit 매핑 (파일 레벨)

```
Paperclip 원본 파일                   우리 파일                         변환 내용
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ui/src/pages/Dashboard.tsx          → dashboard/src/pages/대시보드.tsx    한국어 라벨,
                                                                        MetricCard 4열→
                                                                        (에이전트/태스크/비용/체인)

ui/src/pages/Costs.tsx              → dashboard/src/pages/비용.tsx       5탭 한국어화,
(49KB)                                                                   달러→원화 옵션

ui/src/pages/OrgChart.tsx           → dashboard/src/pages/조직도.tsx     우리 팀 구조 하드코딩
                                                                        reports-to 매핑

ui/src/pages/Agents.tsx             → dashboard/src/pages/팀관리.tsx     TeamCreate/Delete 연결
ui/src/pages/AgentDetail.tsx                                            tmux pane 정보 표시

━━━━ 컴포넌트 ━━━━

ui/src/components/                  → dashboard/src/components/
  ActiveAgentsPanel.tsx (5.7KB)       에이전트상태패널.tsx                한국어 상태 라벨
  AgentRunCard.tsx                    에이전트실행카드.tsx                peer-map 연결
  MetricCard.tsx (1.5KB)              지표카드.tsx                       숫자 포맷 ko-KR
  ActivityCharts.tsx (10KB)           활동차트.tsx                       Recharts 유지
  ActivityRow.tsx (5.3KB)             활동행.tsx                         이벤트 테이블 연결
  StatusIcon.tsx                      상태아이콘.tsx                     한국어 tooltip
  StatusBadge.tsx                     상태뱃지.tsx                       색상 유지
  Layout.tsx                          레이아웃.tsx                       Primary #F75D5D
  Sidebar.tsx                         사이드바.tsx                       한국어 메뉴
  SidebarAgents.tsx                   사이드바에이전트.tsx                agents 테이블 연결

  BudgetPolicyCard.tsx (9.2KB)        예산정책카드.tsx                   scope 한국어화
  BudgetIncidentCard.tsx (4KB)        예산초과카드.tsx                   알림 한국어화
  BillerSpendCard.tsx (5.7KB)         지출카드.tsx                      Anthropic 고정
  ProviderQuotaCard.tsx (17.6KB)      쿼터카드.tsx                      단순화
  QuotaBar.tsx (2KB)                  쿼터바.tsx                        그대로 사용
  FinanceTimelineCard.tsx (3.2KB)     타임라인카드.tsx                   날짜 ko-KR
  AccountingModelCard.tsx (3.1KB)     모델별비용카드.tsx                 Opus/Sonnet 표시

━━━━ 신규 컴포넌트 ━━━━

(없음)                              → dashboard/src/components/
                                      체인편집기.tsx                     D&D 워크플로 편집
                                      체인스텝카드.tsx                   개별 단계 카드
                                      완료조건편집기.tsx                 조건 JSON 편집 UI
                                      팀생성대화상자.tsx                 TeamCreate 래퍼
                                      태스크배정대화상자.tsx             드래그앤드롭 배정

━━━━ Context/Hook ━━━━

ui/src/context/
  LiveUpdatesProvider.tsx (26.6KB)  → dashboard/src/context/            WebSocket URL 변경
                                      실시간Provider.tsx                (localhost:3201)
  ToastContext.tsx (4.3KB)          → dashboard/src/context/            한국어 메시지
                                      토스트Context.tsx
  SidebarContext.tsx                → 그대로 복사

ui/src/hooks/
  useDateRange.ts                   → 그대로 복사                       ko-KR 로케일
  useAgentOrder.ts                  → 그대로 복사

━━━━ API 클라이언트 ━━━━

ui/src/api/
  client.ts                         → dashboard/src/api/client.ts       baseURL 변경
  agents.ts (8KB)                   → dashboard/src/api/agents.ts       companyId 제거
  costs.ts                          → dashboard/src/api/costs.ts        companyId 제거
  budgets.ts                        → dashboard/src/api/budgets.ts      companyId 제거
  heartbeats.ts                     → dashboard/src/api/heartbeats.ts   companyId 제거
  dashboard.ts                      → dashboard/src/api/dashboard.ts    companyId 제거

(없음)                              → dashboard/src/api/tickets.ts      신규
(없음)                              → dashboard/src/api/chains.ts       신규
```

### 4.2 체인 편집기 UI 설계

```
┌──────────────────────────────────────────────────────────────┐
│  워크플로 체인 편집기                                    [저장] │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  체인명: [기본 PDCA 체인          ] [▼ 활성]                  │
│                                                              │
│  ┌────────┐     ┌────────┐     ┌────────┐     ┌────────┐   │
│  │ ① PM   │────→│ ② CTO  │────→│ ③ QA   │────→│ ④ 배포  │   │
│  │        │     │        │     │        │     │        │   │
│  │ 설계   │     │ 구현   │     │ 검증   │     │ 배포   │   │
│  │        │     │        │     │        │     │        │   │
│  │ 조건:  │     │ 조건:  │     │ 조건:  │     │ 조건:  │   │
│  │ Plan+  │     │ Build  │     │ Match  │     │ Build  │   │
│  │ Design │     │ 성공   │     │ ≥90%   │     │ 성공   │   │
│  │ 완료   │     │        │     │        │     │        │   │
│  │        │     │ 자동 ✓ │     │ 자동 ✓ │     │ 수동   │   │
│  ├────────┤     ├────────┤     ├────────┤     ├────────┤   │
│  │ [편집] │     │ [편집] │     │ [편집] │     │ [편집] │   │
│  │ [삭제] │     │ [삭제] │     │ [삭제] │     │ [삭제] │   │
│  └────────┘     └────────┘     └────────┘     └────────┘   │
│                                                              │
│  [+ 단계 추가]                              [↑↓ 순서 변경]   │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│  완료 조건 유형:                                              │
│  • 수동 — 사용자가 직접 완료 처리                              │
│  • 체크리스트 전부 완료 — 태스크 체크리스트 100%               │
│  • Match Rate ≥ N% — Gap 분석 결과 기준                      │
│  • 빌드 성공 — npm run build 성공                            │
│  • Plan+Design 완료 — 해당 단계 문서 존재 확인                │
└──────────────────────────────────────────────────────────────┘
```

---

## 5. Hook 브릿지 — 점진적 마이그레이션 전략

### 5.1 마이그레이션 3단계

```
━━━ 1단계: 읽기 전용 미러 (Day 1~2) ━━━

  기존 hook (변경 없음)
       │
       ├─→ pdca-status.json (기존대로 쓰기)
       │
       └─→ Hook 브릿지 (신규, 읽기 전용)
            │
            └─→ DB에 이벤트 기록 (events 테이블)
                 │
                 └─→ 대시보드 UI (읽기 전용)

  효과: 기존 시스템 100% 유지하면서 대시보드만 추가


━━━ 2단계: 이중 쓰기 (Day 3~5) ━━━

  기존 hook
       │
       ├─→ pdca-status.json (기존대로)
       │
       └─→ Hook 브릿지 (이중 쓰기)
            │
            ├─→ DB tickets/events 쓰기
            │
            └─→ 대시보드 UI (읽기+쓰기)
                 │
                 ├─→ 태스크 생성/배정 (DB)
                 ├─→ 체인 편집 (DB)
                 └─→ DB→pdca-status.json 동기 (하위 호환)

  효과: UI에서 태스크 관리 가능, 기존 hook도 계속 동작


━━━ 3단계: DB 주도 (Day 6~10) ━━━

  대시보드 UI (주 인터페이스)
       │
       └─→ DB (primary)
            │
            ├─→ 이벤트 버스
            │    ├─→ WebSocket (UI 실시간)
            │    ├─→ 체인 엔진 (자동 핸드오프)
            │    └─→ MOZZI 웹훅 (보고)
            │
            └─→ pdca-status.json (미러, 읽기 전용)
                 │
                 └─→ 기존 hook (읽기 전용으로 전환)
                      (session-resume-check 등은 JSON 파일을 읽음)

  효과: DB가 정본(source of truth), 파일은 호환 미러
```

### 5.2 기존 Hook별 전환 계획

| 기존 Hook | 1단계 | 2단계 | 3단계 |
|-----------|-------|-------|-------|
| `task-completed.sh` | 그대로 + 브릿지 호출 추가 | DB에도 이벤트 기록 | DB 이벤트가 주도, hook은 보조 |
| `task-quality-gate.sh` | 그대로 | 그대로 (tsc/build 검증은 hook이 적합) | 결과만 DB에 기록 |
| `pdca-chain-handoff.sh` | 그대로 | DB 체인 엔진과 병행 | 체인 엔진이 대체, hook 비활성화 |
| `session-resume-check.sh` | 그대로 | pdca-status.json 미러 읽기 | DB 직접 쿼리로 전환 |
| `validate-delegate.sh` | 그대로 | 그대로 (bash 검증은 hook이 적합) | 그대로 유지 |
| `enforce-teamcreate.sh` | 그대로 | 그대로 | 그대로 유지 |
| `detect-process-level.sh` | 그대로 | 그대로 | 결과를 DB에도 기록 |

**원칙**: bash로 해야 하는 것(tsc, build, git diff, tmux 검증)은 hook 유지. 상태 관리/이벤트/체인은 DB로 이전.

### 5.3 Hook 브릿지 구현 상세

```typescript
// dashboard/server/services/hook-bridge.ts

import { db } from '../db';
import { tickets, events, pdcaFeatures } from '../db/schema';
import { chainService } from './chains';
import { writeFileSync } from 'fs';

/**
 * 기존 bkit hook에서 HTTP POST로 호출됨.
 * hook → curl http://localhost:3201/api/hooks/task-completed
 *
 * 기존 hook 스크립트 맨 끝에 1줄 추가:
 * curl -s -X POST http://localhost:3201/api/hooks/task-completed \
 *   -H 'Content-Type: application/json' \
 *   -d "{\"task_file\":\"$TASK_FILE\",\"status\":\"$STATUS\"}" || true
 *
 * || true로 브릿지 실패해도 기존 hook 흐름 차단하지 않음 (graceful)
 */
export class HookBridgeService {

  async onTaskCompleted(payload: {
    task_file: string;
    status: string;
    match_rate?: number;
    commit_hash?: string;
    changed_files?: number;
    process_level?: string;
    from_role?: string;
  }): Promise<void> {
    // 1) tickets 테이블 업데이트
    const ticket = await db.select()
      .from(tickets)
      .where(eq(tickets.title, payload.task_file))
      .get();

    if (ticket) {
      await db.update(tickets)
        .set({
          status: 'completed',
          completed_at: new Date().toISOString(),
          match_rate: payload.match_rate,
          commit_hash: payload.commit_hash,
          changed_files: payload.changed_files,
          process_level: payload.process_level,
        })
        .where(eq(tickets.id, ticket.id));
    }

    // 2) events 테이블에 이벤트 기록
    await db.insert(events).values({
      event_type: 'ticket.completed',
      actor: payload.from_role ?? 'hook:task-completed',
      target_type: 'ticket',
      target_id: ticket?.id,
      payload: JSON.stringify(payload),
    });

    // 3) 체인 완료 조건 평가
    if (ticket?.chain_step_id) {
      const completed = await chainService.evaluateCompletion(
        ticket.chain_step_id,
        { matchRate: payload.match_rate, buildSuccess: true }
      );

      if (completed && ticket.chain_id) {
        const step = await db.select()
          .from(workflowSteps)
          .where(eq(workflowSteps.id, ticket.chain_step_id))
          .get();

        if (step?.auto_trigger_next) {
          await chainService.triggerNextStep(ticket.chain_id, step.step_order);
        }
      }
    }

    // 4) pdca-status.json 동기 미러링 (하위 호환)
    await this.syncToPdcaStatusJson();

    // 5) WebSocket 실시간 전파
    this.emitEvent('ticket.completed', payload);
  }

  async syncToPdcaStatusJson(): Promise<void> {
    const features = await db.select().from(pdcaFeatures).all();
    const status = {
      version: '3.0',
      lastUpdated: new Date().toISOString(),
      activeFeatures: features.filter(f => f.phase !== 'archived').map(f => f.id),
      features: Object.fromEntries(features.map(f => [f.id, {
        phase: f.phase,
        plan: { done: !!f.plan_done, doc: f.plan_doc, at: f.plan_at },
        design: { done: !!f.design_done, doc: f.design_doc, at: f.design_at },
        do: { done: !!f.do_done, commit: f.do_commit, at: f.do_at },
        check: { done: !!f.check_done, doc: f.check_doc, matchRate: f.match_rate },
        act: { done: !!f.act_done, commit: f.act_commit, deployedAt: f.deployed_at },
      }])),
    };
    writeFileSync('.bkit/state/pdca-status.json', JSON.stringify(status, null, 2));
  }
}
```

---

## 6. OpenClaw 게이트웨이 연결

### 6.1 어댑터 연결 아키텍처

```
┌───────────────────────────────────────────────────────────────┐
│  tmux + Claude Code Agent Teams (변경 없음)                    │
│                                                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │ CTO-팀원1│  │ CTO-팀원2│  │ PM-팀원1 │  ← tmux pane     │
│  │ (Opus)   │  │ (Opus)   │  │ (Opus)   │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │              │              │                         │
│       └──────────────┴──────────────┘                         │
│                      │                                        │
│  ┌───────────────────┴────────────────────────────┐          │
│  │  bkit 상태 파일 감시자 (신규, chokidar)          │          │
│  │                                                │          │
│  │  감시 대상:                                     │          │
│  │  • .bkit/runtime/peer-map.json    → agent 상태  │          │
│  │  • .bkit/runtime/agent-state.json → 팀원 목록    │          │
│  │  • .bkit/runtime/team-context-*.json → 팀 메타  │          │
│  │  • .bkit/audit/*.jsonl            → 이벤트 로그  │          │
│  │                                                │          │
│  │  변경 감지 시:                                   │          │
│  │  1) 파일 파싱                                   │          │
│  │  2) DB agents/heartbeat_runs 업데이트            │          │
│  │  3) events 테이블에 이벤트 기록                   │          │
│  │  4) WebSocket으로 UI에 실시간 전파               │          │
│  └────────────────────┬───────────────────────────┘          │
│                       │                                       │
│                       ↓                                       │
│  ┌────────────────────┴───────────────────────────┐          │
│  │  통합 서버 (localhost:3201)                      │          │
│  │  AgentService.syncFromRuntime()                 │          │
│  └─────────────────────────────────────────────────┘          │
└───────────────────────────────────────────────────────────────┘
```

### 6.2 비용 수집 방법

```typescript
// Claude Code는 세션 종료 시 토큰 사용량을 stdout에 출력.
// 또한 ~/.claude/projects/*/session-*.json에 기록.

// 방법 1: 세션 로그 파일 감시 (권장)
// ~/.claude/projects/-Users-smith-projects-bscamp/
//   sessions/session-*.json 파일에 토큰 사용량 포함

// 방법 2: tmux pane 캡쳐 후 파싱
// tmux capture-pane -t {pane} -p | grep 'tokens'

// 방법 3: Claude Code API 응답 헤더
// x-anthropic-input-tokens, x-anthropic-output-tokens

// 구현: dashboard/server/services/cost-collector.ts
export class CostCollector {
  // 10초 간격으로 실행 (setInterval)
  async collectFromSessions(): Promise<void> {
    const sessionsDir = path.join(
      os.homedir(),
      '.claude/projects/-Users-smith-projects-bscamp'
    );
    // 최근 수정된 세션 파일 읽기
    // 토큰 사용량 추출
    // cost_events 테이블에 기록
    // 예산 평가 (evaluateBudget)
  }
}
```

---

## 7. 디렉토리 구조

```
dashboard/                           ← 신규 디렉토리 (bscamp 루트)
├── package.json                     ← 별도 의존성
├── vite.config.ts                   ← Vite 설정
├── tsconfig.json
├── tailwind.config.ts               ← Primary #F75D5D
├── drizzle.config.ts                ← SQLite 설정
│
├── .data/
│   └── bkit.db                      ← SQLite DB 파일
│
├── src/                             ← React 프론트엔드
│   ├── main.tsx
│   ├── App.tsx
│   ├── pages/
│   │   ├── 대시보드.tsx              ← Paperclip Dashboard.tsx 기반
│   │   ├── 비용.tsx                  ← Paperclip Costs.tsx 기반
│   │   ├── 조직도.tsx                ← Paperclip OrgChart.tsx 기반
│   │   ├── 팀관리.tsx                ← Paperclip Agents.tsx 기반
│   │   ├── 체인편집.tsx              ← 신규
│   │   └── 태스크목록.tsx            ← Paperclip Issues.tsx 기반
│   ├── components/
│   │   ├── 에이전트상태패널.tsx       ← ActiveAgentsPanel
│   │   ├── 지표카드.tsx              ← MetricCard
│   │   ├── 활동차트.tsx              ← ActivityCharts
│   │   ├── 예산정책카드.tsx          ← BudgetPolicyCard
│   │   ├── 예산초과카드.tsx          ← BudgetIncidentCard
│   │   ├── 지출카드.tsx              ← BillerSpendCard
│   │   ├── 쿼터바.tsx               ← QuotaBar
│   │   ├── 체인편집기.tsx            ← 신규
│   │   ├── 체인스텝카드.tsx          ← 신규
│   │   ├── 레이아웃.tsx              ← Layout
│   │   ├── 사이드바.tsx              ← Sidebar
│   │   └── ...
│   ├── context/
│   │   ├── 실시간Provider.tsx        ← LiveUpdatesProvider
│   │   └── 토스트Context.tsx         ← ToastContext
│   ├── api/
│   │   ├── client.ts                ← baseURL: localhost:3201
│   │   ├── tickets.ts               ← 신규
│   │   ├── agents.ts
│   │   ├── costs.ts
│   │   ├── budgets.ts
│   │   ├── chains.ts                ← 신규
│   │   └── dashboard.ts
│   ├── hooks/
│   │   └── useDateRange.ts
│   └── lib/
│       ├── 상태라벨.ts               ← 한국어 상태 매핑
│       ├── router.tsx
│       └── queryKeys.ts
│
└── server/                          ← Express 백엔드
    ├── index.ts                     ← 진입점 (포트 3201)
    ├── app.ts                       ← Express 설정
    ├── db/
    │   ├── index.ts                 ← Drizzle + better-sqlite3
    │   └── schema.ts                ← 10개 테이블 정의
    ├── services/
    │   ├── tickets.ts               ← Paperclip issues.ts 경량화
    │   ├── agents.ts                ← Paperclip agents.ts 경량화
    │   ├── costs.ts                 ← Paperclip costs.ts 경량화
    │   ├── budgets.ts               ← Paperclip budgets.ts 경량화
    │   ├── dashboard.ts             ← Paperclip dashboard.ts 그대로
    │   ├── heartbeat.ts             ← 경량화 (135KB→3KB)
    │   ├── chains.ts                ← 신규 (체인 엔진)
    │   ├── hook-bridge.ts           ← 신규 (기존 hook ↔ DB)
    │   └── cost-collector.ts        ← 신규 (토큰 수집)
    ├── routes/
    │   ├── tickets.ts
    │   ├── agents.ts
    │   ├── costs.ts
    │   ├── budgets.ts
    │   ├── chains.ts
    │   ├── dashboard.ts
    │   ├── hooks.ts                 ← 기존 hook에서 호출받는 엔드포인트
    │   └── org-chart.ts
    ├── realtime/
    │   └── ws.ts                    ← WebSocket 서버
    └── watcher/
        └── runtime-watcher.ts       ← chokidar 파일 감시
```

---

## 8. 의존성 목록

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "@tanstack/react-query": "^5.0.0",
    "recharts": "^2.12.0",
    "tailwindcss": "^3.4.0",

    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0",
    "drizzle-orm": "^0.33.0",
    "ws": "^8.18.0",
    "chokidar": "^3.6.0",
    "cors": "^2.8.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "drizzle-kit": "^0.24.0",
    "typescript": "^5.6.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/ws": "^8.5.0",
    "@types/express": "^4.17.0"
  }
}
```

---

## 9. 구현 일정

| 단계 | 기간 | 산출물 | 의존성 |
|------|------|--------|--------|
| **1단계: 기반** | Day 1~2 | Vite+React 초기화, DB 스키마, Express 서버, WebSocket | — |
| **2단계: 대시보드** | Day 2~3 | 메인 대시보드, 에이전트 상태, Org Chart (한국어) | 1단계 |
| **3단계: Ticket** | Day 3~4 | Ticket CRUD + 체크리스트 + 자동 완료 + 이벤트 | 1단계 |
| **4단계: Hook 브릿지** | Day 4~5 | 기존 hook→DB 연결, pdca-status.json 미러 | 3단계 |
| **5단계: 비용 추적** | Day 5~6 | 비용 수집기, Costs 페이지, 예산 정책 | 1단계 |
| **6단계: 체인 편집기** | Day 6~7 | 체인 CRUD UI, 완료 조건 평가, 자동 트리거 | 3~4단계 |
| **7단계: 팀 관리** | Day 7~8 | TeamCreate/Delete 래퍼, tmux 연결 | 2단계 |
| **8단계: 통합 QA** | Day 8~10 | 전체 흐름 검증, Gap 분석 | 전체 |

---

## 10. 검증 체크리스트

- [ ] `dashboard/` 앱이 `npm run dev`로 localhost:3200 구동
- [ ] SQLite DB 자동 생성 + 스키마 마이그레이션
- [ ] Ticket CRUD: 생성/배정/상태변경/완료
- [ ] 체크리스트 전부 완료 → 자동 completed + webhook
- [ ] 기존 hook에서 `curl localhost:3201/api/hooks/task-completed` 성공
- [ ] pdca-status.json 미러 동기화 (기존 hook 하위 호환)
- [ ] 대시보드: 에이전트 상태 실시간 표시 (WebSocket)
- [ ] 비용: 에이전트별 토큰 사용량 표시
- [ ] 예산: 하드 한도 초과 시 에이전트 자동 정지
- [ ] Org Chart: 우리 팀 트리 구조 표시
- [ ] 체인 편집: PM→CTO→배포 체인 생성/수정
- [ ] 체인 실행: 단계 완료 시 다음 단계 자동 트리거
- [ ] 전체 UI 한국어
- [ ] 기존 bscamp Next.js 앱 영향 없음
- [ ] `npm run build` 성공 (dashboard/ 내부)

---

## 11. 롤백 전략

| 장애 시나리오 | 롤백 방법 |
|-------------|-----------|
| DB 손상 | `dashboard/.data/bkit.db` 삭제 → 스키마 자동 재생성 (데이터 손실, 하지만 pdca-status.json에 미러 있음) |
| Hook 브릿지 실패 | `|| true` 가드로 기존 hook 흐름 차단 안 됨. 브릿지만 무시됨 |
| WebSocket 연결 실패 | React Query가 폴링 폴백 (staleTime 30초) |
| 대시보드 서버 다운 | 기존 bkit CLI 대시보드 + hook 체인 100% 동작 (독립적) |
| 전체 롤백 | `dashboard/` 디렉토리 삭제. 기존 시스템 무관하게 동작 |

**핵심 원칙**: 대시보드가 죽어도 기존 에이전트팀 운영은 100% 유지. 대시보드는 부가 레이어.

---

## 12. 참고 문서

- Paperclip GitHub: https://github.com/paperclipai/paperclip
- Paperclip DB 스키마: `packages/db/src/schema/` (Drizzle ORM, 58개 테이블)
- Paperclip 공유 타입: `packages/shared/src/types/` (28개 타입 파일)
- Plan 문서: `docs/01-plan/features/paperclip-dashboard-adoption.plan.md`
- 기존 설계: `CLAUDE.md` → PDCA 체인 핸드오프 프로토콜
- 기존 hook 체인: `.bkit/hooks/pdca-chain-handoff.sh` (v5, 13.6KB)
- 현재 PDCA 상태: `.bkit/state/pdca-status.json` (v3.0 스키마)
