# 🧱 브릭 엔진 3축 전체 QA

> 작성: COO 모찌 | 기준일: 2026-04-05
> 코드 기준: pytest 469 passed / vitest 676 passed / 엔진 5,848줄
> 투입: CTO-1, CTO-2, PM, Codex, 모찌(COO)

---

## 6단계 사고 기록

### 재해석
"3축(엔진/팀/링크) 기반 전체 기능 점검"
= 프리셋 로드 → 워크플로우 시작 → 블록 실행 → Gate 검증 → 링크로 다음 블록 → 완료까지 **실제로 끊김 없이 돌아가는가?**
+ 새 Gate/Adapter/Link를 추가할 때 **최소 수정으로 되는가?**
+ DB/API/파일 등 **기반 인프라가 제대로 물려있는가?**

### 영향 범위
```
엔진 ↔ 팀 연결 끊김 → adapter가 블록 못 시작 → Building 자체 불가
엔진 ↔ 링크 연결 끊김 → 블록 완료 후 다음 블록 안 잡힘 → 첫 블록만 되고 멈춤
팀 ↔ 링크 연결 끊김 → 팀 전환(handoff) 실패 → PM 할 걸 CTO가 함
Gate 미동작 → 품질 검증 없이 통과 → 잘못된 산출물로 다음 단계 진행
Checkpoint 미동작 → 서버 재시작 시 진행상태 유실
```

### 현재 상태
```
✅ 단위 테스트 통과: StateMachine, Gate, Adapter, EventBus 각각
✅ API 개별 호출 테스트
✅ 모델 직렬화/역직렬화

❌ 프리셋 → 전체 워크플로우 E2E 미검증
❌ 블록A Gate통과 → 링크 → 블록B 시작 체인 미검증
❌ adapter 실패 → 재시도 → 복구 흐름 미검증
❌ parallel 동시 실행 → checkpoint 경합 미검증
❌ 프리셋 10개 전부 PresetValidator 통과 여부 미확인
```

### 과거 결정 충돌
- hook Link "필요 없다" 결정 (04-05) → 코드에 아직 있음 (state_machine + API) → **QA에 포함 (있는 코드는 검증)**
- "같은 프로젝트 하나로 묶는다" → QA 문서 1개로 전팀 공유 ✅
- "E2E 워크스루 필수" → QA에도 E2E 시나리오 포함 ✅

### 구조 결정
**계층형: P0(Critical Path) → P1(축별 상세) → P2(장애/보안) → P3(자유도)**
이유: 팀원 5명이 우선순위 잡기 쉽다. P0 실패하면 P1 의미 없음.

---

## 목차

