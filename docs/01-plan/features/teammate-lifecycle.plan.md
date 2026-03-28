# 팀원 생명주기 관리 기획서

> **통합됨 → `agent-team-operations.plan.md` 참조. 이 파일은 이력 보존용.**

> 작성일: 2026-03-28
> 작성자: PM (Leader)
> 상태: ~~Plan~~ → Archived (통합됨)
> 프로세스 레벨: L2 (hooks/scripts 수정)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 팀원 생명주기(spawn→작업→종료) 자동화 |
| **핵심 문제** | shutdown_request 무시 → 수동 tmux kill 반복 → 토큰 낭비 |
| **핵심 해결** | 3단계 Graceful Shutdown + 팀원 상태 레지스트리 + 자동 타임아웃 |
| **가치** | 리더 수동 개입 제거, 토큰 낭비 방지, 팀 정리 완전 자동화 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 팀원 종료가 매번 수동 (shutdown 무시 → tmux kill → TeamDelete 차단 → PDCA 갱신 → 재시도). 세션마다 5~10분 낭비 |
| **Solution** | 3단계 자동 종료 프로토콜 + 상태 레지스트리로 종료 전 과정 자동화 |
| **Function UX Effect** | 리더가 "작업 끝" 한 마디면 전체 팀 자동 정리. 수동 tmux 조작 불필요 |
| **Core Value** | 세션당 5~10분 절약 × 일 5~10회 = 하루 25~100분 절약. 토큰 낭비 0 |

---

## 1. 문제 정의

### 1-1. 현재 팀원 종료 흐름 (수동, 5~7단계)

```
① Leader: SendMessage shutdown_request
② 대기 10초...
③ 팀원 응답 없음 (idle 루프 진입)
④ Leader: tmux capture-pane으로 상태 확인
⑤ Leader: tmux kill-pane -t %XX 수동 실행
⑥ Leader: PDCA 상태 파일 갱신
⑦ Leader: TeamDelete (hook이 PDCA 갱신 확인)
```

**문제**: ①~⑤가 팀원 수만큼 반복. 3명이면 15단계.

### 1-2. 반복 발생 사고

| 날짜 | 사고 | 원인 | 대응 |
|------|------|------|------|
| 03-25 | pm-test-scenario idle 루프 30분 | shutdown 무시, PDCA 체크 무한 | tmux kill-pane 수동 |
| 03-26 | backend-dev 좀비 프로세스 | TeamDelete 후 pane 잔존 | force-team-kill.sh 작성 (미등록) |
| 03-28 | doc-writer shutdown 후 idle 유지 | shutdown_approved 전송했지만 프로세스 미종료 | tmux kill-pane 수동 |
| 03-28 | pm-researcher idle notification 반복 | 완료 보고 후에도 idle → available 반복 | shutdown_request → 수동 확인 |

### 1-3. 영향

| 영향 | 수치 |
|------|------|
| 리더 수동 개입 시간 | 세션당 5~10분 |
| 토큰 낭비 (idle 루프) | 팀원당 ~500토큰/분 × idle 시간 |
| 좀비 프로세스 | 세션 종료 후 tmux pane 잔존 |
| 좀비 팀 디렉토리 | ~/.claude/teams/ 에 정리 안 된 폴더 누적 |

---

## 2. 목표 종료 흐름 (자동, 1단계)

```
① Leader: "작업 끝" (또는 TaskCompleted 자동 트리거)
   ↓ (이후 전부 자동)
② auto-shutdown.sh: 각 팀원에게 shutdown_request 발송
③ 10초 대기
④ 미종료 팀원 → force-team-kill.sh 자동 실행 (tmux kill-pane)
⑤ teammate-registry.json 상태 갱신 (terminated)
⑥ PDCA 상태 파일 자동 갱신
⑦ TeamDelete 자동 실행
⑧ 좀비 디렉토리 정리
```

**리더 개입: 0단계. 전부 자동.**

---

## 3. 해결 방안

### 3-1. 3단계 Graceful Shutdown Protocol

| 단계 | 트리거 | 행동 | 타임아웃 |
|------|--------|------|----------|
| **Stage 1: 요청** | 리더 명시적 호출 또는 모든 TASK 완료 | SendMessage shutdown_request 전송 | 10초 |
| **Stage 2: 강제** | Stage 1 타임아웃 | force-team-kill.sh 실행 (tmux kill-pane + isActive=false) | 즉시 |
| **Stage 3: 정리** | Stage 2 완료 | PDCA 갱신 + TeamDelete + 좀비 디렉토리 삭제 | 5초 |

### 3-2. 팀원 상태 레지스트리

**파일**: `.claude/runtime/teammate-registry.json`

팀원의 전체 생명주기를 중앙 추적:

```json
{
  "team": "process-report",
  "updatedAt": "2026-03-28T13:10:00",
  "members": {
    "pm-researcher": {
      "state": "terminated",
      "spawnedAt": "2026-03-28T13:00:00",
      "lastActiveAt": "2026-03-28T13:08:00",
      "terminatedAt": "2026-03-28T13:09:46",
      "terminatedBy": "shutdown_approved",
      "paneId": "%29",
      "tasksCompleted": 4
    },
    "doc-writer": {
      "state": "terminated",
      "spawnedAt": "2026-03-28T13:05:00",
      "lastActiveAt": "2026-03-28T13:15:00",
      "terminatedAt": "2026-03-28T13:16:30",
      "terminatedBy": "force_kill",
      "paneId": "%30",
      "tasksCompleted": 1
    }
  }
}
```

