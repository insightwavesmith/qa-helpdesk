# 오케스트레이션 체인 규약 설계서

> **작성일**: 2026-03-25
> **작성자**: PM팀 설계 담당
> **참조 구현**: `src/lib/chain-detector.ts`, `.claude/hooks/agent-state-sync.sh`, `.claude/hooks/agent-slack-notify.sh`
> **참조 설계**: `docs/02-design/features/agent-dashboard.design.md` (섹션 1.2, 2.6~2.8)
> **타입 정의**: `src/types/agent-dashboard.ts`

---

## 1. 개요

### 1.1 오케스트레이션 체인이란

오케스트레이션 체인은 **여러 에이전트팀 간의 작업 전달(핸드오프)을 표준화한 규약**이다. 팀 A가 작업을 완료하면 정해진 규칙에 따라 팀 B에게 후속 작업이 전달되는 체인(사슬) 구조를 말한다.

현재 3개 에이전트팀(PM팀, 마케팅팀, CTO팀)이 `/tmp/cross-team/` 디렉토리를 통해 상태를 공유하고 있으며, `chain-detector.ts`에 4개 체인 규칙이 코드로 정의되어 있다. 이 문서는 해당 구현을 **공식 규약으로 표준화**한다.

### 1.2 왜 표준 규약이 필요한가

1. **암묵적 규칙의 명문화**: 체인 전달 조건, 마커 파일 형식, state.json 스키마가 코드에만 존재하여 새 팀/에이전트 온보딩 시 혼란 발생
2. **감사 추적(Audit Trail)**: 어떤 팀이 언제 무엇을 완료했고, 다음 팀이 언제 인수했는지 추적 가능해야 함
3. **장애 복구**: 세션 크래시, /tmp 초기화 등 예외 상황에서의 복구 절차 표준화
4. **확장성**: 향후 팀 추가(디자인팀, 데이터팀 등) 시 동일 규약 적용

### 1.3 3팀 간 워크플로우 개요도

```
                         ┌─────────────────────────────┐
                         │     Smith (CEO)              │
                         │         |                    │
                         │     모찌 (COO)               │
                         │    오케스트레이터             │
                         └──────┬──────────────────────┘
                                │ TASK 배정 / 승인
               ┌────────────────┼────────────────┐
               v                v                v
        ┌──────────┐    ┌──────────┐    ┌──────────┐
        │  PM팀    │    │ 마케팅팀  │    │  CTO팀   │
        │  📋      │    │  📊      │    │  ⚙️      │
        │ 기획/설계 │    │ 검증/분석 │    │ 구현/배포 │
        └──────────┘    └──────────┘    └──────────┘
              │                ^  ^            │
              │                │  │            │
              ├── plan.completed ──┼───────────>│  (1) PM→CTO: 구현 착수
              │                │  │            │
              └── plan.completed ─>│            │  (2) PM→마케팅: 검증 준비
                               │  │            │
                               │  └────────────┘  (3) CTO→마케팅: 마케팅 검증
                               │
                               └──────────────>PM  (4) 마케팅→PM: 결과 리뷰

        ※ 모든 핸드오프는 모찌(COO) 확인 후 진행
```

**체인 흐름 요약**:
```
PM(기획 완료) ──> CTO(구현) ──> 마케팅(검증) ──> PM(리뷰) ──> [사이클 완료]
                                   ^
PM(기획 완료) ─────────────────────┘ (검증 준비 병렬 알림)
```

---

## 2. 디렉토리 구조 표준

```
/tmp/cross-team/
├── pm/
│   └── state.json              ← PM팀 운영 상태
├── marketing/
│   └── state.json              ← 마케팅팀 운영 상태
├── cto/
│   └── state.json              ← CTO팀 운영 상태
├── logs/
│   └── comm.jsonl              ← 팀 간 소통 로그 (append-only)
├── background/
│   └── tasks.json              ← 백그라운드 장시간 작업 목록
├── slack/
│   └── queue.jsonl             ← 슬랙 알림 발송 기록 (append-only)
└── 마커 파일들
    ├── pm-plan-done.md         ← PM 기획 완료 마커
    ├── pm-slack-design-done.md ← PM 슬랙 설계 완료 마커
    ├── cto-impl-done.md        ← CTO 구현 완료 마커
    └── mkt-review-done.md      ← 마케팅 검증 완료 마커
```

