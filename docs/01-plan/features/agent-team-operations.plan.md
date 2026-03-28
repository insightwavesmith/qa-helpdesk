# 에이전트팀 운영 체계 통합 기획서

> 작성일: 2026-03-28
> 작성자: CTO (Leader)
> 상태: Plan
> 프로세스 레벨: L1 (src/ 미수정, hooks/scripts/settings 정비)
> **통합 대상**: task-ownership-process.plan.md + hook-task-ownership.plan.md + teammate-lifecycle.plan.md

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 에이전트팀 운영 체계 통합 (TASK 소유권 + 팀 상시 유지 + 생명주기 자동화) |
| **작성일** | 2026-03-28 |
| **예상 소요** | Wave 1~4, 총 4단계 |
| **핵심 문제 3가지** | ① Hook이 팀 컨텍스트 모름 → 크로스팀 배정 ② 팀원 종료가 수동 ③ 매 TASK마다 팀 생성/삭제 반복 |
| **핵심 해결** | TASK 프론트매터 소유권 + 팀 상시 유지 모델 + 3단계 종료 자동화 |
| **PDCA 레벨** | L1 (src/ 미수정) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | ① Hook이 전체 TASK 스캔 → 크로스팀 배정 → 무한 루프 ② 팀원 종료 수동 5~10분 ③ TASK마다 팀 삭제/재생성 반복 |
| **Solution** | TASK 프론트매터로 소유권 명시 + 팀 상시 유지 + 리더 명령 시만 3단계 자동 종료 |
| **Function UX Effect** | 팀 한 번 만들면 세션 끝까지 유지. 리더가 SendMessage로 연속 TASK 배정. 종료 시 한 마디면 자동 정리 |
| **Core Value** | 팀 생성/삭제 오버헤드 제거 + 세션당 5~10분 종료 시간 절약 + 토큰 낭비 0 |

---

## 1. 문제 정의

### 1-1. 크로스팀 TASK 배정 (hook-task-ownership 계열)

TeammateIdle hook이 `.claude/tasks/TASK-*.md` 전체를 스캔하여 미완료 체크박스를 찾고, **팀 구분 없이** 다음 작업을 배정했다.

```
CTO팀 팀원 idle → teammate-idle.sh 실행
  → TASK-PM-RESUME.md의 미완료 항목 발견 (다른 팀)
  → 크로스팀 배정 → 권한/컨텍스트 없음 → 실패
  → 다시 idle → 같은 TASK 재배정 → 무한 루프
```

**근본 원인**: TASK 파일에 소유권 메타데이터 없음 + Hook이 팀/세션 컨텍스트를 모름.

### 1-2. 팀원 종료 수동 반복 (teammate-lifecycle 계열)

```
① Leader: SendMessage shutdown_request
② 대기 10초... 팀원 응답 없음 (idle 루프 진입)
③ Leader: tmux capture-pane으로 상태 확인
④ Leader: tmux kill-pane -t %XX 수동 실행
⑤ Leader: PDCA 상태 파일 갱신
⑥ Leader: TeamDelete (PDCA hook이 갱신 확인)
```

팀원 수만큼 반복. 3명이면 18단계.

### 1-3. 매 TASK마다 팀 삭제/재생성 (신규 문제)

현재 CLAUDE.md 규칙: "작업 완료 확인 즉시 TeamDelete 실행". 이로 인해:
- TASK 완료 → TeamDelete → 다음 TASK → TeamCreate → spawn 대기 → 작업 시작
- 팀 생성 오버헤드: spawn 프롬프트 작성 + 팀원 초기화 + 컨텍스트 주입 = ~2분/회
- 하루 5~10회 반복 = 10~20분 오버헤드

**해결 방향**: 팀을 세션 단위로 상시 유지. TASK 완료 시 팀 삭제 대신 다음 TASK를 SendMessage로 배정.

### 1-4. 반복 사고 기록

