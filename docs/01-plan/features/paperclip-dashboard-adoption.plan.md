# Paperclip 대시보드 차용 설계 Plan

> 작성일: 2026-03-30 | PDCA Level: L2 | 상태: Plan

## Executive Summary

| 항목 | 내용 |
|------|------|
| Feature | Paperclip Dashboard Adoption (Paperclip 대시보드 차용) |
| 작성일 | 2026-03-30 |
| 예상 기간 | 5~7일 |

| 관점 | 내용 |
|------|------|
| Problem | 현재 bkit 대시보드(localhost:3847)는 텍스트 기반이라 시각적 모니터링 한계, 비용 추적 없음, 팀 구조 비가시적, 워크플로 체인 편집 불가 |
| Solution | Paperclip(MIT) 오픈소스에서 대시보드/비용추적/OrgChart/워크플로 컴포넌트를 선별 차용하여 OpenClaw 게이트웨이에 연결 |
| Function UX Effect | Smith님이 코드 없이 에이전트 현황 파악, 비용 관리, 체인 편집 가능 |
| Core Value | 에이전트팀 운영 가시성 + 비용 통제 + 워크플로 자율 편집 |

---

## 1. Paperclip 프로젝트 분석

### 1.1 개요
- **저장소**: https://github.com/paperclipai/paperclip
- **라이선스**: MIT (상업적 사용, 수정, 배포 자유)
- **별**: ~40K | **포크**: ~5.9K
- **한 줄 요약**: "OpenClaw이 직원이라면 Paperclip은 회사" — AI 에이전트 조직 운영 플랫폼

### 1.2 기술 스택

| 영역 | 기술 | 비고 |
|------|------|------|
| 프론트엔드 | React 19 + TypeScript + Vite | Tailwind CSS, shadcn UI |
| 백엔드 | Node.js + Express | Drizzle ORM + PostgreSQL |
| 실시간 | WebSocket (`ws`) | 회사 범위 구독 |
| 인증 | better-auth + JWT | 에이전트별 JWT |
| 패키지 관리 | pnpm 모노레포 | pnpm-workspace.yaml |
| 차트 | Recharts | 활동 차트, 비용 그래프 |

### 1.3 모노레포 구조

```
paperclip/
├── ui/                          ← React 프론트엔드 (Vite)
│   ├── src/pages/               ← 47개 페이지 컴포넌트
│   ├── src/components/          ← 145개+ UI 컴포넌트
│   ├── src/context/             ← 8개 Context Provider
│   ├── src/api/                 ← 19개 API 클라이언트 모듈
│   ├── src/hooks/               ← 7개 커스텀 훅
│   └── src/lib/                 ← 25개+ 유틸리티
├── server/                      ← Express 백엔드
│   ├── src/services/            ← 79개 서비스 (heartbeat 135KB 최대)
│   ├── src/routes/              ← 24개 라우트 핸들러
│   ├── src/middleware/          ← 인증/로깅/에러처리
│   └── src/realtime/            ← WebSocket 실시간
├── packages/
│   ├── adapters/
│   │   └── openclaw-gateway/    ← OpenClaw 어댑터 (우리 게이트웨이)
│   ├── db/                      ← Drizzle ORM 스키마
│   ├── shared/                  ← 27개 공유 타입 정의
│   └── plugins/                 ← 플러그인 SDK
├── cli/                         ← CLI 도구
└── docker/                      ← 컨테이너화
```

### 1.4 OpenClaw 게이트웨이 어댑터

```
packages/adapters/openclaw-gateway/
├── src/
│   ├── server/
│   │   ├── execute.ts          ← 핵심 실행 로직 (47.8KB)
│   │   ├── index.ts            ← 진입점
│   │   └── test.ts             ← 테스트
│   ├── ui/
│   │   ├── build-config.ts     ← 빌드 설정
│   │   ├── index.ts            ← UI 진입점
│   │   └── parse-stdout.ts     ← stdout 파싱
│   ├── cli/
│   │   ├── format-event.ts     ← 이벤트 포매팅
│   │   └── index.ts            ← CLI 진입점
│   └── shared/
│       └── stream.ts           ← 스트림 유틸리티
```