### 2.1 파일별 상세 명세

| 파일 | 형식 | 쓰기(Write) | 읽기(Read) | 갱신 주기 | 최대 크기 | 보존 기간 |
|------|------|-------------|-----------|----------|----------|----------|
| `{team}/state.json` | JSON | 해당 팀만 | 모든 팀 + 대시보드 API | TASK 상태 변경 시 | 50KB | 세션 종료 시 초기화 |
| `logs/comm.jsonl` | JSONL | 모든 팀 (append) | 모든 팀 + 대시보드 API | 메시지 발생 시 | 1MB | 7일 또는 1000줄 |
| `background/tasks.json` | JSON | 작업 소유 팀 | 모든 팀 + 대시보드 API | 진행률 변경 시 | 20KB | 작업 완료 후 24시간 |
| `slack/queue.jsonl` | JSONL | 슬랙 알림 API | 대시보드 API (디버깅용) | 알림 전송 시 | 500KB | 7일 또는 500줄 |
| 마커 파일 (`*-done.md`) | Markdown | 발신 팀만 생성 | 모찌 + 수신 팀 | 1회 생성 (immutable) | 5KB | 삭제 금지 (감사 추적) |

### 2.2 Read/Write 권한 매트릭스

| 파일 \ 주체 | PM팀 | 마케팅팀 | CTO팀 | 대시보드 API | 모찌(COO) |
|-------------|:----:|:-------:|:-----:|:-----------:|:--------:|
| `pm/state.json` | **RW** | R | R | R | R |
| `marketing/state.json` | R | **RW** | R | R | R |
| `cto/state.json` | R | R | **RW** | R | R |
| `logs/comm.jsonl` | **A** | **A** | **A** | R | R |
| `background/tasks.json` | **W**\* | **W**\* | **W**\* | R | R |
| `slack/queue.jsonl` | - | - | - | **A** | R |
| `pm-*-done.md` | **C** | R | R | R | **R** |
| `cto-*-done.md` | R | R | **C** | R | **R** |
| `mkt-*-done.md` | R | **C** | R | R | **R** |

> **범례**: R=읽기, W=덮어쓰기, A=추가(append), C=생성(create, 1회), \*=자기 팀 작업만

---

## 3. state.json 표준 포맷

### 3.1 JSON 스키마

```jsonc
{
  // 필수 필드
  "name": "PM팀",                    // string — 팀 표시 이름 (한국어)
  "emoji": "📋",                     // string — 팀 아이콘 이모지
  "status": "active",               // TeamStatus — "active" | "planned" | "idle"
  "color": "#8b5cf6",               // string — 팀 대표 색상 (HEX)
  "members": [                       // AgentMember[] — 팀원 목록
    {
      "name": "pm-lead",            // string — 에이전트 식별자
      "model": "opus",              // AgentModel — "opus" | "sonnet" | "haiku"
      "role": "기획 총괄"            // string — 역할 설명 (한국어)
    }
  ],
  "tasks": [                         // AgentTask[] — TASK 목록
    {
      "id": "T1",                   // string — TASK 식별자
      "title": "타입 정의",          // string — 작업 제목 (한국어)
      "status": "done",             // TaskStatus — "pending" | "active" | "done" | "blocked"
      "assignee": "frontend-dev",   // string? — 담당 에이전트 (선택)
      "updatedAt": "2026-03-25T14:30:00+09:00"  // string — ISO 8601
    }
  ],

  // 선택 필드
  "updatedAt": "2026-03-25T14:30:00+09:00",  // string? — 마지막 갱신 시각
  "sessionId": "abc123",                       // string? — 현재 Claude 세션 ID
  "contextUsage": 45,                          // number? — 컨텍스트 사용률 (%)
  "currentFeature": "agent-dashboard"          // string? — 현재 작업 중인 기능명
}
```

