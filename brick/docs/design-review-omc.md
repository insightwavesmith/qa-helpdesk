# Design Review — 브릭 엔진 v2.1 (OMC 대체)

> 작성: OMC 서브에이전트 | 2026-04-05
> 기준: Plan (26건) / Design (TDD 65건) / 아키텍처 문서 / 실제 코드 전수 확인
> 코드 기준선: executor.py 871줄, engine_bridge.py 560줄, 638 passed

---

## 리뷰어 역할 3명

1. **아키텍처 리뷰어** — 26건 개선항목 반영 여부, 모듈 분리/인터페이스 정의 충분성
2. **TDD 리뷰어** — Design TDD 65건과 26건 1:1 매핑, 빠진 테스트
3. **E2E 리뷰어** — TASK 입력 → 보고 E2E 워크스루, 불변식, 실패 시나리오

---

## 1. 아키텍처 리뷰어

### 1.1 26건 반영 현황 (코드 직접 확인)

| Phase | # | 항목 | 코드 상태 | 판정 |
|-------|---|------|----------|------|
| 0 | 14 | StateMachine `_extra_link_commands` race condition | `state_machine.py:36` — 인스턴스 변수 여전히 존재. `_find_next_blocks()`가 `self._extra_link_commands = extra_commands`로 여전히 씀 (line 307) | ❌ 미반영 |
| 0 | 15 | BlockInstance 직렬화 input+gate 누락 | `workflow.py` — `to_dict()`에 input/gate 없음. `from_dict()`도 input/gate 복원 안 함 | ❌ 미반영 |
| 0 | 18 | command gate 보안 (인터프리터 인자 차단) | `command_allowlist.py:60` — `INTERPRETER_BLOCKED_ARGS = {"-c", "-e", "-r", "--eval"}` 존재. 그러나 `-m` 미포함 → `python -m pytest` 통과 (Design에서 `-m` 차단 명시) | ⚠️ 부분 |
| 0 | 21 | codex ALLOWED_COMMANDS 추가 | `command_allowlist.py` 확인 — `codex` 없음. 기존 셋: `{npm, npx, node, python, pytest, ...}` | ❌ 미반영 |
| 1 | 1 | executor.py → 6모듈 분리 | executor.py 여전히 871줄. PresetLoader, BlockMonitor, CompeteManager, CommandDispatcher 전부 같은 파일에 공존 | ❌ 미반영 |
| 1 | 2 | engine_bridge.py → Bootstrap+Routes+Container 3분할 | engine_bridge.py 여전히 560줄. 글로벌 변수 6개 유지 | ❌ 미반영 |
| 1 | 3 | 전역 변수 → DI (app.state.engine) | `engine_bridge.py:71-76` — `executor, preset_loader, checkpoint_store, state_machine, engine_event_bus, skyoffice_bridge` 전역 유지 | ❌ 미반영 |
| 1 | 4 | CommandDispatcher | `command_dispatcher.py` 파일 없음. `_execute_command()` 여전히 executor.py에 inline (~180줄) | ❌ 미반영 |
| 1 | 16 | private → public API 3개 | `engine_bridge.py` — `executor._monitor_block()` 직접 호출(auto_recover), `executor._execute_command()` 직접 호출(retry-adapter EP-8) | ❌ 미반영 |
| 1 | 17 | claude_local 순환 의존성 → EventBus | `claude_local.py:_notify_complete()` — `from brick.dashboard.routes.engine_bridge import executor` lazy import 여전히 존재 | ❌ 미반영 |
| 1 | 23 | PresetLoader 변수 치환 (재귀 dict walk) | `executor.py:85-87` — `yaml.dump(inner)` → `str.replace()` → `yaml.safe_load()` 패턴 그대로 | ❌ 미반영 |
| 2 | 5 | InputResolver (이전 블록 산출물 → 다음 블록 주입) | `input_resolver.py` 없음. Block.input 필드 존재하나 executor에서 참조 0 | ❌ 미반영 |
| 2 | 6 | ArtifactManager (block.completed 시 수집) | `artifact_manager.py` 없음. `complete_block()`에서 `get_artifacts()` 호출 없음 | ❌ 미반영 |
| 2 | 7 | claude_local `_write_state()` artifacts 키 추가 | `_write_state()`는 dict를 그대로 저장. 완료 경로(`_monitor_process`)의 write에 artifacts 없음. `get_artifacts()`는 state.get("artifacts", []) 읽는데 항상 [] 반환 | ❌ 미반영 |
| 2 | 8 | 에이전트 구조화 프롬프트 | `claude_local.py:73` — 여전히 `f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"` | ❌ 미반영 |
| 2 | 9 | Building 폴더 자동 생성 | `artifact_manager.py` 없음. Building 폴더 생성 로직 없음 | ❌ 미반영 |
| 2 | 10 | BOARD.md 자동 생성 | 없음 | ❌ 미반영 |
| 2 | 11 | TASK.md 자동 생성 | 없음 | ❌ 미반영 |
| 2 | 12 | retry 시 버전 분리 | BlockInstance에 `retry_version` 필드 없음. artifacts 덮어씀 | ❌ 미반영 |
| 2 | 13 | BOARD.md 동시 쓰기 방지 | BOARD.md 미구현이므로 해당 없음 | N/A |
| 2 | 22 | 동일 feature 동시 실행 방지 | `executor.start()`에 중복 체크 없음 | ❌ 미반영 |
| 2 | 26 | Legacy→Building 경로 매핑 레이어 | `path_mapper.py` 없음 | ❌ 미반영 |
| 3 | 19 | 서버 재시작 복구 (public API) | `_auto_recover_workflows()`가 `executor._monitor_block()` 호출 — 비공개 메서드 직접 사용. public API 없음 | ⚠️ 부분 |
| 3 | 20 | cancel 시 adapter.cancel() | `cancel_workflow`(EP-6): `Event(type="workflow.fail")` → status만 FAILED 변경. RUNNING 블록 adapter.cancel() 없음. (compete 내부는 cancel 호출함) | ❌ 미반영 |
| 3 | 24 | preset extends deep merge | `_merge()` — `what` 필드만 override. gate/team/done 변경 불가 | ❌ 미반영 |
| 3 | 25 | EventBus async 핸들러 지원 | `event_bus.py:publish()` — 완전 동기. async 핸들러 코루틴 반환 시 버려짐 | ❌ 미반영 |

