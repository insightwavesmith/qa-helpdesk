# Plan: 브릭 P0 — 4축 완성 (산출물 + 컨텍스트 + 가시성 + 사람)

> **피처**: brick-p0-3axis-completion
> **레벨**: L2-기능
> **작성**: PM | 2026-04-04
> **TASK**: docs/tasks/TASK-brick-p0-3axis-completion.md

---

## 1. 목적

브릭 엔진 3축(Block × Team × Link) 코드는 구현 완료(578 passed). 그러나 실전 TASK 실행 시 4가지가 빠져서 자동으로 안 돌아감:

| 축 | 문제 | 한 줄 요약 |
|---|------|----------|
| **산출물 (Output)** | 블록 완료 시 증거 없이 통과 | "종료 = 문서" 강제 |
| **컨텍스트 (Context)** | 에이전트가 역할/규칙 모름 | "CLAUDE.md + .claude/agents/ 네이티브 프롬프트" |
| **가시성 (Visibility)** | 실패해도 원인 불명, 승인 대기해도 알림 없음 | "왜 멈췄는지 Slack으로 보인다" |
| **사람 (People)** | 인증 없이 누구나 API 호출, 직원 참여 불가 | "Google 로그인 + RBAC + 직원별 알림" |

4축은 독립 — **병렬 구현 가능** (축4는 대시보드 레이어, 축1-3은 엔진 레이어).

---

## 2. 범위

### 하는 것

| 축 | 항목 | 변경 |
|---|------|------|
| **Output** | `artifact` Gate 타입 (8번째) 추가 | `concrete.py` register_gate |
| | 프로젝트 디렉토리 구조 | `brick/projects/` 신규 |
| | 문서 템플릿 5개 | `brick/templates/` 신규 |
| | 프리셋 `project` 필드 + `{feature}` 변수 치환 | preset_validator, executor |
| **Context** | `--bare` 제거 + `--agent {role}` 주입 | `claude_local.py` _build_args |
| | CLAUDE.md 공통 규칙 (200줄 이하) | `brick/CLAUDE.md` 신규 |
| | `.claude/agents/` 역할별 프롬프트 4개 | `.claude/agents/` 신규 |
| | 프리셋 `role` 필드 | TeamDefinition 활용 |
| **Visibility** | SlackSubscriber 실패 이벤트 구독 | `slack_subscriber.py` |
| | adapter_failed에 stderr 포함 | `executor.py` event.data |
| | approval 대기 Slack 알림 | `slack_subscriber.py` |
| **People** | Google Sign-In 추가 (기존 Python 인증 확장) | `auth/google.py` 신규, `auth_routes.py` 수정 |
| | DB 스키마 확장 (email, notifications) | `auth/schema.sql` 수정 |
| | notifications 직원별 라우팅 | `user_notifier.py` 신규 |
| | 대시보드 로그인 화면 | 프론트엔드 로그인 페이지 |
| | assignee = user email 매핑 | `engine_bridge.py` 수정 |

### 안 하는 것

- 오픈소스 패키징 / SkyOffice UI (P2)
- 새 Link 타입 추가
- 기존 Gate/Link 코드 수정 (추가만)
- 기존 어댑터 수정 (claude_local만 확장)
- 기존 로컬 로그인 제거 (Google 추가만, 기존 유지)

---

## 3. 의존성 체인