### 3.2 필수 필드 vs 선택 필드

| 필드 | 필수 여부 | 타입 | 설명 |
|------|:--------:|------|------|
| `name` | **필수** | string | 팀 표시 이름 |
| `emoji` | **필수** | string | 팀 아이콘 |
| `status` | **필수** | TeamStatus | 팀 운영 상태 |
| `color` | **필수** | string | HEX 색상 코드 |
| `members` | **필수** | AgentMember[] | 빈 배열 허용 |
| `tasks` | **필수** | AgentTask[] | 빈 배열 허용 |
| `updatedAt` | 선택 | string | ISO 8601, hook이 자동 갱신 |
| `sessionId` | 선택 | string | 세션 추적용 |
| `contextUsage` | 선택 | number | 0~100, 대시보드 표시용 |
| `currentFeature` | 선택 | string | PDCA 연동용 |

### 3.3 status 값 열거 및 전이 규칙

**TeamStatus (팀 전체 상태)**:

| 값 | 의미 | 전이 가능 대상 |
|----|------|---------------|
| `planned` | TASK 배정됨, 아직 미시작 | `active` |
| `active` | 작업 진행 중 | `idle`, `planned` |
| `idle` | 모든 작업 완료, 대기 중 | `planned`, `active` |

```
planned ──(세션 시작)──> active ──(전체 완료)──> idle
   ^                                              │
   └──────────(새 TASK 배정)──────────────────────┘
```

**TaskStatus (개별 TASK 상태)**:

| 값 | 의미 | 전이 가능 대상 |
|----|------|---------------|
| `pending` | 대기 (선행 작업 미완료) | `active`, `blocked` |
| `active` | 진행 중 | `done`, `blocked` |
| `blocked` | 차단됨 (외부 의존성) | `pending`, `active` |
| `done` | 완료 | (최종 상태, 되돌리기 금지) |

```
pending ──(착수)──> active ──(완료)──> done
   │                  │
   └──(차단)──> blocked ──(해소)──> active
                  ^                   │
                  └───(재차단)─────────┘
```

**규칙**:
- `done`은 최종 상태다. 되돌리기 금지 (새 TASK를 생성해야 함)
- `blocked` → `done` 직접 전이 금지 (반드시 `active`를 거쳐야 함)
- 모든 전이 시 `updatedAt` 갱신 필수

### 3.4 state.json 예시 (PM팀 기획 완료 상태)

```json
{
  "name": "PM팀",
  "emoji": "📋",
  "status": "idle",
  "color": "#8b5cf6",
  "members": [
    { "name": "pm-lead", "model": "opus", "role": "기획 총괄" },
    { "name": "pm-designer", "model": "sonnet", "role": "설계 담당" }
  ],
  "tasks": [
    {
      "id": "T1",
      "title": "에이전트 대시보드 Plan 작성",
      "status": "done",
      "assignee": "pm-lead",
      "updatedAt": "2026-03-24T22:00:00+09:00"
    },
    {
      "id": "T2",
      "title": "에이전트 대시보드 Design 작성",
      "status": "done",
      "assignee": "pm-designer",
      "updatedAt": "2026-03-24T23:30:00+09:00"
    }
  ],
  "updatedAt": "2026-03-24T23:30:00+09:00",
  "currentFeature": "agent-dashboard"
}
```

---

## 4. comm.jsonl (소통 로그) 표준 포맷

### 4.1 형식

한 줄 = 하나의 JSON 객체. **append-only** (절대 덮어쓰기/수정/삭제 금지).

### 4.2 필드 정의

```jsonc
{
  // 필수 필드
  "time": "2026-03-25T14:30:00+09:00",  // string — ISO 8601 (KST)
  "from": "pm-lead",                     // string — 발신자 에이전트명
  "team": "pm",                          // TeamId — 발신 팀 ("pm" | "marketing" | "cto")
  "msg": "대시보드 기획서 전달합니다",      // string — 메시지 본문

  // 선택 필드
  "to": "cto-lead",                      // string? — 수신자 (없으면 전체 브로드캐스트)
  "metadata": {                           // object? — 부가 정보
    "feature": "agent-dashboard",        // string? — 관련 기능명
    "taskId": "T2",                      // string? — 관련 TASK ID
    "type": "handoff"                    // string? — 메시지 유형 (info, handoff, question, alert)
  }
}
```

