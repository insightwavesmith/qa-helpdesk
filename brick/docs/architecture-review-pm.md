# 브릭 엔진 v2 아키텍처 리뷰 — PM 관점

> 작성: 모찌 (COO) | 2026-04-05  
> 기반: architecture-brick-engine-v2.md + architecture-review-codex.md + 실제 엔진 코드 직접 확인  
> 범위: 6개 리뷰 관점 + PM 관점 (COO/에이전트/프리셋 YAML)

---

## TL;DR

설계 방향 맞다. Codex 리뷰도 정확하다. **PM 관점에서 추가로 발견한 것은 3가지.**

1. **모듈 5개 분리에 InputResolver가 빠졌다** — block.input 처리 로직이 executor._execute_command()에 인라인으로 들어가면 executor가 다시 비대해진다.
2. **Phase 순서에 의존성 꼬임이 있다** — Phase 1 전에 Phase 4 버그 수정이 선행돼야 한다.
3. **YAML을 COO가 직접 쓰기엔 아직 너무 기술적이다** — 추상화 레이어 하나 더 필요.

---

## 1. 모듈 분리 (executor → 5개) — 적절한가?

### 현재 분리 계획 검토

| 모듈 | 판단 | 비고 |
|------|------|------|
| Executor (지휘관) | ✅ | _execute_command만 남기면 250줄 가능 |
| PresetLoader | ✅ | 이미 클래스로 분리됨. 파일 분리만 하면 됨 |
| BlockMonitor | ✅ | _monitor_block (~120줄) 그대로 분리 |
| CompeteManager | ✅ | _monitor_compete + CompeteGroup/Execution 분리 |
| Bootstrap | ✅ | init_engine 대체 — DI 조립 역할 명확 |

### 🔴 빠진 모듈: InputResolver

```
현재 계획:
  executor._execute_command() → block.input 해석 + context 주입 인라인

문제:
  executor._execute_command()는 이미 StartBlock / RetryAdapter / CompeteStart
  / NotifyCommand / EmitEvent / SaveCheckpoint 6가지를 처리하는 큰 함수.
  여기에 "이전 블록 산출물 경로 찾기 + context 주입"까지 넣으면 또 비대해짐.
```

**제안: `engine/input_resolver.py` 신규**

```python
class InputResolver:
    """
    Block.input → 실제 artifact 경로 목록 반환.
    get_block_inputs(instance, block_id) → list[str]
    """
    def get_block_inputs(self, instance: WorkflowInstance, block_id: str) -> list[str]:
        block_inst = instance.blocks.get(block_id)
        if not block_inst or not block_inst.block.input:
            return []
        
        from_id = block_inst.block.input.from_block
        if not from_id:
            return []
        
        from_inst = instance.blocks.get(from_id)
        if not from_inst:
            return []
        
        # 1순위: 어댑터가 보고한 실제 파일 경로
        # 2순위: YAML done.artifacts 계획 경로
        return from_inst.artifacts or from_inst.block.done.artifacts
```

executor._execute_command()에서는 `self.input_resolver.get_block_inputs(instance, cmd.block_id)`로 한 줄 호출.

### 🟡 AdapterPool도 클래스로 분리 고려

현재: `self.adapter_pool = dict`. 매 블록마다 `adapter.__class__(team_config)` 재생성.  
개선: `AdapterPool.get_or_create(adapter_name, config)` — config 해시 기반 캐싱.  
공수 낮음, 효과 있음. 단 P2로 미뤄도 됨.

**결론**: 5개 분리 + InputResolver = 6개가 맞다. 없으면 executor 다시 비대해짐.

---

## 2. ArtifactManager 설계 — 맞는가? Building 폴더 구조?

### ArtifactManager 설계 ✅

EventBus subscriber 패턴 맞다. Codex 리뷰와 동일한 판단. 추가할 것 없음.

### Building 폴더 구조 — 개선점 2개