```
축1: Output          축2: Context          축3: Visibility
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│ O-1: 디렉토리 │     │ C-1: 프롬프트│     │ V-1: 실패구독│
│ O-2: 템플릿   │     │     파일 4개 │     │ V-2: stderr  │
│ O-3: artifact │     │ C-2: args    │     │     메시지   │
│     Gate 추가 │     │     수정     │     │ V-3: event   │
│ O-4: 재작성   │     │ C-3: 하위호환│     │     data확장 │
│     루프      │     │ C-4: 경고처리│     │ V-4: approval│
│ O-5: project  │     │ C-5: role    │     │     알림     │
│     필드      │     │     필드     │     │ V-5: API     │
│ O-6: {feature}│     └──────────────┘     └──────────────┘
│     치환      │
└──────────────┘

축4: People
┌──────────────┐
│ M-1: users   │
│     + RBAC   │
│ M-2: Google  │
│     Sign-In  │
│ M-3: 세션    │
│     미들웨어 │
│ M-4: 알림    │
│     라우팅   │
│ M-5: assignee│
│ M-6: 로그인  │
│ M-7: project │
│     매핑     │
└──────────────┘

축 간 접점:
  ① artifact 경로 → approval Slack 알림에 포함 (Output→Visibility)
  ② role → 에이전트 프롬프트 → 산출물 경로 결정 (Context→Output)
  ③ 실패 시 stderr에 어떤 role의 작업이었는지 포함 (Context→Visibility)
  ④ approval pending → approver email → 직원 알림 (Visibility→People)
  ⑤ human assignee → 직원별 task 필터 (People→Output)
```

### 축 내 의존 순서

**축 1 (Output):**
```
O-1 디렉토리 → O-2 템플릿 → O-5 project 필드 → O-6 {feature} 치환 → O-3 artifact Gate → O-4 재작성 루프
```
- O-3은 O-1/O-2 없이도 독립 구현 가능 (경로만 검증)
- O-6은 O-5에 의존 (project가 있어야 경로 조합)

**축 2 (Context):**
```
C-1 CLAUDE.md 공통규칙 → C-2 .claude/agents/ 프롬프트 → C-3 --bare 제거 → C-4 --agent 주입
```
- C-3/C-4가 핵심. CLAUDE.md와 agents/는 파일 배치만.

**축 3 (Visibility):**
```
V-3 event data 확장 → V-1 실패 구독 → V-2 stderr 메시지 → V-4 approval 알림 → V-5 API
```
- V-3 먼저 (event에 stderr 포함해야 V-1/V-2가 의미 있음)

**축 4 (People):**
```
M-1 users+RBAC → M-2 Google Sign-In → M-3 세션 미들웨어 → M-6 로그인 화면 → M-4 알림 라우팅 → M-5 assignee → M-7 project 매핑
```
- M-1~M-3이 인증 기반. M-6은 프론트엔드. M-4/M-5/M-7은 인증 완성 후.
- 축4는 Python FastAPI 대시보드 레이어 (`brick/brick/auth/*`, `brick/brick/dashboard/*`) — 축1~3(엔진 코어)과 독립 병렬 가능. 기존 인증 시스템(BrickUser, RBAC, DB세션) 위에 Google Sign-In + notifications 추가.

---

## 4. 기존 자산 매핑

