# Paperclip × bkit 통합 설계서 v3

> 작성일: 2026-03-30 | PDCA Level: L2 | 상태: Design
> Plan: `docs/01-plan/features/paperclip-dashboard-adoption.plan.md`
> 이전 버전: `docs/02-design/features/paperclip-bkit-integration-v2.design.md` (v2)

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Paperclip × bkit Integration v3 (Paperclip 포크 통합 v3) |
| 작성일 | 2026-03-30 |
| 예상 기간 | 5~7일 |

| 관점 | 내용 |
|------|------|
| Problem | v2 설계는 Paperclip을 "참고"하여 처음부터 구현하는 접근 — 같은 로직을 재작성하는 비효율 + 원본 패턴 누락 위험 |
| Solution | Paperclip 코드를 직접 포크하여 우리 구조에 맞게 수정 (fork & modify). 이미 구현된 13테이블+14서비스 기반에 Paperclip 원본 코드를 직접 이식 |
| Function UX Effect | Smith님이 코드 없이 에이전트 현황 파악, 비용 관리, 체인 편집, 루틴 관리, 지식 검색 가능 |
| Core Value | Paperclip 원본 코드의 검증된 로직 활용 + 우리 팀 구조(tmux/PDCA/단일테넌트)에 최적화 |

### v2 → v3 주요 변경

| 항목 | v2 | v3 |
|------|----|----|
| 전략 | Paperclip 참고 설계 (처음부터 작성) | **Paperclip 코드 직접 포크** (fork & modify) |
| 시작점 | 빈 프로젝트 | **이미 구현된 13테이블 + 14서비스 + 8페이지** |
| 서비스 수 | 11개 (6차용 + 5신규) | **16개** (이미 구현, Paperclip 원본 코드 이식) |
| DB 테이블 | 11개 | **13개** (routines, knowledge_entries 추가) |
| UI 페이지 | 7개 | **8개** (Routines 페이지 추가) |
| 파일 매핑 | 모듈/함수 레벨 | **파일별 3가지 카테고리 (COPY/ADAPT/NEW)** |
| TDD | 56건 | **68건** (routines 6건 + knowledge 6건 추가) |
| 추가 기능 | — | **Routines (크론), Knowledge (학습), Transcript (실행 로그)** |

---

## 1. v2 → v3 전략 전환

### 1.1 전략 변경 이유

v2는 Paperclip을 "참고"하여 처음부터 설계/구현하는 접근이었다. 그러나:

1. **이미 상당 부분 구현됨** — v2 설계 기반으로 13테이블, 14서비스, 10라우트, 8페이지가 이미 존재
2. **Paperclip 원본 코드를 직접 가져오는 것이 효율적** — 같은 로직을 재작성하는 대신, 검증된 원본 복사 후 수정
3. **누락 기능 발견** — Routines (크론), Knowledge (학습 데이터), Transcript (실행 로그 뷰어) 가 v2에 없었으나 필요

### 1.2 이미 구현된 것 (현재 상태)

**서버 (Express, port 3201):**

| 구분 | 파일 | 상태 |
|------|------|------|
| 서비스 (16개) | tickets, agents, costs, budgets, chains, dashboard, heartbeat, hook-bridge, notifications, rate-limiter, cost-collector, agent-poller, knowledge, routines + event-bus, ws | 구현 완료 |
| 라우트 (10개) | tickets, agents, costs, budgets, chains, dashboard, hooks, notifications, pdca, routines | 구현 완료 |
| DB (13테이블) | tickets, agents, heartbeat_runs, cost_events, budget_policies, budget_incidents, workflow_chains, workflow_steps, events, pdca_features, notifications, routines, knowledge_entries | 구현 완료 |
| 폴링 | AgentPoller (10초 간격 tmux 폴링) | 구현 완료 |
| 이벤트 | EventBus (28개 이벤트 타입) | 구현 완료 |
| WebSocket | 모든 이벤트 브로드캐스트 | 구현 완료 |
| Hook 브릿지 | 4개 엔드포인트 | 구현 완료 |
| TDD (71건) | services 7개 + integration 3개 + schema 1개 | 구현 완료 |

**UI (React 19 + Vite, port 3200):**

| 파일 | 상태 |
|------|------|
| DashboardPage.tsx | 기본 구현 |
| TicketsPage.tsx | 기본 구현 |
| CostsPage.tsx | 기본 구현 |
| AgentsPage.tsx | 기본 구현 |
| OrgChartPage.tsx | 기본 구현 |
| ChainsPage.tsx | 기본 구현 |
| ActivityPage.tsx | 기본 구현 |
| Layout.tsx, MetricCard.tsx, StatusBadge.tsx | 기본 구현 |

### 1.3 v3에서 추가/강화하는 것

| 영역 | 내용 | Paperclip 원본 |
|------|------|---------------|
| **Routines 서비스** | 크론 기반 반복 작업 관리 (이미 DB/서비스 구현, UI 미구현) | `paperclip/server/src/services/routines.ts` (47.7KB) |
| **Knowledge 서비스** | 에이전트 학습 데이터 관리 (이미 DB/서비스 구현, UI 미구현) | `paperclip/server/src/services/knowledge.ts` |
| **Routines 페이지** | 크론 작업 목록 + 실행 이력 + 생성/편집 UI | `paperclip/ui/src/pages/Routines.tsx` |
| **Transcript 뷰어** | 에이전트 실행 로그 상세 뷰 | `paperclip/ui/src/components/transcript/` |
| **UI 고도화** | Paperclip 원본 컴포넌트 포크로 완성도 향상 | 각 페이지별 원본 |
| **ScheduleEditor** | 크론 표현식 편집 위젯 | `paperclip/ui/src/components/ScheduleEditor.tsx` |
| **에이전트 다이얼로그** | 에이전트 생성/편집 UI | `paperclip/ui/src/components/NewAgentDialog.tsx` |
| **태스크 다이얼로그** | 태스크 생성/편집 UI | `paperclip/ui/src/components/NewIssueDialog.tsx` |

---

## 2. Paperclip 파일 매핑 — 가져오기 전략

모든 파일을 3가지 카테고리로 분류:
- **COPY**: Paperclip에서 직접 복사 후 경미한 수정 (companyId 제거, 한국어화 수준)
- **ADAPT**: Paperclip 패턴 참고하되 크게 변경 (구조 변환, 로직 재작성)
- **NEW**: Paperclip에 없어서 새로 작성

### 2.1 서버 서비스 매핑

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
카테고리  Paperclip 원본                          우리 파일                        수정 사항
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ADAPT    paperclip/server/src/services/           dashboard/server/services/       차용 함수: createIssue→createTicket,
         issues.ts (65KB, ~2000줄)                tickets.ts (~200줄, 이미 구현)    updateIssue→updateTicket,
                                                                                   listIssues→listTickets,
                                                                                   updateChecklist() 그대로
                                                                                   제거: companyId, memberId,
                                                                                   sprint/epic, 댓글, 라벨
                                                                                   추가: pdca_phase, match_rate,
                                                                                   push_verified, 자동 completed
                                                                                   변환: PostgreSQL → SQLite (Drizzle)

COPY     paperclip/server/src/services/           dashboard/server/services/       차용 함수: recordCostEvent,
         costs.ts (17KB, ~500줄)                  costs.ts (~220줄, 이미 구현)      getCostSummary, getCostByAgent,
                                                                                   getCostByModel, getWindowSpend
                                                                                   제거: companyId, 멀티테넌트
                                                                                   변환: PostgreSQL → SQLite