#### 문제 1: workflow_id 폴더명이 사람이 읽기 불편하다

```
현재 계획:
  buildings/{workflow_id}/  →  auth-1743832800/

실제로 COO가 보면:
  auth-1743832800/ 이게 뭔지 즉시 알 수 없음
```

**제안: feature + 날짜 + 순번**

```
buildings/
  {feature}-{MMDD}-{seq}/    →  auth-api-0405-1/
    meta.json                    auth-api-0405-2/  (재실행)
```

`meta.json`에 `workflow_id` 보존 (추적용). COO가 폴더 이름만 보고 무슨 Building인지 알 수 있음.

#### 문제 2: TASK.md가 Building 폴더에 자동으로 안 들어간다

설계 문서 Section 4에 `TASK.md`가 Building 폴더 구조에 있는데, 현재 이걸 생성하는 주체가 없다.

```
현재 흐름:
  COO가 API로 start(preset, feature, task) 호출 → task는 string으로 전달
  → Building 폴더에 TASK.md 생성하는 코드 없음

수정:
  ArtifactManager.on_workflow_started() 에서 TASK.md 자동 생성
  내용: task string + 프리셋명 + 시작시각
```

EventBus에 `workflow.started` 이벤트는 이미 있다. ArtifactManager가 이 이벤트도 구독하면 됨.

#### 최종 제안 Building 폴더 구조

```
brick/projects/{project}/buildings/
  {feature}-{MMDD}-{seq}/
    TASK.md              ← workflow.started 시 자동 생성 (ArtifactManager)
    meta.json            ← {workflow_id, preset, feature, started_at, status}
    plan/
      {feature}.plan.md
    design/
      {feature}.design.md
    reports/
      security-{feature}.md
    summary.md           ← workflow.completed 시 자동 생성
    artifact_registry.json
    events.jsonl         ← 이 Building의 이벤트 로그
  
  latest -> {feature}-{MMDD}-{최신seq}  (symlink — 빠른 접근)

brick/projects/{project}/
  BOARD.md               ← 통합 게시판
  project.yaml           ← 프로젝트 설정
```

---

## 3. 블록 간 산출물 전달 — 충분한가?

### 현재 설계 (architecture-brick-engine-v2.md)

sequential input (`block.input.from_block`) 방식. 이전 블록 하나의 산출물을 다음 블록에 전달.

### 🔴 빠진 케이스: 병렬 블록 이후 merge

```yaml
links:
  - {from: design-a, to: review, type: parallel}
  - {from: design-b, to: review, type: parallel}
```

review 블록이 시작될 때 design-a, design-b 두 블록의 산출물을 모두 받아야 함.  
현재 `input.from_block`은 1:1이라 안 됨.

**제안: `input.from_blocks: [design-a, design-b]` (복수형 지원)**

```yaml
blocks:
  - id: review
    input:
      from_blocks: [design-a, design-b]  # 복수 블록 산출물 합산
```

InputResolver에서 `from_block` / `from_blocks` 둘 다 처리하면 됨.

### 🟡 루프 재시도 시 이전 시도 산출물 보존 필요

```
check 블록 → do 블록으로 loop 재시도
do 블록이 2번째 실행될 때 block_inst.artifacts가 초기화되는가?

현재 코드:
  BlockInstance.artifacts = field(default_factory=list)
  retry 시 새 execution_id로 start_block → 이전 artifacts 덮어씀
```

**개선**: retry 시 `block_inst.artifacts_history.append(block_inst.artifacts)` 보존. 디버그 및 감사 추적에 필요.

### 🟡 에이전트가 산출물 경로를 자발적으로 보고하는 메커니즘 없음

현재 흐름:
- 에이전트(claude_local)가 파일 생성
- `adapter.get_artifacts(execution_id)` → 상태 파일에서 읽음
- 상태 파일에 artifacts를 누가 쓰는가? → 에이전트 자신이 써야 함