**역할**: OpenClaw 프로세스의 stdout/stderr를 파싱하여 Paperclip 이벤트 모델로 변환. 우리 tmux 기반 에이전트팀과 직접 연결 가능.

---

## 2. 차용 대상 4개 상세 분석

### 2.1 React 대시보드 — 에이전트 상태/태스크/비용 모니터링

**차용할 컴포넌트:**

| Paperclip 컴포넌트 | 크기 | 역할 | 우리 용도 |
|-------------------|------|------|-----------|
| `Dashboard.tsx` (페이지) | — | 메인 허브 | 에이전트팀 현황 메인 |
| `ActiveAgentsPanel.tsx` | 5.7KB | 실시간 에이전트 그리드 | CTO/PM/팀원 상태 표시 |
| `AgentRunCard.tsx` | — | 에이전트 실행 카드 | 개별 팀원 작업 상태 |
| `MetricCard.tsx` | 1.5KB | 지표 타일 | TASK 진행률, 비용 요약 |
| `ActivityCharts.tsx` | 10KB | 14일 스택 바 차트 | 일별 작업량 시각화 |
| `ActivityRow.tsx` | 5.3KB | 활동 항목 | 작업 로그 타임라인 |
| `StatusIcon.tsx` / `StatusBadge.tsx` | — | 상태 표시기 | 에이전트 상태(실행/대기/에러) |
| `Layout.tsx` | — | 메인 레이아웃 | 전체 대시보드 프레임 |
| `Sidebar.tsx` + `SidebarAgents.tsx` | — | 사이드바 | 에이전트 목록 네비게이션 |

**차용할 Context/훅:**

| 이름 | 크기 | 역할 |
|------|------|------|
| `LiveUpdatesProvider.tsx` | 26.6KB | WebSocket 실시간 업데이트 |
| `SidebarContext.tsx` | — | 사이드바 상태 |
| `ToastContext.tsx` | 4.3KB | 알림 토스트 |

**차용할 API 클라이언트:**

| 이름 | 크기 | 역할 |
|------|------|------|
| `client.ts` | — | 베이스 HTTP 클라이언트 |
| `agents.ts` | 8KB | 에이전트 CRUD + 상태 |
| `heartbeats.ts` | — | 실행 모니터링 |
| `dashboard.ts` | — | 대시보드 요약 |

**실시간 데이터 흐름:**
```
OpenClaw 에이전트 (tmux)
  → openclaw-gateway 어댑터 (stdout 파싱)
  → Paperclip 서버 (heartbeat 서비스)
  → WebSocket (live-events-ws.ts)
  → LiveUpdatesProvider (React Context)
  → ActiveAgentsPanel / AgentRunCard (UI 렌더)
```

### 2.2 비용 추적 — 토큰 사용량 + 예산 한도 + 자동 중지

**Paperclip 비용 시스템 구조:**

```
비용 이벤트 발생 (에이전트 API 호출 시)
  → CostEvent 기록 (costEvents 테이블)
  → 예산 평가 (budgets 서비스, 31.7KB)
  → 소프트 한도 초과 → BudgetIncident (경고)
  → 하드 한도 초과 → 에이전트 자동 일시정지
```

**차용할 컴포넌트:**

| Paperclip 컴포넌트 | 크기 | 역할 | 우리 용도 |
|-------------------|------|------|-----------|
| `Costs.tsx` (페이지) | 49KB | 비용 대시보드 (5탭) | 비용 메인 페이지 |
| `BudgetPolicyCard.tsx` | 9.2KB | 예산 정책 표시/편집 + 진행바 | 월간 예산 설정 |
| `BudgetIncidentCard.tsx` | 4KB | 예산 초과 경고 | 한도 초과 알림 |
| `BillerSpendCard.tsx` | 5.7KB | 제공자별 지출 | Anthropic API 비용 |
| `ProviderQuotaCard.tsx` | 17.6KB | 쿼터 관리 | API 한도 모니터링 |
| `QuotaBar.tsx` | 2KB | 쿼터 시각 진행바 | 예산 소진율 |
| `FinanceTimelineCard.tsx` | 3.2KB | 타임라인 | 비용 추이 |
| `AccountingModelCard.tsx` | 3.1KB | 모델별 비용 | Opus/Sonnet 모델 비교 |