ADAPT    paperclip/server/src/services/           dashboard/server/services/       차용 함수: createPolicy,
         budgets.ts (32KB, ~900줄)                budgets.ts (~230줄, 이미 구현)    evaluateBudget, handleIncident
                                                                                   제거: 결제 연동, 조직 범위
                                                                                   추가: P8 rate-limit 연동

ADAPT    paperclip/server/src/services/           dashboard/server/services/       차용 함수: registerAgent,
         agents.ts (24KB, ~700줄)                 agents.ts (~180줄, 이미 구현)     updateStatus, getAgentTree
                                                                                   제거: adapterConfig, providerData
                                                                                   추가: tmux 필드, idle 감지,
                                                                                   peer_id, AgentPoller 연결

COPY     paperclip/server/src/services/           dashboard/server/services/       차용 함수: getSummaryStats
         dashboard.ts (4KB, ~100줄)               dashboard.ts (~70줄, 이미 구현)   추가: PDCA 진행률, 비용 요약

ADAPT    paperclip/server/src/services/           dashboard/server/services/       차용: createRun, finishRun
         heartbeat.ts (135KB, ~4000줄)            heartbeat.ts (~90줄, 이미 구현)   극히 일부만 (토큰 기록)
                                                                                   제거: 에이전트 실행 로직 전부
                                                                                   (tmux가 실행 담당)

ADAPT    paperclip/server/src/services/           dashboard/server/services/       차용: createRoutine, updateRoutine,
         routines.ts (48KB, ~1400줄)              routines.ts (~360줄, 이미 구현)   toggleRoutine, listRoutines,
                                                                                   executeRoutine, getRunHistory
                                                                                   제거: companyId, routineTriggers
                                                                                   변환: PostgreSQL → SQLite
                                                                                   추가: nextRunAt 계산, 출력 기록

COPY     paperclip/server/src/realtime/           dashboard/server/realtime/       차용: WebSocket 서버 구조,
         live-events-ws.ts (8KB)                  ws.ts (~80줄, 이미 구현)          이벤트 브로드캐스트
                                                                                   제거: companyId 스코핑

ADAPT    paperclip/server/src/services/           dashboard/server/services/       차용: createEntry, listByAgent,
         knowledge.ts (~15KB)                     knowledge.ts (~140줄, 이미 구현)  searchEntries, getByCategory
                                                                                   제거: companyId, 벡터 검색
                                                                                   추가: tags 필터, 소스 ticket 연결

━━━━ 신규 서비스 (Paperclip에 없음, v2에서 이미 설계) ━━━━

NEW      (없음)                                   dashboard/server/services/       체인 CRUD, evaluateCompletion,
                                                  chains.ts (~250줄, 이미 구현)     triggerNextStep, deploy 연동
                                                                                   (Paperclip approvals + routines 참고)

NEW      (없음)                                   dashboard/server/services/       bash hook → DB 이벤트 브릿지,
                                                  hook-bridge.ts (~160줄, 구현)     pdca-status.json 미러

NEW      (없음)                                   dashboard/server/services/       이벤트 → 알림 변환,
                                                  notifications.ts (~100줄, 구현)   읽음/미읽음, Slack webhook

NEW      (없음)                                   dashboard/server/services/       에이전트별 요청 큐잉,
                                                  rate-limiter.ts (~40줄, 구현)     100ms 최소 간격

NEW      (없음)                                   dashboard/server/services/       CC 세션 파일 감시 → 비용 추출
                                                  cost-collector.ts (~70줄, 구현)

NEW      (없음)                                   dashboard/server/services/       10초 간격 tmux list-panes 폴링
                                                  agent-poller.ts (~130줄, 구현)    → agents 테이블 동기화
```

### 2.2 UI 페이지 매핑

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
카테고리  Paperclip 원본 파일                      우리 파일                        수정 사항
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ADAPT    paperclip/ui/src/pages/                  dashboard/src/pages/             한국어, MetricCard 4열
         Dashboard.tsx                            DashboardPage.tsx (구현)          (에이전트/태스크/비용/체인)

ADAPT    paperclip/ui/src/pages/                  dashboard/src/pages/             issues→tickets, PDCA 필드,
         Issues.tsx + IssueDetail.tsx              TicketsPage.tsx (구현)            체크리스트 자동 완료 표시

ADAPT    paperclip/ui/src/pages/                  dashboard/src/pages/             5탭 한국어화, 달러→원화 옵션
         Costs.tsx (49KB)                         CostsPage.tsx (구현)              모델별/에이전트별/시간별

ADAPT    paperclip/ui/src/pages/                  dashboard/src/pages/             우리 팀 구조 반영
         OrgChart.tsx                             OrgChartPage.tsx (구현)           reports_to 트리 렌더링

ADAPT    paperclip/ui/src/pages/                  dashboard/src/pages/             TeamCreate/Delete 연결
         Agents.tsx + AgentDetail.tsx              AgentsPage.tsx (구현)             tmux pane 정보, idle 표시

ADAPT    paperclip/ui/src/pages/                  dashboard/src/pages/             크론 작업 목록 + 실행 이력
         Routines.tsx (v3 신규 차용)               RoutinesPage.tsx (신규)           한국어, 크론 파싱 한국어 설명
                                                                                   ScheduleEditor 포크

NEW      (없음)                                   dashboard/src/pages/             체인 편집기 (D&D)
                                                  ChainsPage.tsx (구현)

NEW      (없음)                                   dashboard/src/pages/             events 테이블 뷰어
                                                  ActivityPage.tsx (구현)           필터/검색
```

### 2.3 UI 컴포넌트 매핑

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
카테고리  Paperclip 원본 파일                      우리 파일                        수정 사항
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━ 레이아웃 ━━━━

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        Primary #F75D5D, Pretendard
         Layout.tsx                               Layout.tsx (구현)                 한국어 메뉴 8개

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        한국어 메뉴, 8페이지 네비
         Sidebar.tsx + SidebarAgents.tsx           Sidebar.tsx (예정)               에이전트 실시간 상태 목록

━━━━ 대시보드 ━━━━

COPY     paperclip/ui/src/components/             dashboard/src/components/        ko-KR 숫자 포맷
         MetricCard.tsx (1.5KB)                   MetricCard.tsx (구현)

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        한국어 상태 라벨
         ActiveAgentsPanel.tsx (5.7KB)            AgentStatusPanel.tsx (예정)       tmux pane 정보 표시

COPY     paperclip/ui/src/components/             dashboard/src/components/        Recharts 유지
         ActivityCharts.tsx (10KB)                ActivityCharts.tsx (예정)          ko-KR 날짜 포맷

COPY     paperclip/ui/src/components/             dashboard/src/components/        이벤트 한국어화
         ActivityRow.tsx (5.3KB)                  ActivityRow.tsx (예정)

COPY     paperclip/ui/src/components/             dashboard/src/components/        한국어 tooltip
         StatusIcon.tsx + StatusBadge.tsx          StatusBadge.tsx (구현)

━━━━ 비용 ━━━━

COPY     paperclip/ui/src/components/             dashboard/src/components/        scope 한국어화
         BudgetPolicyCard.tsx (9.2KB)             BudgetPolicyCard.tsx (예정)       단일테넌트 (global/agent/team)

COPY     paperclip/ui/src/components/             dashboard/src/components/        알림 한국어화
         BudgetIncidentCard.tsx (4KB)             BudgetIncidentCard.tsx (예정)

COPY     paperclip/ui/src/components/             dashboard/src/components/        Anthropic 고정
         BillerSpendCard.tsx (5.7KB)              SpendCard.tsx (예정)

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        단순화
         ProviderQuotaCard.tsx (17.6KB)           QuotaCard.tsx (예정)              단일 provider

