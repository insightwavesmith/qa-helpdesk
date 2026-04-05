# 🧱 브릭 엔진 v2 아키텍처 설계

> 작성: 모찌 (COO) | 2026-04-05
> 기반: 7단계 아키텍처 사고 + Codex 코드 리뷰 + Smith님 논의
> 원칙: 확장성 있는 완전한 엔진. 3축 자유도 + Building 결과물.

---

## 1. 전체 구조

```
프로젝트 (bscamp, brick-engine, ...)
  └─ BOARD.md (통합문서 — Building 목록 + 진행상태)
  └─ buildings/
       └─ {feature}/ (Building 단위 폴더)
            └─ TASK.md → plan.md → design.md → report.md

프리셋 (YAML) — Building 설계도
  └─ 블록(업무단위) × 팀(누가) × 링크(순서) 조합

엔진 (런타임) — 3축을 돌리는 기계
  ├─ Executor (지휘관) — 워크플로우 생명주기만
  ├─ StateMachine (상태 전이) — 순수 함수
  ├─ PresetLoader (프리셋 로딩) — YAML → 모델
  ├─ GateExecutor (검증) — 8종 Gate
  ├─ BlockMonitor (감시) — 어댑터 폴링
  ├─ CompeteManager (경쟁) — compete 링크 전담
  ├─ ArtifactManager (산출물) — 저장/연결/추적
  ├─ SlackSubscriber (알림) — Slack 전송
  ├─ CronScheduler (스케줄) — cron 링크
  └─ Bootstrap (초기화) — 전체 조립
```

---

## 2. 3축 상세 설계

### 축 1: 블록 (업무단위)

```
Block = {
  id:       고유 이름
  what:     뭘 하나 (자연어)
  type:     업무 유형 (Plan/Design/Do/Check/Review/QA/Report/Research/Act/Custom)
  input:    이전 블록 산출물 참조 (InputConfig)     ← 현재 미사용 → 활성화
  done:     완료 조건 (artifacts + metrics)
  gate:     완료 검증 (GateConfig)
  timeout:  시간 제한
  metadata: 확장 필드
}
```

**블록 불변식 (반드시 지켜져야 함):**
```
1. 모든 블록은 산출물(문서)을 남긴다. 문서 = 종료의 열쇠.
2. 다음 블록은 이전 블록의 산출물 경로를 받는다.
3. Gate가 산출물 존재를 검증한다.
```

**확장 포인트:**
- type: 무제한 추가 (커스텀 블록 자유 정의)
- gate: register_gate()로 새 Gate 타입 추가
- done.artifacts: 경로 패턴 자유 ({project}/{feature} 변수)

---

### 축 2: 팀 (누가)

```
Team = {
  adapter:    실행 방식 (claude_local/claude_agent_teams/human/webhook/...)
  config:     설정 (model, role, env, cwd, timeout, ...)
  teammates:  팀원 구성 (Agent Teams 용)
}
```

**확장 포인트:**
- adapter: TeamAdapter 상속 + AdapterRegistry.register()
- config: dict 자유 구조 (어댑터마다 다른 설정)
- entry_points: pip install로 플러그인 추가

---

### 축 3: 링크 (순서)

```
Link = {
  from → to: 연결
  type:      연결 방식 (sequential/parallel/branch/loop/compete/cron/hook)
  condition: 발동 조건 (6개 연산자 + dict)
  on_fail:   실패 시 대안 경로
  notify:    알림 설정
}
```

**확장 포인트:**
- type: register_link()로 새 링크 타입 추가
- condition: evaluate_condition()에 새 연산자 추가 가능

---

## 3. 엔진 모듈 분리 설계

### 현재 (리팩토링 전)

```
executor.py (871줄) — 모든 것을 한다
engine_bridge.py — 라우터 + 초기화 겸임
```

### 목표 (리팩토링 후)

| 모듈 | 파일 | 책임 | 예상 줄 수 |
|------|------|------|-----------|
| **Executor** | executor.py | 워크플로우 시작/완료/재개. 커맨드 디스패치만. | ~250 |
| **StateMachine** | state_machine.py | 순수 함수 상태 전이. 사이드이펙트 0. | ~300 (현재 유지) |
| **PresetLoader** | preset_loader.py | YAML → WorkflowDefinition 변환 | ~180 |
| **GateExecutor** | gates/base.py + concrete.py | Gate 실행 + 레지스트리 | ~500 (현재 유지) |
| **BlockMonitor** | block_monitor.py | 어댑터 폴링 (10초), staleness 감지 | ~120 |
| **CompeteManager** | compete_manager.py | compete 블록 실행 + 승자 결정 | ~100 |
| **ArtifactManager** | artifact_manager.py ⭐ 신규 | 산출물 저장/전달/Building 폴더/통합문서 | ~200 |
| **CronScheduler** | cron_scheduler.py | cron 링크 스케줄링 | ~70 (현재 유지) |
| **SlackSubscriber** | slack_subscriber.py | EventBus → Slack 알림 | ~155 (현재 유지) |
| **Bootstrap** | bootstrap.py ⭐ 신규 | 전체 조립 (DI). init_engine() 대체 | ~80 |
| **EventBus** | event_bus.py | pub/sub + 예외 격리 | ~50 |

