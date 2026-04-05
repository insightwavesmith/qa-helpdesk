# 브릭 P0 아키텍처 — 7단계 구조 사고

> 2026-04-04 16:35 모찌 작성. `skills/coo-architect/SKILL.md` 7단계 적용.

---

## Step 1: 재해석

Smith님 한 마디: "3축 제대로 만들면 굴러가지 않을까. 종료는 문서. 승인은 Gate on/off."

날카롭게: **3축 엔진 코드는 있다. 빠진 건 '블록이 끝났다는 증거(문서)', '실행자의 역할(프롬프트)', '실패 원인 가시성(stderr)' 3가지다. 이걸 채우면 E2E가 돈다.**

---

## Step 2: 기존 탐색

| 필요한 것 | 이미 있는 것 | 빠진 것 |
|-----------|-------------|---------|
| 종료=문서 | `DoneCondition.artifacts` 모델 ✅ | 파일 존재 검증 로직 ❌, 템플릿 ❌ |
| 프롬프트 주입 | `--bare` 옵션 ✅, `--system-prompt-file` CLI 지원 ✅ | 어댑터 코드에 미연결 ❌, agents/ 없음 ❌ |
| 실패 가시성 | stderr 캡처 ✅ (claude_local), EventBus ✅, SlackSubscriber ✅ | 실패 이벤트 미구독 ❌, stderr 미포함 ❌ |
| 승인 알림 | approval Gate ✅, approve/reject 로직 ✅ | 대기 시 Slack 알림 ❌ |
| 프로젝트 구조 | 없음 | `projects/` 디렉토리 전체 ❌ |
| bkit 템플릿 | bkit에 18개 있음 ✅ | 우리 프로젝트에 복사 안 됨 ❌ |
| croniter | cron_scheduler.py 코드 ✅ | pip install 안 함 ❌ |

**핵심: 새로 만들 코드가 아니라, 이미 있는 것들을 '연결'하는 작업이다.**

---

## Step 3: 축 분해

P0의 축은 3개다:

### 축 1: 산출물 (Output)
- 담당: 블록이 끝났다는 *증거*
- 없으면: 빈 손으로 "완료" → 다음 블록 재료 없음
- 구성: 문서 템플릿 + artifact 검증 + 프로젝트별 경로

### 축 2: 컨텍스트 (Context)
- 담당: 실행자가 *뭘 해야 하는지* 아는 것
- 없으면: CTO가 "나 뭐 하는 사람?" 상태로 시작
- 구성: 에이전트 프롬프트 + `--system-prompt-file` 주입

### 축 3: 가시성 (Visibility)
- 담당: 무슨 일이 일어나는지 *밖에서 보이는 것*
- 없으면: 실패해도 "왜"를 모름 + 승인 대기해도 아무도 모름
- 구성: stderr Slack 보고 + approval 알림

**독립성 체크:**
- 산출물 없어도 컨텍스트 주입 가능? → ✅ 독립
- 컨텍스트 없어도 가시성 작동 가능? → ✅ 독립
- 가시성 없어도 산출물 검증 가능? → ✅ 독립
→ 3축 독립. 병렬 개발 가능.

**선행 조건:** croniter + hooks 정리 (TASK-5) = 3축 전부의 전제.

---

## Step 4: Understanding Lock 🔒

| 항목 | 내용 |
|------|------|
| **뭘 만드는가** | 3축(산출물+컨텍스트+가시성) 채워서 E2E 완성 |
| **왜 필요한가** | 엔진은 돌아가지만 "증거/역할/원인"이 없어서 자율 운영 불가 |
| **핵심 축** | 산출물(Output), 컨텍스트(Context), 가시성(Visibility) |
| **기존 자산** | DoneCondition 모델, --bare/--system-prompt-file, stderr 캡처, EventBus, SlackSubscriber, approval Gate, bkit 템플릿 18개 |
| **안 하는 것** | 오픈소스 패키징, SkyOffice UI, 멀티유저, 새 Link/Gate 타입 추가 |
| **가정** | `--system-prompt-file`이 `--bare`와 조합 가능 (CLI help에 명시) |

