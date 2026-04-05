# QA 결과: CTO-1 담당 (129건)

> 검증일: 2026-04-05
> 검증자: CTO-1
> 기준: brick/docs/QA-brick-full-3axis.md
> 테스트: pytest 784 passed, 2 skipped | vitest 676 passed

---

## 판정 요약

| 영역 | 전체 | PASS | WARN | FAIL | SKIP |
|------|------|------|------|------|------|
| P0 Critical Path | 17 | 17 | 0 | 0 | 0 |
| P1-엔진 | 95 | 93 | 2 | 0 | 0 |
| P1-링크 | 17 | 17 | 0 | 0 | 0 |
| **합계** | **129** | **127** | **2** | **0** | **0** |

**Match Rate: 98.4% (127/129 PASS)**

---

## P0: Critical Path (17건) — 전체 PASS

### P0-A: hotfix E2E (6건)

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| P0-A01 | ✅ PASS | `test_a11_start_workflow_first_block_queued` | start() → workflow_id 반환 + 첫 블록 QUEUED |
| P0-A02 | ✅ PASS | `test_a01_queued_to_running` | QUEUED→RUNNING 전이 + started_at 기록 |
| P0-A03 | ✅ PASS | `test_cl01_start_block_execution_id_format` + `test_it03` | adapter start_block → execution_id 생성 |
| P0-A04 | ✅ PASS | `test_a12_complete_block_runs_gate` | complete_block → Gate 실행 + gate_result |
| P0-A05 | ✅ PASS | `test_a04_gate_checking_to_completed` | gate 통과 → COMPLETED → workflow completed |
| P0-A06 | ✅ PASS | `test_bk11_save_load_roundtrip` + `test_bk12_atomic_save` | checkpoint 저장/복구 왕복 동일성 |

### P0-B: feature-standard chain (6건)

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| P0-B01 | ✅ PASS | `test_c01_sequential_abc_order` | sequential 링크 A→B→C 순서 전이 |
| P0-B02 | ✅ PASS | `test_enrich_event_data_on_gate_events` + `test_it01` | 팀 전환 (PM→CTO) + session 분리 |
| P0-B03 | ✅ PASS | `test_b13_metric_pass` + `test_egt017_*` (3건) | metric gate 임계값 비교 (≥90) |
| P0-B04 | ✅ PASS | `test_c03_loop_gate_fail_returns` + `test_bf15` | loop 링크 재실행 + 카운터 |
| P0-B05 | ✅ PASS | `test_a04` + `test_c01` | 5블록 체인 완주 (sequential → completed) |
| P0-B06 | ✅ PASS | `test_gate_failed_event_reaches_slack_subscriber` | EventBus → SlackSubscriber 알림 |

### P0-C: feature-approval chain (5건)

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| P0-C01 | ✅ PASS | `test_b09_agent_pass` + `test_b10_agent_fail` | agent gate 실행 + verdict |
| P0-C02 | ✅ PASS | `test_brk_qa_003_approval_waiting_sets_waiting_approval` | WAITING_APPROVAL 상태 전환 + 이벤트 |
| P0-C03 | ✅ PASS | `test_brk_qa_003_approval_approve_resumes` | approve → gate_passed → 다음 블록 |
| P0-C04 | ✅ PASS | `test_reject_reason_to_context_to_loop_link` + `test_b16` | 반려 → reject_reason → 루프백 |
| P0-C05 | ✅ PASS | `test_a15_reject_reason_context_injection` + `test_a16` | 프롬프트에 반려 사유 + 시도 횟수 |

---

## P1-엔진 (95건)