COPY     paperclip/ui/src/components/             dashboard/src/components/        그대로 사용
         QuotaBar.tsx (2KB)                       QuotaBar.tsx (예정)

COPY     paperclip/ui/src/components/             dashboard/src/components/        날짜 ko-KR
         FinanceTimelineCard.tsx (3.2KB)          TimelineCard.tsx (예정)

COPY     paperclip/ui/src/components/             dashboard/src/components/        Opus/Sonnet 표시
         AccountingModelCard.tsx (3.1KB)          ModelCostCard.tsx (예정)

━━━━ 태스크/에이전트 ━━━━

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        issues→tickets 리네임
         IssueRow.tsx + IssuesList.tsx             TicketRow.tsx (예정)              PDCA 필드 추가

COPY     paperclip/ui/src/components/             dashboard/src/components/        자동 완료 표시 추가
         IssueChecklist.tsx                       TicketChecklist.tsx (예정)

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        한국어, 우리 필드 매핑
         NewIssueDialog.tsx                       NewTicketDialog.tsx (예정)        (feature, pdca_phase 등)

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        tmux 정보, 우리 역할 구조
         NewAgentDialog.tsx                       NewAgentDialog.tsx (예정)

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        tmux 액션 연결
         AgentActionButtons.tsx                   AgentActionButtons.tsx (예정)     (재시작/정지/종료)

━━━━ 루틴 (v3 신규) ━━━━

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        한국어 크론 설명
         ScheduleEditor.tsx                       ScheduleEditor.tsx (신규)         간격/시간대 한국어화

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        한국어, 실행 이력 표시
         RoutineCard.tsx                          RoutineCard.tsx (신규)

━━━━ 트랜스크립트 (v3 신규) ━━━━

ADAPT    paperclip/ui/src/components/             dashboard/src/components/        stdout 파싱, 한국어 상태
         transcript/TranscriptViewer.tsx          TranscriptViewer.tsx (신규)       tmux pane 출력 표시

━━━━ 알림 ━━━━

COPY     paperclip/ui/src/components/             dashboard/src/components/        한국어 알림 메시지
         NotificationBell.tsx                     NotificationBell.tsx (예정)

━━━━ 체인 (신규) ━━━━

NEW      (없음)                                   dashboard/src/components/        D&D 워크플로 편집
                                                  ChainEditor.tsx (예정)

NEW      (없음)                                   dashboard/src/components/        개별 단계 카드
                                                  ChainStepCard.tsx (예정)

NEW      (없음)                                   dashboard/src/components/        JSON 완료조건 편집
                                                  ConditionEditor.tsx (예정)

━━━━ Context/Hook ━━━━

ADAPT    paperclip/ui/src/context/                dashboard/src/context/           WS localhost:3201
         LiveUpdatesProvider.tsx (26.6KB)         LiveUpdatesProvider.tsx (예정)    companyId 제거, 단일 채널

COPY     paperclip/ui/src/context/                dashboard/src/context/           한국어 메시지
         ToastContext.tsx (4.3KB)                 ToastContext.tsx (예정)

ADAPT    paperclip/ui/src/api/                    dashboard/src/hooks/             baseURL: localhost:3201
         client.ts                                useApi.ts (구현)                  @tanstack/react-query 래퍼