> Smith님, 이게 맞나? 틀린 거 있으면 말해.

---

## Step 5: 레이어 설계

### 축 1: 산출물 (Output)

```
A. 프로젝트 디렉토리
   brick/projects/
   ├── bscamp/tasks/ plans/ designs/ reports/
   ├── brick-engine/tasks/ plans/ designs/ reports/
   └── skyoffice/tasks/ plans/ designs/ reports/
   brick/templates/  ← 공통 문서 템플릿

B. 문서 템플릿 (bkit에서 복사)
   plan.template.md (8.9KB) — 목표/범위/제약/검증기준
   design.template.md (13.1KB) — TDD/불변식/영향범위
   do.template.md (7.9KB) — 구현 가이드 + Session Scope
   report.template.md (5.6KB) — 완료 보고서
   analysis.template.md (11.7KB) — Gap 분석

C. artifact 검증 로직
   complete_block()에서:
   if block.done.artifacts:
       for path in block.done.artifacts:
           if not os.path.exists(resolve(project, path)):
               → gate_failed 이벤트 (재작성 루프)
   else:
       → 기존 동작 (하위호환)

D. 프리셋 YAML 변경
   blocks:
     plan:
       done:
         artifacts: ["plans/{feature}.plan.md"]
       gate:
         handlers:
           - type: approval
             approver: coo
         on_fail: retry
```

엣지케이스:
- artifact 경로에 `{feature}` 변수 치환 필요
- 프로젝트명 지정 안 하면? → 프리셋 YAML에 `project` 필드 필수
- 동일 파일명 충돌? → `{feature}-{timestamp}` 패턴

### 축 2: 컨텍스트 (Context)

```
A. 에이전트 프롬프트 디렉토리
   brick/agents/
   ├── cto-lead.md     ← bkit cto-lead 기반
   ├── pm-lead.md      ← bkit pm-lead 기반
   ├── qa-monitor.md   ← bkit qa-monitor 기반
   └── ...12개

B. claude_local 어댑터 수정
   현재 (line 287):
   args = ["--print", "-", "--output-format", "stream-json", "--verbose", "--bare"]

   변경:
   args = ["--print", "-", "--output-format", "stream-json", "--verbose", "--bare"]
   if role := block_config.get("role"):
       prompt_file = f"agents/{role}.md"
       if os.path.exists(prompt_file):
           args.extend(["--system-prompt-file", prompt_file])

C. 프리셋 YAML 변경
   blocks:
     do:
       team:
         adapter: claude_local
         role: cto-lead    ← 추가
```

엣지케이스:
- role 지정 안 하면? → 프롬프트 없이 실행 (기존 동작)
- 프롬프트 파일 없으면? → 경고 로그 + 계속 실행 (hard fail 아님)
- `--continue` 세션에서 프롬프트 중복? → 첫 실행에만 적용

### 축 3: 가시성 (Visibility)

```
A. SlackSubscriber 실패 이벤트 추가
   구독 추가:
   event_bus.subscribe("block.adapter_failed", self._on_event)
   event_bus.subscribe("block.gate_failed", self._on_event)

   포맷:
   ❌ 블록 실패: *{block_id}*
   프로젝트: {project}
   exit code: {exit_code}
   ```
   {stderr 마지막 10줄}
   ```
   재시도: {retry_count}/{max_retries}

B. executor에서 adapter_failed에 stderr 포함
   현재: Event(type="block.adapter_failed", data={"block_id": ...})
   변경: data에 stderr, exit_code, error_message 추가

C. approval 대기 시 Slack 알림
   gate.pending 이벤트 신규 추가
   포맷:
   🔍 검토 대기: *{block_id}*
   프로젝트: {project}
   산출물: {artifact_paths}
   승인: POST /api/v1/engine/{wf}/gate/{block}/approve
   반려: POST /api/v1/engine/{wf}/gate/{block}/reject?reason=...
```

