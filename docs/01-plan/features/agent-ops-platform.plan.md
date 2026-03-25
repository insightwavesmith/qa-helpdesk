# Agent Ops Platform — 에이전트팀 자동 오케스트레이션 통합 기획서

> 작성일: 2026-03-25
> 작성자: PM팀 수석 기획자
> 상태: Plan 완료
> 통합 대상 설계서: slack-notification, orchestration-chain, web-terminal-dashboard, agent-dashboard

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | Smith님 없어도 에이전트팀이 자동으로 돌아가는 시스템 |
| **핵심 원칙** | 규칙이 아닌 프로세스로 강제 |
| **구성요소** | 7개 (chain-watcher, state-sync, idle-detector, 슬랙 알림, 웹 터미널, PDCA sync, 세션 복구) |
| **통합 설계서** | 4개 기존 설계서 통합 |
| **레퍼런스** | 6개 업계 표준 패턴 적용 |
| **핵심 가치** | Smith님은 브라우저에서 3팀 실시간 모니터링 + 슬랙으로 이벤트 자동 수신. 모찌는 중계자에서 승인자로 역할 전환 |

---

## 1. 현재 문제 분석

Smith님이 직접 언급한 5가지 문제를 각각 상세히 분석한다.

### 1.1 팀 간 소통 끊김 (모찌 병목)

| 항목 | 내용 |
|------|------|
| **현상** | PM팀이 기획 완료 후 마커 파일(`pm-plan-done.md`)을 `/tmp/cross-team/`에 생성하지만, CTO팀이 이를 자동으로 인지하지 못함 |
| **현재 대응** | 모찌(COO)가 수동으로 마커 파일 확인 → 슬랙에서 다음 팀에 TASK 전달 → 해당 팀이 슬랙 보고 작업 시작 |
| **왜 안 되는가** | 모찌가 다른 작업 중이면 전달 지연 30분~수시간. 체인 규칙이 `chain-detector.ts`에 4개 정의되어 있지만, 이를 자동 실행하는 프로세스가 없음. `agent-slack-notify.sh` 훅은 TaskCompleted 이벤트에서만 동작하고, 마커 파일 생성을 감시하지 않음 |
| **정량 데이터** | 현재 체인 전달 평균 지연: 모찌 수동 확인 기반으로 30분~수시간 (정확 측정 불가) |
| **필요한 시스템** | **chain-watcher 데몬**: `/tmp/cross-team/` 마커 파일 자동 감지 → 체인 규칙 매칭 → 슬랙 알림 + 다음 팀 자동 트리거. 모찌 역할을 중계자 → 승인자로 전환 |

### 1.2 idle 감지 불가

| 항목 | 내용 |
|------|------|
| **현상** | 에이전트팀이 5분 이상 아무 활동 없이 멈춰 있어도 아무도 감지하지 못함 |
| **현재 대응** | Smith님이 직접 tmux 세션에 접속해서 확인. 또는 슬랙에 진행 보고가 없으면 의심 후 확인 |
| **왜 안 되는가** | state.json의 `updatedAt`은 TASK 상태 변경 시에만 갱신됨. 팀이 "생각 중"인지 "멈춘" 건지 구분 불가. tmux 세션 자체가 죽었는지도 자동 감지 없음 |
| **정량 데이터** | 현재 idle 감지 시간: 불확정 (Smith님 수동 발견 의존) |
| **필요한 시스템** | **idle-detector**: state.json 마지막 갱신 시각 모니터링 + tmux 세션 alive 확인 → 5분 무갱신 시 슬랙 경고 + CEO DM |

### 1.3 규칙 의존 = 변수 발생

| 항목 | 내용 |
|------|------|
| **현상** | CLAUDE.md에 규칙을 작성해도 리더가 안 지키거나, 컨텍스트 윈도우의 60% 이상 사용 시 규칙이 밀려나서 무시됨 |
| **현재 대응** | CLAUDE.md에 "절대 규칙" 9개 + "필수 프로세스" 명시. PreToolUse 훅으로 일부 차단 (main push, `-p` 차단) |
| **왜 안 되는가** | 규칙은 에이전트가 "읽고 따르겠다"는 의지에 의존. 컨텍스트가 커지면 초반 지시가 약해짐 (Osmani 연구: 단일 에이전트 ~60% 진행 시 성능 저하). 현재 훅은 PreToolUse(파일 수정 전), TaskCompleted(작업 완료 후) 두 시점만 커버 |
| **정량 데이터** | 규칙 위반 사례: QA 게이트 마커 touch로 우회, 설계서 없이 코딩 시작, PDCA 상태 미갱신 등 |
| **필요한 시스템** | **Hook 기반 강제 시스템**: TaskCompleted에서 exit code 2로 완료 거부 (QA 미통과 시), PreToolUse에서 설계서 존재 확인, validate-task/validate-qa/enforce-plan-before-do 훅 체계화 |

### 1.4 세션 컨텍스트 유실

| 항목 | 내용 |
|------|------|
| **현상** | 에이전트 세션이 크래시되거나 컨텍스트 90% 도달로 종료될 때, 이전 작업 맥락이 사라짐 |
| **현재 대응** | MEMORY.md 수동 기록 (세션 종료 시 마지막 행동으로 기록). 새 세션 시작 시 MEMORY.md 읽어서 복원 |
| **왜 안 되는가** | 세션 크래시 시에는 MEMORY.md 기록 기회가 없음. 정상 종료 시에도 기록 품질이 일관되지 않음 (어떤 정보를 저장할지 에이전트 판단에 의존). 새 세션이 MEMORY.md를 읽어도 실제 코드 상태와의 갭 존재 |
| **정량 데이터** | 수동 MEMORY.md 기반 복구 시간: 10~30분 (TASK.md + 코드 상태 재탐색 포함) |
| **필요한 시스템** | **Checkpoint/Resume**: 구조화된 컨텍스트 객체를 주기적으로 디스크에 자동 저장. 세션 재시작 시 checkpoint.json 로드하여 즉시 이어서 작업. Microsoft Checkpointing + GuruSup Structured Context 패턴 적용 |

### 1.5 PDCA 싱크 불일치

| 항목 | 내용 |
|------|------|
| **현상** | `.pdca-status.json`의 기능별 상태(phase, matchRate)와 실제 구현 상태가 일치하지 않음 |
| **현재 대응** | CLAUDE.md에 "상태 업데이트 (절대 규칙)" 명시. 커밋 전 `.pdca-status.json` 업데이트 안 됐으면 커밋 금지 규칙 |
| **왜 안 되는가** | 에이전트가 구현에 집중하면 PDCA 갱신을 잊음. 두 개의 pdca-status.json (루트 + docs/) 동시 갱신 필요 → 하나만 갱신하는 경우 빈번. 수동 갱신이므로 phase 전환 타이밍 불일치 |
| **정량 데이터** | 마스터플랜 감사 분석에서 8건/67 (12%) 불일치 발견 |
| **필요한 시스템** | **PDCA 자동 싱크**: TaskCompleted 훅에서 해당 feature의 PDCA 상태 자동 갱신. TASK 완료 → phase 자동 전환. 빌드 성공 + Gap 분석 완료 → matchRate 자동 기록. 두 파일 동시 갱신 보장 |

---

## 2. 업계 레퍼런스 비교 분석

### 2.1 레퍼런스 개요 테이블

| # | 레퍼런스 | 핵심 패턴 | 우리 시스템 적용 포인트 |
|---|---------|-----------|----------------------|
| R1 | Claude Code Agent Teams (공식) | TeammateIdle + TaskCompleted 훅, Task 시스템, Inbox 메시징, Delegate 모드 | idle-detector, QA 게이트, 팀원 간 직접 메시징 |
| R2 | Swarm Orchestration Skill (GitHub Gist) | Inbox JSON 파일 기반 메시징, 6가지 오케스트레이션 패턴, Task dependency tracking | 파일 기반 메시징 (`/tmp/cross-team/`), Pipeline+Parallel 혼합 패턴 |
| R3 | OpenAI Agents SDK | Agents-as-Tools (매니저 통제) vs Handoffs (전문가 인수), 코드 기반 오케스트레이션 | Leader(triage agent) → 전문가(handoff) 구조, 결정적 라우팅 |
| R4 | Microsoft Agent Framework | Magentic Progress Ledger, Checkpointing, Autonomous Mode (턴 제한) | stall 감지 + 자동 리플래닝, 세션 상태 저장/복원 |
| R5 | Addy Osmani - Claude Code Swarms | 전문화 에이전트 원칙, 도구 제한 (3-5개/에이전트), 60% 성능 저하 임계점 | 팀원당 좁은 컨텍스트, 세션 50%에서 compact |
| R6 | Multi-Agent Orchestration Guide (GuruSup) | 4 컴포넌트(Registry/Router/State Store/Supervisor), Structured Context, 서킷 브레이커 | State Store(`/tmp/cross-team/`), Supervisor(idle-detector), 토큰 절감 |