**차용할 공유 타입 (packages/shared):**

```typescript
// 비용 추적 핵심 타입
CostEvent          // 개별 비용 기록
CostSummary        // 전체 지출 요약
CostByAgent        // 에이전트별 분석
CostByProviderModel // 제공자+모델 조합
CostWindowSpend    // 5시간/24시간/7일 롤링 윈도우

// 예산 관리 핵심 타입
Budget             // 월간/누적 예산 + 임계값
BudgetPolicy       // 소프트/하드 중지 정책
BudgetIncident     // 임계값 위반 이력
```

**차용할 서버 서비스:**

| 서비스 | 크기 | 역할 |
|--------|------|------|
| `costs.ts` | 16.6KB | 비용 집계 (월별, 에이전트별, 모델별) |
| `budgets.ts` | 31.7KB | 예산 정책, 소프트/하드 임계값, 자동 정지 |
| `finance.ts` | 5.4KB | 재무 이벤트 (지출/입금/추정) |

**예산 한도 메커니즘:**
1. **소프트 한도 (예: 80%)**: `BudgetIncident` 생성 → UI 경고 표시
2. **하드 한도 (100%)**: 에이전트 자동 일시정지 → `AgentActionButtons`로 수동 재개
3. **범위**: 전체 회사 / 에이전트별 / 프로젝트별 설정 가능
4. **윈도우**: 월간(UTC 기준) 또는 누적(lifetime)

### 2.3 Org Chart UI — 리더/팀원 구조 시각화

**차용할 컴포넌트:**

| Paperclip 컴포넌트 | 크기 | 역할 | 우리 용도 |
|-------------------|------|------|-----------|
| `OrgChart.tsx` (페이지) | — | 조직도 페이지 | 팀 구조 메인 |
| `org-chart-svg.ts` (서버 라우트) | 43KB | SVG 렌더링 엔진 | 조직도 이미지 생성 |

**Paperclip Org Chart 기능:**
- 트리 구조로 에이전트 계층 시각화
- `reports-to` 관계 표현
- 에이전트 역량/상태 표시
- 5가지 비주얼 테마: monochrome, nebula, circuit, warmth, schematic
- 20개 노드 초과 시 자동 접기
- PNG 내보내기 (1280×640px, 144 DPI)
- Twemoji 아이콘 내장

**우리 팀 구조에 맞춘 매핑:**
```
Smith님 (CEO)
├── 모찌 (COO)
│   ├── CTO팀 리더
│   │   ├── frontend-dev
│   │   ├── backend-dev
│   │   └── qa-engineer
│   ├── PM팀 리더
│   │   ├── pm-discovery
│   │   ├── pm-strategy
│   │   ├── pm-research
│   │   └── pm-prd
│   └── 마케팅팀 리더
│       └── marketing-dev
```

### 2.4 체인 편집 UI — 워크플로 편집기 (추가 요구사항)

**목표**: Smith님이 코드 없이 UI에서 PM→CTO→배포 같은 워크플로 체인을 편집

**Paperclip에서 차용할 기반:**

| Paperclip 기능 | 위치 | 차용 근거 |
|---------------|------|-----------|
| Task Routing / Delegation Flow | `issues.ts` 서비스 (65.4KB) | 태스크 할당/위임 로직 |
| Approval Workflows | `approvals.ts` 서비스 (9.6KB) | 승인 체인 구조 |
| Routines (스케줄 태스크) | `routines.ts` 서비스 (47.7KB) | 반복 워크플로 정의 |
| Goal Tree | `GoalTree.tsx` 컴포넌트 | 계층적 목표 시각화 |
| Org Chart 트리 구조 | `OrgChart.tsx` + `org-chart-svg.ts` | 노드-엣지 시각화 |

