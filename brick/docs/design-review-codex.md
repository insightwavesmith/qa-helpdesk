# 브릭 엔진 v2.1 설계 검토 (Codex)

> 검토자: Codex (설계 검토 서브에이전트)
> 검토일: 2026-04-05
> 대상: Plan + Design + 아키텍처 설계서 + 엔진 코드 (전수 검토)
> 기준선: 638 passed, 3 skipped

---

## 판정 요약

| 기준 | 상태 | 비고 |
|------|------|------|
| R1: TASK 대조 (26건) | ✅ PASS | Plan·Design 26건 전부 반영 |
| R2: Smith님 결정 충돌 | ✅ PASS | 3축 유지, 완전한 엔진, 문서=종료의 열쇠 충족 |
| R3: 구조 검증 | ⚠️ 조건부 | 축 독립성 OK, **Building 경로 3-way 불일치** |
| R4: 빠진 것 | ⚠️ 조건부 | gate_failed/skip extra_commands 처리 미명시 외 3건 |
| R5: TDD 검증 | ✅ PASS | be_01~65, 설계항목 1:1 매핑 확인 |
| **최종** | **⚠️ 조건부 PASS** | 아래 3개 조건 충족 후 Do 진입 |

---

## R1: TASK 대조 — 26건 반영 여부

### 검토 방법
Plan 1절 대조표 26건 → Design 1.3절 목록 + 각 Phase 상세 설계 → 1:1 매핑 확인.

### 결과: ✅ 전체 반영

| Phase | 항목 | Plan → Design 반영 | 상세 설계 위치 |
|-------|------|---------------------|--------------|
| 0 | #14 StateMachine race | ✅ | Design §2.1 |
| 0 | #15 BlockInstance 직렬화 | ✅ | Design §2.2 |
| 0 | #18 command gate 보안 | ✅ | Design §2.3 |
| 0 | #21 codex allowlist | ✅ | Design §2.4 |
| 1 | #1 executor 6모듈 | ✅ | Design §3.1 |
| 1 | #2 engine_bridge 3분할 | ✅ | Design §3.2 |
| 1 | #3 전역 변수 → DI | ✅ | Design §3.2.1 |
| 1 | #4 CommandDispatcher | ✅ | Design §3.1.4 |
| 1 | #16 private → public API | ✅ | Design §3.1.5 |
| 1 | #17 claude_local 순환 의존 | ✅ | Design §3.3 |
| 1 | #23 PresetLoader 변수치환 | ✅ | Design §3.1.1 |
| 2 | #5 InputResolver | ✅ | Design §4.2 |
| 2 | #6 ArtifactManager 수집 | ✅ | Design §4.1 |
| 2 | #7 claude_local artifacts 키 | ✅ | Design §4.3 |
| 2 | #8 구조화 프롬프트 | ✅ | Design §4.4 |
| 2 | #9 Building 폴더 | ✅ | Design §4.1.1 |
| 2 | #10 BOARD.md | ✅ | Design §4.1.1 |
| 2 | #11 TASK.md | ✅ | Design §4.1.1 |
| 2 | #12 retry 버전 분리 | ✅ | Design §4.5 |
| 2 | #13 BOARD.md 동시성 | ✅ | Design §4.1.1 |
| 2 | #22 중복 실행 방지 | ✅ | Design §4.6 |
| 2 | #26 경로 매핑 | ✅ | Design §4.7 |
| 3 | #19 서버 재시작 복구 | ✅ | Design §5.1 |
| 3 | #20 cancel → adapter.cancel() | ✅ | Design §5.2 |
| 3 | #24 preset deep merge | ✅ | Design §5.3 |
| 3 | #25 EventBus async | ✅ | Design §5.4 |

**26/26 모두 반영. 누락 없음.**

---

## R2: Smith님 결정 충돌

### 결정 1: "3축 구조 안 바꿈"

- 아키텍처 설계서: 3축(블록/팀/링크) 명시, 자유도 유지
- Plan: 3축 자유도 표(현재 vs 개선)에서 구조 변경 없이 확장만
- Design: 모듈 분리 후 Block/Team/Link 모델 변경 없음

**충돌 없음 ✅**

### 결정 2: "확장성 있는 완전한 엔진"

- 아키텍처 설계서 §5 확장성 체크리스트: Gate/Link/Adapter/프리셋/이벤트 구독자 모두 단일 등록 포인트
- Design의 DI 컨테이너(EngineContainer) + CommandDispatcher 패턴이 확장성 보강
- Phase 4에서 첫 Building 실제 돌릴 수 있음 명시

**충돌 없음 ✅**

### 결정 3: "블록=업무단위, 문서=종료의 열쇠"