| 날짜 | 사고 | 원인 |
|------|------|------|
| 03-25 | pm-test-scenario idle 루프 30분 | 크로스팀 배정 (TeammateIdle hook) |
| 03-26 | backend-dev 좀비 프로세스 | TeamDelete 후 pane 잔존 |
| 03-28 | doc-writer shutdown 후 idle 유지 | shutdown_approved 전송했지만 프로세스 미종료 |
| 03-28 | pm-researcher idle notification 반복 | 완료 보고 후 idle→available 반복 |
| 03-28 | 기획팀이 개발 작업 시도 | 역할 분리 미흡 (기획팀 세션에서 backend-dev spawn) |

---

## 2. 핵심 설계 결정

### D-1. 팀 상시 유지 모델

| 항목 | 기존 | 변경 |
|------|------|------|
| 팀 생명주기 | TASK 단위 (생성→작업→삭제) | **세션 단위** (생성→연속 작업→세션 종료 시 삭제) |
| TASK 완료 시 | TeamDelete 즉시 실행 | **다음 TASK를 SendMessage로 배정** (팀 유지) |
| 팀 삭제 시점 | 매 TASK 완료 후 | **세션 종료 시 리더가 명시적으로 실행** |
| 팀원 idle 시 | 자동 다음 TASK 배정 (hook) | **대기 → 리더 SendMessage 대기** |

### D-2. TeammateIdle 영구 비활성

**`TeammateIdle: []` (빈 배열) 유지. 재활성화 금지.**

- teammate-idle.sh v6 코드는 보존하되 등록하지 않음
- 작업 배정은 리더 SendMessage가 유일한 경로
- 이유: Hook 기반 자동 배정이 크로스팀 충돌의 근본 원인이었음

### D-3. auto-team-cleanup = 알림만

auto-team-cleanup.sh는 모든 TASK 완료 시 **리더에게 알림만** 전송.
- ~~auto-shutdown 자동 트리거~~ → 삭제
- 리더가 알림 보고 판단: 다음 TASK 배정 또는 세션 종료
- exit 0 (차단 없음)

### D-4. auto-shutdown = 리더 명시적 호출만

auto-shutdown.sh는 리더가 "세션 종료" 결정 시에만 실행.
- TaskCompleted에서 자동 호출되지 않음
- 리더가 직접 `bash .claude/hooks/auto-shutdown.sh` 실행 또는 TeamDelete 전 호출

---

## 3. 해결 방안

### 3-1. TASK 파일 YAML 프론트매터

TASK 파일(`.claude/tasks/TASK-*.md`) 상단에 소유권 메타데이터 추가:

```yaml
---
team: CTO-1              # 필수. TeamCreate 시 지정한 팀명
session: sdk-cto          # 선택. tmux 세션명
created: 2026-03-28       # 필수. TASK 생성일
status: in-progress       # 필수. pending | in-progress | completed | archived
owner: leader             # 필수. TASK 소유자
assignees:                # 선택. 팀원별 담당 태스크
  - role: backend-dev
    tasks: [W1-1, W1-2]
  - role: qa-engineer
    tasks: [W3-1]
---
```

**파싱**: awk로 `---` 블록 추출. 프론트매터 내부 `- [ ]`는 체크박스로 취급 안 함.

**마이그레이션**: 기존 10개 TASK 파일에 프론트매터 추가 완료 (이전 작업에서 처리됨).

### 3-2. team-context.json (Hook 컨텍스트)

**경로**: `.claude/runtime/team-context.json`

Hook이 현재 팀 정보를 참조하기 위한 런타임 파일:

```json
{
  "team": "CTO-1",
  "session": "sdk-cto",
  "created": "2026-03-28T10:00:00+09:00",
  "taskFiles": ["TASK-CTO-RESUME.md"],
  "teammates": [
    { "role": "backend-dev", "paneIndex": 1 },
    { "role": "qa-engineer", "paneIndex": 2 }
  ]
}
```

**용도**: 다른 hook이 "지금 어떤 팀인지" 알기 위함. 작업 배정 용도 아님.
**생성 시점**: TeamCreate 직후 리더가 수동 생성 (또는 spawn 스크립트에 포함).
**삭제 시점**: TeamDelete 시 validate-pdca-before-teamdelete.sh가 자동 삭제.