```

### 2.4 안 쓰는 Paperclip 코드 (명시적 제외)

| Paperclip 디렉토리/파일 | 크기 | 제외 이유 |
|------------------------|------|-----------|
| `packages/adapters/` (전체) | — | 우리는 tmux 직접 폴링 |
| `packages/plugins/` (전체) | — | 플러그인 시스템 불필요 |
| `server/src/services/auth*.ts` (4개) | ~40KB | 로컬 도구, 인증 불필요 |
| `server/src/services/companies*.ts` (3개) | ~60KB | 멀티테넌트 불필요 (단일 조직) |
| `server/src/services/projects*.ts` | ~30KB | 프로젝트 계층 불필요 (PDCA feature) |
| `server/src/services/goals*.ts` | ~25KB | 골 시스템 불필요 |
| `server/src/services/workspace*.ts` (5개) | ~80KB | 우리는 git worktree 직접 |
| `server/src/services/documents*.ts` | ~20KB | 우리는 파일시스템 직접 |
| `server/src/services/secrets.ts` | ~15KB | .env 기반 유지 |
| `server/src/services/finance.ts` | ~5KB | 재무 이벤트 과도 |
| `server/src/services/labels.ts` | ~8KB | feature + phase로 충분 |
| `server/src/services/sprints.ts` | ~12KB | PDCA 사이클이 sprint 역할 |
| `ui/src/components/CompanyRail.tsx` | — | 멀티테넌트 UI |
| `ui/src/components/CompanySwitcher.tsx` | — | 멀티테넌트 UI |
| `ui/src/components/Plugin*.tsx` (8개) | — | 플러그인 UI |
| `ui/src/components/Project*.tsx` | — | 프로젝트 계층 UI |
| `ui/src/components/Goal*.tsx` | — | 골 UI |
| `ui/src/components/OnboardingWizard.tsx` | — | 온보딩 불필요 |
| `ui/src/components/Auth*.tsx` | — | 인증 UI 불필요 |
| `cli/` (전체) | — | CLI 도구 불필요 |
| `docs/` (전체) | — | Mintlify 문서 불필요 |

---

## 3. DB 매핑 (Paperclip 60테이블 → 우리 13테이블)

### 3.1 1:1 매핑

| Paperclip 테이블 | Paperclip 컬럼 수 | 우리 테이블 | 우리 컬럼 수 | 제거된 컬럼 | 추가된 컬럼 |
|-----------------|-------------------|------------|------------|-----------|-----------|
| `issues` | 30+ | `tickets` | 22 | companyId, memberId, sprintId, epicId, labels, comments | pdcaPhase, processLevel, matchRate, chainId, chainStepId, pushVerified |
| `agents` | 27 | `agents` | 20 | adapterConfig, providerData, companyId, companyMembershipId | tmuxSession, tmuxPane, peerId, pid, idleWarningSent |
| `cost_events` | 12 | `cost_events` | 12 | companyId | (동일) |
| `budget_policies` | 10 | `budget_policies` | 10 | companyId | (동일) |
| `budget_incidents` | 8 | `budget_incidents` | 8 | (동일) | (동일) |
| `heartbeat_runs` | 15+ | `heartbeat_runs` | 13 | agentSessionId, workspaceId, 실행 세부 | (경량화) |
| `activity_log` | 8 | `events` | 7 | companyId | (동일) |
| `routines` | 12 | `routines` | 12 | companyId, routineTriggers FK | (동일) |

### 3.2 N:1 통합

| Paperclip 테이블들 | 우리 테이블 | 통합 방식 |
|-------------------|------------|----------|
| `routines` + `routine_triggers` + `routine_runs` (3개) | `routines` (1개) | triggers는 cronExpression 단일 필드로, runs는 lastRunAt/Status/Output 필드로 통합 |
| `approvals` + `approval_policies` | `workflow_steps.completion_condition` | 승인 조건을 체인 단계의 JSON 완료 조건으로 통합 |
| `company_skills` + `skill_versions` | `knowledge_entries` | 스킬을 에이전트별 학습 데이터로 단순화 |

### 3.3 안 쓰는 테이블 (50개)

| 카테고리 | Paperclip 테이블 | 제외 이유 |
|---------|-----------------|----------|
| **멀티테넌트** (8개) | companies, company_memberships, company_secrets, company_logos, company_settings, invites, join_requests, instance_user_roles | 단일 조직 — 멀티테넌트 불필요 |
| **인증** (6개) | auth_sessions, auth_accounts, auth_verifications, cli_auth_challenges, board_api_keys, principal_permission_grants | 로컬 도구 — 인증 불필요 |
| **프로젝트/골** (4개) | projects, project_workspaces, goals, project_goals | PDCA feature가 프로젝트 역할 |
| **플러그인** (8개) | plugins, plugin_versions, plugin_installs, plugin_configs, plugin_permissions, plugin_events, plugin_logs, plugin_secrets | 플러그인 시스템 불필요 |
| **에이전트 런타임** (5개) | agent_api_keys, agent_config_revisions, agent_runtime_state, agent_task_sessions, agent_wakeup_requests | tmux 직접 관리 |
| **워크스페이스** (3개) | execution_workspaces, workspace_operations, workspace_runtime_services | git worktree 직접 사용 |
| **문서** (3개) | documents, document_revisions, assets | 파일시스템 직접 접근 |
| **협업** (7개) | issue_comments, issue_labels, issue_watchers, issue_history, issue_links, issue_attachments, labels | claude-peers로 소통 |
| **세분화 이벤트** (2개) | finance_events, heartbeat_run_events | 과도한 세분화 |
| **기타** (4개) | notifications (Paperclip 버전), user_preferences, feature_flags, system_configs | 우리 구현으로 대체 |

### 3.4 v3 추가 테이블/컬럼

v2 대비 추가된 테이블 (이미 구현):

| 테이블 | 설명 | Paperclip 원본 |
|--------|------|---------------|
| `routines` (T12) | 반복 작업 관리 — cronExpression, command, enabled, lastRun*, nextRunAt | `routines` + `routine_triggers` + `routine_runs` 통합 |
| `knowledge_entries` (T13) | 에이전트 학습 데이터 — agentId, category, title, content, tags | `company_skills` 단순화 |

---

## 4. 에이전트 모델 매핑

### 4.1 Paperclip vs 우리 비교

| 관점 | Paperclip | 우리 (bkit) |
|------|-----------|------------|
| **에이전트 실행** | adapter 기반 (claude_local, codex_local, cursor_local, gemini_local) | tmux pane 기반 (Claude Code) |
| **에이전트 식별** | companyId + agentId + adapter_type | tmux_session + tmux_pane + peer_id |
| **스코핑** | companyId (멀티테넌트) | 없음 (단일 조직) |
| **상태 감지** | adapter heartbeat 콜백 | AgentPoller 10초 폴링 (tmux list-panes) |
| **에이전트 제어** | API를 통한 pause/resume/terminate | tmux send-keys / kill-pane |
| **계층 구조** | reports_to (Org Chart) | reports_to (동일) + team 필드 |
| **인증** | Agent JWT + API Keys | local_trusted (인증 없음) |

### 4.2 필드 매핑 테이블

| Paperclip `agents` 필드 | 우리 `agents` 필드 | 변환 |
|--------------------------|-------------------|------|
| `id` | `id` | 동일 (hex random) |
| `name` | `name` | 동일 |
| `display_name` | `displayName` | camelCase 변환 |
| `company_id` | — | 제거 |
| `company_membership_id` | — | 제거 |
| `adapter_type` | — | 제거 (tmux 고정) |
| `adapter_config` (JSON) | — | 제거 |
| `provider_data` (JSON) | — | 제거 |
| `status` | `status` | 동일 enum (idle/running/paused/error/terminated) |
| `pause_reason` | `pauseReason` | 동일 |
| `reports_to` | `reportsTo` | 동일 (Org Chart) |
| — | `tmuxSession` | 추가: tmux 세션명 |
| — | `tmuxPane` | 추가: tmux pane ID |
| — | `peerId` | 추가: Claude Code peer ID |
| — | `pid` | 추가: OS 프로세스 ID |
| `model` | `model` | 동일 (claude-opus-4-6 등) |
| — | `team` | 추가: cto/pm/marketing |
| — | `role` | 추가: leader/developer/qa/pm/coo |
| — | `idleWarningSent` | 추가: P10 idle 경고 플래그 |
| `icon` | `icon` | 동일 |
| `capabilities` | `capabilities` | 동일 (JSON) |

### 4.3 에이전트 생명주기 차이

```
Paperclip:
  API에서 에이전트 등록 → adapter 선택 → adapter가 프로세스 시작
  → heartbeat 콜백 → 작업 완료 시 adapter가 결과 반환

우리 (bkit):
  TeamCreate로 에이전트 생성 → tmux pane에서 Claude Code 실행
  → AgentPoller가 10초마다 tmux list-panes 폴링 → DB 동기화
  → 작업 완료 시 SendMessage로 리더에게 보고
  → TeamDelete로 종료 → tmux kill-pane
```

---

## 5. 워크플로/체인 매핑

### 5.1 Paperclip vs 우리 비교

| Paperclip 개념 | Paperclip 구현 | 우리 구현 |
|---------------|---------------|----------|
| **Routines** (크론) | routines + routine_triggers + routine_runs (3테이블) | routines (1테이블, 통합) |
| **Approvals** (승인) | approvals + approval_policies (2테이블) | workflow_steps.completion_condition (JSON) |
| **Issues** (작업) | issues (30+ 컬럼) | tickets (22컬럼, PDCA 추가) |
| **Goals** (목표) | goals + project_goals (2테이블) | pdca_features (PDCA 피처 = 목표) |

### 5.2 세 가지 체인 타입 (v2 유지)

| 체인 | 단계 | auto_trigger | 사용 조건 |
|------|------|-------------|----------|
| **기본 PDCA 체인** | PM(plan+design) → CTO(do+check) → QA(check) → 배포 | 전부 자동 (배포만 수동) | L2/L3 작업 |
| **핫픽스 체인** | CTO(fix) → 배포 | 전부 자동 | L0 긴급 수정 |
| **문서 전용 체인** | PM(plan+design) → 완료 | 전부 자동 | L1 문서 작업 |

### 5.3 Routines (v3 추가)

v2에 없었던 반복 작업 관리. Paperclip의 routines 서비스를 포크.

```
Paperclip routines 구조:
  routines 테이블 → routine_triggers (크론/이벤트/수동) → routine_runs (실행 이력)

우리 routines 구조 (통합):
  routines 테이블 1개에 모두 포함
  ├─ cronExpression — 크론 표현식 (triggers 대체)
  ├─ command — 실행 명령
  ├─ enabled — 활성/비활성
  ├─ lastRunAt/Status/Output — 최근 실행 (runs 대체)
  └─ nextRunAt — 다음 실행 시간 (자동 계산)