---

## 4. ArtifactManager 설계 (신규)

### 역할
```
1. 블록 완료 시 산출물 수집 (adapter.get_artifacts())
2. 다음 블록 시작 시 이전 산출물 경로를 프롬프트에 주입
3. Building 폴더 구조 생성/관리
4. 통합문서(BOARD.md) 자동 업데이트
```

### EventBus 구독 이벤트
```
block.gate_passed  → 산출물 수집 + Building 폴더에 기록
block.started      → 이전 블록 산출물 경로를 context에 주입
workflow.started   → Building 폴더 생성
workflow.completed → 통합문서 업데이트 + Building 폴더 완료 표시
```

### Building 폴더 구조
```
brick/projects/{project}/buildings/
  {feature}/                    ← Building 단위 폴더
    TASK.md                     ← COO가 작성한 TASK
    plan.md                     ← Plan 블록 산출물 (심볼릭 링크 또는 복사)
    design.md                   ← Design 블록 산출물
    report.md                   ← 최종 보고
    status.json                 ← 진행 상태 {current_block, started_at, ...}
```

### 통합문서 (BOARD.md) 자동 생성
```
brick/projects/{project}/BOARD.md

# bscamp 작업 게시판

| # | Building | 상태 | 현재 블록 | 시작 | 완료 |
|---|---------|------|---------|------|------|
| 1 | dashboard-phase3-4 | 🔄 진행중 | Design | 04-05 | - |
| 2 | codex-adapter | ⏳ 대기 | - | - | - |
| 3 | legacy-cleanup | ✅ 완료 | - | 04-05 | 04-05 |
```

---

## 5. 블록 간 산출물 전달 설계

### 현재 (안 됨)
```
에이전트 프롬프트: "TASK: {what}\nCONTEXT: {json}"
→ 이전 블록 산출물 경로 없음
→ 에이전트가 맥락 없이 실행
```

### 목표 (됨)
```
에이전트 프롬프트:
  "TASK: {what}

  이전 블록 산출물:
    - Plan: brick/projects/bscamp/buildings/auth/plan.md
    - Design: brick/projects/bscamp/buildings/auth/design.md

  CONTEXT: {json}"
```

### 구현 방법
```
1. complete_block() 시:
   adapter.get_artifacts(execution_id) → block_inst.artifacts에 저장

2. InputConfig 활성화:
   Block.input.from_block → 이전 블록 ID
   Block.input.artifacts → 이전 블록 산출물 경로

3. start_block() 시:
   이전 블록의 artifacts를 context["input_artifacts"]에 주입
   프롬프트에 산출물 경로 목록 추가
```

---

## 6. 수정 대상 상세

### 🔴 P0: 반드시 수정 (Building 전제 조건)

| # | 항목 | 현재 | 수정 | 파일 |
|---|------|------|------|------|
| 1 | executor.py 분리 | 871줄 만능 | 250줄 지휘관 + 모듈 5개 | executor.py, preset_loader.py, block_monitor.py, compete_manager.py, bootstrap.py |
| 2 | InputConfig 활성화 | 모델만 있고 안 씀 | executor에서 input 해석 + context 주입 | executor.py |
| 3 | adapter.get_artifacts() 호출 | 인터페이스만 있고 안 부름 | complete_block()에서 호출 | executor.py |
| 4 | 블록 프롬프트 강화 | "TASK+CONTEXT"만 | 이전 산출물 경로 + 프로젝트 규칙 추가 | claude_local.py |
| 5 | ArtifactManager 생성 | 없음 | EventBus 구독 레이어 | artifact_manager.py (신규) |
| 6 | StateMachine 순수성 | _extra_link_commands 인스턴스 변수 | _find_next_blocks() 튜플 반환 | state_machine.py |
| 7 | BlockInstance input 직렬화 | to_dict/from_dict에서 input 누락 | 직렬화/역직렬화에 input 추가 | workflow.py |
| 8 | init_engine → bootstrap 분리 | engine_bridge.py가 라우터+초기화 | bootstrap.py 분리 | bootstrap.py (신규), engine_bridge.py |
| 9 | EventBus 예외 격리 | 핸들러 예외 시 전파 | try/except + logger | event_bus.py |
| 10 | command gate 보안 | python -c 실행 가능 | 인터프리터 인자 차단 | command_allowlist.py |
| 11 | 서버 재시작 자동 복구 | 수동 API 필요 | bootstrap에서 auto_recover | bootstrap.py |
| 12 | 역방향 호출 제거 | claude_local → executor 직접 호출 | EventBus "block.process_completed" 이벤트 | claude_local.py |
| 13 | 중복 코드 삭제 | ArtifactExistsGate (dead code) | 삭제 | artifact_exists.py |
| 14 | 프리셋 artifacts 경로 | docs/01-plan/ 하드코딩 | brick/projects/{project}/ 구조 | 모든 프리셋 YAML |
| 15 | Building 폴더 구조 | 없음 | projects/{project}/buildings/{feature}/ | ArtifactManager |
| 16 | 통합문서 (BOARD.md) | 없음 | workflow.completed 시 자동 생성 | ArtifactManager |