### 3-3. teammate-registry.json (생명주기 추적)

**경로**: `.claude/runtime/teammate-registry.json`

팀원의 전체 생명주기를 중앙 추적:

```json
{
  "team": "process-report",
  "updatedAt": "2026-03-28T13:10:00",
  "members": {
    "backend-dev": {
      "state": "active",
      "paneId": "%29",
      "spawnedAt": "2026-03-28T13:00:00",
      "lastActiveAt": "2026-03-28T13:08:00",
      "terminatedAt": null,
      "terminatedBy": null,
      "tasksCompleted": 4
    }
  }
}
```

**state 전이**: `spawning` → `active` → `idle` ↔ `active` → `shutdown_pending` → `terminated`

**terminatedBy 값**: `shutdown_approved` (정상) | `force_kill` (강제) | `pane_dead` (이미 종료)

### 3-4. 3단계 Graceful Shutdown (리더 명시적 호출)

리더가 세션 종료를 결정한 경우에만 실행:

| 단계 | 행동 | 타임아웃 |
|------|------|----------|
| **Stage 1** | 각 팀원에게 SendMessage shutdown_request | 10초 |
| **Stage 2** | 미종료 팀원 → tmux kill-pane + config.json isActive=false | 즉시 |
| **Stage 3** | PDCA 갱신 + teammate-registry 갱신 + TeamDelete | 5초 |

**트리거**: 리더가 `bash .claude/hooks/auto-shutdown.sh` 직접 실행.
**자동 트리거 없음**: TaskCompleted에서 호출하지 않음. auto-team-cleanup에서도 호출하지 않음.

### 3-5. Hook 정비

| Hook | 현재 상태 | 변경 |
|------|-----------|------|
| `teammate-idle.sh` | settings에 등록됨 | **비활성화** (`TeammateIdle: []`로 변경) |
| `auto-team-cleanup.sh` | TaskCompleted 등록 | 알림만 유지 (auto-shutdown 호출 삭제) |
| `force-team-kill.sh` | 미등록 (수동 실행만) | 레지스트리 갱신 로직 추가, 리더 보호 로직 추가 |
| `auto-shutdown.sh` | 없음 | **신규** — 3단계 프로토콜 오케스트레이터 |

**미등록 hook 정리**: `.claude/hooks/`에 31개 중 11개 미등록. 미사용 hook은 삭제하지 않되 주석으로 "미등록" 표기.

### 3-6. CLAUDE.md 규칙 업데이트

변경이 필요한 CLAUDE.md 섹션:

| 섹션 | 현재 규칙 | 변경 |
|------|-----------|------|
| **팀원 종료** | "작업 완료 확인 즉시 TeamDelete 실행" | "세션 종료 시 리더가 auto-shutdown.sh 실행 후 TeamDelete" |
| **TeammateIdle** | "팀원 idle 시 자동 다음 TASK 배정" | "비활성 유지. 리더 SendMessage로만 배정" |
| **팀 운영** | TASK 단위 생성/삭제 암시 | "세션 단위 상시 유지" 명시 |
| **완료 후 정리** | "팀원 전원 종료 확인 (TeamDelete)" | "세션 종료 시 auto-shutdown.sh → TeamDelete" |

**주의**: CLAUDE.md 수정은 Smith님 승인 후 별도 커밋으로 진행.

---

## 4. 구현 범위

### Wave 1: TASK 소유권 (의존성 없음)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W1-1 | TASK 프론트매터 파싱 헬퍼 (parse_frontmatter 함수) | `.claude/hooks/helpers/frontmatter-parser.sh` | backend-dev |
| W1-2 | team-context.json 생성/갱신 로직 | `.claude/runtime/team-context.json` (+ 생성 스크립트) | backend-dev |
| W1-3 | teammate-registry.json 스키마 + 초기화 로직 | `.claude/runtime/teammate-registry.json` (+ build_registry 함수) | backend-dev |