### 2.2 레퍼런스별 구체적 적용 아이디어

#### R1: Claude Code Agent Teams (공식)

현재 시스템의 기반이 되는 공식 기능이다. 이미 사용 중인 요소와 미활용 요소를 구분한다.

| 기능 | 현재 활용 여부 | Agent Ops 적용 |
|------|:-------------:|---------------|
| TeammateTool (팀원 생성) | O | 유지 |
| Task 시스템 (TaskCreate/Update) | O | 유지 + state.json 자동 동기화 추가 |
| Inbox 메시징 (팀원 간) | 부분 | comm.jsonl로 표준화 |
| TeammateIdle 훅 (exit 2) | O (CLAUDE.md 규칙) | idle-detector에서 자동 감지 + 재배정 |
| TaskCompleted 훅 (exit 2 거부) | 부분 | QA 게이트로 완료 거부 강화 |
| Delegate 모드 | O | 유지 (Leader 코드 작성 금지 강제) |

**핵심 차용**: TeammateIdle의 exit code 2 패턴을 idle-detector에 결합. 훅이 idle을 감지하면 자동으로 다음 TASK를 배정하되, 배정할 TASK가 없으면 슬랙 알림으로 CEO에게 보고.

#### R2: Swarm Orchestration Skill

| 패턴 | 설명 | 적용 |
|------|------|------|
| Parallel Specialists | 독립 TASK를 여러 팀원에게 동시 배정 | Wave 2: API + UI 병렬 (기존 활용 중) |
| Pipeline | A → B → C 순차 | PM → CTO → 마케팅 체인 (기존 chain-detector.ts) |
| Plan Approval | 구현 전 리더 승인 | 현재 CLAUDE.md 규칙 → Hook으로 강제 전환 |
| Coordinated Refactoring | 공유 파일 수정 시 순서 조율 | 파일 경계 규칙 + Leader가 순서 지정 (기존) |

**핵심 차용**: Inbox JSON 파일 기반 메시징. 현재 `comm.jsonl`이 이미 이 역할을 하고 있으나, 구조화된 메시지 타입(`handoff`, `question`, `alert`, `info`)으로 분류 강화.

#### R3: OpenAI Agents SDK

| 개념 | 설명 | 적용 |
|------|------|------|
| Agents-as-Tools | 매니저가 하위 에이전트를 도구처럼 호출 | Leader → 팀원 delegate 구조 (기존) |
| Handoffs | 전문가에게 제어권 인수 | chain.handoff 이벤트 (PM→CTO 인수) |
| 코드 기반 오케스트레이션 | 규칙을 코드로 강제 (결정적, 예측 가능) | **핵심 적용**: CLAUDE.md 규칙 → Hook/데몬 코드로 전환 |
| 평가 에이전트 피드백 루프 | 전문 에이전트가 결과 평가 | qa-engineer가 Gap 분석 (기존) + Hook으로 강제 |

**핵심 차용**: "코드 기반 오케스트레이션" 원칙. 현재 CLAUDE.md의 규칙들을 가능한 한 코드(Hook, 데몬, 검증 스크립트)로 전환하여 결정적(deterministic) 실행을 보장한다. 에이전트가 규칙을 "따르겠다는 의지"에 의존하지 않는 시스템.

#### R4: Microsoft Agent Framework

| 패턴 | 설명 | 적용 |
|------|------|------|
| Magentic Progress Ledger | 주기적으로 "진행되고 있는가?" 자가 점검 | idle-detector의 stall 감지 로직 |
| max_stall_count | N회 stall 감지 시 자동 리플래닝 | 3회 연속 stale → CEO DM + 세션 재시작 제안 |
| Checkpointing | 에이전트 상태를 디스크에 저장 → 재시작 후 복원 | **핵심 적용**: checkpoint.json 자동 저장 + 세션 시작 시 로드 |
| Autonomous Mode (턴 제한) | 무한 루프 방지를 위해 최대 턴 수 설정 | 세션당 컨텍스트 90% 도달 시 자동 종료 (기존) |

**핵심 차용**: Checkpointing 패턴. 현재 MEMORY.md는 세션 종료 시 수동 기록이라 크래시 시 유실된다. checkpoint.json은 Hook 실행 시마다 자동 갱신되어 크래시 시에도 마지막 상태가 보존된다.

#### R5: Addy Osmani - Claude Code Swarms

| 원칙 | 설명 | 적용 |
|------|------|------|
| 전문화 = 좁은 범위 집중 | 에이전트당 역할 좁히면 품질 상승 | 팀원별 파일 경계 (frontend: src/app, src/components / backend: src/app/api, src/lib) |
| 도구 제한 (3-5개) | 15개+ 도구 시 선택 정확도 80% 미만 | 현재 팀원별 도구 제한 없음 → Phase 2에서 spawn 프롬프트로 도구 범위 명시 |
| 60% 성능 저하 | 단일 에이전트 컨텍스트 60% 이후 품질 떨어짐 | 50%에서 `/compact` 실행 규칙 (기존 CLAUDE.md) → idle-detector가 컨텍스트 사용률 모니터링 |
| 멀티 에이전트 속도 | 수일 → 수시간 단축 | 3팀 병렬 운영 (기존) |

**핵심 차용**: 전문화 원칙의 강화. 현재 팀원에게 역할은 부여하지만 실제로 모든 도구에 접근 가능. Phase 2에서 spawn 프롬프트에 허용 도구/파일을 명시적으로 제한하여 도구 선택 정확도를 높인다.

#### R6: Multi-Agent Orchestration Guide (GuruSup)

| 컴포넌트 | 설명 | 적용 |
|----------|------|------|
| Registry | 에이전트 능력 등록 | state.json의 `members` + `role` 필드 (기존) |
| Router | 작업을 적합한 에이전트에 배분 | chain-detector.ts + Leader delegate (기존) |
| State Store | 중앙 상태 저장소 | `/tmp/cross-team/` 파일 시스템 (기존) |
| Supervisor | 전체 시스템 감시 + 이상 감지 | **핵심 적용**: idle-detector + chain-watcher가 Supervisor 역할 수행 |
| Structured Context Objects | 전체 이력 대신 구조화된 핵심 정보만 전달 | checkpoint.json 설계. 토큰 60-70% 절감 기대 |
| 서킷 브레이커 | 2분 내 5회 실패 시 해당 경로 차단 | 슬랙 알림 전송 실패 시 서킷 브레이커 (429 Rate Limit 대응) |
| "중앙화로 시작, 병목 시 분산" | 초기에는 단일 오케스트레이터 | **핵심 적용**: 모든 감시/알림을 localhost 중앙 프로세스로 시작 |

**핵심 차용**: "중앙화 우선" 원칙과 Structured Context Objects. Phase 1에서는 모든 구성요소를 단일 머신(맥 로컬)에서 중앙화 실행. 병목이 생기면 그때 분산. Structured Context는 checkpoint.json 설계에 직접 반영.

### 2.3 적용하지 않는 패턴과 이유

| 패턴 | 출처 | 미적용 이유 |
|------|------|-----------|
| Group Chat (다자간 토론) | Microsoft | 3팀은 Pipeline 구조. 자유 토론 시 혼란 증가 |
| Handoff 무제한 전환 | OpenAI | 우리는 체인 규칙이 4개로 고정. 자유 전환은 추적 불가 |
| 분산 메시지 큐 (RabbitMQ 등) | GuruSup | 단일 머신 운영. 파일 기반으로 충분. 과잉 인프라 |
| 의미적 실패 감지 ("심판" 에이전트) | GuruSup | 현재 3팀 규모에서는 qa-engineer + Gap 분석으로 충분 |

---

## 3. Agent Ops Platform 아키텍처

### 3.1 전체 아키텍처 다이어그램