### 4.3 예시

```jsonl
{"time":"2026-03-24T22:10:00+09:00","from":"pm-lead","team":"pm","msg":"에이전트 대시보드 Plan 문서 완료"}
{"time":"2026-03-24T23:30:00+09:00","from":"pm-designer","team":"pm","msg":"Design 문서 완료, CTO팀 구현 착수 가능","to":"cto-lead","metadata":{"feature":"agent-dashboard","type":"handoff"}}
{"time":"2026-03-25T01:00:00+09:00","from":"cto-lead","team":"cto","msg":"T1 타입 정의 착수","metadata":{"taskId":"T1"}}
```

### 4.4 Rotate 규칙

| 조건 | 동작 |
|------|------|
| 줄 수 > 1000 | 가장 오래된 줄부터 삭제하여 1000줄 유지 |
| 보존 기간 > 7일 | 7일 이전 로그 삭제 |
| 파일 크기 > 1MB | 즉시 rotate (오래된 500줄 삭제) |

**Rotate 실행 주체**: `agent-state-sync.sh` hook이 갱신 시 줄 수 확인 후 자동 rotate.

**Rotate 절차**:
1. `comm.jsonl` → `comm.jsonl.bak` 복사 (백업)
2. 최근 500줄만 남기고 잘라내기
3. 백업 파일은 24시간 후 삭제

---

## 5. 체인 전달 규약 (핵심)

### 5.1 체인 규칙 테이블

현재 `src/lib/chain-detector.ts`에 정의된 4개 규칙을 공식 규약으로 채택한다.

| # | from 팀 | 트리거 이벤트 | to 팀 | 액션 | 마커 파일 | 슬랙 알림 |
|---|---------|-------------|-------|------|----------|----------|
| C1 | PM | `plan.completed` | CTO | 구현 착수 필요 | `pm-plan-done.md` | chain.handoff (양쪽 팀 + CEO DM) |
| C2 | PM | `plan.completed` | 마케팅 | 검증 준비 필요 | `pm-plan-done.md` | chain.handoff (양쪽 팀 + CEO DM) |
| C3 | CTO | `implementation.completed` | 마케팅 | 마케팅 검증 시작 | `cto-impl-done.md` | chain.handoff (양쪽 팀 + CEO DM) |
| C4 | 마케팅 | `review.completed` | PM | 결과 리뷰 필요 | `mkt-review-done.md` | chain.handoff (양쪽 팀 + CEO DM) |

> **C1, C2는 동일 트리거**: PM의 `plan.completed`는 CTO와 마케팅에 동시 전달. 단, CTO는 구현 착수, 마케팅은 검증 준비(사전 작업)로 액션이 다르다.

**이벤트 판정 기준**:
| 이벤트 | 판정 조건 |
|--------|----------|
| `plan.completed` | 해당 팀의 state.json 내 모든 기획 TASK가 `done` + plan/design 문서 존재 |
| `implementation.completed` | 해당 팀의 state.json 내 모든 구현 TASK가 `done` + build 성공 |
| `review.completed` | 해당 팀의 state.json 내 모든 검증 TASK가 `done` + 분석 문서 존재 |

### 5.2 마커 파일 규약

#### 파일명 패턴

```
{team}-{event}-done.md
```

| 팀 | team 약어 |
|----|----------|
| PM팀 | `pm` |
| CTO팀 | `cto` |
| 마케팅팀 | `mkt` |

| 이벤트 | event 약어 |
|--------|-----------|
| plan.completed | `plan` |
| implementation.completed | `impl` |
| review.completed | `review` |
| 기타 | 케밥 케이스 (예: `slack-design`) |