**요약**: 26건 중 **0건 완전 반영**, 2건 부분 반영(#18, #19), 24건 미반영.

---

### 1.2 모듈 분리 현황

**기대 모듈 (Design/Architecture 정의)**:

| 신규 파일 | 존재 여부 | 비고 |
|----------|----------|------|
| `brick/engine/preset_loader.py` | ❌ 없음 | executor.py에 내장 |
| `brick/engine/block_monitor.py` | ❌ 없음 | executor.py에 내장 |
| `brick/engine/compete_manager.py` | ❌ 없음 | executor.py에 내장 |
| `brick/engine/input_resolver.py` | ❌ 없음 | 미구현 |
| `brick/engine/command_dispatcher.py` | ❌ 없음 | executor.py에 내장 |
| `brick/engine/artifact_manager.py` | ❌ 없음 | 미구현 |
| `brick/engine/container.py` | ❌ 없음 | 전역 변수 유지 |
| `brick/engine/engine_bootstrap.py` | ❌ 없음 | init_engine()이 engine_bridge.py에 내장 |
| `brick/engine/engine_routes.py` | ❌ 없음 | engine_bridge.py 분리 안 됨 |
| `brick/engine/path_mapper.py` | ❌ 없음 | 미구현 |

**현재 engine/ 디렉토리**: checkpoint.py, condition_evaluator.py, cron_scheduler.py, event_bus.py, executor.py (871줄), learning.py, lifecycle.py, preset_validator.py, slack_subscriber.py, state_machine.py, task_queue.py, user_notifier.py, validator.py — **분리 파일 0개**.

---

### 1.3 인터페이스 정의 충분성 검토

**충분한 부분**:
- Design의 인터페이스 시그니처 정의는 상세하고 명확 (각 클래스별 메서드 + 입출력 + 예외 명시)
- 불변식(INV-01~INV-12) 정의도 구체적이고 검증 가능
- 모듈 의존성 다이어그램 명확

**부족한 부분**:
1. **EngineContainer의 생명주기 미정의**: `create_engine()`, `shutdown_engine()` 시그니처는 있는데 FastAPI lifespan 이벤트와의 연결 방식 불명
2. **CheckpointStore 확장 메서드 누락**: `find_running_workflow(project, feature) -> str | None` (#22 중복 방지용) 인터페이스가 Design에 있지만 checkpoint.py에 구체 구현 방법 없음
3. **ArtifactRecord 영속성**: `checkpoint.save_artifacts()` / `checkpoint.load_artifacts()` 메서드가 Design에 명시되지만 CheckpointStore에 추가 방법이 Design에 없음
4. **EventBus publish_async 호출 정책**: 언제 publish()를 쓰고 언제 publish_async()를 쓸지 명시 없음

---

### 1.4 아키텍처 리뷰어 최종 판정

> **현재 코드는 Design 기준 Phase 0 진입 전 상태. 26건 중 단 2건만 부분 반영. Design 자체는 완성도 높음. 구현이 시작되지 않은 것.**

**Critical (즉시 차단 버그)**:
- `#14` race condition 여전히 존재 — 병렬 워크플로우에서 커맨드 소실 가능
- `#21` codex gate 항상 실패 — 3개 프리셋 사용 불가
- `#17` 순환 의존 — claude_local → engine_bridge 런타임 import

---

## 2. TDD 리뷰어

### 2.1 Design TDD 케이스 vs 26건 1:1 매핑

Design Section 9에서 be_01~be_65 (총 65개) 정의. 각 항목과 26건 매핑:

| 개선항목 | TDD ID | 매핑 상태 |
|---------|--------|----------|
| #14 StateMachine race | be_01, be_02, be_03 | ✅ 3개 정의 |
| #15 직렬화 input+gate | be_04, be_05, be_06 | ✅ 3개 정의 |
| #18 게이트 보안 | be_07, be_08, be_09, be_10 | ✅ 4개 정의 |
| #21 codex allowlist | be_11, be_12 | ✅ 2개 정의 |
| #1 PresetLoader 분리 | be_13, be_14, be_15 | ✅ 3개 정의 |
| #1 BlockMonitor 분리 | be_16, be_17, be_18, be_19 | ✅ 4개 정의 |
| #1 CompeteManager 분리 | be_20, be_21 | ✅ 2개 정의 |
| #4 CommandDispatcher | be_22, be_23 | ✅ 2개 정의 |
| #3 EngineContainer (DI) | be_24, be_25 | ✅ 2개 정의 |
| #16 public API | be_26, be_27, be_28 | ✅ 3개 정의 |
| #17 순환 의존 제거 | be_29, be_30 | ✅ 2개 정의 |
| #6 ArtifactManager | be_31~be_37 | ✅ 7개 정의 |
| #5 InputResolver | be_38~be_41 | ✅ 4개 정의 |
| #7 claude_local artifacts | be_42, be_43 | ✅ 2개 정의 |
| #8 구조화 프롬프트 | be_44, be_45, be_46 | ✅ 3개 정의 |
| #12 retry 버전 분리 | be_47, be_48 | ✅ 2개 정의 |
| #22 중복 실행 방지 | be_49, be_50 | ✅ 2개 정의 |
| #26 경로 매핑 | be_51, be_52 | ✅ 2개 정의 |
| #19 서버 복구 (public API) | be_53, be_54 | ✅ 2개 정의 |
| #20 adapter.cancel() | be_55, be_56 | ✅ 2개 정의 |
| #24 deep merge | be_57, be_58 | ✅ 2개 정의 |
| #25 EventBus async | be_59, be_60 | ✅ 2개 정의 |
| E2E 통합 | be_61~be_65 | ✅ 5개 정의 |

**미매핑 항목 (Design에 TDD 없음)**:
- `#2` engine_bridge.py 3분할 자체 — 테스트 없음. be_24(EngineContainer)와 be_25(전역변수 없음)로 간접 검증하나 bootstrap/routes 분리 테스트 없음
- `#9` Building 폴더 자동 생성 — be_34에 ArtifactManager.ensure_building_folder()로 커버하나 워크플로우 start() 훅에서의 자동 생성 테스트 없음
- `#10` BOARD.md 자동 생성 — be_35, be_36으로 커버
- `#11` TASK.md 자동 생성 — be_37으로 커버
- `#13` BOARD.md 동시 쓰기 방지 — be_36으로 커버
- `#23` PresetLoader 변수 치환 — be_13, be_14, be_15로 커버

---

### 2.2 현재 구현된 TDD 파일 현황

**Design 정의 테스트 파일 (be_XX)**:

```
brick/__tests__/engine/
├── test_be00_phase0_critical/    ❌ 없음
├── test_be01_phase1_structure/   ❌ 없음
├── test_be02_phase2_artifacts/   ❌ 없음
├── test_be03_phase3_stability/   ❌ 없음
└── test_be04_e2e/                ❌ 없음
```

**실제 존재하는 테스트**:
```
brick/__tests__/engine/
├── test_browser_qa_hotfix.py      ← 구버전 QA
├── test_p0_3axis_completion.py    ← 구버전 P0
├── test_qa_a_engine_core.py
├── test_qa_c_links.py
├── test_qa_fail3_eventbus.py
├── test_qa_fail3_fixes.py
├── test_qa_fail3_recover.py
├── test_qa_hotfix.py
├── test_qa_p0_critical_path.py
└── test_qa_p1_engine_gaps.py
brick/tests/
├── test_state_machine.py
├── test_executor.py
├── test_event_bus.py
└── ... (34개 파일)
```

**be_XX 파일: 0개 구현.** 기존 테스트 638개는 Design 정의 이전 테스트.

---

### 2.3 빠진 테스트 (Design에도 없음)

Design TDD에서 누락된 케이스:

1. **`#14` 튜플 반환 → `_handle_block_event()` 통합 테스트 없음**
   - `_find_next_blocks()` 단독 튜플 반환은 be_02가 테스트
   - 하지만 `_handle_block_event()` 내에서 `next_blocks, extra_commands = ...`로 풀어서 쓰는 통합 흐름 테스트 없음
   - 제안: `test_be03_parallel_blocks_commands_not_overwritten` 내용으로 커버되긴 하나 명시적 추가 필요

2. **`#15` GateConfig 직렬화 상세 테스트 없음**
   - GateConfig.to_dict() 구현 방법이 Design에 명시되지 않음(`GateConfig.to_dict() 추가` 한 줄만)
   - `be_05`가 "gate 키 포함" 확인이지만 GateConfig 내부 필드 복원 정확성 미검증

3. **`#18` `-m` 플래그 차단 테스트 없음**
   - `be_10`이 `python -m pytest` 차단 명시하나, 현재 코드에서 `-m`이 `INTERPRETER_BLOCKED_ARGS`에 없음
   - Design과 코드가 불일치: Design은 차단, 코드는 허용

4. **PresetLoader.load() variables 파라미터 변경 테스트 없음**
   - 현재 `PresetLoader.load(name: str)` — variables 파라미터 없음
   - Design의 `load(preset_name, variables)` 시그니처 변경을 테스트하는 케이스 없음

5. **WorkflowExecutor.start() 실패 시나리오 테스트 없음**
   - preset validation failure, DuplicateWorkflowError 외에 project.yaml 로딩 실패, EventBus publish 실패 테스트 없음

6. **`_checkpoint_lock` 데드락 방지 테스트 없음**
   - Design 위험 요소 R2에서 명시했으나 TDD에 없음

7. **`#26` path_mapper 역방향(from_building) 테스트** (be_52 정의됨) — 구현 없으므로 추가 테스트가 의미 없으나, 테스트 설계에서 `legacy → building → legacy` 왕복 테스트 없음

8. **EventBus handler 예외 시 다른 핸들러 계속 실행 테스트 없음**
   - async 핸들러 하나가 예외를 던질 때 나머지 핸들러 호출 여부

---

### 2.4 TDD 리뷰어 최종 판정

> **Design의 TDD 설계는 26건과 1:1 매핑 거의 완성. 65개 케이스 중 63개가 매핑 가능. 그러나 실제 구현된 be_XX 테스트 파일은 0개. 기존 638개 테스트는 Design 이전 기준이므로 새 설계 검증 불가.**

**TDD 설계 점수: B+ (설계는 좋음, 구현 0%)**

---

## 3. E2E 리뷰어

### 3.1 E2E 워크스루 존재 여부

**Design Section 8** — 4개 E2E 시나리오 정의:
- 8.1 정상 흐름 (10단계)
- 8.2 서버 재시작 복구 (5단계)
- 8.3 경쟁 실행 흐름 (4단계)
- 8.4 gate 실패 → 재시도 흐름 (4단계)

**판정: E2E 워크스루 문서는 존재. 그러나 실제 코드와 다수 불일치.**

---

### 3.2 E2E 워크스루 코드 대조

#### 정상 흐름 (8.1) 대조

| 단계 | Design 기술 | 실제 코드 | 일치 |
|------|------------|---------|------|
| [1] POST /engine/workflows | `engine_routes.py: start_workflow()` | 실제 EP: `POST /engine/start` (engine_bridge.py) | ⚠️ 경로 다름 |
| [2] `executor.start()` → preset_loader.load() | 변수 치환 재귀 walk | yaml.dump→replace→parse (fragile) | ❌ |
| [2] ArtifactManager.ensure_building_folder() 호출 | `workflow.started` 시점 Building 폴더 생성 | 없음 | ❌ |
| [3] InputResolver.resolve(plan_block, instance) → {} | plan 블록 input 없으면 {} | 없음 (InputResolver 미구현) | ❌ |
| [3] _build_structured_prompt() | 이전 산출물 포함 프롬프트 | `f"TASK: {block.what}\n\nCONTEXT:\n..."` | ❌ |
| [4] claude_local._write_state() artifacts 저장 | status=done 시 artifacts 키 포함 | `_write_state(execution_id, {"status": "completed", "stdout": ..., "session_id": ...})` — artifacts 없음 | ❌ |
| [4] EventBus.publish(AdapterCompletedEvent) | 순환 의존 제거 | `from brick.dashboard.routes.engine_bridge import executor` lazy import | ❌ |
| [5] ArtifactManager.collect() | block.completed 시 ArtifactRecord 생성 | 없음 | ❌ |
| [6] `_find_next_blocks()` 튜플 반환 | race condition 제거 | `self._extra_link_commands = extra_commands` 여전히 인스턴스 변수 | ❌ |
| [7] InputResolver.resolve(design_block) | plan.md 내용 → context 주입 | 없음 | ❌ |
| [10] BOARD.md 최종 업데이트 | workflow.completed 시 BOARD.md | 없음 | ❌ |

**정상 흐름 11개 단계 중 실제 동작하는 부분**: [1] (경로만 다름), [6] 상태 전이(StateMachine은 동작)

---

#### 서버 재시작 복구 (8.2) 대조

| 단계 | Design | 코드 | 일치 |
|------|--------|------|------|
| [1] engine_bootstrap.create_engine() | Bootstrap 모듈 | `init_engine()`이 engine_bridge.py에 내장 | ⚠️ |
| [2] CheckpointStore.find_running_blocks() | 실행 중 블록 목록 | `checkpoint_store.list_active()` — workflow ID만 반환, block ID 별도 탐색 | ⚠️ 근사치 |
| [3] executor.resume_monitoring(workflow_id, block_id) | 공개 API 호출 | `executor._monitor_block(instance, block_id)` 직접 호출 | ❌ |
| [4] 어댑터 완료 감지 | 상태 파일 "done" 감지 | ✅ `check_status()` 구현됨 | ✅ |

---

#### 경쟁 실행 흐름 (8.3) 대조

| 단계 | Design | 코드 | 일치 |
|------|--------|------|------|
| [2] CompeteStartCommand 처리 | CompeteManager.monitor_compete() | `_monitor_compete()` executor 내장 (5초 폴링) | ⚠️ 구조만 다름 |
| [3] 승자 결정 후 패자 cancel() | `_cancel_loser()` → adapter.cancel() | `await adapter.cancel(comp_exec.execution_id)` ✅ | ✅ |
| [4] complete_block(winner) | 승자 블록 진행 | ✅ 구현됨 | ✅ |

**경쟁 실행 흐름**: 실질 동작은 됨. 구조만 다름(모놀리식 vs 모듈 분리).

---

#### gate 실패 → 재시도 (8.4) 대조

| 단계 | Design | 코드 | 일치 |
|------|--------|------|------|
| [1] GateExecutor.run() → match_rate < 90 | gate_failed | ✅ 구현됨 | ✅ |
| [2] StateMachine loop 링크 | retry_count 증가 | ✅ on_fail="retry" 동작 | ✅ |
| [3] retry_version 증가 | 버전별 artifacts 분리 | ❌ retry_version 없음, artifacts 덮어씀 | ❌ |
| [4] max_retries 도달 → FAILED | 최대 재시도 시 종료 | ✅ 구현됨 | ✅ |

---

### 3.3 불변식 정의 대조

Design Section 7 — 12개 불변식 정의 (INV-01~INV-12):

| ID | 불변식 | 코드 강제 여부 |
|----|--------|--------------|
| INV-01 | `_extra_link_commands` 없어야 함 | ❌ 존재함 (`state_machine.py:36`) |
| INV-02 | `_find_next_blocks()` 반환 타입 `tuple[list,list]` | ❌ 현재 `list[str]` 반환 |
| INV-03 | 병렬 블록 커맨드 모두 보존 | ❌ race condition 미해결 |
| INV-04 | 블록 완료 후 artifacts 비어있지 않아야 함 | ❌ 항상 [] |
| INV-05 | `_write_state()`에 artifacts 키 포함 | ❌ 완료 경로에서 artifacts 미포함 |
| INV-06 | 다음 블록 context에 `previous_artifacts` 키 | ❌ InputResolver 없음 |
| INV-07 | `to_dict() → from_dict()` 왕복 후 input/gate 동일 | ❌ input/gate 직렬화 없음 |
| INV-08 | 체크포인트 저장/복원 후 모든 필드 복원 | ⚠️ 기본 필드는 됨, input/gate 소실 |
| INV-09 | `is_command_allowed("python -c ...")` → False | ✅ `-c` 차단 |
| INV-10 | `"codex" in ALLOWED_COMMANDS` | ❌ |
| INV-11 | `claude_local.py`에 `engine_bridge` import 없어야 함 | ❌ lazy import 존재 |
| INV-12 | `engine_routes.py`에 전역 변수 없어야 함 | ❌ (engine_bridge.py에 전역 유지) |

**12개 불변식 중 강제되는 것: 1개 (INV-09만 부분 충족 — `-c` 차단됨, codex 미추가)**

---

### 3.4 실패 시나리오 커버리지

**Design에 정의된 실패 시나리오**:
- ✅ adapter 없음 → `block.adapter_failed` 이벤트 (executor.py 구현)
- ✅ gate 실패 → retry/skip/route 처리 (state_machine.py 구현)
- ✅ max_retries 소진 → FAILED (state_machine.py 구현)
- ✅ 10분 staleness → adapter_failed (executor.py 구현)
- ✅ compete 전부 실패 → workflow FAILED
- ❌ 동일 feature 동시 실행 → DuplicateWorkflowError (미구현)
- ❌ Building 폴더 생성 실패 → 에러 처리 (미구현)
- ❌ artifacts 파일 없음 → InputResolver fallback (미구현)
- ❌ BOARD.md 동시 쓰기 → 락 보호 (미구현)
- ❌ 서버 재시작 중 블록 완료 → 복구 (partial — 구조적 이슈)

**E2E 리뷰어 최종 판정**:

> **Design의 E2E 워크스루 자체는 잘 쓰여 있음. 단, 11개 핵심 단계 중 2개만 현재 코드에서 정상 동작. 불변식 12개 중 1개만 만족. 실패 시나리오 10개 중 5개만 구현. E2E로 실제 Building을 돌릴 수 없는 상태.**

---

## 4. 종합 평가

### 4.1 문서 vs 코드 갭 요약

| 구분 | Design 정의 | 코드 구현 | 갭 |
|------|-----------|---------|-----|
| 26건 개선항목 | 100% 정의 | ~8% 반영 (2건 부분) | **92% 미구현** |
| TDD 케이스 | 65개 정의 | 0개 구현 | **100% 미구현** |
| E2E 시나리오 | 4개 정의 | 부분 동작 | **핵심 흐름 미동작** |
| 불변식 | 12개 정의 | 1개 만족 | **92% 불만족** |
| 신규 모듈 | 10개 정의 | 0개 생성 | **100% 미생성** |
| 전역 변수 | 0개 목표 | 6개 유지 | **미해결** |
| executor.py 줄 수 | ~200줄 목표 | 871줄 | **671줄 초과** |

### 4.2 즉시 차단 이슈 (Phase 0 — Critical)

```
[CRITICAL-1] #14 StateMachine race condition
  - 위치: state_machine.py:36,307
  - 현상: _extra_link_commands 인스턴스 변수로 병렬 블록 커맨드 덮어씀
  - 영향: 병렬 워크플로우에서 StartBlockCommand 소실 가능

[CRITICAL-2] #21 codex ALLOWED_COMMANDS 누락
  - 위치: gates/command_allowlist.py
  - 현상: codex gate 항상 실패
  - 영향: do-codex-qa, design-dev-qa-approve, feature-codex-qa 3개 프리셋 사용 불가

[CRITICAL-3] #17 claude_local → engine_bridge 순환 의존
  - 위치: adapters/claude_local.py:_notify_complete()
  - 현상: from brick.dashboard.routes.engine_bridge import executor
  - 영향: 모듈 분리 시 즉시 ImportError. 현재는 lazy import로 숨김
```

### 4.3 Design 문서 품질 평가

| 항목 | 점수 | 코멘트 |
|------|------|--------|
| 26건 → TDD 매핑 | A | 거의 완전한 1:1 커버리지 |
| 인터페이스 정의 상세도 | A- | 시그니처, 입출력, 예외 명시. 일부 구체 구현 방법 미정 |
| E2E 워크스루 | B+ | 10단계 정상 흐름 명확. 실제 코드와 갭은 구현 미완 때문 |
| 불변식 정의 | A | 12개 검증 가능한 불변식. 코드로 강제하는 방법도 명시 |
| 위험 요소 분석 | B+ | R1~R6 현실적. R2(deadlock)는 추가 상세 필요 |
| Phase 순서 DAG | A | 의존성 명확. Phase 0 선행 필수 강조 |

### 4.4 CTO 구현 가이드 (우선순위)

**Day 1 (4시간)**: Phase 0 Critical 4건
```python
# 1. state_machine.py — _extra_link_commands 제거 (30분)
# 2. command_allowlist.py — codex 추가 + -m 차단 (30분)
# 3. workflow.py — to_dict/from_dict input+gate 추가 (1시간)
# 4. claude_local.py — _notify_complete EventBus로 교체 (2시간)
```

**Day 2-3**: Phase 1 구조 분리 (8건, 병렬 가능)
```
preset_loader.py 분리 → block_monitor.py 분리 → compete_manager.py 분리
→ command_dispatcher.py 분리 → container.py 생성 → engine_bridge 3분할
```

**Day 4-6**: Phase 2 ArtifactManager + InputResolver (12건)

**Day 7+**: Phase 3 안정화 (4건)

---

## 5. 검토 결론

**Plan 문서**: 26건 개선항목 정의 완전하고 Phase 순서/의존성 명확. **합격**.

**Design 문서**: 65개 TDD, 인터페이스, E2E, 불변식 정의 상세. 미비점:
- engine_bridge 3분할 자체의 TDD 없음 (#2 직접 검증 케이스)
- CheckpointStore 확장 메서드 구체 구현 방법 미정
- `-m` 플래그 차단 (be_10 정의) vs 코드에서 미차단 → Design과 현 코드 불일치

**코드 상태**: Phase 0 진입 전. 26건 중 24건 미반영. 65개 TDD 파일 0개. **구현 착수 안 됨.**

**E2E 가능 여부**: 현재 코드로 실제 Building 실행 시 plan→design 산출물 연결 0%, BOARD.md 없음, duplicate 방어 없음. **E2E 불가.**

**권고**: CTO에게 Phase 0 4건 즉시 시작 지시. 하루 내 가능.

---

*작성: OMC 서브에이전트 | 코드 직접 확인 기준 | 2026-04-05*
