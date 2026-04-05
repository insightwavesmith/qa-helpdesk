# 브릭 엔진 v2 아키텍처 리뷰

> 리뷰어: OMC Worker-1 + Worker-2 + Worker-3 (통합) | 2026-04-05
> 대상: `docs/architecture-brick-engine-v2.md`
> 검증 방법: 설계서 vs 실제 코드 대조 (executor.py, state_machine.py, event_bus.py, workflow.py, engine_bridge.py, claude_local.py, gates/, presets/, adapters/)

---

## 종합 평가

**설계서 정확도: 높음.** 코드 대조 결과, executor.py 871줄, StateMachine 순수성 위반, InputConfig 직렬화 누락 등 주요 주장이 모두 실제 코드와 일치한다. 전체 방향(871줄 God Object → SRP 모듈 분리, ArtifactManager EventBus 구독 레이어)은 적절하다.

**문서 오류 2건, Critical 구조 문제 2건, 보완 필요 8건** 아래 상세 기술.

---

## 1. 모듈 분리 적절한가

### 판정: 적절 (보완 4건)

**코드 검증 결과:**
- `executor.py` — 871줄 확인. `PresetLoader`(56~228행, ~172줄) + `WorkflowExecutor`(231~871행, ~640줄) + `CompeteExecution`/`CompeteGroup` 데이터클래스 혼재.
- 분리 대상 코드 위치 확인:
  - PresetLoader → 이미 별도 클래스, 독립 파일 분리 타당
  - BlockMonitor → `_monitor_block`(652~741행, ~90줄) 분리 타당
  - CompeteManager → `_monitor_compete`(743~828행, ~85줄 + CompeteGroup) 분리 타당
  - Bootstrap → `init_engine`(engine_bridge.py 125~183행) 분리 타당

**보완 필요:**

| # | 사항 | 설명 |
|---|------|------|
| 1 | **`_checkpoint_lock` 공유 미설계** | BlockMonitor, CompeteManager 모두 `_checkpoint_lock`을 사용(executor.py 254, 629, 701, 734, 807, 829행). 분리 후 lock 소유권/주입 방식이 명시되어야 함. |
| 2 | **`_execute_command` 호출 경로** | BlockMonitor/CompeteManager가 `_execute_command`를 호출. 분리 시 executor에 대한 역참조 발생. Mediator 또는 콜백 패턴 필요. |
| 3 | **Executor 예상 줄 수 과소평가** | "~250줄" 추정은 `_execute_command`(465~643행, ~180줄) + `complete_block`(333~447행, ~115줄)만 합쳐도 295줄. helper 메서드 포함 시 ~350줄 예상. |
| 4 | **CommandDispatcher 누락** | `_execute_command`가 StartBlock, RetryAdapter, CompeteStart, Notify, SaveCheckpoint 5가지 커맨드를 디스패치. 리팩토링 후에도 Executor에 남으면 여전히 비대. 커맨드 핸들러 레지스트리 분리 고려. |

**engine_bridge.py(560줄) 추가 분리 권장:**
설계서는 `init_engine → bootstrap 분리`만 언급하지만, engine_bridge.py는 라우터(FastAPI EP-1~8) + 초기화 + 6개 글로벌 변수 관리를 겸임. bootstrap.py만 분리하면 여전히 500줄+ 남음.

> **제안:** `bootstrap.py`(초기화) + `engine_routes.py`(순수 라우터) + `EngineContainer` dataclass(DI 컨테이너) 3분할. `global executor, preset_loader, ...` 패턴은 `app.state.engine`으로 교체.

---

## 2. ArtifactManager 설계 맞는가

### 판정: 방향 맞음 (보완 4건)

**코드 검증:**
- `TeamAdapter.get_artifacts()` 인터페이스 존재(`adapters/base.py:25`). 모든 어댑터에 구현됨.
- `executor.py`의 `complete_block()`에서 `get_artifacts()` **호출 안 함** — 설계서 주장 정확.
- `InputConfig` 모델 존재(`models/block.py:71-73`), `Block.input` 필드 존재(84행). **PresetLoader에서 input을 파싱하지 않음** — 설계서 주장 정확.
- `BlockInstance.to_dict()`에서 **input 직렬화 누락** — 설계서 주장 정확.

**보완 필요:**

