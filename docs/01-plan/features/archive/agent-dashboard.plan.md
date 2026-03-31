# Agent Dashboard (에이전트 대시보드) — 기획서

> 작성일: 2026-03-31
> 작성자: PM팀
> 레벨: L2 (src/ 미수정, dashboard/ 별도 앱)
> 참고: Paperclip 오픈소스, 기존 dashboard/ 코드베이스

---

## 1. 개요

### 1.1 목적
Smith님(CEO)이 에이전트팀(MOZZI + CTO/PM/MKT 팀)의 작업 현황을 **한눈에** 파악할 수 있는 운영 대시보드.

### 1.2 핵심 가치
- **실시간 가시성**: 누가 뭘 하고 있는지 즉시 확인
- **PDCA 추적**: 기획→설계→구현→검증→개선 단계별 진행 상황
- **비용 통제**: 에이전트별 토큰/비용 실시간 모니터링
- **자율 운영**: 체인 자동화 상태를 시각적으로 확인

### 1.3 사용자
| 사용자 | 빈도 | 핵심 니즈 |
|--------|------|-----------|
| Smith님 | 수시 | "지금 뭐 돌아가고 있지?", "비용 얼마 쓰고 있지?" |
| 모찌(COO) | 상시 | 팀간 조율, 체인 진행 확인 |
| 팀 리더 | 작업중 | 팀원 상태, 태스크 할당 확인 |

---

## 2. 기존 시스템 현황

### 2.1 이미 구현된 것 (재활용)

| 구성요소 | 상태 | 위치 |
|----------|------|------|
| Express 서버 (port 3201) | 완료 | `dashboard/server/` |
| SQLite + Drizzle ORM (13테이블) | 완료 | `dashboard/server/db/schema.ts` |
| AgentPoller (10초 tmux 폴링) | 완료 | `dashboard/server/services/agent-poller.ts` |
| EventBus (28 이벤트 타입) | 완료 | `dashboard/server/event-bus.ts` |
| WebSocket 브로드캐스터 | 완료 | `dashboard/server/realtime/ws.ts` |
| Hook Bridge (4 엔드포인트) | 완료 | `dashboard/server/routes/hooks.ts` |
| React 앱 (Vite + React 19) | 완료 | `dashboard/src/` |
| React Query 데이터 페칭 | 완료 | `dashboard/src/hooks/useApi.ts` |
| 기본 UI 8페이지 | 완료 | `dashboard/src/pages/` |

### 2.2 기존 페이지 현황

| 페이지 | 라우트 | 상태 | 비고 |
|--------|--------|------|------|
| 대시보드 | `/` | ✅ 구현됨 | 메트릭 4개 + 에이전트 테이블 + 알림 |
| 조직도 | `/org` | ✅ 구현됨 | SVG 캔버스, 줌/팬, 상태 dot |
| 태스크 | `/tickets` | ✅ 구현됨 | 리스트 뷰, 상태/팀 필터 |
| 체인 | `/chains` | ✅ 구현됨 | 체인 카드 + PDCA 단계 흐름 |
| 비용 | `/costs` | ✅ 구현됨 | 요약/모델별/에이전트별 |
| 활동 | `/activity` | ✅ 구현됨 | 이벤트 피드 |
| 에이전트 | `/agents` | ✅ 구현됨 | 에이전트 리스트 |
| 루틴 | `/routines` | ✅ 구현됨 | 반복 작업 관리 |

### 2.3 기존 API 엔드포인트

| 메서드 | 경로 | 용도 |
|--------|------|------|
| GET | `/api/dashboard/summary` | 대시보드 요약 통계 |
| GET | `/api/agents` | 에이전트 전체 목록 |
| GET | `/api/agents/tree` | 조직도 트리 |
| POST | `/api/agents` | 에이전트 등록 |
| PATCH | `/api/agents/:id/status` | 상태 변경 |
| POST | `/api/agents/sync` | 런타임 동기화 |
| GET | `/api/tickets` | 태스크 목록 (필터 지원) |
| GET | `/api/chains` | 체인 목록 |
| GET | `/api/costs/summary` | 비용 요약 |
| GET | `/api/costs/by-agent` | 에이전트별 비용 |
| GET | `/api/costs/by-model` | 모델별 비용 |
| GET | `/api/costs/window` | 윈도우별 지출 |
| GET | `/api/budgets/policies` | 예산 정책 |
| GET | `/api/budgets/incidents` | 예산 초과 이력 |
| GET | `/api/notifications` | 알림 목록 |
| POST | `/api/hooks/task-completed` | 태스크 완료 훅 |
| POST | `/api/hooks/sync-pdca` | PDCA 상태 동기화 |
| POST | `/api/hooks/chain-handoff` | 체인 핸드오프 |
| POST | `/api/hooks/commit` | 커밋 기록 |