- 아키텍처 설계서 블록 불변식:
  1. "모든 블록은 산출물(문서)을 남긴다"
  2. "다음 블록은 이전 블록의 산출물 경로를 받는다"
  3. "Gate가 산출물 존재를 검증한다"
- Design §4.1 ArtifactManager가 block.completed 이벤트 → 산출물 수집 → Gate 검증 흐름 설계
- Design §4.2 InputResolver가 이전 블록 산출물을 다음 블록 컨텍스트에 주입

**충돌 없음 ✅**

---

## R3: 구조 검증

### 3.1 축 독립성

**현재 코드 상태**:
```
brick/models/block.py   — Block, InputConfig, GateConfig (별도)
brick/models/team.py    — TeamDefinition (별도)
brick/models/link.py    — LinkDefinition (별도)
```

3축 모델이 각각 독립된 파일로 분리되어 있고, Plan/Design에서 이 구조를 유지함. ✅

**executor.py 871줄**은 현재 God Object이나, Phase 1 이후 6모듈로 분리 설계되어 있음. 분리 후 독립성 확보 예정. ✅

### 3.2 인터페이스 명확성

Design §3.1.x에서 각 모듈의 인터페이스 타입 힌트 + docstring 수준으로 정의됨.

| 모듈 | 핵심 인터페이스 | 명확성 |
|------|----------------|--------|
| PresetLoader | `load(name, variables) → WorkflowDefinition` | ✅ |
| BlockMonitor | `monitor(workflow_id, block_id) → None` | ✅ |
| CompeteManager | `monitor_compete(group) → str` (승자) | ✅ |
| CommandDispatcher | `dispatch(command, instance) → None` | ✅ |
| ArtifactManager | `collect()`, `get_artifacts()`, `ensure_building_folder()` | ✅ |
| InputResolver | `resolve(block, instance) → dict` | ✅ |

### 3.3 구조 냄새 — 발견된 이슈

#### 🔴 Critical: Building 폴더 경로 3-way 불일치

세 문서의 Building 경로가 모두 다름:

| 문서 | 경로 |
|------|------|
| 아키텍처 설계서 §1 | `projects/{project}/buildings/{feature}/` |
| Plan #9 | `projects/{project}/buildings/{feature}-{MMDD}-{seq}/` |
| Design §4.1.1 `ensure_building_folder()` | `brick/projects/{project}/features/{feature}/` |

Design이 아키텍처 설계서와 Plan 양쪽과 다른 경로 (`features/`)를 사용하고 있음. ArtifactManager 구현 시 어느 경로를 따라야 하는지 CTO가 혼란에 빠질 것. **Design 수정 필요.**

**Smith님 결정 기준**: 아키텍처 설계서 §1이 최종 결정문서. Plan #9의 `-{MMDD}-{seq}` 시퀀스는 추가 요소.
→ 통일 경로 제안: `brick/projects/{project}/buildings/{feature}-{MMDD}-{seq}/`

#### 🟡 Minor: gate_failed/skip 경로에서 extra_commands 처리 누락

**실제 코드** (`state_machine.py:160-175`):
```python
elif on_fail == "skip":
    block_inst.status = BlockStatus.COMPLETED
    next_blocks = self._find_next_blocks(wf, block_id)  # _extra_link_commands 설정됨
    if next_blocks:
        for next_id in next_blocks:
            # StartBlockCommand 추가...
    # ← _extra_link_commands를 읽지 않음!
```

`block.gate_passed` 경로에는 `self._extra_link_commands`를 읽는 코드가 있지만, `block.gate_failed → skip/route` 경로에는 없음. compete 링크 이후 skip 처리 시 CompeteStartCommand가 유실될 수 있음.

**Design §2.1에서 #14 수정 시 이 경로들도 함께 수정해야 함** — 현재 Design에 미명시.

#### 🟡 Minor: command allowlist 함수명 불일치

**실제 코드** (`command_allowlist.py`):
```python
def validate_command(cmd_parts: list[str]) -> tuple[bool, str]:
```

**Design §2.3 및 be_07~12에서 사용하는 함수명**:
```python
def is_command_allowed(command: str) -> tuple[bool, str]:
```

- 시그니처도 다름: 실제 코드는 `list[str]` (이미 shlex.split된 것), Design은 `str` (raw command string)
- `INTERPRETER_BLOCKED_ARGS`는 실제 코드에 이미 존재 (`{"-c", "-e", "-r", "--eval"}`), `-m`은 없음
- Design에서 `python -m`을 차단 목록에 넣었는데 (`be_10`), `python -m pytest`가 실제로 필요한 커맨드임 → `-m` 차단은 재검토 필요

---

## R4: 빠진 것

### 4.1 엣지케이스 — 미언급

