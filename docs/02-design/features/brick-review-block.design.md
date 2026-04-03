# Design: 회고 블록 R-Brick (Review Block — 에이전트 자가개선 루프)

> **피처**: brick-review-block (R-Brick)
> **레벨**: L2-기능
> **작성**: PM | 2026-04-03
> **선행**: brick-pdca-preset.design.md (Learn 블록), brick-architecture.design.md (3축 구조)
> **Smith님 결정**: T-PDCA에 Review 블록 추가 → Learn 이후 자동 회고 → Learning Harness 연결

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | PDCA 사이클 종료 후 자동 회고를 수행하여, 다음 PDCA에 학습을 반영하는 자가개선 루프 구축 |
| **핵심 변경** | Review 블록 타입 신규, LearningHarness 연동, 순환 Link(learn→review→다음 PDCA) |
| **현행 문제** | Learn 블록이 보고서만 작성하고 끝남. 교훈이 다음 PDCA에 반영되지 않음 |
| **수정 범위** | Block 타입 추가, ReviewCollector, LearningHarness, 프리셋 YAML |
| **TDD** | RB-001 ~ RB-024 (24건) |

| 관점 | 내용 |
|------|------|
| **Problem** | Learn 블록에서 회고 문서를 쓰지만, 그 교훈이 다음 TASK에 자동 반영되지 않음. 같은 실수 반복 |
| **Solution** | Learn 이후 Review 블록이 교훈을 구조화 → LearningHarness가 제안 → 승인 → CLAUDE.md/memory/hook에 반영 |
| **Core Value** | "PDCA → R → 다음 PDCA" — 매 사이클마다 시스템이 스스로 개선되는 순환 구조 |

---

## 1. 현행 문제 분석

### 1.1 현행 PDCA 종료 흐름

```
[Plan] → [Design] → [Do] → [Check] → [Act] → [Learn]
                                                  ↓
                                          report.md 작성
                                                  ↓
                                              (끝. 다음 TASK와 단절)
```

| 문제 | 영향 |
|------|------|
| **교훈 단절** | report.md에 쓴 교훈이 다음 TASK에 전달되지 않음 |
| **같은 실수 반복** | postmortem에 기록해도 에이전트가 자동으로 읽지 않음 (세션 시작 hook에 의존) |
| **개선 제안 실종** | "다음엔 이렇게 하자"가 문서에만 있고, 코드/설정에 반영 안 됨 |
| **수동 의존** | memory 업데이트, hook 수정, CLAUDE.md 갱신 = 전부 사람이 수동으로 해야 함 |

### 1.2 목표 흐름

```
[Plan] → [Design] → [Do] → [Check] → [Act] → [Learn] → [Review]
                                                            ↓
                                                    ┌───────────────┐
                                                    │ ReviewCollector│
                                                    │ (교훈 수집)     │
                                                    └───────┬───────┘
                                                            ↓
                                                    ┌───────────────┐
                                                    │ LearningHarness│
                                                    │ (제안 생성)     │
                                                    └───────┬───────┘
                                                            ↓
                                                    ┌───────────────┐
                                                    │ 승인 (자동/수동)│
                                                    └───────┬───────┘
                                                            ↓
                                                    반영: memory / hook / CLAUDE.md
                                                            ↓
                                                    다음 PDCA에 학습 적용
```

---

## 2. Review 블록 설계

### 2.1 블록 정의

```python
# Review 블록은 기존 Block 모델을 그대로 사용.
# type: "review_retrospective" (기존 "review"와 구분)

Block(
    id="review",
    type="review_retrospective",
    what="PDCA 회고 — 교훈 수집 + 개선 제안 + 반영",
    done=DoneCondition(
        artifacts=["docs/05-review/features/{feature}.review.md"],
    ),
    gate=GateConfig(
        handlers=[
            GateHandler(type="command", command="test -f docs/05-review/features/{feature}.review.md"),
        ],
    ),
)
```

### 2.2 Review 블록의 3단계

