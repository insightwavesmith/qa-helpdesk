# TASK: 브릭 P0 - 3축 완성 (산출물 + 컨텍스트 + 가시성)

> 2026-04-04 모찌(COO) 작성. PM팀장 Plan + Design 작성 요청.

---

## 배경

브릭 엔진 3축(Block × Team × Link) 코드는 구현 완료 (578 passed / 0 failed).
근데 실제로 TASK 넣으면 자동으로 안 돌아간다. 3가지가 빠졌다:

1. **블록이 끝났다는 증거가 없다** - 빈 손으로 "완료" 가능. 문서 산출 강제 없음
2. **실행자가 역할을 모른다** - CTO가 "나 뭐 하는 사람?" 상태로 시작
3. **실패해도 왜인지 안 보인다** - "exit code 1"만 보이고 원인 모름

이 3가지 = *산출물(Output) + 컨텍스트(Context) + 가시성(Visibility)* 3축.
3축 전부 독립 (병렬 구현 가능).

---

## 요구사항

### 축 1: 산출물 (Output) - "종료 = 문서"

*이게 없으면*: 블록이 끝나도 다음 블록이 재료 없이 시작. PM이 Plan 안 쓰고 "완료" 선언 가능.

| # | 요구사항 | 검증 기준 |
|---|---------|----------|
| O-1 | 프로젝트별 디렉토리 구조 | `brick/projects/{bscamp,brick-engine,skyoffice}/{tasks,plans,designs,reports}/` 존재 |
| O-2 | 문서 템플릿 5개 배치 | `brick/templates/`에 plan, design, do, report, analysis 템플릿 존재 |
| O-3 | `artifact` Gate 타입 추가 (8번째) | `done.artifacts` 경로의 파일 존재 → pass, 없으면 → fail |
| O-4 | Gate fail 시 재작성 루프 | `on_fail: retry` + loop Link로 블록 되돌아감 |
| O-5 | 프리셋 YAML에 `project` 필드 | 워크플로우 시작 시 프로젝트 지정 필수 |
| O-6 | `{feature}` 변수 치환 | artifact 경로에 워크플로우 feature명 자동 삽입 |

*기존 자산:*
- `DoneCondition.artifacts` 모델 있음 (brick/models/block.py)
- Gate 레지스트리 `register_gate()` 있음 (brick/gates/concrete.py)
- bkit 템플릿 18개 있음 (`~/.claude/plugins/cache/bkit-marketplace/bkit/1.5.2/templates/`)

*참고 코드:*
- `brick/models/block.py` - DoneCondition 클래스
- `brick/gates/concrete.py` - ConcreteGateExecutor, register_gate
- `brick/engine/executor.py` - complete_block() line 329
- `brick/engine/preset_validator.py` - VALID_GATE_TYPES

### 축 2: 컨텍스트 (Context) — “역할 프롬프트 배치”

*이게 없으면*: CTO가 프로젝트 규칙/역할 모르고 시작. "나 뭘 하는 사람?" 상태.

bkit 안 쓰고 hooks 제거했으므로 `--bare` 필요 없음. Claude Code가 CLAUDE.md를 정상적으로 읽는다.

| # | 요구사항 | 검증 기준 |
|---|---------|----------|
| C-1 | CLAUDE.md에 공통 규칙 배치 | 코딩 컨벤션, 커밋 규칙, PDCA 프로세스, 테스트 필수 등 200줄 이하 |
| C-2 | `.claude/agents/` 디렉토리 + 역할별 프롬프트 최소 4개 | cto-lead.md, pm-lead.md, qa-monitor.md, report-generator.md 존재 |
| C-3 | `claude_local` 어댑터에서 `--bare` 제거 | hooks 제거로 충돌 원인 없음. CLAUDE.md + agents/ 네이티브 로딩 |
| C-4 | 프리셋 YAML에서 역할 지정 시 `.claude/agents/{role}.md` 자동 적용 | Claude Code 네이티브 기능 활용 |

*기존 자산:*
- Claude Code 네이티브 `.claude/agents/` 디렉토리 지원 (공식 문서 확인)
- bkit 에이전트 프롬프트 31개 참고 (`~/.claude/plugins/cache/bkit-marketplace/bkit/1.5.2/agents/`)
- hooks 43개 제거 완료 (TASK-5) → `--bare` 불필요

*참고 코드:*
- `brick/adapters/claude_local.py` — line 287 args 배열에서 `--bare` 제거
- bkit agents/ — cto-lead, pm-lead 등

### 축 3: 가시성 (Visibility) - "실패 원인 + 승인 알림"

*이게 없으면*: 실패해도 "왜"를 모름 + 승인 대기해도 아무도 모름 → 영원히 멈춤.