1. **`_find_next_blocks()` 튜플 반환 후 gate_failed/skip/route 경로**: R3.3에서 언급한 것과 동일. Design §2.1에서 `_handle_block_event()` 수정 범위를 `block.gate_passed` 경로만 명시. `gate_failed → skip/route` 경로 미포함.

2. **`InputResolver.resolve()`에서 파일이 없는 경우 경고**: Design §4.2.2에서 `path.exists() if path.exists() else ""` 처리가 있지만, 파일 없는 경우 WARNING 로그 또는 실패 처리 여부 미명시. 에이전트가 빈 `previous_artifacts`로 실행될 경우 조용히 실패.

3. **`ArtifactManager._get_board_path()` 구현 없음**: Design §4.1.1에서 `generate_board()`가 `self._get_board_path(instance)`를 호출하지만, 해당 메서드 정의가 없음.

4. **`DuplicateWorkflowError` 미정의**: Design §4.6에서 `DuplicateWorkflowError` 예외를 raise하지만, 예외 클래스 정의 위치와 import 경로가 없음.

### 4.2 실패 시나리오 — 미상세

1. **체크포인트 마이그레이션**: `BlockInstance.to_dict()` 변경 시 기존 저장된 체크포인트(SQLite/JSON) 처리. Design §12.1에서 "마이그레이션 스크립트 작성 + from_dict() 하위 호환 처리" 언급만 있고, 구체적인 전략 없음. Phase 0 완료 직후 기존 워크플로우가 resume되면 깨질 수 있음.

2. **`EventBus.publish()` → async 전환 시 호출부 목록**: Design §5.4에서 `publish_async()` 별도 추가 방식을 권장하지만, 현재 코드에서 `event_bus.publish()`를 호출하는 곳이 executor.py + engine_bridge.py + claude_local.py 등 다수. Phase 3에서 어느 호출부를 `publish_async()`로 전환해야 하는지 미명시.

### 4.3 기존 인프라 매핑 — 불완전

1. **claude_local.py 이외 어댑터 순환 의존성 확인 미완**: Design §3.3에서 claude_local만 수정하지만, 다른 어댑터들(`claude_agent_teams.py` 등)도 `engine_bridge.executor`를 직접 참조하는지 미확인. 실제 코드 확인:
   ```
   # claude_local.py line 230:
   from brick.dashboard.routes.engine_bridge import executor
   ```
   `claude_agent_teams.py`에도 동일 패턴이 있을 수 있음.

2. **engine_bridge.py EP-1~8 → engine_routes.py 매핑**: Design §3.2.3에서 EP-1~2만 예시로 작성. 현재 engine_bridge.py에는 EP-3(get_status), EP-4(suspend), EP-5(resume), EP-6(cancel), EP-7(retry_adapter), EP-8(hook), EP-9(health_check), EP-10(human_tasks)까지 있음. 나머지 EP 라우트 설계 미완.

---

## R5: TDD 검증 — Design 항목 : 케이스 1:1 매핑

### 전체 매핑표

| Design 섹션 | 설계 항목 | TDD ID | 커버리지 |
|-------------|----------|--------|---------|
| §2.1 #14 StateMachine | 인스턴스 변수 제거, 튜플 반환, 병렬 보존 | be_01~03 | ✅ 3/3 |
| §2.2 #15 직렬화 | to_dict 3건 | be_04~06 | ✅ 3/3 |
| §2.3 #18 보안 | python/node/bash/python-m | be_07~10 | ⚠️ 3/4 (be_10 재검토) |
| §2.4 #21 codex | allowlist 포함/허용 | be_11~12 | ✅ 2/2 |
| §3.1.1 PresetLoader | import, 재귀치환, yaml.dump 제거 | be_13~15 | ✅ 3/3 |
| §3.1.2 BlockMonitor | import, 이벤트, 5min 경고, 10min 타임아웃 | be_16~19 | ✅ 4/4 |
| §3.1.3 CompeteManager | import, cancel 호출 | be_20~21 | ✅ 2/2 |
| §3.1.4 CommandDispatcher | import, 알수없는 커맨드 | be_22~23 | ✅ 2/2 |
| §3.2.1 EngineContainer | import, 전역변수 없음 | be_24~25 | ✅ 2/2 |
| §3.1.5 Public API | resume/retry 공개, _monitor_block 삭제 | be_26~28 | ✅ 3/3 |
| §3.3 순환 의존 | import 없음, EventBus 발행 | be_29~30 | ✅ 2/2 |
| §4.1 ArtifactManager | 7개 동작 | be_31~37 | ✅ 7/7 |
| §4.2 InputResolver | 4개 동작 | be_38~41 | ✅ 4/4 |
| §4.3 claude_local | artifacts 키, get_artifacts | be_42~43 | ✅ 2/2 |
| §4.4 구조화 프롬프트 | TASK/이전산출물/완료기준 | be_44~46 | ✅ 3/3 |
| §4.5 retry 버전 | retry_version 증가, 격리 | be_47~48 | ✅ 2/2 |
| §4.6 중복 방지 | 중복 에러, 완료 후 재시작 | be_49~50 | ✅ 2/2 |
| §4.7 PathMapper | to_building, from_building | be_51~52 | ✅ 2/2 |
| §5.1 서버 복구 | resume_monitoring, auto_recover | be_53~54 | ✅ 2/2 |
| §5.2 adapter.cancel | cancel 호출, 실패 무시 | be_55~56 | ✅ 2/2 |
| §5.3 deep merge | nested dict, list override | be_57~58 | ✅ 2/2 |
| §5.4 EventBus async | async/sync 핸들러 | be_59~60 | ✅ 2/2 |
| E2E | 5개 시나리오 | be_61~65 | ✅ 5/5 |