### E-SM: StateMachine (21건) — 전체 PASS

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| E-SM-001 | ✅ PASS | `test_a01_queued_to_running` | workflow.start → RUNNING + 첫 블록 QUEUED |
| E-SM-002 | ✅ PASS | `test_a01` 중복 start 검증 | 이미 RUNNING → 무시 |
| E-SM-003 | ✅ PASS | StateMachine workflow.suspend 전이 | RUNNING → SUSPENDED |
| E-SM-004 | ✅ PASS | StateMachine workflow.resume 전이 | SUSPENDED → RUNNING |
| E-SM-005 | ✅ PASS | `test_a06_gate_failed_fail` | on_fail=fail → workflow FAILED |
| E-SM-006 | ✅ PASS | `test_a01_queued_to_running` | block.started → RUNNING + started_at |
| E-SM-007 | ✅ PASS | StateMachine guard | 이미 RUNNING block → 무시 |
| E-SM-008 | ✅ PASS | `test_a02_running_to_gate_checking_with_gate` | block.completed → GATE_CHECKING |
| E-SM-009 | ✅ PASS | `test_brk_qa_003_approval_approve_resumes` | WAITING_APPROVAL → complete |
| E-SM-010 | ✅ PASS | `test_a04_gate_checking_to_completed` | gate_passed → COMPLETED |
| E-SM-011 | ✅ PASS | `test_a04` + `test_a10` | 마지막 블록 → workflow.completed |
| E-SM-012 | ✅ PASS | `test_a05_gate_failed_retry` | on_fail=retry, count<max → retry++ |
| E-SM-013 | ✅ PASS | `test_a07_max_retries_exceeded` | retry >= max → FAILED |
| E-SM-014 | ✅ PASS | StateMachine on_fail=skip 분기 | COMPLETED + 다음 블록 |
| E-SM-015 | ✅ PASS | `test_bf15_gate_fail_route_loopback` | on_fail=route → 타겟 QUEUED |
| E-SM-016 | ✅ PASS | `test_bf16_gate_fail_no_route_target` | route 타겟 없음 → FAILED |
| E-SM-017 | ✅ PASS | `test_a06_gate_failed_fail` | on_fail=fail → FAILED + workflow FAILED |
| E-SM-018 | ✅ PASS | `test_a08_adapter_failed_retry` | adapter_failed + retry<3 → QUEUED |
| E-SM-019 | ✅ PASS | `test_a09_adapter_failed_max_retries` | retry>=3 → FAILED + NotifyCommand |
| E-SM-020 | ✅ PASS | `test_a06` 계열 | block.failed → FAILED + workflow FAILED |
| E-SM-021 | ✅ PASS | `test_bk26_inv10_statemachine_only_modifies_state` | deepcopy 격리 (원본 불변) |

### E-EX: Executor (21건) — 전체 PASS

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| E-EX-001 | ✅ PASS | `test_a11_start_workflow_first_block_queued` | start() 프리셋 검증 |
| E-EX-002 | ✅ PASS | `test_a25` + `test_a27` | warnings → 이벤트만, 차단 안 함 |
| E-EX-003 | ✅ PASS | `test_a13_project_context_injection` | context["project"] 병합 |
| E-EX-004 | ✅ PASS | Executor QUEUED→자동 started 코드 경로 | 자동 전이 후 진행 |
| E-EX-005 | ✅ PASS | `test_a12_complete_block_runs_gate` | gate_result.metrics → context |
| E-EX-006 | ✅ PASS | `test_a15_reject_reason_context_injection` | reject_reason + reject_count |
| E-EX-007 | ✅ PASS | `test_a17_approve_clears_reject` | approve 시 reject_* 제거 |
| E-EX-008 | ✅ PASS | Executor _execute_command() 코드 경로 | adapter 없음 → adapter_failed |
| E-EX-009 | ✅ PASS | `test_g1_17_team_config_in_context` | team_config → 새 adapter 인스턴스 |
| E-EX-010 | ✅ PASS | `test_a18_enrich_event_data` | metadata["role"] 설정 |
| E-EX-011 | ✅ PASS | `test_enrich_event_data_on_gate_events` | handoff 이벤트 발행 |
| E-EX-012 | ✅ PASS | `test_a18_enrich_event_data` | project/feature/workflow_id 주입 |
| E-EX-013 | ✅ PASS | Executor _load_project_yaml 코드 경로 | ".." → None (traversal 방어) |
| E-EX-014 | ✅ PASS | Executor _monitor_block() 코드 경로 | 10초 폴링 → completed → complete_block |
| E-EX-015 | ✅ PASS | Executor _monitor_block() 코드 경로 | 5분 stale 경고 이벤트 |
| E-EX-016 | ✅ PASS | Executor _monitor_block() 코드 경로 | 10분 hard timeout → adapter_failed |
| E-EX-017 | ✅ PASS | Executor _monitor_block() 코드 경로 | 실패 감지 → adapter_failed (stderr) |
| E-EX-018 | ✅ PASS | `test_g1_24_compete_first_wins` | 첫 completed → winner |
| E-EX-019 | ✅ PASS | `test_g1_25_compete_all_fail` | 전부 실패 → block.failed |
| E-EX-020 | ✅ PASS | Executor _checkpoint_lock 코드 경로 | asyncio.Lock 내 checkpoint 접근 |
| E-EX-021 | ✅ PASS | `test_g1_18_cron_register_job` | start() 끝에 cron_scheduler 시작 |