| 단계 | 이름 | 수행자 | 산출물 |
|------|------|--------|--------|
| **R1** | Collect | 에이전트 (ReviewCollector) | 구조화된 교훈 JSON |
| **R2** | Propose | 에이전트 (LearningHarness) | 개선 제안 목록 |
| **R3** | Apply | 자동 + Smith님 승인 | memory/hook/CLAUDE.md 변경 |

---

## 3. R1: ReviewCollector — 교훈 수집

### 3.1 수집 소스

ReviewCollector는 해당 PDCA 사이클에서 발생한 모든 데이터를 수집·분석한다.

| 소스 | 경로 | 수집 내용 |
|------|------|----------|
| **Plan 문서** | `docs/01-plan/features/{feature}.plan.md` | 원래 계획 |
| **Design 문서** | `docs/02-design/features/{feature}.design.md` | 설계 의도 |
| **Gap 분석** | `docs/03-analysis/features/{feature}.gap.md` | 설계 vs 구현 차이 |
| **보고서** | `docs/04-report/features/{feature}.report.md` | 최종 결과 |
| **Git 히스토리** | `git log --oneline --since={start_date}` | 커밋 이력 (반복 수정 패턴) |
| **Gate 로그** | `.bkit/state/gate-results/{execution_id}.json` | Gate 통과/실패 이력 |
| **Block 이벤트** | `.bkit/state/events/{execution_id}.jsonl` | 블록 전환 타임라인 |
| **에이전트 오류** | `.bkit/runtime/block-log.json` | hook 차단 로그 |

### 3.2 수집 결과 구조

```typescript
interface ReviewData {
  feature: string;
  execution_id: string;
  cycle_duration_minutes: number;

  // 계획 vs 실제
  plan_vs_actual: {
    planned_blocks: number;
    actual_blocks: number;       // 재시도 포함
    loop_count: number;          // check→do 루프 횟수
    rejected_count: number;      // 반려 횟수
  };

  // Gate 분석
  gate_results: {
    total: number;
    passed_first_try: number;
    failed_then_passed: number;
    failed_permanently: number;
  };

  // 시간 분석
  time_analysis: {
    longest_block: { id: string; duration_minutes: number };
    bottleneck: string;          // 가장 오래 걸린 단계
    idle_time_minutes: number;   // 대기 시간 합계
  };

  // 교훈 (LLM이 추출)
  lessons: Lesson[];
}

interface Lesson {
  id: string;                    // "LS-001"
  category: LessonCategory;
  severity: "critical" | "major" | "minor";
  description: string;           // "Design TDD 케이스에 에러 핸들링 시나리오 누락"
  evidence: string;              // "Gap 분석에서 3건 미커버"
  suggestion: string;            // "TDD 체크리스트에 에러 핸들링 항목 추가"
}

type LessonCategory =
  | "design_gap"          // 설계 누락
  | "implementation_bug"  // 구현 버그 패턴
  | "process_bottleneck"  // 프로세스 병목
  | "tool_misuse"         // 도구 오용
  | "communication_fail"  // 팀 간 소통 실패
  | "gate_weakness"       // Gate가 잡지 못한 문제
  | "positive_pattern";   // 잘한 점 (반복할 것)
```

### 3.3 ReviewCollector 구현