엣지케이스:
- SLACK_BOT_TOKEN 없으면? → 경고 로그 + 스킵 (이미 처리됨)
- stderr가 비어있으면? → "(stderr 없음)" 표시
- 연속 실패 Slack 폭탄? → 같은 블록 재시도 시 이전 메시지 업데이트 (thread)

---

## Step 6: 옵션 + 결정 (ADR)

### 결정 1: artifact 검증 시점

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. complete_block() 안에서 | 간단, 한 곳에서 체크 | Gate와 역할 혼재 |
| B. 전용 Gate `artifact` 타입 추가 | Gate 체계 통일, on/off 가능 | 8번째 Gate 타입 = 복잡도 ↑ |
| **C. 기존 `command` Gate 활용** | 새 Gate 안 만듦, YAML에서 자유도 | artifact 검증이 Gate에 묻힘 |

→ **B안 추천.** `artifact` Gate = "파일 있으면 pass, 없으면 fail". Gate 체계 안에서 on/off 가능. Smith님이 말한 "승인=Gate on/off" 원칙과 일관. 하지만 복잡도 우려 시 A안도 충분.

```
결정: B안 (artifact Gate 타입)
대안: A안 (complete_block 안에서 직접)
이유: Gate on/off 원칙 일관성 + YAML에서 선언적 제어
```

### 결정 2: 프롬프트 주입 방식

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. `--system-prompt-file` | 깔끔, CLI 네이티브 | CLAUDE.md 안 읽힘 (bare) |
| B. `--append-system-prompt-file` | CLAUDE.md + 추가 프롬프트 | bare 안 쓰면 hooks 충돌 |
| **C. `--bare` + `--system-prompt-file` + `--add-dir`** | hooks 안 읽히고 + 프롬프트 + CLAUDE.md 디렉토리 지정 가능 | 조합이 복잡 |

→ **A안 추천.** `--bare` + `--system-prompt-file`이 가장 간단. CLAUDE.md에 넣을 내용은 에이전트 프롬프트 .md에 통합. 나중에 필요하면 C안으로 확장.

```
결정: A안 (--bare + --system-prompt-file)
대안: C안 (--add-dir 추가)
이유: 단순함 우선 (YAGNI). 프롬프트 하나에 역할+규칙 통합.
```

### 결정 3: 실행 순서

| 옵션 | 장점 | 단점 |
|------|------|------|
| A. 순차 (TASK-5 → 1 → 2 → 4 → 3) | 안전, 의존성 명확 | 느림 |
| **B. TASK-5 후 1/2/4 병렬 → 3** | 3축 독립이니까 병렬 가능 | CTO 한 명이면 병렬 못함 |
| C. 전부 하나로 묶기 | 컨텍스트 공유 | 너무 큼, 실패 시 롤백 어려움 |

→ **B안.** 3축 독립 확인됨. CTO-1이 하나씩 가도 되고, 병렬 가능하면 3개 동시.

```
결정: B안 (TASK-5 선행 → 1/2/4 병렬 → 3)
대안: A안 (순차)
이유: 3축 독립 확인, 병렬 가능
```

---

## Step 7: 핸드오프

### TASK-5: 선행 (수동, 10분)
```
pip install croniter
.bkit/hooks/ 43개 삭제 (3개 유지: destructive-detector, prevent-tmux-kill, enforce-agent-teams)
검증: python3 -m pytest 전체 → 0 collection error
```