### Wave 2: 종료 자동화 (Wave 1 완료 후)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W2-1 | auto-shutdown.sh 신규 작성 (3단계 프로토콜) | `.claude/hooks/auto-shutdown.sh` | backend-dev |
| W2-2 | force-team-kill.sh 개선 (레지스트리 갱신 + 리더 보호) | `.claude/hooks/force-team-kill.sh` | backend-dev |

### Wave 3: Hook 정비 + settings (Wave 2 완료 후)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W3-1 | auto-team-cleanup.sh 개선 (알림만, auto-shutdown 호출 없음) | `.claude/hooks/auto-team-cleanup.sh` | backend-dev |
| W3-2 | settings.local.json 확인 (TeammateIdle 비활성 확인) | `.claude/settings.local.json` | backend-dev |
| W3-3 | CLAUDE.md 규칙 업데이트 초안 (Smith님 승인용) | `CLAUDE.md` | backend-dev |

### Wave 4: 검증

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W4-1 | 수동 테스트: TeamCreate → 연속 TASK → auto-shutdown 전체 플로우 | 수동 테스트 | qa-engineer |
| W4-2 | 좀비 프로세스 0건 확인 (tmux list-panes) | 수동 테스트 | qa-engineer |
| W4-3 | Gap 분석 | `docs/03-analysis/agent-team-operations.analysis.md` | qa-engineer |

---

## 5. 성공 기준

| 기준 | 측정 | 목표 |
|------|------|------|
| 크로스팀 TASK 배정 | 세션당 발생 횟수 | 0회 |
| 리더 수동 tmux kill | 세션당 횟수 | 0회 |
| 팀 생성/삭제 횟수 | 세션당 | 각 1회 (시작 + 종료) |
| 팀원 종료 소요 시간 | shutdown 시작~TeamDelete 완료 | < 20초 |
| 좀비 pane | 세션 종료 후 잔존 | 0개 |
| 좀비 팀 디렉토리 | ~/.claude/teams/ 잔여 | 0개 |
| 토큰 낭비 (idle 루프) | 종료 후 idle notification | 0회 |
| Gap 분석 Match Rate | 설계 vs 구현 일치율 | 90%+ |

---

## 6. 테스트 시나리오

### Happy Path

| ID | 시나리오 | 기대 결과 |
|----|----------|-----------|
| UT-1 | auto-shutdown 정상 종료 (2명, 모두 shutdown_approved) | 레지스트리 2명 terminated, pane 0개 |
| UT-2 | auto-shutdown 강제 종료 (1명 shutdown 무시) | Stage 2에서 force-kill, 레지스트리 force_kill |
| UT-3 | 팀 상시 유지: TASK 완료 → 다음 TASK SendMessage | 팀 유지, 팀원 active 상태 지속 |
| UT-4 | 세션 종료: auto-shutdown → TeamDelete | 전원 terminated, 팀 디렉토리 삭제 |

### Edge Cases

| ID | 시나리오 | 기대 동작 | 우선순위 |
|----|----------|-----------|----------|
| E-1 | 팀원 pane이 이미 죽은 상태 | force-kill skip, 레지스트리 pane_dead | P0 |
| E-2 | teammate-registry.json 없는 상태 | 자동 생성 후 진행 | P0 |
| E-3 | TeamDelete가 PDCA hook에 차단 | auto-shutdown이 PDCA 먼저 갱신 후 재시도 | P0 |
| E-4 | 리더 pane도 실수로 kill | 리더(pane_index=0) 보호 로직 | P0 |
| E-5 | 동시 2팀 종료 시도 | 각 팀 레지스트리 독립 (충돌 없음) | P1 |

### 테스트 파일 경로

```
__tests__/hooks/
├── auto-shutdown.test.ts
├── force-team-kill.test.ts
├── teammate-registry.test.ts
├── frontmatter-parser.test.ts    (기구현, 5 테스트 통과)
└── fixtures/
    ├── teammate_registry_active.json
    ├── teammate_registry_mixed.json
    └── team_config_sample.json
```

---

## 7. 제외 범위