```python
# brick/brick/review/collector.py

class ReviewCollector:
    """PDCA 사이클의 교훈을 구조화하여 수집."""

    def __init__(self, llm_client, workspace_root: str):
        self.llm = llm_client
        self.root = workspace_root

    async def collect(self, execution_id: str, feature: str) -> ReviewData:
        """1개 PDCA 사이클의 데이터를 수집·분석."""

        # 1. 산출물 수집
        artifacts = await self._gather_artifacts(feature)

        # 2. Gate 로그 수집
        gate_logs = await self._gather_gate_logs(execution_id)

        # 3. 블록 이벤트 수집
        events = await self._gather_events(execution_id)

        # 4. Git 히스토리 수집
        git_log = await self._gather_git_log(feature)

        # 5. LLM에게 교훈 추출 요청
        lessons = await self._extract_lessons(artifacts, gate_logs, events, git_log)

        # 6. 시간 분석
        time_analysis = self._analyze_time(events)

        return ReviewData(
            feature=feature,
            execution_id=execution_id,
            cycle_duration_minutes=time_analysis.total_minutes,
            plan_vs_actual=self._compare_plan_actual(events),
            gate_results=self._summarize_gates(gate_logs),
            time_analysis=time_analysis,
            lessons=lessons,
        )

    async def _extract_lessons(self, artifacts, gate_logs, events, git_log) -> list[Lesson]:
        """LLM을 사용하여 교훈 추출."""
        prompt = f"""
        다음 PDCA 사이클 데이터를 분석하여 교훈을 추출하라.

        [산출물]
        {artifacts}

        [Gate 로그]
        {gate_logs}

        [블록 이벤트]
        {events}

        [Git 이력]
        {git_log}

        각 교훈은 다음 형식으로:
        - category: design_gap|implementation_bug|process_bottleneck|tool_misuse|communication_fail|gate_weakness|positive_pattern
        - severity: critical|major|minor
        - description: 무엇이 문제였는가
        - evidence: 어떤 데이터에서 발견했는가
        - suggestion: 다음에 어떻게 개선할 것인가

        JSON 배열로 반환.
        """
        return await self.llm.evaluate(prompt, model="sonnet")
```

---

## 4. R2: LearningHarness — 개선 제안

### 4.1 제안 타입

ReviewCollector가 수집한 교훈을 **실행 가능한 개선 제안**으로 변환한다.

```typescript
interface Proposal {
  id: string;                    // "PR-001"
  lesson_id: string;             // "LS-001" (교훈 참조)
  type: ProposalType;
  target: string;                // 변경 대상 파일/위치
  description: string;           // 제안 내용
  diff_preview: string;          // 변경 미리보기 (있으면)
  auto_applicable: boolean;      // 자동 적용 가능 여부
  risk: "low" | "medium" | "high";
  requires_approval: boolean;    // Smith님 승인 필요 여부
}

type ProposalType =
  | "memory_update"       // agent memory에 교훈 저장
  | "hook_improvement"    // hook 스크립트 개선
  | "gate_addition"       // Gate 조건 추가/강화
  | "preset_adjustment"   // 프리셋 YAML 수정
  | "claudemd_update"     // CLAUDE.md 규칙 추가
  | "tdd_addition"        // TDD 케이스 추가 (재발 방지)
  | "postmortem_entry";   // postmortem 기록
```

### 4.2 제안 생성 로직

```python
# brick/brick/review/harness.py

class LearningHarness:
    """교훈을 실행 가능한 개선 제안으로 변환."""

    # 카테고리 → 제안 타입 매핑 (우선순위 순)
    CATEGORY_TO_PROPOSALS = {
        "design_gap":          ["tdd_addition", "gate_addition"],
        "implementation_bug":  ["tdd_addition", "memory_update"],
        "process_bottleneck":  ["preset_adjustment", "hook_improvement"],
        "tool_misuse":         ["claudemd_update", "memory_update"],
        "communication_fail":  ["hook_improvement", "memory_update"],
        "gate_weakness":       ["gate_addition", "tdd_addition"],
        "positive_pattern":    ["memory_update"],                    # 잘한 점은 기억에 저장
    }

    # 자동 적용 가능 여부
    AUTO_APPLICABLE = {
        "memory_update": True,        # memory 파일 자동 생성
        "postmortem_entry": True,     # postmortem 자동 추가
        "tdd_addition": False,        # 코드 변경 → 승인 필요
        "hook_improvement": False,    # hook 수정 → 승인 필요
        "gate_addition": False,       # Gate 변경 → 승인 필요
        "preset_adjustment": False,   # 프리셋 변경 → 승인 필요
        "claudemd_update": False,     # CLAUDE.md 변경 → 승인 필요
    }

    async def propose(self, review_data: ReviewData) -> list[Proposal]:
        """교훈에서 개선 제안 생성."""
        proposals = []
        for lesson in review_data.lessons:
            proposal_types = self.CATEGORY_TO_PROPOSALS.get(lesson.category, [])
            for ptype in proposal_types:
                proposal = await self._generate_proposal(lesson, ptype)
                proposal.auto_applicable = self.AUTO_APPLICABLE.get(ptype, False)
                proposal.requires_approval = not proposal.auto_applicable
                proposals.append(proposal)
        return proposals
```