**현재 claude_local.py 프롬프트**: `"TASK: {what}\n\nCONTEXT: {json}"`

에이전트가 완료 후 어디에 어떤 파일을 만들었는지 상태 파일에 기록하라는 지시가 없음.  
→ `_build_prompt()`에 "완료 후 상태 파일에 artifacts 목록을 기록하라" 지시 추가 필요.

---

## 4. 확장성 체크리스트 — 빠진 시나리오

현재 체크리스트 8개 항목 모두 맞다. 추가할 시나리오:

| 추가 시나리오 | 수정 포인트 | 난이도 |
|---|---|---|
| **Building → Building 트리거** (완료 후 다음 Building 자동 시작) | EventBus "workflow.completed" + Bootstrap에 meta-workflow 설정 | 중 |
| **외부 CI/CD → Building 시작** (GitHub Actions webhook) | webhook adapter 또는 API endpoint 추가 | 낮 |
| **동시 실행 제한** (같은 feature Building 2개 동시 실행 방지) | executor.start()에 중복 체크 + 큐잉 | 낮 |
| **Building 중간 취소** (in-flight adapter 정리) | executor.cancel_workflow() + adapter.cancel() 호환 | 중 |
| **크로스 Building 산출물 참조** (Building B가 Building A 산출물 읽기) | ArtifactManager에 cross-building lookup API | 중 |
| **프리셋 버전 관리** (실행 중 preset 파일 변경 시 isolation) | WorkflowDefinition이 이미 snapshot됨 — 이건 ✅ |  |
| **에이전트 프롬프트 i18n** (다국어 TASK) | claude_local._build_prompt() locale 파라미터 | 낮 |
| **알림 라우팅** (프로젝트별 다른 Slack 채널) | SlackSubscriber에 project → channel 매핑 | 낮 |

**가장 중요한 누락**: `동시 실행 제한`. 같은 feature로 두 Building이 동시에 돌면 BOARD.md와 Building 폴더가 충돌함.

---

## 5. 구현 Phase 순서 — 의존성 꼬임

### 현재 계획의 문제

```
Phase 1: 구조 분리 (executor → 모듈 5개)
Phase 2: 산출물 연결 (InputConfig + get_artifacts)
Phase 3: ArtifactManager + Building 폴더
Phase 4: 버그 수정 + 보안
Phase 5: 프리셋 경로 수정 + 정리
```

**꼬임 1**: Phase 4의 "서버 재시작 자동 복구 → bootstrap에서 auto_recover"가  
Phase 1의 bootstrap.py 신규 생성과 겹친다.  
Phase 1에서 bootstrap.py 만들 때 auto_recover도 같이 넣어야 함.

**꼬임 2**: Phase 2 (InputConfig 활성화)를 먼저 하면  
Phase 4의 "BlockInstance 직렬화에 input 소실 버그"가 재시작 시 input config를 날린다.  
→ Phase 2 전에 직렬화 버그를 반드시 먼저 고쳐야 함.

**꼬임 3**: Phase 5 (프리셋 경로 수정)를 Phase 3 이후에 하면  
ArtifactManager가 Building 폴더에 파일을 복사할 때 기존 경로 구조를 기반으로 동작한다.  
경로가 나중에 바뀌면 ArtifactManager 로직도 수정해야 함.

### 수정된 Phase 순서