**state 값**: `spawning` → `active` → `idle` → `shutdown_pending` → `terminated`

### 3-3. Hook 개선/신규

| Hook | 현재 | 개선 |
|------|------|------|
| `auto-team-cleanup.sh` | TASK 완료 알림만 (exit 0) | Stage 1 자동 트리거 + 레지스트리 갱신 |
| `force-team-kill.sh` | **미등록** (수동 실행만 가능) | 신규 이벤트에 등록 또는 auto-team-cleanup에서 호출 |
| `teammate-idle.sh` | **비활성 (빈 배열)** | **비활성 유지** — 작업 배정은 SendMessage로 수행. 종료도 auto-shutdown.sh가 담당 |
| **신규: auto-shutdown.sh** | 없음 | 3단계 프로토콜 오케스트레이터 |

### 3-4. settings.local.json 변경

auto-shutdown은 auto-team-cleanup.sh 내부에서 호출되므로 별도 Hook 등록 불필요.
**TeammateIdle은 비활성 유지** — 작업 배정은 리더 SendMessage, 종료는 auto-shutdown.sh.

```json
{
  "TeammateIdle": []
}
```

> 변경 없음. 현재 비활성 상태가 올바른 설정.

---

## 4. 구현 범위

### Wave 1: 핵심 (의존성 없음)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W1-1 | teammate-registry.json 스키마 + 초기화 로직 | `.claude/runtime/teammate-registry.json` | backend-dev |
| W1-2 | auto-shutdown.sh 신규 작성 (3단계 프로토콜) | `.claude/hooks/auto-shutdown.sh` | backend-dev |
| W1-3 | force-team-kill.sh 개선 (레지스트리 갱신 추가) | `.claude/hooks/force-team-kill.sh` | backend-dev |

### Wave 2: 통합 (Wave 1 완료 후)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W2-1 | auto-team-cleanup.sh 개선 (auto-shutdown 호출) | `.claude/hooks/auto-team-cleanup.sh` | backend-dev |
| W2-2 | settings.local.json Hook 등록 정비 (TeammateIdle 비활성 유지 확인) | `.claude/settings.local.json` | backend-dev |

### Wave 3: 검증

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W3-1 | 다팀 시뮬레이션 (spawn→작업→자동종료 전체 플로우) | 수동 테스트 | qa-engineer |
| W3-2 | 좀비 프로세스 0건 확인 (tmux list-panes) | 수동 테스트 | qa-engineer |
| W3-3 | Gap 분석 | `docs/03-analysis/` | qa-engineer |

---

## 5. 성공 기준

| 기준 | 측정 | 목표 |
|------|------|------|
| 리더 수동 tmux kill | 세션당 횟수 | 0회 |
| 팀원 종료 소요 시간 | shutdown 시작~TeamDelete 완료 | < 20초 |
| 좀비 pane | tmux list-panes에서 잔존 pane | 0개 |
| 좀비 팀 디렉토리 | ~/.claude/teams/ 잔여 | 0개 |
| 토큰 낭비 (idle 루프) | 종료 후 idle notification 횟수 | 0회 |

---

## 6. 성공 기준 (테스트 시나리오)

### Happy Path
| ID | 시나리오 | 입력 | 기대 결과 |
|----|----------|------|-----------|
| UT-1 | auto-shutdown 정상 종료 | 팀원 2명, 모두 shutdown_approved | 레지스트리 2명 terminated, pane 0개 |
| UT-2 | auto-shutdown 강제 종료 | 팀원 1명 shutdown 무시 | Stage 2에서 force-kill, 레지스트리 force_kill |
| UT-3 | auto-team-cleanup 자동 트리거 | 모든 TASK 완료 | auto-shutdown 자동 호출 |

### Edge Cases
| ID | 시나리오 | 기대 동작 | 우선순위 |
|----|----------|-----------|----------|
| E-1 | 팀원 pane이 이미 죽은 상태 | force-kill이 skip, 레지스트리만 갱신 | P0 |
| E-2 | teammate-registry.json 없는 상태 | 자동 생성 후 진행 (하위 호환) | P0 |
| E-3 | TeamDelete가 PDCA hook에 차단 | auto-shutdown이 PDCA 먼저 갱신 후 재시도 | P0 |
| E-4 | 동시 2팀 종료 시도 | 각 팀 레지스트리 독립 (충돌 없음) | P1 |
| E-5 | 리더 pane도 실수로 kill | 리더(pane_index=0) 보호 로직 | P0 |

### Mock Data
```json
// fixtures/teammate_registry_active.json
{
  "team": "test-team",
  "members": {
    "backend-dev": { "state": "active", "paneId": "%10" },
    "frontend-dev": { "state": "idle", "paneId": "%11" }
  }
}
```

### 테스트 파일 경로
```
__tests__/hooks/
├── auto-shutdown.test.ts
├── force-team-kill.test.ts
├── teammate-registry.test.ts
└── fixtures/
    ├── teammate_registry_active.json
    ├── teammate_registry_mixed.json
    └── team_config_sample.json
```

---

## 7. 제외 범위

- Claude Code 내부 shutdown 메커니즘 수정 (CC 외부에서 제어 불가)
- Slack 알림 연동 (별도 기능)
- 크로스팀 종료 오케스트레이션 (단일 팀 범위만)