### 4.3 승인 정책

| 제안 타입 | risk | 자동 적용 | 승인 필요 |
|-----------|------|----------|----------|
| `memory_update` | low | O | X |
| `postmortem_entry` | low | O | X |
| `tdd_addition` | medium | X | O (CTO) |
| `hook_improvement` | medium | X | O (Smith님) |
| `gate_addition` | medium | X | O (Smith님) |
| `preset_adjustment` | high | X | O (Smith님) |
| `claudemd_update` | high | X | O (Smith님) |

---

## 5. R3: Apply — 제안 반영

### 5.1 자동 반영 (auto_applicable=true)

```python
# brick/brick/review/applier.py

class ProposalApplier:
    """승인된 제안을 실제로 반영."""

    async def apply_memory_update(self, proposal: Proposal) -> None:
        """agent memory에 교훈 저장."""
        memory_dir = Path.home() / ".claude/projects" / project_key / "memory"
        filename = f"lesson_{proposal.lesson_id.lower()}.md"
        content = f"""---
name: {proposal.description[:50]}
description: {proposal.description}
type: feedback
---

{proposal.description}

**Why:** {proposal.diff_preview}
**How to apply:** 다음 PDCA에서 {proposal.target} 확인
"""
        (memory_dir / filename).write_text(content)
        # MEMORY.md에 인덱스 추가
        self._append_to_memory_index(filename, proposal.description)

    async def apply_postmortem(self, proposal: Proposal) -> None:
        """postmortem/index.json에 항목 추가."""
        index_path = Path("docs/postmortem/index.json")
        index = json.loads(index_path.read_text())
        index.append({
            "id": proposal.id,
            "date": datetime.now().isoformat(),
            "feature": proposal.target,
            "lesson": proposal.description,
            "auto_generated": True,
            "source": "r-brick",
        })
        index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False))
```

### 5.2 수동 반영 (requires_approval=true)

```
LearningHarness 제안 생성
  → 대시보드 /reviews/{execution_id}/proposals 에 표시
  → Smith님 확인:
    - [승인] → ProposalApplier가 실행
    - [반려] → 사유 기록, 적용 안 함
    - [수정 후 승인] → 제안 내용 수정 → 적용

┌─────────────────────────────────────────────┐
│  🔄 회고 제안: {feature}                      │
│                                             │
│  PR-001 [memory_update] ✅ 자동 적용됨        │
│  PR-002 [tdd_addition] ⏳ 승인 대기           │
│    "에러 핸들링 TDD 케이스 3건 추가"            │
│    [승인] [반려] [수정]                        │
│  PR-003 [gate_addition] ⏳ 승인 대기           │
│    "Design Gate에 에러 시나리오 체크 추가"       │
│    [승인] [반려] [수정]                        │
│                                             │
│  자동 적용: 1건 | 승인 대기: 2건 | 반려: 0건    │
└─────────────────────────────────────────────┘
```

---

## 6. 순환 구조: PDCA → R → 다음 PDCA

### 6.1 학습 전파 메커니즘

```
PDCA 사이클 A (feature-a)
  → Learn → Review
    → 교훈: "TDD에 에러 핸들링 누락"
    → 제안: memory_update + tdd_addition
    → 반영: memory에 "TDD 작성 시 에러 핸들링 필수 포함" 저장
    
PDCA 사이클 B (feature-b) — 다음 TASK
  → Plan 블록 시작
    → 세션 시작 시 memory 로드
    → "TDD 작성 시 에러 핸들링 필수 포함" 교훈 활성화
    → Plan 문서에 에러 핸들링 항목 포함
  → Design 블록
    → TDD 케이스에 에러 핸들링 시나리오 자동 포함
  → 같은 실수 방지
```