```

용도 예시:
- `0 */6 * * *` — 6시간마다 에이전트 idle 체크
- `0 9 * * 1` — 매주 월요일 9시 주간 비용 리포트
- `*/30 * * * *` — 30분마다 peer-map 동기화

---

## 6. Hook 브릿지 매핑

v2의 Hook 분류(유지 12 / 대체 16 / 수정 7 / 삭제 14)를 그대로 유지. v3에서 변경 없음.

### 6.1 v3 관점 업데이트

| 분류 | 건수 | v3 상태 |
|------|------|--------|
| **유지** | 12개 | bash에서만 가능한 OS/tmux 검증 — 변경 없음 |
| **대체** | 16개 | DB+이벤트 서비스로 이전 — 서비스 구현 완료, settings.local.json 전환 대기 |
| **수정** | 7개 | pdca-status.json 읽기 → curl API 전환 — 구현 대기 |
| **삭제** | 14개 | 상위 hook/서비스 대체 — 실질 삭제 10개 |

### 6.2 Hook 브릿지 엔드포인트 (이미 구현)

| 엔드포인트 | 호출자 | 서비스 연결 |
|-----------|--------|-----------|
| `POST /api/hooks/task-completed` | task-completed.sh (settings.local.json) | HookBridgeService.onTaskCompleted() |
| `POST /api/hooks/sync-pdca` | pdca-update.sh | HookBridgeService.syncPdca() |
| `POST /api/hooks/chain-handoff` | pdca-chain-handoff.sh | HookBridgeService.chainHandoff() |
| `POST /api/hooks/commit` | git post-commit hook | HookBridgeService.onCommit() |

---

## 7. UI 컴포넌트 상세 — Paperclip 포크 계획

### 7.1 페이지별 Paperclip 원본 → 우리 변환

**8개 페이지 매핑:**

| # | 우리 페이지 | Paperclip 원본 | 핵심 수정 |
|---|-----------|---------------|----------|
| 1 | DashboardPage.tsx | Dashboard.tsx | MetricCard 4열(에이전트/태스크/비용/체인), 한국어, PDCA 피처 배너 |
| 2 | TicketsPage.tsx | Issues.tsx + IssueDetail.tsx | issues→tickets, PDCA 필드, 체크리스트 자동 완료 |
| 3 | CostsPage.tsx | Costs.tsx (49KB) | 5탭 한국어화, 달러→원화 옵션, 모델별/에이전트별 |
| 4 | AgentsPage.tsx | Agents.tsx + AgentDetail.tsx | tmux 연결, idle 표시, TeamCreate/Delete |
| 5 | OrgChartPage.tsx | OrgChart.tsx | 우리 팀 구조 (Smith→모찌→CTO/PM/마케팅) |
| 6 | ChainsPage.tsx | (신규) | D&D 체인 편집기, 3가지 체인 타입 |
| 7 | ActivityPage.tsx | Activity.tsx 참고 | events 테이블 뷰어, 28개 이벤트 타입 필터 |
| 8 | RoutinesPage.tsx (v3 신규) | Routines.tsx | 크론 작업 목록, ScheduleEditor, 실행 이력 |

### 7.2 공통 수정 항목 (모든 Paperclip 코드 포크 시)

| 수정 항목 | 원본 | 변환 | 적용 범위 |
|----------|------|------|----------|
| companyId 제거 | 모든 API 호출에 companyId 파라미터 | 삭제 | 전체 |
| 한국어화 | 영어 라벨/버튼/메시지 | 한국어 직접 교체 | 전체 |
| 테마 | 기본 색상 | Primary #F75D5D, hover #E54949 | 전체 |
| 폰트 | 시스템 폰트 | Pretendard | 전체 |
| 날짜 포맷 | en-US | ko-KR (YYYY년 MM월 DD일) | 전체 |
| 숫자 포맷 | US comma | ko-KR (1,234) | 전체 |
| API URL | Paperclip 서버 URL | localhost:3201 | 전체 |
| 인증 헤더 | Bearer token | 없음 (local_trusted) | 전체 |
| PostgreSQL | pg 쿼리 | SQLite (Drizzle 경유) | 서버 전체 |

---

## 8. 디렉토리 구조

```
dashboard/                                  ← 이미 존재
├── package.json                            ✅ 구현
├── vite.config.ts                          ✅ 구현
├── vitest.config.ts                        ✅ 구현
├── tsconfig.json                           ✅ 구현
├── tailwind.config.ts                      ✅ 구현 (Primary #F75D5D, Pretendard)
├── drizzle.config.ts                       ✅ 구현
│
├── .data/
│   └── bkit.db                             ← SQLite DB (.gitignore)
│
├── __tests__/                              ✅ 구현
│   ├── setup.ts                            ✅ 인메모리 SQLite
│   ├── db-schema.test.ts                   ✅ 구현
│   ├── services/
│   │   ├── tickets.test.ts                 ✅ TC-T01~TC-T14
│   │   ├── chains.test.ts                  ✅ TC-C01~TC-C16
│   │   ├── hook-bridge.test.ts             ✅ TC-H01~TC-H08
│   │   ├── agents.test.ts                  ✅ TC-A01~TC-A08
│   │   ├── costs.test.ts                   ✅ TC-$01~TC-$10
│   │   ├── routines.test.ts                ✅ TC-R01~TC-R06 (v3 추가)
│   │   └── knowledge.test.ts               ✅ TC-K01~TC-K06 (v3 추가)
│   └── integration/
│       ├── chain-flow.test.ts              ✅ P7 E2E
│       ├── auto-complete.test.ts           ✅ P1+P3 E2E
│       └── budget-halt.test.ts             ✅ P8 E2E
│
├── src/                                    ← React 프론트엔드
│   ├── main.tsx                            ✅ 구현
│   ├── App.tsx                             ✅ 구현 (React Router)
│   │
│   ├── pages/                              ← 8개 페이지
│   │   ├── DashboardPage.tsx               ✅ 기본 구현 (Paperclip Dashboard.tsx 포크)
│   │   ├── TicketsPage.tsx                 ✅ 기본 구현 (Paperclip Issues.tsx 포크)
│   │   ├── CostsPage.tsx                   ✅ 기본 구현 (Paperclip Costs.tsx 포크)
│   │   ├── AgentsPage.tsx                  ✅ 기본 구현 (Paperclip Agents.tsx 포크)
│   │   ├── OrgChartPage.tsx                ✅ 기본 구현 (Paperclip OrgChart.tsx 포크)
│   │   ├── ChainsPage.tsx                  ✅ 기본 구현 (신규)
│   │   ├── ActivityPage.tsx                ✅ 기본 구현 (신규)
│   │   └── RoutinesPage.tsx                🔲 예정 (v3 신규, Paperclip Routines.tsx 포크)
│   │
│   ├── components/                         ← 컴포넌트
│   │   ├── Layout.tsx                      ✅ 구현 (Paperclip Layout.tsx 포크)
│   │   ├── Sidebar.tsx                     🔲 예정 (Paperclip Sidebar.tsx 포크)
│   │   ├── SidebarAgents.tsx               🔲 예정 (Paperclip SidebarAgents.tsx 포크)
│   │   ├── MetricCard.tsx                  ✅ 구현 (Paperclip MetricCard.tsx 포크)
│   │   ├── StatusBadge.tsx                 ✅ 구현 (Paperclip StatusBadge.tsx 포크)
│   │   ├── AgentStatusPanel.tsx            🔲 예정 (Paperclip ActiveAgentsPanel.tsx 포크)
│   │   ├── AgentRunCard.tsx                🔲 예정 (Paperclip AgentRunCard.tsx 포크)
│   │   ├── AgentActionButtons.tsx          🔲 예정 (Paperclip AgentActionButtons.tsx 포크)
│   │   ├── ActivityCharts.tsx              🔲 예정 (Paperclip ActivityCharts.tsx 포크)
│   │   ├── ActivityRow.tsx                 🔲 예정 (Paperclip ActivityRow.tsx 포크)
│   │   ├── TicketRow.tsx                   🔲 예정 (Paperclip IssueRow.tsx 포크)
│   │   ├── TicketChecklist.tsx             🔲 예정 (Paperclip IssueChecklist.tsx 포크)
│   │   ├── NewTicketDialog.tsx             🔲 예정 (Paperclip NewIssueDialog.tsx 포크)
│   │   ├── NewAgentDialog.tsx              🔲 예정 (Paperclip NewAgentDialog.tsx 포크)
│   │   ├── BudgetPolicyCard.tsx            🔲 예정 (Paperclip BudgetPolicyCard.tsx 포크)
│   │   ├── BudgetIncidentCard.tsx          🔲 예정 (Paperclip BudgetIncidentCard.tsx 포크)
│   │   ├── SpendCard.tsx                   🔲 예정 (Paperclip BillerSpendCard.tsx 포크)
│   │   ├── QuotaCard.tsx                   🔲 예정 (Paperclip ProviderQuotaCard.tsx 포크)
│   │   ├── QuotaBar.tsx                    🔲 예정 (Paperclip QuotaBar.tsx 포크)
│   │   ├── TimelineCard.tsx                🔲 예정 (Paperclip FinanceTimelineCard.tsx 포크)
│   │   ├── ModelCostCard.tsx               🔲 예정 (Paperclip AccountingModelCard.tsx 포크)
│   │   ├── ChainEditor.tsx                 🔲 예정 (신규)
│   │   ├── ChainStepCard.tsx               🔲 예정 (신규)
│   │   ├── ConditionEditor.tsx             🔲 예정 (신규)
│   │   ├── NotificationBell.tsx            🔲 예정 (Paperclip NotificationBell.tsx 포크)
│   │   ├── OrgChartTree.tsx                🔲 예정 (Paperclip org-chart-svg.ts 포크)
│   │   ├── ScheduleEditor.tsx              🔲 예정 (v3, Paperclip ScheduleEditor.tsx 포크)
│   │   ├── RoutineCard.tsx                 🔲 예정 (v3, Paperclip RoutineCard.tsx 포크)
│   │   ├── TranscriptViewer.tsx            🔲 예정 (v3, Paperclip transcript/ 포크)
│   │   └── KoreanLabels.tsx                🔲 예정 (한국어 상태/역할 매핑)
│   │
│   ├── context/
│   │   ├── LiveUpdatesProvider.tsx          🔲 예정 (Paperclip LiveUpdatesProvider.tsx 포크)
│   │   └── ToastContext.tsx                 🔲 예정 (Paperclip ToastContext.tsx 포크)
│   │
│   ├── hooks/
│   │   ├── useApi.ts                       ✅ 구현 (API 클라이언트)
│   │   ├── useDateRange.ts                 🔲 예정 (Paperclip useDateRange.ts 포크)
│   │   └── useAgentOrder.ts                🔲 예정 (Paperclip useAgentOrder.ts 포크)
│   │
│   └── lib/
│       ├── korean-labels.ts                🔲 예정 (상태/역할 한국어 매핑)
│       ├── format.ts                       🔲 예정 (ko-KR 숫자/날짜 포맷)
│       └── queryKeys.ts                    🔲 예정 (React Query 키 관리)
│
└── server/                                 ← Express 백엔드
    ├── index.ts                            ✅ 구현 (포트 3201)
    ├── app.ts                              ✅ 구현 (Express + CORS + WS)
    ├── event-bus.ts                        ✅ 구현 (EventEmitter 싱글톤)
    ├── types.d.ts                          ✅ 구현
    │
    ├── db/
    │   ├── index.ts                        ✅ 구현 (Drizzle + better-sqlite3 + WAL)
    │   ├── schema.ts                       ✅ 구현 (13테이블)
    │   ├── create-schema.ts                ✅ 구현 (자동 스키마 생성)
    │   └── seed.ts                         ✅ 구현 (기본 체인, 에이전트)
    │
    ├── services/
    │   ├── tickets.ts                      ✅ 구현 (Paperclip issues.ts ADAPT)
    │   ├── agents.ts                       ✅ 구현 (Paperclip agents.ts ADAPT)
    │   ├── costs.ts                        ✅ 구현 (Paperclip costs.ts COPY)
    │   ├── budgets.ts                      ✅ 구현 (Paperclip budgets.ts ADAPT)
    │   ├── dashboard.ts                    ✅ 구현 (Paperclip dashboard.ts COPY)
    │   ├── heartbeat.ts                    ✅ 구현 (Paperclip heartbeat.ts ADAPT)
    │   ├── chains.ts                       ✅ 구현 (NEW)
    │   ├── hook-bridge.ts                  ✅ 구현 (NEW)
    │   ├── notifications.ts                ✅ 구현 (NEW)
    │   ├── rate-limiter.ts                 ✅ 구현 (NEW)
    │   ├── cost-collector.ts               ✅ 구현 (NEW)
    │   ├── agent-poller.ts                 ✅ 구현 (NEW)
    │   ├── routines.ts                     ✅ 구현 (v3, Paperclip routines.ts ADAPT)
    │   └── knowledge.ts                    ✅ 구현 (v3, Paperclip knowledge.ts ADAPT)
    │
    ├── routes/
    │   ├── tickets.ts                      ✅ 구현
    │   ├── agents.ts                       ✅ 구현
    │   ├── costs.ts                        ✅ 구현
    │   ├── budgets.ts                      ✅ 구현
    │   ├── chains.ts                       ✅ 구현
    │   ├── dashboard.ts                    ✅ 구현
    │   ├── hooks.ts                        ✅ 구현
    │   ├── notifications.ts                ✅ 구현
    │   ├── pdca.ts                         ✅ 구현
    │   └── routines.ts                     ✅ 구현
    │
    ├── realtime/
    │   └── ws.ts                           ✅ 구현 (WebSocket 서버)
    │
    └── watcher/
        └── runtime-watcher.ts              ✅ 구현 (chokidar 파일 감시)
```

---

## 9. TDD 케이스

v2의 56건 유지 + v3 추가 12건 = **총 68건**

### 9.1 TicketService 테스트 (14건, v2 유지)

| ID | 테스트 케이스 | 검증 | 관련 문제 |
|----|------------|------|----------|
| TC-T01 | ticket 생성 시 events에 ticket.created 기록 | events 테이블 INSERT 확인 | — |
| TC-T02 | 상태 변경 시 events에 ticket.status_changed 기록 | from/to 정확 | — |
| TC-T03 | completed 전환 시 completed_at 자동 설정 | ISO-8601 타임스탬프 | — |
| TC-T04 | **체크리스트 전부 완료 → 자동 completed** | status='completed' | **P1, P3** |
| TC-T05 | 체크리스트 일부만 완료 → completed 안 됨 | status 유지 | P3 |
| TC-T06 | 빈 체크리스트 → completed 안 됨 | status 유지 | P3 |
| TC-T07 | **recordCommit → commit_hash 저장** | 필드 값 확인 | **P2, P6** |
| TC-T08 | **verifyPush → push_verified=1** | 필드 값 확인 | **P6** |
| TC-T09 | completed 이벤트 → ChainService 호출 | eventBus.emit 확인 | P1 |
| TC-T10 | 같은 feature 여러 ticket 지원 | feature 인덱스 쿼리 | — |
| TC-T11 | **findStaleTickets: 커밋 있는데 미완료** | 결과 배열 확인 | **P1** |
| TC-T12 | WebSocket으로 이벤트 전파 | ws 메시지 수신 | — |
| TC-T13 | ticket 필터 (팀별, 상태별, feature별) | 결과 정확 | — |
| TC-T14 | ticket 체크리스트 JSON 유효성 | 파싱 성공 | — |

### 9.2 ChainService 테스트 (16건, v2 유지)

| ID | 테스트 케이스 | 검증 | 관련 문제 |
|----|------------|------|----------|
| TC-C01 | 체인 생성 + 3단계 추가 | DB 조회 확인 | — |
| TC-C02 | 단계 순서 변경 | step_order 정확 | — |
| TC-C03 | **checklist_all_done 조건 평가** | true/false 정확 | **P1, P3** |
| TC-C04 | **commit_exists 조건 평가** | commit_hash 존재 확인 | **P2, P6** |
| TC-C05 | **push_verified 조건 평가** | push_verified=1 확인 | **P6** |
| TC-C06 | match_rate 조건 평가 (90% 이상) | 경계값 테스트 | — |
| TC-C07 | build_success 조건 평가 | boolean 확인 | — |
| TC-C08 | **all(복합) 조건 평가: 하나라도 false → false** | 전체 false | **P2** |
| TC-C09 | **all(복합) 조건 평가: 전부 true → true** | 전체 true | **P2** |
| TC-C10 | **triggerNextStep: 다음 단계 ticket 자동 생성** | tickets 테이블 확인 | **P7** |
| TC-C11 | **triggerNextStep: pdca_features phase 전환** | 단계 정확 | **P7** |
| TC-C12 | **triggerNextStep: chain.auto_triggered 이벤트** | events 테이블 확인 | **P7** |
| TC-C13 | 마지막 단계 완료 → onChainCompleted | webhook 호출 확인 | P7 |
| TC-C14 | **deploy_config 있는 단계 → 배포 실행** | execSync 호출 | **P9** |
| TC-C15 | 배포 실패 → system.deploy_result(실패) 기록 | events 확인 | P9 |
| TC-C16 | 비활성 체인 → 무시 | active=0 체크 | — |

### 9.3 HookBridgeService 테스트 (8건, v2 유지)

| ID | 테스트 케이스 | 검증 | 관련 문제 |
|----|------------|------|----------|
| TC-H01 | **onTaskCompleted → 진행 중 ticket 찾기** | 최신 in_progress ticket | **P1** |
| TC-H02 | **syncToPdcaStatusJson: primaryFeature 정확** | 파일 내용 확인 | **P4** |
| TC-H03 | syncToPdcaStatusJson: 미러 파일 생성 | 파일 존재 확인 | P4 |
| TC-H04 | **ticket 없어도 이벤트 기록** | events 테이블 확인 | — |
| TC-H05 | match_rate 전달 시 ticket 업데이트 | 필드 값 확인 | — |
| TC-H06 | chain_step_id 있으면 체인 평가 트리거 | ChainService 호출 | P1, P7 |
| TC-H07 | 서버 다운 시 bash hook 독립 동작 | curl 실패해도 exit 0 | — |
| TC-H08 | 동시 호출 시 DB 일관성 유지 | WAL 모드 검증 | — |

### 9.4 AgentService 테스트 (8건, v2 유지)

| ID | 테스트 케이스 | 검증 | 관련 문제 |
|----|------------|------|----------|
| TC-A01 | 에이전트 등록 | DB INSERT 확인 | — |
| TC-A02 | 상태 변경 | status 정확 | — |
| TC-A03 | **5분 idle → 경고 이벤트** | agent.idle_warning | **P10** |
| TC-A04 | **15분 idle → 자동 정지** | status='paused' | **P10** |
| TC-A05 | heartbeat 갱신 → idle 초기화 | idle_warning_sent=0 | P10 |
| TC-A06 | syncFromRuntime: peer-map → DB 동기화 | agents 업데이트 | — |
| TC-A07 | Org Chart 트리 조회 | reports_to 계층 정확 | — |
| TC-A08 | terminated 에이전트 idle 체크 제외 | running만 대상 | — |

### 9.5 CostService + BudgetService 테스트 (10건, v2 유지)

| ID | 테스트 케이스 | 검증 | 관련 문제 |
|----|------------|------|----------|
| TC-$01 | 비용 이벤트 기록 | cost_events INSERT | — |
| TC-$02 | 에이전트별 집계 | SUM 정확 | — |
| TC-$03 | 모델별 집계 | GROUP BY model 정확 | — |
| TC-$04 | 윈도우별 지출 (일/주/월) | 기간 필터 정확 | — |
| TC-$05 | **예산 80% → warn 이벤트** | budget.warn | **P8** |
| TC-$06 | **예산 100% + hard_stop → 에이전트 정지** | agent paused | **P8** |
| TC-$07 | **예산 100% + hard_stop=0 → 경고만** | 정지 안 함 | **P8** |
| TC-$08 | budget_incidents 기록 | DB INSERT 확인 | P8 |
| TC-$09 | incident 해결 | resolved=1 | — |
| TC-$10 | 글로벌+에이전트 정책 중복 적용 | 둘 다 평가 | P8 |

### 9.6 RoutinesService 테스트 (6건, v3 추가)

| ID | 테스트 케이스 | 검증 |
|----|------------|------|
| TC-R01 | routine 생성 시 nextRunAt 자동 계산 | 크론 표현식 기반 다음 실행 시간 |
| TC-R02 | routine 실행 시 lastRunAt/Status/Output 업데이트 | 필드 값 확인 |
| TC-R03 | routine 비활성화 (enabled=0) → 실행 스킵 | 실행 안 됨 확인 |
| TC-R04 | routine 실행 실패 → lastRunStatus='failed' + 출력 기록 | 에러 저장 |
| TC-R05 | routine 목록 조회 (활성/비활성 필터) | 결과 정확 |
| TC-R06 | routine 삭제 시 events 기록 | routine.deleted 이벤트 |

### 9.7 KnowledgeService 테스트 (6건, v3 추가)

| ID | 테스트 케이스 | 검증 |
|----|------------|------|
| TC-K01 | 학습 데이터 생성 | knowledge_entries INSERT |
| TC-K02 | 에이전트별 조회 | agentId 필터 정확 |
| TC-K03 | 카테고리별 조회 | category 필터 정확 |
| TC-K04 | 태그 검색 (JSON 배열 내 검색) | tags LIKE 쿼리 |
| TC-K05 | 소스 ticket 연결 확인 | sourceTicketId FK |
| TC-K06 | 학습 데이터 삭제 시 events 기록 | knowledge.deleted 이벤트 |

### 9.8 통합 테스트 (3건, v2 유지)

| ID | 테스트 케이스 | E2E 흐름 |
|----|------------|---------|
| INT-01 | 체인 자동 흐름 | PM ticket 완료 → CTO ticket 자동 생성 → 배포 (P7) |
| INT-02 | 자동 완료 흐름 | 체크리스트 전부 done → 자동 completed → webhook (P1, P3) |
| INT-03 | 예산 하드 스톱 | 비용 초과 → 에이전트 정지 → 해제 (P8) |

### 9.9 DB 스키마 테스트 (1건)

| ID | 테스트 케이스 | 검증 |
|----|------------|------|
| TC-DB01 | 13테이블 자동 생성 + FK 무결성 | 스키마 존재 + 인덱스 확인 |

**총 68건** | v2 56건 + v3 추가 12건 (routines 6 + knowledge 6)

### 9.10 테스트 파일 구조

```
dashboard/__tests__/
├── setup.ts                               ← 인메모리 SQLite + 스키마 자동 생성
├── db-schema.test.ts                      ← TC-DB01
├── services/
│   ├── tickets.test.ts                    ← TC-T01 ~ TC-T14
│   ├── chains.test.ts                     ← TC-C01 ~ TC-C16
│   ├── hook-bridge.test.ts                ← TC-H01 ~ TC-H08
│   ├── agents.test.ts                     ← TC-A01 ~ TC-A08
│   ├── costs.test.ts                      ← TC-$01 ~ TC-$10
│   ├── routines.test.ts                   ← TC-R01 ~ TC-R06 (v3)
│   └── knowledge.test.ts                  ← TC-K01 ~ TC-K06 (v3)
└── integration/
    ├── chain-flow.test.ts                 ← INT-01 (P7 E2E)
    ├── auto-complete.test.ts              ← INT-02 (P1+P3 E2E)
    └── budget-halt.test.ts                ← INT-03 (P8 E2E)
```

---

## 10. 구현 일정

v2의 8단계를 v3 관점에서 업데이트. 서버 측은 이미 구현 완료 → UI 고도화 + 통합 테스트에 집중.

| 단계 | 기간 | 산출물 | 상태 | 의존성 |
|------|------|--------|------|--------|
| **1단계: 서버 기반** | Day 1 | Express 서버, DB 스키마 13테이블, WebSocket, EventBus, 테스트 환경 | **✅ 완료** | — |
| **2단계: 핵심 서비스** | Day 2 | TicketService, ChainService, CostService, BudgetService, AgentService, HeartbeatService | **✅ 완료** | 1단계 |
| **3단계: 브릿지 + 폴링** | Day 3 | HookBridgeService, AgentPoller, CostCollector, RuntimeWatcher | **✅ 완료** | 2단계 |
| **4단계: v3 서비스** | Day 3 | RoutinesService, KnowledgeService, NotificationService | **✅ 완료** | 1단계 |
| **5단계: TDD** | Day 4 | 68건 테스트 (서비스 7개 + 통합 3개 + 스키마 1개) | **✅ 완료** | 2~4단계 |
| **6단계: UI 고도화** | Day 5~6 | Paperclip 컴포넌트 포크 — 8페이지 + 30+ 컴포넌트 한국어화 | 🔲 진행 예정 | 1~5단계 |
| **7단계: Hook 전환** | Day 6 | settings.local.json 전환 (16개 대체 + 7개 수정) | 🔲 진행 예정 | 6단계 |
| **8단계: 통합 QA** | Day 7 | E2E 테스트, Gap 분석, 최종 검증 | 🔲 진행 예정 | 전체 |

### 6단계 세부 (UI 고도화 — Paperclip 포크)

| 하위 단계 | 내용 | Paperclip 원본 | 예상 |
|----------|------|---------------|------|
| 6-1 | Layout + Sidebar + 네비게이션 | Layout.tsx, Sidebar.tsx | 0.5일 |
| 6-2 | Dashboard 페이지 고도화 | Dashboard.tsx, MetricCard, ActiveAgentsPanel, ActivityCharts | 0.5일 |
| 6-3 | Tickets 페이지 고도화 | Issues.tsx, IssueRow, IssueChecklist, NewIssueDialog | 0.5일 |
| 6-4 | Costs 페이지 고도화 | Costs.tsx (49KB), Budget*, Spend*, Quota*, Timeline*, ModelCost* | 1일 |
| 6-5 | Agents + OrgChart 고도화 | Agents.tsx, AgentDetail, OrgChart.tsx, org-chart-svg.ts | 0.5일 |
| 6-6 | Chains + Activity 고도화 | ChainEditor, ChainStepCard, ConditionEditor, ActivityRow | 0.5일 |
| 6-7 | Routines 페이지 (v3 신규) | Routines.tsx, ScheduleEditor, RoutineCard | 0.5일 |
| 6-8 | Context + 알림 + 트랜스크립트 | LiveUpdatesProvider, ToastContext, NotificationBell, TranscriptViewer | 0.5일 |

---

## 11. 검증 체크리스트

### 핵심 (v2의 10건 문제 해결 검증)

- [ ] **P1**: 체크리스트 전부 완료 → 자동 completed → webhook 전송
- [ ] **P2**: push만으로는 단계 완료 안 됨 (체크리스트 필요)
- [ ] **P3**: TicketService.updateChecklist → allDone → changeStatus('completed')
- [ ] **P4**: DB primaryFeature와 pdca-status.json 미러 일치
- [ ] **P5**: 서버 실행 중 workflow_chains 수정 → 즉시 반영
- [ ] **P6**: commit_hash + push_verified 없이 체인 단계 미완료
- [ ] **P7**: PM step 완료 → CTO ticket 자동 생성 + 배정
- [ ] **P8**: 예산 100% + hard_stop → 에이전트 자동 정지
- [ ] **P9**: 체인 배포 단계 → gcloud run deploy 실행 + 결과 기록
- [ ] **P10**: 15분 idle → 자동 paused + 대시보드 경고

### 시스템 검증

- [ ] `dashboard/` 앱이 `npm run dev`로 localhost:3200 + localhost:3201 구동
- [ ] SQLite DB 자동 생성 + 13테이블 스키마
- [ ] WebSocket 실시간 이벤트 전파 (28개 이벤트 타입)
- [ ] 기존 bash hook에서 `curl localhost:3201/api/hooks/task-completed` 성공
- [ ] pdca-status.json 미러 동기화 (수정 hook 하위 호환)
- [ ] 전체 UI 한국어 (영어 라벨 0개)
- [ ] 기존 bscamp Next.js 앱 영향 없음
- [ ] `npm run build` 성공 (dashboard/ 내부)
- [ ] vitest 68건 전체 Green
- [ ] 대시보드 서버 다운 시 기존 시스템 100% 동작

### v3 추가 검증

- [ ] Routines 페이지: 크론 작업 생성/편집/삭제/실행
- [ ] Knowledge 서비스: 에이전트별 학습 데이터 CRUD
- [ ] ScheduleEditor: 크론 표현식 편집 위젯 동작
- [ ] TranscriptViewer: 에이전트 실행 로그 표시
- [ ] Paperclip 포크 컴포넌트: companyId 완전 제거 확인

---

## 12. 롤백 전략

| 장애 시나리오 | 롤백 방법 |
|-------------|-----------|
| DB 손상 | `dashboard/.data/bkit.db` 삭제 → 스키마 자동 재생성 + pdca-status.json에서 기본 복구 |
| 대시보드 서버 다운 | 유지 hook (12개) 단독 동작. 수정 hook은 pdca-status.json fallback 읽기 |
| WebSocket 끊김 | React Query staleTime 30초 폴링 폴백 |
| Hook 브릿지 실패 | `\|\| true` 가드로 기존 hook 차단 안 됨 |
| Paperclip 포크 UI 깨짐 | 기본 구현 페이지로 폴백 (PlaceholderPage.tsx 존재) |
| Routines 실행 실패 | lastRunStatus='failed' + 알림. 서비스 자체 영향 없음 |
| 전체 롤백 | 1) settings.local.json 원복 2) `dashboard/` 삭제. 기존 시스템 무관 동작 |

**핵심 원칙**: 대시보드가 죽어도 기존 에이전트팀 운영은 100% 유지. 대시보드는 강화 레이어.

---

## 13. 참고 문서

- Paperclip GitHub: https://github.com/paperclipai/paperclip (MIT)
- Paperclip 레포 분석: 60 DB 테이블, 87 서비스, 40+ 페이지, 100+ 컴포넌트
- Plan 문서: `docs/01-plan/features/paperclip-dashboard-adoption.plan.md`
- v2 설계서: `docs/02-design/features/paperclip-bkit-integration-v2.design.md`
- v1 설계서: `docs/02-design/features/paperclip-bkit-integration.design.md`
- 기존 hook 체인: `.bkit/hooks/pdca-chain-handoff.sh` (v5, 357줄)
- 현재 PDCA 상태: `.bkit/state/pdca-status.json` (v3.0)
- 현재 구현 코드: `dashboard/` (서버 16서비스 + UI 8페이지)
- Postmortem 인덱스: `docs/postmortem/index.json` (6건)
- ADR: `docs/adr/ADR-001-account-ownership.md`, `ADR-002-service-context.md`