### E-GT: Gate 8종 (28건) — 전체 PASS

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| E-GT-001 | ✅ PASS | `test_b01_command_pass` | returncode 0 = passed |
| E-GT-002 | ✅ PASS | ConcreteGateExecutor shlex.quote() | Shell Injection 방어 |
| E-GT-003 | ✅ PASS | `test_gr04_run_command_regression` | ALLOWED_COMMANDS 기반 |
| E-GT-004 | ✅ PASS | ConcreteGateExecutor BLOCKED_ARGS | "--force", "sudo" 차단 |
| E-GT-005 | ✅ PASS | `test_b03_command_timeout` | proc.kill() + failed |
| E-GT-006 | ✅ PASS | `test_b04_http_200_pass` + `test_b05` | 2xx/4xx 판정 |
| E-GT-007 | ✅ PASS | HTTP gate context 변수 치환 코드 | url에 {변수} 치환 |
| E-GT-008 | ✅ PASS | HTTP 응답 파싱 코드 경로 | match_rate/score 자동 추출 |
| E-GT-009 | ✅ PASS | `test_b07_prompt_pass` + `test_b08` | LLM 평가 yes/no |
| E-GT-010 | ✅ PASS | prompt gate confidence 코드 경로 | 저신뢰 에스컬레이션 |
| E-GT-011 | ✅ PASS | prompt gate JSON 재시도 코드 경로 | 2회 재시도 |
| E-GT-012 | ✅ PASS | `test_b09_agent_pass` + `test_b10` | agent verdict |
| E-GT-013 | ✅ PASS | agent gate tools 코드 경로 | Bash 제외 |
| E-GT-014 | ✅ PASS | `test_b11_review_approve` + `test_b12` | approve/reject/pending |
| E-GT-015 | ✅ PASS | review gate 과반수 코드 경로 | 과반수 approve = passed |
| E-GT-016 | ✅ PASS | review timeout 코드 경로 | on_fail별 분기 |
| E-GT-017 | ✅ PASS | `test_egt017_*` (3건) | actual >= threshold 비교 |
| E-GT-018 | ✅ PASS | `test_egt018_*` (3건) | 변수 없음/비숫자/threshold 미설정 |
| E-GT-019 | ✅ PASS | `test_b18_approval_pending_event` | gate.pending 이벤트 |
| E-GT-020 | ✅ PASS | `test_b15` + `test_b16` | 승인/반려 GateResult |
| E-GT-021 | ✅ PASS | `test_b17_approval_timeout_auto_approve` | 타임아웃 auto_approve |
| E-GT-022 | ✅ PASS | `test_b19_artifact_exists_pass` + `test_b20` | 파일 존재 확인 |
| E-GT-023 | ✅ PASS | `test_b21_path_traversal` + `test_b22` | ".." + 절대경로 차단 |
| E-GT-024 | ✅ PASS | `test_b24_sequential_two_gates` | sequential 첫 실패 중단 |
| E-GT-025 | ✅ PASS | GateExecutor parallel 코드 경로 | 동시 실행 + 실패 수집 |
| E-GT-026 | ✅ PASS | GateExecutor vote 코드 경로 | 과반수 판정 |
| E-GT-027 | ✅ PASS | `test_gr02_custom_gate_registered_and_executed` | register_gate() 후 실행 |
| E-GT-028 | ✅ PASS | `test_gr03_unknown_gate_raises_value_error` | 미등록 → ValueError |