1. [P0: Critical Path — Building이 돌아가는가](#p0-critical-path)
2. [P1-엔진: 상태 전이 + Gate + Checkpoint](#p1-엔진)
3. [P1-팀: 어댑터별 실행/상태/취소](#p1-팀)
4. [P1-링크: 조건분기 + 스케줄링](#p1-링크)
5. [P2: 장애/경합/보안](#p2-장애경합보안)
6. [P3: 자유도 — 새 타입 추가](#p3-자유도)
7. [P4: DB/API/인프라](#p4-dbapi인프라)
8. [P5: 프리셋(Building) 전수검증](#p5-프리셋)
9. [팀 배정표](#팀-배정표)
10. [판정 기준](#판정-기준)

---

## P0: Critical Path

> **이게 실패하면 브릭이 안 돌아간다. 최우선.**
> "실패하면 뭐가 깨지는가" = Building 자체가 불가능.

### P0-A: 최소 Building 전체 실행 (hotfix 프리셋)

| ID | 시나리오 | 실패 시 영향 | 검증 방법 |
|---|---|---|---|
| P0-A01 | `POST /engine/start` preset=hotfix → 워크플로우 생성 | Building 시작 불가 | API 호출 → workflow_id 반환 확인 |
| P0-A02 | Do 블록 QUEUED → RUNNING 전이 | 블록 실행 불가 | blocks_state에서 status 확인 |
| P0-A03 | adapter(claude_agent_teams)가 블록을 실제 시작 | 에이전트가 TASK 못 받음 | execution_id 생성 + tmux/MCP 전달 확인 |
| P0-A04 | `POST /engine/complete-block` → Gate 실행 | 블록 완료 판정 불가 | gate_result.passed 확인 |
| P0-A05 | Gate 통과 → workflow.completed | Building 완료 불가 | status="completed" 확인 |
| P0-A06 | Checkpoint 저장 → 파일 존재 | 서버 재시작 시 유실 | .bkit/runtime/workflows/{id}/state.json 존재 |

### P0-B: 체인 Building 실행 (feature-standard)

| ID | 시나리오 | 실패 시 영향 | 검증 방법 |
|---|---|---|---|
| P0-B01 | Plan 블록 완료 → **sequential 링크** → Design 블록 QUEUED | 블록 간 연결 끊김 = Plan만 되고 멈춤 | Design 블록 status=queued 확인 |
| P0-B02 | Design 완료 → Do 시작 → **팀 전환** (PM→CTO) | 팀 핸드오프 실패 = 잘못된 팀이 실행 | Do 블록 adapter=claude_agent_teams + session=sdk-cto 확인 |
| P0-B03 | Do 완료 → Check 블록 → **metric gate** (match_rate≥90) | 품질 검증 없이 통과 | gate_result.type="metric", 임계값 평가 확인 |
| P0-B04 | Check gate 실패 → **loop 링크** → Do 재실행 | 재작업 불가 = 실패한 채 완료 | Do 블록 status=queued, loop 카운터 증가 확인 |
| P0-B05 | Check gate 통과 → Act 실행 → **workflow.completed** | 5블록 전체 체인 완주 | status="completed" + 모든 블록 COMPLETED |
| P0-B06 | EventBus → SlackSubscriber 알림 | Smith님이 진행상황 모름 | Slack 메시지 발행 확인 (또는 이벤트 구독 호출) |

### P0-C: 승인 Building 실행 (feature-approval)

| ID | 시나리오 | 실패 시 영향 | 검증 방법 |
|---|---|---|---|
| P0-C01 | Design 완료 → COO Review → **agent gate** 실행 | 자동 검토 불가 | agent_runner.run() 호출 + verdict 확인 |
| P0-C02 | CEO Approval → **WAITING_APPROVAL** 상태 전환 | 승인 대기 불가 = 영원히 멈춤 | block.status=waiting_approval 확인 |
| P0-C03 | 승인 API 호출 → Gate 통과 → Do 시작 | 승인 후 진행 불가 | approval_action=approve → gate_passed → Do queued |
| P0-C04 | 반려 → **reject_reason** → Design 루프백 | 반려 피드백 전달 불가 | context["reject_reason"] 존재 + Design 재시작 |
| P0-C05 | 재시도 시 에이전트가 **반려 사유** 인지 | 같은 실수 반복 | 프롬프트에 "⚠️ 반려됨" + 사유 포함 |

---

## P1-엔진

> **개별 엔진 컴포넌트의 모든 분기.** P0이 통과한 전제에서 세부 동작.

### P1-E1: StateMachine 상태 전이 (state_machine.py — 376줄)

실패 시 영향: **상태가 잘못 전이되면 블록이 멈추거나 잘못된 순서로 실행됨**

| ID | 전이 | 조건 | 기대 결과 |
|---|---|---|---|
| E-SM-001 | workflow.start | PENDING 상태 | RUNNING + 첫 블록 QUEUED + StartBlockCommand |
| E-SM-002 | workflow.start | 이미 RUNNING | 무시 (변경 없음) |
| E-SM-003 | workflow.suspend | RUNNING | SUSPENDED |
| E-SM-004 | workflow.resume | SUSPENDED | RUNNING |
| E-SM-005 | workflow.fail | RUNNING | FAILED |
| E-SM-006 | block.started | QUEUED | RUNNING + started_at 기록 |
| E-SM-007 | block.started | 이미 RUNNING | 무시 |
| E-SM-008 | block.completed | RUNNING | GATE_CHECKING + CheckGateCommand |
| E-SM-009 | block.completed | WAITING_APPROVAL | GATE_CHECKING (승인 후 진행) |
| E-SM-010 | block.gate_passed | GATE_CHECKING | COMPLETED + 다음 블록 탐색 |
| E-SM-011 | block.gate_passed | 마지막 블록 | workflow.completed |
| E-SM-012 | block.gate_failed + on_fail=retry | retry_count < max | retry_count++, RUNNING, StartBlockCommand |
| E-SM-013 | block.gate_failed + on_fail=retry | retry_count >= max | FAILED |
| E-SM-014 | block.gate_failed + on_fail=skip | — | COMPLETED + 다음 블록 |
| E-SM-015 | block.gate_failed + on_fail=route | — | on_fail 타겟 블록 QUEUED |
| E-SM-016 | block.gate_failed + on_fail=route | 타겟 없음 | FAILED |
| E-SM-017 | block.gate_failed + on_fail=fail | — | FAILED + workflow FAILED |
| E-SM-018 | block.adapter_failed | retry_count < 3 | QUEUED + RetryAdapterCommand (5s/15s/45s) |
| E-SM-019 | block.adapter_failed | retry_count >= 3 | FAILED + NotifyCommand(adapter_exhausted) |
| E-SM-020 | block.failed | — | FAILED + workflow FAILED |
| E-SM-021 | deepcopy 격리 | transition() 호출 | 원본 instance 불변 |

### P1-E2: Executor 오케스트레이션 (executor.py — 886줄)

실패 시 영향: **워크플로우 생명주기 관리 실패 → Building 중간에 멈춤**

| ID | 기능 | 실패 시 영향 | 검증 기준 |
|---|---|---|---|
| E-EX-001 | start() 프리셋 검증 | 잘못된 프리셋으로 실행됨 | PresetValidator real_errors → ValueError |
| E-EX-002 | start() 프리셋 경고 | 경고가 에러로 처리됨 | warnings는 이벤트 발행만, 실행 차단 안 함 |
| E-EX-003 | start() 프로젝트 컨텍스트 | 에이전트가 프로젝트 맥락 없이 실행 | context["project"]에 project.yaml 병합 |
| E-EX-004 | complete_block() QUEUED→자동 started | QUEUED에서 complete 호출 시 에러 | 자동으로 block.started 전이 후 진행 |
| E-EX-005 | complete_block() Gate 메트릭 반영 | 조건 평가에 Gate 결과 안 쓰임 | gate_result.metrics → context 업데이트 |
| E-EX-006 | complete_block() reject_reason 주입 | 재시도 시 에이전트가 사유 모름 | context["reject_reason"] + reject_count |
| E-EX-007 | complete_block() approve 시 reason 제거 | 이전 반려 사유가 남아서 혼란 | context에서 reject_* 제거 |
| E-EX-008 | _execute_command() adapter 없음 | 에러 로그 없이 멈춤 | adapter_failed 이벤트 발행 |
| E-EX-009 | team_config → 새 adapter 인스턴스 | 프리셋 config가 무시됨 | adapter.__class__(team_config) 호출 |
| E-EX-010 | team_config role → metadata 기록 | Slack 알림에 역할 안 보임 | block.metadata["role"] 설정 |
| E-EX-011 | handoff 이벤트 | 팀 전환 추적 불가 | block.handoff 이벤트 발행 (prev_team ≠ current_team) |
| E-EX-012 | _enrich_event_data | 이벤트에 프로젝트 정보 없음 | project/feature/workflow_id 자동 주입 |
| E-EX-013 | _load_project_yaml path traversal | 보안 취약 | ".." → None |
| E-EX-014 | _monitor_block() 정상 완료 | 폴링 안 돌아서 완료 감지 못 함 | 10초 폴링 → completed → complete_block() |
| E-EX-015 | _monitor_block() 5분 stale 경고 | 멈춘 에이전트 감지 못 함 | block.stale 이벤트 |
| E-EX-016 | _monitor_block() 10분 hard timeout | 영원히 RUNNING | adapter_failed → 재시도 |
| E-EX-017 | _monitor_block() 실패 감지 | adapter 실패 무시됨 | adapter_failed 이벤트 (stderr, exit_code 포함) |
| E-EX-018 | _monitor_compete() 승자 결정 | compete 블록 영원히 대기 | 첫 completed → winner, 나머지 cancel |
| E-EX-019 | _monitor_compete() 전부 실패 | 무한 대기 | block.failed |
| E-EX-020 | _checkpoint_lock | parallel 블록 state 꼬임 | Lock 내에서만 checkpoint 접근 |
| E-EX-021 | cron_scheduler 시작 | cron 링크 미발동 | start() 끝에 cron_scheduler.start() 호출 |

### P1-E3: Gate 8종 (gates/ — concrete.py 493줄)

실패 시 영향: **검증이 제대로 안 되면 잘못된 산출물로 다음 단계 진행**

| ID | Gate | 핵심 검증 | 실패 시 |
|---|---|---|---|
| E-GT-001 | command: 정상 실행 | returncode 0 = passed | 명령이 안 돌아감 |
| E-GT-002 | command: Shell Injection | shlex.quote() + allowlist | 악성 명령 실행 |
| E-GT-003 | command: allowlist 거부 | ALLOWED_COMMANDS에 없는 명령 | rm -rf 실행 가능 |
| E-GT-004 | command: BLOCKED_ARGS | "--force", "sudo" 등 | 위험 인자 통과 |
| E-GT-005 | command: 타임아웃 | proc.kill() + failed | 무한 대기 |
| E-GT-006 | http: 2xx/4xx 판정 | 2xx=pass, 나머지=fail | 에러 응답을 통과로 판정 |
| E-GT-007 | http: context 템플릿 | url에 {변수} 치환 | URL 잘못 구성 |
| E-GT-008 | http: 응답 파싱 | match_rate/score 자동 추출 | 메트릭 누락 |
| E-GT-009 | prompt: LLM 평가 | decision yes/no + confidence | 판정 오류 |
| E-GT-010 | prompt: 저신뢰 에스컬레이션 | confidence < threshold | 자동 통과 |
| E-GT-011 | prompt: JSON 파싱 재시도 | 2회 재시도 | 첫 실패에 포기 |
| E-GT-012 | agent: 에이전트 평가 | verdict pass/fail | 에이전트 결과 무시 |
| E-GT-013 | agent: Bash 제외 | tools에 Bash 없음 | Gate 에이전트가 코드 수정 |
| E-GT-014 | review: approve/reject/pending | action별 분기 | 승인이 반려로 처리 |
| E-GT-015 | review: vote 과반수 | 과반수 approve = passed | 소수 의견으로 통과 |
| E-GT-016 | review: timeout | on_fail별 분기 | 타임아웃 무시 |
| E-GT-017 | metric: 임계값 비교 | actual >= threshold | 미달인데 통과 |
| E-GT-018 | metric: 변수 없음/비숫자 | → failed | 에러로 크래시 |
| E-GT-019 | approval: 대기 상태 | gate.pending 이벤트 | 알림 안 감 |
| E-GT-020 | approval: 승인/반려 | 적절한 GateResult | 동작 안 함 |
| E-GT-021 | approval: 타임아웃 분기 | auto_approve/reject/escalate | 영원히 대기 |
| E-GT-022 | artifact: 파일 존재 | 전부 존재 → passed | 파일 없는데 통과 |
| E-GT-023 | artifact: path traversal | ".." / 절대경로 → 차단 | 보안 취약 |
| E-GT-024 | GateExecutor: sequential | 첫 실패에서 중단 | 전부 실행 |
| E-GT-025 | GateExecutor: parallel | 동시 실행 + 실패 수집 | 순차 실행 |
| E-GT-026 | GateExecutor: vote | 과반수 판정 | 전원일치 요구 |
| E-GT-027 | register_gate() | 커스텀 등록 후 실행 | 등록 불가 |
| E-GT-028 | 미등록 타입 | ValueError | 크래시 또는 무시 |

### P1-E4: Checkpoint + EventBus + ConditionEvaluator + PresetValidator + CronScheduler

| ID | 컴포넌트 | 핵심 검증 | 실패 시 |
|---|---|---|---|
| E-CP-001 | Checkpoint save/load | 왕복 동일성 | 상태 유실 |
| E-CP-002 | Checkpoint 원자적 쓰기 | tmp→rename | 부분 기록 → 파일 깨짐 |
| E-CP-003 | Checkpoint list_active | COMPLETED/FAILED 제외 | 종료된 워크플로우 폴링 |
| E-CP-004 | Checkpoint events | JSONL 추가 → 전체 복원 | 이벤트 이력 유실 |
| E-EB-001 | EventBus subscribe/publish | 타입별 핸들러 호출 | 이벤트 누락 |
| E-EB-002 | EventBus 와일드카드 | "*" → 모든 이벤트 | 전체 모니터링 불가 |
| E-EB-003 | EventBus unsubscribe | 해제 후 미수신 | 메모리 누수/중복 |
| E-CE-001 | 문자열 조건 | "match_rate >= 90" | loop 조건 오판 |
| E-CE-002 | dict 조건 | {"match_rate": {"gte": 90}} | dict 형식 미지원 |
| E-CE-003 | _below/_above 접미사 | match_rate_below: 90 | 프리셋 조건 미동작 |
| E-CE-004 | 빈 조건 → True | None/{}/""  | 빈 조건에서 차단 |
| E-CE-005 | 변수 없음 → False | context에 없음 | 에러 크래시 |
| E-CE-006 | 6개 연산자 | >=, <=, >, <, ==, != | 비교 오류 |
| E-PV-001 | 블록 ID 중복 | 에러 | 동일 ID 블록 실행 충돌 |
| E-PV-002 | what 필드 누락 | 에러 | 빈 TASK로 에이전트 실행 |
| E-PV-003 | 링크 from/to 미존재 | 에러 | 없는 블록으로 연결 |
| E-PV-004 | 미등록 링크/게이트/어댑터 | 에러 또는 경고 | 런타임에 터짐 |
| E-PV-005 | cron 링크 schedule 누락 | 에러 | cron 파싱 에러 |
| E-PV-006 | 레지스트리 연동 | 실제 등록 기준 검증 | 상수만 보고 검증 |
| E-VD-001 | INV-1~8 불변식 | 전부 검증 | DAG 사이클/누락 |
| E-CS-001 | cron register/start | 표현식 → 시각 실행 | cron 미발동 |
| E-CS-002 | cron max_runs | 초과 → 종료 | 무한 반복 |
| E-CS-003 | cron unregister | 워크플로우 종료 → job 제거 | 좀비 job |

### P1-E5: PresetLoader

| ID | 기능 | 실패 시 | 검증 기준 |
|---|---|---|---|
| E-PL-001 | YAML 파싱 → 모델 객체 | 프리셋 로드 불가 | blocks/links/teams 전부 객체 |
| E-PL-002 | extends 상속 | 상위 프리셋 무시 | 부모+자식 블록/팀 병합 |
| E-PL-003 | {project}/{feature} 치환 | artifacts 경로 깨짐 | 실제 값으로 치환 |
| E-PL-004 | spec wrapper | kind+spec 프리셋 미지원 | spec 내부 파싱 |
| E-PL-005 | gate.handlers 파싱 | gate 미동작 | GateHandler 전체 필드 매핑 |
| E-PL-006 | ApprovalConfig 파싱 | 승인 설정 누락 | 9개 필드 전부 매핑 |
| E-PL-007 | teams 문자열 형식 | "claude_local" 단순 지정 미지원 | TeamDefinition(adapter=값) |

### P1-E6: SlackSubscriber (slack_subscriber.py — 155줄)

| ID | 기능 | 실패 시 | 검증 기준 |
|---|---|---|---|
| E-SS-001 | basic vs verbose 레벨 | 알림 과다/부족 | basic: 4종, verbose: 7종 |
| E-SS-002 | 민감정보 마스킹 | 토큰 노출 | SLACK_BOT_TOKEN, Bearer, sk-* → *** |
| E-SS-003 | BRICK_ENV=test 차단 | 테스트 중 실제 Slack 전송 | 토큰 비워서 스킵 |
| E-SS-004 | 비동기 실패 무시 | Slack 에러로 엔진 멈춤 | fire-and-forget |
| E-SS-005 | adapter_failed 포맷 | 에러 정보 부족 | exit_code + stderr 10줄 + role |
| E-SS-006 | approval_pending 포맷 | 승인 방법 안 보임 | 산출물 + 승인 API 경로 |
| E-SS-007 | project/feature 표시 | 어떤 프로젝트인지 모름 | [project] prefix + feature suffix |

---

## P1-팀

> **각 어댑터가 제대로 블록을 실행하고 상태를 반환하는가.**

### P1-T1: ClaudeLocalAdapter ⭐ (claude_local.py — 320줄)

실패 시 영향: **메인 실행 어댑터. 이거 안 되면 Building 전체 불가.**

| ID | 기능 | 실패 시 | 검증 기준 |
|---|---|---|---|
| T-CL-001 | subprocess 생성 | 에이전트 실행 불가 | claude --print - --output-format stream-json --verbose |
| T-CL-002 | stdin 프롬프트 | TASK 내용 미전달 | "TASK: {what}\nCONTEXT: {json}" |
| T-CL-003 | reject_reason 프롬프트 주입 | 재시도 시 같은 실수 | "⚠️ 반려됨" + 사유 + 시도 횟수 |
| T-CL-004 | session-id 파싱 | 세션 이어가기 불가 | stdout stream-json에서 session_id 추출 |
| T-CL-005 | session-id 복원 | 다음 블록에서 맥락 유실 | context["session_ids"] → --continue --session-id |
| T-CL-006 | nesting guard 제거 | 무한 재귀 | CLAUDECODE 등 4개 env 제거 |
| T-CL-007 | BRICK_* env 주입 | 에이전트가 실행 컨텍스트 모름 | BRICK_EXECUTION_ID, BRICK_BLOCK_ID |
| T-CL-008 | config.env 병합 | AGENT_TEAMS env 미전달 | 프리셋 YAML env → string만 병합 |
| T-CL-009 | --agent 프로젝트 분기 | 프로젝트별 프롬프트 무시 | project agents/ 파일 있으면 --system-prompt-file |
| T-CL-010 | role path traversal | 보안 | ".." → 로그 경고, 무시 |
| T-CL-011 | --dangerously-skip-permissions | 권한 프롬프트 뜸 | config → 인자 추가 |
| T-CL-012 | 타임아웃 SIGTERM→SIGKILL | 프로세스 좀비 | timeout → terminate → grace → kill |
| T-CL-013 | stdout 32KB cap | 메모리 폭발 | _MAX_OUTPUT_BYTES 초과 truncate |
| T-CL-014 | check_status() 상태파일 | 완료 감지 불가 | task-state-{eid}.json 읽기 |
| T-CL-015 | check_status() 10분 staleness | 영원히 running | → failed |
| T-CL-016 | cancel() | 프로세스 안 죽음 | terminate + grace + kill |
| T-CL-017 | _notify_complete() | Gate 자동 발동 안 됨 | executor.complete_block() 호출 |
| T-CL-018 | command not found | 에러 로그 없이 멈춤 | FileNotFoundError → 상태 failed |

### P1-T2: ClaudeAgentTeamsAdapter (claude_agent_teams.py — 280줄)

| ID | 기능 | 실패 시 | 검증 기준 |
|---|---|---|---|
| T-AT-001 | MCP 전달 | 에이전트에 TASK 안 감 | MCPBridge → peer 탐색 → 메시지 |
| T-AT-002 | MCP→tmux fallback | MCP 실패 시 멈춤 | fallback_to_tmux=True → send-keys |
| T-AT-003 | staleness 10분 | 영원히 running | 상태파일 미생성 → failed |
| T-AT-004 | cancel() | 프로세스 안 죽음 | tmux C-c |
| T-AT-005 | TeamManagement 구현 | 대시보드 팀 관리 불가 | list_members/skills/mcp/model 전부 |
| T-AT-006 | suspend/terminate/resume | 생명주기 관리 불가 | teammate-registry.json 상태 변경 |

### P1-T3: 나머지 어댑터

| ID | 어댑터 | 핵심 검증 | 실패 시 |
|---|---|---|---|
| T-CC-001 | ClaudeCode: MCP→tmux | 단독 에이전트 실행 불가 | tmux 세션 자동 생성 + 실행 |
| T-CC-002 | ClaudeCode: staleness | 영원히 running | 10분 → failed |
| T-HU-001 | Human: waiting_human 상태 | 수동 작업 추적 불가 | 상태파일 + assignee + timeout_at |
| T-HU-002 | Human: 완료 파일 감지 | 사람이 완료했는데 안 넘어감 | completions/{eid} → completed |
| T-HU-003 | Human: 타임아웃 | 영원히 대기 | timeout_at 초과 → failed |
| T-WH-001 | Webhook: HTTP POST | 외부 서비스 호출 불가 | url + payload + auth 헤더 |
| T-WH-002 | Webhook: auth bearer/api_key | 인증 실패 | Authorization / X-API-Key |
| T-WH-003 | Webhook: callback 수신 | 완료 감지 불가 | receive_callback() → 상태 업데이트 |
| T-WH-004 | Webhook: retry_on_status | 재시도 안 됨 | 502/503/504 → RuntimeError |
| T-WH-005 | Webhook: 3단계 status | 완료 누락 | 상태파일 → status_url → staleness |
| T-CX-001 | Codex: stub 확인 | 호출 시 크래시 | NotImplementedError 4개 |
| T-MC-001 | MCP: peer 탐색 3단계 | 에이전트 못 찾음 | 캐시 → peer-map.json → broker API |
| T-MC-002 | MCP: ACK 대기/거부/타임아웃 | 전달 확인 불가 | (True/False, eid/error) |

### P1-T4: AdapterRegistry

| ID | 기능 | 실패 시 | 검증 기준 |
|---|---|---|---|
| T-AR-001 | register/get | adapter 조회 불가 | 이름 → 인스턴스 |
| T-AR-002 | dict 호환 | Executor에서 못 씀 | [], in, items() |
| T-AR-003 | registered_adapter_types() | PresetValidator에 빈 set | 등록된 이름 set |
| T-AR-004 | 미등록 get | silent fail | KeyError |

---

## P1-링크

> **블록 간 연결이 올바르게 동작하는가.**

실패 시 영향: **블록 완료 후 다음 블록이 안 잡히거나 잘못된 블록으로 감**

| ID | 링크 | 핵심 검증 | 실패 시 |
|---|---|---|---|
| L-SQ-001 | sequential | 무조건 다음 블록 | 체인 끊김 |
| L-LP-001 | loop 조건 충족 | condition True + count < max → 재실행 | 재작업 불가 |
| L-LP-002 | loop 조건 미충족 | → 빈 목록 (통과) | 무한 루프 |
| L-LP-003 | loop 횟수 초과 | max_retries 도달 → 종료 | 무한 루프 |
| L-LP-004 | loop 카운터 | _loop_{from}_{to} context 저장 | 카운트 안 됨 |
| L-BR-001 | branch 조건 충족 | → 대상 블록 | 분기 안 됨 |
| L-BR-002 | branch 조건 미충족 | → 빈 목록 | 잘못된 경로 |
| L-PL-001 | parallel | 동시 블록 반환 | 순차 실행 |
| L-CM-001 | compete + teams | CompeteStartCommand | 경쟁 미실행 |
| L-CM-002 | compete - teams | sequential 폴백 | 에러 |
| L-CR-001 | cron 등록 | CronScheduler.register() | cron 미발동 |
| L-CR-002 | cron 즉시 반환 | next_ids 비어있음 (나중 실행) | 즉시 실행 |
| L-HK-001 | hook 대기 | 빈 next_ids (외부 트리거) | 즉시 실행 |
| L-NF-001 | notify on_start | link.started 이벤트 | 알림 누락 |
| L-NF-002 | notify on_complete | link.completed 이벤트 | 알림 누락 |
| L-RG-001 | register_link() | 커스텀 핸들러 등록 | 확장 불가 |
| L-RG-002 | 미등록 타입 | None → continue (무시) | 크래시 |

---

## P2: 장애/경합/보안

> **운영 중 터지는 문제. P0/P1이 통과해도 여기서 터질 수 있음.**

### P2-A: 장애 복구

| ID | 시나리오 | 실패 시 | 검증 기준 |
|---|---|---|---|
| P2-A01 | 서버 재시작 → checkpoint 복구 | 진행상태 유실 | load() → resume() → 이어서 실행 |
| P2-A02 | adapter 프로세스 비정상 종료 | 블록 영원히 running | adapter_failed → 재시도 |
| P2-A03 | adapter 재시도 3회 소진 | silent fail | FAILED + adapter_exhausted 알림 |
| P2-A04 | Gate 실행 중 예외 | 크래시 | 적절한 에러 처리 |
| P2-A05 | Slack 전송 실패 | 엔진 멈춤 | fire-and-forget (영향 없음) |
| P2-A06 | EventBus 핸들러 예외 | 다른 핸들러 미실행 | 격리 (하나 실패해도 나머지 실행) |

### P2-B: 경합 (Concurrency)

| ID | 시나리오 | 실패 시 | 검증 기준 |
|---|---|---|---|
| P2-B01 | parallel 블록 동시 complete | checkpoint 꼬임 | _checkpoint_lock |
| P2-B02 | compete 블록 동시 complete | 승자 2명 | 첫 완료만 winner |
| P2-B03 | cron 트리거 + 수동 complete 동시 | 상태 불일치 | Lock 보호 |

### P2-C: 보안

| ID | 항목 | 공격 벡터 | 방어 | 검증 기준 |
|---|---|---|---|---|
| P2-C01 | Command gate Injection | context에 `; rm -rf /` | shlex.quote() | 이스케이프 확인 |
| P2-C02 | Command allowlist 우회 | python -c "os.system(...)" | allowlist는 1단계만 | **경고: 인자 내 코드 실행 가능** |
| P2-C03 | Artifact path traversal | "../../etc/passwd" | ".." 검사 | 즉시 차단 |
| P2-C04 | Project YAML traversal | project_name="../../secrets" | resolve() 화이트리스트 | 안전 기본 경로 |
| P2-C05 | Role path traversal | role="../../etc" | ".." 검사 | 로그 경고 |
| P2-C06 | 세션 토큰 해싱 | DB 유출 시 세션 탈취 | SHA-256 | 평문 미저장 |
| P2-C07 | API 인증 | 미인증 엔진 조작 | authenticate_request | health 제외 전부 인증 |
| P2-C08 | RBAC 적용 | viewer가 워크플로우 시작 | require_role_dep | viewer=조회, operator=실행 |
| P2-C09 | Slack 토큰 마스킹 | 로그에 토큰 노출 | _mask_sensitive() | xox*, sk-* 마스킹 |
| P2-C10 | Nesting guard | claude가 claude를 무한 호출 | env 4개 제거 | 재귀 방지 |
| P2-C11 | stdout 32KB cap | 대량 출력 메모리 폭발 | _MAX_OUTPUT_BYTES | truncate |
| P2-C12 | Webhook auth_value | API 키 로그 노출 | **(확인 필요)** | 로그에 미출력 여부 |

---

## P3: 자유도

> **새 타입 추가 시 코드 수정 포인트가 최소인가?**
> 실패 시 영향: 확장할 때마다 대규모 수정 → 유지보수 비용 증가

| ID | 추가 대상 | 예상 수정 | 실제 확인 | 기대 |
|---|---|---|---|---|
| F-01 | 새 Gate (예: jira-check) | ① register_gate() **또는** entry_points | — | ≤2곳 |
| F-02 | 새 Link (예: approval-chain) | ① register_link() | — | 1곳 |
| F-03 | 새 Adapter (예: cursor) | ① TeamAdapter 구현 ② AdapterRegistry.register() ③ DEFAULT_ADAPTERS | — | ≤3곳 |
| F-04 | 새 프리셋(Building) | ① YAML 파일만 | — | 0곳 (코드 수정 없음) |
| F-05 | PluginManager entry_points | pip install → 자동 발견 | — | 코드 0곳 |
| F-06 | Gate 레지스트리 → Validator 자동 | init_engine()에서 ge.registered_gate_types() | — | 자동 연동 |
| F-07 | Link 레지스트리 → Validator 자동 | sm.registered_link_types() | — | 자동 연동 |

---

## P4: DB/API/인프라

### P4-A: DB 스키마 (SQLite)

| ID | 테이블 | 핵심 검증 | 실패 시 |
|---|---|---|---|
| D-DB-001 | workspaces | 기본 id=1 생성 | 첫 사용자 등록 불가 |
| D-DB-002 | users | username UNIQUE, password scrypt | 중복 가입, 비밀번호 평문 |
| D-DB-003 | user_sessions | token_hash SHA-256, 7일 만료 | 세션 탈취, 영구 세션 |
| D-DB-004 | api_keys | owner_type(user/agent), scopes JSON | API 키 권한 관리 |
| D-DB-005 | agents | name+workspace UNIQUE, heartbeat | 에이전트 중복 등록 |
| D-DB-006 | notifications | recipient FK, read_at 인덱스 | 알림 조회 성능 |
| D-DB-007 | FK ON DELETE CASCADE | user 삭제 → sessions/notif 삭제 | 고아 레코드 |
| D-DB-008 | WAL 모드 | 동시 읽기/쓰기 | 락 충돌 |

### P4-B: 인증/인가

| ID | 기능 | 검증 기준 | 실패 시 |
|---|---|---|---|
| D-AU-001 | 세션 생성 | token_hex(32) → SHA-256 → DB | 예측 가능한 토큰 |
| D-AU-002 | 세션 검증 | token → hash → DB JOIN users | 인증 우회 |
| D-AU-003 | 세션 만료 | expires_at 체크 | 만료 세션으로 접근 |
| D-AU-004 | RBAC | viewer/operator/admin | 권한 상승 |
| D-AU-005 | 엔진 API 권한 | start=operator, status=viewer | 무단 실행 |

### P4-C: API 엔드포인트

| ID | 엔드포인트 | 메서드 | 정상 | 에러 케이스 |
|---|---|---|---|---|
| D-API-001 | /engine/start | POST | 워크플로우 생성 | 404(preset없음) 422(검증실패) 400(값오류) |
| D-API-002 | /engine/complete-block | POST | Gate 실행 + 다음 블록 | 404(wf/block없음) |
| D-API-003 | /engine/status/{id} | GET | 상태+이벤트 반환 | 404 |
| D-API-004 | /engine/suspend/{id} | POST | SUSPENDED | 404 |
| D-API-005 | /engine/resume/{id} | POST | RUNNING | 404 |
| D-API-006 | /engine/cancel/{id} | POST | FAILED | 404 |
| D-API-007 | /engine/health | GET | ok + 통계 | (인증 불필요) |
| D-API-008 | /engine/retry-adapter | POST | 재시도 | 409(QUEUED 아님) |
| D-API-009 | /engine/hook/{wf}/{link} | POST | hook 발동 | 404(link없음) 409(from미완료) |
| D-API-010 | /engine/human/tasks | GET | 사용자별 필터 | admin=전체, 일반=자기것만 |

### P4-D: 파일 스토리지

| ID | 경로 | 용도 | 검증 |
|---|---|---|---|
| D-FS-001 | .bkit/runtime/workflows/{id}/state.json | 워크플로우 상태 | 생성/읽기/원자적쓰기 |
| D-FS-002 | .bkit/runtime/workflows/{id}/events.jsonl | 이벤트 이력 | 추가기록/전체복원 |
| D-FS-003 | .bkit/runtime/task-state-{eid}.json | 어댑터 상태 | 어댑터별 읽기/쓰기 |
| D-FS-004 | .bkit/runtime/session-ids.json | 세션 전파 | team_key별 저장/로드 |
| D-FS-005 | .bkit/runtime/human-completions/{eid} | 수동 완료 | 파일 존재 → completed |

---

## P5: 프리셋(Building) 전수검증

> **10개 프리셋 전부 로드 → PresetValidator 통과 → 구조 정합성 확인**

| ID | 프리셋 | 블록 | 링크 | 어댑터 | 특수 요소 | 검증 |
|---|---|---|---|---|---|---|
| P-01 | hotfix | 1 (Do) | 0 | claude_agent_teams | 최소 | Validator 통과 |
| P-02 | research | 2 | 1 seq | claude_agent_teams | | 통과 |
| P-03 | feature-light | ? | ? | ? | | 로드 + 통과 |
| P-04 | feature-standard | 5 | 4seq+1loop | claude_agent_teams | metric≥90 | loop 조건 + 팀 전환 |
| P-05 | feature-full | 6 | 5seq+1loop | claude_agent_teams | metric≥95+security | 보안 블록 |
| P-06 | feature-approval | 7 | 6seq+2loop | mixed | agent+approval gate | 승인 흐름 |
| P-07 | feature-codex-qa | 5 | 3seq+1loop+1branch | claude_local+human+webhook | AGENT_TEAMS env | 혼합 어댑터 |
| P-08 | do-codex-qa | 3 | 2seq+1loop+1branch | claude_local+human | continueSession | 세션 이어가기 |
| P-09 | security-qa | 4 | 3seq | claude_local | placeholder cmd | placeholder 동작 |
| P-10 | design-dev-qa-approve | 5 | 4seq+2loop+2branch | claude_local+human | AGENT_TEAMS env | 복합 분기 |

**공통 검증:**

| ID | 항목 | 검증 기준 |
|---|---|---|
| P-COM-001 | PresetValidator 통과 | real_errors = 0 |
| P-COM-002 | 모든 블록에 팀 할당 | teams에 빠진 블록 없음 |
| P-COM-003 | 링크 from/to 유효 | 존재하는 블록 ID |
| P-COM-004 | {feature} 치환 | artifacts 경로 정상 변환 |
| P-COM-005 | Validator INV-1~8 통과 | DAG 사이클 없음 |

---

## 팀 배정표

> Smith님 확인 후 확정

| 우선순위 | 영역 | 건수 | 추천 담당 | 이유 |
|---|---|---|---|---|
| **P0** | Critical Path | 17건 | **CTO-1 + PM** | 엔진 E2E = 전체 이해 필요 |
| **P1-엔진** | SM+Executor+Gate+기타 | 95건 | **CTO-1** | 엔진 코어 구현자 |
| **P1-팀** | 어댑터 전종 | 40건 | **CTO-2 + Codex** | 어댑터 버그 수정 담당 |
| **P1-링크** | 7종 링크 | 17건 | **CTO-1** | state_machine 내 구현 |
| **P2** | 장애/경합/보안 | 18건 | **Codex** | 보안 분석 + 코드 리뷰 |
| **P3** | 자유도 | 7건 | **Codex** | 구조 분석 |
| **P4** | DB/API/인프라 | 23건 | **CTO-2** | auth/bridge 구현 담당 |
| **P5** | 프리셋 전수 | 15건 | **PM** | YAML 설계자 |
| | **합계** | **232건** | | |

---

## 판정 기준

| 등급 | 조건 | 액션 |
|---|---|---|
| ✅ PASS | 기대대로 동작 | 완료 처리 |
| ⚠️ WARN | 동작하지만 엣지케이스 미처리 | P2로 이관 |
| ❌ FAIL | 기대와 다르게 동작 | 즉시 수정 TASK 생성 |
| 🔍 SKIP | 외부 의존(Codex stub 등) 미구현 | 브릭 전환 후 처리 |

**판정 순서:**
1. P0 전부 PASS → P1 진행
2. P0에 FAIL 있으면 → P1 중단, P0 수정 먼저
3. P1 완료 → P2/P3/P4/P5 병렬
4. 전체 결과 → 모찌가 집계 → Smith님 보고

---

> **이 문서는 5명이 공유하는 단일 점검 기준서.**
> 각 팀원은 자기 담당 ID의 PASS/FAIL을 기록.
> P0 → P1 → P2~P5 순서. P0 실패 시 나머지 의미 없음.
> 최종 집계는 모찌가 한다.