**예시**: `pm-plan-done.md`, `cto-impl-done.md`, `mkt-review-done.md`

#### 마커 파일 내용 포맷

```markdown
# {팀명} {이벤트 설명}

## 기능: {기능명}
- **완료 시각**: {ISO 8601}
- **상태**: {완료 내용 요약}

## 산출물
1. `{파일 경로}` --- {설명}
2. `{파일 경로}` --- {설명}

## 요약
- {작업 내용 1}
- {작업 내용 2}
- {핵심 수치/결과}

## 다음 단계
-> {수신 팀}이 {액션 설명}
-> {추가 요청 사항}
```

#### 마커 파일 규칙

| 규칙 | 설명 |
|------|------|
| **생성 주체** | 발신 팀만 생성 가능 |
| **변경 금지** | 생성 후 수정/삭제 절대 금지 (감사 추적용) |
| **저장 위치** | `/tmp/cross-team/` 루트에 저장 (팀 디렉토리 안이 아님) |
| **인코딩** | UTF-8, LF 줄바꿈 |
| **최대 크기** | 5KB 이하 |
| **중복 생성** | 동일 이벤트의 마커가 이미 존재하면 덮어쓰기 금지. 기능명을 접미사로 구분 (예: `pm-plan-done-agent-dashboard.md`) |

### 5.3 핸드오프 프로세스 (단계별)

```
┌──────────────────────────────────────────────────────────────┐
│                    핸드오프 프로세스 흐름                      │
│                                                              │
│  팀A               Hook              모찌(COO)        팀B    │
│   │                  │                  │               │    │
│   │──(1) 전체 TASK 완료                 │               │    │
│   │──(2) state.json 갱신                │               │    │
│   │──(3) 마커 파일 생성                  │               │    │
│   │                  │                  │               │    │
│   │─────────────────>│                  │               │    │
│   │            (4) 완료 감지             │               │    │
│   │            체인 규칙 매칭             │               │    │
│   │                  │──(슬랙 알림)──────>│               │    │
│   │                  │                  │               │    │
│   │                  │          (5) 마커 파일 확인        │    │
│   │                  │          state.json 검증          │    │
│   │                  │          설계 문서 존재 확인       │    │
│   │                  │                  │               │    │
│   │                  │                  │──(6) TASK 배정─>│    │
│   │                  │                  │               │    │
│   │                  │                  │    (7) 마커 확인│    │
│   │                  │                  │        작업 시작│    │
│   │                  │                  │               │    │
│   │                  │         (8) comm.jsonl에          │    │
│   │                  │             핸드오프 기록          │    │
└──────────────────────────────────────────────────────────────┘
```

**각 단계 상세**:

#### 단계 1: 팀 A — 모든 TASK 완료
- 팀의 모든 AgentTask가 `status: "done"`으로 전이
- 빌드 성공 확인 (`npm run build` 통과)
- Gap 분석 문서 작성 완료 (Match Rate 90%+, 해당 시)

#### 단계 2: 팀 A — state.json 갱신
- 모든 `tasks[].status`를 `"done"`으로 업데이트
- `status`를 `"idle"`로 변경
- `updatedAt`을 현재 시각으로 갱신
- `agent-state-sync.sh` hook이 TaskCompleted 이벤트에서 자동 실행

#### 단계 3: 팀 A — 마커 파일 생성
- `/tmp/cross-team/{team}-{event}-done.md` 생성
- 5.2절의 포맷에 따라 내용 작성
- 산출물 목록, 요약, 다음 단계 반드시 포함

#### 단계 4: Hook — 완료 감지 및 슬랙 알림
- `agent-slack-notify.sh`가 TaskCompleted 이벤트 수신
- state.json 읽어서 모든 TASK `done` 여부 확인
- `chain.handoff` 이벤트로 슬랙 알림 전송
- `chain-detector.ts`의 `detectChainHandoff()`로 수신 팀 결정
- 양쪽 팀 채널 + CEO DM으로 Block Kit 메시지 전송