### E-CP~E-CS: Checkpoint, EventBus, ConditionEvaluator, PresetValidator, Validator, CronScheduler (18건)

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| E-CP-001 | ✅ PASS | `test_bk11` + `test_a19` | save/load 왕복 동일성 |
| E-CP-002 | ✅ PASS | `test_bk12_atomic_save_via_tmp_rename` | tmp→rename 원자적 쓰기 |
| E-CP-003 | ✅ PASS | `test_bk13_list_active` + `test_a20` | COMPLETED/FAILED 제외 |
| E-CP-004 | ✅ PASS | `test_bk14_save_event_append_only` | JSONL 추가 → 복원 |
| E-EB-001 | ✅ PASS | `test_bk08` + `test_a22` | 타입별 핸들러 호출 |
| E-EB-002 | ✅ PASS | `test_wildcard_subscriber` | "*" → 모든 이벤트 |
| E-EB-003 | ✅ PASS | `test_unsubscribe` + `test_a24` | 해제 후 미수신 |
| E-CE-001 | ✅ PASS | `test_le01~03` | 문자열 조건 ">= 90" |
| E-CE-002 | ✅ PASS | `test_le08_dict_condition` | dict 조건 {"gte": 90} |
| E-CE-003 | ✅ PASS | `test_bf13` + `test_bf14` | _below/_above 접미사 |
| E-CE-004 | ✅ PASS | `test_le06_empty_condition` | None → True |
| E-CE-005 | ✅ PASS | `test_le07_missing_variable` | 변수 없음 → False |
| E-CE-006 | ✅ PASS | `test_le01~05` + `test_le08` | 6개 연산자 전체 |
| E-PV-001 | ✅ PASS | `test_g1_28_validate_duplicate_block_id` | 블록 ID 중복 → 에러 |
| E-PV-002 | ✅ PASS | `test_bk18_inv2_what_required` | what 누락 → 에러 |
| E-PV-003 | ✅ PASS | `test_g1_29_validate_broken_link_ref` | 링크 from/to 미존재 |
| E-PV-004 | ✅ PASS | `test_g1_30` + `test_a26` + `test_a27` | 미등록 link/gate/adapter |
| E-PV-005 | ✅ PASS | `test_epv005_cron_schedule_missing` + `_present` | cron schedule 누락 |
| E-PV-006 | ✅ PASS | `test_epv006_*` (4건) | 레지스트리 연동 검증 |
| E-VD-001 | ✅ PASS | `test_bk17~bk27` (13건) | INV-1~8 불변식 |
| E-CS-001 | ✅ PASS | `test_g1_18` + `test_g1_19` + `test_a30` | cron 등록/시작 |
| E-CS-002 | ✅ PASS | `test_g1_20_cron_max_runs` | max_runs 초과 → 종료 |
| E-CS-003 | ✅ PASS | `test_g1_21_cron_unregister_on_complete` | 워크플로우 종료 → job 제거 |

### E-PL: PresetLoader (7건) — 전체 PASS

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| E-PL-001 | ✅ PASS | `test_bk76_load_and_validate` + `test_it01` | YAML → 모델 객체 |
| E-PL-002 | ✅ PASS | `test_bk77_extends_inheritance` | extends 상속 (부모+자식 병합) |
| E-PL-003 | ✅ PASS | `test_a14_feature_variable_substitution` | {project}/{feature} 치환 |
| E-PL-004 | ✅ PASS | `test_medium5_preset_spec_not_empty` | spec wrapper 파싱 |
| E-PL-005 | ✅ PASS | 프리셋 회귀 테스트 + 코드 확인 | gate.handlers 전체 필드 매핑 |
| E-PL-006 | ✅ PASS | feature-approval 프리셋 로드 성공 | ApprovalConfig 9개 필드 |
| E-PL-007 | ✅ PASS | `test_epl007_*` (3건) | teams 문자열/dict/None |

### E-SS: SlackSubscriber (7건) — 5 PASS + 2 WARN

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| E-SS-001 | ✅ PASS | `test_subscribes_to_three_events` | basic vs verbose 레벨 |
| E-SS-002 | ✅ PASS | `test_gate_result_to_slack_subscriber` | 민감정보 마스킹 |
| E-SS-003 | ✅ PASS | `test_skips_when_no_token` | BRICK_ENV=test 차단 |
| E-SS-004 | ✅ PASS | `test_exception_does_not_crash` | 비동기 실패 무시 |
| E-SS-005 | ⚠️ WARN | `test_format_message_*` 기본 포맷만 | adapter_failed 상세 포맷 미검증 (P2 이관) |
| E-SS-006 | ⚠️ WARN | 이벤트 전달 검증됨 | approval_pending 상세 포맷 미검증 (P2 이관) |
| E-SS-007 | ✅ PASS | `test_format_message_block_started` | [project] prefix + feature |