| 자산 | 위치 | 활용 |
|------|------|------|
| `DoneCondition.artifacts` | `brick/models/block.py:8-11` | artifact Gate가 참조할 경로 목록 |
| `register_gate()` | `brick/gates/concrete.py` | artifact Gate 등록 (1줄) |
| `_run_approval()` | `brick/gates/concrete.py:377-449` | approval 알림 이벤트 발행 포인트 |
| `_build_args()` | `brick/adapters/claude_local.py:285-293` | `--bare` 제거 + `--agent` 추가 포인트 |
| `--bare` | `claude_local.py:287` | **제거 대상** (hooks 제거 완료) |
| `.claude/agents/` | `.claude/agents/*.md` | 네이티브 에이전트 프롬프트 (frontmatter 지원) |
| `SlackSubscriber` | `brick/engine/slack_subscriber.py` | 5개 이벤트 구독 중, 실패 이벤트 미구독 |
| `EventBus` | `brick/engine/event_bus.py` | subscribe/publish 패턴 |
| `adapter_failed` 이벤트 | `executor.py:402,456,509,619,647` | 5곳에서 발행, stderr 미포함 |
| `GateConfig.on_fail` | `brick/models/block.py:64` | `retry`로 설정하면 재실행 |
| bkit 템플릿 18개 | `~/.claude/plugins/cache/bkit-marketplace/bkit/1.5.2/templates/` | 복사+단순화 |
| bkit 에이전트 31개 | `~/.claude/plugins/cache/bkit-marketplace/bkit/1.5.2/agents/` | 참고하여 브릭용 작성 |
| `brick/auth/*` (기존) | `brick/brick/auth/` | BrickUser, RBAC, DB세션, 비밀번호 해싱 — **이미 구현됨** |
| `auth_routes.py` (기존) | `brick/brick/dashboard/routes/auth_routes.py` | /auth/login, logout, me, users — Google 추가 필요 |
| `HumanAdapter.assignee` | `brick/adapters/human.py` | email → user_id 매핑 추가 |
| `EngineBridge` | `dashboard/server/brick/engine/bridge.ts` | Express→Python 프록시 (인증 경계) |
| MC auth.ts | `/Users/smith/projects/mission-control/src/lib/auth.ts` | User 인터페이스 + RBAC 패턴 |
| MC google-auth.ts | `/Users/smith/projects/mission-control/src/lib/google-auth.ts` | Google 토큰 검증 패턴 |
| MC session-cookie.ts | `/Users/smith/projects/mission-control/src/lib/session-cookie.ts` | 세션 쿠키 설정 패턴 |

---

## 5. 아키텍처 결정

| # | 결정 | 대안 | 이유 |
|---|------|------|------|
| ADR-1 | artifact 검증 = Gate 타입 추가 | `complete_block()` 직접 수정 | Gate on/off 원칙 일관. YAML 선언적 제어 |
| ADR-2 | 프롬프트 = CLAUDE.md + `.claude/agents/` + `--agent` (네이티브) | `--bare` + `--system-prompt-file` | bkit 안 쓰고 hooks 제거 → `--bare` 불필요. 네이티브가 가장 단순 |
| ADR-3 | 4축 병렬 구현 | 순차 | 축1~3은 엔진, 축4는 대시보드 — 완전 독립 |
| ADR-4 | 프로젝트 = brick 안에 | brick 밖에 | Smith님 결정 |
| ADR-5 | stderr 전체가 아닌 마지막 10줄만 Slack | 전체 stderr | Slack 메시지 길이 제한 + 가독성 |
| ADR-6 | role → `--agent {role}` CLI 옵션으로 전달 | executor 레벨 프롬프트 주입 | Claude Code 네이티브 `.claude/agents/` 활용 |
| ADR-7 | Google Sign-In + MC 패턴 (SQLite 직접) | Firebase Auth | MC 코드 재사용, 외부 의존 최소화 |
| ADR-8 | Express가 인증 후 Python에 프록시 | Python에도 인증 추가 | EngineBridge가 이미 프록시 역할. 이중 인증 불필요 |

---

## 6. 구현 계획

### Phase A: 기반 (3축 공통)

| # | 작업 | 파일 | 담당 |
|---|------|------|------|
| A-1 | `brick/projects/` 디렉토리 구조 생성 | 신규 디렉토리 | CTO → backend-dev |
| A-2 | `brick/templates/` 문서 템플릿 5개 | 신규 파일 5개 | CTO → backend-dev |
| A-3 | `.claude/agents/` 에이전트 프롬프트 4개 | 신규 파일 4개 | CTO → backend-dev |
| A-4 | `brick/CLAUDE.md` 공통 규칙 (200줄 이하) | 신규 파일 1개 | CTO �� backend-dev |

### Phase B: 축별 구현 (병렬)