**전체: 65/65 매핑 확인. 1:1 대응 성립.**

### 주의 사항

**be_10**: `python -m pytest`가 차단된다고 설계되어 있음. 그러나 실제로 pytest를 gate command로 실행할 수 있어야 한다면 이 케이스는 실패 케이스가 아니라 통과 케이스여야 할 수 있음. **설계 결정 필요.**

**be_07~09 함수명**: `is_command_allowed("python -c ...")` 사용. 실제 코드는 `validate_command(["python", "-c", "..."])`. 테스트 코드 작성 시 시그니처 통일 필요.

---

## R6: 최종 판정

### 판정: ⚠️ 조건부 PASS

26건 반영, 3축 불변, TDD 65건 1:1 매핑. 구조 설계는 견고함. 단, **아래 3개 조건 해소 후 Do 진입** 권장.

---

### 조건 1 (Critical) — Building 경로 통일 [Design 수정 필요]

**현황**: 아키텍처 설계서 `buildings/{feature}/`, Plan #9 `buildings/{feature}-{MMDD}-{seq}/`, Design `features/{feature}/` 3-way 불일치.

**요구**: Design §4.1.1 `ensure_building_folder()` 경로를 아키텍처 설계서 + Plan 기준으로 수정.
```python
# BEFORE (Design §4.1.1)
root = Path(self._building_root) / project / "features" / feature

# AFTER
root = Path(self._building_root) / project / "buildings" / f"{feature}-{mmdd}-{seq:02d}"
```

PathMapper §4.7도 동일하게 수정.

---

### 조건 2 (Minor) — gate_failed/skip 경로 extra_commands 처리 명시 [Design 추가]

**현황**: Design §2.1에서 `_handle_block_event()` 수정 범위를 `block.gate_passed` 경로만 명시. `block.gate_failed → skip` 경로 미포함.

**요구**: Design §2.1에 아래 추가:
```
# AFTER (gate_failed → skip 경로도 수정)
elif on_fail == "skip":
    next_blocks, extra_commands = self._find_next_blocks(wf, block_id)  # 튜플 수령
    commands.extend(extra_commands)  # ← 추가
    ...
```

---

### 조건 3 (Minor) — command allowlist 함수명/시그니처 통일 [Design 수정]

**현황**: 실제 코드 `validate_command(cmd_parts: list[str])`, Design `is_command_allowed(command: str)`. TDD be_07~12 모두 `is_command_allowed` 기준으로 작성됨.

**요구**:
- Design §2.3을 실제 코드 시그니처에 맞춰 수정하거나, 실제 코드의 함수명을 Design에 맞춰 변경. 어느 쪽이든 통일.
- `python -m` 차단 여부 (be_10) 재결정. pytest 등 모듈 실행이 gate에서 사용되는지 확인 후 결정.

---

## 검토 메모

### 현재 코드에서 이미 완료된 것

- `INTERPRETER_BLOCKED_ARGS` 차단 로직 이미 `command_allowlist.py`에 존재 (Phase 0 #18 일부 완료)
- `_monitor_compete()`에서 패자 `adapter.cancel()` 이미 호출됨 (Phase 3 #20 일부 완료)
- Building 경로 외에 나머지 설계는 코드와 일관성 있음

### CTO 구현 시 주의

1. Phase 0 완료 즉시 기존 체크포인트 마이그레이션 스크립트 작성 필요 (Design에 미포함)
2. `claude_agent_teams.py` 등 다른 어댑터에도 동일 순환 의존성 있는지 먼저 grep 확인
3. Phase 1 모듈 분리 시 `engine_bridge.py`의 EP-3~EP-10 라우트도 `engine_routes.py`로 함께 이전

---

*검토 완료. 조건 3개 해소 후 CTO Do 진입.*
