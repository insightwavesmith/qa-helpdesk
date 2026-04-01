# CLAUDE.md T-PDCA + 역할경계 업데이트 Design

> 작성일: 2026-04-01
> 프로세스 레벨: L2-기능
> Plan: docs/01-plan/features/claude-md-tpdca-update.plan.md

---

## 1. 변경 대상

파일: `/Users/smith/projects/bscamp/CLAUDE.md`

---

## 2. 변경 상세

### 2.1 CTO 필수 행동 섹션 신설

**위치**: `## 역할 경계` 테이블 + 추가 규칙 뒤, `## 에이전트팀 운영` 앞

```markdown
## CTO 필수 행동 (위반 시 리젝)

### DO (반드시)
1. L2/L3 TASK 받으면 → Plan/Design 존재 확인 **먼저**. 없으면 PM에 요청. 직접 작성 금지.
2. PM이 "Do 진행" 지시하면 → **즉시 구현 시작**. COO에 재확인 금지.
3. 구현 전 팀원 생성 → 팀원에게 구현 위임. 리더는 조율만.
4. 구현 완료 → 자동으로 Check(Gap 분석) 실행. 물어보지 마라.
5. Match Rate ≥ 90% → 바로 커밋+push+TaskCompleted. 중간에 멈추지 마라.

### DON'T (금지)
1. ❌ Plan/Design 없이 구현 시작 (L0/L1 예외) → validate-plan.sh, validate-design.sh가 차단
2. ❌ PM이 Do 지시했는데 COO/Smith님에 재확인 → A0-5 위반 (체인 자율 진행)
3. ❌ 리더가 src/ 코드 직접 수정 → validate-delegate.sh가 차단
4. ❌ Plan/Design 직접 작성 (PM 역할) → 역할 경계 위반
5. ❌ 팀원 없이 혼자 작업 → enforce-teamcreate.sh가 차단

### 안티패턴 (2026-04-01 실제 위반 사례)

| 위반 | 올바른 행동 |
|------|------------|
| CTO가 PM Plan 없이 바로 코딩 시작 | Plan 존재 확인 → 없으면 PM에 PLAN_REQUEST 전송 |
| PM "Do 진행해라" 지시에 COO에 "진행해도 될까요?" | PM Do 지시 = 즉시 시작. 추가 확인 불필요 |
| CTO가 Design 문서를 직접 작성 | Design은 PM 담당. CTO는 DESIGN_REQUEST 전송 |
| CLAUDE.md를 읽었지만 핵심 규칙 놓침 | 이 섹션(CTO 필수 행동)을 최우선 정독 |
```

### 2.2 PM 필수 행동 섹션 신설

**위치**: CTO 필수 행동 섹션 바로 뒤

```markdown
## PM 필수 행동 (위반 시 리젝)

### DO (반드시)
1. L2-기능/L3 TASK → Plan 먼저 작성. Design은 Plan 승인 후.
2. Design 문서에 TDD 섹션 필수 포함 (Gap 100% 기준).
3. Design 완료 → CTO에 "Do 진행" 지시. COO 확인 불필요.
4. 분석/검토 TASK도 PDCA 매핑 (P=범위, D=프레임워크, Do=보고서, C=커버리지, A=전달).

### DON'T (금지)
1. ❌ src/ 코드 직접 수정 → validate-delegate.sh가 차단
2. ❌ Design 없이 CTO에 Do 지시
3. ❌ TDD 섹션 없는 Design 제출 → Gap 100% 불충족
4. ❌ CTO에 Do 지시 후 COO 확인 요청 → 불필요한 병목
```

### 2.3 자동 진행 규칙 역참조 추가

**위치**: 자동진행 규칙 2번 뒤

```markdown
2. PM이 Do 지시하면 = **바로 구현 시작. COO 확인 불필요.** → CTO 필수 행동 §DO-2 참조
```

---

## 3. TDD 케이스 (Gap 100% 기준)

### TC-1: CTO 필수 행동 DO 항목 존재
- **검증**: CLAUDE.md에 "CTO 필수 행동" 섹션이 존재하고 DO 항목 5개 이상

### TC-2: CTO 필수 행동 DON'T 항목 존재
- **검증**: DON'T 항목 5개 이상 + 각각 hook 또는 규칙 참조

### TC-3: 안티패턴 테이블 존재
- **검증**: 2026-04-01 위반 사례 4건 중 최소 2건이 안티패턴으로 기록

### TC-4: PM 필수 행동 섹션 존재
- **검증**: PM 필수 행동 섹션에 DO 4개 + DON'T 4개 이상

### TC-5: 자동 진행 규칙 역참조
- **검증**: 자동진행 규칙 2번에 "CTO 필수 행동 참조" 문구 포함

### TC-6: 기존 규칙 충돌 없음
- **검증**: 신규 섹션의 규칙이 기존 T-PDCA 프레임워크, 역할 경계, PDCA 워크플로우 섹션과 모순 없음

### TC-7: 섹션 위치 정확
- **검증**: CTO 필수 행동은 역할 경계 뒤, 에이전트팀 운영 앞에 위치

### TC-8: PM→CTO 핸드오프 명시
- **검증**: CTO DO-2에 "PM이 Do 지시하면 즉시 시작" 명시 + PM DO-3에 "Design 완료→CTO Do 지시" 명시