**축 1 (Output):**

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| B1-1 | `artifact` Gate 핸들러 구현 | `concrete.py` | `_run_artifact()` + register_gate |
| B1-2 | PresetValidator에 project 필드 검증 추가 | `preset_validator.py` | ※ artifact는 이미 DEFAULT_GATE_TYPES에 포함 |
| B1-3 | 프리셋 `project` 필드 + {feature} 치환 | `executor.py`, `preset_validator.py` | context에 project/feature 주입 |
| B1-4 | Gate fail → 재작성 루프 프리셋 검증 | 프리셋 YAML | 기존 on_fail: retry + loop 조합 |

**축 2 (Context):**

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| B2-1 | claude_local에서 `--bare` 제거 | `claude_local.py` | _build_args에서 --bare 삭제 |
| B2-2 | claude_local에 `--agent {role}` 주입 | `claude_local.py` | config.role → --agent 옵션 |
| B2-3 | TeamDefinition에서 role 필드 사용 | `engine_bridge.py` | config.role → 어댑터 전달 |
| B2-4 | role 미지정 시 하위호환 | `claude_local.py` | --agent 스킵, CLAUDE.md만 로딩 |

**축 3 (Visibility):**

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| B3-1 | adapter_failed 이벤트에 stderr/exit_code 추가 | `executor.py` | event.data 확장 |
| B3-2 | SlackSubscriber에 실패 이벤트 구독 추가 | `slack_subscriber.py` | block.adapter_failed, block.gate_failed |
| B3-3 | 실패 Slack 메시지 포맷 (stderr 10줄) | `slack_subscriber.py` | _format_message 확장 |
| B3-4 | approval 대기 Slack 알림 | `slack_subscriber.py` | gate.pending 이벤트 발행 + 구독 |
| B3-5 | approve/reject API 확인 | `engine_bridge.py` | 기존 _run_approval과 연동 |

**축 4 (People):**

| # | 작업 | 파일 | 비고 |
|---|------|------|------|
| B4-1 | users 테이블 Google 컬럼 확장 (email, provider, is_approved) | `auth/schema.sql` | ALTER TABLE + notifications 테이블 |
| B4-2 | Google Sign-In 토큰 검증 구현 | `auth/google.py` 신규 | httpx + oauth2.googleapis.com/tokeninfo |
| B4-3 | `/auth/google` 로그인 엔드포인트 | `auth_routes.py` | 기존 라우터에 추가 |
| B4-4 | notifications 직원별 라우팅 (EventBus 구독) | `user_notifier.py` 신규 | approval/failure → recipient INSERT |
| B4-5 | human tasks 인증 기반 필터 | `engine_bridge.py` | operator는 자기 assignee만 |
| B4-6 | 대시보드 로그인 페이지 | 프론트엔드 | Google Sign-In 버튼 + AuthGuard |
| B4-7 | workspace → brick project 매핑 | `auth/schema.sql` | workspaces.brick_project 컬럼 |

### Phase C: 축 간 접점 + 통합

| # | 작업 | 접점 | 비고 |
|---|------|------|------|
| C-1 | artifact 경로를 approval 알림에 포함 | Output→Visibility | approval Slack에 산출물 경로 표시 |
| C-2 | role을 stderr 실패 알림에 포함 | Context→Visibility | "CTO-lead 블록 실패" 형태 |
| C-3 | 통합 프리셋 YAML 예시 작성 | 전체 | bscamp, brick-engine 프로젝트용 |
| C-4 | approval → 직원 알림 연결 | Visibility→People | approver email → notifications |
| C-5 | human task → 인증 사용자 필터 | People→Output | assignee email = user email |

---

## 7. 변경 파일 요약

