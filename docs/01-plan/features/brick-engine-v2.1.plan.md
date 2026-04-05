# Plan: 브릭 엔진 v2.1 리팩토링

> 작성: PM | 2026-04-05
> 기반: architecture-brick-engine-v2.1.md + Codex/OMC/PM 3팀 리뷰 + 엔진 코드 전수 분석
> 테스트 기준선: 638 passed, 3 skipped (2026-04-05)

---

## 1. 요구사항 정리 — 26건 기존→개선 대조표

### 구조 분리 (#1~#4)

| # | 기존 상태 | 문제 | 개선 목표 | Phase |
|---|----------|------|----------|-------|
| 1 | `executor.py` 871줄 — PresetLoader(56~228행) + WorkflowExecutor(231~871행) + CompeteExecution/CompeteGroup 데이터클래스 혼재 | God Object. 단일 파일에 파싱·실행·모니터링·compete 전부 | Executor(~350줄) + PresetLoader + BlockMonitor + CompeteManager + InputResolver + CommandDispatcher 6개 모듈 분리 | 1 |
| 2 | `engine_bridge.py` 560줄 — init_engine() + EP-1~8 라우터 + 6개 글로벌 변수 | 라우터+초기화+전역상태 겸임 | Bootstrap(초기화) + EngineRoutes(순수 라우터) + EngineContainer(DI) 3분할 | 1 |
| 3 | `global executor, preset_loader, checkpoint_store, state_machine, engine_event_bus, skyoffice_bridge` 6개 | 전역 변수 의존. 테스트 격리 불가 | `app.state.engine = EngineContainer(...)` DI 패턴 | 1 |
| 4 | `_execute_command()`가 StartBlock/RetryAdapter/CompeteStart/Notify/Emit/SaveCheckpoint 6종 처리 (465~643행, ~180줄) | executor 비대의 핵심 원인 | CommandDispatcher가 커맨드별 핸들러 라우팅 | 1 |

### 산출물 관리 (#5~#13)

| # | 기존 상태 | 문제 | 개선 목표 | Phase |
|---|----------|------|----------|-------|
| 5 | `InputConfig` 모델 존재 (`block.py:71-73`), `Block.input` 필드 존재 (84행) | executor `_execute_command()`에서 `block.input` 참조 없음. 선행 블록 산출물 전달 안 됨 | InputResolver가 이전 블록 산출물 → context["input_artifacts"]에 주입 | 2 |
| 6 | `TeamAdapter.get_artifacts()` 인터페이스 존재 (`base.py:25`), 전 어댑터 구현됨 | `executor.complete_block()` 어디에도 `get_artifacts()` 호출 없음 | ArtifactManager가 block.completed 이벤트에서 수집 | 2 |
| 7 | `claude_local._write_state()`가 status/stdout/stderr/exit_code/error/session_id만 기록 | `get_artifacts()`가 state에서 "artifacts" 키 읽지만, 키가 없어 항상 `[]` 반환 | `_monitor_process()` 완료 시 산출물 파싱 → state에 artifacts 키 기록 | 2 |
| 8 | 프롬프트: `f"TASK: {block.what}\n\nCONTEXT:\n{json.dumps(context)}"` | 맥락 없이 raw JSON dump. 에이전트가 산출물 경로/출력 위치를 모름 | 구조화된 프롬프트: 이전 산출물 + 출력 경로 + 프로젝트 규칙 포함 | 2 |
| 9 | Building 폴더 구조 없음. 프리셋 경로: `brick/projects/{project}/plans/{feature}.plan.md` (플랫) | 같은 feature 재실행 시 덮어씌움. 어느 실행이 어떤 산출물을 만들었는지 추적 불가 | `projects/{project}/buildings/{workflow_id}/` 자동 생성 (workflow_id = `{feature}-{timestamp}`, 기존 ID 포맷 재활용) | 2 |
| 10 | 통합문서(BOARD.md) 없음 | 프로젝트 전체 Building 현황 추적 불가 | ArtifactManager가 workflow.completed에서 BOARD.md 동적 생성 | 2 |
| 11 | TASK.md 자동 생성 코드 없음. API에서 task는 string으로만 전달 | Building 폴더에 TASK.md가 없음 | ArtifactManager가 workflow.started에서 TASK.md 자동 생성 | 2 |
| 12 | retry 시 BlockInstance.artifacts 덮어쓰기 | 이전 버전 산출물 유실 | `artifacts/{block_id}/v{retry_count}/` 버전 분리 | 2 |
| 13 | BOARD.md 동시 쓰기 경합 가능 | 여러 워크플로우 동시 실행 시 파일 충돌 | status.json 개별 관리 → BOARD.md 동적 생성 (매번 합산) | 2 |