| # | 문제 | 설명 | 권장 |
|---|------|------|------|
| 1 | **산출물 수집 타이밍** | 설계서: `block.gate_passed → 수집`. Gate 실패 시에도 산출물 존재(retry 컨텍스트에 필요). `complete_block()` 내 gate 전에 수집해야 함. | `block.completed` 이벤트에서 수집, gate 결과와 무관 |
| 2 | **심볼릭 링크 vs 복사 미결정** | 심볼릭 링크는 원본 변경 반영(의도치 않은 변경 위험), 복사는 공간 낭비 | 경로 참조(JSON)만 저장, 실제 파일은 원본 위치 유지 권장 |
| 3 | **산출물 버전 관리 없음** | 블록 retry 시 이전 산출물 덮어쓰기/버전 분리 미명시 | `{feature}/artifacts/{block_id}/v{retry_count}/` 구조 |
| 4 | **BOARD.md 동시 쓰기 경합** | 여러 워크플로우 동시 실행 시 파일 충돌 | `asyncio.Lock` 직렬화 또는 status.json 개별 관리 후 BOARD.md 동적 생성 |

---

## 3. 확장성 빠진 것 없는가

### 판정: 대부분 커버됨 (누락 5건)

설계서 §8 체크리스트 8항목 전부 OK. 추가 누락:

| # | 시나리오 | 현재 상태 | 영향 |
|---|---------|----------|------|
| 1 | **멀티 프로젝트 워크플로우** | 단일 project/feature 바인딩. 프로젝트 간 블록 참조 불가. | EventBus에 프로젝트 스코프 필터/네임스페이스 도입 필요 |
| 2 | **런타임 어댑터 전환** | 팀 배정이 프리셋에서 정적 결정. `fallback_adapter` 필드 존재하나 미사용. | 어댑터 폴백 체인 구성 방법 불명확 |
| 3 | **산출물 타입 시스템** | `list[str]`(파일 경로만). 타입 메타데이터 없음. | "Plan 문서가 있는가?" 같은 의미적 Gate 검증 불가 |
| 4 | **Hook 이벤트 페이로드 필터링** | Hook link는 발동만, 외부 이벤트 payload condition 필터링 없음. | 복잡한 외부 트리거 시나리오 제한 |
| 5 | **워크플로우 취소 시 어댑터 정리** | `cancel_workflow`(engine_bridge.py:389-403)가 status만 FAILED 변경. `adapter.cancel()` 미호출. | 취소된 워크플로우의 블록이 계속 실행됨 |

---

## 4. 구현 Phase 순서 맞는가

### 판정: 대체로 맞음 (조정 3건)

**현재:** Phase 1(구조 분리) → Phase 2(산출물 연결) → Phase 3(ArtifactManager) → Phase 4(버그/보안) → Phase 5(프리셋 경로)

**조정 필요:**