| 파일 | 유형 | 변경 |
|------|------|------|
| `brick/brick/gates/concrete.py` | 수정 | `_run_artifact()` 추가 + register_gate |
| `brick/brick/adapters/claude_local.py` | 수정 | `--bare` 제거 + `--agent {role}` ��입 |
| `brick/brick/engine/slack_subscriber.py` | 수정 | 실패/approval 이벤트 구독 |
| `brick/brick/engine/executor.py` | 수정 | adapter_failed에 stderr 포함, project/feature context |
| `brick/brick/engine/preset_validator.py` | 수정 | project 필드 검증 추가 (※ artifact는 이미 DEFAULT_GATE_TYPES에 포함) |
| `.claude/agents/cto-lead.md` | **���규** | CTO 역할 프롬프트 (frontmatter) |
| `.claude/agents/pm-lead.md` | **신규** | PM 역할 프롬프트 (frontmatter) |
| `.claude/agents/qa-monitor.md` | **신규** | QA 역할 프롬프트 (frontmatter) |
| `.claude/agents/report-generator.md` | **신규** | 보���서 생성 프롬���트 (frontmatter) |
| `brick/CLAUDE.md` | **신규** | 공통 규칙 (200줄 이하) |
| `brick/templates/plan.md` | **신규** | Plan 문서 템플릿 |
| `brick/templates/design.md` | **신규** | Design 문서 템플릿 |
| `brick/templates/do.md` | **신규** | 구현 보고 템플릿 |
| `brick/templates/report.md` | **신규** | 완료 보고서 템플릿 |
| `brick/templates/analysis.md` | **신규** | 분석 보고서 템플릿 |
| `brick/projects/bscamp/` | **신규** | bscamp 프로젝트 디렉토리 |
| `brick/brick/auth/schema.sql` | 수정 | users Google 컬럼 + notifications 테이블 + workspaces.brick_project |
| `brick/brick/auth/google.py` | **신규** | Google ID 토큰 검증 (httpx) |
| `brick/brick/dashboard/routes/auth_routes.py` | 수정 | `/auth/google` 엔드포인트 추가 |
| `brick/brick/engine/user_notifier.py` | **신규** | EventBus → 직원별 알림 라우팅 |
| `brick/brick/dashboard/routes/engine_bridge.py` | 수정 | human tasks 인증 필터 |
| 프론트엔드 로그인 페이지 | **신규** | Google Sign-In + AuthGuard |

총: 수정 8건 + 신규 14건 = **22건**

---

## 8. 리스크

| 리스크 | 영향 | 완화 |
|--------|------|------|
| `.claude/agents/` 네이티브 로딩이 `--print` 모드에서 미동작 | 축2 전체 | `--agent {role}` CLI 옵션으로 명시 전달. 미지원 시 `--system-prompt-file` 폴백 |
| artifact Gate가 파일 I/O → 느림 | 축1 Gate 실행 지연 | `os.path.exists()` + glob만 (내용 검증 안 함) |
| Slack 메시지에 stderr 포함 → 보안 민감 | 축3 정보 유출 | env/token 패턴 마스킹, 마지막 10줄만 |
| approval 이벤트 미발행 (현재 없음) | 축3 V-4 구현 불가 | executor에서 gate pending 이벤트 추가 발행 필요 |
| Google OAuth 클라이언트 미설정 | 축4 M-2 로그인 불가 | GOOGLE_CLIENT_ID 환경변수 설정 + 개발 모드 시 aud 검증 스킵 |
| 기존 로컬 로그인과 Google 인증 병행 | 인증 플로우 복잡도 | Google이 주, 로컬은 관리자 부트스트랩용만 유지 |

---

## 9. 완료 기준

- [ ] artifact Gate 등록 + 파일 존재 검증 동작
- [ ] `--bare` 제거 + `--agent {role}` 주입 동작
- [ ] CLAUDE.md 네이티브 로딩 확인
- [ ] adapter_failed Slack 알림에 stderr 포함
- [ ] approval 대기 Slack 알림 발송
- [ ] Google Sign-In → 세션 생성 → 대시보드 접근
- [ ] RBAC 권한 분리 (viewer/operator/admin) 동작
- [ ] notifications 직원별 라우팅 동작
- [ ] human task → 인증 사용자별 필터 동작
- [ ] TDD 전건 PASS (Design에서 정의: 50건)
- [ ] 기존 578 테스트 regression 없음