#### 단계 5: 모찌(COO) — 검증 및 승인
- 슬랙 `chain.handoff` 알림 수신
- 아래 체크리스트 확인 (6절 상세):
  - [ ] 마커 파일 존재
  - [ ] state.json 전체 TASK 완료
  - [ ] 설계 문서(plan/design) 존재
  - [ ] Match Rate 90%+ (해당 시)
- 모든 항목 통과 시 다음 팀에 TASK 배정

#### 단계 6: 모찌(COO) — 다음 팀 TASK 배정
- 수신 팀의 TASK.md 생성
- 마커 파일의 "다음 단계" 섹션을 TASK.md에 반영
- 수신 팀의 state.json을 `status: "planned"`로 갱신

#### 단계 7: 팀 B — 마커 파일 확인 및 작업 시작
- 마커 파일 읽기 (산출물 경로, 요약 확인)
- 관련 설계 문서(plan/design) 로드
- state.json을 `status: "active"`로 갱신
- 작업 시작

#### 단계 8: 소통 로그 기록
- 핸드오프 완료 시 comm.jsonl에 기록
- `metadata.type: "handoff"` 태그 필수

---

## 6. 모찌(COO) 체크 타이밍 및 트리거

### 6.1 자동 트리거

| 트리거 | 소스 | 동작 |
|--------|------|------|
| 슬랙 `chain.handoff` 알림 | `agent-slack-notify.sh` | 모찌에게 CEO DM 전송, 대시보드 링크 포함 |
| 슬랙 `task.completed` 알림 | `agent-slack-notify.sh` | 팀 채널에만 전송 (모찌는 채널 멤버로 확인) |

### 6.2 수동 체크

| 방법 | 주기 | 대상 |
|------|------|------|
| 대시보드 확인 | 수시 (작업 중) | `https://bscamp.app/admin/agent-dashboard` |
| 디렉토리 직접 확인 | 필요 시 | `ls /tmp/cross-team/` |
| state.json 확인 | 체인 전달 시 | `cat /tmp/cross-team/{team}/state.json` |

### 6.3 모찌의 확인 항목 체크리스트

핸드오프 승인 전 반드시 아래 항목을 모두 확인한다.

```
## 핸드오프 승인 체크리스트

### 필수 (전부 통과해야 승인)
- [ ] 마커 파일 존재: /tmp/cross-team/{team}-{event}-done.md
- [ ] state.json 전체 TASK `done`: jq '.tasks[] | select(.status != "done")' 결과 0건
- [ ] Plan 문서 존재: docs/01-plan/features/{기능}.plan.md
- [ ] Design 문서 존재: docs/02-design/features/{기능}.design.md

### 조건부 (해당 시 확인)
- [ ] Match Rate 90%+: docs/03-analysis/{기능}.analysis.md 확인
- [ ] 빌드 성공: /tmp/agent-build-passed 마커 존재
- [ ] 코드 리뷰 완료: /tmp/agent-review-passed 마커 존재

### 승인 후 동작
- [ ] 수신 팀 TASK.md 생성
- [ ] 수신 팀 state.json에 tasks 추가 (status: "pending")
- [ ] comm.jsonl에 핸드오프 승인 기록
```

### 6.4 승인 거부 시

- 모찌가 부족한 항목을 슬랙으로 발신 팀에 전달
- 발신 팀은 보완 후 마커 파일을 새로 생성 (기존 마커는 유지, 접미사 `-v2` 등 추가)
- 재확인 요청

---

## 7. 파일 잠금 규칙

### 7.1 원칙

`/tmp/cross-team/`은 파일 시스템 기반이므로 POSIX 잠금 대신 **디렉토리 분리 + 규약**으로 동시 쓰기를 방지한다.

### 7.2 잠금 매트릭스