### 6.2 학습 전파 경로

| 제안 타입 | 반영 대상 | 다음 PDCA에서의 효과 |
|-----------|----------|---------------------|
| `memory_update` | `~/.claude/projects/.../memory/` | 세션 시작 시 자동 로드 → 에이전트 행동 변경 |
| `claudemd_update` | `CLAUDE.md` | 에이전트 규칙으로 강제 |
| `hook_improvement` | `.bkit/hooks/` | hook이 자동 차단/유도 |
| `gate_addition` | 프리셋 YAML gate 섹션 | Gate가 자동 검증 |
| `tdd_addition` | `__tests__/` | 회귀 테스트로 재발 방지 |
| `preset_adjustment` | `.bkit/presets/` | 프로세스 자체가 변경 |

### 6.3 순환 Link

```yaml
# 프리셋 YAML에서 review → 다음 PDCA 연결은 하지 않는다.
# Review 블록이 완료되면 현재 워크플로우는 COMPLETED.
# 다음 PDCA는 새 워크플로우로 시작되며, memory/hook/gate 변경이 자동 적용.

# 즉, 순환은 "워크플로우 내부 Link"가 아니라 "시스템 상태 변경"으로 달성.
#
# [PDCA-A] → Learn → Review → (memory/hook/gate 변경) → [PDCA-A COMPLETED]
#                                                              ↓
# [PDCA-B 시작] → (변경된 memory/hook/gate가 적용된 상태로 시작)
```

---

## 7. 프리셋 YAML

### 7.1 t-pdca-l2 확장 (Review 블록 포함)

```yaml
$schema: brick/preset-v2
name: "T-PDCA L2 + Review"
description: "일반 기능 개발 — Plan + Design + Do + Check + Act + Learn + Review"
level: 2

blocks:
  - id: plan
    type: Plan
    what: "요구사항 분석 + Plan 문서 작성"
    done:
      artifacts: ["docs/01-plan/features/{feature}.plan.md"]

  - id: design
    type: Design
    what: "상세 설계 + TDD 케이스"
    done:
      artifacts: ["docs/02-design/features/{feature}.design.md"]

  - id: do
    type: Do
    what: "구현"
    done:
      artifacts: []
      metrics: {tsc_errors: 0, build_pass: true}

  - id: check
    type: Check
    what: "Gap 분석"
    done:
      metrics: {match_rate: 90}

  - id: act
    type: Act
    what: "배포 + 보고"
    done:
      artifacts: []

  - id: learn
    type: Custom
    what: "회고 문서 작성"
    done:
      artifacts: ["docs/04-report/features/{feature}.report.md"]

  - id: review
    type: ReviewRetrospective
    what: "PDCA 회고 — 교훈 수집 + 개선 제안 + 반영"
    done:
      artifacts: ["docs/05-review/features/{feature}.review.md"]
    gate:
      handlers:
        - type: command
          command: "test -f docs/05-review/features/{feature}.review.md"
          description: "회고 문서 존재 확인"
        - type: prompt
          prompt: |
            회고 문서 {review_artifact}를 검토하라.
            확인 항목:
            (1) 교훈이 1건 이상 존재하는가
            (2) 각 교훈에 evidence가 있는가
            (3) 개선 제안이 구체적인가
            verdict: pass/fail
          threshold: 0.7
          description: "회고 품질 검증"

links:
  - {from: plan, to: design, type: sequential}
  - {from: design, to: do, type: sequential}
  - {from: do, to: check, type: sequential}
  - {from: check, to: do, type: loop, condition: {match_rate_below: 90}, max_retries: 3}
  - {from: check, to: act, type: sequential}
  - {from: act, to: learn, type: sequential}
  - {from: learn, to: review, type: sequential}

teams:
  plan: {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  design: {adapter: claude_agent_teams, config: {session: sdk-pm, role: PM_LEADER}}
  do: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  check: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  act: {adapter: claude_agent_teams, config: {session: sdk-cto, role: CTO_LEADER}}
  learn: {adapter: claude_agent_teams, config: {session: sdk-coo, role: COO}}
  review: {adapter: claude_agent_teams, config: {session: sdk-coo, role: COO}}
```

