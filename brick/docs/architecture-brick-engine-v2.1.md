# 🧱 브릭 엔진 아키텍처 v2.1 — 최종 설계

> 작성: 모찌 (COO) | 2026-04-05
> 리뷰 반영: Codex + PM + OMC(3명) = 4팀 검토 완료
> 원칙: 확장성 있는 완전한 엔진. 3축 자유도 + Building 결과물.

---

## 1. 전체 구조

```
프로젝트 (bscamp)
  └─ BOARD.md (통합문서 — 자동 생성)
  └─ buildings/
       └─ {feature}/ (Building 단위 폴더)
            ├─ TASK.md
            ├─ plan.md → design.md → do.md → report.md
            └─ status.json

엔진 (10개 모듈):
  ┌─ Executor (지휘관, ~350줄) — 생명주기만
  ├─ CommandDispatcher — 커맨드 디스패치 (Start/Retry/Compete/Notify)
  ├─ StateMachine — 순수 함수 상태 전이 (사이드이펙트 0)
  ├─ PresetLoader — YAML → 모델 변환
  ├─ InputResolver — 이전 블록 산출물 → 다음 블록 주입
  ├─ BlockMonitor — 어댑터 폴링 + staleness 감지
  ├─ CompeteManager — compete 링크 전담
  ├─ ArtifactManager — 산출물 수집/전달/Building 폴더/통합문서
  ├─ GateExecutor — 8종 Gate
  ├─ CronScheduler — cron 링크
  ├─ SlackSubscriber — Slack 알림
  └─ Bootstrap — 전체 조립 (DI)

API 레이어:
  ├─ EngineRoutes (순수 라우터) — EP-1~10
  └─ EngineContainer (DI 컨테이너) — app.state.engine
```

---

## 2. 3축 상세

### 축 1: 블록 (업무단위)

```
Block = {
  id, what, type, description,
  input:  InputConfig (from_block, artifacts) ← 활성화
  done:   DoneCondition (artifacts, metrics)
  gate:   GateConfig (handlers[], evaluation, on_fail, max_retries)
  timeout, idempotent, metadata, fallback_adapter
}
```

*블록 불변식:*
1. 모든 블록은 산출물(문서)을 남긴다
2. 다음 블록은 이전 블록의 산출물 경로를 받는다
3. Gate가 산출물 존재를 검증한다

*자유도:*
| 항목 | 현재 | 개선 후 |
|------|------|---------|
| type | 10종 + Custom | ✅ 유지 |
| gate | 8종 + register_gate() | ✅ 유지 |
| input 전달 | ❌ 안 됨 | ✅ InputResolver가 자동 주입 |
| 산출물 강제 | ❌ 없음 | ✅ artifact gate 기본 적용 |
| 블록 재사용 | ❌ YAML 복사만 | 🟡 P2 블록 라이브러리 |

### 축 2: 팀 (누가)

```
Team = {
  adapter, config (model, role, env, cwd, timeout),
  teammates, communication, idle_policy, max_depth
}
```

*자유도:*
| 항목 | 현재 | 개선 후 |
|------|------|---------|
| adapter 5종 + register() | ✅ | ✅ 유지 |
| 모델/역할 자유 | ✅ | ✅ 유지 |
| team_aliases | ❌ 개발 용어 노출 | ✅ "PM팀", "CTO팀" 별칭 |
| 프롬프트 | ❌ "TASK+JSON"만 | ✅ 이전 산출물 + 규칙 + 출력 경로 포함 |

### 축 3: 링크 (순서)

```
Link = {
  from→to, type, condition, max_retries,
  merge_strategy, teams, judge, schedule,
  on_fail, notify
}
```

*자유도:*
| 항목 | 현재 | 개선 후 |
|------|------|---------|
| 7종 + register_link() | ✅ | ✅ 유지 |
| 조건 6개 연산자 | ✅ | ✅ 유지 |
| 복합 조건 AND/OR | ❌ | 🟡 P2 |

---

## 3. 기존 → 개선 대조표

### 구조 분리

| # | 기존 | 문제 | 개선 |
|---|------|------|------|
| 1 | executor.py 871줄 | 만능 매니저 | executor(~350줄) + PresetLoader + BlockMonitor + CompeteManager + InputResolver + CommandDispatcher |
| 2 | engine_bridge.py 560줄 | 라우터+초기화+글로벌변수 | Bootstrap(초기화) + EngineRoutes(순수 라우터) + EngineContainer(DI) |
| 3 | 글로벌 변수 6개 | `global executor, preset_loader...` | `app.state.engine = EngineContainer(...)` |
| 4 | _execute_command가 5종 커맨드 처리 | executor 비대 | CommandDispatcher가 커맨드별 핸들러 라우팅 |