| # | 요구사항 | 검증 기준 |
|---|---------|----------|
| V-1 | SlackSubscriber 실패 이벤트 구독 | `block.adapter_failed`, `block.gate_failed` 수신 |
| V-2 | 실패 Slack 메시지에 stderr + exit code | 의도적 실패 → Slack에 stderr 마지막 10줄 표시 |
| V-3 | executor adapter_failed에 stderr 포함 | event.data에 stderr, exit_code, error_message 필드 |
| V-4 | approval 대기 시 Slack 알림 | `gate.pending` 이벤트 → "검토해라" + 산출물 경로 |
| V-5 | approve/reject API 동작 | POST 호출 → 다음 블록 진행 또는 loop 재작성 |

*기존 자산:*
- stderr 캡처 있음 (claude_local.py line 116~178)
- EventBus + SlackSubscriber 있음 (5개 이벤트 구독 중)
- approval Gate 구현 있음 (concrete.py line 377~)
- agent-ops 채널: `C0AN7ATS4DD`

*참고 코드:*
- `brick/engine/slack_subscriber.py` - SlackSubscriber 클래스
- `brick/engine/executor.py` - adapter_failed 이벤트 발행 (line 401~647)
- `brick/gates/concrete.py` - _run_approval (line 377~)
- `brick/engine/event_bus.py` - EventBus 클래스

---

## 아키텍처 결정 (ADR)

| # | 결정 | 대안 | 이유 |
|---|------|------|------|
| 1 | artifact 검증 = Gate 타입 추가 | complete_block() 직접 수정 | Gate on/off 원칙 일관성. YAML에서 선언적 제어 |
| 2 | 프롬프트 = CLAUDE.md + `.claude/agents/` (네이티브) | `--bare` + `--system-prompt-file` | bkit 안 쓰고 hooks 제거했으므로 `--bare` 불필요. 네이티브가 가장 단순 |
| 3 | 3축 병렬 구현 | 순차 | 3축 독립 확인됨 |
| 4 | 프로젝트 = brick 안에 | brick 밖에 | Smith님 결정: 브릭=엔진, 프로젝트는 안에 |

---

## 범위 제한 (안 하는 것)

- 오픈소스 패키징 (P2)
- SkyOffice UI (P2)
- 멀티유저 + RBAC (P2)
- 새 Link 타입 추가
- 기존 Gate/Link 코드 수정 (추가만)

---

## PM 산출물 요청

1. **Plan 문서** - 위 요구사항 기반 구현 계획 + 의존성 체인 + 일정
2. **Design 문서 (통합 1개)** - 3축 전부 포함. TDD 케이스 + 불변식 + 인터페이스 정의 + 엣지케이스 + 축 간 접점(artifact→알림, 프롬프트→산출물 경로 등). 구현 시 축별 분리는 CTO 판단.

---

### 축 4: 사람 (People) — "직원이 같이 브릭을 굴린다"

> 회사 직원들이 같이 하나의 프로젝트 브릭을 굴린다.

### 배경

지금 브릭은 인증 없이 누구나 API 호출 가능. 직원이 참여하려면:
- 로그인 (누구인지)
- 권한 (누가 뭘 할 수 있는지)
- 할당 (이 블록은 누가 하는지)
- 알림 (내 차례에 나한테 알림)

### 레퍼런스: Mission Control

로컬 경로: `/Users/smith/projects/mission-control`

배끼 코드:
| MC 파일 | 용도 | 브릭 적용 |
|---------|------|----------|
| `src/lib/auth.ts` | User 인터페이스 (id, role, workspace_id, tenant_id) | 유저 모델 + RBAC |
| `src/lib/schema.sql` | users/agents/notifications/activities 테이블 | DB 스키마 기반 |
| `src/lib/google-auth.ts` | Google Sign-In (`verifyGoogleIdToken`) | 로그인 |
| `src/lib/session-cookie.ts` | 세션 쿠키 7일 유효 | 인증 유지 |
| `src/lib/event-bus.ts` | 이벤트 버스 (task/agent/notification 이벤트) | 직원별 알림 라우팅 |

### 요구사항

| # | 요구사항 | 검증 기준 |
|---|---------|----------|
| M-1 | users 테이블 + RBAC (admin/operator/viewer) | 역할별 API 접근 제한 |
| M-2 | Google Sign-In 인증 | 이메일로 로그인 가능 |
| M-3 | 세션 쿠키 미들웨어 | 인증 없으면 API 401 |
| M-4 | notifications 테이블 + 직원별 알림 | 내 블록 차례 시 Slack/웹 알림 |
| M-5 | assignee = user_id 매핑 | human 어댑터에서 담당자 지정 |
| M-6 | 대시보드 로그인 화면 | 미로그인 시 로그인 페이지로 리디렉트 |
| M-7 | workspace = project 매핑 | 직원별 프로젝트 접근 권한 |

*MC schema.sql의 users/agents/notifications/activities 테이블 구조 그대로 참고.*

---

COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
