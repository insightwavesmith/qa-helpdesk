# Paperclip × bkit 통합 설계서 v2

> 작성일: 2026-03-30 | PDCA Level: L2 | 상태: Design
> Plan: `docs/01-plan/features/paperclip-dashboard-adoption.plan.md`
> 이전 버전: `docs/02-design/features/paperclip-bkit-integration.design.md` (v1)

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Paperclip × bkit Integration v2 (Paperclip 이식 통합 v2) |
| 작성일 | 2026-03-30 |
| 예상 기간 | 7~10일 |

| 관점 | 내용 |
|------|------|
| Problem | 파일 기반 hook 체인의 구조적 한계 — completed 누락, 체인 수동 넘김, 상태 불일치, idle 미조치 등 10건 반복 장애 |
| Solution | Paperclip(MIT) DB+이벤트 시스템을 한 번에 이식. 파일 기반 상태 관리를 SQLite+이벤트 소싱으로 전환. bash 검증 hook만 유지 |
| Function UX Effect | 실시간 대시보드, 자동 체인 핸드오프, 예산 통제, UI 워크플로 편집, 자동 배포 |
| Core Value | 10건 반복 장애의 구조적 해결 — "사람이 기억해서 실행"에서 "시스템이 강제"로 전환 |

### v1 → v2 주요 변경

| 항목 | v1 | v2 |
|------|----|----|
| 마이그레이션 | 3단계 점진적 전환 | **단일 전환** (DB가 Day 1부터 정본) |
| 문제 회고 | 없음 | **10건 장애 회고 + 해결 매핑** |
| 파일 매핑 | 모듈 레벨 | **Paperclip 소스 함수 레벨** |
| UI 목업 | 체인 편집기만 | **전체 7개 화면 와이어프레임** |
| TDD | 없음 | **서비스별 테스트 케이스 56건** |
| Hook 분류 | 전환 계획만 | **유지 12 / 대체 16 / 수정 7 / 삭제 14** |
| 추가 기능 | 6개 모듈 | **9개 모듈** (승인, 알림, 활동 로그 추가) |

---

## 0. 장애 회고 → 설계 매핑 (10건)

> 지금까지 겪은 문제를 구조적으로 해결하는 것이 이 프로젝트의 핵심 가치.

### P1. 리더가 task completed 안 함 → webhook 안 옴

**현상**: 리더가 작업 끝나고 TaskUpdate(completed) 호출을 잊음. TaskCompleted hook 체인이 트리거되지 않아 MOZZI에 보고가 안 감.

**근본 원인**: "사람(AI)이 기억해서 실행"에 의존. 잊으면 끝.

**v2 해결**: 체크리스트 기반 자동 완료
```
tickets 테이블의 checklist JSON 배열
  ├─ 모든 항목 done=true 감지 (TicketService.updateChecklist)
  ├─→ 자동으로 status='completed' + ticket.completed 이벤트
  ├─→ ChainService.evaluateCompletion() 자동 호출
  └─→ MOZZI webhook 자동 전송

추가 안전망: heartbeat에서 "커밋 있는데 completed 아닌 ticket" 감지
  └─→ 대시보드에 경고 표시 + Smith님 Slack 알림
```

**검증**: `TC-P1-01` ~ `TC-P1-03` (섹션 12 참조)

---

### P2. push ≠ completed — 다른 개념인데 혼동

**현상**: git push 했다고 작업이 끝난 게 아님. 리더가 push만 하고 completed 안 함.

**v2 해결**: 독립 필드 분리 + 체인 완료 조건에 둘 다 포함
```sql
tickets 테이블:
  commit_hash   TEXT     -- push 시 기록 (git hook에서)
  status        TEXT     -- 'completed'는 별도 전환
  completed_at  TEXT     -- completed 시점

workflow_steps.completion_condition:
  {"type":"all","conditions":[
    {"type":"commit_exists"},      -- push 했는가
    {"type":"checklist_all_done"}  -- 체크리스트 전부 완료했는가
  ]}
```
push만으로는 단계 완료 안 됨. 체크리스트까지 끝나야 completed.

---

### P3. 체크리스트 전부 완료 → 자동 completed 안 됨

**현상**: 체크리스트 항목 전부 체크해도 task가 자동으로 completed 되지 않음.

**v2 해결**: TicketService에 자동 전환 로직 내장
```typescript
// TicketService.updateChecklist()
async updateChecklist(id: string, checklist: ChecklistItem[]): Promise<void> {
  await db.update(tickets).set({ checklist: JSON.stringify(checklist) }).where(eq(tickets.id, id));

  const allDone = checklist.every(item => item.done);
  if (allDone) {
    // 자동 completed 전환
    await this.changeStatus(id, 'completed');
    // → ticket.completed 이벤트 발생
    // → ChainService.evaluateCompletion() 트리거
    // → 체인 다음 단계 자동 시작
  }
}
```
**핵심**: 이 로직은 DB 트리거가 아니라 서비스 레이어에 있으므로 디버깅 가능.

---

### P4. pdca-status.json primaryFeature 불일치

**현상**: pdca-status.json의 primaryFeature가 실제 작업 중인 feature와 다름 → chain-handoff가 엉뚱한 feature 참조.

**근본 원인**: 파일 기반 상태는 누가 언제 갱신하는지 보장 불가. 여러 hook이 각자 수정.

**v2 해결**: DB가 정본. 파일 수동 편집 불가
```sql
-- 현재 작업 중인 feature 조회 (단일 쿼리)
SELECT id, display_name, phase FROM pdca_features
WHERE phase IN ('implementing', 'checking', 'acting')
ORDER BY updated_at DESC LIMIT 1;
```
- pdca-status.json은 DB에서 **일방향 미러** (DB→파일, 역방향 없음)
- chain-handoff는 DB를 직접 쿼리 — 파일 불일치 문제 원천 차단
- 미러 실패해도 DB가 정본이므로 시스템 영향 없음

---

### P5. settings.local.json 세션 로딩 → 도중 hook 추가 적용 안 됨

**현상**: CC가 세션 시작 시 settings.local.json을 로딩. 세션 도중 hook 추가하면 적용 안 됨.

**v2 해결**: 이벤트 기반 로직은 settings.json 무관
```
기존: CC hook (settings.local.json) → bash 스크립트 실행
     └─ 세션 시작 시 로딩, 변경 불가

v2:  Express 서버 (상시 실행) → 이벤트 리스너
     └─ 서버 재시작 없이 설정 변경 즉시 반영
     └─ workflow_chains 테이블 수정 → 체인 로직 즉시 적용
     └─ budget_policies 테이블 수정 → 예산 정책 즉시 적용
```
- **유지되는 PreToolUse hook** (destructive-detector, validate-delegate 등)은 여전히 settings.local.json 의존
- 하지만 이들은 정적 검증이라 변경 필요 없음

---

### P6. 리더가 문서만 작성하고 커밋+push 안 함

**v2 해결**: 체인 완료 조건에 커밋 검증 포함
```json
// workflow_steps.completion_condition
{
  "type": "all",
  "conditions": [
    {"type": "checklist_all_done"},
    {"type": "commit_exists"},
    {"type": "push_verified"}
  ]
}
```
```typescript
// ChainService.evaluateCompletion()
async evaluateCondition(condition: Condition, context: EvalContext): Promise<boolean> {
  switch (condition.type) {
    case 'commit_exists':
      return !!context.ticket.commit_hash;
    case 'push_verified':
      // git log --remotes 에서 commit_hash 존재 확인
      const result = execSync(`git log --remotes --oneline | grep ${context.ticket.commit_hash}`);
      return result.length > 0;
    case 'checklist_all_done':
      const checklist = JSON.parse(context.ticket.checklist);
      return checklist.every((item: any) => item.done);
    case 'all':
      return Promise.all(condition.conditions.map(c => this.evaluateCondition(c, context)))
        .then(results => results.every(Boolean));
  }
}
```
커밋+push 없이는 체인 단계가 완료되지 않음 → 다음 팀에 넘어가지 않음 → webhook도 안 감.

---

### P7. PM→CTO 체인이 자동이 아님 — COO가 수동으로 넘김

**현상**: PM 팀 작업 끝나도 CTO 팀에 자동으로 안 넘어감. COO(모찌)가 수동으로 전달.

**v2 해결**: ChainService 자동 트리거
```
workflow_chains: "기본 PDCA 체인"
  step 1: PM (plan+design) → auto_trigger_next=1
  step 2: CTO (do+check)   → auto_trigger_next=1
  step 3: 배포              → auto_trigger_next=0 (수동)

PM step 완료 시:
  ChainService.evaluateCompletion(step1)
  → true
  → ChainService.triggerNextStep(chain_id, 1)
    → CTO 팀용 ticket 자동 생성 + 배정
    → 'chain.auto_triggered' 이벤트
    → WebSocket으로 대시보드 실시간 반영
    → MOZZI에 "CTO 단계 시작" webhook 전송
```
**COO 역할 변경**: 수동 전달자 → 모니터링 + 예외 처리 (체인이 막혔을 때만 개입)

---

### P8. 토큰 관리 — 에이전트팀이 같은 토큰 쓰면 rate limit

**현상**: 여러 에이전트가 동시에 Anthropic API 호출 → rate limit.

**v2 해결**: CostService + 예산 정책으로 동시성 제어
```sql
-- 에이전트별 예산 정책
INSERT INTO budget_policies (scope_type, scope_id, amount_cents, warn_percent, hard_stop, window_kind)
VALUES
  ('global', NULL, 50000, 80, 1, 'daily'),      -- 전체 일일 $500
  ('agent', 'cto-leader', 15000, 80, 1, 'daily'),-- CTO $150/일
  ('agent', 'frontend-dev', 10000, 80, 1, 'daily'),
  ('team', 'cto', 30000, 80, 1, 'daily');        -- CTO팀 $300/일
```
```
CostService.evaluateBudget() 흐름:
  비용 이벤트 발생
  → 현재 윈도우 지출 합계
  → warn_percent 초과? → budget.warn 이벤트 + 대시보드 경고
  → hard_stop 초과? → agent.status='paused' + 대시보드 알림 + Slack
```
**별도 구현 필요**: Anthropic API rate limit 자체는 예산과 별개. API 키 분리(에이전트별 키) 또는 요청 큐잉은 Paperclip에 없으므로 자체 구현.
```typescript
// 별도 구현: dashboard/server/services/rate-limiter.ts
// 에이전트별 요청 간격 최소 100ms 보장 (큐잉)
```

---

### P9. 배포가 수동 — deploy-trigger.sh가 출력만

**현상**: deploy-trigger.sh v3에서 gcloud 직접 실행하게 변경했지만, 체인과 연결 안 됨.

**v2 해결**: 체인 마지막 단계에 배포 액션 통합
```
workflow_steps step_order=4 (배포):
  completion_condition: {"type":"build_success"}

ChainService.triggerStep(step4):
  1) deploy-trigger.sh 실행 (bash 유지 — gcloud 명령)
  2) 결과를 events 테이블에 기록
  3) 성공: chain.step_completed + system.deployed
  4) 실패: system.deploy_failed + 대시보드 알림 + Slack
  5) 배포 후 검증: Cloud Run 로그 확인 (RET-004)
```
**핵심**: deploy-trigger.sh는 **ChainService가 호출**. 리더가 기억해서 실행할 필요 없음.

---

### P10. heartbeat idle 감지는 되는데 자동 조치 못함

**현상**: heartbeat-watchdog.sh가 idle 감지하지만 "경고만" 출력.

**v2 해결**: AgentService에 자동 조치 로직
```typescript
// AgentService.checkIdleAgents() — 1분 간격 실행
async checkIdleAgents(): Promise<void> {
  const idleThreshold = 5 * 60 * 1000; // 5분
  const agents = await db.select().from(agents)
    .where(eq(agents.status, 'running'));

  for (const agent of agents) {
    const lastHeartbeat = new Date(agent.last_heartbeat_at).getTime();
    const idleMs = Date.now() - lastHeartbeat;

    if (idleMs > idleThreshold) {
      // 1단계: 경고 (대시보드 + Slack)
      await this.emit('agent.idle_warning', { agent_id: agent.id, idle_ms: idleMs });

      if (idleMs > idleThreshold * 3) { // 15분
        // 2단계: 자동 정지
        await db.update(agents).set({
          status: 'paused',
          pause_reason: `idle ${Math.round(idleMs/60000)}분 — 자동 정지`,
        }).where(eq(agents.id, agent.id));

        await this.emit('agent.auto_paused', { agent_id: agent.id });
        // 대시보드에 "재시작" 버튼 표시
      }
    }
  }
}
```