### 버그/보안 (#14~#23)

| # | 기존 상태 | 문제 | 개선 목표 | Phase |
|---|----------|------|----------|-------|
| 14 | `StateMachine._extra_link_commands` 인스턴스 변수 (`state_machine.py:36`) | **Race condition**: parallel 블록A의 commands를 블록B가 덮어쓰기 → 잘못된 명령 실행 | `_find_next_blocks()` → `(next_ids, extra_commands)` 튜플 반환. 인스턴스 변수 제거 | 0 |
| 15 | `BlockInstance.to_dict()` (`workflow.py:28~54`): input 필드 없음, gate 필드 없음 | 체크포인트 재시작 후 input config 소실 + gate 우회 | 직렬화/역직렬화에 input + gate 필드 추가 | 0 |
| 16 | `engine_bridge.py:122,450,508`에서 `executor._monitor_block()`, `executor._execute_command()` 직접 호출 | private 메서드 의존. bootstrap 분리 시 깨짐 | public API 3개: `resume_monitoring()`, `retry_block()`, `trigger_hook()` | 1 |
| 17 | `claude_local._notify_complete()` → `from brick.dashboard.routes.engine_bridge import executor` 직접 호출 | 순환 의존. 어댑터→라우터→executor | EventBus "block.process_completed" 이벤트 발행으로 디커플링 | 1 |
| 18 | command gate: `python -c`, `python -m` 등 인터프리터 인자 실행 가능 | 보안 취약. 임의 코드 실행 경로 | INTERPRETER_BLOCKED_ARGS에 `-c`, `-e`, `--eval`, `-m` 차단 | 0 |
| 19 | 서버 재시작 시 `_auto_recover_workflows()`가 `executor._monitor_block()` 호출 | 이미 동작하지만 private 메서드 직접 호출 | Bootstrap에서 public API `resume_monitoring()` 사용 | 3 |
| 20 | `cancel_workflow`(`engine_bridge.py:389-403`)가 status만 FAILED 변경 | 취소해도 RUNNING 블록의 adapter 프로세스 계속 실행됨 | cancel 시 RUNNING 블록 `adapter.cancel()` 호출 | 3 |
| 21 | `command_allowlist.py` ALLOWED_COMMANDS에 `codex` 없음 | 3개 프리셋(`do-codex-qa`, `design-dev-qa-approve`, `feature-codex-qa`) gate 항상 실패 | ALLOWED_COMMANDS에 `codex` 추가 | 0 |
| 22 | 같은 feature 동시 실행 방지 없음 | Building 폴더/BOARD.md 충돌 | `start()` 시 동일 feature 활성 워크플로우 체크 | 2 |
| 23 | PresetLoader 변수 치환: `yaml.dump()` → `str.replace()` → `yaml.safe_load()` (`executor.py:85-87`) | project/feature 값에 YAML 특수문자(`:`, `#`, `{`) 포함 시 파싱 에러/구조 변형 | 재귀 dict walk + 문자열 필드만 치환 | 1 |

### 프리셋/기타 (#24~#26)