### 2.4 DB 스키마 (13테이블)

| 테이블 | 용도 | 핵심 컬럼 |
|--------|------|-----------|
| `tickets` | PDCA 태스크 | status, pdcaPhase, processLevel, matchRate, chainId |
| `agents` | 에이전트 레지스트리 | role, team, status, reportsTo, tmuxSession |
| `heartbeat_runs` | 실행 기록 | agentId, status, inputTokens, outputTokens |
| `cost_events` | 비용 이벤트 (불변) | agentId, model, costCents |
| `budget_policies` | 예산 정책 | scopeType, amountCents, hardStop |
| `budget_incidents` | 예산 초과 | policyId, kind(warn/hard_stop) |
| `workflow_chains` | 워크플로 체인 | name, active |
| `workflow_steps` | 체인 단계 | chainId, stepOrder, phase, teamRole |
| `events` | 이벤트 로그 (불변) | eventType, actor, targetType |
| `pdca_features` | PDCA 피처 상태 | phase, planDone~actDone, matchRate |
| `notifications` | 알림 | type, title, read |
| `routines` | 반복 작업 | cronExpression, enabled |
| `knowledge_entries` | 학습 데이터 | agentId, category, content |

---

## 3. 6대 필수 기능 상세

### 3.1 조직도 (Org Chart) — P0

**목적**: 에이전트 팀 구조와 실시간 상태 파악

**데이터 소스**: `agents` 테이블 (reportsTo 계층), AgentPoller 10초 폴링

**현재 상태**: ✅ 이미 구현됨 (`OrgChartPage.tsx`)
- SVG 캔버스 + 줌/팬/맞춤
- Smith → 모찌(COO) → 리더들 → 팀원 트리 구조
- 상태 dot: running=#F75D5D, idle=gray, paused=yellow, error=red, terminated=light-gray
- 카드: 160x80px, 아이콘+이름+역할+상태

**개선 필요 사항**:
- 카드 클릭 → 에이전트 상세 패널 (사이드 드로어)
  - 현재 작업 태스크
  - 최근 heartbeat_runs (실행 기록)
  - 토큰 사용량/비용
  - tmux 세션 정보
- 에이전트 상태 변경 시 카드 테두리 애니메이션 (깜빡임)
- 연결선에 데이터 흐름 방향 화살표

**API**: 기존 `GET /api/agents`, `GET /api/agents/tree` 활용
**추가 API**: `GET /api/agents/:id/detail` — 에이전트 상세 (runs, costs 포함)

**폴링 주기**: 10초 (기존 AgentPoller와 동일)

**Paperclip 참고**: OrgChart.tsx의 SVG 캔버스, 줌/팬 → 이미 적용됨
**우리만의 차별점**: tmux 기반 상태 감지, PDCA 역할 구분

---

### 3.2 체인 현황 (Chain Status) — P0 ★ 우리만의 기능

**목적**: PDCA 워크플로 체인의 실시간 진행 상태를 시각적으로 표시

**데이터 소스**:
- `pdca_features` 테이블 (phase, planDone~actDone, matchRate)
- `workflow_chains` + `workflow_steps` 테이블
- `.bkit/state/pdca-status.json` (파일 기반 상태)

**현재 상태**: 부분 구현 (`ChainsPage.tsx`)
- 체인 카드 + PDCA 단계 흐름 (plan→design→do→check→act→deploy)
- 단계별 색상 구분

**개선 필요 사항 — 체인 매트릭스 뷰**:

#### 체인 게이트 시각화 (Smith님 확정 구조)
```
┌─────────────────────────────────────────────────────┐
│ 처방전 기능 (DEV-L2)                                 │
│                                                      │
│ PLAN ──→ DESIGN ──→ DEV ──→ COMMIT ──→ DEPLOY      │
│  ✅        ✅       🔄       ⬜        ⬜           │
│                   Match: 72%                         │
│                   목표: 95%                          │
└─────────────────────────────────────────────────────┘
```

각 게이트 상태:
- ✅ 완료 (done: true)
- 🔄 진행중 (current)
- ⬜ 대기
- ❌ 실패/차단

**핵심 아키텍처: 크론 기반 게이트 판정**

> 완료 판단은 에이전트가 하지 않는다. **크론이 5분마다** 문서 존재+내용 체크 → 게이트 통과 → 다음 단계 자동 트리거.
> 에이전트는 문서(plan.md, design.md, analysis.md 등)만 작성하면 끝.
> 대시보드는 크론이 갱신한 게이트 상태를 읽어서 표시한다.

**게이트 판정 흐름**:
```
에이전트 → 문서 작성 (plan.md, design.md 등)
                ↓
크론 (5분 간격) → 문서 존재 확인 + 내용 검증
                ↓
게이트 통과 → pdca_features 테이블 업데이트 + 다음 단계 자동 트리거
                ↓
대시보드 → pdca_features 테이블 읽기 → UI 표시
```

**게이트 판정 기준** (크론이 체크):
| 게이트 | 판정 조건 | 검증 방법 |
|--------|-----------|-----------|
| Plan | plan.md 파일 존재 + 비어있지 않음 | 파일 존재 + 최소 10줄 이상 |
| Design | design.md 파일 존재 + 비어있지 않음 | 파일 존재 + 최소 10줄 이상 |
| Dev | tsc + build 성공 + Match Rate ≥ 임계값 | build 결과 + gap-analysis.md |
| Commit | git commit hash 존재 | tickets.commitHash not null |
| Deploy | 배포 URL 존재 + health check 통과 | HTTP 200 확인 |

**게이트 JSON 구조** (Smith님 확정):
```json
{
  "task": "처방전 기능",
  "type": "DEV-L2",
  "gates": {
    "plan": { "file": "docs/plans/xxx.plan.md", "done": true, "checkedAt": "2026-03-31T10:05:00Z" },
    "design": { "file": "docs/designs/xxx.design.md", "done": true, "checkedAt": "2026-03-31T10:10:00Z" },
    "dev": { "matchRate": 72, "threshold": 95, "done": false, "checkedAt": "2026-03-31T10:15:00Z" },
    "commit": { "hash": null, "done": false },
    "deploy": { "url": null, "status": null, "done": false }
  },
  "current": "dev",
  "lastCronCheck": "2026-03-31T10:15:00Z"
}
```

**매트릭스 뷰** (복수 체인 동시 표시):

| 기능명 | 유형 | Plan | Design | Dev | Commit | Deploy |
|--------|------|------|--------|-----|--------|--------|
| 처방전 기능 | DEV-L2 | ✅ | ✅ | 72% | ⬜ | ⬜ |
| 에이전트 대시보드 | DEV-L2 | ✅ | 🔄 | ⬜ | ⬜ | ⬜ |
| 마케팅 보고서 | MKT-L1 | ✅ | - | ✅ | ✅ | ⬜ |

**API**:
- 기존: `GET /api/chains`
- 추가: `GET /api/pdca/features` — pdca_features 테이블 전체 조회 (크론이 갱신한 상태)
- 추가: `GET /api/pdca/features/:id/gates` — 게이트 상세 (크론 판정 결과 + 마지막 체크 시각)

**데이터 흐름**: 크론(5분) → pdca_features 테이블 갱신 → 대시보드(10초 폴링) → UI 표시

**폴링 주기**: 10초 (대시보드 → DB 읽기)
**크론 주기**: 5분 (크론 → 문서 체크 → DB 갱신)

**Paperclip에 없는 기능**: 크론 기반 게이트 자동 판정 + PDCA 게이트 시각화는 100% 자체 구현

---

### 3.3 태스크 보드 (Task Board) — P0

**목적**: 전체 태스크의 상태별 관리 + PDCA 단계 연동

**데이터 소스**: `tickets` 테이블