**우리가 만들 체인 편집기 설계:**

```
┌─────────────────────────────────────────────┐
│  워크플로 체인 편집기                          │
│                                             │
│  [PM팀] ──완료──→ [CTO팀] ──완료──→ [배포]    │
│    │                │                │      │
│  조건: Plan+Design  조건: Gap≥90%    조건: build │
│  담당: PM 리더      담당: CTO 리더    담당: CTO   │
│                                             │
│  [+ 단계 추가]  [순서 변경 ↑↓]  [조건 편집]   │
└─────────────────────────────────────────────┘
```

**핵심 데이터 모델:**
```typescript
interface WorkflowChain {
  id: string;
  name: string;                    // "기본 PDCA 체인"
  steps: WorkflowStep[];
}

interface WorkflowStep {
  id: string;
  order: number;                   // 실행 순서
  teamRole: "pm" | "cto" | "marketing";
  phase: "plan" | "design" | "do" | "check" | "deploy";
  completionCondition: string;     // "gap_rate >= 90" | "build_success"
  autoTriggerNext: boolean;        // true → 완료 시 다음 단계 자동 시작
  assignee: string;                // "cto_leader" | "pm_leader"
}
```

**Paperclip 기반 구현 전략:**
- `GoalTree.tsx`의 트리 렌더링 → 체인 스텝 시각화에 활용
- `approvals.ts`의 승인 체인 로직 → 단계 완료 조건 평가에 활용
- `routines.ts`의 스케줄 실행 → 자동 트리거 로직에 활용
- Drag & Drop: React DnD 또는 `@hello-pangea/dnd` 라이브러리 추가

---

## 3. 차용하지 않는 것 (명시적 제외)

| Paperclip 기능 | 제외 이유 | 우리 대안 |
|---------------|-----------|-----------|
| Ticket/Issue 시스템 (`issues.ts`, 65KB) | PDCA TASK 시스템 유지 | bkit PDCA |
| 에이전트 런타임 (`workspace-runtime.ts`) | OpenClaw + tmux 유지 | 현재 구조 |
| 세션 관리 (`agent-auth-jwt.ts`) | OpenClaw 세션 유지 | 현재 구조 |
| 인증 시스템 (`better-auth.ts`) | bscamp Firebase Auth 유지 | 현재 구조 |
| 플러그인 시스템 (4파일, 180KB+) | 과도한 복잡도 | 불필요 |
| 회사 이식성 (`company-portability.ts`, 165KB) | 멀티테넌시 불필요 | 단일 조직 |
| 시크릿 관리 (`secrets.ts`) | .env 기반 유지 | 현재 구조 |

---

## 4. 통합 아키텍처 설계

### 4.1 전체 구조

```
┌─────────────────────────────────────────────────────────┐
│  Paperclip 대시보드 (React + Vite)                       │
│  localhost:3200                                          │
│                                                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │
│  │ 대시보드  │ │ 비용추적  │ │ Org Chart │ │ 체인편집  │   │
│  │ 메인     │ │ 5탭      │ │ 트리     │ │ 워크플로  │   │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │
│       │            │            │            │          │
│       └────────────┴────────────┴────────────┘          │
│                        │                                │
│              LiveUpdatesProvider (WebSocket)             │
│                        │                                │
└────────────────────────┼────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │  Paperclip 서버      │
              │  localhost:3201      │
              │                     │
              │  비용 서비스          │
              │  예산 서비스          │
              │  대시보드 서비스       │
              │  Org Chart 서비스     │
              │  체인 서비스 (신규)    │
              │                     │
              │  OpenClaw 어댑터      │
              └──────────┬──────────┘
                         │
              ┌──────────┴──────────┐
              │  OpenClaw 에이전트    │
              │  (tmux pane 기반)    │
              │                     │
              │  CTO팀 / PM팀        │
              │  .bkit/runtime/      │
              └─────────────────────┘
```