| 파일 | 잠금 방식 | 동시 쓰기 가능 여부 | 근거 |
|------|----------|:------------------:|------|
| `{team}/state.json` | 팀별 디렉토리 분리 | **불가** (해당 팀만 write) | 2.2절 권한 매트릭스 |
| `logs/comm.jsonl` | Atomic append | **가능** (각 팀 독립 append) | JSONL 한 줄 단위 atomic write |
| `background/tasks.json` | 팀별 작업 ID 분리 | **주의** (동시 수정 시 충돌 가능) | 아래 규칙 참조 |
| `slack/queue.jsonl` | API 서버 단일 쓰기 | **불가** (API만 write) | 2.2절 권한 매트릭스 |
| 마커 파일 | 1회 생성 후 immutable | **해당 없음** | 5.2절 규칙 |

### 7.3 comm.jsonl Atomic Append 규칙

```bash
# 올바른 방법: echo + >> (atomic append)
echo '{"time":"...","from":"pm-lead","team":"pm","msg":"..."}' >> /tmp/cross-team/logs/comm.jsonl

# 금지: 파일 전체 읽기 → 수정 → 덮어쓰기 (경쟁 조건 발생)
# cat comm.jsonl | ... > comm.jsonl   ← 절대 금지
```

### 7.4 background/tasks.json 동시 수정 방지

- 각 팀은 자기 팀의 `team` 필드 작업만 수정
- 다른 팀의 작업 항목 수정 금지
- 전체 파일 덮어쓰기 시, 반드시 다른 팀 작업 항목은 원본 유지

---

## 8. 에러 시나리오

### 8.1 팀 세션 크래시

| 감지 | 기준 | 동작 |
|------|------|------|
| state.json `updatedAt` 확인 | 마지막 갱신으로부터 **5분** 무갱신 | `stale` 판정 |
| 대시보드 connection.status | `stale` (30초 무갱신) → `disconnected` (60초) | UI에 경고 표시 |
| 모찌 대응 | `disconnected` 상태 5분 지속 | 세션 재시작 판단 |

**복구 절차**:
1. 모찌가 해당 팀 세션 상태 확인 (tmux에서 직접 확인)
2. 세션 크래시 확인 시 새 세션 시작
3. 새 세션은 `state.json`을 읽어서 마지막 상태 복원
4. `comm.jsonl`에 세션 재시작 기록: `{"type":"session_restart","team":"..."}`
5. 미완료 TASK부터 이어서 진행

### 8.2 마커 파일 없이 다음 팀 시작 시도

| 상황 | 차단 주체 | 동작 |
|------|----------|------|
| 마커 파일 미존재 | 모찌(COO) | TASK 배정 거부 |
| 모찌 부재 시 | 수신 팀 자체 확인 | `/tmp/cross-team/` 에서 마커 확인 후 없으면 대기 |

**규칙**: 마커 파일 없이 다음 팀이 작업을 시작하는 것은 **규약 위반**이다. 모든 핸드오프는 반드시 마커 파일을 통해 진행한다.

### 8.3 /tmp 초기화 (서버 재시작)

`/tmp`는 서버 재시작 시 초기화될 수 있다. 이 경우:

1. **자동 복구**: `agent-state-sync.sh`가 실행 시 `mkdir -p`로 디렉토리 구조 재생성
2. **데이터 손실 범위**: state.json, comm.jsonl, 마커 파일 전부 손실
3. **복구 소스**:
   - state.json → 각 팀이 세션 시작 시 MEMORY.md 기반으로 재생성
   - comm.jsonl → 복구 불가 (로그 유실 감수)
   - 마커 파일 → 설계 문서(docs/)가 존재하면 마커 재생성 가능
4. **예방**: 중요 마커 파일은 `docs/04-report/` 디렉토리에도 사본 보관 권장

```bash
# agent-state-sync.sh 초기화 로직 (기존 구현)
CROSS_TEAM_DIR="/tmp/cross-team"
mkdir -p "$CROSS_TEAM_DIR/pm"
mkdir -p "$CROSS_TEAM_DIR/marketing"
mkdir -p "$CROSS_TEAM_DIR/cto"
mkdir -p "$CROSS_TEAM_DIR/logs"
mkdir -p "$CROSS_TEAM_DIR/background"
mkdir -p "$CROSS_TEAM_DIR/slack"
```

### 8.4 체인 규칙에 없는 이벤트 발생

