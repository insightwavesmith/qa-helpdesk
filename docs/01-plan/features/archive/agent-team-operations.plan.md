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
| **핵심 해결** | TASK 프론트매터 소유권 + 팀 상시 유지 모델 + 3단계 종료 자동화 + **claude-peers-mcp 크로스팀 통신** |
| **PDCA 레벨** | L1 (src/ 미수정) |
| **팀 구조** | 2팀 체제 — PM(기획+마케팅 흡수), CTO(개발) |
| **크로스팀 통신** | claude-peers-mcp (MCP 메시지 버스) — 파일 릴레이 → 실시간 메시지 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | ① Hook이 전체 TASK 스캔 → 크로스팀 배정 → 무한 루프 ② 팀원 종료 수동 5~10분 ③ TASK마다 팀 삭제/재생성 반복 |
| **Solution** | TASK 프론트매터로 소유권 명시 + 팀 상시 유지 + 리더 명령 시만 3단계 자동 종료 + **claude-peers-mcp로 크로스팀 실시간 통신** |
| **Function UX Effect** | 팀 한 번 만들면 세션 끝까지 유지. 리더가 SendMessage로 연속 TASK 배정. 종료 시 한 마디면 자동 정리 |
| **Core Value** | 팀 생성/삭제 오버헤드 제거 + 세션당 5~10분 종료 시간 절약 + 토큰 낭비 0 |
| **팀 구조** | 2팀 체제 — **PM팀**(기획+마케팅 흡수), **CTO팀**(개발). MKT 독립팀 폐지 |

---

## 0. 팀 구성 (2팀 체제 — 2026-03-28 확정)

### PM팀 (기획 + 마케팅)

| 역할 | 모델 | 담당 |
|------|------|------|
| **PM 리더** | Opus 4.6 | 기획 총괄, Plan/Design 작성, 팀 조율 |
| pm-researcher | Sonnet 4.6 | 시장 리서치, 경쟁사 분석 |
| pm-strategist | Sonnet 4.6 | 전략 분석, JTBD, Lean Canvas |
| pm-prd | Sonnet 4.6 | PRD 작성, 요구사항 종합 |
| creative-analyst | Sonnet 4.6 | 소재 분석, 5축, DeepGaze |
| lp-analyst | Sonnet 4.6 | LP 분석, 구조/일관성 검증 |
| marketing-strategist | Sonnet 4.6 | 메타 광고 전략, 벤치마크 |

### CTO팀 (개발)

| 역할 | 모델 | 담당 |
|------|------|------|
| **CTO 리더** | Opus 4.6 | 개발 총괄, TASK 분배, 조율 |
| backend-dev | **Opus 4.6** | API, DB, hooks/scripts |
| frontend-dev | **Opus 4.6** | UI, 컴포넌트, 페이지 |
| *(3번째 Opus)* | **Opus 4.6** | TASK별 유동 (architect/infra/security) |
| qa-engineer | Sonnet 4.6 | 검증, Gap 분석, 테스트 |

> CTO팀 코드 작성 역할 전원 Opus 4.6. qa-engineer만 Sonnet.

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
| 03-28 | PM팀이 git commit/push 실행 | CTO 역할 침범 (PM 세션에서 코드 커밋) |

### 1-5. 팀 구조 변경 (2026-03-28 확정)

MKT팀을 PM팀에 흡수. **2팀 체제**로 운영:

| 팀 | 역할 | spawn 가능 |
|----|------|-----------|
| **PM** | 기획 + 마케팅 + 리서치 + 분석 | pm-*, researcher, creative-analyst, lp-analyst, marketing-strategist |
| **CTO** | 개발 + 구현 + 검증 | backend-dev, frontend-dev, qa-engineer |

**이유**: MKT 독립팀의 업무(광고 분석, LP 분석, 크리에이티브)가 PM 기획 흐름과 밀접. 별도 팀 운영 시 오버헤드만 증가.

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

### D-5. 크로스팀 통신: claude-peers-mcp 도입