### 산출물 관리

| # | 기존 | 문제 | 개선 |
|---|------|------|------|
| 5 | InputConfig 모델만 있음 | executor가 안 씀 | InputResolver가 이전 블록 산출물 → context["input_artifacts"]에 주입 |
| 6 | adapter.get_artifacts() 안 부름 | 산출물 수집 안 됨 | ArtifactManager가 block.completed 이벤트에서 수집 |
| 7 | claude_local._write_state()에 artifacts 키 없음 | get_artifacts() 항상 [] | _monitor_process() 완료 시 산출물 파싱 → state에 기록 |
| 8 | 프롬프트: "TASK: {what}\nCONTEXT: {json}" | 맥락 없이 실행 | 이전 산출물 경로 + 출력 경로 + 프로젝트 규칙 포함 |
| 9 | Building 폴더 없음 | 산출물 흩어짐 | projects/{project}/buildings/{feature}/ 자동 생성 |
| 10 | 통합문서 없음 | 추적 불가 | BOARD.md 자동 생성 (workflow.completed 이벤트) |
| 11 | TASK.md 자동 생성 없음 | 생성 주체 불명 | ArtifactManager가 workflow.started에서 생성 |
| 12 | retry 시 산출물 덮어쓰기 | 이전 버전 유실 | artifacts/{block_id}/v{retry_count}/ 구조 |
| 13 | BOARD.md 동시 쓰기 경합 | 다수 워크플로우 충돌 | status.json 개별 관리 → BOARD.md 동적 생성 |

### 버그/보안

| # | 기존 | 문제 | 개선 |
|---|------|------|------|
| 14 | StateMachine._extra_link_commands | 인스턴스 변수 = race condition | _find_next_blocks() → (next_ids, extra_commands) 튜플 반환 |
| 15 | BlockInstance.to_dict()에 input/gate 누락 | 재시작 후 input 소실 + gate 우회 | 직렬화/역직렬화에 input + gate 추가 |
| 16 | engine_bridge에서 executor._execute_command() 호출 | private 메서드 의존 | public API 3개 추가 (resume_monitoring, retry_block, trigger_hook) |
| 17 | claude_local._notify_complete() → executor 직접 호출 | 순환 의존 | EventBus "block.process_completed" 이벤트 발행 |
| 18 | command gate: python -c, python -m 실행 가능 | 보안 취약 | 인터프리터 인자 차단 (-c, -e, --eval, -m) |
| 19 | 서버 재시작 시 자동 복구 없음 | 수동 API 필요 | Bootstrap에서 list_active() → 자동 resume |
| 20 | cancel_workflow에서 adapter.cancel() 미호출 | 취소해도 블록 계속 실행 | cancel 시 RUNNING 블록 adapter.cancel() 호출 |
| 21 | codex가 ALLOWED_COMMANDS에 없음 | 3개 프리셋 gate 항상 실패 | ALLOWED_COMMANDS에 codex 추가 |
| 22 | 같은 feature 동시 실행 방지 없음 | 폴더/BOARD 충돌 | start() 시 동일 feature 활성 워크플로우 체크 |
| 23 | PresetLoader 변수 치환 (YAML dump→replace→parse) | 특수문자 시 파싱 에러 | 재귀 dict walk + 문자열 필드만 치환 |

### 프리셋/기타

| # | 기존 | 문제 | 개선 |
|---|------|------|------|
| 24 | preset extends: what만 override | gate/team 변경 불가 | 전체 필드 deep merge |
| 25 | EventBus 동기만 | async 핸들러 등록 시 코루틴 버려짐 | async 핸들러 지원 (loop.create_task) |
| 26 | 과도기 경로 전략 없음 | 플랫 경로 vs Building 폴더 혼재 | ArtifactManager에 경로 매핑 레이어 |

---

## 4. 구현 Phase (리뷰 반영 수정)

### Phase 0: 선행 버그 (Building 전제 조건)
```
□ BlockInstance to_dict/from_dict에 input + gate 직렬화 추가 (#15)
□ command gate 보안: -c, -e, --eval, -m 차단 (#18)
□ codex allowlist 추가 (#21)
□ StateMachine _extra_link_commands → 튜플 반환 (#14)
```

### Phase 1: 구조 분리
```
□ executor.py → Executor(~350) + PresetLoader + BlockMonitor + CompeteManager + InputResolver + CommandDispatcher (#1,4,5)
□ engine_bridge.py → Bootstrap + EngineRoutes + EngineContainer (#2,3)
□ executor private 메서드 → public API 3개 (#16)
□ claude_local 역방향 호출 → EventBus (#17)
□ _checkpoint_lock 공유 설계 (소유권 명시)
□ PresetLoader 변수 치환 안전하게 (#23)
```