---

### 종합 해결 매핑

| # | 문제 | 해결 방식 | Paperclip 차용 | 자체 구현 |
|---|------|----------|---------------|-----------|
| P1 | completed 누락 | 체크리스트 자동 완료 | issues.ts 체크리스트 로직 | heartbeat 경고 |
| P2 | push≠completed 혼동 | 독립 필드 + 복합 조건 | — | completion_condition |
| P3 | 자동 completed 안 됨 | TicketService 내장 | issues.ts | — |
| P4 | primaryFeature 불일치 | DB 정본 + 일방향 미러 | — | syncToPdcaStatusJson |
| P5 | 세션 중 hook 변경 불가 | Express 상시 서버 | 서버 구조 | — |
| P6 | 커밋+push 누락 | 체인 완료 조건 | — | push_verified 조건 |
| P7 | 체인 수동 넘김 | ChainService 자동 | approvals 기반 | 체인 엔진 |
| P8 | rate limit | 예산+동시성 제어 | costs.ts + budgets.ts | rate-limiter.ts |
| P9 | 배포 수동 | 체인 배포 단계 | — | ChainService→deploy |
| P10 | idle 미조치 | AgentService 자동 | heartbeat.ts | auto_paused |

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
│  │ 49개 bash     │────→│ peer-map.json     │  ← 런타임     │
│  │ 스크립트      │     │ team-context-*.json│               │
│  └───────┬───────┘     │ agent-state.json  │               │
│          │              └──────────────────┘               │
│  ┌───────┴───────┐     ┌───────────────────┐               │
│  │ chain-handoff │────→│ MOZZI (OpenClaw)   │               │
│  │ webhook/broker│     │ 127.0.0.1:18789   │               │
│  └───────────────┘     └───────────────────┘               │
│                                                             │
│  한계:                                                       │
│  • completed 누락 → webhook 안 감 (P1)                      │
│  • 파일 상태 불일치 (P4)                                     │
│  • 체인 수동 넘김 (P7)                                       │
│  • idle 미조치 (P10)                                        │
│  • 세션 중 설정 변경 불가 (P5)                                │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 목표 시스템 (TO-BE) — 단일 전환

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Paperclip × bkit 통합 시스템 v2 — DB 정본, 단일 전환                     │
│                                                                          │
│  ┌───────────────────────────────────────────────────────────┐          │
│  │  대시보드 UI (React 19 + Vite) — localhost:3200            │          │
│  │                                                           │          │
│  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ │          │
│  │  │메인   │ │태스크 │ │비용   │ │조직도 │ │체인   │ │활동   │ │          │
│  │  │대시보드│ │목록   │ │추적   │ │      │ │편집   │ │로그   │ │          │
│  │  └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ └──┬───┘ │          │
│  │     └────────┴────────┴────────┴────────┴────────┘      │          │
│  │                    │                                      │          │
│  │         WebSocket (실시간 이벤트 스트림)                    │          │
│  └────────────────────┼──────────────────────────────────────┘          │
│                       │                                                  │
│  ┌────────────────────┼──────────────────────────────────────┐          │
│  │  통합 서버 (Express) — localhost:3201                       │          │
│  │                    │                                       │          │
│  │  ┌─────────────────┴────────────────────┐                 │          │
│  │  │          이벤트 버스 (EventEmitter)     │                 │          │
│  │  └──┬──────┬──────┬──────┬──────┬──────┘                 │          │
│  │     │      │      │      │      │                         │          │
│  │  ┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──┴──┐┌──────┐            │          │
│  │  │Ticket││Cost ││Agent││Chain││Hook ││Notif │            │          │
│  │  │서비스 ││서비스 ││서비스 ││서비스 ││브릿지 ││서비스 │            │          │
│  │  └──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘└──┬──┘            │          │
│  │     └──────┴──────┴──────┴──────┴──────┘                 │          │
│  │                    │                                       │          │
│  │              ┌─────┴─────┐    ┌─────────────────┐         │          │
│  │              │ SQLite DB │    │ pdca-status.json │         │          │
│  │              │ (정본)     │───→│ (읽기전용 미러)   │         │          │
│  │              └───────────┘    └─────────────────┘         │          │
│  └─────────────────────┬─────────────────────────────────────┘          │
│                        │                                                 │
│  ┌─────────────────────┼──────────────────────────┐                     │
│  │  bash 검증 hook (유지 — 12개)                    │                     │
│  │  • destructive-detector (위험 작업 차단)          │                     │
│  │  • validate-delegate (리더 코드 수정 차단)        │  ← PreToolUse에서   │
│  │  • validate-deploy-authority (배포 권한)          │    DB 쿼리로 검증    │
│  │  • enforce-teamcreate (단독 spawn 차단)          │                     │
│  │  • 등 OS/tmux 수준 검증                          │                     │
│  └─────────────────────┼──────────────────────────┘                     │
│                        │                                                 │
│  ┌─────────────────────┼───────────────────────────┐                    │
│  │  에이전트 런타임 (변경 없음)                       │                    │
│  │  ┌────────┐  ┌────────────┐  ┌────────┐        │                    │
│  │  │ tmux   │  │ OpenClaw   │  │ MOZZI  │        │                    │
│  │  │ panes  │  │ Gateway    │  │ webhook│        │                    │
│  │  └────────┘  └────────────┘  └────────┘        │                    │
│  └────────────────────────────────────────────────┘                    │
└──────────────────────────────────────────────────────────────────────────┘
```

### 1.3 단일 전환 전략 (v1의 3단계 → 1단계)

**v1 접근 (폐기)**: 읽기전용 미러 → 이중쓰기 → DB 주도 (3단계)
- 문제: 양쪽 시스템 동시 관리 = 더 복잡, 어느 쪽이 정본인지 모호

**v2 접근**: DB가 Day 1부터 정본. 한 번에 전환.
```
Day 0: 기존 시스템 (파일 기반)
       │
       ▼ 전환 시점 (한 번)
       │
Day 1: DB 시스템 (정본)
       │
       ├─ 모든 상태 → SQLite DB
       ├─ 모든 이벤트 → events 테이블
       ├─ 모든 체인 → ChainService
       │
       ├─ pdca-status.json ← DB에서 일방향 미러 (읽기전용)
       │   └─ 유지되는 bash hook이 읽을 수 있도록
       │
       └─ 유지되는 bash hook (12개)
           └─ OS/tmux 수준 검증만 담당
           └─ 상태 조회 시 curl localhost:3201/api/... 사용