**현재 상태**: 부분 구현 (`TicketsPage.tsx`)
- 리스트 뷰: 상태 필터(전체/진행중/완료/대기/할일/검토중) + 팀 필터 + 검색
- 카드: StatusBadge(상태/우선순위/PDCA단계) + 체크리스트 진행바 + 커밋 해시

**개선 필요 사항**:

#### 3.3.1 칸반 뷰 추가 (리스트↔칸반 토글)
```
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│  대기    │ │ 진행중   │ │ 검토중   │ │  완료    │
│ ─────── │ │ ─────── │ │ ─────── │ │ ─────── │
│ [카드]   │ │ [카드]   │ │ [카드]   │ │ [카드]   │
│ [카드]   │ │ [카드]   │ │         │ │ [카드]   │
│          │ │         │ │         │ │ [카드]   │
└─────────┘ └─────────┘ └─────────┘ └─────────┘
```

#### 3.3.2 추가 필터
- 프로세스 레벨별 (L0~L3)
- PDCA 단계별 (plan/design/do/check/act)
- 우선순위별

#### 3.3.3 태스크 상세 드로어
- 카드 클릭 → 사이드 패널 오픈
- 상세 정보: 설명, 체크리스트, 연관 체인, 커밋 이력
- PDCA 게이트 진행 상태

**API**: 기존 `GET /api/tickets` 활용 (이미 필터 지원)
**추가 API**: `GET /api/tickets/:id` — 태스크 상세

**Paperclip 참고**: Issues 칸반보드(@dnd-kit 드래그앤드롭)
**차이점**: 드래그앤드롭은 P2로 후순위. 읽기 전용 칸반 먼저.

---

### 3.4 완료 아카이빙 (Archive) — P1

**목적**: 완료된 태스크 기록 보관 + 검색 + 통계

**데이터 소스**: `tickets` 테이블 (status = 'completed' | 'cancelled')

**UI 와이어프레임**:
```
┌──────────────────────────────────────────────────┐
│ 완료 아카이브                                     │
│                                                   │
│ [날짜범위 선택] [팀 필터 ▼] [유형 ▼] [검색...]    │
│                                                   │
│ ┌─ 통계 요약 ────────────────────────────────────┐│
│ │ 전체 42건 | CTO팀 28건 | PM팀 10건 | MKT 4건  ││
│ │ 평균 소요 2.3일 | 이번 주 12건 완료            ││
│ └─────────────────────────────────────────────────┘│
│                                                   │
│ [완료 태스크 리스트 — 날짜 역순]                   │
│  ✅ 체인 자동화 TDD | CTO-1 | 2026-03-30 | abc123│
│  ✅ 경쟁사분석 v2  | CTO-1  | 2026-03-29 | def456│
│  ...                                              │
└──────────────────────────────────────────────────┘
```

**API**:
- 기존 `GET /api/tickets?status=completed` 활용
- 추가: `GET /api/tickets/stats` — 팀별/기간별 완료 통계

**폴링 주기**: 30초 (아카이브는 실시간 불필요)

---

### 3.5 에이전트 로그 (Agent Logs) — P1

**목적**: 에이전트별 실행 히스토리 + 최근 활동 조회

**데이터 소스**:
- `heartbeat_runs` 테이블 (실행 기록)
- `events` 테이블 (이벤트 로그)
- AgentPoller 수집 데이터

**현재 상태**: 부분 구현
- `AgentsPage.tsx`: 에이전트 리스트
- `ActivityPage.tsx`: 전체 이벤트 피드

**개선 필요 사항**:

#### 에이전트별 상세 로그 뷰
```
┌──────────────────────────────────────────────────┐
│ 에이전트: CTO_LEADER                              │
│ 상태: 실행중 | 모델: claude-opus-4-6              │
│ tmux: bscamp-cto | 마지막 활동: 30초 전           │
│                                                   │
│ ┌─ 실행 기록 ────────────────────────────────────┐│
│ │ #1  실행중   10:30~ | 입력 12K, 출력 3.2K      ││
│ │ #2  완료     09:15~09:45 | 입력 45K, 출력 8K   ││
│ │ #3  완료     08:00~08:30 | 입력 32K, 출력 6K   ││
│ └─────────────────────────────────────────────────┘│
│                                                   │
│ ┌─ 최근 이벤트 ──────────────────────────────────┐│
│ │ 10:31  태스크 #12 시작                          ││
│ │ 10:30  커밋 abc1234 (3파일)                     ││
│ │ 09:45  태스크 #11 완료 (Match 97%)              ││
│ └─────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

**API**:
- 기존: `GET /api/agents`
- 추가: `GET /api/agents/:id/runs` — 에이전트별 실행 기록
- 추가: `GET /api/agents/:id/events` — 에이전트별 이벤트

**Paperclip 참고**: RunTranscriptView의 토큰/비용 표시
**차이점**: tmux 세션 기반 (Paperclip은 adapter 기반)

---

### 3.6 비용 추적 (Cost Tracking) — P1

**목적**: 에이전트별 토큰 사용량 + 비용 모니터링 + 예산 관리

**데이터 소스**:
- `cost_events` 테이블 (불변, 추가 전용)
- `budget_policies` 테이블
- `budget_incidents` 테이블

**현재 상태**: 부분 구현 (`CostsPage.tsx`)
- 비용 요약, 모델별, 에이전트별 탭

**개선 필요 사항 — 3탭 구조** (Paperclip 5탭에서 축소):

#### 탭 1: 개요 (Overview)
- 총 비용 + 일일/주간/월간 추이 차트
- 에이전트별 비용 비교 바 차트
- 모델별 비용 파이 차트

#### 탭 2: 예산 (Budgets)
- 예산 정책 목록 (global/agent/team)
- 사용률 진행바 (80% 경고, 100% 차단)
- 예산 초과 인시던트 이력

#### 탭 3: 상세 (Details)
- 비용 이벤트 로그 (시간순)
- 필터: 에이전트/모델/날짜 범위

**API**: 기존 API 전부 활용
- `GET /api/costs/summary`
- `GET /api/costs/by-agent`
- `GET /api/costs/by-model`
- `GET /api/costs/window`
- `GET /api/budgets/policies`
- `GET /api/budgets/incidents`

**추가 API**: `GET /api/costs/daily-trend` — 일별 비용 추이 (차트용)

**폴링 주기**: 30초

**Paperclip 참고**: Costs 5탭(Overview/Budgets/Providers/Billers/Finance) → 3탭으로 축소
**차이점**: 단일 테넌트, Provider는 Anthropic만, Billers 불필요

---

## 4. 기술 아키텍처

### 4.1 프론트엔드 스택
| 기술 | 용도 | 비고 |
|------|------|------|
| Vite | 빌드 | 기존 설정 유지 |
| React 19 | UI 프레임워크 | 기존 |
| React Router | 라우팅 | 기존 8개 라우트 |
| @tanstack/react-query | 서버 상태 | 기존, 전체 사용 |
| Tailwind CSS | 스타일링 | 기존 |
| Lucide React | 아이콘 | 기존 |
| Recharts | 차트 | **신규 추가** — 비용 추이, 통계 차트 |

### 4.2 백엔드 (기존 유지 + 확장)
| 기술 | 용도 |
|------|------|
| Express | HTTP 서버 (port 3201) |
| SQLite + Drizzle ORM | 데이터 저장 |
| WebSocket | 실시간 푸시 |
| AgentPoller | tmux 상태 감지 (10초) |
| EventBus | 내부 이벤트 (28타입) |

### 4.3 크론 기반 게이트 판정 시스템

> **핵심 원칙**: 에이전트는 문서만 쓴다. 완료 판단은 크론이 한다.

```
[에이전트]                    [크론 (5분)]                   [대시보드 (10초)]
    │                             │                              │
    │  문서 작성                   │                              │
    │  (plan.md,                  │                              │
    │   design.md 등)             │                              │
    │                             │                              │
    │                        문서 존재 확인                       │
    │                        내용 검증                           │
    │                        게이트 판정                          │
    │                             │                              │
    │                        pdca_features                       │
    │                        테이블 갱신                          │
    │                             │                              │
    │                        다음 단계                           │
    │                        자동 트리거                          │
    │                             │                              │
    │                             │                   pdca_features 읽기
    │                             │                   UI 표시