### Phase 2: 산출물 관리 (ArtifactManager + 연결)
```
□ ArtifactManager 생성 (EventBus 구독)
□ claude_local._write_state()에 artifacts 키 기록 (#7)
□ ArtifactManager가 block.completed에서 get_artifacts() 수집 (#6)
□ InputResolver: 이전 블록 산출물 → context["input_artifacts"] 주입 (#5)
□ 블록 프롬프트 강화: 이전 산출물 + 출력 경로 + 규칙 (#8)
□ Building 폴더 자동 생성 (#9)
□ TASK.md 자동 생성 (workflow.started) (#11)
□ 통합문서 BOARD.md 자동 생성 (workflow.completed) (#10)
□ retry 시 버전 분리 (#12)
□ BOARD.md 동시 쓰기 방지 (#13)
□ 과도기 경로 매핑 레이어 (#26)
□ 동일 feature 동시 실행 방지 (#22)
```

### Phase 3: 나머지 버그 + 안정화
```
□ 서버 재시작 자동 복구 (#19)
□ cancel 시 adapter.cancel() 호출 (#20)
□ EventBus async 핸들러 지원 (#25)
□ preset extends deep merge (#24)
```

### Phase 4: 프리셋 정리 + 사용성
```
□ 프리셋 artifacts 경로 → buildings/{feature}/ 구조
□ team_aliases (COO용 추상화)
□ 과거 레거시 완전 제거
→ Phase 4 완료 = 첫 Building 돌릴 수 있음
```

---

## 5. 확장성 체크리스트

| 확장 시나리오 | 수정 포인트 | 검증 |
|---|---|---|
| 새 Gate 타입 | register_gate() 1곳 | ✅ |
| 새 Link 타입 | register_link() 1곳 | ✅ |
| 새 Adapter | TeamAdapter 구현 + register() 2곳 | ✅ |
| 새 프리셋 | YAML 파일 1개 (코드 0) | ✅ |
| 새 프로젝트 | projects/{name}/ + project.yaml | ✅ |
| 새 이벤트 구독자 | EventBus.subscribe() | ✅ |
| Building 폴더 구조 변경 | ArtifactManager만 | ✅ |
| 블록 프롬프트 변경 | claude_local._build_prompt()만 | ✅ |
| 워크플로우 취소 시 정리 | executor.cancel() + adapter.cancel() | ✅ (Phase 3) |
| 멀티 프로젝트 참조 | 🟡 P2 네임스페이스 | |
| 런타임 어댑터 전환 | 🟡 P2 fallback 체인 | |
| 산출물 타입 시스템 | 🟡 P2 | |

---

## 6. Decision Log

| 결정 | 대안 | 이유 |
|------|------|------|
| ArtifactManager 분리 | executor 내장 | SRP + 패턴 일관성 + 비대화 방지 |
| executor 6~7개 분리 | 유지(871줄) | "처음부터 구조 빡세게" (Smith님) |
| Building 단위 폴더 | 프로젝트 레벨 플랫 | "Building 안에 저장" (Smith님) |
| _find_next_blocks 튜플 반환 | 인스턴스 변수 유지 | race condition 제거 (OMC 발견) |
| Phase 2+3 병합 | 분리 | ArtifactManager = 산출물 단일 소유자 (OMC 제안) |
| engine_bridge 3분할 | bootstrap만 분리 | 글로벌 변수 제거 + 라우터 순수화 (OMC 제안) |
| status.json + BOARD.md 동적 생성 | BOARD.md 직접 쓰기 | 동시 쓰기 경합 방지 (OMC 발견) |

---

## 7. 리뷰 반영 추적

| 리뷰어 | 발견 | 반영 |
|--------|------|------|
| Codex | InputConfig 미사용, get_artifacts() 미호출, StateMachine 순수성, 직렬화 누락 | Phase 0~2에 전부 반영 |
| PM | InputResolver 모듈 추가, Phase 순서 꼬임, team_aliases, TASK.md 자동 생성, 동시 실행 방지 | Phase 0,2,4에 반영 |
| OMC-1 | 코드 행 번호 대조, gate 직렬화 누락(Critical), get_artifacts() 항상 [](선행 조건), codex allowlist | Phase 0,2에 반영 |
| OMC-2 | 확장성 누락 5건, cancel 시 adapter.cancel(), 산출물 타입 시스템 | Phase 3 + P2에 반영 |
| OMC-3 | Phase 2+3 병합, engine_bridge 3분할, BOARD.md 경합, 과도기 경로, EventBus async | Phase 1,2,3에 반영 |
| OMC 공통 | _checkpoint_lock 공유 설계, CommandDispatcher, executor 줄 수 수정, PresetLoader 치환 취약점 | Phase 1에 반영 |