### 4.2 OpenClaw 게이트웨이 연결 방식

**현재 우리 에이전트 정보 소스:**
- `.bkit/runtime/peer-map.json` — PID + 팀원 매핑
- `.bkit/runtime/state.json` — 대시보드 상태
- `.bkit/runtime/team-context-*.json` — 팀별 컨텍스트
- `.bkit/state/session-history.json` — 세션 이력

**어댑터 연결 전략:**
1. `openclaw-gateway`의 `parse-stdout.ts`가 에이전트 stdout을 파싱
2. 파싱 결과를 Paperclip 서버의 heartbeat 이벤트로 변환
3. `.bkit/runtime/` 파일을 주기적으로 읽어 에이전트 상태 동기화
4. WebSocket으로 프론트엔드에 실시간 전달

```
tmux pane stdout
  → openclaw-gateway/parse-stdout.ts (파싱)
  → HeartbeatRunEvent (Paperclip 이벤트 모델)
  → heartbeat 서비스 (저장 + 집계)
  → WebSocket → 프론트엔드 실시간 반영
```

### 4.3 한국어화 범위

| 영역 | 항목 수 (추정) | 방법 |
|------|-------------|------|
| 페이지 제목/네비게이션 | ~20개 | 직접 한국어 문자열 교체 |
| 컴포넌트 라벨/버튼 | ~100개 | 직접 한국어 문자열 교체 |
| 상태 메시지 (running/paused/error) | ~15개 | 상수 파일로 추출 후 한국어 매핑 |
| 비용 단위/형식 | ~10개 | 원(₩) 또는 달러($) + 한국어 포맷 |
| 에러 메시지/토스트 | ~30개 | 한국어 문자열 교체 |
| 날짜/시간 포맷 | — | `ko-KR` 로케일 적용 |

**한국어화 전략:**
- 별도 i18n 라이브러리 도입하지 않음 (단일 언어이므로)
- 컴포넌트 내 영어 문자열을 직접 한국어로 교체
- 상태값은 `status-labels.ts` 같은 상수 파일로 분리

### 4.4 의존성 + 설치 요구사항

**Paperclip에서 가져오는 핵심 의존성:**

| 패키지 | 버전 | 용도 | 현재 bscamp에 있는가 |
|--------|------|------|---------------------|
| react | 19.x | UI 프레임워크 | ✅ (18.x → 업그레이드 필요 여부 확인) |
| vite | — | 빌드 도구 | ❌ (Next.js 사용 중, 별도 앱) |
| @tanstack/react-query | — | 데이터 패칭 | ❌ 신규 |
| recharts | — | 차트 | ❌ 신규 |
| tailwindcss | — | 스타일링 | ✅ 이미 사용 |
| ws | — | WebSocket 서버 | ❌ 신규 (서버측) |
| drizzle-orm | — | DB ORM | ❌ (Supabase 클라이언트 사용 중) |
| sharp | — | Org Chart PNG 내보내기 | ❌ 신규 (선택) |

**설치 구조:**
```
bscamp/
├── src/                    ← 기존 Next.js 앱 (변경 없음)
├── dashboard/              ← 신규: Paperclip 차용 대시보드 (별도 Vite 앱)
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── pages/          ← 차용 페이지 (한국어화)
│   │   ├── components/     ← 차용 컴포넌트 (한국어화)
│   │   ├── context/        ← LiveUpdates 등
│   │   ├── api/            ← API 클라이언트 (OpenClaw 어댑터 연결)
│   │   └── lib/            ← 유틸리티
│   └── server/             ← 경량 Express 서버 (비용추적 + WebSocket)
└── ...
```

**별도 앱으로 분리하는 이유:**
1. 기존 Next.js 앱(bscamp 서비스)에 영향 없음
2. Vite 기반이라 Next.js와 빌드 시스템 충돌 방지
3. 개발 도구이므로 프로덕션 배포 불필요 (localhost 전용)
4. Paperclip 컴포넌트를 최소 수정으로 가져올 수 있음