### 🟡 P1: Building 돌린 후

| # | 항목 | 파일 |
|---|------|------|
| 17 | God Context 타입화 | context dict → WorkflowContext dataclass |
| 18 | executor private 메서드 호출 제거 | engine_bridge.py에서 public API만 사용 |
| 19 | 대시보드 WebSocket + 승인 버튼 | dashboard/ |
| 20 | Codex 어댑터 구현 | codex.py |
| 21 | OpenChrome 어댑터 구현 | 신규 |
| 22 | 산출물 필수 강제 (모든 블록 artifact gate 자동) | gate 기본값 |
| 23 | 복합 조건 (AND/OR) | condition_evaluator.py |
| 24 | 블록 라이브러리 (재사용 템플릿) | 신규 |

---

## 7. 구현 순서

```
Phase 1: 구조 분리 (executor → 모듈 5개)
  → executor.py, preset_loader.py, block_monitor.py, compete_manager.py, bootstrap.py
  → pytest 전체 Green 유지

Phase 2: 산출물 연결 (InputConfig + get_artifacts + 프롬프트)
  → executor 3곳 수정 + claude_local 프롬프트 강화
  → 블록 간 산출물 전달 동작 확인

Phase 3: ArtifactManager + Building 폴더 + 통합문서
  → artifact_manager.py 생성 + EventBus 구독
  → Building 폴더 자동 생성 + BOARD.md 자동 업데이트

Phase 4: 버그 수정 + 보안
  → StateMachine 순수성, BlockInstance 직렬화, EventBus 격리
  → command gate 보안, 서버 자동 복구, 역방향 호출 제거, 중복 삭제

Phase 5: 프리셋 경로 수정 + 정리
  → 모든 프리셋 artifacts → brick/projects/{project}/ 구조
  → 과거 레거시 완전 제거

→ Phase 5 완료 = 첫 Building 돌릴 수 있음
```

---

## 8. 확장성 체크리스트

| 확장 시나리오 | 수정 포인트 | OK? |
|---|---|---|
| 새 Gate 타입 추가 | register_gate() 1곳 | ✅ |
| 새 Link 타입 추가 | register_link() 1곳 | ✅ |
| 새 Adapter 추가 | TeamAdapter 구현 + register() 2곳 | ✅ |
| 새 프리셋(Building) 추가 | YAML 파일 1개 (코드 수정 0) | ✅ |
| 새 프로젝트 추가 | projects/{name}/ 폴더 + project.yaml | ✅ |
| 새 이벤트 구독자 추가 | EventBus.subscribe() (SlackSubscriber 패턴) | ✅ |
| Building 폴더 구조 변경 | ArtifactManager만 수정 (엔진 안 건드림) | ✅ |
| 블록 프롬프트 형식 변경 | claude_local._build_prompt()만 수정 | ✅ |

---

> Decision Log:
> - 결정: ArtifactManager를 EventBus 구독 레이어로 분리
> - 대안: executor 내장
> - 이유: SRP + 패턴 일관성 + 테스트 용이 + executor 비대화 방지
>
> - 결정: executor를 모듈 5개로 분리
> - 대안: 유지 (871줄)
> - 이유: Smith님 "처음부터 구조를 빡세게 잡고 가야 나중에 안 힘들다"
>
> - 결정: Building 단위 폴더
> - 대안: 프로젝트 레벨 플랫
> - 이유: Smith님 "Building 안에 저장되는 게 맞는지" → 맞다