### TASK-1: 산출물 축 (Output)
```
1. brick/projects/{bscamp,brick-engine,skyoffice}/{tasks,plans,designs,reports}/ 생성
2. brick/templates/ 에 bkit 템플릿 5개 복사
3. artifact Gate 타입 추가 (ConcreteGateExecutor에 register_gate("artifact", ...))
4. 프리셋 YAML에 project 필드 + done.artifacts 패턴 추가
5. 기존 Design 160개 프로젝트별 분류

검증:
- 블록 완료 시 artifact 없으면 → gate_failed
- artifact 있으면 → 정상 완료
- projects/ 에 문서 생성 확인

참고 Design: brick-review-block, brick-ceo-approval-gate
참고 코드: DoneCondition (models/block.py), complete_block (executor.py)
```

### TASK-2: 컨텍스트 축 (Context)
```
1. brick/agents/ 에 프롬프트 12개 생성 (bkit 에이전트 기반)
2. claude_local.py에 --system-prompt-file 옵션 추가
3. 프리셋 YAML에 role 필드 추가

검증:
- 블록 실행 시 Claude Code가 역할 인식 (stdout에 반영)
- role 미지정 시 기존 동작 유지

참고 Design: brick-agent-abstraction
참고 코드: claude_local.py line 287 (args 배열)
참고: bkit agents/ 디렉토리
```

### TASK-4: 가시성 축 — 실패 (Visibility-Fail)
```
1. SlackSubscriber에 block.adapter_failed, block.gate_failed 구독 추가
2. executor에서 adapter_failed 이벤트 data에 stderr/exit_code 포함
3. _format_message에 실패 포맷 추가

검증:
- 의도적 실패 → Slack에 stderr 10줄 표시
- 정상 블록은 기존대로

참고 코드: slack_subscriber.py, executor.py line 401~647
```

### TASK-3: 가시성 축 — 승인 (Visibility-Approve)
```
선행: TASK-1/2 완료 후
1. gate.pending 이벤트 추가
2. _run_approval에서 pending 시 이벤트 발행
3. SlackSubscriber에 gate.pending 구독 + 포맷
4. approve/reject API 엔드포인트 확인 + 없으면 추가

검증:
- approval Gate 진입 → Slack에 검토 요청
- approve API → 다음 블록
- reject API → loop로 재작성

참고 Design: brick-ceo-approval-gate
참고 코드: concrete.py line 377~, executor.py
```

---

## 실행 순서도

```
TASK-5 (수동, 10분) — croniter + hooks
    ↓
┌── TASK-1 (산출물) ──┐
├── TASK-2 (컨텍스트) ─┤  ← 병렬, 3축 독립
└── TASK-4 (가시성)  ──┘
    ↓
TASK-3 (승인 알림) — TASK-1/2 의존
    ↓
🎯 E2E: TASK 입력 → 블록 → 문서 산출 → Gate → Slack → 완료
```

---

## P1/P2 (이후)

| 우선순위 | TASK | 내용 |
|---------|------|------|
| P1 | 6 | 반려 사유 전달 (reject_reason) |
| P1 | 7 | Slack 알림 정리 (verbose/기본) |
| P1 | 8 | 프로젝트 레이어 (프로젝트별 에이전트 구성) |
| P2 | 9 | 3축 플러그인 레지스트리 (오픈소스) |
| P2 | 10 | SkyOffice 멀티플레이어 UI |
| P2 | 11 | 멀티유저 + RBAC |
| P2 | 12 | 어댑터 헬스체크 |

---

## Decision Log

| # | 결정 | 대안 | 이유 |
|---|------|------|------|
| 1 | artifact Gate 타입 추가 | complete_block 직접 체크 | Gate on/off 원칙 일관성 |
| 2 | --bare + --system-prompt-file | --add-dir 추가 | YAGNI, 단순함 우선 |
| 3 | TASK-5 선행 → 1/2/4 병렬 → 3 | 전부 순차 | 3축 독립 확인됨 |
| 4 | 프로젝트 = brick 안에 | brick 밖에 | Smith님 결정: 브릭=엔진 |
