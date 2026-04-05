# QA: 브릭 엔진 전체 기능 디테일 검증 — 7단계 아키텍처 사고

> 2026-04-04 모찌(COO). 전 팀 투입 (PM + CTO-1 + CTO-2 + Codex).
> 엔진 19,489줄, Gate 8종, Link 7종, 어댑터 10종, 프리셋 10개 전수 검사.

---

## Step 1: 재해석

"유닛 618개 통과 ≠ 실제 동작. 브릭 엔진의 *모든 기능*을 하나도 빠짐없이 검증. Gate 8종 각각, Link 7종 각각, 어댑터 10종 각각, 인증, 프리셋 — 전부."

## Step 2: 기존 자산

- 유닛 테스트 618 passed
- P0 TDD 48건 + P1 TDD 31건 = 79건
- 불변식 P0 13건 + P1 10건 = 23건

## Step 3: 축 분해 — QA 5축

### QA-A: 엔진 코어
state_machine, executor, checkpoint, event_bus, cron_scheduler, preset_validator, condition_evaluator

### QA-B: Gate 8종
command, http, prompt, agent, review, metric, approval, artifact

### QA-C: Link 7종
sequential, loop, branch, parallel, compete, cron, hook

### QA-D: 어댑터 10종 + 인증
claude_local, claude_agent_teams, claude_code, codex, human, webhook, mcp_bridge, human_management, management + Google Auth + RBAC + 세션

### QA-E: 통합 (프리셋 10개 + E2E 시나리오)
각 프리셋으로 실제 워크플로우 실행

---

## QA-A: 엔진 코어 테스트 케이스

### A-1: StateMachine 상태 전이
| # | 테스트 | 검증 |
|---|--------|------|
| A-01 | queued → block.started → running | 상태 전이 정확 |
| A-02 | running → block.completed → gate_checking | Gate 있으면 |
| A-03 | running → block.completed → completed | Gate 없으면 |
| A-04 | gate_checking → gate_passed → completed | Gate 통과 |
| A-05 | gate_checking → gate_failed → running (retry) | on_fail=retry |
| A-06 | gate_checking → gate_failed → failed | on_fail=fail |
| A-07 | max_retries 초과 → failed | 재시도 한도 |
| A-08 | adapter_failed → running (retry) | 어댑터 실패 재시도 |
| A-09 | adapter_failed → failed (max) | 어댑터 재시도 한도 |
| A-10 | completed → 다음 블록 queued (Link 발동) | Link 자동 연결 |

### A-2: Executor
| # | 테스트 | 검증 |
|---|--------|------|
| A-11 | start_workflow → 첫 블록 queued | 워크플로우 시작 |
| A-12 | complete_block → Gate 실행 | 블록 완료 → Gate |
| A-13 | project context 주입 | project.yaml → context |
| A-14 | feature 변수 치환 | {feature} → 실제값 |
| A-15 | reject_reason context 주입 | Gate reject → context |
| A-16 | reject_count 증가 | 연속 reject |
| A-17 | approve 시 reject 정리 | reject_reason 제거 |
| A-18 | _enrich_event_data | 이벤트에 project/feature 포함 |

### A-3: Checkpoint
| # | 테스트 | 검증 |
|---|--------|------|
| A-19 | save → load 일치 | 상태 직렬화/역직렬화 |
| A-20 | 워크플로우 목록 조회 | list() 동작 |
| A-21 | 동시 save 경합 없음 | asyncio.Lock |

### A-4: EventBus
| # | 테스트 | 검증 |
|---|--------|------|
| A-22 | publish → subscribe 수신 | 기본 동작 |
| A-23 | 여러 구독자 동시 수신 | 멀티캐스트 |
| A-24 | 구독 해제 | unsubscribe |

### A-5: PresetValidator
| # | 테스트 | 검증 |
|---|--------|------|
| A-25 | 유효한 프리셋 → 에러 0 | 정상 YAML |
| A-26 | 없는 Gate 타입 → 에러 | 검증 실패 |
| A-27 | 없는 어댑터 → 에러 | 검증 실패 |
| A-28 | project 필드 검증 | 디렉토리 경고 |