**기존**: 크로스팀 SendMessage 불가 → 파일 릴레이(TASK 문서)로 우회
**변경**: claude-peers-mcp (MCP 메시지 버스)로 실시간 크로스팀 통신

| 항목 | 내용 |
|------|------|
| **도구** | [claude-peers-mcp](https://github.com/louislva/claude-peers-mcp) |
| **동작** | 로컬 SQLite 브로커 (localhost:7899) + MCP stdio 서버 |
| **API** | `list_peers` (동료 조회), `send_message` (메시지 전송), `check_messages` (수신), `set_summary` (상태 설정) |
| **등록** | 세션 시작 시 브로커에 자동 등록 (8자리 peer ID), 하트비트 1초 |
| **메시지** | SQLite에 persist, 수신 전까지 보존, 즉시 알림 |
| **범위** | 같은 머신 내 **모든 MCP 클라이언트** — CC 세션 + 오픈클로 에이전트 |

**통신 참여자 (3종):**

```
[CC PM 세션]      ──┐
[CC CTO 세션]     ──┼──→ claude-peers-mcp (localhost:7899) ──→ 통합 메시지 버스
[오픈클로 mozzi]  ──┘
```

| 참여자 | 런타임 | MCP 연결 방식 |
|--------|--------|---------------|
| PM 리더 | Claude Code (tmux) | `claude mcp add claude-peers` |
| CTO 리더 | Claude Code (tmux) | `claude mcp add claude-peers` |
| mozzi (PM) | OpenClaw | agents.list[].mcp.servers에 claude-peers 등록 |

**오픈클로 설정:**
```json
{
  "agents": {
    "list": [{
      "id": "mozzi",
      "mcp": {
        "servers": [{
          "name": "claude-peers",
          "command": "bun",
          "args": ["~/claude-peers-mcp/server.ts"]
        }]
      }
    }]
  }
}
```

**통신 시나리오:**

| 발신 | 수신 | 예시 |
|------|------|------|
| mozzi (오픈클로) | PM 리더 | "신규 기능 요청: 리포트 GCS 이관" |
| mozzi (오픈클로) | CTO 리더 | "긴급 핫픽스 필요: 프로덕션 에러" |
| PM 리더 | CTO 리더 | "TASK-XXX Plan+Design 완료, Do 진행해" |
| CTO 리더 | PM 리더 | "설계 변경 필요: API 스키마 수정 제안" |
| CTO 리더 | mozzi | "구현 완료, QA 요청" |
| PM 리더 | mozzi | "기획 완료 보고" |

**프로세스 변경:**

| 기존 (파일 릴레이) | 변경 (claude-peers-mcp) |
|-------------------|------------------------|
| PM이 TASK 파일 작성 → CTO가 파일 읽기 | PM이 `send_message("CTO", "TASK-XXX 진행해")` → CTO 즉시 수신 |
| CTO가 피드백 문서 기록 → PM이 읽기 | CTO가 `send_message("PM", "설계 변경 필요")` → PM 즉시 수신 |
| Smith님이 직접 tmux 전환해서 지시 | mozzi가 `send_message`로 직접 팀장에게 전달 |
| 팀 상태: tmux 수동 확인 | `list_peers(scope: "repo")` → 모든 참여자 조회 |
| 핸드오프 지연: 상대 팀이 파일 읽을 때까지 대기 | 즉시 전달 + 알림 |

**TASK 파일 역할 변경:**
- **기존**: 상세 스펙 + 핸드오프 신호 (겸용)
- **변경**: 상세 스펙 전용. 핸드오프 신호는 MCP 메시지로 전달

**설치:**
```bash
git clone https://github.com/louislva/claude-peers-mcp.git ~/claude-peers-mcp
cd ~/claude-peers-mcp && bun install
claude mcp add --scope user --transport stdio claude-peers -- bun ~/claude-peers-mcp/server.ts
```

**전제 조건:** Bun 런타임 필요

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

### Wave 0: claude-peers-mcp 설치 (선행 — 다른 Wave에 영향 없음)

| ID | 작업 | 파일 | 담당 |
|----|------|------|------|
| W0-1 | Bun 런타임 설치 확인 | 시스템 | backend-dev |
| W0-2 | claude-peers-mcp 클론 + 설치 | `~/claude-peers-mcp/` | backend-dev |
| W0-3 | MCP 서버 등록 (`claude mcp add`) | `~/.claude/settings.json` | backend-dev |
| W0-4 | PM↔CTO 세션 간 `send_message` / `list_peers` 동작 검증 | 수동 테스트 | qa-engineer |
| W0-5 | 세션 시작 시 `set_summary` 자동 호출 프로토콜 정의 | CLAUDE.md 초안 | backend-dev |

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

## 6. 테스트 시나리오 (TDD — 전체 사고 이력 기반)

> 03-25~03-28 에이전트팀 자동화 과정에서 겪은 **모든 사고**를 테스트로 문서화.
> Wave 구현 시 **Red(실패) → Green(통과) → Refactor** 순서로 진행.

### 6-1. Happy Path (정상 동작)

| ID | 시나리오 | 기대 결과 | 파일 |
|----|----------|-----------|------|
| UT-1 | auto-shutdown 정상 종료 (2명, 모두 shutdown_approved) | 레지스트리 2명 terminated, pane 0개 | auto-shutdown.test.ts |
| UT-2 | auto-shutdown 강제 종료 (1명 shutdown 무시) | Stage 2에서 force-kill, 레지스트리 force_kill | auto-shutdown.test.ts |
| UT-3 | 팀 상시 유지: TASK 완료 → 다음 TASK SendMessage | 팀 유지, 팀원 active 상태 지속 | teammate-registry.test.ts |
| UT-4 | 세션 종료: auto-shutdown → TeamDelete | 전원 terminated, 팀 디렉토리 삭제 | auto-shutdown.test.ts |
| UT-5 | 프론트매터 team: CTO인 TASK만 CTO팀에서 스캔 | 타 팀 TASK 무시 | frontmatter-parser.test.ts |
| UT-6 | team-context.json 로드 → TEAM_NAME, TASK_FILES 변수 설정 | 정상 파싱 | frontmatter-parser.test.ts |
| UT-7 | 프론트매터 내부 `- [ ]`는 체크박스로 오인 안 함 | scan_unchecked에서 제외 | frontmatter-parser.test.ts |

### 6-2. 실제 사고 기반 회귀 테스트 (Regression)

> **모든 항목은 실제 발생한 사고.** 날짜, 원인, 재발 방지 테스트를 명시.

#### A. idle 루프 / 크로스팀 배정 사고

| ID | 사고 (날짜) | 원인 | 테스트 | 파일 |
|----|------------|------|--------|------|
| REG-4 | pm-test-scenario idle 루프 30분 (03-25) | TeammateIdle hook이 팀 구분 없이 전체 TASK 스캔 → 크로스팀 배정 → 권한 없음 → 실패 → 재배정 무한루프 | CTO팀 팀원이 PM TASK를 배정받지 않아야 함 | regression.test.ts |
| REG-5 | TASK 프론트매터 team 필드 누락 (03-25) | team 필드 없으면 소유권 필터링 불가 → 모든 팀에 노출 | 모든 TASK-*.md에 team 필드 존재해야 함 | regression.test.ts |
| INC-1 | pm-researcher idle→available 무한반복 (03-28) | 완료 보고 후에도 idle notification 재발 → 다시 available → 같은 TASK 재배정 | 완료 보고된 TASK는 재배정 안 됨. status: completed인 TASK scan 제외 | teammate-idle.test.ts |
| INC-2 | 기획팀에서 backend-dev spawn 시도 (03-28) | 팀 역할 경계 미강제. PM 세션에서 CTO 팀원 생성 가능 | 팀 정의에 없는 역할 spawn 시 차단 (enforce-teamcreate.sh) | regression.test.ts |

#### B. 종료 실패 사고

| ID | 사고 (날짜) | 원인 | 테스트 | 파일 |
|----|------------|------|--------|------|
| INC-3 | backend-dev 좀비 프로세스 (03-26) | TeamDelete 후 tmux pane 잔존. kill-pane 미실행 | TeamDelete 후 tmux list-panes에 해당 pane 없어야 함 | force-team-kill.test.ts |
| INC-4 | doc-writer shutdown_approved 후 idle 유지 (03-28) | shutdown_approved 전송했지만 프로세스 미종료. CC가 강제 종료 미지원 | Stage 1(10초) 후 미종료 → Stage 2 force-kill 자동 실행 | auto-shutdown.test.ts |
| INC-5 | shutdown_request 무시 반복 (03-25~28, 다수) | 팀원이 shutdown_request를 무시하고 idle 루프 재진입 | shutdown_pending 상태에서 10초 후 → force_kill로 전이 | auto-shutdown.test.ts |
| INC-6 | TeamDelete PDCA hook 차단 (03-28) | docs/.pdca-status.json 미갱신 상태에서 TeamDelete → validate-pdca hook이 차단 | auto-shutdown Stage 3에서 PDCA updatedAt 자동 갱신 후 TeamDelete | auto-shutdown.test.ts |
| INC-7 | 좀비 팀 디렉토리 누적 (03-26~28) | ~/.claude/teams/ 에 정리 안 된 폴더 남음 | TeamDelete 후 해당 팀 디렉토리 없어야 함 | auto-shutdown.test.ts |

#### C. Hook 설정 사고

| ID | 사고 (날짜) | 원인 | 테스트 | 파일 |
|----|------------|------|--------|------|
| REG-1 | settings에 등록된 hook 파일 미존재 (03-25) | notify-openclaw.sh 삭제했지만 settings에 경로 남음 → hook 실행 시 에러 | settings의 모든 bash 경로가 실제 파일로 존재 | regression.test.ts |
| REG-2 | permissionMode 위치 오류 (03-25) | permissionMode가 hooks 내부에 중첩 → bypassPermissions 무효 → 팀원 퍼미션 프롬프트 차단 | permissionMode가 settings.local.json 최상위에 위치 | regression.test.ts |
| REG-3 | settings.json/local.json hook 중복 실행 (03-26) | 양쪽에 같은 hook 등록 → 2회 실행 | settings.json hooks 섹션 비어있어야 함 | regression.test.ts |
| REG-6 | 삭제된 파일 참조 잔존 (03-26) | notify-openclaw.sh, notify-hook.sh 삭제 후 settings에 참조 남음 | 삭제된 파일명이 settings에 없어야 함 | regression.test.ts |
| REG-7→INC-8 | TeammateIdle 빈 배열 ↔ 비활성 충돌 (03-25~28) | 초기: 실수로 비워서 idle hook 무동작 → 이후: **의도적으로 비움** (D-2 결정). 테스트 방향 반전 필요 | **변경**: TeammateIdle이 빈 배열 `[]`이어야 함 (기존 REG-7 반전) | regression.test.ts |
| REG-8 | permissionMode 양쪽 불일치 (03-26) | settings.json과 settings.local.json 값 다름 → 팀원 동작 불일치 | 양쪽 모두 bypassPermissions | regression.test.ts |
| REG-10 | settings.json 내부 hooks 배열 비어있지 않음 (03-27) | 이벤트 객체 안 hooks[] 채워지면 settings.local.json과 중복 실행 | settings.json 이벤트 내부 hooks[] 비어있어야 함 | regression.test.ts |

#### D. PDCA 프로세스 사고

| ID | 사고 (날짜) | 원인 | 테스트 | 파일 |
|----|------------|------|--------|------|
| REG-9 | detect-process-level L0~L3 판단 오류 (03-27) | L0~L3 분기 조건 잘못되면 Plan/Design 스킵 또는 과도한 요구 | fix: → L0, src/ 없음 → L1, src/ 수정 → L2, migration/auth → L3 | regression.test.ts |
| INC-9 | 리더가 직접 코드 작성 (03-25~26, 다수) | validate-delegate.sh 없었음 → 리더가 src/ 직접 수정 | 리더(IS_TEAMMATE=false)가 src/ Write/Edit 시 차단 | regression.test.ts |
| INC-10 | 팀원이 PDCA hook 차단당함 (03-26) | pdca-update.sh가 팀원에게도 실행 → PDCA 갱신 권한 없어 차단 | IS_TEAMMATE=true이면 모든 PDCA hook 즉시 exit 0 통과 | regression.test.ts |
| INC-11 | 토큰 낭비: idle 상태 방치 (03-25~28, 상시) | 팀원 완료 후 TeamDelete 안 하고 idle 방치 → 500토큰/분 소모 | auto-team-cleanup 알림 후 10분 내 리더 액션 없으면 경고 | auto-team-cleanup.test.ts |

#### E. 팀 구조 / 역할 사고

| ID | 사고 (날짜) | 원인 | 테스트 | 파일 |
|----|------------|------|--------|------|
| INC-12 | PM팀이 커밋+push 실행 (03-28) | PM팀 세션에서 git commit/push → CTO 역할 침범 | PM팀 세션에서 git commit 시도 시 역할 경고 | regression.test.ts |
| INC-13 | TASK 파일에 팀 접두사 불일치 (03-26) | TASK-ORGANIC-PHASE2.md가 MKT/CTO 양쪽 소속 → 소유권 모호 | 하나의 TASK 파일은 하나의 team만 가져야 함 | frontmatter-parser.test.ts |
| INC-14 | 비활성 기능 재활성화 제안 (03-28) | TeammateIdle을 "개선해서 다시 켜자" 제안 → D-2 위반 | TeammateIdle 재활성화 시도 시 차단 (설정 변경 감지) | regression.test.ts |

#### F. 크로스팀 통신 (claude-peers-mcp)

| ID | 시나리오 | 기대 결과 | 파일 |
|----|----------|-----------|------|
| INC-15 | PM→CTO `send_message` 전송 | CTO 세션에서 `check_messages`로 수신 | peers-mcp.test.ts |
| INC-16 | `list_peers(scope: "repo")` 호출 | 같은 레포 작업 중인 PM+CTO 세션 2개 표시 | peers-mcp.test.ts |
| INC-17 | CTO 세션 종료 후 `list_peers` | 종료된 세션 목록에서 제거됨 (하트비트 타임아웃) | peers-mcp.test.ts |
| INC-18 | 브로커 미실행 상태에서 `send_message` | 브로커 자동 시작 또는 graceful 에러 | peers-mcp.test.ts |

### 6-3. Edge Cases (미발생이지만 위험)

| ID | 시나리오 | 기대 동작 | 우선순위 |
|----|----------|-----------|----------|
| E-1 | 팀원 pane이 이미 죽은 상태에서 force-kill 시도 | tmux kill-pane skip, 레지스트리 pane_dead로 기록 | P0 |
| E-2 | teammate-registry.json 파일 손상 (invalid JSON) | 파일 삭제 → config.json에서 재생성 | P0 |
| E-3 | team-context.json 없는 상태에서 hook 실행 | 프론트매터 직접 파싱으로 폴백 | P0 |
| E-4 | 리더 pane(index=0)을 force-team-kill이 kill 시도 | 절대 kill 안 함 (skip + 경고) | P0 |
| E-5 | 동시 2팀 종료 시도 | 각 팀 레지스트리 독립, 충돌 없음 | P1 |
| E-6 | config.json isActive=false인데 pane은 살아있음 | tmux kill-pane으로 실제 종료 강제 | P0 |
| E-7 | jq 미설치 환경 | grep/sed 폴백으로 레지스트리 파싱 | P1 |
| E-8 | 프론트매터 없는 레거시 TASK 파일 | team: "" 간주, 모든 팀에서 접근 가능 (하위 호환) | P1 |

### 6-4. 테스트 파일 경로

```
__tests__/hooks/
├── regression.test.ts              (기구현, REG-1~10 + INC-* 추가 필요)
├── frontmatter-parser.test.ts      (기구현, 5 테스트 통과)
├── teammate-idle.test.ts           (기구현, 7 테스트 통과)
├── auto-shutdown.test.ts           (미구현 — Wave 2 TDD Red 단계)
├── force-team-kill.test.ts         (미구현 — Wave 2 TDD Red 단계)
├── teammate-registry.test.ts       (미구현 — Wave 1 TDD Red 단계)
├── auto-team-cleanup.test.ts       (미구현 — Wave 3 TDD Red 단계)
└── fixtures/
    ├── teammate_registry_active.json
    ├── teammate_registry_mixed.json
    ├── teammate_registry_shutdown.json
    ├── team_config_sample.json
    ├── task_with_frontmatter.md
    ├── task_without_frontmatter.md
    └── task_cross_team.md
```

### 6-5. REG-7 반전 필수 (Breaking Change)

**기존 REG-7**: "TeammateIdle hooks가 비어있지 않아야 함" (빈 배열 방지)
**변경 REG-7**: "TeammateIdle이 빈 배열 `[]`이어야 함" (D-2 결정 반영)

```typescript
// 변경 전 (현재 코드):
expect(idleHooks.length).toBeGreaterThan(0)

// 변경 후:
expect(idleHooks.length, 'TeammateIdle은 빈 배열이어야 함 — D-2 결정').toBe(0)
```

**이유**: 03-25 사고로 TeammateIdle을 영구 비활성화(D-2). REG-7은 원래 "실수로 비웠을 때"를 방지했지만, 지금은 "의도적 비활성"이 올바른 상태.

### 6-6. 사고 통계 요약

| 카테고리 | 건수 | 테스트 커버 | 미커버 |
|----------|:----:|:-----------:|:------:|
| idle 루프 / 크로스팀 | 4건 | REG-4, REG-5 통과 | INC-1, INC-2 미구현 |
| 종료 실패 | 5건 | 0건 | INC-3~7 전부 미구현 |
| Hook 설정 | 7건 | REG-1,2,3,6,7,8,10 통과 | REG-7 반전 필요 |
| PDCA 프로세스 | 4건 | REG-9 통과 | INC-9,10,11 미구현 |
| 팀 구조 / 역할 | 3건 | 0건 | INC-12,13,14 미구현 |
| 크로스팀 통신 | 4건 | 0건 | INC-15~18 미구현 (Wave 0) |
| **합계** | **27건** | **10건 통과** | **17건 미구현** |

> CTO팀 구현 시 미구현 17건을 Red 단계로 먼저 작성해야 함.

---

## 7. 제외 범위

- src/ 코드 수정 (이 기획은 hooks/scripts만)
- Claude Code 내부 shutdown 메커니즘 수정 (외부 스크립트로만 제어)
- Slack 알림 연동 (별도 TASK)
- ~~크로스팀 통신 (파일 릴레이만)~~ → **claude-peers-mcp로 범위 내 전환**
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

### 9-1. 크로스팀 SendMessage 불가 → **claude-peers-mcp로 해결**

| 항목 | 내용 |
|------|------|
| **제약** | CC 내장 SendMessage는 같은 팀 내부만 지원 |
| **원인** | CC Agent Teams 프로토콜 설계 |
| **~~워크어라운드~~** | ~~파일 릴레이 — 리더 A가 파일 작성 → 리더 B가 읽기~~ |
| **해결책** | **claude-peers-mcp** — MCP 메시지 버스로 크로스 세션 실시간 통신 |
| **구현** | `claude mcp add claude-peers` → `send_message` / `check_messages` / `list_peers` |

**핵심 원칙 유지**: 팀장끼리만 소통. 팀원 간 크로스팀 소통은 설계 오류.
**TASK 파일 역할**: 상세 스펙 전용 (핸드오프 신호는 MCP 메시지).
**파일 릴레이 폐기**: `.claude/runtime/cross-team-msg.json` 불필요. 삭제 대상.

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
| ~~파일 릴레이~~ → **claude-peers-mcp** | **W0 범위 내**. `send_message` / `list_peers`로 크로스팀 실시간 통신 |
| 파일 기반 상태 공유 | W1-3 teammate-registry.json + W1-2 team-context.json |
| 3단계 종료 프로토콜 | W2-1 auto-shutdown.sh (Stage 1→2→3 전체 구현) |