```

**크론 동작 명세**:
1. 5분마다 `pdca_features` 테이블의 미완료 피처 목록 조회
2. 각 피처의 현재 단계(current phase)에 해당하는 문서 경로 확인
3. 문서 존재 + 내용 유효성 검증 (최소 줄 수, 필수 섹션 등)
4. 검증 통과 시 → 해당 게이트 `done=true` + `checkedAt` 기록
5. 다음 단계 자동 트리거 (pdca_features.phase 업데이트)
6. 대시보드는 DB 상태만 읽으므로 크론과 완전 분리됨

**대시보드 역할**: 크론이 갱신한 pdca_features 테이블을 **읽기 전용**으로 표시
**대시보드가 하지 않는 것**: 게이트 통과 판정, 문서 유효성 검증, 단계 전환

### 4.4 추가 필요 API 엔드포인트 (요약)

| 메서드 | 경로 | 용도 | 우선순위 |
|--------|------|------|----------|
| GET | `/api/agents/:id/detail` | 에이전트 상세 (runs+costs) | P0 |
| GET | `/api/agents/:id/runs` | 에이전트별 실행 기록 | P1 |
| GET | `/api/agents/:id/events` | 에이전트별 이벤트 | P1 |
| GET | `/api/pdca/features` | PDCA 피처 전체 목록 | P0 |
| GET | `/api/pdca/features/:id/gates` | 게이트 상세 | P0 |
| GET | `/api/tickets/:id` | 태스크 상세 | P0 |
| GET | `/api/tickets/stats` | 완료 통계 | P1 |
| GET | `/api/costs/daily-trend` | 일별 비용 추이 | P1 |

### 4.5 폴링 전략

| 데이터 | 주기 | 방식 |
|--------|------|------|
| 에이전트 상태 | 10초 | React Query refetchInterval + WS push |
| 태스크 상태 | 10초 | React Query refetchInterval |
| PDCA 게이트 | 10초 | React Query refetchInterval |
| 비용 | 30초 | React Query refetchInterval |
| 아카이브 | 30초 | React Query refetchInterval |
| 알림 | 5초 (unread count) | React Query refetchInterval |

---

## 5. 디자인 시스템 (기존 준수)

| 항목 | 값 |
|------|------|
| Primary | `#F75D5D` |
| Primary Hover | `#E54949` |
| 폰트 | Pretendard |
| 배경 | 흰색 (#FFFFFF) |
| 카드 배경 | 흰색, border: gray-200, rounded-xl, shadow-sm |
| 모드 | 라이트 모드만 |
| UI 언어 | 한국어 |
| 참고 스타일 | Triple Whale |

### 상태 색상 체계
| 상태 | 색상 | 용도 |
|------|------|------|
| running/실행중 | `#F75D5D` (Primary) | 에이전트 실행, 진행중 태스크 |
| idle/대기 | `#d1d5db` (gray-300) | 에이전트 대기 |
| paused/일시정지 | `#fbbf24` (amber-400) | 에이전트 일시정지 |
| error/오류 | `#ef4444` (red-500) | 에이전트 에러, 실패 |
| completed/완료 | `#10b981` (emerald-500) | 완료 |
| terminated/종료 | `#e5e7eb` (gray-200) | 에이전트 종료 |

---

## 6. 구현 우선순위

### P0 — 핵심 (1차 스프린트)
1. **체인 매트릭스 뷰 강화** — 게이트 시각화 (ChainsPage 개선)
2. **조직도 에이전트 상세 패널** — 카드 클릭 드로어 (OrgChartPage 개선)
3. **태스크 칸반 뷰** — 리스트↔칸반 토글 (TicketsPage 개선)
4. **PDCA 피처 API** — pdca_features 테이블 조회 + 게이트 API
5. **태스크 상세 API** — tickets/:id 상세 정보

### P1 — 확장 (2차 스프린트)
6. **완료 아카이빙 페이지** — 신규 페이지 (ArchivePage)
7. **에이전트 상세 로그 뷰** — AgentsPage 개선 또는 별도 페이지
8. **비용 차트** — Recharts 도입, 추이 차트, 예산 진행바
9. **비용 일별 추이 API**
10. **완료 통계 API**

### P2 — 고도화 (향후)
11. 칸반 드래그앤드롭 (@dnd-kit)
12. 에이전트 상태 변경 애니메이션
13. 알림 센터 (벨 아이콘 + 드로어)
14. 키보드 단축키

---

## 7. Paperclip vs 자체 구현 비교

| 기능 | Paperclip | 우리 | 비고 |
|------|-----------|------|------|
| 조직도 | SVG 캔버스 + 줌/팬 | ✅ 이미 적용 | 동일 패턴 |
| 에이전트 폴링 | adapter 기반 | tmux 폴링 (10초) | 자체 방식 |
| 태스크 | Issues 칸반 + DnD | 칸반 뷰 (읽기 전용 먼저) | DnD는 P2 |
| 체인 | 없음 | ★ PDCA 게이트 매트릭스 | 100% 자체 |
| 비용 | 5탭 구조 | 3탭 축소 | 단일 Provider |
| 실시간 | 3~15초 폴링 | 10초 폴링 + WebSocket | WS는 bonus |
| 인증 | JWT multi-tenant | 없음 (로컬) | 단일 테넌트 |
| 루틴 | Routines 테이블 | ✅ 이미 구현 | 동일 |
| 학습 | 없음 | knowledge_entries | 자체 |

---

## 8. 라우트 구조 (최종)

```
/ .................. DashboardPage (기존)
/org ............... OrgChartPage (기존 + 상세 패널)
/tickets ........... TicketsPage (기존 + 칸반 뷰)
/chains ............ ChainsPage (기존 + 매트릭스 뷰)
/costs ............. CostsPage (기존 + 차트)
/activity .......... ActivityPage (기존)
/agents ............ AgentsPage (기존 + 상세 로그)
/routines .......... RoutinesPage (기존)
/archive ........... ArchivePage (신규)
```

---

## 9. 파일 구조 (예상)

```
dashboard/
├── src/
│   ├── pages/
│   │   ├── ArchivePage.tsx          # 신규
│   │   └── (기존 8개 페이지 개선)
│   ├── components/
│   │   ├── AgentDetailDrawer.tsx    # 신규 — 에이전트 상세 사이드 패널
│   │   ├── TicketDetailDrawer.tsx   # 신규 — 태스크 상세 사이드 패널
│   │   ├── KanbanBoard.tsx          # 신규 — 칸반 보드
│   │   ├── KanbanColumn.tsx         # 신규 — 칸반 컬럼
│   │   ├── GateProgress.tsx         # 신규 — PDCA 게이트 진행바
│   │   ├── ChainMatrix.tsx          # 신규 — 체인 매트릭스 뷰
│   │   ├── CostChart.tsx            # 신규 — 비용 차트
│   │   └── (기존 컴포넌트)
│   ├── hooks/
│   │   ├── useApi.ts                # 기존 + 신규 훅 추가
│   │   └── useLiveUpdates.ts        # 기존
│   └── lib/
│       ├── utils.ts                 # 기존
│       └── queryKeys.ts             # 기존
├── server/
│   ├── routes/
│   │   ├── pdca.ts                  # 기존 + 확장
│   │   └── (기존 라우트)
│   ├── services/
│   │   └── (기존 서비스)
│   └── db/
│       └── schema.ts                # 기존 (스키마 변경 없음)
```

---

## 10. 목업

**브라우저 목업**: `docs/mockups/dashboard.html` — 전체 6대 기능 시각화

---

## 11. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 초기 로딩 | < 2초 |
| 폴링 부하 | SQLite read-only, 10~30초 간격 |
| 브라우저 지원 | Chrome 최신 (Smith님 환경) |
| 모바일 | 미지원 (데스크톱 전용) |
| 접근성 | 기본 수준 (tab, aria-label) |

---

## 12. 리스크 & 의존성

| 리스크 | 대응 |
|--------|------|
| pdca_features 테이블 데이터 부족 | Hook Bridge sync-pdca로 데이터 유입 보장 |
| cost_events 데이터 없음 | cost-collector 서비스가 Claude API 사용량 수집 |
| Recharts 번들 크기 | tree-shaking 활용, 필요한 차트만 import |
| SQLite 동시 접근 | WAL 모드 이미 설정됨, read-only 쿼리는 안전 |

---

_끝._