### A-6: CronScheduler
| # | 테스트 | 검증 |
|---|--------|------|
| A-29 | cron 표현식 파싱 | croniter 동작 |
| A-30 | 스케줄 등록/해제 | add/remove |

---

## QA-B: Gate 8종 테스트 케이스

| # | Gate | 테스트 | 검증 |
|---|------|--------|------|
| B-01 | command | 정상 명령 → pass | exit 0 = pass |
| B-02 | command | 실패 명령 → fail | exit 1 = fail |
| B-03 | command | 타임아웃 | 시간 초과 처리 |
| B-04 | http | 200 → pass | HTTP 상태 확인 |
| B-05 | http | 500 → fail | 서버 에러 |
| B-06 | http | 타임아웃 → fail | 연결 실패 |
| B-07 | prompt | LLM 평가 pass | 프롬프트 기반 |
| B-08 | prompt | LLM 평가 fail | 기준 미달 |
| B-09 | agent | 에이전트 평가 pass | 에이전트 실행 |
| B-10 | agent | 에이전트 평가 fail | 에이전트 거부 |
| B-11 | review | 코드 리뷰 pass | 리뷰 통과 |
| B-12 | review | 코드 리뷰 fail | 이슈 발견 |
| B-13 | metric | 수치 기준 pass | match_rate >= 90% |
| B-14 | metric | 수치 기준 fail | match_rate < 90% |
| B-15 | approval | approve → pass | 승인 |
| B-16 | approval | reject → fail + reason | 반려 + 사유 |
| B-17 | approval | timeout → auto_approve | 타임아웃 자동 |
| B-18 | approval | pending → 이벤트 발행 | gate.approval_pending |
| B-19 | artifact | 파일 존재 → pass | os.path.exists |
| B-20 | artifact | 파일 없음 → fail | missing 목록 |
| B-21 | artifact | path traversal → 거부 | ../../../ 차단 |
| B-22 | artifact | 절대경로 → 거부 | /etc/passwd 차단 |
| B-23 | artifact | glob 패턴 → 매칭 | *.md 동작 |
| B-24 | 복합 | 2개 Gate 순차 실행 | evaluation=sequential |

---

## QA-C: Link 7종 테스트 케이스

| # | Link | 테스트 | 검증 |
|---|------|--------|------|
| C-01 | sequential | A→B→C 순차 | 순서 보장 |
| C-02 | sequential | 중간 블록 실패 → 체인 중단 | 실패 전파 |
| C-03 | loop | Gate fail → 되돌아감 | 재시도 루프 |
| C-04 | loop | max_retries 후 탈출 | 무한 루프 방지 |
| C-05 | loop | 조건 매칭 | condition 평가 |
| C-06 | branch | 조건 true → B로 | 분기 동작 |
| C-07 | branch | 조건 false → C로 | 반대 분기 |
| C-08 | branch | 조건 미매칭 → default | 기본 경로 |
| C-09 | parallel | A,B 동시 시작 | 병렬 실행 |
| C-10 | parallel | 둘 다 완료 → 다음 | join |
| C-11 | parallel | 하나 실패 → 전체 실패? | 실패 전파 정책 |
| C-12 | compete | A,B 경쟁 → 먼저 완료 채택 | 승자 결정 |
| C-13 | compete | 패자 취소 | cancel 동작 |
| C-14 | cron | 스케줄 트리거 → 블록 시작 | croniter 동작 |
| C-15 | hook | API 호출 → 블록 시작 | HTTP 트리거 |
| C-16 | notify | Link 실행 시 알림 | notify 필드 |

---

## QA-D: 어댑터 + 인증 테스트 케이스