| # | 조정 | 이유 |
|---|------|------|
| 1 | **Phase 2+3 병합** | Phase 2에서 get_artifacts() + InputConfig를 executor에 구현하면, Phase 3의 ArtifactManager가 이를 다시 리팩토링해야 함. ArtifactManager가 산출물의 단일 소유자가 되어야 하므로 한 번에 구현하는 것이 효율적. |
| 2 | **StateMachine 순수성(#6)을 Phase 1로 이동** | `_extra_link_commands` 경합 조건은 구조 분리 시 함께 해결해야 함. Phase 4로 미루면 분리된 모듈들이 오염된 상태로 작동. |
| 3 | **command gate 보안(#10) Phase 1 선행 또는 핫픽스** | `python -m`, heredoc, `-i` 플래그 미차단 — 현재도 존재하는 취약점. Phase 4까지 미룰 것이 아니라 선처리 권장. (단, INTERPRETER_BLOCKED_ARGS로 `-c`, `-e`는 이미 차단됨) |

**수정된 Phase 제안:**
```
Phase 1: 구조 분리 + StateMachine 순수성 수정 + 보안 핫픽스
Phase 2: ArtifactManager + 산출물 연결 + Building 폴더 + 통합문서 (기존 2+3 병합)
Phase 3: 버그 수정 (직렬화, 자동 복구, 역방향 호출 제거)
Phase 4: 프리셋 경로 수정 + 정리
→ Phase 4 완료 = 첫 Building 돌릴 수 있음
```

**Phase 2 선행 조건:** P0-7(InputConfig 직렬화)은 Phase 2 시작 전 반드시 완료. 미완료 시 체크포인트 복원 후 산출물 전달 실패.

---

## 5. 놓친 구조 문제

### 5-1. `_extra_link_commands` 경합 조건 (Critical)

**위치:** `state_machine.py:36, 139-141, 307`

단순 "불순(impure)" 문제가 아니라 **경합 조건(race condition)**:
1. parallel 블록A의 `_find_next_blocks`가 `_extra_link_commands`에 commandsA 저장
2. parallel 블록B의 `_find_next_blocks`가 commandsB로 **덮어쓰기**
3. 블록A의 `_handle_block_event`가 commandsB를 읽음 → **잘못된 명령 실행**

> **수정:** `_find_next_blocks`가 `(next_ids, extra_commands)` 튜플을 반환. 인스턴스 변수 제거.

### 5-2. engine_bridge.py private 메서드 직접 호출 (P0급)

**위치:**
- `engine_bridge.py:122` — `executor._monitor_block()` (auto_recover)
- `engine_bridge.py:450` — `executor._execute_command()` (retry-adapter)
- `engine_bridge.py:508` — `executor._execute_command()` (trigger-hook)

설계서는 P1(#18)로 분류했으나, **bootstrap.py 분리 시 이 의존성이 깨짐.** Phase 1에서 public API 추가 필요:
- `executor.resume_monitoring(workflow_id, block_id)`
- `executor.retry_block(workflow_id, block_id)`
- `executor.trigger_hook(workflow_id, from_block, to_block)`

### 5-3. Checkpoint 경합 (Moderate)

`_checkpoint_lock` 사용 불일관:
- `_monitor_block` → `complete_block` 호출 시 lock 사용 (710행) ✅
- API endpoint `complete_block` → lock 없이 호출 ❌
- `_cron_emit` → checkpoint save 시 lock 사용 (321행) ✅
- `start()` → checkpoint save 시 lock 없음 (299행) ❌

### 5-4. PresetLoader 변수 치환 취약성

`executor.py:85-87`:
```python
yaml_str = yaml.dump(inner)
yaml_str = yaml_str.replace("{project}", project).replace("{feature}", feature)
inner = yaml.safe_load(yaml_str)
```

YAML dump → string replace → YAML parse는 fragile. project/feature 값에 YAML 특수문자(`:`, `#`, `{`)가 포함되면 파싱 에러/구조 변형 발생. 재귀 dict walk + 문자열 필드만 치환이 안전.

### 5-5. gates/base.py 거대 파일 (3255줄)

`gates/base.py`가 3255줄로 executor.py(871줄)보다 3.7배 크다. 설계서 리팩토링 대상에 미포함.

> **제안:** P1 항목에 `base.py` 분리 검토 추가.

### 5-6. 설계서 오류 2건

| P0# | 설계서 주장 | 실제 코드 |
|-----|----------|----------|
| **#9** | "EventBus 핸들러 예외 시 전파" → P0 수정 필요 | **이미 격리됨.** `event_bus.py:32-43` try/except + `_log.exception()`. P0 목록에서 제거 필요. |
| **#13** | "ArtifactExistsGate dead code" → 삭제 대상 | **worker-3 코드 확인:** `plugin_manager.py:29`에서 `"artifact_exists"` 키로 등록됨. 테스트도 존재. 삭제하면 플러그인 시스템 깨짐. 재확인 필요. |

**P0-14(프리셋 `docs/01-plan/` 하드코딩)도 재확인 필요:** 프리셋 YAML 검사 결과 이미 `{project}/{feature}` 변수 사용 중. 다른 프리셋 파일을 가리키는 것일 수 있음.

---

## 코드 대조 요약

| 설계서 주장 | 실제 코드 | 일치 |
|---|---|---|
| executor.py 871줄 | `brick/engine/executor.py` 871줄 | **일치** |
| StateMachine `_extra_link_commands` 문제 | `state_machine.py:36` 확인 | **일치** |
| EventBus 예외 전파 | `event_bus.py:33-36` try/except 격리 | **불일치 (이미 해결됨)** |
| InputConfig 직렬화 누락 | `workflow.py` to_dict/from_dict에 input 없음 | **일치** |
| engine_bridge.py 라우터+초기화 겸임 | 560줄, init_engine + EP-1~8 | **일치** |
| claude_local.py "TASK+CONTEXT만" | `f"TASK: {block.what}\n\nCONTEXT:\n{json}"` | **일치** |
| ArtifactExistsGate 데드코드 | plugin_manager에서 등록 확인 (재확인 필요) | **불일치 가능** |
| 프리셋 `docs/01-plan/` 하드코딩 | `{project}/{feature}` 변수 사용 중 | **불일치 (이미 해결?)** |
| CronScheduler 존재 | 75줄 | **일치** |
| SlackSubscriber 존재 | 176줄 | **일치** |
| command gate 보안 취약점 | INTERPRETER_BLOCKED_ARGS로 부분 차단 | **부분 일치** |

---

## Worker-1 추가 발견 사항

### A. Gate config 직렬화 누락 — **Critical**

`workflow.py` `WorkflowDefinition.to_dict()`/`from_dict()`에서 **gate config를 직렬화하지 않는다.** 설계서 P0-7은 InputConfig 직렬화만 언급하지만, gate도 동일하게 누락:

- 서버 재시작 → 체크포인트 복원 → 모든 블록의 `gate = None`
- **결과: 품질 게이트가 조용히 우회됨** (artifact, metric, approval 등 전체)

→ P0-7에 gate 직렬화도 포함 필수.

### B. `get_artifacts()` 항상 빈 리스트 반환

`claude_local.py:283`의 `get_artifacts()`는 state 파일에서 `"artifacts"` 키를 읽지만, `_write_state()`는 이 키를 기록하지 않는다 (status, stdout, stderr, exit_code, error, session_id만 기록). ArtifactManager가 호출해도 영구적으로 `[]` 반환.

→ Phase 2 선행 조건으로 `_monitor_process()` 완료 시 산출물 파싱 → state에 `"artifacts"` 기록 로직 추가 필요. 설계서에 이 의존성 명시 없음.

### C. `codex` allowlist 미등록 — **Medium**

`command_allowlist.py`의 `ALLOWED_COMMANDS`에 `codex` 없음. 프리셋 3개(`do-codex-qa.yaml`, `design-dev-qa-approve.yaml`, `feature-codex-qa.yaml`)가 gate에서 `codex review --uncommitted` 사용 → **항상 실패** ("허용되지 않은 명령: codex").

→ `ALLOWED_COMMANDS`에 `codex` 추가 또는 `npx codex`로 프리셋 수정.

### D. 비동기 EventBus 핸들러 비호환 — **Medium**

`event_bus.py`의 `publish()`는 동기 호출(`handler(event)`). async 함수를 핸들러로 등록하면 코루틴이 반환되지만 await 안 됨 — **조용히 버려짐.** 어댑터/게이트가 전부 async인데 이벤트 핸들러만 동기 강제는 비일관적.

→ EventBus에 async 핸들러 지원 추가 or 동기 전용으로 문서 명시.

### E. Building 폴더 vs 기존 프리셋 경로 과도기 전략 없음

현재 프리셋 경로: `brick/projects/{project}/plans/{feature}.plan.md` (플랫)
설계서 Building 경로: `brick/projects/{project}/buildings/{feature}/plan.md` (계층)

Phase 5에서 프리셋 경로를 수정한다고 했지만, Phase 2~4 동안 ArtifactManager가 어느 경로를 바라봐야 하는지 미명시. **과도기 호환 전략(양쪽 탐색 or 매핑 레이어) 필요.**

---

## 최종 권장 사항 (우선순위순)

1. **`_extra_link_commands` 경합 조건 즉시 수정** — parallel 블록 사용 시 잘못된 명령 실행 위험 (Phase 1에 편입)
2. **Gate config 직렬화 P0-7에 포함** — 서버 재시작 시 모든 품질 게이트 우회 (Critical)
3. **Phase 2+3 병합** — ArtifactManager가 산출물 수집의 단일 소유자가 되어야 함
4. **Phase 2 선행 조건 명시**: (a) P0-7 InputConfig+Gate 직렬화, (b) `claude_local._write_state()`에 artifacts 키 기록
5. **engine_bridge.py 3분할 + 글로벌 변수 제거** — bootstrap.py만으로 부족
6. **P0-9(EventBus), P0-13(ArtifactExistsGate), P0-14(프리셋 경로) 재확인** — 이미 해결되었거나 삭제 시 문제 발생 가능
7. **`codex` allowlist 추가** — 3개 프리셋 gate 항상 실패 중
8. **base.py(3255줄) 리팩토링을 P1에 추가**
9. **private 메서드 호출(P1-#18)을 P0 또는 Phase 1로 승격** — bootstrap 분리 시 깨짐
10. **EventBus async 핸들러 지원 검토** — ArtifactManager 구현 시 제약