```
                    ┌─────────────────────────────────────┐
                    │      Agent Ops Platform              │
                    │      (맥 로컬 중앙 오케스트레이터)     │
                    └──────────────────┬──────────────────┘
                                       │
          ┌────────────────────────────┼────────────────────────────┐
          │                            │                            │
    ┌─────▼─────┐              ┌───────▼───────┐            ┌──────▼──────┐
    │   PM팀    │              │    CTO팀     │            │  마케팅팀   │
    │ sdk-pm    │              │   sdk-cto    │            │  sdk-mkt   │
    │ (tmux)    │              │   (tmux)     │            │  (tmux)    │
    └─────┬─────┘              └───────┬───────┘            └──────┬──────┘
          │                            │                            │
          └────────────────────────────┼────────────────────────────┘
                                       │
          ┌────────────────────────────▼────────────────────────────┐
          │          /tmp/cross-team/ (State Store)                  │
          │  pm/state.json  cto/state.json  marketing/state.json    │
          │  logs/comm.jsonl  slack/queue.jsonl  background/tasks.json │
          │  마커 파일들 (*-done.md)  checkpoint.json (팀별)         │
          └────────────────────────────┬────────────────────────────┘
                                       │
    ┌──────────┬───────────┬───────────┼───────────┬──────────┬──────────┐
    │ chain-   │ state-    │ idle-     │           │ PDCA     │ 세션     │
    │ watcher  │ sync      │ detector  │           │ auto-    │ 복구     │
    │ (데몬)   │ (훅)      │ (데몬)    │           │ sync     │ (체크    │
    │          │           │           │           │ (훅)     │  포인트) │
    └──────────┴───────────┴───────────┘           └──────────┴──────────┘
                                       │
          ┌────────────────────────────▼────────────────────────────┐
          │          슬랙 알림 시스템                                 │
          │  통합 채널 + CEO DM                                      │
          │  11개 이벤트 (기존 8 + 신규 3)                            │
          │  Block Kit + Rate Limit 큐잉                             │
          └────────────────────────────┬────────────────────────────┘
                                       │
          ┌────────────────────────────▼────────────────────────────┐
          │          웹 터미널 대시보드                               │
          │  /admin/agent-dashboard (상태 개요)                      │
          │  /admin/terminal (xterm.js + WebSocket + 입력)           │
          │  슬랙 로그 통합 표시 + idle 상태 하이라이트               │
          └─────────────────────────────────────────────────────────┘
```

### 3.2 데이터 흐름 상세

```
[에이전트 세션]
    │
    ├─(TASK 상태 변경)─→ [agent-state-sync.sh] ─→ state.json 갱신
    │                                            ├─→ PDCA auto-sync (phase 갱신)
    │                                            └─→ checkpoint.json 갱신
    │
    ├─(TASK 완료)─────→ [agent-slack-notify.sh] ─→ POST /slack/notify
    │                                            ├─→ task.completed 슬랙 알림
    │                                            └─→ 전체 TASK done? → chain.handoff 감지
    │
    └─(마커 파일 생성)─→ [chain-watcher 데몬] ──→ 마커 감지
                                                ├─→ chain-detector.ts 규칙 매칭
                                                ├─→ 슬랙 chain.handoff 알림
                                                └─→ 다음 팀 state.json에 pending TASK 추가

[idle-detector 데몬]
    │
    ├─(30초 간격 폴링)─→ state.json updatedAt 확인
    │                   ├─→ 5분 무갱신 = "stale" → 슬랙 team.idle 경고
    │                   ├─→ tmux 세션 alive 확인
    │                   └─→ dead = 슬랙 team.recovered 필요 알림
    │
    └─(세션 복구)──────→ checkpoint.json 읽기 → 복구 컨텍스트 생성

[웹 대시보드]
    │
    ├─ /admin/agent-dashboard ─→ GET /api/agent-dashboard ─→ state.json 3개 + PDCA 읽기
    └─ /admin/terminal ────────→ WebSocket(3001) ──→ tmux capture-pane 폴링
```

### 3.3 설계 원칙 (레퍼런스 기반)

| # | 원칙 | 출처 | 적용 방식 |
|---|------|------|----------|
| P1 | **중앙화 우선** | GuruSup | 모든 데몬/훅을 맥 로컬 단일 머신에서 실행. /tmp/cross-team/ 파일 시스템이 State Store. 분산은 병목 발생 시에만 고려 |
| P2 | **프로세스 강제** | Smith님 요구 + OpenAI | CLAUDE.md 규칙을 Hook + 데몬 코드로 전환. 에이전트 의지 의존 제거. exit code 2로 완료 거부 가능 |
| P3 | **전문화** | Osmani | 팀원별 파일 경계 명시. spawn 프롬프트에 허용 도구/파일 제한 주입. 하나의 에이전트가 모든 것을 하지 않음 |
| P4 | **Structured Context** | GuruSup | checkpoint.json에 핵심 정보만 구조화 저장. 새 세션에 전체 이력 대신 요약 주입. 토큰 60-70% 절감 |
| P5 | **Checkpointing** | Microsoft | Hook 실행 시마다 checkpoint.json 자동 갱신. 세션 재시작 후 즉시 이어서 작업. 크래시에도 마지막 상태 보존 |
| P6 | **stall 감지 + 자동 대응** | Microsoft Magentic | idle-detector가 Progress Ledger 역할. 5분 무갱신 = stale, 3회 연속 = CEO 긴급 알림. max_stall_count 패턴 |
| P7 | **감사 추적 (Audit Trail)** | 오케스트레이션 체인 규약 | 마커 파일 immutable, comm.jsonl append-only, slack/queue.jsonl 로깅. 모든 이벤트에 타임스탬프 |

---

## 4. 구성 요소 상세 (7개)

### 4.1 chain-watcher 데몬

**해결하는 문제**: #1 (팀 간 소통 끊김 / 모찌 병목)

| 항목 | 내용 |
|------|------|
| **역할** | `/tmp/cross-team/` 마커 파일 자동 감지 → 체인 규칙 매칭 → 슬랙 알림 + 다음 팀 알림 |
| **구현 방식** | Node.js 상주 프로세스 (PM2 관리). 5초 간격 폴링 또는 chokidar 파일 감시 |
| **위치** | `scripts/chain-watcher.mjs` |
| **레퍼런스** | Claude Code TeammateIdle 훅 + Microsoft Autonomous Mode |

**동작 흐름**:

```
1. 시작 시:
   - /tmp/cross-team/ 디렉토리 존재 확인 (없으면 mkdir -p)
   - 기존 마커 파일 목록 스냅샷 저장 (중복 감지 방지)

2. 감시 루프 (5초 간격):
   - /tmp/cross-team/*-done*.md 파일 스캔
   - 새로 생성된 마커 파일 감지 (스냅샷 대비)
   - 마커 파일명에서 팀 + 이벤트 파싱:
     예: pm-plan-done.md → team=pm, event=plan.completed

3. 체인 규칙 매칭:
   - chain-detector.ts의 CHAIN_RULES와 매칭
   - 매칭 결과:
     C1: pm/plan.completed → cto (구현 착수 필요)
     C2: pm/plan.completed → marketing (검증 준비 필요)
     C3: cto/implementation.completed → marketing (마케팅 검증 시작)
     C4: marketing/review.completed → pm (결과 리뷰 필요)

4. 슬랙 알림 전송:
   - POST /api/agent-dashboard/slack/notify
   - event: "chain.handoff"
   - 양쪽 팀 채널 + CEO DM

5. 다음 팀 알림 (선택적 자동화):
   - 수신 팀의 state.json에 알림 플래그 설정
   - comm.jsonl에 핸드오프 기록 append

6. 스냅샷 갱신 (처리 완료된 마커는 재감지 안 함)
```

**모찌 역할 변경**:

| 항목 | Before (현재) | After (Agent Ops) |
|------|-------------|-------------------|
| 마커 감지 | 수동 확인 | chain-watcher 자동 감지 |
| 체인 전달 | 모찌가 슬랙으로 전달 | chain-watcher가 자동 전달 |
| TASK 배정 | 모찌가 TASK.md 생성 | 모찌가 승인만 (chain-watcher가 알림 후 모찌 확인) |
| 검증 | 마커 + 설계서 + state.json | 동일 (오케스트레이션 체인 규약의 6.3 체크리스트) |

**핵심**: 모찌는 **중계자**(relay)에서 **승인자**(approver)로 전환된다. 자동 전달 후 모찌가 확인/거부만 하면 된다.

**중복 감지 방지**:
- 동일 마커 파일을 두 번 처리하지 않도록, 처리 완료된 마커의 mtime을 기록
- 기능명 접미사가 다른 마커는 별도 이벤트로 처리 (예: `pm-plan-done.md` vs `pm-plan-done-orchestration-chain.md`)

### 4.2 state-sync 프로세스

**해결하는 문제**: #3 (규칙 의존), #5 (PDCA 싱크)

| 항목 | 내용 |
|------|------|
| **역할** | 팀 세션 상태를 state.json에 자동 동기화 + PDCA 연동 |
| **구현 방식** | Hook 기반 (TaskCompleted, TeammateIdle 이벤트에서 자동 실행) |
| **기존 구현** | `.claude/hooks/agent-state-sync.sh` (42줄, updatedAt 갱신만) |
| **레퍼런스** | GuruSup State Store |