### 어댑터
| # | 어댑터 | 테스트 | 검증 |
|---|--------|--------|------|
| D-01 | claude_local | --agent 주입 | args 배열 |
| D-02 | claude_local | --bare 미포함 | INV-C1 |
| D-03 | claude_local | stderr 캡처 | 실패 시 stderr 저장 |
| D-04 | claude_local | exit_code 반환 | AdapterStatus.exit_code |
| D-05 | claude_local | project 오버라이드 | --system-prompt-file |
| D-06 | claude_local | reject_reason 배너 | 프롬프트 주입 |
| D-07 | claude_local | Agent Teams 환경변수 | CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS |
| D-08 | human | 파일 마커 완료 | completions 디렉토리 |
| D-09 | human | assignee 설정 | email 매핑 |
| D-10 | human | 타임아웃 | 24시간 |
| D-11 | webhook | HTTP POST | url + headers |
| D-12 | webhook | 인증 (bearer/api_key) | auth_type |
| D-13 | webhook | 콜백 | callback_url |
| D-14 | webhook | 재시도 (502/503/504) | retry_on_status |
| D-15 | codex | codex review 호출 | CLI 실행 |

### 인증
| # | 기능 | 테스트 | 검증 |
|---|------|--------|------|
| D-16 | Google Sign-In | 유효 토큰 → email | verifyGoogleIdToken |
| D-17 | Google Sign-In | 위조 토큰 → 401 | 검증 실패 |
| D-18 | RBAC | viewer → operator API → 403 | 권한 부족 |
| D-19 | RBAC | admin → 모든 API | 전체 접근 |
| D-20 | 세션 | DB-backed 생성/검증 | SHA-256 해시 |
| D-21 | 세션 | 7일 만료 → 401 | 세션 만료 |
| D-22 | 첫 사용자 | admin + is_approved=1 | 시드 패턴 |

---

## QA-E: 프리셋 통합 테스트

| # | 프리셋 | 테스트 | 검증 |
|---|--------|--------|------|
| E-01 | t-pdca-l0 | 파싱 + 실행 | 최소 워크플로우 |
| E-02 | t-pdca-l1 | 파싱 + 실행 | 경량 |
| E-03 | t-pdca-l2 | 파싱 + 실행 | 표준 |
| E-04 | t-pdca-l2-approval | approval Gate 동작 | 승인 흐름 |
| E-05 | t-pdca-l2-codex-qa | codex QA 동작 | Codex 연동 |
| E-06 | t-pdca-l3 | 파싱 + 실행 | 아키텍처 |
| E-07 | do-codex-qa | Design 있을 때 | Do부터 |
| E-08 | hotfix | 긴급 수정 | 최소 체인 |
| E-09 | research | 리서치 전용 | 단순 |
| E-10 | design-dev-qa-approve | 전체 PDCA | E2E |

---

## 팀 배정

| 팀 | 담당 QA 축 | 테스트 수 |
|----|-----------|----------|
| **COO(모찌)** | QA-E (통합 E2E) + 전체 조율 | 10건 |
| **PM** | QA-B (Gate 8종) + QA-A 일부 | 24건 + 12건 |
| **CTO-1** | QA-C (Link 7종) + QA-A 일부 | 16건 + 18건 |
| **Codex** | QA-D (어댑터 + 인증) | 22건 |
| **CTO-2** | 누락 4건 수정 (진행 중) | — |

*총 102건*

---

## 보안 테스트 (전 축 공통)

| # | 테스트 | 검증 |
|---|--------|------|
| S-01 | project.yaml path traversal | ../../../etc 거부 |
| S-02 | artifact path traversal | ../../../etc 거부 |
| S-03 | role path traversal | 에이전트 경로 탈출 |
| S-04 | stderr 토큰 마스킹 | xoxb/sk- 마스킹 |
| S-05 | Google 토큰 aud 검증 | 다른 앱 토큰 거부 |
| S-06 | 세션 토큰 원문 미저장 | SHA-256만 |
| S-07 | RBAC 우회 불가 | 직접 API 호출 차단 |