```
Phase 0 (전제조건, 2시간): 크리티컬 버그 수정
  - BlockInstance to_dict/from_dict에 input 추가 (workflow.py)
  - artifact gate context["artifacts"] 키 추가 (executor.py)
  - EventBus 예외 격리 (event_bus.py)
  - StateMachine _extra_link_commands 순수화 (state_machine.py)
  → pytest 전체 Green 유지

Phase 1 (4시간): executor → 6개 모듈 분리
  - executor.py + preset_loader.py + block_monitor.py
  - compete_manager.py + input_resolver.py + bootstrap.py (auto_recover 포함)
  → pytest 전체 Green 유지

Phase 2 (3시간): 산출물 전달 활성화
  - InputConfig 활성화 (input_resolver.py)
  - adapter.get_artifacts() 호출 (executor.py)
  - claude_local 프롬프트 강화 (artifacts 보고 지시 추가)
  → 블록 간 산출물 전달 동작 확인

Phase 3 (4시간): 프리셋 경로 + ArtifactManager
  - 모든 프리셋 artifacts 경로 → Building 폴더 구조로 수정 (먼저!)
  - artifact_manager.py 생성 + EventBus 구독
  - Building 폴더 자동 생성 + BOARD.md

Phase 4 (2시간): 보안 + 정리
  - command gate 보안 (command_allowlist.py)
  - 역방향 호출 제거 (claude_local → EventBus)
  - ArtifactExistsGate dead code 삭제
  - WorkflowInstance ID → UUID4

→ Phase 4 완료 = 첫 Building 돌릴 수 있음
```

**핵심 변경**: Phase 4 버그 수정 일부를 Phase 0으로 선행. Phase 5(프리셋 경로)를 Phase 3 앞으로.

---

## 6. 놓친 구조 문제

Codex 리뷰에서 발견 못한 추가 사항:

### 🔴 preset extends + overrides가 gate/team 변경을 지원 안 함

```python
# executor.py _merge() 현재 구현
for block_id, block_overrides in overrides.items():
    if block_id in block_map:
        block = block_map[block_id]
        if "what" in block_overrides:
            block.what = block_overrides["what"]
        # ← gate, done.artifacts, team config 변경 미지원
```

`extends` 쓰는 프리셋에서 특정 블록의 gate 타입을 바꾸거나 team adapter를 바꾸려면  
현재 방법이 없음. overrides를 전체 블록으로 취급하면 됨.

### 🔴 완료 조건이 YAML plan 경로 = 실제 파일 경로라고 가정

```yaml
done:
  artifacts: ["brick/projects/{project}/plans/{feature}.plan.md"]
```

에이전트가 이 경로 외에 다른 이름으로 파일을 만들면 gate가 실패한다.  
현재 `artifact` gate는 정확한 경로 일치만 검사.

**개선 방향**: glob 패턴 지원.

```yaml
done:
  artifacts: ["brick/projects/{project}/plans/*.plan.md"]  # 글로브 허용
```

### 🟡 Human adapter timeout 이후 자동 에스컬레이션 경로 없음

```yaml
design-review:
  adapter: human
  config:
    timeout_seconds: 86400  # 24시간 타임아웃
```

타임아웃 후 어디로? `on_timeout: escalate` 설정이 ApprovalConfig에 있지만  
실제로 에스컬레이션하는 코드가 없다. human adapter가 타임아웃되면 그냥 gate_failed로 떨어짐.

**수정**: ApprovalConfig.on_timeout 처리 로직 (에스컬레이션 → 다른 승인자 / auto_approve).

### 🟡 WorkflowInstance.context 오염 위험

Codex 리뷰의 "God Context Dict" 문제 외에 추가:  
- 한 블록이 context에 쓴 값이 이후 모든 블록의 condition 평가에 영향을 줌
- `reject_count`가 쌓이면 영원히 context에 남아 다음 loop에서 잘못된 조건 판단 가능
- 루프 횟수 `_loop_{a}_{b}`가 무한정 쌓임

**단기 수정**: `ContextKey` 상수 + TTL 정책 (Codex 제안).  
**중기**: `BlockContext` (블록 로컬) vs `WorkflowContext` (전역) 분리.

---

## PM 관점

### COO (TASK 작성자) 입장

**현재 상태**: YAML을 직접 써야 하거나 API를 직접 호출해야 함.

**불편한 것들:**