**현재 구현의 한계와 확장 필요사항**:

| 현재 동작 | 확장 필요 |
|----------|----------|
| state.json `status`를 "active"로 갱신 | TASK 상태도 자동 반영 (active → done) |
| `updatedAt` 갱신 | `contextUsage` (컨텍스트 사용률) 추가 |
| 디렉토리 mkdir -p | 유효성 검증 (JSON Schema) 추가 |
| - | PDCA phase 자동 갱신 연동 |
| - | checkpoint.json 동시 갱신 |
| - | comm.jsonl 줄 수 확인 → rotate 실행 |

**확장된 동작 흐름**:

```
agent-state-sync.sh (확장 버전):

1. 디렉토리 초기화 (기존)
2. stdin에서 이벤트 데이터 읽기 (기존)
3. state.json 갱신:
   - TASK 상태 반영 (이벤트에서 taskId + status 추출)
   - updatedAt 갱신
   - contextUsage 갱신 (환경변수 CONTEXT_USAGE에서)
   - 모든 TASK done이면 status → "idle"
4. PDCA auto-sync (신규):
   - .pdca-status.json에서 현재 feature 찾기
   - TASK 완료 → phase 자동 전환 판단
   - 루트 + docs/ 양쪽 동시 갱신
5. checkpoint.json 갱신 (신규):
   - 현재 진행 중 TASK 목록
   - 마지막 커밋 해시 (git log -1)
   - 변경된 파일 목록 (git diff --name-only)
6. comm.jsonl rotate 확인 (신규):
   - 줄 수 > 1000 → 최근 500줄만 남김
   - 7일 이전 로그 삭제
```

### 4.3 idle-detector

**해결하는 문제**: #2 (idle 감지 불가)

| 항목 | 내용 |
|------|------|
| **역할** | 팀 멈춤 자동 감지 → 등급별 알림 + 복구 제안 |
| **구현 방식** | Node.js 상주 프로세스 (PM2 관리) 또는 cron (30초 간격) |
| **위치** | `scripts/idle-detector.mjs` |
| **레퍼런스** | Microsoft Magentic Progress Ledger (max_stall_count) |

**판단 기준**:

| 상태 | 판단 조건 | 심각도 |
|------|----------|--------|
| `healthy` | state.json 마지막 갱신 < 5분 | 정상 |
| `stale` | state.json 마지막 갱신 >= 5분, tmux 세션 alive | 경고 |
| `stuck` | 활성 TASK가 있는데 10분 이상 무갱신 | 위험 |
| `dead` | tmux 세션 프로세스 없음 (has-session 실패) | 긴급 |
| `thinking` | 에이전트가 "thinking" 중 (model thinking 활성) | 정상 예외 |

**"thinking" 상태 예외 처리** (오탐 방지):
- Opus 모델은 thinking 시간이 길 수 있음 (최대 5분+)
- state.json에 `thinking: true` 플래그가 있으면 stale 판정 유예
- thinking 플래그는 agent-state-sync.sh에서 이벤트 타입으로 판단

**등급별 액션**:

```
stale (5분):
  → 해당 팀 슬랙 채널에 "team.idle" 경고 메시지
  → 메시지 내용: "{팀명}이 5분 이상 활동이 없습니다. 확인이 필요합니다."
  → stale_count[team]++

stale 3회 연속 (15분):
  → CEO DM으로 긴급 알림
  → 메시지: "{팀명} 15분 무활동. 세션 확인 필요."
  → 대시보드 링크 포함

stuck (활성 TASK + 10분):
  → 해당 팀 + CEO DM
  → 메시지: "{팀명}이 '{TASK명}' 진행 중 10분 무활동. 블로커 가능성."
  → comm.jsonl에 stuck 이벤트 기록

dead (tmux 세션 없음):
  → CEO DM 긴급 알림
  → 메시지: "{팀명} tmux 세션이 종료되었습니다. 즉시 복구 필요."
  → checkpoint.json 존재 확인 → 복구 가능 여부 안내
  → 자동 세션 재시작 시도 (Phase 2)
```

**상태 초기화**: 팀이 활동을 재개하면 (state.json 갱신 감지) stale_count 리셋 + `team.recovered` 슬랙 알림.

**tmux 세션 확인 방법**:

```bash
# 세션 존재 확인
tmux has-session -t sdk-cto 2>/dev/null && echo "alive" || echo "dead"

# 세션 마지막 활동 시각 (타임스탬프)
tmux list-sessions -F "#{session_name}:#{session_activity}" 2>/dev/null
```

### 4.4 슬랙 알림 시스템

**해결하는 문제**: #1 (소통), #2 (감지)

| 항목 | 내용 |
|------|------|
| **기존 설계** | `slack-notification.design.md` (8개 이벤트, Block Kit, Rate Limit) |
| **기존 구현** | `src/lib/slack-notifier.ts` (120줄), `src/lib/chain-detector.ts` (17줄), `src/types/agent-dashboard.ts`, `.claude/hooks/agent-slack-notify.sh` |
| **API** | `POST /api/agent-dashboard/slack/notify` |

**통합 변경사항**:

| 항목 | 기존 설계 | Agent Ops 변경 |
|------|----------|---------------|
| 채널 구조 | 팀별 3채널 (#agent-pm, #agent-cto, #agent-marketing) | **통합 1채널** (`SLACK_UNIFIED_CHANNEL`) + CEO DM. 팀별 채널은 deprecated fallback |
| 이벤트 수 | 8개 | **11개** (기존 8 + 신규 3) |
| 트리거 | Hook 수동 호출 + API 수동 호출 | Hook + chain-watcher 자동 + idle-detector 자동 |
| Rate Limit | 미구현 | 429 시 Retry-After 대기 + queue.jsonl 큐잉 |

**신규 이벤트 3개**:

| 이벤트 | 트리거 | 수신처 | CEO DM | 우선순위 |
|--------|--------|--------|:------:|---------|
| `team.idle` | idle-detector가 stale 감지 (5분) | 해당 팀 채널 | 3회 연속 시 O | `normal` → 3회 연속 `important` |
| `team.recovered` | idle 상태 팀 활동 재개 감지 | 해당 팀 채널 | X | `normal` |
| `session.crashed` | idle-detector가 tmux 세션 dead 감지 | 해당 팀 채널 | O | `urgent` |

**통합 채널 결정 로직** (`resolveChannels` 변경):

```
if SLACK_UNIFIED_CHANNEL 설정됨:
  → 모든 이벤트를 통합 채널 1곳으로 전송
else:
  → 기존 팀별 채널 로직 (deprecated fallback)

CEO DM 대상 이벤트 (기존 4 + 신규 2 = 6개):
  - chain.handoff
  - deploy.completed
  - error.critical
  - approval.needed
  - team.idle (3회 연속 시)
  - session.crashed
```

**환경변수 변경**:

| 환경변수 | 상태 | 설명 |
|---------|------|------|
| `SLACK_UNIFIED_CHANNEL` | **신규** | 통합 알림 채널 ID |
| `SLACK_CHANNEL_PM` | deprecated | 통합 채널 미설정 시 fallback |
| `SLACK_CHANNEL_CTO` | deprecated | 통합 채널 미설정 시 fallback |
| `SLACK_CHANNEL_MARKETING` | deprecated | 통합 채널 미설정 시 fallback |
| `SLACK_BOT_TOKEN` | 유지 | 슬랙 봇 토큰 |
| `SLACK_CEO_USER_ID` | 유지 | CEO DM 전송용 |

### 4.5 웹 터미널 대시보드

**해결하는 문제**: #2 (모니터링), #1 (소통)

| 항목 | 내용 |
|------|------|
| **기존 설계** | `web-terminal-dashboard.design.md` (xterm.js + WebSocket), `agent-dashboard.design.md` (상태 개요) |
| **구현 페이지** | `/admin/agent-dashboard` (상태 개요) + `/admin/terminal` (xterm.js 터미널) |

**Agent Ops 통합 변경사항**:

| 항목 | 기존 agent-dashboard | 기존 web-terminal | Agent Ops 통합 |
|------|--------------------|--------------------|---------------|
| 팀 상태 | TeamCard (상태 + TASK) | 세션 상태 (connected/disconnected) | 팀 상태에 idle 하이라이트 추가 |
| 슬랙 로그 | 없음 | SlackAlertLog (사이드바) | 양쪽 페이지 모두에 슬랙 로그 표시 |
| 체인 상태 | 없음 | 없음 | **신규**: 체인 전달 시각화 패널 (어떤 체인이 완료/대기 중인지) |
| PDCA | PdcaStatusPanel | 없음 | PDCA 패널에 자동 싱크 상태 표시 |
| idle 표시 | 없음 | 없음 | **신규**: idle 팀 카드 빨간 테두리 + 경고 배지 |
| checkpoint | 없음 | 없음 | **신규**: 세션 복구 상태 표시 (마지막 checkpoint 시각) |

**신규 UI 요소 (agent-dashboard 페이지)**:

```
┌─────────────────────────────────────────────────────────────┐
│  에이전트 대시보드    ● LIVE  2026-03-25 14:30              │
├────────────┬────────────┬───────────────────────────────────┤
│            │            │                                   │
│ [PM팀]     │ [CTO팀]    │ [마케팅팀]                        │
│ ● idle     │ ● 운영 중  │ ⚠ 5분 무활동                     │
│            │            │ (idle 경고 테두리)                 │
├────────────┴────────────┴───────────────────────────────────┤
│  체인 전달 현황                                              │
│  PM → CTO : ✅ 완료 (14:00)                                │
│  PM → 마케팅 : ✅ 완료 (14:00)                              │
│  CTO → 마케팅 : ⏳ 대기 중 (CTO 구현 진행 중)               │
│  마케팅 → PM : ○ 미시작                                     │
├─────────────────────────────────────────────────────────────┤
│  슬랙 알림 로그 (최근 10건)                                  │
│  14:30  ⚠ 마케팅팀 5분 무활동                               │
│  14:25  ✅ CTO팀 T2 완료                                    │
│  14:20  🔗 체인 전달: PM → CTO                              │
│  14:15  🚀 CTO팀 T2 시작                                    │
├──────────────────────┬──────────────────────────────────────┤
│  PDCA 상태           │  세션 정보                            │
│  agent-dashboard     │  PM팀: checkpoint 14:25              │
│   implementing 0%    │  CTO팀: checkpoint 14:30             │
│  auto-sync: ✅       │  마케팅팀: checkpoint 14:10 ⚠        │
└──────────────────────┴──────────────────────────────────────┘
```

**기술 아키텍처 (변경 없음)**:
- 상태 개요: Next.js REST API + 5초 폴링 (SSE Phase 1 선택)
- 터미널: xterm.js + WebSocket(localhost:3001) + tmux capture-pane
- WebSocket 서버: `scripts/terminal-ws-server.mjs` (PM2 관리)
- 인증: Supabase Auth admin 역할 확인

### 4.6 PDCA 자동 싱크

**해결하는 문제**: #5 (PDCA 싱크 불일치)

| 항목 | 내용 |
|------|------|
| **역할** | 구현 상태와 PDCA 문서의 자동 동기화 |
| **구현 방식** | agent-state-sync.sh 훅 확장 (4.2절과 통합) |
| **대상 파일** | `.pdca-status.json` (루트), `docs/.pdca-status.json` |

**자동 phase 전환 규칙**:

| 트리거 이벤트 | 현재 phase | 전환 대상 phase | 조건 |
|-------------|-----------|---------------|------|
| Plan 문서 생성 완료 | (없음) | `planning` | `docs/01-plan/features/{기능}.plan.md` 존재 |
| Design 문서 생성 완료 | `planning` | `designing` | `docs/02-design/features/{기능}.design.md` 존재 |
| 첫 번째 구현 TASK 시작 | `designing` | `implementing` | state.json에 해당 feature의 TASK가 `active` |
| 모든 구현 TASK 완료 | `implementing` | `checking` | state.json에 해당 feature의 모든 TASK가 `done` |
| Gap 분석 완료 + Match Rate >= 90% | `checking` | `completed` | `docs/03-analysis/{기능}.analysis.md` 존재 + matchRate >= 90 |

**두 파일 동시 갱신 보장**:

```
PDCA 갱신 시:
1. .pdca-status.json (루트) 읽기
2. docs/.pdca-status.json 읽기
3. 해당 feature 항목 찾기 (없으면 새로 추가)
4. phase, matchRate, updatedAt 갱신
5. 루트 파일 쓰기
6. docs/ 파일 쓰기
7. 두 파일 모두 성공해야 완료 (하나 실패 시 롤백)
```

**감사(Audit)**: 모든 phase 전환은 comm.jsonl에 기록. `metadata.type: "pdca_transition"`.

### 4.7 세션 복구 (Checkpoint/Resume)

**해결하는 문제**: #4 (컨텍스트 유실)

| 항목 | 내용 |
|------|------|
| **역할** | 세션 크래시/재시작 시 컨텍스트 자동 복원 |
| **구현 방식** | Structured Context Objects (GuruSup 패턴) + Checkpointing (Microsoft 패턴) |
| **저장 위치** | `/tmp/cross-team/{team}/checkpoint.json` |
| **갱신 시점** | agent-state-sync.sh 실행 시마다 (모든 TASK 상태 변경 시) |

**checkpoint.json 스키마**:

```
{
  "team": "cto",
  "savedAt": "2026-03-25T14:30:00+09:00",
  "session": {
    "id": "session-uuid",                  // 세션 식별자
    "startedAt": "2026-03-25T10:00:00+09:00",
    "contextUsage": 45                     // 컨텍스트 사용률 (%)
  },
  "currentFeature": "agent-dashboard",     // 현재 작업 중 기능
  "tasks": {                               // TASK 상태 스냅샷
    "T1": { "title": "타입 정의", "status": "done", "assignee": "backend-dev" },
    "T2": { "title": "API 구현", "status": "active", "assignee": "backend-dev" },
    "T3": { "title": "UI 구현", "status": "pending", "assignee": "frontend-dev" }
  },
  "git": {
    "branch": "feat/agent-dashboard",      // 현재 브랜치
    "lastCommit": "abc1234",               // 마지막 커밋 해시
    "changedFiles": [                      // 미커밋 변경 파일
      "src/types/agent-dashboard.ts",
      "src/app/api/agent-dashboard/route.ts"
    ]
  },
  "documents": {                           // 참조 설계 문서 경로
    "plan": "docs/01-plan/features/agent-dashboard.plan.md",
    "design": "docs/02-design/features/agent-dashboard.design.md"
  },
  "nextSteps": [                           // 다음 할 일 목록
    "T2 API 엔드포인트 구현 계속",
    "T3 시작 대기 (T2 완료 후)"
  ],
  "blockers": [],                          // 차단 요소
  "notes": "state.json 읽기 로직 완료, 집계 로직 진행 중"
}
```

**복원 흐름**:

```
새 세션 시작 시:
1. /tmp/cross-team/{team}/checkpoint.json 존재 확인
2. 존재하면 읽기 → Structured Context 생성:
   "이전 세션 복구 컨텍스트:
    - 기능: {currentFeature}
    - 완료 TASK: {done TASK 목록}
    - 진행 중 TASK: {active TASK 목록}
    - 대기 TASK: {pending TASK 목록}
    - 마지막 커밋: {lastCommit}
    - 미커밋 변경: {changedFiles}
    - 다음 할 일: {nextSteps}
    - 참조 문서: {documents}"
3. MEMORY.md도 읽어서 보조 컨텍스트로 활용
4. 이전 TASK 이어서 진행
```

**checkpoint.json vs MEMORY.md 역할 분리**:

| 항목 | checkpoint.json | MEMORY.md |
|------|----------------|-----------|
| 갱신 시점 | Hook 실행 시마다 자동 | 세션 종료 시 수동 |
| 크래시 대응 | O (마지막 Hook 시점 보존) | X (수동 기록 기회 없음) |
| 내용 | 구조화된 상태 데이터 (JSON) | 자유 형식 메모 (Markdown) |
| 용도 | 자동 복원 | 인간 + 에이전트 참조 |
| 보존 | /tmp (세션 수명) | git 추적 (영구) |

---

## 5. 통합 데이터 흐름

### 5.1 정상 흐름 (Happy Path)

```
[Smith님 TASK 배정]
     │
     ▼
[모찌가 팀별 분배] ─→ PM팀 state.json에 tasks 추가 (status: planned)
     │
     ▼
[PM팀 작업 시작]
     │ state-sync: state.json updatedAt 갱신 + checkpoint 저장
     │
     ▼
[PM팀 Plan 완료]
     │ PM팀이 pm-plan-done.md 마커 생성
     │ state-sync: 모든 TASK done → status: idle
     │ PDCA auto-sync: phase → checking
     │
     ▼
[chain-watcher 감지] (자동, 5초 이내)
     │ 마커 파일 감지 → chain-detector 매칭
     │ C1: PM → CTO (구현 착수)
     │ C2: PM → 마케팅 (검증 준비)
     │
     ▼
[슬랙 chain.handoff 알림] (자동)
     │ 통합 채널 + CEO DM
     │
     ▼
[모찌 확인] (승인자 역할)
     │ 마커 파일 확인 + state.json 검증 + 설계서 존재 확인
     │ 승인 → CTO팀 TASK.md 배정
     │
     ▼
[CTO팀 구현 시작]
     │ state-sync: status: active, TASK status 갱신
     │ idle-detector: healthy 상태 유지
     │ checkpoint: 주기적 자동 저장
     │
     ▼
[CTO팀 구현 완료]
     │ agent-slack-notify: task.completed 알림
     │ state-sync: 모든 TASK done → status: idle
     │ CTO팀이 cto-impl-done.md 마커 생성
     │
     ▼
[chain-watcher 감지] (자동)
     │ C3: CTO → 마케팅 (마케팅 검증 시작)
     │
     ▼
[마케팅팀 검증]
     │ ... (동일 패턴)
     │
     ▼
[마케팅팀 완료 → C4 → PM팀 리뷰]
     │
     ▼
[전체 사이클 완료]
     │ 슬랙: "전체 기능 사이클 완료" 알림
     │ PDCA: phase → completed
     │ 웹 대시보드: 모든 팀 idle + 체인 완료 표시
```

### 5.2 이상 흐름 (Error Path)

```
[CTO팀 세션 크래시]
     │
     ▼
[idle-detector 감지] (5분 타임아웃)
     │ state.json 갱신 없음 + tmux has-session 실패
     │
     ▼
[슬랙 session.crashed 알림] (자동)
     │ CEO DM 긴급 알림: "CTO팀 세션 종료됨"
     │ checkpoint.json 존재 → "복구 가능" 안내
     │
     ▼
[세션 복구]
     │ Smith님 또는 모찌가 새 세션 시작
     │ 새 세션이 checkpoint.json 로드
     │ 이전 TASK 이어서 진행 (2분 이내 복구)
     │
     ▼
[슬랙 team.recovered 알림]
     │ "CTO팀 세션 복구됨"
```

### 5.3 규칙 위반 흐름 (Enforcement Path)

```
[리더가 직접 코드 작성 시도]
     │
     ▼
[PreToolUse hook 차단]
     │ Delegate 모드에서 파일 수정 시도 → 경고 + 차단
     │
─────────────────────────────────────
[TASK 없이 구현 시도]
     │
     ▼
[validate-task.sh 차단]
     │ state.json에 active TASK 없으면 → 경고
     │
─────────────────────────────────────
[설계서 없이 코딩]
     │
     ▼
[enforce-plan-before-do.sh 차단]
     │ docs/01-plan + docs/02-design 확인
     │ 없으면 → 경고 + 코딩 시작 불가
     │
─────────────────────────────────────
[QA 없이 main push]
     │
     ▼
[validate-qa.sh 차단]
     │ /tmp/agent-qa-passed 마커 없으면 → exit 2 (push 거부)
     │ 슬랙 알림: "QA 미통과 main push 시도 차단됨"
     │
─────────────────────────────────────
[QA 마커 touch로 우회 시도]
     │
     ▼
[validate-qa.sh 고도화]
     │ 마커 내용에 빌드 로그 해시 포함 필수
     │ touch만으로는 유효한 마커 생성 불가
```

---

## 6. 기존 설계서와의 관계

### 6.1 통합 매핑

| 기존 설계서 | 파일 | Agent Ops에서의 역할 | 변경사항 |
|------------|------|--------------------|---------|
| agent-dashboard.design.md | `docs/02-design/features/agent-dashboard.design.md` | **기반 데이터 모델 + API 계층**. TeamState, AgentTask, CommLog, BackgroundTask, PdcaFeature, SlackNotification 등 모든 핵심 타입이 여기에 정의됨 | idle 상태 표시 추가, 체인 전달 시각화 패널 추가, checkpoint 표시 추가 |
| slack-notification.design.md | `docs/02-design/features/slack-notification.design.md` | **슬랙 알림 서브시스템**. 8개 이벤트별 Block Kit 포맷, 채널 라우팅, Rate Limit 큐잉, Hook 트리거 상세 | 통합 채널 전환 (`SLACK_UNIFIED_CHANNEL`), 신규 이벤트 3개 추가 (`team.idle`, `team.recovered`, `session.crashed`) |
| orchestration-chain.design.md | `docs/02-design/features/orchestration-chain.design.md` | **체인 규약 서브시스템**. 디렉토리 구조, state.json 스키마, comm.jsonl 포맷, 마커 파일 규약, 핸드오프 프로세스, 모찌 체크리스트 | 모찌 역할 변경 (중계자 → 승인자), chain-watcher 자동 감지로 마커 수동 확인 불필요 |
| web-terminal-dashboard.design.md | `docs/02-design/features/web-terminal-dashboard.design.md` | **모니터링 UI 서브시스템**. xterm.js + WebSocket, 3팀 tmux 세션, 입력 전달, 위험 명령 필터링, 슬랙 로그 사이드바 | 슬랙 로그 통합 표시, idle 팀 하이라이트, 체인 상태 시각화 추가 |

### 6.2 공유 인프라

4개 설계서가 공유하는 인프라 요소:

| 인프라 | 정의 위치 | 사용하는 설계서 |
|--------|----------|---------------|
| `/tmp/cross-team/` 디렉토리 | orchestration-chain.design.md 2절 | 4개 전부 |
| `state.json` 스키마 | orchestration-chain.design.md 3절 | 4개 전부 |
| `comm.jsonl` 포맷 | orchestration-chain.design.md 4절 | agent-dashboard, orchestration-chain |
| `SlackNotification` 타입 | agent-dashboard.design.md 1.1절 | agent-dashboard, slack-notification |
| `ChainRule` 타입 | agent-dashboard.design.md 1.1절 | orchestration-chain, slack-notification |
| `chain-detector.ts` | agent-dashboard.design.md 2.8절 | orchestration-chain, slack-notification |
| `slack-notifier.ts` | agent-dashboard.design.md 2.7절 | slack-notification |
| `agent-state-sync.sh` | orchestration-chain.design.md 9절 | agent-dashboard, orchestration-chain |
| `agent-slack-notify.sh` | slack-notification.design.md 8절 | slack-notification |

### 6.3 설계서 유지 원칙

**기존 설계서 4개는 그대로 유지한다.** 이 통합 기획서는 전체 아키텍처와 구성요소 간 연결 방식만 정의한다. 각 서브시스템의 상세 구현 가이드는 기존 설계서를 참조한다.

| 레벨 | 문서 | 역할 |
|------|------|------|
| L1 (통합) | **agent-ops-platform.plan.md** (이 문서) | 전체 아키텍처, 문제 정의, 연결 방식, 로드맵 |
| L2 (서브시스템) | agent-dashboard.design.md | 데이터 모델, API, 컴포넌트 상세 |
| L2 (서브시스템) | slack-notification.design.md | 이벤트별 Block Kit, Rate Limit, Hook |
| L2 (서브시스템) | orchestration-chain.design.md | 체인 규약, 마커, 핸드오프 프로세스 |
| L2 (서브시스템) | web-terminal-dashboard.design.md | xterm.js, WebSocket, 터미널 UI |

---

## 7. 구현 Phase별 로드맵

### Phase 1: 기반 인프라 + 핵심 자동화 (1주)

**목표**: chain-watcher와 idle-detector MVP로 모찌 병목 해소 + idle 감지 자동화

| # | 작업 | 산출물 | 담당 팀 | 의존성 |
|---|------|--------|---------|--------|
| P1-1 | chain-watcher 데몬 MVP | `scripts/chain-watcher.mjs` | CTO팀 | 없음 |
| P1-2 | idle-detector MVP | `scripts/idle-detector.mjs` | CTO팀 | 없음 |
| P1-3 | agent-state-sync.sh 확장 (PDCA auto-sync + checkpoint) | `.claude/hooks/agent-state-sync.sh` | CTO팀 | 없음 |
| P1-4 | checkpoint.json 스키마 + 생성/읽기 유틸리티 | `src/lib/cross-team/checkpoint.ts` | CTO팀 | P1-3 |
| P1-5 | PM2 ecosystem 설정 | `ecosystem.config.cjs` | CTO팀 | P1-1, P1-2 |
| P1-6 | 신규 슬랙 이벤트 3개 추가 (team.idle, team.recovered, session.crashed) | `src/lib/slack-notifier.ts` | CTO팀 | 없음 |

**Phase 1 완료 기준**:
- chain-watcher가 마커 파일 감지 → 5초 이내 슬랙 알림
- idle-detector가 5분 무갱신 → 슬랙 경고
- state-sync가 PDCA + checkpoint 자동 갱신
- PM2로 두 데몬 안정 실행

### Phase 2: 슬랙 통합 + 기존 설계서 구현 (1주)

**목표**: 슬랙 알림 시스템 완성 + 에이전트 대시보드 API/UI 구현

| # | 작업 | 산출물 | 담당 팀 | 의존성 |
|---|------|--------|---------|--------|
| P2-1 | 통합 채널 구조 전환 (`SLACK_UNIFIED_CHANNEL`) | `src/lib/slack-notifier.ts` | CTO팀 | P1-6 |
| P2-2 | Rate Limit 큐잉 + 재시도 로직 | `src/lib/slack-notifier.ts` | CTO팀 | P2-1 |
| P2-3 | 에이전트 대시보드 API (GET /api/agent-dashboard) | `src/app/api/agent-dashboard/route.ts` | CTO팀 | 없음 |
| P2-4 | 에이전트 대시보드 UI (TeamCard + CommLog + PDCA) | `src/app/(main)/admin/agent-dashboard/` | CTO팀 | P2-3 |
| P2-5 | 슬랙 알림 API (POST /slack/notify) | `src/app/api/agent-dashboard/slack/notify/route.ts` | CTO팀 | P2-1 |
| P2-6 | agent-slack-notify.sh Hook 개선 | `.claude/hooks/agent-slack-notify.sh` | CTO팀 | P2-5 |

**Phase 2 완료 기준**:
- 통합 채널로 11개 이벤트 전송
- 대시보드에서 3팀 상태 + PDCA + 소통 로그 확인
- Rate Limit 시 자동 큐잉 + 재시도

### Phase 3: 웹 터미널 (1주)

**목표**: xterm.js 기반 웹 터미널로 Smith님이 브라우저에서 3팀 직접 모니터링

| # | 작업 | 산출물 | 담당 팀 | 의존성 |
|---|------|--------|---------|--------|
| P3-1 | WebSocket 서버 + tmux 연동 | `scripts/terminal-ws-server.mjs` | CTO팀 | 없음 |
| P3-2 | xterm.js 터미널 페이지 | `src/app/(main)/admin/terminal/` | CTO팀 | P3-1 |
| P3-3 | 세션 전환 + 히스토리 | `hooks/useTerminalSession.ts` | CTO팀 | P3-2 |
| P3-4 | 입력 전달 + 위험 명령 필터링 | InputBar + BLOCKED_PATTERNS | CTO팀 | P3-2 |
| P3-5 | 슬랙 로그 사이드바 통합 | SlackAlertLog 컴포넌트 | CTO팀 | P2-5 |
| P3-6 | idle 팀 하이라이트 + 체인 상태 표시 | 대시보드 + 터미널 UI | CTO팀 | P1-2, P3-2 |

**Phase 3 완료 기준**:
- `/admin/terminal`에서 3팀 tmux 실시간 출력 확인
- 입력 전달 + 위험 명령 차단 동작
- 사이드바에 슬랙 로그 + idle 경고 표시

### Phase 4: 세션 복구 + 고도화 (1주)

**목표**: 세션 크래시 시 자동 복구 + 전체 시스템 안정화

| # | 작업 | 산출물 | 담당 팀 | 의존성 |
|---|------|--------|---------|--------|
| P4-1 | Checkpoint/Resume 완성 (새 세션 시작 시 자동 로드) | `src/lib/cross-team/checkpoint.ts` | CTO팀 | P1-4 |
| P4-2 | idle-detector → 세션 자동 재시작 시도 | `scripts/idle-detector.mjs` | CTO팀 | P1-2 |
| P4-3 | PDCA auto-sync 정밀화 (matchRate 자동 기록) | agent-state-sync.sh | CTO팀 | P1-3 |
| P4-4 | 서킷 브레이커 (슬랙 전송 5회 실패 시 차단) | `src/lib/slack-notifier.ts` | CTO팀 | P2-2 |
| P4-5 | /tmp 초기화 대비 영구 저장 전환 (선택) | DB 또는 프로젝트 디렉토리 | CTO팀 | P4-1 |
| P4-6 | E2E 테스트 + Gap 분석 문서 | `docs/03-analysis/agent-ops-platform.analysis.md` | PM팀 (QA) | P4-1~P4-4 |

**Phase 4 완료 기준**:
- 세션 크래시 → 2분 이내 자동 복구
- PDCA 불일치 0건
- 전체 시스템 E2E 테스트 통과

### 의존성 그래프 (Phase 간)

```
Phase 1 (기반)
  ├─ P1-1 chain-watcher ──────────────────────────────┐
  ├─ P1-2 idle-detector ───────────────────────────────┤
  ├─ P1-3 state-sync 확장 ──→ P1-4 checkpoint ────────┤
  ├─ P1-5 PM2 설정 ←── P1-1, P1-2                     │
  └─ P1-6 신규 슬랙 이벤트                              │
                                                       │
Phase 2 (슬랙 + 대시보드) ←── P1 완료                    │
  ├─ P2-1 통합 채널 ←── P1-6                            │
  ├─ P2-2 Rate Limit ←── P2-1                          │
  ├─ P2-3 대시보드 API                                  │
  ├─ P2-4 대시보드 UI ←── P2-3                          │
  ├─ P2-5 슬랙 API ←── P2-1                            │
  └─ P2-6 Hook 개선 ←── P2-5                           │
                                                       │
Phase 3 (웹 터미널) ←── P2 완료                          │
  ├─ P3-1 WS 서버                                      │
  ├─ P3-2 xterm 페이지 ←── P3-1                        │
  ├─ P3-3 세션 전환 ←── P3-2                            │
  ├─ P3-4 입력 전달 ←── P3-2                            │
  ├─ P3-5 슬랙 로그 ←── P2-5                           │
  └─ P3-6 idle 표시 ←── P1-2, P3-2 ◄──────────────────┘

Phase 4 (고도화) ←── P3 완료
  ├─ P4-1 Resume ←── P1-4
  ├─ P4-2 자동 재시작 ←── P1-2
  ├─ P4-3 PDCA 정밀화 ←── P1-3
  ├─ P4-4 서킷 브레이커 ←── P2-2
  ├─ P4-5 영구 저장 ←── P4-1
  └─ P4-6 E2E 테스트 ←── ALL
```

---

## 8. 성공 지표

| # | 지표 | 현재 (Before) | 목표 (After) | 측정 방법 |
|---|------|-------------|-------------|----------|
| M1 | 체인 전달 평균 지연 | 모찌 수동 (30분~수시간) | < 5분 (자동 감지 + 알림) | chain-watcher 로그의 마커 생성 → 슬랙 전송 시간 차이 |
| M2 | idle 팀 감지 시간 | Smith님 수동 (불확정) | < 5분 (자동 감지) | idle-detector 로그의 stale 감지 시각 - state.json 마지막 갱신 시각 |
| M3 | PDCA 싱크 불일치 수 | 8건/67 (12%) | 0건 (자동 싱크) | bkit audit의 PDCA 불일치 건수 |
| M4 | 세션 복구 시간 | 수동 MEMORY.md (10~30분) | < 2분 (checkpoint 자동 복원) | 세션 크래시 → 새 세션 시작 → 첫 TASK 재개 시간 |
| M5 | 규칙 위반 차단율 | 부분적 (훅 일부) | 100% (5개 핵심 규칙) | validate-*.sh 차단 로그 / 전체 위반 시도 |
| M6 | CEO 대시보드 접근 | tmux 직접 접속 | 브라우저 1클릭 (`/admin/agent-dashboard` 또는 `/admin/terminal`) | 기능 존재 여부 (Y/N) |
| M7 | 슬랙 알림 전송 성공률 | 미측정 | >= 99% | slack/queue.jsonl의 sent / total |

---

## 9. 리스크 분석

| # | 리스크 | 영향도 | 발생 확률 | 완화 방안 |
|---|--------|:------:|:--------:|----------|
| R1 | chain-watcher 과민 반응 (불필요 체인 전달) | 중 | 낮 | 마커 파일 포맷 검증 (5.2절 포맷 준수 확인) + 중복 감지 방지 (mtime 기록) + 처리된 마커 재감지 안 함 |
| R2 | idle-detector 오탐 (정상 작업 중 알림) | 중 | 중 | "thinking" 상태 예외 처리 + 5분 임계값 (충분히 여유). Phase 2에서 에이전트 출력 분석으로 정밀화 |
| R3 | WebSocket 서버 크래시 (터미널 뷰 중단) | 중 | 낮 | PM2 자동 재시작 (max_restarts: 10) + REST API fallback 제공 |
| R4 | /tmp 초기화 (서버 재시작 시 전체 상태 소실) | 높 | 낮 | Phase 1: 중요 마커는 docs/ 사본 유지. Phase 4: DB 또는 프로젝트 디렉토리 영구 저장 전환 |
| R5 | 슬랙 Rate Limit (429 연쇄) | 낮 | 중 | Retry-After 대기 + queue.jsonl 큐잉 + 동일 이벤트 병합 (5초 윈도우). 서킷 브레이커 (5회 연속 실패 시 2분 차단) |
| R6 | checkpoint.json 크기 증가 (TASK 많을 때) | 낮 | 낮 | 구조화된 핵심 정보만 저장 (전체 코드/diff 아님). 최대 50KB 제한 |
| R7 | 에이전트 컨텍스트에서 Hook 규칙 밀림 (60%+) | 높 | 높 | **핵심 완화**: Hook이 코드로 강제하므로 에이전트 컨텍스트와 무관. 에이전트가 규칙을 "따르겠다"가 아니라 "시스템이 차단한다" |
| R8 | 토큰 비용 증가 (Structured Context 도입) | 낮 | 낮 | checkpoint.json은 요약 형식 (500~2000 토큰). 전체 이력 주입 대비 60-70% 절감 예상 |

---

## 10. 파일 목록 (신규 + 수정)

### 10.1 신규 파일

| 파일 | Phase | 역할 |
|------|:-----:|------|
| `scripts/chain-watcher.mjs` | P1 | 마커 파일 감시 데몬 |
| `scripts/idle-detector.mjs` | P1 | 팀 idle 감지 데몬 |
| `src/lib/cross-team/checkpoint.ts` | P1 | checkpoint.json 생성/읽기 유틸리티 |
| `src/lib/cross-team/validate-state.ts` | P1 | state.json 유효성 검증 |
| `src/lib/cross-team/state-io.ts` | P1 | state.json 읽기/쓰기 유틸리티 |
| `src/lib/cross-team/comm-log.ts` | P1 | comm.jsonl append + rotate |
| `src/lib/cross-team/marker.ts` | P1 | 마커 파일 생성/읽기/검증 |
| `ecosystem.config.cjs` | P1 | PM2 설정 (chain-watcher + idle-detector + WS 서버) |
| `src/app/api/agent-dashboard/route.ts` | P2 | 대시보드 상태 조회 API |
| `src/app/api/agent-dashboard/log/route.ts` | P2 | 소통 로그 API |
| `src/app/api/agent-dashboard/team/[teamId]/route.ts` | P2 | 팀 상태 갱신 API |
| `src/app/api/agent-dashboard/background/[taskId]/route.ts` | P2 | 백그라운드 작업 API |
| `src/app/api/agent-dashboard/slack/notify/route.ts` | P2 | 슬랙 알림 전송 API |
| `src/app/(main)/admin/agent-dashboard/page.tsx` | P2 | 대시보드 메인 페이지 |
| `src/app/(main)/admin/agent-dashboard/components/*.tsx` | P2 | 대시보드 컴포넌트 (8개) |
| `scripts/terminal-ws-server.mjs` | P3 | WebSocket 서버 (터미널) |
| `src/types/web-terminal.ts` | P3 | 터미널 타입 정의 |
| `src/app/(main)/admin/terminal/page.tsx` | P3 | 터미널 페이지 |
| `src/app/(main)/admin/terminal/terminal-client.tsx` | P3 | 터미널 클라이언트 |
| `src/app/(main)/admin/terminal/components/*.tsx` | P3 | 터미널 컴포넌트 (8개) |
| `src/app/(main)/admin/terminal/hooks/*.ts` | P3 | 터미널 Hook (2개) |
| `src/app/api/terminal/sessions/route.ts` | P3 | 터미널 세션 API |
| `src/app/api/terminal/sessions/[id]/input/route.ts` | P3 | 터미널 입력 API |
| `src/app/api/terminal/sessions/[id]/history/route.ts` | P3 | 터미널 히스토리 API |
| `src/app/api/terminal/slack-log/route.ts` | P3 | 슬랙 로그 API |

### 10.2 수정 파일 (최소 변경)

| 파일 | Phase | 변경 내용 |
|------|:-----:|----------|
| `.claude/hooks/agent-state-sync.sh` | P1 | PDCA auto-sync + checkpoint 갱신 추가 |
| `.claude/hooks/agent-slack-notify.sh` | P2 | 인증 개선 + error.critical 이벤트 추가 |
| `src/lib/slack-notifier.ts` | P1/P2 | 신규 이벤트 3개 + 통합 채널 + Rate Limit 큐잉 + 서킷 브레이커 |
| `src/types/agent-dashboard.ts` | P1 | SlackEventType에 신규 3개 추가, SlackChannelConfigV2 추가 |
| `src/app/(main)/admin/layout.tsx` | P2/P3 | 사이드바에 '에이전트 대시보드', '웹 터미널' 네비게이션 추가 |
| `package.json` | P3 | xterm.js, ws, jsonwebtoken 의존성 추가 |

---

## 11. 패키지 의존성

### 신규 설치 필요

| 패키지 | 버전 | Phase | 용도 |
|--------|------|:-----:|------|
| `chokidar` | ^4.x | P1 | 파일 감시 (chain-watcher 선택) |
| `@xterm/xterm` | ^5.x | P3 | 브라우저 터미널 렌더링 |
| `@xterm/addon-fit` | ^0.10.x | P3 | 터미널 자동 크기 조절 |
| `@xterm/addon-web-links` | ^0.11.x | P3 | URL 클릭 가능 |
| `ws` | ^8.x | P3 | WebSocket 서버 |
| `jsonwebtoken` | ^9.x | P3 | JWT 검증 (WS 서버) |
| `pm2` | ^5.x | P1 | 프로세스 매니저 (글로벌 설치) |

### 기존 사용 중 (추가 설치 불필요)

| 패키지 | 용도 |
|--------|------|
| `@slack/web-api` | 슬랙 알림 전송 |
| `@supabase/supabase-js` | 인증 |
| `next` | 웹 프레임워크 |

---

## 12. 환경변수 총괄

| 환경변수 | Phase | 필수 | 설명 |
|---------|:-----:|:----:|------|
| `SLACK_BOT_TOKEN` | P1 | O | 슬랙 봇 토큰 (`xoxb-...`) |
| `SLACK_UNIFIED_CHANNEL` | P2 | O | 통합 알림 채널 ID |
| `SLACK_CHANNEL_PM` | P2 | X | deprecated (fallback) |
| `SLACK_CHANNEL_CTO` | P2 | X | deprecated (fallback) |
| `SLACK_CHANNEL_MARKETING` | P2 | X | deprecated (fallback) |
| `SLACK_CEO_USER_ID` | P1 | O | CEO DM 전송용 User ID |
| `AGENT_TEAM` | P1 | O | 팀 식별자 (`pm` / `cto` / `marketing`) |
| `TERMINAL_WS_PORT` | P3 | X | WebSocket 서버 포트 (기본: 3001) |
| `SUPABASE_JWT_SECRET` | P3 | O | JWT 검증용 |
| `TERMINAL_POLL_INTERVAL` | P3 | X | capture-pane 폴링 간격 (기본: 100ms) |
| `TERMINAL_SCROLLBACK` | P3 | X | 스크롤백 줄 수 (기본: 1000) |

---

## 13. 용어 정의

| 용어 | 정의 |
|------|------|
| **chain-watcher** | 마커 파일 자동 감시 → 체인 규칙 매칭 → 슬랙 알림 전송 데몬 |
| **idle-detector** | 팀 state.json 갱신 시각 + tmux 세션 상태 모니터링 → idle/stuck/dead 감지 데몬 |
| **state-sync** | TaskCompleted/TeammateIdle Hook에서 state.json + PDCA + checkpoint 자동 갱신 프로세스 |
| **checkpoint** | 세션 상태의 구조화된 스냅샷. 크래시 후 복원 기반 |
| **Structured Context** | 전체 이력 대신 핵심 정보만 구조화하여 전달하는 GuruSup 패턴 |
| **Progress Ledger** | Microsoft Magentic 패턴. 주기적 자가 점검으로 stall 감지 |
| **서킷 브레이커** | 연속 실패 시 해당 경로를 임시 차단하여 시스템 과부하 방지 |
| **마커 파일** | 팀 작업 완료를 선언하는 Markdown 파일. immutable (생성 후 수정 금지) |
| **핸드오프** | 한 팀의 작업 완료 → 다음 팀으로의 작업 전달 |
| **체인 규칙** | `chain-detector.ts`에 정의된 4개 핸드오프 조건 (fromTeam/fromEvent → toTeam/toAction) |