```

**안전망:**
1. pdca-status.json 미러 — 유지 hook이 읽을 수 있도록
2. 대시보드 서버 다운 시 — bash hook 단독 동작 가능 (graceful degradation)
3. DB 손상 시 — `bkit.db` 삭제 → 스키마 자동 재생성 + pdca-status.json에서 복구

### 1.4 레이어 분리 원칙

| 레이어 | 역할 | Paperclip 차용 | 자체 구현 | 기존 유지 |
|--------|------|---------------|-----------|-----------|
| **L1: UI** | 대시보드 렌더링 | 컴포넌트 20개+ | 한국어화, 체인 편집기, 알림 센터 | — |
| **L2: API** | REST + WebSocket | 라우트 8개 | bkit 어댑터 | — |
| **L3: 서비스** | 비즈니스 로직 | 서비스 6개 | Hook 브릿지, 체인 엔진, 알림, 배포 | — |
| **L4: 데이터** | 저장소 | Drizzle 스키마 (경량화) | SQLite 전환 | pdca-status.json (미러) |
| **L5: 런타임** | 에이전트 실행 | — | — | tmux + OpenClaw 전체 |
| **L6: 검증** | PreToolUse guard | — | — | bash hook 12개 |

---

## 2. DB 스키마 설계

### 2.1 DB 선택: SQLite (better-sqlite3)

| 기준 | PostgreSQL | SQLite | 결정 |
|------|-----------|--------|------|
| 서버 필요 | 별도 프로세스 | 불필요 (임베디드) | **SQLite** |
| 파일 | 여러 파일 | 단일 `bkit.db` | **SQLite** |
| 동시성 | MVCC | WAL 모드 | WAL로 충분 |
| Drizzle 지원 | 완전 | 완전 | 동등 |
| 백업 | pg_dump | 파일 복사 | **SQLite** |
| Paperclip 이식 | 원본 그대로 | 쿼리 변환 필요 | PostgreSQL 유리하지만 단순 변환 |

### 2.2 테이블 설계 (11개 — v1의 10개 + notifications)

```sql
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T1: tickets — PDCA 태스크 (기존 TASK-*.md + BOARD.json 대체)
-- Paperclip 원본: server/src/services/issues.ts → issues 테이블
-- 경량화: companyId/memberId/sprintId/epicId 제거, PDCA 필드 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE tickets (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  feature       TEXT NOT NULL,                     -- PDCA 피처명
  title         TEXT NOT NULL,                     -- 태스크 제목
  description   TEXT,                              -- 상세 설명 (마크다운)
  status        TEXT NOT NULL DEFAULT 'backlog'
                CHECK(status IN ('backlog','todo','in_progress','in_review','completed','cancelled')),
  priority      TEXT NOT NULL DEFAULT 'medium'
                CHECK(priority IN ('critical','high','medium','low')),

  -- 배정
  assignee_agent TEXT,                             -- 'frontend-dev', 'backend-dev'
  assignee_team  TEXT,                             -- 'cto', 'pm', 'marketing'

  -- PDCA 연결
  pdca_phase    TEXT CHECK(pdca_phase IN ('plan','design','do','check','act','deploy')),
  process_level TEXT CHECK(process_level IN ('L0','L1','L2','L3')),
  match_rate    REAL,                              -- 0~100 (Gap 분석 결과)

  -- 체인 연결
  chain_id      TEXT REFERENCES workflow_chains(id),
  chain_step_id TEXT,

  -- 실행 추적
  execution_run_id TEXT REFERENCES heartbeat_runs(id),
  commit_hash   TEXT,                              -- git commit hash
  push_verified INTEGER DEFAULT 0,                 -- push 확인 여부 (P2, P6)
  changed_files INTEGER DEFAULT 0,

  -- 체크리스트 (JSON 배열) — P1, P3 핵심
  checklist     TEXT DEFAULT '[]',
  -- [{"id":"c1","text":"tsc 통과","done":false}, ...]

  -- 타임스탬프
  started_at    TEXT,
  completed_at  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tickets_feature ON tickets(feature);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_assignee ON tickets(assignee_team, status);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T2: agents — 에이전트 레지스트리
-- Paperclip 원본: server/src/services/agents.ts
-- 경량화: adapterConfig/providerData/companyId 제거, tmux 필드 추가
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE agents (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  name          TEXT NOT NULL UNIQUE,              -- 'cto-leader', 'frontend-dev'
  display_name  TEXT,                              -- 'CTO 리더', '프론트엔드 개발자'
  role          TEXT NOT NULL DEFAULT 'developer'
                CHECK(role IN ('leader','developer','qa','pm','coo')),
  team          TEXT,                              -- 'cto', 'pm', 'marketing'
  status        TEXT NOT NULL DEFAULT 'idle'
                CHECK(status IN ('idle','running','paused','error','terminated')),
  pause_reason  TEXT,                              -- P10: idle 자동 정지 사유

  -- 계층 구조 (Org Chart)
  reports_to    TEXT REFERENCES agents(id),

  -- 런타임 연결 (tmux 유지)
  tmux_session  TEXT,                              -- tmux 세션명
  tmux_pane     TEXT,                              -- tmux pane ID
  peer_id       TEXT,                              -- Claude Code peer ID
  pid           INTEGER,                           -- OS 프로세스 ID

  -- 비용 추적
  budget_monthly_cents INTEGER DEFAULT 0,
  spent_monthly_cents  INTEGER DEFAULT 0,

  -- heartbeat (P10)
  last_heartbeat_at TEXT,
  idle_warning_sent INTEGER DEFAULT 0,             -- 경고 전송 여부

  -- 메타
  icon          TEXT DEFAULT '🤖',
  capabilities  TEXT,                              -- JSON 역할 설명
  model         TEXT DEFAULT 'claude-opus-4-6',    -- P8: 모델 추적
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T3: heartbeat_runs — 에이전트 실행 기록
-- Paperclip 원본: server/src/services/heartbeat.ts (135KB → 3KB 핵심만)
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
-- T4: cost_events — 비용 이벤트 (불변, 추가 전용)
-- Paperclip 원본: server/src/services/costs.ts (16.6KB)
-- 거의 그대로 차용 + companyId 제거
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE cost_events (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  agent_id      TEXT NOT NULL REFERENCES agents(id),
  ticket_id     TEXT REFERENCES tickets(id),
  run_id        TEXT REFERENCES heartbeat_runs(id),

  provider      TEXT NOT NULL DEFAULT 'anthropic',
  model         TEXT NOT NULL,                      -- 'claude-opus-4-6', 'claude-sonnet-4-6'

  input_tokens  INTEGER NOT NULL DEFAULT 0,
  cached_input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents    INTEGER NOT NULL,                   -- 센트 단위

  occurred_at   TEXT NOT NULL DEFAULT (datetime('now')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_cost_agent ON cost_events(agent_id, occurred_at);
CREATE INDEX idx_cost_model ON cost_events(model, occurred_at);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T5: budget_policies — 예산 정책 (P8 핵심)
-- Paperclip 원본: server/src/services/budgets.ts (31.7KB)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE budget_policies (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  scope_type    TEXT NOT NULL DEFAULT 'global'
                CHECK(scope_type IN ('global','agent','team')),
  scope_id      TEXT,
  amount_cents  INTEGER NOT NULL,
  warn_percent  INTEGER NOT NULL DEFAULT 80,
  hard_stop     INTEGER NOT NULL DEFAULT 1,
  window_kind   TEXT NOT NULL DEFAULT 'monthly'
                CHECK(window_kind IN ('monthly','weekly','daily')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T6: budget_incidents — 예산 초과 이력
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE budget_incidents (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(8)))),
  policy_id     TEXT NOT NULL REFERENCES budget_policies(id),
  agent_id      TEXT REFERENCES agents(id),
  kind          TEXT NOT NULL CHECK(kind IN ('warn','hard_stop')),
  amount_at_trigger INTEGER NOT NULL,
  threshold_amount  INTEGER NOT NULL,
  resolved      INTEGER NOT NULL DEFAULT 0,
  resolved_at   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T7: workflow_chains — 워크플로 체인 정의 (P7 핵심)
-- Paperclip 원본: approvals + routines 개념 기반
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
  step_order    INTEGER NOT NULL,

  team_role     TEXT NOT NULL,                      -- 'pm', 'cto', 'deploy'
  phase         TEXT NOT NULL,                      -- 'plan', 'design', 'do', 'check', 'deploy'
  label         TEXT NOT NULL,                      -- '설계 작성', '구현', '배포'

  -- 완료 조건 (JSON) — P1, P2, P3, P6 핵심
  completion_condition TEXT NOT NULL DEFAULT '{"type":"manual"}',
  -- {"type":"all","conditions":[
  --   {"type":"checklist_all_done"},
  --   {"type":"commit_exists"},
  --   {"type":"push_verified"}
  -- ]}
  -- {"type":"match_rate","min":90}
  -- {"type":"build_success"}

  auto_trigger_next INTEGER NOT NULL DEFAULT 1,     -- P7: 자동 체인
  assignee      TEXT,

  -- 배포 설정 (P9)
  deploy_config TEXT,                               -- {"command":"gcloud run deploy ...", "verify":true}

  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_steps_chain ON workflow_steps(chain_id, step_order);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T9: events — 이벤트 로그 (불변, 시간순, 추가 전용)
-- Paperclip 원본: activity_log 테이블 기반
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type    TEXT NOT NULL,
  actor         TEXT NOT NULL,                      -- 'cto-leader', 'hook:task-completed', 'system'
  target_type   TEXT,                               -- 'ticket', 'agent', 'chain', 'budget'
  target_id     TEXT,
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

  plan_done     INTEGER DEFAULT 0,
  plan_doc      TEXT,
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

  chain_id      TEXT REFERENCES workflow_chains(id),
  current_step  INTEGER,
  automation_level INTEGER DEFAULT 2,
  iteration_count  INTEGER DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
-- T11: notifications — 알림 (신규, v2 추가)
-- ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREATE TABLE notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  type          TEXT NOT NULL,                      -- 'info','warn','error','success'
  title         TEXT NOT NULL,                      -- '체인 자동 전환', '예산 경고'
  message       TEXT NOT NULL,
  source_event_id INTEGER REFERENCES events(id),
  read          INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_notif_unread ON notifications(read, created_at);
```

### 2.3 이벤트 타입 정의 (28개)

```typescript
type EventType =
  // Ticket 생명주기 (7개)
  | 'ticket.created'
  | 'ticket.assigned'
  | 'ticket.status_changed'
  | 'ticket.checklist_updated'
  | 'ticket.completed'           // P1, P3: 자동 완료
  | 'ticket.commit_recorded'     // P2, P6: 커밋 기록
  | 'ticket.push_verified'       // P6: push 확인

  // Agent 생명주기 (6개)
  | 'agent.registered'
  | 'agent.status_changed'
  | 'agent.terminated'
  | 'agent.heartbeat'
  | 'agent.idle_warning'         // P10: idle 경고
  | 'agent.auto_paused'          // P10: 자동 정지

  // 비용 (4개)
  | 'cost.recorded'              // P8: 비용 기록
  | 'budget.warn'                // P8: 소프트 한도
  | 'budget.hard_stop'           // P8: 하드 한도
  | 'budget.resolved'

  // PDCA (3개)
  | 'pdca.phase_changed'         // P4: DB가 정본
  | 'pdca.match_rate_recorded'
  | 'pdca.completed'

  // 체인 (5개)
  | 'chain.step_started'         // P7: 자동 체인
  | 'chain.step_completed'
  | 'chain.auto_triggered'       // P7: 자동 넘김
  | 'chain.handoff'
  | 'chain.deploy_triggered'     // P9: 자동 배포

  // 시스템 (3개)
  | 'system.webhook_sent'
  | 'system.deploy_result'       // P9: 배포 결과
  | 'system.error';
```

---

## 3. Paperclip 모듈 차용 상세 매핑

### 3.1 서비스 레이어 (Paperclip → bkit 파일 레벨 매핑)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Paperclip 원본                       우리 파일                      차용 범위 + 변환
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

server/src/services/issues.ts        dashboard/server/services/     차용 함수:
(65.4KB, ~2000줄)                    tickets.ts (~800줄)            - createIssue() → createTicket()
                                                                    - updateIssue() → updateTicket()
                                                                    - getIssue() → getTicket()
                                                                    - listIssues() → listTickets()
                                                                    - updateChecklist() 그대로
                                                                    제거: companyId 파라미터, memberId,
                                                                    sprint/epic 관련, 댓글 시스템
                                                                    추가: pdca_phase, match_rate,
                                                                    push_verified, 자동 completed(P1,P3)

server/src/services/costs.ts         dashboard/server/services/     차용 함수:
(16.6KB, ~500줄)                     costs.ts (~400줄)              - recordCostEvent() 그대로
                                                                    - getCostSummary() 그대로
                                                                    - getCostByAgent() 그대로
                                                                    - getCostByModel() 그대로
                                                                    - getWindowSpend() 그대로
                                                                    제거: companyId, 멀티테넌트 로직
                                                                    변환: PostgreSQL → SQLite 쿼리 구문

server/src/services/budgets.ts       dashboard/server/services/     차용 함수:
(31.7KB, ~900줄)                     budgets.ts (~600줄)            - createPolicy() 그대로
                                                                    - evaluateBudget() 핵심
                                                                    - handleBudgetIncident() 그대로
                                                                    제거: 결제 연동, 조직 범위
                                                                    추가: P8 rate-limit 연동

server/src/services/agents.ts        dashboard/server/services/     차용 함수:
(23.5KB, ~700줄)                     agents.ts (~500줄)             - registerAgent() → 기반
                                                                    - updateAgentStatus() → 기반
                                                                    - getAgentTree() → Org Chart용
                                                                    제거: adapterConfig, providerData
                                                                    추가: tmux 필드, P10 idle 감지,
                                                                    peer_id 연결, checkIdleAgents()

server/src/services/dashboard.ts     dashboard/server/services/     차용 함수:
(3.7KB, ~100줄)                      dashboard.ts (~150줄)          - getSummaryStats() 그대로
                                                                    추가: PDCA 진행률 집계, 비용 요약

server/src/services/heartbeat.ts     dashboard/server/services/     차용 함수 (극히 일부):
(135KB, ~4000줄)                     heartbeat.ts (~200줄)          - createRun() / finishRun()
                                                                    - 토큰 사용량 기록 로직만
                                                                    제거: 에이전트 실행 로직 전부
                                                                    (tmux가 실행 담당이므로)

server/src/realtime/                 dashboard/server/realtime/     차용:
  live-events-ws.ts (8.2KB)          ws.ts (~200줄)                 - WebSocket 서버 구조
                                                                    - 이벤트 브로드캐스트
                                                                    제거: companyId 스코핑
                                                                    (단일 조직이므로)

━━━━ 신규 서비스 (Paperclip에 없음) ━━━━

(없음)                               dashboard/server/services/     완전 신규:
                                     chains.ts (~400줄)             - 체인 CRUD
                                                                    - evaluateCompletion() (P1,P2,P3,P6)
                                                                    - triggerNextStep() (P7)
                                                                    - deploy 연동 (P9)

(없음)                               dashboard/server/services/     완전 신규:
                                     hook-bridge.ts (~300줄)        - 기존 bash hook → DB 이벤트
                                                                    - pdca-status.json 미러 (P4)
                                                                    - REST API 엔드포인트

(없음)                               dashboard/server/services/     완전 신규:
                                     notifications.ts (~150줄)      - 이벤트 → 알림 변환
                                                                    - 읽음/미읽음 관리
                                                                    - Slack 웹훅 전송

(없음)                               dashboard/server/services/     완전 신규 (P8):
                                     rate-limiter.ts (~100줄)       - 에이전트별 요청 큐잉
                                                                    - 100ms 최소 간격 보장

(없음)                               dashboard/server/watcher/      완전 신규:
                                     runtime-watcher.ts (~200줄)    - chokidar로 .bkit/runtime/ 감시
                                                                    - 파일 변경 → DB 동기화
```

### 3.2 추가 차용 기능 (v1 대비 신규)

| Paperclip 기능 | 원본 파일 | 차용 여부 | 근거 |
|---------------|-----------|----------|------|
| **Approvals** | server/src/services/approvals.ts | **차용** | L3 작업의 Smith님 승인 UI. 현재 수동 Slack |
| **Activity Log** | server/src/services/activity.ts | **차용** | 대시보드 활동 로그 페이지. events 테이블 뷰어 |
| **Notifications** | ui/src/components/NotificationBell.tsx | **차용 (UI)** | 실시간 알림 벨 + 드롭다운 |
| **Labels/Tags** | server/src/services/labels.ts | **불필요** | 우리는 feature + phase로 충분 |
| **Sprints** | server/src/services/sprints.ts | **불필요** | PDCA 사이클이 sprint 역할 |
| **Comments** | issues.ts 내 댓글 로직 | **불필요** | claude-peers로 소통 |
| **Routines** | server/src/services/routines.ts | **미래** | 반복 cron 작업. 현재 Cloud Scheduler 사용 |
| **Knowledge** | server/src/services/knowledge.ts | **미래** | 에이전트 학습 데이터. bkit memory로 충분 |
| **Auth** | server/src/middleware/auth.ts | **불필요** | 로컬 도구. 인증 불필요 |

### 3.3 UI 컴포넌트 매핑 (Paperclip → bkit 파일 레벨)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Paperclip 원본 파일                       우리 파일                    변환 내용
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

━━━━ 페이지 (7개) ━━━━

ui/src/pages/Dashboard.tsx             → src/pages/DashboardPage.tsx     한국어, MetricCard 4열
                                                                         (에이전트/태스크/비용/체인)

ui/src/pages/Issues.tsx                → src/pages/TicketsPage.tsx       issues→tickets, PDCA 필드,
                                                                         체크리스트 자동 완료 표시

ui/src/pages/Costs.tsx (49KB)          → src/pages/CostsPage.tsx        5탭 한국어화, 달러→원화 옵션
                                                                         모델별/에이전트별/시간별

ui/src/pages/OrgChart.tsx              → src/pages/OrgChartPage.tsx     우리 팀 구조 반영
                                                                         reports_to 트리 렌더링

ui/src/pages/Agents.tsx                → src/pages/AgentsPage.tsx       TeamCreate/Delete 연결
ui/src/pages/AgentDetail.tsx                                            tmux pane 정보, idle 표시

(없음)                                 → src/pages/ChainsPage.tsx       완전 신규 — 체인 편집기

(없음)                                 → src/pages/ActivityPage.tsx     events 테이블 뷰어 (필터/검색)

━━━━ 핵심 컴포넌트 (22개) ━━━━

ui/src/components/
  ActiveAgentsPanel.tsx (5.7KB)        → components/AgentStatusPanel.tsx 한국어 상태 라벨
  AgentRunCard.tsx                     → components/AgentRunCard.tsx     peer-map 연결
  MetricCard.tsx (1.5KB)               → components/MetricCard.tsx       숫자 포맷 ko-KR
  ActivityCharts.tsx (10KB)            → components/ActivityCharts.tsx   Recharts 유지
  ActivityRow.tsx (5.3KB)              → components/ActivityRow.tsx      이벤트 테이블 연결
  StatusIcon.tsx                       → components/StatusIcon.tsx       한국어 tooltip
  StatusBadge.tsx                      → components/StatusBadge.tsx      색상 유지
  Layout.tsx                           → components/Layout.tsx           Primary #F75D5D
  Sidebar.tsx                          → components/Sidebar.tsx          한국어 메뉴 7개
  SidebarAgents.tsx                    → components/SidebarAgents.tsx    agents 테이블 연결

  BudgetPolicyCard.tsx (9.2KB)         → components/BudgetPolicyCard.tsx scope 한국어화
  BudgetIncidentCard.tsx (4KB)         → components/BudgetIncidentCard.tsx 알림 한국어화
  BillerSpendCard.tsx (5.7KB)          → components/SpendCard.tsx       Anthropic 고정
  ProviderQuotaCard.tsx (17.6KB)       → components/QuotaCard.tsx       단순화
  QuotaBar.tsx (2KB)                   → components/QuotaBar.tsx        그대로 사용
  FinanceTimelineCard.tsx (3.2KB)      → components/TimelineCard.tsx    날짜 ko-KR
  AccountingModelCard.tsx (3.1KB)      → components/ModelCostCard.tsx   Opus/Sonnet 표시

  NotificationBell.tsx                 → components/NotificationBell.tsx 신규 차용 (v2)
  IssueChecklist.tsx                   → components/TicketChecklist.tsx  자동 완료 표시 추가

━━━━ 신규 컴포넌트 (6개) ━━━━

(없음)                                 → components/ChainEditor.tsx     D&D 워크플로 편집
(없음)                                 → components/ChainStepCard.tsx   개별 단계 카드
(없음)                                 → components/ConditionEditor.tsx JSON 완료조건 편집
(없음)                                 → components/TeamDialog.tsx      TeamCreate 래퍼
(없음)                                 → components/TicketAssignDialog.tsx D&D 배정
(없음)                                 → components/ApprovalBanner.tsx  L3 승인 요청 배너

━━━━ Context/Hook ━━━━

ui/src/context/
  LiveUpdatesProvider.tsx (26.6KB)     → context/LiveUpdatesProvider.tsx WebSocket localhost:3201
  ToastContext.tsx (4.3KB)             → context/ToastContext.tsx        한국어 메시지
  SidebarContext.tsx                   → context/SidebarContext.tsx      그대로 복사

ui/src/hooks/
  useDateRange.ts                      → hooks/useDateRange.ts          ko-KR 로케일
  useAgentOrder.ts                     → hooks/useAgentOrder.ts         그대로 복사

━━━━ API 클라이언트 ━━━━

ui/src/api/
  client.ts                            → api/client.ts                  baseURL: localhost:3201
  agents.ts (8KB)                      → api/agents.ts                  companyId 제거
  issues.ts                            → api/tickets.ts                 issues→tickets 리네임
  costs.ts                             → api/costs.ts                   companyId 제거
  budgets.ts                           → api/budgets.ts                 companyId 제거
  heartbeats.ts                        → api/heartbeats.ts              companyId 제거
  dashboard.ts                         → api/dashboard.ts               companyId 제거
  (없음)                               → api/chains.ts                  신규
  (없음)                               → api/notifications.ts           신규
```

---

## 4. UI 와이어프레임 (7개 화면)

### 4.1 메인 대시보드

```
┌──────────────────────────────────────────────────────────────────────────┐
│ ┌──────────┐                                                    🔔 3  │
│ │ bkit     │  메인 대시보드     태스크     비용     조직도     체인     활동  │
│ │ Dashboard│                                                          │
│ ├──────────┤  ┌─────────────────────────────────────────────────────┐ │
│ │          │  │  현재 피처: protractor-data-fix                      │ │
│ │ 대시보드  │  │  단계: Do ▶   Match Rate: —   자동화: L2            │ │
│ │ 태스크    │  └─────────────────────────────────────────────────────┘ │
│ │ 비용     │                                                          │
│ │ 조직도   │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────┐│
│ │ 체인     │  │ 🤖 에이전트 │ │ 📋 태스크   │ │ 💰 비용     │ │ 🔗 체인 ││
│ │ 활동     │  │            │ │            │ │            │ │        ││
│ │          │  │   3/5 활성  │ │  2 진행중   │ │ $12.50     │ │ 2/4    ││
│ │ ──────── │  │            │ │  1 대기    │ │  오늘       │ │ 단계   ││
│ │ 에이전트  │  └────────────┘ └────────────┘ └────────────┘ └────────┘│
│ │ • CTO ● │                                                          │
│ │ • FE  ● │  ┌──────────────────────────────────────────────────────┐│
│ │ • BE  ○ │  │  에이전트 상태                                        ││
│ │ • QA  ○ │  │                                                      ││
│ │ • PM  ○ │  │  CTO 리더    ● 실행중   Opus 4.6    $4.20   3분 전   ││
│ │          │  │  FE 개발자   ● 실행중   Opus 4.6    $3.80   1분 전   ││
│ │          │  │  BE 개발자   ○ 대기     —           —       —       ││
│ │          │  │  QA 엔지니어  ○ 대기     —           —       —       ││
│ │          │  └──────────────────────────────────────────────────────┘│
│ │          │                                                          │
│ │          │  ┌──────────────────────┐ ┌────────────────────────────┐│
│ │          │  │  활동 차트 (24시간)    │ │  최근 이벤트                ││
│ │          │  │                      │ │                            ││
│ │          │  │  ████ ███ █████████  │ │  10:34 ticket.completed    ││
│ │          │  │  ── 태스크  ── 비용   │ │  10:33 chain.auto_trigger  ││
│ │          │  │                      │ │  10:30 cost.recorded       ││
│ │          │  │  (Recharts 영역 차트) │ │  10:28 agent.heartbeat     ││
│ │          │  └──────────────────────┘ └────────────────────────────┘│
│ └──────────┘                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.2 태스크 목록

```
┌──────────────────────────────────────────────────────────────────────────┐
│  태스크 목록                                           [+ 태스크 생성]   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  필터: [전체 ▼] [진행중 ▼] [CTO팀 ▼]     검색: [________________]      │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ● 진행중  총가치각도기 purchase 중복집계 수정          CTO팀        │ │
│  │          feature: protractor-data-fix  |  단계: Do  |  L2         │ │
│  │          담당: backend-dev  |  커밋: 8027d44 ✓  |  push: ✓       │ │
│  │                                                                    │ │
│  │  체크리스트:                                                        │ │
│  │  ☑ getActionValue 로직 분석 완료                                   │ │
│  │  ☑ omni_purchase 우선 로직 구현                                    │ │
│  │  ☐ tsc --noEmit 통과                                              │ │
│  │  ☐ npm run build 성공                                             │ │
│  │  ☐ Meta Ads Manager 대조 검증                                     │ │
│  │                                                        [2/5 완료]  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ✓ 완료   Paperclip × bkit Design v2 작성               PM팀       │ │
│  │          feature: paperclip-bkit-integration  |  단계: Design     │ │
│  │          완료: 2026-03-30 10:34  |  커밋: b2d2710 ✓              │ │
│  │                                                        [5/5 완료]  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ○ 대기   Mixpanel 연동 설정 진단                       PM팀       │ │
│  │          feature: protractor-data-fix  |  단계: Plan  |  L1      │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.3 비용 추적

```
┌──────────────────────────────────────────────────────────────────────────┐
│  비용 추적                                                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  기간: [오늘 ▼]  [2026-03-30] ~ [2026-03-30]                            │
│                                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 총 비용     │ │ 오늘       │ │ 이번 주     │ │ 예산 사용    │           │
│  │ $47.80     │ │ $12.50    │ │ $47.80    │ │ 32%        │           │
│  │ ₩65,500   │ │ ₩17,100  │ │ ₩65,500  │ │ $150 중    │           │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘           │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  탭: [모델별] [에이전트별] [시간별] [예산] [이력]                    │   │
│  ├──────────────────────────────────────────────────────────────────┤   │
│  │                                                                  │   │
│  │  모델별 비용                                                      │   │
│  │  ┌──────────────────┬──────────┬──────────┬──────────┐          │   │
│  │  │ 모델              │ 입력 토큰  │ 출력 토큰  │ 비용      │          │   │
│  │  ├──────────────────┼──────────┼──────────┼──────────┤          │   │
│  │  │ claude-opus-4-6  │ 1.2M    │ 180K    │ $38.40   │          │   │
│  │  │ claude-sonnet-4-6│ 850K    │ 120K    │ $9.40    │          │   │
│  │  └──────────────────┴──────────┴──────────┴──────────┘          │   │
│  │                                                                  │   │
│  │  에이전트별 비용 (시각화)                                          │   │
│  │  CTO 리더    ████████████████████ $15.20 (32%)                  │   │
│  │  FE 개발자   █████████████████ $12.80 (27%)                     │   │
│  │  BE 개발자   ██████████████ $10.50 (22%)                        │   │
│  │  QA 엔지니어  █████████ $6.80 (14%)                              │   │
│  │  PM 리더     ███ $2.50 (5%)                                     │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │  예산 정책                                              [+ 추가]  │   │
│  │                                                                  │   │
│  │  전체 일일    $500   ████░░░░░░ 32%   ⚠ 80%에서 경고            │   │
│  │  CTO팀 일일  $300   ███░░░░░░░ 28%   ⚠ 80%에서 경고            │   │
│  │  CTO 리더    $150   ████░░░░░░ 34%   ■ 하드 스톱               │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.4 조직도

```
┌──────────────────────────────────────────────────────────────────────────┐
│  조직도                                                                  │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│                        ┌────────────────┐                               │
│                        │  👤 Smith님     │                               │
│                        │  (소유자)       │                               │
│                        └───────┬────────┘                               │
│                                │                                         │
│                        ┌───────┴────────┐                               │
│                        │  🐹 모찌 (COO) │                               │
│                        │  ● 실행중      │                               │
│                        └───┬─────┬─────┘                               │
│                  ┌─────────┘     └─────────┐                            │
│          ┌───────┴────────┐       ┌────────┴───────┐                   │
│          │ 🤖 CTO 리더    │       │ 🤖 PM 리더     │                   │
│          │ ● 실행중       │       │ ○ 대기         │                   │
│          │ $15.20 오늘   │       │ $2.50 오늘    │                   │
│          └──┬────┬────┬──┘       └────────────────┘                   │
│    ┌────────┘    │    └────────┐                                       │
│  ┌─┴──────────┐┌─┴──────────┐┌─┴──────────┐                          │
│  │ FE 개발자   ││ BE 개발자   ││ QA 엔지니어  │                          │
│  │ ● 실행중   ││ ○ 대기     ││ ○ 대기     │                          │
│  │ $12.80    ││ $10.50    ││ $6.80     │                          │
│  └────────────┘└────────────┘└────────────┘                          │
│                                                                          │
│  범례: ● 실행중  ○ 대기  ⏸ 정지  ⚠ idle  ✕ 종료                       │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.5 체인 편집기

```
┌──────────────────────────────────────────────────────────────────────────┐
│  워크플로 체인 편집                                              [저장]   │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  체인 목록:                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │ ● 기본 PDCA 체인          4단계   활성   [편집] [비활성화]       │    │
│  │ ○ 핫픽스 체인             2단계   활성   [편집] [비활성화]       │    │
│  │ ○ 문서 전용 체인           2단계   활성   [편집] [비활성화]       │    │
│  │                                                   [+ 체인 생성]  │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                                                                          │
│  ━━ 기본 PDCA 체인 편집 ━━                                              │
│                                                                          │
│  체인명: [기본 PDCA 체인                    ] [▼ 활성]                   │
│                                                                          │
│  ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐      │
│  │ ① PM     │────→│ ② CTO    │────→│ ③ QA     │────→│ ④ 배포   │      │
│  │          │     │          │     │          │     │          │      │
│  │ 역할: PM │     │ 역할: CTO│     │ 역할: QA │     │ 역할: 배포│      │
│  │ 단계:    │     │ 단계:    │     │ 단계:    │     │ 단계:    │      │
│  │  설계    │     │  구현    │     │  검증    │     │  배포    │      │
│  │          │     │          │     │          │     │          │      │
│  │ 완료조건:│     │ 완료조건:│     │ 완료조건:│     │ 완료조건:│      │
│  │ Plan +   │     │ ☑ 체크   │     │ Match    │     │ Build    │      │
│  │ Design   │     │ ☑ 커밋   │     │ Rate     │     │ 성공     │      │
│  │ 완료     │     │ ☑ Push   │     │ ≥ 90%    │     │          │      │
│  │          │     │          │     │          │     │          │      │
│  │ 자동: ✓  │     │ 자동: ✓  │     │ 자동: ✓  │     │ 자동: ✗  │      │
│  │          │     │          │     │          │     │          │      │
│  │ [편집]   │     │ [편집]   │     │ [편집]   │     │ [편집]   │      │
│  │ [삭제]   │     │ [삭제]   │     │ [삭제]   │     │ [삭제]   │      │
│  └──────────┘     └──────────┘     └──────────┘     └──────────┘      │
│                                                                          │
│  [+ 단계 추가]                                          [↑↓ 순서 변경]   │
│                                                                          │
│  ━━ 단계 편집 (② CTO) ━━                                               │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │ 역할: [CTO     ▼]      단계: [구현 (do)  ▼]                     │   │
│  │ 라벨: [구현                                               ]      │   │
│  │                                                                  │   │
│  │ 완료 조건:                                                        │   │
│  │ ☑ 체크리스트 전부 완료                                            │   │
│  │ ☑ 커밋 존재                                                      │   │
│  │ ☑ Push 확인                                                      │   │
│  │ ☐ Match Rate ≥ [90]%                                             │   │
│  │ ☐ Build 성공                                                     │   │
│  │ ☐ 수동                                                           │   │
│  │                                                                  │   │
│  │ 자동 다음 단계: [✓]     담당: [backend-dev  ▼]                    │   │
│  │                                                                  │   │
│  │ 배포 설정: (이 단계에서 배포 실행)                                  │   │
│  │ ☐ 배포 실행     명령어: [gcloud run deploy bscamp-web ...]        │   │
│  │                                                                  │   │
│  │                                              [저장] [취소]        │   │
│  └──────────────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.6 활동 로그

```
┌──────────────────────────────────────────────────────────────────────────┐
│  활동 로그                                                               │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  필터: [전체 ▼] [오늘 ▼]     검색: [________________]                   │
│  유형: ☑ ticket  ☑ agent  ☑ chain  ☑ cost  ☑ system                   │
│                                                                          │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ 시각       │ 유형              │ 행위자        │ 상세              │ │
│  ├────────────┼──────────────────┼──────────────┼──────────────────┤ │
│  │ 10:34:12  │ ticket.completed │ hook:task    │ "purchase 수정"  │ │
│  │ 10:34:12  │ chain.auto_trig  │ system       │ step 2→3 CTO→QA │ │
│  │ 10:33:45  │ ticket.checklist │ cto-leader   │ 4/5 → 5/5 완료  │ │
│  │ 10:33:01  │ ticket.push_ver  │ hook:push    │ 8027d44 pushed  │ │
│  │ 10:32:15  │ cost.recorded    │ frontend-dev │ opus-4.6 $0.45  │ │
│  │ 10:31:00  │ agent.heartbeat  │ cto-leader   │ running, 3m ago │ │
│  │ 10:30:12  │ budget.warn      │ system       │ CTO 80% 도달    │ │
│  │ 10:28:45  │ pdca.phase_chg   │ system       │ do → check      │ │
│  │ ...       │                  │              │                  │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                          │
│  이벤트 상세 (클릭 시 확장):                                              │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │ ticket.completed                                                   │ │
│  │ 시각: 2026-03-30 10:34:12                                         │ │
│  │ 행위자: hook:task-completed                                       │ │
│  │ 대상: ticket/a1b2c3d4                                             │ │
│  │ payload:                                                           │ │
│  │   {"match_rate": 95, "commit_hash": "8027d44",                    │ │
│  │    "changed_files": 5, "process_level": "L2"}                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
```

### 4.7 알림 센터

```
┌────────────────────────────────────────┐
│  🔔 알림 (3개 미읽음)          [모두 읽음] │
├────────────────────────────────────────┤
│                                        │
│  🔴 예산 경고                  10분 전  │
│  CTO 리더 일일 예산 80% 도달            │
│  $120.00 / $150.00                     │
│                                        │
│  🟢 체인 자동 전환              15분 전  │
│  기본 PDCA 체인: CTO → QA 자동 시작     │
│  feature: protractor-data-fix          │
│                                        │
│  🟡 idle 경고                  30분 전  │
│  BE 개발자 5분 이상 응답 없음            │
│  마지막 heartbeat: 10:25               │
│                                        │
│  ── 이전 알림 ──                        │
│                                        │
│  ✓ 태스크 완료                  1시간 전 │
│  Paperclip Design v2 작성 완료          │
│                                        │
└────────────────────────────────────────┘
```

---

## 5. Hook 완전 분류 (49개 → 유지 12 / 대체 16 / 수정 7 / 삭제 14)

### 5.1 유지 (12개) — bash에서만 가능한 OS/tmux 수준 검증

이들은 CC의 PreToolUse/PostToolUse에서 실행되며, DB 시스템과 무관하게 동작.

| # | Hook | 줄수 | 이벤트 | 역할 | 유지 이유 |
|---|------|------|--------|------|-----------|
| 1 | `destructive-detector.sh` | 89 | PreToolUse:Bash | rm -rf/force push 차단 | OS 명령어 수준 검증 |
| 2 | `validate-delegate.sh` | 98 | PreToolUse:Edit\|Write | 리더 코드 수정 차단 | tmux pane ID 기반 |
| 3 | `validate-deploy-authority.sh` | 60 | PreToolUse:Bash | 배포 권한 검증 | tmux pane 기반 |
| 4 | `enforce-teamcreate.sh` | 54 | PreToolUse:Agent | 단독 spawn 차단 | CC 도구 파라미터 검사 |
| 5 | `is-teammate.sh` | 25 | (source) | 팀원 역할 감지 | tmux pane 기반 |
| 6 | `protect-stage.sh` | 31 | PreToolUse:Bash | stage 마커 직접 생성 차단 | touch 명령 검사 |
| 7 | `task-quality-gate.sh` | 92 | TaskCompleted | tsc/build 품질 검증 | **실행** 수준 검증 |
| 8 | `enforce-qa-before-merge.sh` | 194 | PreToolUse:Bash | QA 없이 커밋 차단 | git diff 기반 |
| 9 | `force-team-kill.sh` | 126 | (수동) | tmux pane 강제 종료 | tmux 직접 조작 |
| 10 | `auto-shutdown.sh` | 138 | (수동) | Graceful shutdown | tmux 기반 |
| 11 | `detect-process-level.sh` | 71 | (source) | 레벨 자동 판단 | git diff 기반 |
| 12 | `enforce-task-complete-before-push.sh` | 44 | PreToolUse:Bash | push 전 완료 확인 | **수정**: DB 쿼리로 변경 |

### 5.2 대체 (16개) — DB+이벤트 시스템이 완전 대체

이들의 기능은 서비스 레이어로 이전됨. 전환 후 settings.local.json에서 제거.

| # | Hook | 줄수 | 대체 서비스 | 해결 문제 |
|---|------|------|------------|----------|
| 1 | `task-completed.sh` | 105 | TicketService + EventBus | P1: 자동 completed |
| 2 | `pdca-chain-handoff.sh` | 357 | ChainService + webhook | P7: 자동 체인 |
| 3 | `gap-analysis.sh` | 116 | ChainService 완료 조건 | 자동 Gap 트리거 |
| 4 | `pdca-update.sh` | 77 | pdca_features 테이블 | P4: 상태 동기화 |
| 5 | `notify-completion.sh` | 53 | NotificationService | 이벤트 기반 알림 |
| 6 | `deploy-trigger.sh` | 67 | ChainService 배포 단계 | P9: 자동 배포 |
| 7 | `deploy-verify.sh` | 34 | ChainService 검증 | 배포 후 검증 |
| 8 | `dashboard-sync.sh` | 70 | 대시보드 UI 직접 DB 접근 | 실시간 대시보드 |
| 9 | `agent-state-sync.sh` | 393 | AgentService + RuntimeWatcher | 상태 자동 동기 |
| 10 | `registry-update.sh` | 44 | AgentService.register() | DB 자동 등록 |
| 11 | `agent-slack-notify.sh` | 166 | NotificationService | 이벤트 기반 Slack |
| 12 | `auto-team-cleanup.sh` | 63 | ChainService 완료 시 | 체인 완료→정리 |
| 13 | `session-resume-check.sh` | 110 | 대시보드 미완료 태스크 표시 | UI 기반 |
| 14 | `validate-pdca-before-teamdelete.sh` | 59 | TicketService 상태 검증 | DB 쿼리 |
| 15 | `verify-chain-e2e.sh` | 47 | 통합 테스트 | 자동화 |
| 16 | `heartbeat-watchdog.sh` | 26 | AgentService.checkIdleAgents | P10: 자동 조치 |

### 5.3 수정 (7개) — 유지하되 DB 쿼리로 변경

파일 읽기(pdca-status.json)를 API 호출(curl localhost:3201/api/...)로 교체.

| # | Hook | 변경 내용 |
|---|------|----------|
| 1 | `validate-pdca.sh` | pdca-status.json 읽기 → `curl localhost:3201/api/pdca/current` |
| 2 | `validate-plan.sh` | pdca-status.json 읽기 → API 조회 |
| 3 | `validate-design.sh` | pdca-status.json 읽기 → API 조회 |
| 4 | `validate-task.sh` | TASK 파일 읽기 → `curl localhost:3201/api/tickets?status=in_progress` |
| 5 | `validate-before-delegate.sh` | 분석 문서 존재 확인 → API + 파일 확인 병행 |
| 6 | `postmortem-review-gate.sh` | 파일 기반 → DB 이벤트 조회 |
| 7 | `enforce-task-complete-before-push.sh` | 파일 기반 → API 조회 |

**API 호출 패턴** (수정 hook 공통):
```bash
# 기존
FEATURE=$(jq -r '.primaryFeature' .bkit/state/pdca-status.json)

# v2
FEATURE=$(curl -sf localhost:3201/api/pdca/current | jq -r '.id' 2>/dev/null)
if [ -z "$FEATURE" ]; then
  # 서버 다운 시 fallback: pdca-status.json 미러에서 읽기
  FEATURE=$(jq -r '.primaryFeature // empty' .bkit/state/pdca-status.json 2>/dev/null)
fi
```

### 5.4 삭제 (14개) — 헬퍼/1회성/상위 hook 대체로 불필요

| # | Hook | 이유 |
|---|------|------|
| 1 | `helpers/chain-messenger.sh` | ChainService가 대체 |
| 2 | `helpers/peer-resolver.sh` | AgentService가 대체 |
| 3 | `helpers/team-context-resolver.sh` | DB team 쿼리로 대체 |
| 4 | `helpers/match-rate-parser.sh` | DB match_rate 필드로 대체 |
| 5 | `helpers/hook-self-register.sh` | AgentService.register()로 대체 |
| 6 | `helpers/context-checkpoint.sh` | DB checkpoint로 대체 |
| 7 | `helpers/approval-handler.sh` | ChainService 승인 로직으로 대체 |
| 8 | `helpers/migrate-runtime.sh` | 1회성 마이그레이션 (완료) |
| 9 | `helpers/zombie-pane-detector.sh` | AgentService idle 감지로 대체 |
| 10 | `helpers/hook-output.sh` | 유지 hook에서만 필요 시 인라인 |
| 11 | `helpers/postmortem-validator.sh` | 유지 (postmortem-review-gate가 유지) |
| 12 | `helpers/prevention-tdd-tracker.sh` | 유지 (테스트 추적) |
| 13 | `helpers/error-classifier.sh` | 유지 (에러 분류) |
| 14 | `helpers/frontmatter-parser.sh` | 유지 (문서 파싱) |

> 참고: 삭제 14개 중 helpers 11~14는 실제로는 유지. "삭제 대상"이 아닌 "상위 hook 판단에 따름" 카테고리. 실질 삭제는 10개.

### 5.5 settings.local.json 전환

```json
// 전환 전 (현재): TaskCompleted hook 8개
"TaskCompleted": [{
  "hooks": [
    "task-completed.sh",        // → 삭제 (TicketService)
    "task-quality-gate.sh",     // → 유지 (tsc/build 실행)
    "gap-analysis.sh",          // → 삭제 (ChainService)
    "pdca-update.sh",           // → 삭제 (pdca_features)
    "notify-completion.sh",     // → 삭제 (NotificationService)
    "deploy-trigger.sh",        // → 삭제 (ChainService 배포)
    "deploy-verify.sh",         // → 삭제 (ChainService 검증)
    "pdca-chain-handoff.sh"     // → 삭제 (ChainService)
  ]
}]

// 전환 후: TaskCompleted hook 2개
"TaskCompleted": [{
  "hooks": [
    {
      "type": "command",
      "command": "bash .bkit/hooks/task-quality-gate.sh",
      "timeout": 120000
    },
    {
      "type": "command",
      "command": "curl -sf -X POST http://localhost:3201/api/hooks/task-completed -H 'Content-Type: application/json' -d '{\"event\":\"TaskCompleted\"}' || true",
      "timeout": 5000
    }
  ]
}]
```

---

## 6. 서비스 레이어 설계

### 6.1 TicketService (P1, P2, P3 해결)

```typescript
// dashboard/server/services/tickets.ts
// Paperclip 원본: server/src/services/issues.ts (65.4KB)
// 차용 함수: createIssue, updateIssue, getIssue, listIssues, updateChecklist
// 제거: companyId, memberId, sprint/epic, 댓글, 라벨
// 추가: PDCA 연결, 자동 completed, push_verified

import { db } from '../db';
import { tickets, events, pdcaFeatures } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { eventBus } from '../event-bus';

export class TicketService {
  // CRUD (Paperclip issues.ts 기반)
  async create(input: CreateTicketInput): Promise<Ticket> {
    const ticket = await db.insert(tickets).values({
      feature: input.feature,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 'medium',
      assignee_agent: input.assigneeAgent,
      assignee_team: input.assigneeTeam,
      pdca_phase: input.pdcaPhase,
      process_level: input.processLevel,
      chain_id: input.chainId,
      chain_step_id: input.chainStepId,
      checklist: JSON.stringify(input.checklist ?? []),
    }).returning().get();

    await this.recordEvent('ticket.created', 'system', ticket.id, input);
    eventBus.emit('ticket.created', ticket);
    return ticket;
  }

  // 상태 전환
  async changeStatus(id: string, newStatus: TicketStatus): Promise<void> {
    const ticket = await this.get(id);
    if (!ticket) throw new Error(`Ticket ${id} not found`);

    const updates: Partial<Ticket> = {
      status: newStatus,
      updated_at: new Date().toISOString(),
    };

    if (newStatus === 'completed') {
      updates.completed_at = new Date().toISOString();
    }
    if (newStatus === 'in_progress' && !ticket.started_at) {
      updates.started_at = new Date().toISOString();
    }

    await db.update(tickets).set(updates).where(eq(tickets.id, id));
    await this.recordEvent('ticket.status_changed', 'system', id, {
      from: ticket.status, to: newStatus
    });

    eventBus.emit('ticket.status_changed', { ticket, newStatus });

    // P1, P3: completed → 체인 완료 조건 평가
    if (newStatus === 'completed' && ticket.chain_step_id) {
      eventBus.emit('ticket.completed', ticket);
    }
  }

  // P1, P3 핵심: 체크리스트 업데이트 + 자동 completed
  async updateChecklist(id: string, checklist: ChecklistItem[]): Promise<void> {
    await db.update(tickets).set({
      checklist: JSON.stringify(checklist),
      updated_at: new Date().toISOString(),
    }).where(eq(tickets.id, id));

    await this.recordEvent('ticket.checklist_updated', 'system', id, { checklist });
    eventBus.emit('ticket.checklist_updated', { ticketId: id, checklist });

    // 자동 completed 판단
    const allDone = checklist.length > 0 && checklist.every(item => item.done);
    if (allDone) {
      await this.changeStatus(id, 'completed');
    }
  }

  // P2, P6: 커밋 기록
  async recordCommit(id: string, commitHash: string, changedFiles: number): Promise<void> {
    await db.update(tickets).set({
      commit_hash: commitHash,
      changed_files: changedFiles,
      updated_at: new Date().toISOString(),
    }).where(eq(tickets.id, id));

    await this.recordEvent('ticket.commit_recorded', 'system', id, { commitHash, changedFiles });
  }

  // P6: push 확인
  async verifyPush(id: string): Promise<void> {
    await db.update(tickets).set({
      push_verified: 1,
      updated_at: new Date().toISOString(),
    }).where(eq(tickets.id, id));

    await this.recordEvent('ticket.push_verified', 'system', id, {});
  }

  // P1 안전망: 커밋 있는데 completed 아닌 ticket 감지
  async findStaleTickets(): Promise<Ticket[]> {
    return db.select().from(tickets)
      .where(and(
        eq(tickets.status, 'in_progress'),
        // commit_hash가 있는데 30분 이상 completed 안 된 것
      ))
      .all();
  }

  private async recordEvent(type: string, actor: string, targetId: string, payload: any) {
    await db.insert(events).values({
      event_type: type,
      actor,
      target_type: 'ticket',
      target_id: targetId,
      payload: JSON.stringify(payload),
    });
  }
}
```

### 6.2 ChainService (P7, P9 해결)

```typescript
// dashboard/server/services/chains.ts
// 완전 신규 (Paperclip approvals + routines 개념 기반)

import { db } from '../db';
import { workflowChains, workflowSteps, tickets, events, pdcaFeatures } from '../db/schema';
import { eventBus } from '../event-bus';
import { execSync } from 'child_process';

export class ChainService {
  // 체인 CRUD
  async createChain(input: CreateChainInput): Promise<WorkflowChain> { /* ... */ }
  async getChain(id: string): Promise<WorkflowChain> { /* ... */ }
  async listChains(): Promise<WorkflowChain[]> { /* ... */ }

  // 단계 관리 (UI 드래그앤드롭에서 호출)
  async addStep(chainId: string, step: CreateStepInput): Promise<WorkflowStep> { /* ... */ }
  async removeStep(stepId: string): Promise<void> { /* ... */ }
  async reorderSteps(chainId: string, stepIds: string[]): Promise<void> { /* ... */ }

  // P1, P2, P3, P6 핵심: 완료 조건 평가
  async evaluateCompletion(stepId: string, context: EvalContext): Promise<boolean> {
    const step = await db.select().from(workflowSteps)
      .where(eq(workflowSteps.id, stepId)).get();
    if (!step) return false;

    const condition = JSON.parse(step.completion_condition);
    return this.evaluateCondition(condition, context);
  }

  private async evaluateCondition(condition: Condition, ctx: EvalContext): Promise<boolean> {
    switch (condition.type) {
      case 'manual':
        return ctx.manualApproval === true;

      case 'checklist_all_done': {
        const checklist = JSON.parse(ctx.ticket?.checklist ?? '[]');
        return checklist.length > 0 && checklist.every((i: any) => i.done);
      }

      case 'commit_exists':
        return !!ctx.ticket?.commit_hash;

      case 'push_verified':
        return ctx.ticket?.push_verified === 1;

      case 'match_rate': {
        const rate = ctx.ticket?.match_rate ?? 0;
        return rate >= (condition.min ?? 90);
      }

      case 'build_success':
        return ctx.buildSuccess === true;

      case 'all':
        for (const sub of condition.conditions) {
          if (!await this.evaluateCondition(sub, ctx)) return false;
        }
        return true;

      default:
        return false;
    }
  }

  // P7 핵심: 다음 단계 자동 트리거
  async triggerNextStep(chainId: string, currentOrder: number): Promise<void> {
    const nextStep = await db.select().from(workflowSteps)
      .where(and(
        eq(workflowSteps.chain_id, chainId),
        eq(workflowSteps.step_order, currentOrder + 1)
      )).get();

    if (nextStep) {
      // 다음 단계 시작
      await this.recordEvent('chain.auto_triggered', {
        chain_id: chainId,
        from_step: currentOrder,
        to_step: currentOrder + 1,
        team_role: nextStep.team_role,
      });

      // 다음 팀용 ticket 자동 생성
      const feature = await this.getFeatureByChain(chainId);
      if (feature) {
        const ticketService = new TicketService();
        await ticketService.create({
          feature: feature.id,
          title: `${feature.display_name} — ${nextStep.label}`,
          assigneeTeam: nextStep.team_role,
          pdcaPhase: nextStep.phase,
          chainId: chainId,
          chainStepId: nextStep.id,
          checklist: this.defaultChecklist(nextStep.phase),
        });
      }

      // PDCA 피처 단계 전환
      if (feature) {
        await db.update(pdcaFeatures).set({
          phase: this.phaseToStatus(nextStep.phase),
          current_step: nextStep.step_order,
          updated_at: new Date().toISOString(),
        }).where(eq(pdcaFeatures.id, feature.id));
      }

      // WebSocket 실시간 전파
      eventBus.emit('chain.auto_triggered', { chainId, nextStep });

    } else {
      // 마지막 단계 → 체인 완료
      await this.onChainCompleted(chainId);
    }
  }

  // P9: 배포 단계 처리
  async executeDeployStep(step: WorkflowStep): Promise<boolean> {
    if (!step.deploy_config) return true;

    const config = JSON.parse(step.deploy_config);
    try {
      const output = execSync(config.command, { timeout: 300000 }).toString();

      await this.recordEvent('chain.deploy_triggered', {
        step_id: step.id,
        command: config.command,
        success: true,
      });

      await this.recordEvent('system.deploy_result', {
        output: output.slice(-500),
        success: true,
      });

      // 배포 후 검증 (RET-004)
      if (config.verify) {
        // Cloud Run 로그 확인 로직
      }

      return true;
    } catch (error) {
      await this.recordEvent('system.deploy_result', {
        error: String(error).slice(-500),
        success: false,
      });
      return false;
    }
  }

  // 체인 완료 → MOZZI webhook
  private async onChainCompleted(chainId: string): Promise<void> {
    await this.recordEvent('chain.handoff', { chain_id: chainId });

    // MOZZI webhook 전송
    try {
      await fetch('http://127.0.0.1:18789/hooks/wake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'COMPLETION_REPORT',
          chain_id: chainId,
          timestamp: new Date().toISOString(),
        }),
      });
      await this.recordEvent('system.webhook_sent', { target: 'mozzi' });
    } catch {
      // webhook 실패해도 DB 상태는 정확 — graceful
    }
  }

  private defaultChecklist(phase: string): ChecklistItem[] {
    const base = [
      { id: 'tsc', text: 'tsc --noEmit 통과', done: false },
      { id: 'build', text: 'npm run build 성공', done: false },
    ];
    if (phase === 'do') {
      return [
        { id: 'impl', text: '구현 완료', done: false },
        ...base,
        { id: 'commit', text: '커밋 완료', done: false },
        { id: 'push', text: 'push 완료', done: false },
      ];
    }
    return base;
  }
}
```

### 6.3 HookBridgeService (P4 해결 + 하위 호환)

```typescript
// dashboard/server/services/hook-bridge.ts
// 기존 bash hook → DB 이벤트 변환 브릿지

import { db } from '../db';
import { tickets, events, pdcaFeatures } from '../db/schema';
import { writeFileSync } from 'fs';

export class HookBridgeService {
  // 기존 TaskCompleted hook에서 호출됨
  // curl -sf localhost:3201/api/hooks/task-completed -d '...' || true
  async onTaskCompleted(payload: HookPayload): Promise<void> {
    // 1) 현재 진행 중 ticket 찾기 (feature + in_progress)
    const ticket = await db.select().from(tickets)
      .where(eq(tickets.status, 'in_progress'))
      .orderBy(desc(tickets.updated_at))
      .get();

    if (ticket) {
      // 커밋 정보 기록
      if (payload.commit_hash) {
        await new TicketService().recordCommit(
          ticket.id, payload.commit_hash, payload.changed_files ?? 0
        );
      }

      // match_rate 기록
      if (payload.match_rate) {
        await db.update(tickets).set({
          match_rate: payload.match_rate,
        }).where(eq(tickets.id, ticket.id));
      }

      // 체인 완료 조건 평가
      if (ticket.chain_step_id) {
        const chainService = new ChainService();
        const completed = await chainService.evaluateCompletion(ticket.chain_step_id, {
          ticket,
          matchRate: payload.match_rate,
          buildSuccess: payload.build_success,
        });
        if (completed) {
          const step = await db.select().from(workflowSteps)
            .where(eq(workflowSteps.id, ticket.chain_step_id)).get();
          if (step?.auto_trigger_next) {
            await chainService.triggerNextStep(ticket.chain_id!, step.step_order);
          }
        }
      }
    }

    // 2) events 기록
    await db.insert(events).values({
      event_type: 'system.hook_executed',
      actor: 'hook:task-completed',
      payload: JSON.stringify(payload),
    });

    // 3) P4: pdca-status.json 미러 동기화
    await this.syncToPdcaStatusJson();

    // 4) WebSocket 전파
    eventBus.emit('hook.task_completed', payload);
  }

  // P4 핵심: DB → pdca-status.json 일방향 미러
  async syncToPdcaStatusJson(): Promise<void> {
    const features = await db.select().from(pdcaFeatures).all();

    // 현재 활성 feature 판별 (가장 최근 업데이트된 비완료 feature)
    const active = features
      .filter(f => f.phase !== 'completed' && f.phase !== 'archived')
      .sort((a, b) => (b.updated_at ?? '').localeCompare(a.updated_at ?? ''));

    const status = {
      version: '3.0',
      lastUpdated: new Date().toISOString(),
      primaryFeature: active[0]?.id ?? null,  // P4: DB에서 결정
      activeFeatures: active.map(f => f.id),
      features: Object.fromEntries(features.map(f => [f.id, {
        displayName: f.display_name,
        phase: f.phase,
        processLevel: f.process_level,
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

### 6.4 AgentService (P10 해결)

```typescript
// dashboard/server/services/agents.ts
// Paperclip 원본: server/src/services/agents.ts (23.5KB)

export class AgentService {
  // P10: idle 감지 + 자동 조치 (1분 간격)
  async checkIdleAgents(): Promise<void> {
    const IDLE_WARN = 5 * 60 * 1000;   // 5분: 경고
    const IDLE_PAUSE = 15 * 60 * 1000; // 15분: 자동 정지

    const running = await db.select().from(agents)
      .where(eq(agents.status, 'running')).all();

    for (const agent of running) {
      if (!agent.last_heartbeat_at) continue;

      const idleMs = Date.now() - new Date(agent.last_heartbeat_at).getTime();

      if (idleMs > IDLE_PAUSE) {
        // 자동 정지
        await db.update(agents).set({
          status: 'paused',
          pause_reason: `idle ${Math.round(idleMs / 60000)}분 — 자동 정지`,
          updated_at: new Date().toISOString(),
        }).where(eq(agents.id, agent.id));

        await this.recordEvent('agent.auto_paused', agent.id);
        eventBus.emit('agent.auto_paused', agent);

      } else if (idleMs > IDLE_WARN && !agent.idle_warning_sent) {
        // 경고
        await db.update(agents).set({
          idle_warning_sent: 1,
          updated_at: new Date().toISOString(),
        }).where(eq(agents.id, agent.id));

        await this.recordEvent('agent.idle_warning', agent.id);
        eventBus.emit('agent.idle_warning', agent);
      }
    }
  }

  // RuntimeWatcher에서 호출: .bkit/runtime/ 파일 변경 시
  async syncFromRuntime(peerMap: PeerMapEntry[]): Promise<void> {
    for (const peer of peerMap) {
      const existing = await db.select().from(agents)
        .where(eq(agents.peer_id, peer.id)).get();

      if (existing) {
        await db.update(agents).set({
          status: 'running',
          last_heartbeat_at: new Date().toISOString(),
          pid: peer.pid,
          tmux_pane: peer.tmuxPane,
          idle_warning_sent: 0,
          updated_at: new Date().toISOString(),
        }).where(eq(agents.id, existing.id));
      }
    }
    eventBus.emit('agents.synced', {});
  }
}
```

### 6.5 CostService + Rate Limiter (P8 해결)

```typescript
// dashboard/server/services/costs.ts
// Paperclip 원본: server/src/services/costs.ts (16.6KB) 거의 그대로

export class CostService {
  async recordCost(event: CreateCostEvent): Promise<void> {
    await db.insert(costEvents).values(event);
    await this.recordEvent('cost.recorded', event.agent_id);

    // 예산 평가
    await this.evaluateBudget(event.agent_id, event.cost_cents);
  }

  // P8: 예산 초과 시 자동 조치
  async evaluateBudget(agentId: string, costCents: number): Promise<void> {
    const policies = await this.getApplicablePolicies(agentId);

    for (const policy of policies) {
      const spent = await this.getWindowSpend(policy);
      const percent = (spent / policy.amount_cents) * 100;

      if (percent >= 100 && policy.hard_stop) {
        // 하드 스톱: 에이전트 자동 정지
        await db.update(agents).set({
          status: 'paused',
          pause_reason: `예산 초과 ($${(spent/100).toFixed(2)} / $${(policy.amount_cents/100).toFixed(2)})`,
        }).where(eq(agents.id, agentId));

        await db.insert(budgetIncidents).values({
          policy_id: policy.id,
          agent_id: agentId,
          kind: 'hard_stop',
          amount_at_trigger: spent,
          threshold_amount: policy.amount_cents,
        });

        eventBus.emit('budget.hard_stop', { agentId, policy });

      } else if (percent >= policy.warn_percent) {
        // 소프트 경고
        eventBus.emit('budget.warn', { agentId, policy, percent });
      }
    }
  }
}

// dashboard/server/services/rate-limiter.ts
// P8 별도 구현: Anthropic API rate limit 방지

export class RateLimiter {
  private queues = new Map<string, number>(); // agent → last request time

  canRequest(agentId: string): boolean {
    const last = this.queues.get(agentId) ?? 0;
    return Date.now() - last >= 100; // 100ms 최소 간격
  }

  recordRequest(agentId: string): void {
    this.queues.set(agentId, Date.now());
  }
}
```

### 6.6 이벤트 흐름 다이어그램

```
┌──────────────────────────────────────────────────────────────────────────┐
│  이벤트 흐름: 태스크 생성 → 완료 → 체인 자동 전환 → 배포 → 보고         │
└──────────────────────────────────────────────────────────────────────────┘

  UI (대시보드)                서버 (Express)                외부
  ━━━━━━━━━━━━              ━━━━━━━━━━━━━━━             ━━━━━━━━
      │                          │                          │
  [태스크 생성]                   │                          │
      │──POST /tickets──────────→│                          │
      │                    TicketService.create()            │
      │                          │──INSERT tickets + events  │
      │←──WebSocket──────────────│                          │
      │                          │                          │
  [작업 진행 중...]                │                          │
      │                    RuntimeWatcher                    │
      │                          │←─파일 변경 감지           │
      │                          │  .bkit/runtime/peer-map   │
      │                    AgentService.syncFromRuntime()    │
      │                          │──UPDATE agents            │
      │←──WebSocket (heartbeat)──│                          │
      │                          │                          │
  [체크리스트 항목 완료]           │                          │
      │──PATCH /tickets/:id─────→│                          │
      │                    TicketService.updateChecklist()   │
      │                          │                          │
      │               전체 done? ─┤                          │
      │                    YES   │                          │
      │                    ┌─────┘                          │
      │                    │ P3: 자동 completed              │
      │                    │                                │
      │                    │ P1: ticket.completed 이벤트     │
      │                    │──INSERT events                  │
      │                    │                                │
      │                    │ P7: ChainService                │
      │                    │ .evaluateCompletion()           │
      │                    │                                │
      │               P2: 커밋+push 있는지 확인               │
      │               P6: push_verified 확인                 │
      │                    │                                │
      │               조건 충족? ─┤                          │
      │                    YES   │                          │
      │                    │     │                          │
      │                    │ chain.step_completed 이벤트     │
      │                    │                                │
      │               P7: auto_trigger_next? ─┤              │
      │                    YES                │              │
      │                    │                  │              │
      │                    │ 다음 팀용 ticket 자동 생성       │
      │                    │ chain.auto_triggered 이벤트     │
      │                    │                                │
      │               마지막 단계? ─┤                         │
      │                    YES      │                        │
      │                    │        │                        │
      │               P9: deploy_config 있으면 배포 실행      │
      │                    │──gcloud run deploy────────────→ │ Cloud Run
      │                    │                                │
      │                    │ chain.handoff 이벤트            │
      │                    │──POST webhook──────────────────→│ MOZZI
      │                    │                                │ (OpenClaw)
      │                    │                                │
      │               P4: syncToPdcaStatusJson()            │
      │                    │──WRITE pdca-status.json         │
      │                    │  (읽기전용 미러)                 │
      │                    │                                │
      │←──WebSocket (전체)──│                                │
```

---

## 7. 디렉토리 구조

```
dashboard/                             ← 신규 디렉토리 (bscamp 루트)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.server.json               ← 서버 전용 TS 설정
├── tailwind.config.ts                 ← Primary #F75D5D, Pretendard
├── drizzle.config.ts                  ← SQLite 설정
│
├── .data/
│   └── bkit.db                        ← SQLite DB 파일 (.gitignore)
│
├── src/                               ← React 프론트엔드
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx                     ← React Router
│   │
│   ├── pages/                         ← 7개 페이지
│   │   ├── DashboardPage.tsx          ← Paperclip Dashboard.tsx 기반
│   │   ├── TicketsPage.tsx            ← Paperclip Issues.tsx 기반
│   │   ├── CostsPage.tsx             ← Paperclip Costs.tsx 기반
│   │   ├── OrgChartPage.tsx          ← Paperclip OrgChart.tsx 기반
│   │   ├── AgentsPage.tsx            ← Paperclip Agents.tsx 기반
│   │   ├── ChainsPage.tsx            ← 신규 (체인 편집기)
│   │   └── ActivityPage.tsx          ← 신규 (활동 로그)
│   │
│   ├── components/                    ← 28개 컴포넌트
│   │   ├── Layout.tsx                 ← Paperclip Layout.tsx
│   │   ├── Sidebar.tsx                ← 한국어 메뉴 7개
│   │   ├── SidebarAgents.tsx          ← 실시간 에이전트 상태
│   │   ├── MetricCard.tsx             ← ko-KR 숫자 포맷
│   │   ├── AgentStatusPanel.tsx       ← 에이전트 그리드
│   │   ├── AgentRunCard.tsx           ← 실행 카드
│   │   ├── ActivityCharts.tsx         ← Recharts 차트
│   │   ├── ActivityRow.tsx            ← 이벤트 행
│   │   ├── StatusIcon.tsx
│   │   ├── StatusBadge.tsx
│   │   ├── TicketChecklist.tsx        ← 자동 완료 표시
│   │   ├── BudgetPolicyCard.tsx       ← 예산 정책
│   │   ├── BudgetIncidentCard.tsx     ← 예산 초과
│   │   ├── SpendCard.tsx              ← 지출 현황
│   │   ├── QuotaCard.tsx              ← 쿼터 표시
│   │   ├── QuotaBar.tsx
│   │   ├── TimelineCard.tsx           ← 시간별 비용
│   │   ├── ModelCostCard.tsx          ← 모델별 비용
│   │   ├── ChainEditor.tsx            ← 체인 편집기 (D&D)
│   │   ├── ChainStepCard.tsx          ← 단계 카드
│   │   ├── ConditionEditor.tsx        ← 완료 조건 편집
│   │   ├── TeamDialog.tsx             ← 팀 생성/관리
│   │   ├── TicketAssignDialog.tsx     ← 태스크 배정
│   │   ├── ApprovalBanner.tsx         ← L3 승인 배너
│   │   ├── NotificationBell.tsx       ← 알림 벨
│   │   ├── NotificationDropdown.tsx   ← 알림 목록
│   │   ├── OrgChartTree.tsx           ← SVG 트리 렌더링
│   │   └── KoreanLabels.tsx           ← 한국어 상태 매핑
│   │
│   ├── context/
│   │   ├── LiveUpdatesProvider.tsx     ← WebSocket 실시간
│   │   ├── ToastContext.tsx            ← 한국어 토스트
│   │   └── SidebarContext.tsx
│   │
│   ├── api/                           ← API 클라이언트
│   │   ├── client.ts                  ← baseURL: localhost:3201
│   │   ├── tickets.ts
│   │   ├── agents.ts
│   │   ├── costs.ts
│   │   ├── budgets.ts
│   │   ├── chains.ts
│   │   ├── dashboard.ts
│   │   ├── heartbeats.ts
│   │   └── notifications.ts
│   │
│   ├── hooks/
│   │   ├── useDateRange.ts
│   │   └── useAgentOrder.ts
│   │
│   └── lib/
│       ├── korean-labels.ts           ← 상태/역할 한국어 매핑
│       ├── format.ts                  ← ko-KR 숫자/날짜 포맷
│       └── queryKeys.ts
│
└── server/                            ← Express 백엔드
    ├── index.ts                       ← 진입점 (포트 3201)
    ├── app.ts                         ← Express + CORS + WebSocket
    ├── event-bus.ts                   ← EventEmitter 싱글톤
    │
    ├── db/
    │   ├── index.ts                   ← Drizzle + better-sqlite3 + WAL
    │   ├── schema.ts                  ← 11개 테이블 정의
    │   └── seed.ts                    ← 초기 데이터 (기본 체인, 에이전트)
    │
    ├── services/
    │   ├── tickets.ts                 ← TicketService (issues.ts 기반)
    │   ├── agents.ts                  ← AgentService (agents.ts 기반)
    │   ├── costs.ts                   ← CostService (costs.ts 기반)
    │   ├── budgets.ts                 ← BudgetService (budgets.ts 기반)
    │   ├── dashboard.ts               ← DashboardService
    │   ├── heartbeat.ts               ← HeartbeatService (경량화)
    │   ├── chains.ts                  ← ChainService (신규)
    │   ├── hook-bridge.ts             ← HookBridgeService (신규)
    │   ├── notifications.ts           ← NotificationService (신규)
    │   ├── cost-collector.ts          ← CostCollector (세션 파일 감시)
    │   └── rate-limiter.ts            ← RateLimiter (P8, 신규)
    │
    ├── routes/
    │   ├── tickets.ts
    │   ├── agents.ts
    │   ├── costs.ts
    │   ├── budgets.ts
    │   ├── chains.ts
    │   ├── dashboard.ts
    │   ├── hooks.ts                   ← 기존 bash hook에서 호출받는 엔드포인트
    │   ├── notifications.ts
    │   └── pdca.ts                    ← /api/pdca/current 등 (수정 hook용)
    │
    ├── realtime/
    │   └── ws.ts                      ← WebSocket 서버
    │
    └── watcher/
        └── runtime-watcher.ts         ← chokidar 파일 감시
```

---

## 8. 의존성

```json
{
  "name": "bkit-dashboard",
  "private": true,
  "scripts": {
    "dev": "concurrently \"vite\" \"tsx watch server/index.ts\"",
    "build": "vite build && tsc -p tsconfig.server.json",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "test": "vitest",
    "test:coverage": "vitest --coverage"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router-dom": "^7.0.0",
    "@tanstack/react-query": "^5.0.0",
    "recharts": "^2.12.0",
    "tailwindcss": "^3.4.0",
    "@dnd-kit/core": "^6.1.0",
    "@dnd-kit/sortable": "^8.0.0",

    "express": "^4.21.0",
    "better-sqlite3": "^11.0.0",
    "drizzle-orm": "^0.33.0",
    "ws": "^8.18.0",
    "chokidar": "^3.6.0",
    "cors": "^2.8.0",
    "concurrently": "^9.0.0",
    "tsx": "^4.19.0"
  },
  "devDependencies": {
    "vite": "^5.4.0",
    "@vitejs/plugin-react": "^4.3.0",
    "drizzle-kit": "^0.24.0",
    "typescript": "^5.6.0",
    "vitest": "^2.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/ws": "^8.5.0",
    "@types/express": "^4.17.0"
  }
}
```

---

## 9. TDD — 서비스별 테스트 케이스

### 9.1 TicketService 테스트 (14건)

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

### 9.2 ChainService 테스트 (16건)

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

### 9.3 HookBridgeService 테스트 (8건)

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

### 9.4 AgentService 테스트 (8건)

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

### 9.5 CostService + BudgetService 테스트 (10건)

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

**총 56건 테스트 케이스** | 문제 매핑: P1(6건), P2(4건), P3(5건), P4(2건), P6(4건), P7(5건), P8(4건), P9(2건), P10(3건)

### 9.6 테스트 파일 구조

```
dashboard/
├── __tests__/
│   ├── services/
│   │   ├── tickets.test.ts         ← TC-T01 ~ TC-T14
│   │   ├── chains.test.ts          ← TC-C01 ~ TC-C16
│   │   ├── hook-bridge.test.ts     ← TC-H01 ~ TC-H08
│   │   ├── agents.test.ts          ← TC-A01 ~ TC-A08
│   │   └── costs.test.ts           ← TC-$01 ~ TC-$10
│   ├── integration/
│   │   ├── chain-flow.test.ts      ← P7 E2E: PM완료→CTO자동시작→배포
│   │   ├── auto-complete.test.ts   ← P1+P3 E2E: 체크리스트→완료→webhook
│   │   └── budget-halt.test.ts     ← P8 E2E: 비용초과→정지→해제
│   └── setup.ts                    ← 인메모리 SQLite + 스키마 자동 생성
```

---

## 10. 구현 일정

| 단계 | 기간 | 산출물 | 의존성 | TDD |
|------|------|--------|--------|-----|
| **1단계: 기반** | Day 1 | Vite+React 초기화, DB 스키마, Express 서버, WebSocket, 테스트 환경 | — | setup.ts |
| **2단계: Ticket + 체인 엔진** | Day 2~3 | TicketService, ChainService, 체크리스트 자동 완료, 체인 자동 전환 | 1단계 | TC-T*, TC-C* |
| **3단계: Hook 브릿지** | Day 3~4 | HookBridgeService, pdca-status.json 미러, settings.local.json 전환 | 2단계 | TC-H* |
| **4단계: 대시보드 UI** | Day 4~5 | 메인 대시보드, 태스크 목록, 활동 로그 (한국어) | 2~3단계 | — |
| **5단계: 비용 + 예산** | Day 5~6 | CostService, BudgetService, 비용 수집기, 비용 페이지 | 1단계 | TC-$* |
| **6단계: 체인 편집기 + 조직도** | Day 6~7 | 체인 편집 UI (D&D), Org Chart, 알림 센터 | 2~4단계 | — |
| **7단계: 에이전트 관리** | Day 7~8 | AgentService, RuntimeWatcher, idle 자동 조치, 팀 관리 UI | 1단계 | TC-A* |
| **8단계: 통합 QA + Hook 전환** | Day 8~10 | E2E 테스트, settings.local.json 최종 전환, Gap 분석 | 전체 | integration/* |

---

## 11. 검증 체크리스트

### 핵심 (10건 문제 해결 검증)

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

- [ ] `dashboard/` 앱이 `npm run dev`로 localhost:3200 구동
- [ ] SQLite DB 자동 생성 + 스키마 마이그레이션
- [ ] WebSocket 실시간 이벤트 전파
- [ ] 기존 bash hook에서 `curl localhost:3201/api/hooks/task-completed` 성공
- [ ] pdca-status.json 미러 동기화 (수정 hook 하위 호환)
- [ ] 전체 UI 한국어 (영어 라벨 0개)
- [ ] 기존 bscamp Next.js 앱 영향 없음
- [ ] `npm run build` 성공 (dashboard/ 내부)
- [ ] vitest 56건 전체 Green
- [ ] 대시보드 서버 다운 시 기존 시스템 100% 동작

---

## 12. 롤백 전략

| 장애 시나리오 | 롤백 방법 |
|-------------|-----------|
| DB 손상 | `dashboard/.data/bkit.db` 삭제 → 스키마 자동 재생성 + pdca-status.json에서 기본 복구 |
| 대시보드 서버 다운 | 유지 hook (12개) 단독 동작. 수정 hook은 pdca-status.json fallback 읽기 |
| WebSocket 끊김 | React Query staleTime 30초 폴링 폴백 |
| Hook 브릿지 실패 | `|| true` 가드로 기존 hook 차단 안 됨 |
| 전체 롤백 | 1) settings.local.json 원복 2) `dashboard/` 삭제. 기존 시스템 무관 동작 |

**핵심 원칙**: 대시보드가 죽어도 기존 에이전트팀 운영은 100% 유지. 대시보드는 강화 레이어.

---

## 13. 참고 문서

- Paperclip GitHub: https://github.com/paperclipai/paperclip (MIT)
- Paperclip 서비스 분석: server/src/services/ (79개, 핵심 6개 차용)
- Paperclip UI 분석: ui/src/pages/ (47개, 핵심 5개 차용) + ui/src/components/ (145개, 22개 차용)
- Plan 문서: `docs/01-plan/features/paperclip-dashboard-adoption.plan.md`
- v1 설계서: `docs/02-design/features/paperclip-bkit-integration.design.md`
- 기존 hook 체인: `.bkit/hooks/pdca-chain-handoff.sh` (v5, 357줄)
- 현재 PDCA 상태: `.bkit/state/pdca-status.json` (v3.0)
- Postmortem 인덱스: `docs/postmortem/index.json` (6건)
- ADR: `docs/adr/ADR-001-account-ownership.md`, `ADR-002-service-context.md`