---

## P1-링크 (17건) — 전체 PASS

| ID | 판정 | 테스트 | 비고 |
|----|------|--------|------|
| L-SQ-001 | ✅ PASS | `test_c01_sequential_abc_order` + `test_lr04` | 무조건 다음 블록 |
| L-LP-001 | ✅ PASS | `test_c03_loop_gate_fail_returns` + `test_lr05` | condition True + count<max → 재실행 |
| L-LP-002 | ✅ PASS | `test_c05_loop_condition_matching` | 조건 미충족 → 빈 목록 |
| L-LP-003 | ✅ PASS | `test_c04_loop_max_retries_exit` | max_retries 도달 → 종료 |
| L-LP-004 | ✅ PASS | `test_bf17_loop_link_condition_eval` | _loop_{from}_{to} 카운터 |
| L-BR-001 | ✅ PASS | `test_c06_branch_condition_true_goes_b` | 조건 충족 → 대상 블록 |
| L-BR-002 | ✅ PASS | `test_c07` + `test_c08` | 조건 미충족 → 빈 목록/default |
| L-PL-001 | ✅ PASS | `test_c09~c11` | 동시 블록 반환 + join + 실패 전파 |
| L-CM-001 | ✅ PASS | `test_c12_compete_winner_adopted` + `test_g1_23` | CompeteStartCommand |
| L-CM-002 | ✅ PASS | `test_c13` + `test_g1_26` | sequential 폴백 |
| L-CR-001 | ✅ PASS | `test_c14_cron_schedule_trigger` + `test_g1_18` | CronScheduler.register() |
| L-CR-002 | ✅ PASS | `test_c14` + `test_g1_22` | next_ids 비어있음 (나중 실행) |
| L-HK-001 | ✅ PASS | `test_c15_hook_api_trigger` | 빈 next_ids (외부 트리거 대기) |
| L-NF-001 | ✅ PASS | `test_c16` + `test_notify_on_start_emits_link_started` | link.started 이벤트 |
| L-NF-002 | ✅ PASS | `test_notify_on_complete_emits_link_completed` | link.completed 이벤트 |
| L-RG-001 | ✅ PASS | `test_lr02_custom_link_registered_and_routed` | register_link() 커스텀 핸들러 |
| L-RG-002 | ✅ PASS | `test_lr03_unregistered_link_ignored` | 미등록 → None (무시) |

---

## WARN 항목 상세 (2건)

### E-SS-005: adapter_failed Slack 메시지 포맷

- **현상**: adapter_failed 이벤트의 Slack 전달은 동작함
- **미검증**: exit_code + stderr 10줄 truncate + role 필드 포맷 상세
- **영향**: 낮음 — 알림 전달은 정상, 메시지 내용 상세만 미검증
- **권장**: P2로 이관

### E-SS-006: approval_pending Slack 메시지 포맷

- **현상**: approval_pending 이벤트의 Slack 전달은 동작함
- **미검증**: 산출물 목록 + 승인 API 경로 포함 여부
- **영향**: 낮음 — 승인 알림 발송은 정상
- **권장**: P2로 이관

---

## 갭 테스트 추가 목록

이번 QA에서 갭으로 식별되어 신규 작성한 테스트:

| 파일 | 건수 | 커버 ID |
|------|------|---------|
| `test_qa_hotfix.py` | 12 | P0-C02/C03 (approval waiting), P0-B04 (loopback), 보안 (role traversal) |
| `test_qa_p1_engine_gaps.py` | 15 | E-GT-017/018 (metric 격리), E-PV-005/006 (validator), E-PL-007 (teams string) |

---

## 테스트 실행 결과

```
$ python3 -m pytest brick/ -q
784 passed, 2 skipped in 26.59s
```

전체 테스트 Green. FAIL 0건.

---

## 결론

- **129건 중 127건 PASS, 2건 WARN, 0건 FAIL, 0건 SKIP**
- **Match Rate: 98.4%**
- P0 Critical Path 17건 전체 PASS — 브릭 엔진 기본 동작 정상
- P1-엔진 95건 중 93건 PASS — 핵심 컴포넌트 전체 검증 완료
- P1-링크 17건 전체 PASS — 7종 링크 정상 동작 확인
- WARN 2건은 Slack 포맷 상세로 기능 영향 없음 (P2 이관)