1. **adapter 이름을 COO가 알아야 함**  
   `claude_local`, `claude_agent_teams`, `human` — 기술적 이름.  
   COO 입장에서는 "PM팀", "CTO팀", "내가 직접" 이렇게 표현하고 싶음.  
   **제안**: 팀 별칭 레이어 (`team_aliases` in project.yaml)

   ```yaml
   # project.yaml
   team_aliases:
     pm-team: {adapter: claude_local, config: {role: pm-lead, ...}}
     cto-team: {adapter: claude_local, config: {role: cto-lead, ...}}
     coo: {adapter: human, config: {assignee: coo}}
   ```
   프리셋 YAML에선:
   ```yaml
   teams:
     plan: pm-team
     design: pm-team
     do: cto-team
   ```

2. **block.input을 COO가 선언해야 함 (현재 아무 preset에도 없음)**  
   `feature-standard.yaml`, `feature-coo-review.yaml` 모두 `input:` 필드 없음.  
   "이전 블록 산출물이 자동으로 넘어간다"는 게 기본 동작이어야 함.  
   **제안**: sequential 링크에서 `input`이 자동으로 이전 블록을 가리키도록 기본값.

3. **TASK 내용이 `what:` 필드에 인라인으로만 작성 가능**  
   `what: "요구사항 분석 + Plan 문서 작성"` — 한 줄짜리.  
   상세한 TASK 지시를 쓰려면 YAML이 길어짐.  
   **개선**: `what` 외에 `task_file:` 지원.

   ```yaml
   blocks:
     - id: plan
       task_file: "buildings/auth-api/TASK.md"  # 별도 파일 참조
   ```

4. **Building 진행 상태 확인 방법이 대시보드뿐**  
   BOARD.md가 완성되면 파일로 확인 가능. 근데 현재 없음.

**COO 관점 점수**: 6/10. 기술적 지식 없이 YAML을 쓰기 어렵다.

---

### 에이전트 (PM/CTO) 입장

**현재 프롬프트**:
```
TASK: {what}

CONTEXT:
{"workflow_id": "auth-api-1743...", "block_id": "plan", "block_what": "...",
 "block_type": "Plan", "project_context": {...}, "team_config": {...},
 "done_artifacts": [...], ...}
```

**불편한 것들:**

1. **CONTEXT가 raw JSON dump**  
   에이전트가 `project_context` 안에 뭐가 있는지 파싱해서 찾아야 함.  
   이전 블록 산출물 경로도 `done_artifacts` 키를 알아야 접근 가능.  
   **개선**: 구조화된 프롬프트 섹션.
   ```
   TASK: 상세 설계 + TDD 케이스

   이전 블록 산출물:
   - Plan: brick/projects/bscamp/buildings/auth-api-0405-1/plan/auth-api.plan.md

   프로젝트: bscamp
   Building: auth-api-0405-1
   산출물 저장 위치: brick/projects/bscamp/buildings/auth-api-0405-1/design/

   완료 시 아래 파일을 생성해야 합니다:
   - brick/projects/bscamp/buildings/auth-api-0405-1/design/auth-api.design.md
   ```

2. **에이전트가 파일을 어디에 써야 할지 모름**  
   `done.artifacts`에 경로가 있지만 에이전트 프롬프트에 명시적으로 포함되지 않음.  
   에이전트가 엉뚱한 경로에 파일을 만들면 gate가 실패.

3. **reject_reason 주입은 잘 됨 ✅**  
   claude_local.py에 이미 구현됨. 반려 사유가 프롬프트에 포함.

4. **Building 폴더 구조를 에이전트가 모름**  
   에이전트는 "어디에 파일을 만들어야 하는지" 지시받아야 함.  
   ArtifactManager가 Building 폴더를 만들어도, 에이전트가 거기에 쓰지 않으면 소용없음.

**에이전트 관점 점수**: 5/10. 산출물 경로 지시와 Building 폴더 인식이 빠져있다.

---

### 프리셋 YAML 작성 — 직관적인가?

**잘 된 것:**