---

## 5. 구현 일정 추정

### Phase 1: 기반 구축 (1~2일)
| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| T1 | `dashboard/` 디렉토리 생성, Vite + React + TailwindCSS 초기화 | — |
| T2 | Paperclip에서 Layout, Sidebar, 공통 컴포넌트 복사 + 한국어화 | T1 |
| T3 | OpenClaw 어댑터 연결 계층 구현 (`.bkit/runtime/` 파일 읽기 → API) | T1 |
| T4 | 경량 Express 서버 + WebSocket 셋업 | T1 |

### Phase 2: 대시보드 + Org Chart (1~2일)
| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| T5 | Dashboard 메인 페이지 차용 + 한국어화 (MetricCard, ActiveAgentsPanel) | T2, T3 |
| T6 | OrgChart 페이지 차용 + 우리 팀 구조 매핑 | T2 |
| T7 | LiveUpdatesProvider WebSocket 연결 | T4 |

### Phase 3: 비용 추적 (1~2일)
| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| T8 | 비용 서비스 포팅 (costs.ts, budgets.ts) + DB 스키마 | T4 |
| T9 | Costs 페이지 차용 + 한국어화 (5탭 구조) | T2, T8 |
| T10 | 예산 정책 설정 + 하드 한도 자동 중지 연결 | T8 |

### Phase 4: 체인 편집기 (1일)
| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| T11 | 체인 데이터 모델 + 저장소 (JSON 파일 기반) | T4 |
| T12 | 체인 편집 UI (단계 추가/삭제/순서변경/조건편집) | T2, T11 |
| T13 | 체인 실행 연결 (`.bkit/hooks/` 트리거) | T11 |

### Phase 5: 통합 검증 (0.5일)
| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| T14 | 전체 흐름 QA (대시보드 → 비용 → OrgChart → 체인) | 전체 |
| T15 | Gap 분석 | T14 |

---

## 6. 위험 요소

| 위험 | 영향 | 대응 |
|------|------|------|
| Paperclip 컴포넌트 내부 의존성이 복잡해서 분리 어려움 | Phase 1 지연 | 최소 필요 컴포넌트만 복사, 누락 import는 스텁으로 대체 |
| React 19 vs 18 호환성 | 빌드 오류 | 별도 Vite 앱이므로 독립 버전 관리 가능 |
| OpenClaw 어댑터가 현재 우리 tmux 구조와 안 맞음 | 실시간 연결 실패 | `.bkit/runtime/` 파일 폴링 폴백 |
| 비용 추적 DB가 필요한데 PostgreSQL 추가 부담 | 인프라 복잡도 | SQLite(로컬) 또는 JSON 파일 기반으로 경량화 |
| Paperclip 업스트림 변경 시 동기화 어려움 | 유지보수 부담 | 포크가 아닌 복사 방식, 필요 파일만 선별 |

---

## 7. 성공 기준

1. `dashboard/` 앱이 `npm run dev`로 구동되어 localhost:3200에서 접근 가능
2. 대시보드에서 현재 실행 중인 에이전트 상태가 실시간 표시
3. 비용 추적 탭에서 에이전트별 토큰 사용량 확인 가능
4. Org Chart에서 리더/팀원 트리 구조 시각화
5. 체인 편집 UI에서 PM→CTO→배포 체인 생성/수정 가능
6. 전체 UI가 한국어
7. 기존 bscamp Next.js 앱에 영향 없음 (별도 앱)

---

## 8. 참고 문서

- Paperclip GitHub: https://github.com/paperclipai/paperclip
- OpenClaw 어댑터: `packages/adapters/openclaw-gateway/`
- 현재 bkit 대시보드: `.bkit/runtime/state.json` 기반 CLI 출력
- 에이전트팀 운영: `CLAUDE.md` → "에이전트팀 운영" 섹션
- PDCA 체인 프로토콜: `CLAUDE.md` → "PDCA 체인 핸드오프 프로토콜"