- src/ 코드 수정 (이 기획은 hooks/scripts만)
- Claude Code 내부 shutdown 메커니즘 수정 (외부 스크립트로만 제어)
- Slack 알림 연동 (별도 TASK)
- 크로스팀 종료 오케스트레이션 (단일 팀 범위만)
- **teammate-idle.sh 수정/재활성화 (비활성 유지가 정답)**
- BOARD.json 크로스팀 대시보드 (nice-to-have, 이번 범위 아님)

---

## 8. 문서 통합 이력

이 기획서는 아래 3개 기획서를 통합한 것이다:

| 기존 파일 | 주요 내용 | 통합 위치 |
|-----------|-----------|-----------|
| `task-ownership-process.plan.md` | PM 관점 TASK 소유권 프로세스 | 섹션 1-1, 3-1, 3-2 |
| `hook-task-ownership.plan.md` | CTO 관점 Hook 기술 구현 | 섹션 3-1, 3-5, Wave 1 |
| `teammate-lifecycle.plan.md` | 팀원 생명주기 자동화 | 섹션 1-2, 3-3, 3-4, Wave 2 |

기존 파일은 삭제하지 않고 상단에 `> ⚠ 통합됨 → agent-team-operations.plan.md 참조` 표기.

**1 Plan : 1 Design : 1 TASK 원칙 적용**:
- Plan: `docs/01-plan/features/agent-team-operations.plan.md` (이 파일)
- Design: `docs/02-design/features/agent-team-operations.design.md`
- TASK: `.claude/tasks/TASK-AGENT-TEAM-OPS.md`

---

## 9. CC 아키텍처 제약 및 워크어라운드

Claude Code(CLI 도구)의 Agent Teams 프로토콜에 3가지 제약이 있다. Claude AI 모델의 한계가 아닌 CC 도구의 한계이며, 모두 파일/tmux 기반으로 우회 가능.

### 9-1. 크로스팀 SendMessage 불가

| 항목 | 내용 |
|------|------|
| **제약** | SendMessage는 같은 팀 내부만 지원. CC가 팀 간 메시지 라우팅 미구현 |
| **원인** | CC Agent Teams 프로토콜 설계 |
| **워크어라운드** | 파일 릴레이 — 리더 A가 파일 작성 → 리더 B가 읽기 |
| **구현** | `.claude/runtime/cross-team-msg.json` (필요 시 생성) |

**핵심 원칙**: 팀장끼리만 소통하면 된다. 팀원 간 크로스팀 소통이 필요한 상황 자체가 설계 오류.

### 9-2. Hook에서 에이전트 내부 상태 접근 불가

| 항목 | 내용 |
|------|------|
| **제약** | Hook은 shell script. CC가 에이전트 내부 상태를 환경변수/API로 노출하지 않음 |
| **원인** | CC Hook 인터페이스 설계 (shell 기반, 에이전트 런타임 격리) |
| **워크어라운드** | 에이전트가 파일에 상태 기록 → Hook이 파일 읽기 |
| **구현** | `teammate-registry.json`에 에이전트가 자기 상태 write → Hook이 read |

### 9-3. Graceful Shutdown 보장 불가

| 항목 | 내용 |
|------|------|
| **제약** | CC가 shutdown_request를 "강제"할 메커니즘 없음. 에이전트가 무시 가능 |
| **원인** | CC 에이전트 생명주기 프로토콜 (강제 종료 API 미제공) |
| **워크어라운드** | 3단계 프로토콜: Stage 1(요청 10초) → Stage 2(**tmux kill-pane**, OS 레벨 강제) → Stage 3(정리) |
| **보장** | Stage 2의 tmux kill-pane은 에이전트가 무시 불가. 사실상 100% 종료 보장 |

### 9-4. 설계 반영

| 워크어라운드 | 반영 위치 |
|-------------|-----------|
| 파일 릴레이 (크로스팀) | 이번 TASK 범위 외. 단일 팀 운영 우선. 필요 시 cross-team-msg.json 추가 |
| 파일 기반 상태 공유 | W1-3 teammate-registry.json + W1-2 team-context.json |
| 3단계 종료 프로토콜 | W2-1 auto-shutdown.sh (Stage 1→2→3 전체 구현) |