| # | 기존 상태 | 문제 | 개선 목표 | Phase |
|---|----------|------|----------|-------|
| 24 | preset extends + overrides: `what` 필드만 override 가능 (`executor.py:215-219`) | gate/team/done 변경 불가 | 전체 필드 deep merge (block 단위 교체) | 3 |
| 25 | EventBus `publish()` 동기만 (`event_bus.py:31`). async 핸들러 등록 시 코루틴 버려짐 | ArtifactManager 등 async 핸들러 불가 | async 핸들러 지원 (`asyncio.get_event_loop().create_task()`) | 3 |
| 26 | 과도기 경로 전략 없음: 플랫(`plans/{feature}.plan.md`) vs Building(`buildings/{feature}/plan/`) | Phase 2~3 동안 ArtifactManager가 어느 경로를 바라봐야 하는지 미명시 | ArtifactManager에 경로 매핑 레이어 (기존 경로→Building 경로 자동 해석) | 2 |

---

## 2. 구현 Phase — 순서 + 의존성

### 의존성 DAG

```
Phase 0 ─────────────────────────────────┐
  #14 StateMachine race condition        │
  #15 BlockInstance 직렬화 (input+gate)  │
  #18 command gate 보안                  ├── Phase 2 선행 조건
  #21 codex allowlist                    │
                                         │
Phase 1 ─────────────────────────────────┤
  #1  executor.py 6개 모듈 분리          │
  #2  engine_bridge.py 3분할             │
  #3  글로벌 변수 → DI                   │
  #4  CommandDispatcher                  │
  #16 private → public API               │
  #17 claude_local 순환 의존 제거        │
  #23 PresetLoader 변수 치환 안전화      │
                                         │
Phase 2 ─────────────────────────────────┤ (Phase 0,1 완료 후)
  #5  InputResolver (산출물 전달)         │
  #6  ArtifactManager (산출물 수집)       │
  #7  claude_local artifacts 기록        │
  #8  프롬프트 구조화                    │
  #9  Building 폴더 자동 생성            │
  #10 BOARD.md 자동 생성                 │
  #11 TASK.md 자동 생성                  │
  #12 retry 버전 분리                    │
  #13 BOARD.md 동시 쓰기 방지            │
  #22 동일 feature 동시 실행 방지        │
  #26 과도기 경로 매핑                   │
                                         │
Phase 3 ─────────────────────────────────┤ (Phase 2 완료 후)
  #19 서버 재시작 복구 (public API 사용)  │
  #20 cancel 시 adapter.cancel()         │
  #24 preset extends deep merge          │
  #25 EventBus async 핸들러              │
                                         │
Phase 4 ──────────────────────────────────  (Phase 3 완료 후)
  프리셋 artifacts 경로 Building 구조화
  team_aliases (COO용 추상화)
  레거시 완전 제거
```

### Phase 0: 선행 버그 수정 (Critical)

**목표**: Phase 2 선행 조건 확보. race condition + 직렬화 + 보안.

| 항목 | 파일 | 줄 | 수정 내용 |
|------|------|----|----------|
| #14 | `state_machine.py:36,307` | `_extra_link_commands` 제거 | `_find_next_blocks()` → `(next_ids, extra_commands)` 튜플 반환. `_handle_block_event()`에서 반환값으로 처리 |
| #15 | `workflow.py:28~85` | `to_dict()/from_dict()` | input config + gate config 직렬화/역직렬화 추가 |
| #18 | `gates/command_allowlist.py` | 보안 강화 | `-c`, `-e`, `--eval`, `-m` 인터프리터 인자 차단 로직 추가 |
| #21 | `gates/command_allowlist.py:7` | `codex` 추가 | `ALLOWED_COMMANDS.add("codex")` |

**검증**: `pytest brick/tests/ brick/__tests__/ -q` → 638+ passed. 기존 테스트 0건 깨짐.

### Phase 1: 구조 분리

**목표**: executor.py 871줄 → 6개 모듈. engine_bridge.py → 3분할.