### 7.2 CEO 승인 + Review 통합 프리셋

두 설계를 합치면:

```yaml
$schema: brick/preset-v2
name: "T-PDCA L2 Full"
description: "전체 기능 — Plan + Design + COO 검토 + CEO 승인 + Do + Check + Act + Learn + Review"
level: 2

blocks:
  # Plan → Design → COO 검토 → CEO 승인 → Do → Check → Act → Learn → Review
  # (8블록)

links:
  - {from: plan, to: design, type: sequential}
  - {from: design, to: coo_review, type: sequential}
  - {from: coo_review, to: ceo_approval, type: sequential}
  - {from: ceo_approval, to: do, type: sequential}
  - {from: ceo_approval, to: design, type: loop, condition: {approval_status: rejected}, max_retries: 3}
  - {from: do, to: check, type: sequential}
  - {from: check, to: do, type: loop, condition: {match_rate_below: 90}, max_retries: 3}
  - {from: check, to: act, type: sequential}
  - {from: act, to: learn, type: sequential}
  - {from: learn, to: review, type: sequential}
```

---

## 8. 회고 문서 포맷

### 8.1 docs/05-review/features/{feature}.review.md

```markdown
# Review: {feature}

> 생성: R-Brick | {date}
> 실행: {execution_id}
> 소요: {duration}분

## 사이클 요약

| 항목 | 값 |
|------|-----|
| 블록 수 | {planned} 계획 / {actual} 실제 |
| 루프 횟수 | {loop_count}회 (check→do) |
| Gate 통과율 | {pass_rate}% (첫 시도 통과) |
| 병목 | {bottleneck_block} ({bottleneck_minutes}분) |

## 교훈

### LS-001: {description}
- **카테고리**: {category}
- **심각도**: {severity}
- **근거**: {evidence}
- **제안**: {suggestion}

### LS-002: ...

## 개선 제안

| ID | 타입 | 대상 | 상태 |
|----|------|------|------|
| PR-001 | memory_update | ~/.claude/.../memory/ | ✅ 자동 적용 |
| PR-002 | tdd_addition | __tests__/ | ⏳ 승인 대기 |

## 메타

- 수집 소스: plan.md, design.md, gap.md, report.md, git log, gate logs
- LLM 모델: sonnet (교훈 추출), haiku (요약)
```

---

## 9. 수정 파일 목록

| 파일 | 변경 | 내용 |
|------|------|------|
| `brick/brick/review/__init__.py` | 신규 | 모듈 초기화 |
| `brick/brick/review/collector.py` | 신규 | ReviewCollector — 교훈 수집 |
| `brick/brick/review/harness.py` | 신규 | LearningHarness — 개선 제안 생성 |
| `brick/brick/review/applier.py` | 신규 | ProposalApplier — 제안 반영 |
| `brick/brick/review/models.py` | 신규 | ReviewData, Lesson, Proposal 모델 |
| `brick/brick/presets/t-pdca-l2.yaml` | 수정 | learn → review 링크 추가 |
| `brick/brick/presets/t-pdca-l3.yaml` | 수정 | learn → review 링크 추가 |
| `dashboard/server/api/brick/reviews.ts` | 신규 | 회고 API 엔드포인트 |
| `dashboard/src/pages/brick/ReviewPage.tsx` | 신규 | 회고 대시보드 UI |

---

## 10. TDD 케이스

### 10.1 ReviewCollector

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| RB-001 | 정상 수집 | 모든 산출물 존재 | ReviewData 반환, lessons >= 1건 |
| RB-002 | Gap 문서 없음 | gap.md 부재 | 수집 성공 (gap 제외), 경고 로그 |
| RB-003 | Gate 로그 없음 | gate-results 비어있음 | gate_results.total = 0 |
| RB-004 | Git 이력 없음 | 커밋 0건 | git_log 빈 배열 |
| RB-005 | 루프 3회 발생 사이클 | check→do 3회 반복 | plan_vs_actual.loop_count = 3 |
| RB-006 | 병목 분석 | do 블록 60분, 나머지 10분 | time_analysis.bottleneck = "do" |