- `{project}`, `{feature}` 변수 치환 ✅
- `links:` 섹션의 `{from, to, type}` 구조 직관적 ✅
- `extends:` 상속 개념 ✅
- `gate.handlers[].type` 확장 가능 ✅

**개선 필요:**

1. **`$schema`가 뭔지 설명 없음**  
   매 YAML 첫 줄에 `$schema: brick/preset-v2`가 있는데, 이게 검증에 쓰이는지 그냥 메타인지 알 수 없음.

2. **`input:` 필드가 기존 preset에 하나도 없음**  
   블록 간 산출물 전달의 핵심인데, 예시가 없어서 YAML 작성자가 쓸 줄 모름.  
   `feature-standard.yaml`에 `design` 블록에 `input: {from_block: plan}` 예시 추가 필요.

3. **condition 문법이 비직관적**  
   ```yaml
   condition: {match_rate_below: 90}  # 이게 뭔지?
   condition: {review_rejected: true}  # boolean? 연산자?
   ```
   문서화 없이 코드를 봐야 이해 가능.  
   **개선 제안**: `when:` 키워드 또는 YAML comment로 설명 추가.

4. **`done.artifacts`와 실제 파일이 연결된다는 게 안 보임**  
   "에이전트가 이 경로에 파일을 만들어야 gate를 통과한다"는 게 YAML 구조에서 바로 보이지 않음.  
   `done.artifacts`가 `gate`와 어떻게 연결되는지 preset에서 명시적으로 보이면 좋음.

5. **팀 설정에 기술적 세부사항이 너무 많음**  
   ```yaml
   do:
     adapter: claude_local
     config:
       model: claude-opus-4-6
       dangerouslySkipPermissions: true  # COO가 이걸 왜 알아야?
       maxTurns: 100
   ```
   **개선**: team_aliases 레이어 (앞서 제안)로 기술적 세부사항 숨기기.

**YAML 직관성 점수**: 6/10. 개발자는 이해하지만 COO가 직접 쓰기엔 barrier 있음.

---

## 종합 판단

| 항목 | 판단 | 우선순위 |
|------|------|---------|
| 3축 구조 설계 | ✅ 올바름 | — |
| executor 5개 분리 | ✅ 맞는데 InputResolver 추가 필요 | P1 |
| ArtifactManager EventBus 패턴 | ✅ 올바름 | — |
| Building 폴더 이름 가독성 | 🟡 workflow_id → feature-MMDD-seq 개선 | P1 |
| TASK.md 자동 생성 | 🔴 누락 | P1 |
| Phase 순서 의존성 | 🔴 Phase 0 (버그 선행) 필요 | P0 |
| 병렬 블록 → merge input | 🔴 설계 미포함 | P2 |
| preset extends 제한 | 🟡 gate/team override 안 됨 | P2 |
| COO YAML 작성 편의 | 🟡 team_aliases 레이어 필요 | P2 |
| 에이전트 프롬프트 구조화 | 🟡 산출물 경로 명시 필요 | P1 |
| 동시 실행 제한 | 🔴 체크리스트 누락 | P1 |
| Human adapter 에스컬레이션 | 🟡 코드 없음 | P2 |

### 다음 액션

**P0 (지금 바로, ~2시간)**  
→ Phase 0 버그 수정 4개 (BlockInstance 직렬화, artifact gate context 키, EventBus 격리, StateMachine 순수화)

**P1 (이번 스프린트)**  
→ InputResolver 추가 + executor 6개 분리  
→ 에이전트 프롬프트 구조화 (산출물 경로 명시)  
→ ArtifactManager + Building 폴더 (feature-MMDD-seq 이름 + TASK.md 자동 생성)  
→ 동시 실행 제한 로직

**P2 (다음 스프린트)**  
→ team_aliases 레이어  
→ 병렬 블록 input.from_blocks 지원  
→ preset extends gate/team override

---

> COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