| 신규 모듈 | 분리 원본 | 줄 범위 | 핵심 책임 |
|----------|----------|---------|----------|
| `engine/preset_loader.py` | `executor.py:56~228` | ~170줄 | YAML → WorkflowDefinition 변환 + 안전한 변수 치환(#23) |
| `engine/block_monitor.py` | `executor.py:652~741` | ~90줄 | 어댑터 완료 폴링 + staleness 감지 |
| `engine/compete_manager.py` | `executor.py:743~829` + CompeteExecution/CompeteGroup | ~130줄 | compete 링크 전담 |
| `engine/input_resolver.py` | 신규 | ~60줄 | 이전 블록 산출물 → 다음 블록 context 주입 |
| `engine/command_dispatcher.py` | `executor.py:465~643` | ~180줄 | 커맨드별 핸들러 라우팅 |
| `engine/bootstrap.py` | `engine_bridge.py:125~183` | ~60줄 | DI 조립 + auto_recover |
| `dashboard/routes/engine_routes.py` | `engine_bridge.py` 라우터 | ~400줄 | 순수 FastAPI 라우터 |
| `engine/engine_container.py` | 신규 | ~30줄 | EngineContainer dataclass (DI) |

**`_checkpoint_lock` 소유권**: Executor가 소유. BlockMonitor/CompeteManager에 생성자 주입.

**검증**: 기존 테스트 전체 Green + import 경로 호환성 확인.

### Phase 2: 산출물 관리 (ArtifactManager + InputResolver + Building)

**목표**: 블록 간 산출물 전달 활성화 + Building 폴더 자동 생성.

**의존성**: Phase 0 (#15 직렬화) + Phase 1 (모듈 분리) 완료 필수.

핵심 구현:
1. `engine/artifact_manager.py` — EventBus subscriber. `block.completed` → 산출물 수집, `workflow.started` → TASK.md/Building 폴더 생성, `workflow.completed` → BOARD.md 생성
2. `engine/input_resolver.py` — `get_block_inputs(instance, block_id)` → 이전 블록 실제 산출물 or 계획 경로 반환
3. `claude_local.py` — `_monitor_process()` 완료 시 `_write_state()`에 artifacts 키 추가. 프롬프트 구조화
4. Building 폴더: `projects/{project}/buildings/{feature}-{MMDD}-{seq}/`
5. 동일 feature 동시 실행 체크: `start()` 시 활성 워크플로우 검색

### Phase 3: 나머지 버그 + 안정화

**목표**: 취소 안전성, 자동 복구, EventBus async, preset extends 강화.

1. cancel 시 `adapter.cancel()` 호출 (#20)
2. 서버 재시작 복구 — public API 사용 (#19)
3. EventBus async 핸들러 지원 (#25)
4. preset extends deep merge (#24)

### Phase 4: 프리셋 정리 + 사용성

**목표**: 첫 Building을 실제로 돌릴 수 있는 상태.

1. 프리셋 artifacts 경로 → Building 폴더 구조
2. team_aliases 레이어 (COO용 추상화)
3. 레거시 코드 제거

---

## 3. 위험 요소 + 완화 방안

| # | 위험 | 확률 | 영향 | 완화 방안 |
|---|------|------|------|----------|
| R1 | Phase 1 모듈 분리 시 import 경로 변경으로 기존 테스트 깨짐 | 높음 | 중간 | 분리 전 `__init__.py`에 re-export 유지. 단계적 import 경로 마이그레이션. 매 파일 분리 후 `pytest -q` 실행 |
| R2 | `_checkpoint_lock` 공유 설계 실수로 deadlock 발생 | 중간 | 높음 | Lock을 Executor가 소유하고 BlockMonitor/CompeteManager에 주입. Lock 획득 순서 통일. timeout 파라미터 추가 |
| R3 | ArtifactManager EventBus 구독 시 sync/async 불일치 | 높음 | 중간 | Phase 3에서 async 핸들러 지원 전까지, ArtifactManager는 동기 메서드로 구현. 파일 I/O는 동기로 처리 가능 |
| R4 | Building 폴더 경로 변경으로 기존 프리셋 호환 깨짐 | 중간 | 높음 | 과도기 매핑 레이어(#26): 기존 플랫 경로와 Building 경로 양쪽 탐색. 기존 프리셋 YAML 즉시 수정 안 함 |
| R5 | PresetLoader 변수 치환 변경 시 기존 YAML 동작 달라짐 | 중간 | 중간 | 재귀 dict walk 구현 후 기존 YAML 전수 테스트. 결과 diff 확인 |
| R6 | Phase 2 크기가 커서 일정 초과 | 높음 | 중간 | ArtifactManager 핵심(수집+Building 폴더)을 Phase 2a, BOARD.md/TASK.md 자동생성을 Phase 2b로 분리 가능 |

---

## 4. 기존 테스트 유지 전략

### 현재 테스트 현황 (2026-04-05)

```
brick/tests/       — 단위 + 통합 테스트
brick/__tests__/   — TDD 테스트
총합: 638 passed, 3 skipped
```

### 전략

| Phase | 테스트 전략 | 기준 |
|-------|-----------|------|
| 0 | 기존 테스트 전체 Green 유지. #14(StateMachine) 수정 시 `test_state_machine.py` 집중 검증 | 638+ passed |
| 1 | **모듈 분리 시 매 파일마다 pytest 실행**. `__init__.py` re-export로 import 호환성 유지. engine_bridge import 경로 변경 시 `test_dashboard_*.py` 전체 재실행 | 638+ passed |
| 2 | 신규 모듈(ArtifactManager, InputResolver) → TDD로 테스트 먼저 작성. 기존 `test_executor.py` 수정 최소화 | 638 + TDD 신규 |
| 3 | #20(cancel), #25(EventBus async) → 기존 `test_event_bus.py` 확장 | 638 + TDD 신규 |
| 4 | 프리셋 경로 변경 → 프리셋 로딩 테스트 전수 실행 | 전체 Green |

### 불변 규칙

1. **매 PR마다 `pytest -q` 전체 Green 확인**
2. **모듈 분리는 동작 변경 없이 파일 이동만** — 리팩토링과 기능 변경을 같은 커밋에 섞지 않음
3. **신규 기능은 TDD** — 테스트 먼저 작성 → 코드 구현 → 리팩터
4. **import 호환 계층** — `executor.py`에서 `from brick.engine.preset_loader import PresetLoader` 후 기존 `from brick.engine.executor import PresetLoader` 경로도 유지

---

## 5. Phase별 예상 산출물

| Phase | 산출물 | 파일 수 |
|-------|-------|--------|
| 0 | 수정: state_machine.py, workflow.py, command_allowlist.py | 3 |
| 1 | 신규: preset_loader.py, block_monitor.py, compete_manager.py, input_resolver.py, command_dispatcher.py, bootstrap.py, engine_routes.py, engine_container.py. 수정: executor.py, engine_bridge.py | 10 |
| 2 | 신규: artifact_manager.py. 수정: claude_local.py, executor.py | 3+ |
| 3 | 수정: event_bus.py, engine_bridge.py, executor.py | 3 |
| 4 | 수정: 프리셋 YAML 11개, project.yaml | 12 |

---

## 6. 성공 기준

- [ ] 기존 테스트 638건 전체 Green 유지
- [ ] executor.py 350줄 이하
- [ ] engine_bridge.py 글로벌 변수 0개
- [ ] 블록 간 산출물 전달 동작 (InputResolver)
- [ ] Building 폴더 자동 생성 + BOARD.md 동적 생성
- [ ] `_extra_link_commands` 인스턴스 변수 완전 제거
- [ ] BlockInstance 직렬화에 input + gate 포함
- [ ] command gate 보안 인자 차단
- [ ] codex gate 정상 동작 (3개 프리셋)
- [ ] Phase 4 완료 = 첫 Building 실제 돌릴 수 있음