### 10.2 LearningHarness

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| RB-007 | design_gap 교훈 | category=design_gap | tdd_addition + gate_addition 제안 |
| RB-008 | positive_pattern 교훈 | category=positive_pattern | memory_update 제안만 |
| RB-009 | 자동 적용 가능 제안 | type=memory_update | auto_applicable=true |
| RB-010 | 수동 승인 필요 제안 | type=claudemd_update | requires_approval=true, risk=high |
| RB-011 | 교훈 0건 | lessons=[] | proposals=[] (빈 배열) |

### 10.3 ProposalApplier

| ID | 시나리오 | 입력 | 기대 결과 |
|----|---------|------|----------|
| RB-012 | memory_update 적용 | proposal(memory_update) | memory 파일 생성 + MEMORY.md 인덱스 추가 |
| RB-013 | postmortem 적용 | proposal(postmortem_entry) | index.json에 항목 추가, auto_generated=true |
| RB-014 | tdd_addition 적용 (승인 후) | proposal(tdd_addition, approved) | 테스트 파일에 케이스 추가 |
| RB-015 | 반려된 제안 | proposal(rejected) | 적용 안 함, 사유 기록 |

### 10.4 프리셋 흐름

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| RB-016 | Learn 완료 → Review 시작 | review 블록 QUEUED |
| RB-017 | Review 완료 → 워크플로우 종료 | 워크플로우 COMPLETED |
| RB-018 | Review Gate 실패 (회고 문서 없음) | review 블록 FAILED |
| RB-019 | Review Gate 통과 | review 블록 COMPLETED |

### 10.5 순환 검증

| ID | 시나리오 | 기대 결과 |
|----|---------|----------|
| RB-020 | Review에서 memory_update → 다음 PDCA Plan | Plan 에이전트가 해당 memory 참조 |
| RB-021 | Review에서 gate_addition → 다음 PDCA Check | 추가된 Gate가 실행됨 |
| RB-022 | Review에서 tdd_addition → 다음 PDCA Do | 추가된 TDD가 테스트에 포함 |
| RB-023 | Review에서 claudemd_update → 다음 세션 | CLAUDE.md 변경 사항이 에이전트에 적용 |
| RB-024 | 3사이클 연속 같은 교훈 → 심각도 상승 | severity minor→major→critical 자동 승격 |

---

## 11. 불변 규칙 준수

| 규칙 | 적용 |
|------|------|
| **INV-1** 완료 조건 | review.md 존재 + Gate 통과 = 완료 |
| **INV-2** Gate 강제 | 회고 품질 Gate (prompt 평가) 통과 필수 |
| **INV-5** 체크포인트 | Review 단계도 체크포인트 저장 → 세션 복구 가능 |
| **HP-003** 도구 제한 | Review 팀: Read, Glob, Grep, Write, Think (Edit, Bash 제외) |

---

## 12. 엣지 케이스

| 케이스 | 처리 |
|--------|------|
| LLM 교훈 추출 실패 | 재시도 2회 → 실패 시 수동 회고로 폴백 (빈 lessons + 경고) |
| 산출물 일부 누락 (gap.md 없음) | 존재하는 소스만으로 수집. 누락 소스는 review.md에 명시 |
| 자동 적용 제안이 기존 memory와 중복 | 기존 memory 파일 검색 → 중복 시 업데이트, 신규 시 생성 |
| 3사이클 연속 동일 교훈 | severity 자동 승격 + Smith님에 알림 ("반복 패턴 감지") |
| Review 도중 세션 중단 | 체크포인트에서 복구. 수집된 데이터는 보존 |
| L0/L1 핫픽스 | Review 블록 스킵 가능 (프리셋에 review 블록 없음) |