- `detectChainHandoff()`가 빈 배열 반환
- 슬랙에 `task.completed`만 전송 (chain.handoff 없음)
- 모찌가 수동으로 다음 팀 판단 후 TASK 배정

### 8.5 동일 마커 중복 생성 시도

- 기존 마커 파일이 있으면 **덮어쓰기 금지**
- 기능명 접미사로 구분: `pm-plan-done-{기능명}.md`
- 예: `pm-plan-done.md` (1차), `pm-plan-done-orchestration-chain.md` (2차)

---

## 9. 구현 순서 (CTO팀용 체크리스트)

CTO팀이 이 규약을 코드로 구현할 때의 우선순위와 체크리스트.

### Wave 1: 기반 인프라 (선행 필수)

| # | 작업 | 산출물 | 의존성 |
|---|------|--------|--------|
| I1 | `/tmp/cross-team/` 디렉토리 구조 초기화 스크립트 | `scripts/init-cross-team.sh` | 없음 |
| I2 | state.json JSON Schema 검증 유틸리티 | `src/lib/cross-team/validate-state.ts` | I1 |
| I3 | state.json 읽기/쓰기 유틸리티 | `src/lib/cross-team/state-io.ts` | I2 |

### Wave 2: 소통 + 마커 (병렬 가능)

| # | 작업 | 산출물 | 의존성 |
|---|------|--------|--------|
| I4 | comm.jsonl append + rotate 로직 | `src/lib/cross-team/comm-log.ts` | I1 |
| I5 | 마커 파일 생성 유틸리티 | `src/lib/cross-team/marker.ts` | I1 |
| I6 | 마커 파일 읽기 + 검증 유틸리티 | `src/lib/cross-team/marker.ts` | I5 |

### Wave 3: 체인 감지 + 대시보드 (Wave 1, 2 완료 후)

| # | 작업 | 산출물 | 의존성 |
|---|------|--------|--------|
| I7 | `chain-detector.ts` 확장 (이벤트 판정 로직 추가) | `src/lib/chain-detector.ts` (기존 파일) | I3 |
| I8 | 대시보드 API에서 체인 상태 표시 | `src/app/api/agent-dashboard/chain/route.ts` | I3, I5, I7 |
| I9 | `agent-state-sync.sh` 개선 (rotate, 검증 추가) | `.claude/hooks/agent-state-sync.sh` | I4 |

### Wave 4: 검증

| # | 작업 | 산출물 | 의존성 |
|---|------|--------|--------|
| I10 | 전체 핸드오프 시나리오 E2E 테스트 | `docs/03-analysis/orchestration-chain.analysis.md` | I7, I8, I9 |

---

## 10. Executive Summary

| 항목 | 내용 |
|------|------|
| **문서명** | 오케스트레이션 체인 규약 설계서 |
| **목적** | 3팀(PM/마케팅/CTO) 간 작업 핸드오프 규약 표준화 |
| **핵심 인프라** | `/tmp/cross-team/` 파일 기반 상태 공유 |
| **체인 규칙** | 4개 (PM→CTO, PM→마케팅, CTO→마케팅, 마케팅→PM) |
| **오케스트레이터** | 모찌(COO) — 슬랙 알림 수신 후 마커 확인 → 다음 팀 TASK 배정 |
| **상태 파일** | `state.json` (팀별), `comm.jsonl` (소통), 마커 파일 (핸드오프) |
| **자동화** | `agent-state-sync.sh` (상태 갱신), `agent-slack-notify.sh` (알림 + 체인 감지) |
| **에러 복구** | 5분 stale 감지, /tmp 초기화 시 자동 재생성, 마커 없으면 핸드오프 차단 |
| **구현 순서** | 4 Wave, 10 작업 항목 (CTO팀 체크리스트) |
| **기존 구현 참조** | `chain-detector.ts` (4규칙), `slack-notifier.ts` (Block Kit), hook 2개 |
| **타입 정의** | `src/types/agent-dashboard.ts` — TeamId, TeamState, ChainRule 등 |
