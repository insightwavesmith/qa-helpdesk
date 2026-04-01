# TEAM PLAYBOOK — bscamp 통합 운영 플레이북

> 버전: 1.0.0 | 작성: 2026-04-01 | 작성자: sdk-pm (PM)
> 근거: TEAM-ABSOLUTE-PRINCIPLES.md + 기존 Plan/Design 문서 135건 흡수
> 대상: 모든 에이전트팀 (CTO, PM, 마케팅) + COO(모찌) + Owner(Smith님)
> 상태: Draft → COO 검토 → Smith님 최종 확인

---

## 목차

1. [Chapter 1. T-PDCA 프로세스 정의](#chapter-1-t-pdca-프로세스-정의)
2. [Chapter 2. 역할 & 책임 매트릭스](#chapter-2-역할--책임-매트릭스)
3. [Chapter 3. 하네스 설계](#chapter-3-하네스-설계)
4. [Chapter 4. 대시보드 DB 설계](#chapter-4-대시보드-db-설계)
5. [Chapter 5. 완료 기준 & Match Rate](#chapter-5-완료-기준--match-rate)
6. [Chapter 6. 차단 & 에스컬레이션 프로토콜](#chapter-6-차단--에스컬레이션-프로토콜)
7. [Chapter 7. 절대원칙 카탈로그](#chapter-7-절대원칙-카탈로그)
8. [Chapter 8. 기존 문서 흡수 현황](#chapter-8-기존-문서-흡수-현황)

---

# Chapter 1. T-PDCA 프로세스 정의

## 1.1 T-PDCA 전체 흐름도

모든 업무는 T-PDCA 사이클을 따른다. T 단계 없이 팀에 전달하는 것은 절대 금지.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        T-PDCA 전체 흐름도                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────── T (Task 정의 + 승인) ───────────────────┐             │
│  │                                                             │             │
│  │  Smith님 지시                                                │             │
│  │      │                                                      │             │
│  │      ▼                                                      │             │
│  │  모찌 Sequential Thinking (7단계 의무)                        │             │
│  │      │ ① 의도 파악 — 2가지 이상 해석? → 되물어보기            │             │
│  │      │ ② 역할 체크 — COO 범위? 팀 범위?                      │             │
│  │      │ ③ 선행 문서 확인 — 대시보드 DB, Plan/Design 존재?      │             │
│  │      │ ④ 과거 결정 충돌 — MEMORY.md, 오늘 memory 모순?        │             │
│  │      │ ⑤ 영향 범위 — 무엇이 바뀌는가?                        │             │
│  │      │ ⑥ 옵션 도출 — 최소 2개 경로                           │             │
│  │      │ ⑦ 판단 → TASK 작성                                    │             │
│  │      ▼                                                      │             │
│  │  TASK 파일 작성 (coo_approved: false)                        │             │
│  │      │                                                      │             │
│  │      ▼                                                      │             │
│  │  Smith님에게 보고 (레벨 + 프로세스 + 핵심 1~3줄)              │             │
│  │      │                                                      │             │
│  │      ▼                                                      │             │
│  │  Smith님 확인 (승인 or 수정)                                  │             │
│  │      │                                                      │             │
│  │      ▼                                                      │             │
│  │  coo_approved: true → 담당팀 전달                             │             │
│  │                                                             │             │
│  └─────────────────────────────────────────────────────────────┘             │
│      │                                                                      │
│      ▼                                                                      │
│  ┌────────────────── 레벨별 PDCA 분기 ──────────────────┐                    │
│  │                                                       │                   │
│  │  L0 (프로덕션 장애)  ──→  C → A                        │                   │
│  │  L1 (버그 원인 명확)  ──→  D → C → A                   │                   │
│  │  L2-버그 (원인 불명)  ──→  D → C → A                   │                   │
│  │  L2-기능 (요구 명확)  ──→  P → D → C → A               │                   │
│  │  L3 (요구 불명/구조)  ──→  P → D → C → A               │                   │
│  │                                                       │                   │
│  └───────────────────────────────────────────────────────┘                   │
│      │                                                                      │
│      ▼                                                                      │
│  ┌────────── P (Plan) ──────────┐                                           │
│  │  PM이 Plan 문서 작성           │  ← L2-기능, L3만                         │
│  │  docs/01-plan/features/       │                                          │
│  │  ✓ Executive Summary          │                                          │
│  │  ✓ Feature 분리                │                                          │
│  │  ✓ 구현 순서 + 의존성           │                                          │
│  │  ✓ 완료 조건                    │                                          │
│  │  ✓ 리스크                       │                                          │
│  └───────────────────────────────┘                                          │
│      │                                                                      │
│      ▼                                                                      │
│  ┌────────── D (Design) ────────┐                                           │
│  │  PM이 Design 문서 작성         │  ← L1, L2, L3                           │
│  │  docs/02-design/features/     │  (L0만 스킵)                             │
│  │  ✓ 시스템 아키텍처              │                                          │
│  │  ✓ 상세 설계 (스키마/API/UI)    │                                          │
│  │  ✓ TDD 케이스                   │                                          │
│  │  ✓ 목업 (해당 시)               │                                          │
│  └───────────────────────────────┘                                          │
│      │                                                                      │
│      ▼                                                                      │
│  ┌────────── Do (구현) ─────────┐                                           │
│  │  CTO가 구현                    │                                          │
│  │  ✓ TDD 케이스 먼저 작성         │                                          │
│  │  ✓ 설계서 참조하며 코딩          │                                          │
│  │  ✓ tsc + lint + build 통과      │                                          │
│  │  ✓ 커밋 + push                  │                                          │
│  └───────────────────────────────┘                                          │
│      │                                                                      │
│      ▼                                                                      │
│  ┌────────── C (Check) ─────────┐                                           │
│  │  자동 Gap 분석                  │                                          │
│  │  ✓ Design vs 구현 비교          │                                          │
│  │  ✓ Match Rate 계산              │                                          │
│  │  ✓ 90% 미달 → Act (재작업)      │                                          │
│  │  ✓ 90% 이상 → 완료 처리         │                                          │
│  └───────────────────────────────┘                                          │
│      │                                                                      │
│      ├──── Match Rate < 90% ────→ 재작업 루프 (Do → Check 반복)              │
│      │                                                                      │
│      ▼  Match Rate ≥ 90%                                                    │
│  ┌────────── A (Act) ───────────┐                                           │
│  │  완료 처리                      │                                          │
│  │  ✓ TaskCompleted hook 발동      │                                          │
│  │  ✓ 대시보드 DB 업데이트          │                                          │
│  │  ✓ Slack 보고                   │                                          │
│  │  ✓ COO ACK → Smith님 보고       │                                          │
│  │  ✓ 팀원 TeamDelete              │                                          │
│  └───────────────────────────────┘                                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 1.2 T 단계 상세

### T 단계의 목적

Smith님의 지시(함축적, ADHD 특성)를 에이전트팀이 실행 가능한 TASK로 번역하고,
Smith님이 확인 후 팀에 전달하는 **게이팅 단계**.

### T 단계 7단계 Sequential Thinking

모찌(COO)가 Smith님 지시를 받으면 반드시 아래 7단계를 거친다:

```
단계 │ 행동                          │ 산출물                    │ 실패 시
─────┼───────────────────────────────┼──────────────────────────┼────────────────
  ①  │ 의도 파악                      │ 해석 1~2개               │ 2개 이상 → 되물어보기
  ②  │ 역할 체크                      │ COO 직접 / 팀 배정       │ 모호 → Smith님 확인
  ③  │ 선행 문서 확인                  │ 관련 Plan/Design 목록    │ 기존 문서 충돌 → 조정
  ④  │ 과거 결정 충돌 체크              │ MEMORY.md 교차 검증      │ 모순 발견 → Smith님 확인
  ⑤  │ 영향 범위 산정                  │ 변경 파일/기능 목록       │ 범위 불명 → L3 판정
  ⑥  │ 옵션 도출                      │ 최소 2개 경로            │ 1개만 → 더 고민
  ⑦  │ 판단 + TASK 작성               │ TASK 파일 (coo_approved: false) │ —
```

### T 단계 규칙

1. **모찌가 먼저 실행 제안 금지** — Smith님이 정의, 모찌가 체계화
2. **애매한 것만 되물어보기** — 확실한 건 알아서
3. **Smith님 확인 없이 팀 전달 = 절대 금지**
4. **TASK 파일에 `coo_approved: true` 없으면 팀 착수 불가** (hook 강제 예정)

### TASK 파일 스키마

```markdown
# TASK: {제목}

> 작성: {YYYY-MM-DD} | {작성자 역할} | L{0-3}
> coo_approved: {true|false}
> 담당: {sdk-cto|sdk-pm|sdk-mkt}

## 배경
{왜 이 TASK가 필요한지}

## 참조 문서 (필수)
- {관련 Plan/Design/ADR 경로}

## 산출물
{구체적 파일 목록 + 위치}

## 완료 조건
- [ ] {체크리스트}

## 주의
{특이사항, 제약조건}
```

## 1.3 레벨별 PDCA 단계 매핑

### 레벨 판단 기준

```
┌──────────────────────────────────────────────────────────────┐
│                    레벨 판단 의사결정 트리                      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  프로덕션 장애? ──── Yes ────→ L0 (CA)                        │
│       │                       CTO 직행. Plan/Design 스킵     │
│       No                                                     │
│       │                                                      │
│  버그인가? ──── Yes ──── 원인 명확? ── Yes ──→ L1 (DCA)       │
│       │                      │          CTO 직행. Design 스킵 │
│       │                      No                               │
│       │                      │                                │
│       │                      └──→ L2-버그 (DCA)               │
│       │                           CTO 조사+수정               │
│       No                                                     │
│       │                                                      │
│  기능 개발? ── Yes ── 요구사항 명확? ── Yes ──→ L2-기능 (PDCA) │
│       │                      │          PM Design → CTO 구현  │
│       │                      No                               │
│       │                      │                                │
│       │                      └──→ L3 (PDCA)                   │
│       │                           PM Plan+Design → CTO 구현   │
│       No                                                     │
│       │                                                      │
│  구조 변경/마이그레이션/DB/Auth? ──→ L3 (PDCA)                 │
│       │                              ADR 필수 + 롤백 전략     │
│       No                                                     │
│       │                                                      │
│  src/ 미수정 (리서치/문서/마케팅)? ──→ L1 (DCA)                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### 레벨별 상세 매핑

| 레벨 | 케이스 | PDCA 단계 | Plan | Design | TDD | Check | Match Rate | 배포 조건 |
|------|--------|-----------|------|--------|-----|-------|------------|----------|
| **L0** | 프로덕션 장애, fix:/hotfix: 커밋 | CA | 커밋 메시지 1줄 | 스킵 | 스킵 | tsc+build만 | 스킵 | 리더 즉시 배포 |
| **L1** | 버그 원인 명확, src/ 미수정 | DCA | TASK 1~3줄 | 스킵 | 상황별 | 결과물 존재 확인 | 스킵 | 배포 없음 or 리더 배포 |
| **L2-버그** | 버그 원인 불명 | DCA | TASK 상세 | 스킵 (조사 후 필요하면 추가) | 권장 | Gap 분석 | 90%+ | Gap 95%+ 후 배포 |
| **L2-기능** | 요구사항 명확한 기능 개발 | PDCA | plan.md 필수 | design.md 필수 | 필수 | Gap 분석 + tsc + build | 90%+ | Gap 95%+ 후 배포 |
| **L3** | 요구사항 불명확, 구조 변경, DB/Auth/인프라 | PDCA | plan.md + ADR | design.md + 롤백 전략 | 필수 | Gap + 보안 감사 | **95%+** | Gap 95%+ + Smith님 최종 확인 |

### 케이스별 예시

```
예시 1: "로그인 안 돼!" (프로덕션 장애)
→ L0. CTO가 즉시 fix: 커밋. Plan/Design 없이 CA만.

예시 2: "총가치각도기에서 CTR이 NaN으로 표시됨" (버그, 원인 명확)
→ L1. CTO가 바로 수정. Design 스킵.

예시 3: "경쟁사 분석에서 간헐적으로 데이터 안 나옴" (버그, 원인 불명)
→ L2-버그. CTO가 조사 먼저 → 원인 파악 후 수정.

예시 4: "Slack 알림 기능 추가해줘" (요구사항 명확)
→ L2-기능. PM이 Design 작성 → CTO 구현 → Gap 분석.

예시 5: "Firebase Auth로 전환해야 해" (구조 변경)
→ L3. PM이 Plan + ADR + Design 작성 + 롤백 전략 → CTO 구현.

예시 6: "블로그 글 써줘" (src/ 미수정)
→ L1. 마케팅팀이 직접 작성. PDCA 경량.
```

## 1.4 각 단계 완료 체크포인트

### T → P/D/Do 전환 체크포인트

| 체크포인트 | 확인 방법 | 차단 시 행동 |
|-----------|----------|-------------|
| TASK 파일 존재 | `.openclaw/workspace/tasks/TASK-*.md` | 모찌가 작성 |
| coo_approved: true | TASK frontmatter 확인 | Smith님에게 보고 → 승인 대기 |
| 레벨 판정 완료 | TASK 파일 L{0-3} 표기 | 모찌가 재판단 |
| 담당팀 명시 | TASK 파일 담당: 필드 | 모찌가 배정 |

### P → D 전환 체크포인트 (L2-기능, L3만)

| 체크포인트 | 확인 방법 | 차단 시 행동 |
|-----------|----------|-------------|
| plan.md 존재 | `docs/01-plan/features/{feature}.plan.md` | PM이 작성 |
| Executive Summary 포함 | plan.md 내 필수 섹션 | PM이 보완 |
| Feature 분리 완료 | 각 Feature별 산출물 목록 | PM이 분리 |
| 완료 조건 명시 | 체크리스트 형태 | PM이 추가 |
| 의존성 정리 | 순서 + 병렬 가능 여부 | PM이 정리 |

### D → Do 전환 체크포인트

| 체크포인트 | 확인 방법 | 차단 시 행동 |
|-----------|----------|-------------|
| design.md 존재 | `docs/02-design/features/{feature}.design.md` | PM이 작성 |
| 시스템 아키텍처 다이어그램 | design.md Section 1 | PM이 보완 |
| TDD 케이스 포함 | design.md 테스트 계획 섹션 | PM이 작성 |
| validate-design hook 통과 | hook 자동 검증 | 차단 → PM에 요청 |

### Do → C 전환 체크포인트

| 체크포인트 | 확인 방법 | 차단 시 행동 |
|-----------|----------|-------------|
| tsc --noEmit 통과 | `npx tsc --noEmit --quiet` | CTO가 타입 에러 수정 |
| lint 통과 | `npx next lint --quiet` | CTO가 lint 에러 수정 |
| build 성공 | `npm run build` | CTO가 빌드 에러 수정 |
| 커밋 완료 | `git log --oneline -1` | CTO가 커밋 |
| TDD 전량 통과 | `npx vitest run` | CTO가 테스트 수정 |

### C → A 전환 체크포인트

| 체크포인트 | 확인 방법 | 차단 시 행동 |
|-----------|----------|-------------|
| Gap 분석 완료 | `docs/03-analysis/{feature}.analysis.md` | gap-analysis.sh 실행 |
| Match Rate ≥ 90% | analysis.md 내 비율 | CTO가 재작업 (Do 복귀) |
| L3: Match Rate ≥ 95% | analysis.md 내 비율 | CTO가 재작업 |

## 1.5 차단 발생 시 자동 에스컬레이션 흐름 (A0-6)

```
차단 발생 (hook이 exit 2 반환)
    │
    ▼
hook이 차단 이유 + 필요한 것 + 담당 역할 출력
    │
    │  예시 출력:
    │  {
    │    "blocked": "validate-design",
    │    "reason": "Design 파일 없음: slack-notification.design.md",
    │    "needs": "PM_DESIGN",
    │    "task": "TASK-SLACK-NOTIFICATION",
    │    "notify": "PM_LEADER"
    │  }
    │
    ▼
에이전트가 해당 역할에 자동 요청 (claude-peers send_message)
    │
    ├── 해당 역할 온라인 → 메시지 수신 → 산출물 작성
    │       │
    │       ▼
    │   산출물 완료 → 자동 체인으로 재개
    │
    ├── 해당 역할 오프라인 → 30분 대기
    │       │
    │       ▼
    │   타임아웃 → COO(모찌) 에스컬레이션
    │       │
    │       ▼
    │   모찌가 해결 경로 찾기:
    │   1. 다른 역할에 재배정
    │   2. 직접 산출물 작성 (COO 범위 내)
    │   3. Smith님 보고 (결정 필요 시)
    │
    └── "막혔으니 안 함" = 절대 금지
```

---

# Chapter 2. 역할 & 책임 매트릭스

## 2.1 확장 가능한 역할 타입 기반 설계

현재 4개 역할 타입이 존재하며, Executor 타입은 새 팀 추가 시 확장된다.

```
┌──────────────────────────────────────────────────────────────┐
│                    역할 타입 구조도                             │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│               ┌──────────────┐                               │
│               │    Owner     │                               │
│               │   Smith님    │                               │
│               └──────┬───────┘                               │
│                      │ 정의 (방향/의도)                        │
│                      ▼                                       │
│               ┌──────────────┐                               │
│               │ Orchestrator │                               │
│               │  모찌 (COO)  │                               │
│               └──────┬───────┘                               │
│                      │ 체계화 (T-PDCA 번역, 팀 배정)           │
│                      ▼                                       │
│        ┌─────────────┼─────────────┐                         │
│        │             │             │                         │
│  ┌─────▼─────┐ ┌─────▼─────┐ ┌─────▼─────┐                  │
│  │  Planner  │ │ Executor  │ │ Executor  │ ← 확장 가능       │
│  │ sdk-pm(PM)│ │sdk-cto    │ │sdk-mkt    │                   │
│  └───────────┘ │  (CTO)    │ │ (마케팅)  │                   │
│                └───────────┘ └───────────┘                   │
│                                                              │
│  향후 확장 예시:                                                │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐                   │
│  │ Executor  │ │ Executor  │ │ Executor  │                   │
│  │sdk-design │ │sdk-data   │ │sdk-qa     │                   │
│  │ (디자인팀) │ │(데이터팀) │ │ (QA팀)   │                   │
│  └───────────┘ └───────────┘ └───────────┘                   │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 2.2 역할 타입별 상세

### Owner (Smith님)

**정의**: 서비스 방향과 의도를 결정하는 최종 의사결정자.

| 구분 | 내용 |
|------|------|
| **할 것** | 방향 제시, 의도 전달, 레벨 확인/승인, 최종 판단, L3 최종 확인 |
| **하지 말 것** | 직접 코딩, 직접 배포, TASK 직접 작성 (모찌가 체계화), hook 직접 수정 |
| **인터페이스** | Smith님 → 모찌 (지시) / 모찌 → Smith님 (보고, 확인 요청) |

**레벨별 행동**:

| 레벨 | Smith님 행동 |
|------|------------|
| L0 | 장애 인지 시 모찌에게 전달. 완료 보고 수신 |
| L1 | 지시 → 확인. 결과 보고 수신 |
| L2 | 지시 → TASK 확인 → 승인. 완료 보고 수신 |
| L3 | 지시 → TASK 확인 → 승인. **배포 후 최종 확인 필수** |

### Orchestrator (모찌/COO)

**정의**: Smith님 지시를 T-PDCA로 번역하고 팀 간 조율하는 운영 총괄.

| 구분 | 내용 |
|------|------|
| **할 것** | T 단계 실행 (7단계 Sequential Thinking), TASK 작성, 레벨 판단, 팀 배정, 완료 판단, 대시보드 DB 업데이트, Smith님 보고, 에스컬레이션 처리 |
| **하지 말 것** | 직접 코딩, Smith님 확인 없이 팀 전달, "지금 바로 할까요?" (충동 차단), Plan/Design 직접 작성 (PM 역할), 먼저 실행 제안 |
| **인터페이스** | Smith님 → 모찌 (지시) / 모찌 → PM (Plan/Design 요청) / 모찌 → CTO (구현 요청) / 모찌 → 마케팅 (홍보 요청) |

**레벨별 행동**:

| 레벨 | 모찌 행동 |
|------|----------|
| L0 | CTO에 즉시 전달. 완료 시 Smith님 보고 |
| L1 | TASK 작성 → Smith님 확인 → CTO 전달. 완료 시 보고 |
| L2 | TASK 작성 → Smith님 확인 → PM(Design) → CTO(구현). Gap 확인 후 보고 |
| L3 | TASK 작성 → Smith님 확인 → PM(Plan+Design) → CTO(구현). Gap + Smith님 최종 확인 |

**충동 차단 체크리스트**:
- [ ] Smith님 말 → 바로 Do 점프하려는 충동? → **멈춤**
- [ ] 의도 파악 완료?
- [ ] 역할 체크 완료?
- [ ] 선행 문서 확인 완료?
- [ ] Smith님 확인 받음?
- [ ] 그제야 팀 전달

### Planner (PM)

**정의**: Plan + Design + TDD 케이스를 작성하는 기획/설계 담당.

| 구분 | 내용 |
|------|------|
| **할 것** | Plan 문서 작성, Design 문서 작성, TDD 케이스 정의, 목업 작성, Feature 분리, ADR 작성 (L3) |
| **하지 말 것** | src/ 코드 작성 (구현 금지), 배포, 직접 테스트 실행, 기획 없이 바로 시작 |
| **인터페이스** | 모찌 → PM (TASK 수신) / PM → CTO (Plan/Design 전달) / CTO → PM (차단 시 Design 요청) |

**레벨별 행동**:

| 레벨 | PM 행동 |
|------|--------|
| L0 | 관여 없음 (CTO 직행) |
| L1 | 관여 없음 (CTO 직행) |
| L2-버그 | 관여 없음 (CTO 조사 후 필요하면 Design 요청 가능) |
| L2-기능 | Design 작성 + TDD 케이스 |
| L3 | Plan + ADR + Design + TDD 케이스 + 롤백 전략 |

### Executor — CTO (sdk-cto)

**정의**: 구현 + QA + 배포를 담당하는 개발 실행자.

| 구분 | 내용 |
|------|------|
| **할 것** | 코드 구현, TDD 실행, tsc+lint+build 검증, 배포 (리더만), Gap 분석 결과 기반 수정, 커밋+push |
| **하지 말 것** | Plan/Design 없이 구현 시작 (L0/L1/L2-버그 예외), 기획서에 없는 기능 임의 추가, 팀원이 배포 |
| **인터페이스** | PM → CTO (Plan/Design) / CTO → 모찌 (완료 보고, COMPLETION_REPORT) |

**레벨별 행동**:

| 레벨 | CTO 행동 |
|------|----------|
| L0 | 즉시 fix 커밋 → 배포 → 보고 |
| L1 | Design 없이 구현 → 커밋 → 보고 |
| L2-버그 | 조사 → 수정 → 커밋 → Gap → 보고 |
| L2-기능 | Design 기반 구현 → TDD → 커밋 → Gap → 보고 |
| L3 | Plan+Design 기반 구현 → TDD → 커밋 → Gap → 보안 감사 → 보고 |

**리더-팀원 역할 분리**:

```
CTO 리더 (tmux pane 0):
  ✓ 팀 생성 (TeamCreate)
  ✓ TASK 분해/배정
  ✓ 팀원 조율/메시지
  ✓ 결과물 검증 (중간 Read 필수)
  ✓ Plan/Design 작성 요청
  ✓ 배포 (validate-deploy-authority.sh 허용)
  ✓ PDCA 기록
  ✗ src/ 코드 직접 수정 (validate-delegate.sh 차단)
  ✗ gcloud 등 인프라 CLI 직접 실행 → 팀원 위임

CTO 팀원 (tmux pane 1+):
  ✓ 리더 배정 코드 구현
  ✓ 테스트 작성/실행
  ✓ tsc + build 검증
  ✓ 커밋
  ✗ 배포 (validate-deploy-authority.sh 차단)
  ✗ .claude/ 직접 수정 → 리더 보고
  ✗ 다른 팀원과 같은 파일 동시 수정
```

### Executor — 마케팅 (sdk-mkt)

**정의**: bscamp 강의 홍보, 오가닉 채널 배포를 담당하는 마케팅 실행자.

| 구분 | 내용 |
|------|------|
| **할 것** | 블로그 글 작성, 소셜 미디어 콘텐츠, 뉴스레터, 모찌리포트 생성 |
| **하지 말 것** | 서비스 기능 개발 (CTO 역할), src/ 코드 수정 |
| **인터페이스** | 모찌 → 마케팅 (TASK 수신) / 마케팅 → 모찌 (완료 보고) |

## 2.3 역할 간 인터페이스 규약

### 메시지 프로토콜 (claude-peers)

```json
{
  "protocol": "bscamp-team/v1",
  "type": "{COMPLETION_REPORT|ANALYSIS_REPORT|ACK|TASK_QUERY|TASK_RESPONSE|DESIGN_REQUEST|PLAN_REQUEST}",
  "from": "{역할명}",
  "to": "{역할명}",
  "task": "{TASK명}",
  "chain_step": "{단계}",
  "payload": { }
}
```

### 체인 핸드오프 경로

```
일반 경로 (L2-기능):
  모찌 → PM (Design 요청) → PM 완료 → 모찌 → CTO (구현 요청)
  → CTO 완료 (COMPLETION_REPORT) → 모찌 (ACK) → Smith님 보고

L3 경로:
  모찌 → PM (Plan+Design 요청) → PM 완료 → 모찌 → CTO (구현 요청)
  → CTO 완료 → 모찌 → Smith님 최종 확인

L0 경로:
  모찌 → CTO (즉시) → CTO 완료 → 모찌 → Smith님 보고

핸드오프 프로토콜 (V2):
  CTO → COO → Smith님. PM 검수 없음.
  Match Rate < 95% → CTO 자체 수정 후 재시도
  Match Rate ≥ 95% → COO 직접 전달 (PM 우회)
```

## 2.4 새 Executor 팀 추가 시 온보딩 체크리스트

새 팀(예: sdk-design, sdk-data)을 추가할 때 아래를 완료해야 한다:

```
□ 1. 역할 정의서 작성
    - 할 것 / 하지 말 것 명확히 구분
    - 레벨별 행동 기준 정의
    - 인터페이스 (누구에게 받고, 누구에게 보고하는가)

□ 2. 하네스 hook 설정
    - validate-delegate.sh에 새 팀 리더 pane 등록
    - validate-deploy-authority.sh에 배포 권한 설정 (필요 시)
    - team-context-resolver.sh에 팀 식별자 추가
    - peer-map.json에 역할명 패턴 추가

□ 3. 대시보드 연동
    - peer-map.json 역할 매핑 추가
    - coo-state.json에 새 팀 게이트 추가 (필요 시)

□ 4. 체인 핸드오프 설정
    - pdca-chain-handoff.sh에 새 팀 경로 추가
    - chain-messenger.sh에 메시지 라우팅 추가

□ 5. 문서 업데이트
    - 이 플레이북 Chapter 2에 새 역할 추가
    - CLAUDE.md 팀별 역할 테이블 업데이트
    - ADR-002 팀 구성 업데이트

□ 6. 테스트
    - 새 팀 리더 → 팀원 → 완료 → 보고 체인 E2E 검증
    - 차단 시 에스컬레이션 정상 작동 확인
```

---

# Chapter 3. 하네스 설계

## 3.1 현재 hook 전체 목록

### 메인 hook (39개)

`.bkit/hooks/` 디렉토리에 위치. 각 hook은 shell script(bash)로 구현.

```
번호 │ 파일명                              │ 역할                                    │ 트리거
─────┼─────────────────────────────────────┼────────────────────────────────────────┼──────────────
  1  │ destructive-detector.sh             │ rm -rf, force push 등 위험 명령 차단     │ PreToolUse:Bash
  2  │ validate-qa.sh                      │ QA 전 merge 차단                        │ PreToolUse:Bash
  3  │ validate-pdca.sh                    │ PDCA 프로세스 준수 검증                   │ PreToolUse:Bash
  4  │ validate-task.sh                    │ TASK 파일 유효성 검증                     │ PreToolUse:Bash
  5  │ enforce-qa-before-merge.sh          │ QA 통과 없이 merge 차단                  │ PreToolUse:Bash
  6  │ validate-deploy-authority.sh        │ 리더만 배포 허용, 팀원 배포 차단           │ PreToolUse:Bash
  7  │ postmortem-review-gate.sh           │ 마이그레이션/대규모 변경 시 회고 필독 강제  │ PreToolUse:Bash
  8  │ validate-delegate.sh               │ 리더의 src/ 직접 수정 차단                │ PreToolUse:Edit|Write
  9  │ validate-plan.sh                   │ Plan 파일 없으면 코딩 차단                │ PreToolUse:Edit|Write
 10  │ validate-design.sh                 │ Design 파일 없으면 코딩 차단              │ PreToolUse:Edit|Write
 11  │ enforce-teamcreate.sh              │ 팀원 없이 리더 혼자 작업 차단              │ PreToolUse:Agent
 12  │ validate-before-delegate.sh        │ TASK 위임 전 사전 검증                    │ PreToolUse:Task
 13  │ validate-pdca-before-teamdelete.sh │ PDCA 미완료 상태 팀 삭제 차단             │ PreToolUse:TeamDelete
 14  │ task-completed.sh                  │ TASK 완료 처리 (상태 업데이트)             │ TaskCompleted
 15  │ task-quality-gate.sh               │ Match Rate 90% 체크                      │ TaskCompleted
 16  │ gap-analysis.sh                    │ Design vs 구현 Gap 분석                   │ TaskCompleted
 17  │ pdca-update.sh                     │ PDCA 상태 파일 업데이트                    │ TaskCompleted
 18  │ notify-completion.sh               │ Slack 알림 + COO webhook                  │ TaskCompleted
 19  │ deploy-trigger.sh                  │ 배포 트리거                               │ TaskCompleted
 20  │ deploy-verify.sh                   │ 배포 후 헬스체크 검증                      │ TaskCompleted
 21  │ pdca-chain-handoff.sh              │ 다음 팀 자동 체인 핸드오프                  │ TaskCompleted
 22  │ registry-update.sh                 │ 팀원 등록 (peer-map 업데이트)              │ PostToolUse:TeamCreate
 23  │ agent-state-sync.sh                │ 에이전트 상태 동기화                       │ 크론/수동
 24  │ auto-shutdown.sh                   │ idle 에이전트 자동 종료                    │ 크론/수동
 25  │ auto-team-cleanup.sh               │ 좀비 팀원 자동 정리                        │ 크론/수동
 26  │ dashboard-sync.sh                  │ 대시보드 데이터 동기화                      │ 크론/수동
 27  │ deploy-trigger.sh                  │ 배포 트리거                               │ TaskCompleted
 28  │ detect-process-level.sh            │ L0~L3 프로세스 레벨 자동 판단              │ 내부 호출
 29  │ force-team-kill.sh                 │ 강제 팀 종료 (좀비 방지)                   │ 수동
 30  │ gap-analysis.sh                    │ Gap 분석 실행                             │ TaskCompleted
 31  │ heartbeat-watchdog.sh              │ 팀원 heartbeat 감시                       │ 크론
 32  │ is-teammate.sh                     │ 현재 세션이 팀원인지 판별                   │ 내부 호출
 33  │ migrate-pdca-schema.py             │ PDCA 스키마 마이그레이션                    │ 수동
 34  │ pdca-cron-watcher.sh               │ PDCA 상태 크론 감시                        │ 크론
 35  │ post-commit                        │ git 커밋 후 처리                           │ git hook
 36  │ postmortem-generator.sh            │ 회고록 자동 생성                           │ 수동
 37  │ protect-stage.sh                   │ staging 브랜치 보호                        │ PreToolUse
 38  │ session-resume-check.sh            │ 세션 시작 시 미완료 작업 복구               │ 세션 시작
 39  │ verify-chain-e2e.sh                │ 체인 E2E 검증                             │ 수동
 40  │ pane-access-guard.sh               │ 팀원 pane 직접 접근 차단 (A0-7)           │ PreToolUse:Bash
```

### 헬퍼 (19개)

`.bkit/hooks/helpers/` 디렉토리에 위치. 메인 hook에서 source로 호출.

```
번호 │ 파일명                        │ 역할
─────┼──────────────────────────────┼────────────────────────────────────────
  1  │ approval-handler.sh          │ 팀원 승인 요청 처리 + 리더 tmux send-keys 알림
  2  │ chain-messenger.sh           │ claude-peers 메시지 송수신 래퍼
  3  │ chain-status-writer.sh       │ 체인 상태 JSON 파일 기록
  4  │ context-checkpoint.sh        │ 컨텍스트 체크포인트 저장/복원
  5  │ coo-watchdog.sh              │ COO 게이트 타임아웃 감시 (ACK 5분, 보고 15분)
  6  │ detect-work-type.sh          │ DEV-L0/L1/L2/L3, OPS, MKT 자동 분류
  7  │ error-classifier.sh          │ 에러 메시지 패턴 매칭 자동 분류
  8  │ frontmatter-parser.sh        │ TASK 파일 frontmatter 파싱
  9  │ gate-checker.sh              │ 게이트 순차 판정 (통과/차단)
 10  │ hook-output.sh               │ hook 출력 포맷 표준화
 11  │ hook-self-register.sh        │ PID 역추적 자동 peer 등록 (V3 핵심)
 12  │ living-context-loader.sh     │ PDCA 단계별 상류 문서 자동 로딩
 13  │ match-rate-parser.sh         │ Gap 분석 결과에서 Match Rate 추출
 14  │ migrate-runtime.sh           │ .claude/ → .bkit/runtime/ 경로 마이그레이션
 15  │ peer-resolver.sh             │ peer-map.json 기반 역할→peerId 매핑
 16  │ postmortem-validator.sh      │ 회고록 필수 섹션 검증
 17  │ prevention-tdd-tracker.sh    │ 재발 방지 TDD 추적
 18  │ team-context-resolver.sh     │ 팀별 컨텍스트 파일 분리 + 아카이빙
 19  │ zombie-pane-detector.sh      │ 좀비 tmux pane 감지
```

## 3.2 hook 이벤트 매핑

### settings.local.json 등록 현황

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          "destructive-detector.sh",     // 위험 명령 차단
          "pane-access-guard.sh",        // 팀원 pane 접근 차단
          "validate-qa.sh",              // QA 전 merge 차단
          "validate-pdca.sh",            // PDCA 준수
          "validate-task.sh",            // TASK 유효성
          "enforce-qa-before-merge.sh",  // QA 없이 merge 차단
          "validate-deploy-authority.sh", // 배포 권한
          "postmortem-review-gate.sh"    // 회고 필독
        ]
      },
      {
        "matcher": "Edit|Write",
        "hooks": [
          "validate-delegate.sh",  // 리더 코드 수정 차단
          "validate-plan.sh",      // Plan 없으면 차단
          "validate-design.sh"     // Design 없으면 차단
        ]
      },
      {
        "matcher": "Agent",
        "hooks": [
          "enforce-teamcreate.sh"  // 팀원 없이 작업 차단
        ]
      },
      {
        "matcher": "Task",
        "hooks": [
          "validate-before-delegate.sh"  // 위임 전 검증
        ]
      },
      {
        "matcher": "TeamDelete",
        "hooks": [
          "validate-pdca-before-teamdelete.sh"  // PDCA 미완료 삭제 차단
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          "task-completed.sh",       // 완료 처리
          "task-quality-gate.sh",    // Match Rate 체크
          "gap-analysis.sh",         // Gap 분석
          "pdca-update.sh",          // PDCA 상태 업데이트
          "notify-completion.sh",    // Slack 알림
          "deploy-trigger.sh",       // 배포 트리거
          "deploy-verify.sh",        // 배포 검증
          "pdca-chain-handoff.sh"    // 체인 핸드오프
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "TeamCreate",
        "hooks": [
          "registry-update.sh"  // 팀원 등록
        ]
      }
    ]
  }
}
```

### 이벤트 흐름 시각화

```
[코드 수정 시도]
    │
    ▼
PreToolUse:Edit|Write
    ├── validate-delegate.sh ──── 리더가 src/ 수정? → 차단
    ├── validate-plan.sh ──────── Plan 파일 존재? → 없으면 차단
    └── validate-design.sh ────── Design 파일 존재? → 없으면 차단
    │
    ▼ (모두 통과)
[Edit/Write 실행]
    │
    ▼
[커밋 시도]
    │
    ▼
PreToolUse:Bash
    ├── destructive-detector.sh ── rm -rf, force push? → 차단
    ├── validate-qa.sh ─────────── QA 전 merge? → 차단
    ├── validate-pdca.sh ───────── PDCA 순서 준수? → 위반 시 차단
    ├── validate-task.sh ───────── TASK 유효? → 무효 시 차단
    └── validate-deploy-authority.sh ── 배포 권한? → 팀원이면 차단
    │
    ▼ (모두 통과)
[Bash 실행]
    │
    ▼
[TASK 완료]
    │
    ▼
TaskCompleted (순차 실행)
    ├── 1. task-completed.sh ────── 상태 파일 업데이트
    ├── 2. task-quality-gate.sh ── Match Rate 확인 (< 90% → 재작업)
    ├── 3. gap-analysis.sh ──────── Design vs 코드 비교
    ├── 4. pdca-update.sh ───────── pdca-status.json 업데이트
    ├── 5. notify-completion.sh ── Slack 채널 알림
    ├── 6. deploy-trigger.sh ────── 배포 조건 충족 시 트리거
    ├── 7. deploy-verify.sh ─────── 배포 후 헬스체크
    └── 8. pdca-chain-handoff.sh ── 다음 팀에 자동 전달
```

## 3.3 레벨별 hook 분기 목표 구조

### 현재 구현 상태 vs 목표

```
레벨   │ 현재 분기              │ 목표 (빈 구멍)
───────┼───────────────────────┼──────────────────────────────────────
L0     │ Plan/Design 스킵 가능 │ ✅ 구현됨 (detect-process-level.sh)
L1     │ Design 스킵 가능      │ ✅ 구현됨
L2     │ Plan+Design 필수      │ ✅ 구현됨
L3     │ Plan+Design+ADR 필수  │ ⚠️ ADR 존재 체크 미구현
L0~L3  │ 레벨 자동 판단        │ ⚠️ detect-process-level.sh → hook 분기 미연결
```

### 빈 구멍 5가지

1. **레벨별 분기 자동화**: detect-process-level.sh가 레벨을 판단하지만, 각 hook에서 레벨에 따라 분기하는 로직이 일부 미구현. 현재는 Plan/Design 파일 존재 유무로만 판단.

2. **대시보드 DB 강제 업데이트**: dashboard-sync.sh가 TaskCompleted 체인에 미연결. 현재는 수동으로 대시보드 데이터를 업데이트해야 함.

3. **coo_approved 게이팅**: TASK 파일에 `coo_approved: true`가 없으면 팀이 착수하지 못하도록 하는 hook 미구현. 현재는 규칙으로만 강제.

4. **배포 성공 검증 (push_verified 한계)**: 현재 `push_verified`는 `git push` 성공만 체크하고, Cloud Run 배포 성공 여부는 검증하지 않음. `deploy-verify.sh`가 TaskCompleted 체인에 등록되어 있지만, 실제 Cloud Run 서비스 헬스체크(HTTP 200 확인)까지 연결되지 않음. **git push 성공 ≠ 배포 성공 ≠ 서비스 정상** (PM-001 교훈). deploy-verify.sh에 `gcloud run services describe` + curl 헬스체크 로직 추가 필요.

5. **팀원 승인 규제 과도 (approval-handler 범위 축소 필요)**: 현재 `IS_TEAMMATE=true`인 팀원이 `.claude/` 경로 파일을 수정할 때 **모든 파일**에 대해 리더 승인 요청이 발생한다. 팀원은 Design 범위 안에서 자유롭게 작업해야 하며, 승인이 필요한 파일은 아래 3가지로 한정해야 한다:

   ```
   승인 필요 (화이트리스트):
     - .claude/settings.local.json  ← hook 등록/권한 변경
     - .env / .env.*                ← 환경변수/시크릿
     - **/migration*                ← DB 마이그레이션

   승인 불필요 (팀원 자유):
     - .claude/hooks/*.sh           ← hook 스크립트 수정
     - .bkit/hooks/*.sh             ← bkit hook 수정
     - .bkit/runtime/*              ← 런타임 상태 파일
     - .bkit/state/*                ← PDCA 상태 파일
     - 그 외 src/, docs/ 등        ← Design 범위 내 자유
   ```

6. **팀원 pane 직접 접근 미차단**: COO/타 팀이 리더를 우회하여 팀원 pane에 직접 send-keys → pane-access-guard.sh로 **해결**

   **현재 문제**: PM-003 교훈으로 approval-handler에 tmux send-keys 알림을 추가했지만, 범위가 `.claude/` 전체로 과확장됨. 이로 인해 팀원이 hook 스크립트를 수정할 때마다 불필요한 승인 대기 → 작업 지연.

   **필요한 변경**: approval-handler.sh에서 `IS_TEAMMATE=true`일 때 파일 경로 화이트리스트 매칭 추가. 화이트리스트에 해당하는 파일만 승인 요청, 나머지는 바로 통과.

## 3.4 차단 → 자동 역할 요청 → 체인 재개 구조

```
[hook 차단 발생]
    │
    ▼
hook이 JSON 형태로 차단 정보 출력:
{
  "blocked": "{hook명}",
  "reason": "{차단 이유}",
  "needs": "{필요한 산출물 타입}",
  "task": "{TASK명}",
  "notify": "{대상 역할}"
}
    │
    ▼
[에이전트가 차단 정보 파싱]
    │
    ├── needs: "PM_PLAN"
    │   → peer-map.json에서 PM_LEADER peerId 조회
    │   → claude-peers send_message:
    │     "Plan 파일 필요: {feature}.plan.md"
    │   → PM이 Plan 작성 완료
    │   → 자동 체인 재개
    │
    ├── needs: "PM_DESIGN"
    │   → peer-map.json에서 PM_LEADER peerId 조회
    │   → claude-peers send_message:
    │     "Design 파일 필요: {feature}.design.md"
    │   → PM이 Design 작성 완료
    │   → 자동 체인 재개
    │
    ├── needs: "COO_APPROVAL"
    │   → peer-map.json에서 MOZZI peerId 조회
    │   → claude-peers send_message:
    │     "COO 승인 필요: TASK-{xxx}"
    │   → 모찌가 승인
    │   → 자동 체인 재개
    │
    └── needs: "SMITH_DECISION"
        → 모찌에게 에스컬레이션
        → 모찌가 Smith님에게 보고
        → Smith님 결정 후 재개
```

## 3.5 coo_approved 게이팅 설계

### TASK 파일 스키마 (frontmatter)

```yaml
---
title: "{TASK 제목}"
date: "{YYYY-MM-DD}"
author: "{작성자 역할}"
level: "L{0-3}"
process: "{CA|DCA|PDCA}"
assignee: "{sdk-cto|sdk-pm|sdk-mkt}"
coo_approved: {true|false}
smith_confirmed: {true|false}    # L3만 필수
track: "{A|B}"                   # Track A: PDCA 필수, Track B: 자유
---
```

### coo_approved 게이팅 hook (구현 예정)

```bash
#!/bin/bash
# validate-coo-approved.sh
# TASK 파일에 coo_approved: true가 없으면 차단

TASK_FILE=$(find .openclaw/workspace/tasks -name "TASK-*.md" -newer .bkit/state/last-task-check 2>/dev/null | head -1)
if [ -n "$TASK_FILE" ]; then
    COO_APPROVED=$(grep -m1 "coo_approved:" "$TASK_FILE" | awk '{print $2}')
    if [ "$COO_APPROVED" != "true" ]; then
        echo '{"blocked":"validate-coo-approved","reason":"Smith님 미승인 TASK","needs":"COO_APPROVAL","notify":"MOZZI"}'
        exit 2
    fi
fi
exit 0
```

## 3.6 hook 추가/수정 가이드

### 새 hook 추가 절차

```
1. hook 스크립트 작성
   - 위치: .bkit/hooks/{hook명}.sh
   - exit 코드: 0=통과, 2=차단(사유 출력)
   - stdout: JSON 형태로 차단 정보 출력

2. settings.local.json에 등록
   - matcher: 어떤 도구에 반응할지 (Bash, Edit|Write, Agent, Task, TeamDelete)
   - 이벤트: PreToolUse / TaskCompleted / PostToolUse
   - timeout: 기본 5000~15000ms, 최대 120000ms

3. 테스트
   - __tests__/hooks/ 에 테스트 스크립트 작성
   - 정상/경계/실패 케이스 최소 3개
   - chain-e2e-realworld.test.ts에 통합 테스트 추가

4. 문서 업데이트
   - 이 플레이북 Chapter 3 hook 목록에 추가
   - CLAUDE.md 하네스 섹션에 반영 (필요 시)
```

### 새 팀 추가 시 필요한 hook 변경

```
필수 변경:
  - validate-delegate.sh: 새 팀 리더 pane 식별 패턴 추가
  - team-context-resolver.sh: 새 팀 식별자 (TEAM 패턴 매칭) 추가
  - hook-self-register.sh: get_my_role() 에 새 역할 매핑 추가
  - pdca-chain-handoff.sh: 새 팀으로의 핸드오프 경로 추가

선택 변경:
  - validate-deploy-authority.sh: 배포 권한 필요 시
  - coo-watchdog.sh: 새 게이트 추가 시
  - detect-work-type.sh: 새 작업 유형 패턴 추가 시
```

### hook 수정 시 주의사항

```
절대 규칙:
  - .claude/hooks/ 수정 금지 → .bkit/hooks/만 수정
  - 기존 hook 로직 최소 변경, 추가 위주
  - exit 코드 규약: 0=통과, 1=에러(무시), 2=차단(에이전트에 사유 전달)
  - timeout 초과 시 hook은 무시됨 (차단 안 됨) → 중요 hook은 timeout 넉넉히

테스트 필수:
  - 수정 전 기존 테스트 실행 → 통과 확인
  - 수정 후 새 테스트 추가 → 전체 실행
  - chain-e2e-realworld.test.ts 영향 없음 확인
```

---

# Chapter 4. 대시보드 DB 설계

## 4.1 단일 소스 원칙: 왜 대시보드 DB인가

### 문제

여러 곳에 상태가 분산되어 있으면:
- 모찌가 어디를 봐야 하는지 모름
- Smith님이 진행 상황을 파악할 수 없음
- 파일/구두/슬랙만으로 보고하면 추적 불가
- "완료됐는데 문서에 없음" = 모찌 책임

### 해결: 대시보드 DB가 단일 진실 소스 (Single Source of Truth)

```
절대원칙 A0-2:
  Track A의 모든 상태는 대시보드 DB가 단일 진실 소스.
  파일/구두/슬랙만으로 보고 = 미완료.
  
  완료 = 커밋 + TaskCompleted hook + 대시보드 DB 업데이트 + 슬랙 보고
  전부 없으면 미완료.
```

### 대시보드 DB의 역할

```
┌──────────────────────────────────────────────────────────────┐
│                   대시보드 DB 위치                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  Smith님이 보는 것:                                            │
│  ┌─────────────┐                                             │
│  │ 모바일 위젯  │ ← 대시보드 DB 읽기 (summary 뷰)              │
│  └─────────────┘                                             │
│                                                              │
│  모찌가 보는 것:                                                │
│  ┌─────────────┐                                             │
│  │ 대시보드 UI  │ ← 대시보드 DB 읽기 (상세 뷰)                  │
│  │ heartbeat   │ ← 대시보드 DB 읽기 (실시간 패트롤)             │
│  └─────────────┘                                             │
│                                                              │
│  팀이 쓰는 것:                                                  │
│  ┌─────────────┐                                             │
│  │ hook 체인    │ ── 대시보드 DB 쓰기                           │
│  │ TaskCompleted│ (task-completed.sh → dashboard-sync.sh)     │
│  └─────────────┘                                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

## 4.2 데이터 흐름

```
┌─────────────────────────────────────────────────────────────────────────┐
│                       데이터 흐름 전체도                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  [팀 작업]                                                               │
│      │                                                                  │
│      ▼                                                                  │
│  hook 실행 (PreToolUse / TaskCompleted / PostToolUse)                    │
│      │                                                                  │
│      ├─→ .bkit/runtime/task-state-{feature}.json   ← 게이트 상태         │
│      ├─→ .bkit/runtime/chain-status-{feature}.json ← 체인 상태           │
│      ├─→ .bkit/state/pdca-status.json             ← PDCA 전체 상태      │
│      └─→ .bkit/runtime/coo-ack/{slug}.json        ← COO ACK 상태       │
│      │                                                                  │
│      ▼                                                                  │
│  dashboard-sync.sh (TaskCompleted 체인에서 호출)                          │
│      │                                                                  │
│      ├─→ JSON 파일 읽기 (task-state, chain-status, pdca-status)          │
│      ├─→ md5 비교 (변경 시만 업로드)                                      │
│      └─→ 대시보드 DB 업데이트 (GCS 직접 업로드 or API 호출)                │
│      │                                                                  │
│      ▼                                                                  │
│  [대시보드 UI]                                                            │
│      │                                                                  │
│      ├─→ 팀 상태 페이지 (agent-dashboard)                                │
│      ├─→ PDCA 진행률 페이지                                              │
│      ├─→ COO 상태 페이지 (v2)                                            │
│      ├─→ Living Context 페이지 (v2)                                      │
│      └─→ Peers 연결 페이지 (v2)                                          │
│      │                                                                  │
│      ▼                                                                  │
│  [모찌 heartbeat 패트롤]                                                  │
│      │                                                                  │
│      ├─→ 미응답 게이트 체크                                               │
│      ├─→ idle 팀원 감지                                                   │
│      ├─→ 체인 교착 감지                                                   │
│      └─→ 이상 발생 시 Slack 알림 or Smith님 보고                           │
│      │                                                                  │
│      ▼                                                                  │
│  [Smith님 모바일 위젯]                                                     │
│      │                                                                  │
│      ├─→ 오늘 완료된 TASK 수                                              │
│      ├─→ 진행 중인 TASK 목록                                              │
│      ├─→ 차단된 TASK (에스컬레이션 필요)                                   │
│      └─→ 마지막 활동 시간                                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## 4.3 현재 스키마 요약

### task-state-{feature}.json (통합 TASK 상태)

```json
{
  "version": "2.0",
  "task": "TASK-SLACK-NOTIFICATION",
  "feature": "slack-notification",
  "type": "DEV-L2",
  "assignee": "sdk-cto-main",
  "pdca": {
    "currentPhase": "do",
    "previousPhase": "design",
    "phaseHistory": [
      { "phase": "plan", "enteredAt": "2026-03-31T10:00:00Z", "exitedAt": "2026-03-31T11:00:00Z" },
      { "phase": "design", "enteredAt": "2026-03-31T11:00:00Z", "exitedAt": "2026-03-31T13:00:00Z" },
      { "phase": "do", "enteredAt": "2026-03-31T13:00:00Z", "exitedAt": null }
    ]
  },
  "gates": {
    "plan": { "done": true, "file": "docs/01-plan/features/slack-notification.plan.md" },
    "design": { "done": true, "file": "docs/02-design/features/slack-notification.design.md" },
    "dev": { "done": false },
    "commit": { "done": false },
    "deploy": { "done": false },
    "report": { "done": false }
  },
  "context": {
    "livingContextFiles": [
      "CLAUDE.md",
      "docs/adr/ADR-001-account-ownership.md",
      "docs/adr/ADR-002-service-context.md",
      "docs/01-plan/features/slack-notification.plan.md",
      "docs/02-design/features/slack-notification.design.md"
    ],
    "lastContextLoadAt": "2026-03-31T13:00:00Z"
  },
  "chain": {
    "currentStep": "cto_do",
    "messages": [
      { "type": "TASK_ASSIGN", "from": "MOZZI", "to": "PM_LEADER", "at": "2026-03-31T10:00:00Z" },
      { "type": "COMPLETION_REPORT", "from": "PM_LEADER", "to": "MOZZI", "at": "2026-03-31T13:00:00Z" },
      { "type": "TASK_ASSIGN", "from": "MOZZI", "to": "CTO_LEADER", "at": "2026-03-31T13:05:00Z" }
    ]
  },
  "created_at": "2026-03-31T10:00:00Z",
  "updated_at": "2026-03-31T13:05:00Z"
}
```

### coo-state.json (COO 상태 추적)

```json
{
  "version": "1.0",
  "role": "COO",
  "session": "mozzi-main",
  "status": "active",
  "pendingAcks": [],
  "pendingReports": [],
  "pendingQueries": [],
  "lastActivity": "2026-03-31T13:05:00Z",
  "metrics": {
    "avgAckTimeMs": 120000,
    "avgReportTimeMs": 300000,
    "missedAcks": 0,
    "missedReports": 1,
    "totalProcessed": 15
  }
}
```

### pdca-status.json (PDCA 전체 상태)

```json
{
  "version": "2.0",
  "primaryFeature": "slack-notification",
  "features": {
    "slack-notification": {
      "phase": "do",
      "plan": { "done": true, "file": "..." },
      "design": { "done": true, "file": "..." },
      "implementation": { "done": false },
      "check": { "done": false },
      "matchRate": null,
      "startedAt": "2026-03-31T10:00:00Z"
    }
  },
  "activeFeatures": ["slack-notification"]
}
```

### peer-map.json (peer 식별 매핑)

```json
{
  "CTO_LEADER": {
    "peerId": "dx4c3yjb",
    "ccPid": 28410,
    "registeredAt": "2026-03-31T10:00:00Z"
  },
  "PM_LEADER": {
    "peerId": "ab7k2mzx",
    "ccPid": 29100,
    "registeredAt": "2026-03-31T10:01:00Z"
  },
  "MOZZI": {
    "peerId": "qw9p4tnc",
    "ccPid": 30200,
    "registeredAt": "2026-03-31T09:55:00Z"
  }
}
```

## 4.4 hook이 DB에 어떻게 쓰는가

### TaskCompleted 체인 → DB 업데이트 흐름

```
TaskCompleted 이벤트 발생
    │
    ▼
1. task-completed.sh
   → task-state-{feature}.json 의 현재 게이트를 done: true로 업데이트
   → updated_at 갱신

2. task-quality-gate.sh
   → match-rate-parser.sh로 Gap 분석 결과 파싱
   → Match Rate 기록
   → 90% 미달 시 재작업 플래그 설정

3. gap-analysis.sh
   → Design vs 구현 비교
   → docs/03-analysis/{feature}.analysis.md 생성

4. pdca-update.sh
   → pdca-status.json 의 현재 phase 업데이트
   → 다음 phase로 전환 (조건 충족 시)

5. notify-completion.sh
   → Slack API 호출 (채널: C0AN7ATS4DD)
   → 실패해도 exit 0 (체인 차단 안 함)

6. deploy-trigger.sh
   → 배포 조건 확인 (Match Rate ≥ 95%)
   → 조건 충족 시 배포 실행

7. deploy-verify.sh
   → Cloud Run 로그 확인 (에러 0건)
   → 핵심 플로우 1회 실행

8. pdca-chain-handoff.sh
   → peer-map.json에서 다음 역할 peerId 조회
   → claude-peers send_message 전송
   → chain-status-{feature}.json 업데이트
```

## 4.5 모찌가 DB를 어떻게 읽는가

### heartbeat 패트롤 쿼리

모찌는 주기적으로 (coo-watchdog.sh, 1분 간격) 다음을 확인:

```
1. 미응답 ACK 체크
   → .bkit/runtime/chain-status-*.json 순회
   → 게이트 전부 done인데 coo-ack/ 파일 없음
   → 경과 > 5분 → Slack 알림

2. Smith님 보고 지연 체크
   → coo-ack/ 존재 + smith-report/ 없음
   → ACK 시각 기준 경과 > 15분 → Slack 알림

3. idle 팀원 감지
   → peer-map.json + tmux list-panes 교차 확인
   → 활동 없는 pane → 좀비 후보 목록 생성

4. 체인 교착 감지
   → task-state-*.json 중 updated_at이 30분 이상 정체
   → 교착 후보 → 에스컬레이션 트리거
```

### 모찌가 읽는 파일 목록

```
.bkit/runtime/
├── task-state-*.json          ← 각 TASK 상태 (게이트, 체인, 컨텍스트)
├── chain-status-*.json        ← 체인 진행 상태
├── coo-state.json             ← 자신의 메트릭/대기 목록
├── coo-ack/{slug}.json        ← ACK 이력
├── smith-report/{slug}.json   ← Smith님 보고 이력
├── coo-answers/{slug}.json    ← 질의 응답 이력
└── peer-map.json              ← 팀 peer 매핑

.bkit/state/
├── pdca-status.json           ← PDCA 전체 상태
└── session-history.json       ← 세션 이력
```

## 4.6 Smith님이 모바일 위젯으로 보는 것

### 위젯 데이터 구성

```
┌───────────────────────────────────────┐
│         bscamp 에이전트 현황            │
├───────────────────────────────────────┤
│                                       │
│  오늘 완료: 3건  │  진행 중: 2건        │
│  차단됨: 0건     │  대기: 1건           │
│                                       │
│  ─────────────────────────────────── │
│                                       │
│  🟢 slack-notification (L2)           │
│     Do 단계 — CTO 구현 중              │
│     Match Rate: —                     │
│                                       │
│  🟢 agent-harness-v2 (L2)            │
│     Check 단계 — Gap 분석 중           │
│     Match Rate: 92%                   │
│                                       │
│  ─────────────────────────────────── │
│                                       │
│  마지막 활동: 3분 전                    │
│  팀 상태: CTO(활성) PM(대기) MKT(비활성)│
│                                       │
└───────────────────────────────────────┘
```

### 위젯 데이터 소스

```
오늘 완료: pdca-status.json + coo-ack/ 시간 필터
진행 중:   task-state-*.json 중 phase != "completed"
차단됨:    task-state-*.json 중 gates에 blocked 존재
대기:      task-state-*.json 중 assignee 없음

기능별 상세:
  이름:       task-state.task
  레벨:       task-state.type
  단계:       task-state.pdca.currentPhase
  Match Rate: pdca-status.features[slug].matchRate
  
팀 상태:     peer-map.json + tmux list-sessions
마지막 활동:  task-state-*.json 중 max(updated_at)
```

---

# Chapter 5. 완료 기준 & Match Rate

## 5.1 완료의 정의

### 5가지 조건 전부 충족해야 "완료"

```
완료 = 커밋 + push + 배포 성공 검증 + TaskCompleted hook + 대시보드 DB 업데이트 + 슬랙 보고
```

| # | 조건 | 확인 방법 | 없으면 |
|---|------|----------|--------|
| 1 | **커밋** | `git log --oneline -1` 에 해당 기능 커밋 존재 | 산출물 유실 위험 |
| 2 | **push + 배포 성공** | `git push` 성공 + Cloud Run 배포 + 헬스체크 HTTP 200 | push만으론 불충분. 아래 빈 구멍 참조 |
| 3 | **TaskCompleted hook** | task-completed.sh 실행됨 (task-state JSON 업데이트) | 대시보드에 반영 안 됨 |
| 3 | **대시보드 DB 업데이트** | task-state-{feature}.json 모든 게이트 done | 모찌가 상태 파악 불가 |
| 4 | **슬랙 보고** | notify-completion.sh 실행 → Slack 메시지 | Smith님에게 전달 안 됨 |

### 레벨별 추가 조건

| 레벨 | 기본 4조건 + 추가 |
|------|------------------|
| L0 | 기본 4조건 + 배포 성공 + Cloud Run 로그 에러 0건 |
| L1 | 기본 4조건 |
| L2 | 기본 4조건 + Gap 분석 문서 + Match Rate ≥ 90% + tsc+build 통과 |
| L3 | 기본 4조건 + Gap 분석 문서 + Match Rate ≥ 95% + tsc+build 통과 + Smith님 최종 확인 |

### 완료 처리 순서 (리더 필수 행동)

```
1. tsc + lint + build 통과 확인
2. git add . && git commit (산출물 커밋)
3. git push (원격 저장소 반영)
4. task를 completed 상태로 변경 (TaskCompleted hook 발동)
5. hook 체인 자동 실행:
   task-completed → quality-gate → gap-analysis → pdca-update
   → notify-completion → deploy-trigger → deploy-verify → chain-handoff
```

## 5.2 Match Rate 90% 기준 적용 방식

### Match Rate란?

Design 문서에 정의한 산출물과 실제 구현 코드의 일치율.

```
Match Rate = (구현된 항목 수 / Design에 정의된 총 항목 수) × 100
```

### 레벨별 적용

| 레벨 | Match Rate 기준 | 적용 여부 |
|------|----------------|----------|
| L0 | — | 미적용 (Design 없음) |
| L1 | — | 미적용 (Design 없음) |
| L2 | **90%** 이상 | 필수 적용 |
| L3 | **95%** 이상 | 필수 적용 (보안/인프라 민감) |

### Match Rate 계산 항목

```
Design 문서에서 추출하는 항목:
  1. 파일 목록 — 생성/수정해야 할 파일 경로
  2. 함수/클래스 — 정의해야 할 함수/클래스명
  3. API 엔드포인트 — 구현해야 할 API 경로
  4. UI 컴포넌트 — 렌더링해야 할 컴포넌트
  5. TDD 케이스 — 통과해야 할 테스트
  6. 데이터 스키마 — 정의해야 할 타입/테이블

구현 코드에서 확인하는 항목:
  1. 파일 존재 여부 (경로 매칭)
  2. 함수/클래스 존재 여부 (grep)
  3. API 라우트 존재 여부 (경로 매칭)
  4. 컴포넌트 렌더링 여부 (파일 내 export)
  5. 테스트 통과 여부 (vitest 결과)
  6. 타입/테이블 정의 여부 (grep)
```

## 5.3 Gap 분석 방법

### gap-analysis.sh 동작 원리

```
1. Design 문서 파싱
   → docs/02-design/features/{feature}.design.md 읽기
   → 산출물 목록 추출 (파일 경로, 함수명, API 경로 등)

2. 구현 코드 확인
   → 각 산출물에 대해 파일/함수/API 존재 여부 확인
   → grep, find 등으로 매칭

3. Match Rate 계산
   → 존재하는 항목 / 전체 항목 × 100

4. 분석 문서 생성
   → docs/03-analysis/{feature}.analysis.md 생성
   → 매칭 상세 (✅ 구현됨 / ❌ 미구현 / ⚠️ 부분 구현)
   → 최종 Match Rate 기록

5. 판정
   → Match Rate ≥ 기준 → 통과 (task-quality-gate.sh에서 확인)
   → Match Rate < 기준 → 재작업 플래그
```

### Gap 분석 문서 템플릿

```markdown
# Gap 분석: {feature명}

> 분석일: {YYYY-MM-DD}
> Design: docs/02-design/features/{feature}.design.md
> Match Rate: {XX}%

## 산출물 매칭

| # | Design 항목 | 구현 상태 | 파일/위치 | 비고 |
|---|------------|----------|----------|------|
| 1 | {파일/함수/API} | ✅/❌/⚠️ | {경로} | {설명} |

## 요약

- 전체 항목: {N}개
- 구현 완료: {M}개
- 미구현: {K}개
- Match Rate: {M/N × 100}%

## 미구현 항목 상세

{각 미구현 항목의 이유와 필요한 작업}
```

## 5.4 빈 구멍: push_verified vs 배포 성공 검증

### 현재 상태

```
현재 완료 체인:
  git push (push_verified) ────→ TaskCompleted ────→ notify-completion
         ✅ 체크됨                                    ✅ Slack 보고

  Cloud Run 배포 ────→ 서비스 헬스체크 (HTTP 200)
         ⚠️ deploy-trigger.sh    ❌ 실제 HTTP 체크 미구현
            등록은 돼 있으나
            조건부 실행
```

### 문제

`push_verified`는 `git push origin main` 성공 여부만 확인한다.
하지만 **git push 성공 ≠ Cloud Run 배포 성공 ≠ 서비스 정상**.

3단계 검증이 필요하지만 현재는 1단계(push)만 체크:

```
1단계: git push 성공     ← 현재 push_verified가 체크하는 범위
2단계: Cloud Run 배포 성공 ← deploy-trigger.sh 조건부 (L0/L2/L3만)
3단계: 서비스 정상 (HTTP 200 + 에러 로그 0건) ← deploy-verify.sh 미구현
```

### PM-001 교훈

> "배포 성공 ≠ 서비스 정상. 프로덕션 로그 확인 필수."
> gcloud run deploy 성공 메시지를 받았지만, 실제 서비스에서 환경변수 누락으로 전체 장애.

### 목표 구조 (구현 필요)

```
[TaskCompleted]
    │
    ▼
deploy-trigger.sh
    │ 조건: L0/L2/L3 + Match Rate ≥ 95%
    │
    ▼
gcloud run deploy (Cloud Run 배포)
    │
    ▼
deploy-verify.sh (강화 필요)
    ├── gcloud run services describe → status: Ready 확인
    ├── curl -sf {서비스URL}/api/health → HTTP 200 확인
    ├── gcloud logging read → 최근 5분 에러 0건 확인
    └── 실패 시: Slack 알림 "배포 성공했으나 서비스 이상" + 롤백 고려
```

### 필요한 변경

1. **deploy-verify.sh 강화**: HTTP 헬스체크 + Cloud Run 로그 에러 체크 추가
2. **task-state JSON에 deploy_verified 게이트 추가**: `{ "push": done, "deploy": done, "healthcheck": done }` 3단계 분리
3. **deploy 실패 시 체인 차단**: 현재 deploy-verify.sh는 exit 0 (무조건 통과) → 실패 시 exit 2로 차단

## 5.5 90% 미달 시 재지시 루프 흐름

```
[TaskCompleted]
    │
    ▼
task-quality-gate.sh
    │
    ├── Match Rate ≥ 90% (L2) or ≥ 95% (L3)
    │   → 통과 → 다음 체인 단계로
    │
    └── Match Rate < 기준
        │
        ▼
    재작업 루프 시작:
        │
        ├── 1. Gap 분석 결과에서 미구현 항목 추출
        │
        ├── 2. CTO에게 재지시 메시지 전송
        │      "Match Rate {XX}% (기준 {90/95}% 미달)"
        │      "미구현 항목:"
        │      "  - {항목1}: {이유}"
        │      "  - {항목2}: {이유}"
        │
        ├── 3. CTO가 미구현 항목 구현
        │
        ├── 4. 다시 TaskCompleted → Gap 분석 → Match Rate 재계산
        │
        └── 5. 기준 충족까지 반복 (최대 3회)
            │
            └── 3회 초과 → COO 에스컬레이션
                → "3회 재작업 후에도 기준 미달. 확인 필요."
```

## 5.6 "완료처럼 보이지만 미완료인 케이스"

실제 실패 사례를 기반으로 정리한 위험 패턴:

### 케이스 1: tsc+build 통과했지만 런타임 에러 (PM-001)

```
상황: Supabase → Cloud SQL 마이그레이션. tsc+build 전부 통과.
실제: .insert().select() 체이닝이 SELECT로 변환 → 쓰기 기능 전면 장애.
교훈: tsc+build 통과 ≠ 런타임 정상. SQL 문자열은 타입 체크 불가.
방지: L2/L3는 런타임 플로우 QA 필수 (로그인→글작성→조회→댓글).
```

### 케이스 2: 커밋했지만 push 안 함

```
상황: 팀원이 git commit까지 하고 "완료"라고 보고.
실제: git push를 안 해서 원격 저장소에 반영 안 됨. 다음 세션에서 유실.
교훈: 커밋 + push + TaskCompleted 3개가 세트.
방지: 리더 필수 행동 체크리스트 (커밋 → push → completed).
```

### 케이스 3: 배포 성공했지만 서비스 장애 (PM-001 교훈)

```
상황: gcloud run deploy 성공 메시지 확인. "배포 완료"라고 보고.
실제: Cloud Run 로그에 에러 수백 건. 환경변수 누락.
교훈: 배포 성공 ≠ 서비스 정상. 프로덕션 로그 확인 필수.
방지: deploy-verify.sh에서 로그 확인 + 핵심 플로우 1회 실행.
```

### 케이스 4: Gap 분석 없이 "완료" 보고

```
상황: 구현 끝나고 바로 "완료"라고 보고. Gap 분석 스킵.
실제: Design에 있는 API 3개 중 1개 미구현. Match Rate 67%.
교훈: 구현 완료 ≠ PDCA 완료. Check(Gap 분석) 필수.
방지: task-quality-gate.sh가 Match Rate 체크. 미달 시 재작업.
```

### 케이스 5: Slack 보고만 하고 DB 업데이트 안 함

```
상황: Slack에 "완료했습니다" 메시지. 하지만 task-state JSON 미업데이트.
실제: 대시보드에 "진행 중"으로 표시. 모찌가 상태 파악 불가.
교훈: 슬랙 보고만으로는 미완료. DB 업데이트가 진실 소스.
방지: notify-completion.sh + task-completed.sh가 세트로 실행.
```

### 케이스 6: 무한 커밋 루프 (PM-005)

```
상황: dashboard-sync 스크립트가 1분마다 git commit+push. 7,396건 커밋.
실제: GitHub Actions 메일 폭탄 + git 히스토리 오염.
교훈: 자동화 스크립트에 (1) 변경 감지 (2) 실행 간격 제한 (3) 정지 메커니즘 필수.
방지: md5 비교로 변경 시만 업로드. git commit 자동화 금지.
```

---

# Chapter 6. 차단 & 에스컬레이션 프로토콜

## 6.1 차단 발생 유형별 처리 흐름

### 유형 1: validate-plan 차단 — Plan 파일 없음

```
┌──────────────────────────────────────────────────────────┐
│  상황: CTO가 코드 수정 시도 → validate-plan.sh 차단         │
│  이유: docs/01-plan/features/{feature}.plan.md 없음        │
│  레벨: L2-기능, L3                                         │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. hook 출력:                                            │
│     {                                                    │
│       "blocked": "validate-plan",                        │
│       "reason": "Plan 파일 없음",                          │
│       "needs": "PM_PLAN",                                │
│       "task": "TASK-{feature}",                          │
│       "notify": "PM_LEADER"                              │
│     }                                                    │
│                                                          │
│  2. CTO가 PM에게 자동 요청 (claude-peers):                  │
│     "Plan 파일이 필요합니다: {feature}.plan.md"              │
│     "TASK: {task명}"                                      │
│                                                          │
│  3. PM이 Plan 작성 완료                                    │
│     → docs/01-plan/features/{feature}.plan.md 생성         │
│                                                          │
│  4. CTO가 다시 코드 수정 시도                               │
│     → validate-plan.sh 통과                               │
│     → 작업 재개                                            │
│                                                          │
│  ※ PM 오프라인 시:                                         │
│     30분 대기 → COO 에스컬레이션                            │
│     → 모찌가 PM 세션 확인 or 직접 Plan 작성 판단             │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 유형 2: validate-design 차단 — Design 파일 없음

```
┌──────────────────────────────────────────────────────────┐
│  상황: CTO가 코드 수정 시도 → validate-design.sh 차단       │
│  이유: docs/02-design/features/{feature}.design.md 없음    │
│  레벨: L1(일부), L2, L3                                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  처리: validate-plan과 동일 흐름.                           │
│  PM에게 Design 요청 → PM 작성 → 재개                       │
│                                                          │
│  ※ L1에서 차단 시:                                         │
│     detect-process-level.sh 결과 확인                      │
│     → L1이면 Design 스킵 가능 (hook 분기)                  │
│     → L2 이상이면 반드시 Design 필요                        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 유형 3: task-quality-gate 차단 — Match Rate 미달

```
┌──────────────────────────────────────────────────────────┐
│  상황: TaskCompleted 후 → task-quality-gate.sh 차단        │
│  이유: Match Rate < 90% (L2) 또는 < 95% (L3)              │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. hook 출력:                                            │
│     {                                                    │
│       "blocked": "task-quality-gate",                    │
│       "reason": "Match Rate 85% (기준 90%)",               │
│       "needs": "REWORK",                                 │
│       "missingItems": [                                  │
│         "API /api/slack/test 미구현",                      │
│         "에러 핸들링 함수 누락"                               │
│       ],                                                 │
│       "notify": "CTO_LEADER"                             │
│     }                                                    │
│                                                          │
│  2. CTO가 미구현 항목 확인                                  │
│     → Gap 분석 문서 참조                                    │
│     → 미구현 항목 구현                                      │
│                                                          │
│  3. 다시 TaskCompleted                                    │
│     → Gap 재분석 → Match Rate 재계산                       │
│                                                          │
│  4. 기준 충족 → 통과 → 체인 계속                             │
│                                                          │
│  ※ 3회 재작업 후에도 미달:                                   │
│     COO 에스컬레이션                                       │
│     → Design 재검토 필요? Design 자체가 과도?               │
│     → Smith님 판단 요청                                    │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 유형 4: destructive-detector 차단 — 위험 명령

```
┌──────────────────────────────────────────────────────────┐
│  상황: rm -rf, git push --force, DROP TABLE 등 실행 시도    │
│  이유: 위험 명령 감지                                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. 즉시 차단. 실행 안 됨.                                  │
│                                                          │
│  2. hook 출력:                                            │
│     {                                                    │
│       "blocked": "destructive-detector",                 │
│       "reason": "위험 명령 감지: rm -rf",                    │
│       "command": "{실행 시도한 명령}",                       │
│       "notify": "MOZZI"                                  │
│     }                                                    │
│                                                          │
│  3. COO에 즉시 에스컬레이션                                 │
│     → 모찌가 명령 필요성 판단                                │
│     → 정당한 경우: 대안 경로 제시 (mv 등)                    │
│     → 부적절한 경우: 차단 유지 + 팀원 경고                    │
│                                                          │
│  ※ 우회 불가. hook 차단은 settings.local.json 수정 필요.    │
│     .claude/hooks/ 수정 금지 규칙이 이중 방어.               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 유형 5: validate-delegate 차단 — 리더 코드 수정

```
┌──────────────────────────────────────────────────────────┐
│  상황: 리더(pane 0)가 src/ 파일 수정 시도                    │
│  이유: "리더=코드 안 씀" 원칙                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  1. 차단. src/ 수정 불가.                                   │
│                                                          │
│  2. 리더는:                                               │
│     → 팀원에게 해당 수정 위임 (SendMessage)                  │
│     → 팀원이 구현 → 리더가 결과 검증 (Read)                  │
│                                                          │
│  ※ 배포 명령 (gcloud)은 별도 hook (validate-deploy-authority)│
│     → 리더만 허용 (PM-004 교훈)                             │
│                                                          │
│  ※ "리더=아무것도 안 함"이 아니라 "리더=코드 안 씀"            │
│     코드 수정 차단 vs 인프라 명령 허용은 구분 (PM-004)        │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 유형 6: 완료 보고 Slack DM 미전송 — Smith님 알림 누락

```
┌──────────────────────────────────────────────────────────┐
│  상황: TaskCompleted 발생 → notify-completion.sh 실행      │
│        → webhook(18789)으로 COO에만 신호                   │
│        → Smith님 Slack DM 자동 발송 안 됨                   │
│  이유: notify-completion.sh가 채널(C0AN7ATS4DD)에만 보고    │
│        Smith님 DM(D09V1NX98SK)으로의 직접 알림 미구현        │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  현재 흐름 (불완전):                                       │
│                                                          │
│  TaskCompleted                                           │
│      │                                                   │
│      ▼                                                   │
│  notify-completion.sh                                    │
│      ├─→ webhook :18789 → COO 수신     ✅               │
│      ├─→ Slack 채널 C0AN7ATS4DD         ✅ (팀 공유)     │
│      └─→ Smith님 DM D09V1NX98SK         ❌ 미구현        │
│                                                          │
│  목표 흐름 (완전):                                         │
│                                                          │
│  TaskCompleted                                           │
│      │                                                   │
│      ▼                                                   │
│  notify-completion.sh                                    │
│      ├─→ webhook :18789 → COO 수신     ✅               │
│      ├─→ Slack 채널 C0AN7ATS4DD         ✅ (팀 공유)     │
│      └─→ Slack DM D09V1NX98SK           ✅ Smith님 직접  │
│          │                                               │
│          └─→ 메시지 형식:                                  │
│              "✅ TASK 완료: {task명}"                      │
│              "레벨: L{N} | Match Rate: {XX}%"             │
│              "커밋: {hash} | 파일: {N}개"                  │
│              "담당: {팀명}"                                │
│                                                          │
│  필요한 변경:                                              │
│  1. notify-completion.sh에 Slack DM 전송 로직 추가         │
│     - chat.postMessage API, channel: D09V1NX98SK         │
│     - SLACK_BOT_TOKEN 환경변수 사용                        │
│  2. DM 전송 실패해도 exit 0 (체인 차단 안 함)              │
│  3. 완료 보고 = 채널 + DM + webhook 3중 전송이 기본값       │
│                                                          │
│  근거:                                                    │
│  - 절대원칙 A0-2: 완료 = 커밋 + hook + DB + Slack 보고     │
│  - Smith님은 Slack 채널을 실시간 모니터링 안 함              │
│  - DM이어야 모바일 푸시 알림으로 즉시 인지 가능              │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

## 6.2 자동 요청 메시지 포맷 (claude-peers)

### 표준 메시지 구조

```json
{
  "protocol": "bscamp-team/v1",
  "type": "RESOURCE_REQUEST",
  "from": "{요청 역할}",
  "to": "{대상 역할}",
  "task": "{TASK명}",
  "blocked_by": "{차단 hook명}",
  "needs": "{필요한 산출물}",
  "details": "{상세 설명}",
  "urgency": "{low|medium|high|critical}",
  "timeout_minutes": 30
}
```

### 메시지 유형별 예시

**Plan 요청** (CTO → PM):
```json
{
  "type": "RESOURCE_REQUEST",
  "from": "CTO_LEADER",
  "to": "PM_LEADER",
  "task": "TASK-SLACK-NOTIFICATION",
  "blocked_by": "validate-plan",
  "needs": "Plan 문서: docs/01-plan/features/slack-notification.plan.md",
  "urgency": "high",
  "timeout_minutes": 30
}
```

**Design 요청** (CTO → PM):
```json
{
  "type": "RESOURCE_REQUEST",
  "from": "CTO_LEADER",
  "to": "PM_LEADER",
  "task": "TASK-SLACK-NOTIFICATION",
  "blocked_by": "validate-design",
  "needs": "Design 문서: docs/02-design/features/slack-notification.design.md",
  "urgency": "high",
  "timeout_minutes": 30
}
```

**완료 보고** (CTO → COO):
```json
{
  "type": "COMPLETION_REPORT",
  "from": "CTO_LEADER",
  "to": "MOZZI",
  "task": "TASK-SLACK-NOTIFICATION",
  "chain_step": "cto_to_coo",
  "payload": {
    "matchRate": 95,
    "commitHash": "abc1234",
    "filesChanged": 12,
    "deployed": true
  }
}
```

**에스컬레이션** (팀 → COO):
```json
{
  "type": "ESCALATION",
  "from": "CTO_LEADER",
  "to": "MOZZI",
  "task": "TASK-SLACK-NOTIFICATION",
  "reason": "3회 재작업 후에도 Match Rate 87%. Design 재검토 필요.",
  "urgency": "critical",
  "attempted": ["재구현 3회", "Design 재참조", "TDD 추가"]
}
```

## 6.3 에스컬레이션 단계

```
단계 1: 팀 간 해결 (자동)
─────────────────────────
  CTO ←→ PM 직접 통신 (claude-peers)
  타임아웃: 30분
  범위: Plan/Design 요청, 기술 질의, 리소스 요청

      │
      ▼ (30분 초과 or 해결 불가)

단계 2: COO 개입
─────────────────────────
  팀 → 모찌 에스컬레이션
  타임아웃: 5분 (ACK) + 15분 (해결)
  범위: 팀 간 교착 해제, 우선순위 조정, 대안 제시

      │
      ▼ (해결 불가 or 의사결정 필요)

단계 3: Smith님 보고
─────────────────────────
  모찌 → Smith님 보고
  범위: 방향 변경, 기능 삭제/추가, 아키텍처 결정
  형식: 레벨 + 문제 요약 + 옵션 2개 + 추천
```

## 6.4 "막혔으니 안 함" 금지 원칙 (A0-6) 적용 예시

### 잘못된 행동 예시

```
❌ "Design 파일이 없어서 구현을 시작할 수 없습니다."
   → 차단 사유만 보고하고 정지.

❌ "PM이 오프라인이라 Design을 요청할 수 없습니다."
   → 대기만 하고 다른 작업도 안 함.

❌ "Match Rate 85%인데 더 올리기 어렵습니다."
   → 재작업 포기.
```

### 올바른 행동 예시

```
✅ "Design 파일이 없습니다. PM에게 요청했습니다. 대기 중 다른 Feature를 진행합니다."
   → 요청 + 병렬 작업.

✅ "PM이 오프라인입니다. COO에게 에스컬레이션합니다."
   → 30분 대기 후 에스컬레이션.

✅ "Match Rate 85%. 미구현 항목 2건을 확인했습니다. 지금 구현 시작합니다."
   → 미구현 항목 명확히 파악 후 즉시 재작업.

✅ "3회 재작업 후에도 87%. Design의 항목 3이 현재 아키텍처에서 불가능합니다. COO에게 Design 재검토를 요청합니다."
   → 구체적 사유 + 에스컬레이션.
```

## 6.5 빈 구멍 TDD 케이스

아래는 Ch.3 빈 구멍 5번(팀원 승인 규제 완화) + Ch.6 유형 6(Slack DM 자동 보고)에 대한 TDD 케이스.
구현 전 테스트 먼저 작성하고, 구현 후 전량 통과를 확인한다.

### TDD 세트 A: 팀원 승인 규제 완화 (approval-handler.sh 범위 축소)

> 디렉토리: `__tests__/hooks/approval-handler-scope/`

| # | 카테고리 | 테스트 명 | 설명 | bash 검증 명령 |
|---|:-------:|---------|------|---------------|
| A-01 | 🟢 정상 | 팀원 hook 수정 시 승인 없이 통과 | `IS_TEAMMATE=true`인 팀원이 `.bkit/hooks/gap-analysis.sh` 수정 시 approval-handler가 승인 요청 없이 exit 0 반환 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":".bkit/hooks/gap-analysis.sh"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 0 ] && ! ls .bkit/runtime/approvals/pending-* 2>/dev/null` |
| A-02 | 🟢 정상 | 팀원 .bkit/runtime/ 수정 시 승인 없이 통과 | 런타임 상태 파일 수정은 자유 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":".bkit/runtime/task-state-test.json"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 0 ]` |
| A-03 | 🟢 정상 | 팀원 .bkit/state/ 수정 시 승인 없이 통과 | PDCA 상태 파일 수정은 자유 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":".bkit/state/pdca-status.json"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 0 ]` |
| A-04 | 🟢 정상 | 팀원 src/ 수정 시 승인 없이 통과 | Design 범위 내 코드 수정은 자유 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":"src/app/page.tsx"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 0 ]` |
| A-05 | 🔴 차단 | 팀원 settings.local.json 수정 시 승인 필요 | hook 등록/권한 변경은 승인 필수 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":".claude/settings.local.json"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 2 ] && ls .bkit/runtime/approvals/pending-* 2>/dev/null` |
| A-06 | 🔴 차단 | 팀원 .env 수정 시 승인 필요 | 환경변수/시크릿 변경은 승인 필수 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":".env"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 2 ]` |
| A-07 | 🔴 차단 | 팀원 .env.local 수정 시 승인 필요 | .env 변형 파일도 동일 적용 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":".env.local"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 2 ]` |
| A-08 | 🔴 차단 | 팀원 migration 파일 수정 시 승인 필요 | DB 마이그레이션은 승인 필수 (L3 위험) | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":"src/lib/migration.ts"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 2 ]` |
| A-09 | 🔴 차단 | 팀원 migration 디렉토리 파일 수정 시 승인 필요 | migrations/ 경로 포함 파일도 차단 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":"migrations/001-create-table.sql"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 2 ]` |
| A-10 | 🟡 경계 | 리더(IS_TEAMMATE=false)는 기존 로직 유지 | 리더는 기존 validate-delegate.sh가 처리. approval-handler 범위 밖 | `IS_TEAMMATE=false TOOL_INPUT='{"file_path":".bkit/hooks/gap-analysis.sh"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 0 ]` |
| A-11 | 🟡 경계 | IS_TEAMMATE 미설정 시 기존 동작 (안전 모드) | 환경변수 없으면 기존 전체 승인 로직 유지 | `unset IS_TEAMMATE && TOOL_INPUT='{"file_path":".claude/settings.local.json"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1; [ $? -eq 2 ]` |
| A-12 | 🟡 경계 | 승인 차단 시 리더 tmux send-keys 알림 발생 | PM-003 교훈 유지: 차단 → 알림 → 해제 세트 | `IS_TEAMMATE=true TOOL_INPUT='{"file_path":".env"}' bash .bkit/hooks/helpers/approval-handler.sh 2>&1 | grep -q "send-keys"` |

### TDD 세트 B: Slack DM 자동 보고 (notify-completion.sh Smith님 DM)

> 디렉토리: `__tests__/hooks/notify-completion-dm/`

| # | 카테고리 | 테스트 명 | 설명 | bash 검증 명령 |
|---|:-------:|---------|------|---------------|
| B-01 | 🟢 정상 | TaskCompleted 시 Smith님 DM 전송 시도 | notify-completion.sh 실행 시 Slack API chat.postMessage가 channel=D09V1NX98SK로 호출됨 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="test-task" TASK_LEVEL="L2" MATCH_RATE="95" COMMIT_HASH="abc123" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -q "D09V1NX98SK"` |
| B-02 | 🟢 정상 | DM 메시지에 TASK명 포함 | 전송 페이로드에 task 이름이 포함됨 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="slack-notification" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -q "slack-notification"` |
| B-03 | 🟢 정상 | DM 메시지에 Match Rate 포함 | 전송 페이로드에 Match Rate 수치가 포함됨 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="test" MATCH_RATE="92" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -q "92"` |
| B-04 | 🟢 정상 | DM 메시지에 레벨 포함 | L0~L3 레벨 정보가 메시지에 포함됨 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="test" TASK_LEVEL="L3" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -q "L3"` |
| B-05 | 🟢 정상 | DM 메시지에 커밋 해시 포함 | 커밋 해시가 메시지에 포함됨 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="test" COMMIT_HASH="3c50c838" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -q "3c50c838"` |
| B-06 | 🟢 정상 | 채널 + DM + webhook 3중 전송 | notify-completion.sh 1회 실행으로 3곳 모두 전송 시도 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="test" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -c "chat.postMessage" | grep -q "^2$"` |
| B-07 | 🔴 에러 | DM 전송 실패해도 exit 0 | Slack API 에러 시에도 체인 차단 안 함 | `SLACK_BOT_TOKEN="invalid" TASK_NAME="test" bash .bkit/hooks/notify-completion.sh 2>/dev/null; [ $? -eq 0 ]` |
| B-08 | 🔴 에러 | SLACK_BOT_TOKEN 미설정 시 DM 스킵 + exit 0 | 토큰 없어도 체인 차단 안 함 | `unset SLACK_BOT_TOKEN && TASK_NAME="test" bash .bkit/hooks/notify-completion.sh 2>/dev/null; [ $? -eq 0 ]` |
| B-09 | 🔴 에러 | DM 전송 실패 시 에러 로그 기록 | error-log.json에 실패 사유 기록 | `SLACK_BOT_TOKEN="invalid" TASK_NAME="test" bash .bkit/hooks/notify-completion.sh 2>/dev/null && [ -f .bkit/runtime/error-log.json ] && jq -e '.[-1].target == "smith-dm"' .bkit/runtime/error-log.json` |
| B-10 | 🟡 경계 | 채널 전송 성공 + DM 전송 실패 → 부분 성공 로그 | 채널은 성공했지만 DM만 실패한 경우 구분 가능 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="test" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -q "channel:ok.*dm:failed\|dm:failed.*channel:ok"` |
| B-11 | 🟡 경계 | L0(긴급) 시 DM 메시지에 긴급 표시 | L0 프로덕션 장애 완료 보고는 "[긴급]" 접두사 | `SLACK_BOT_TOKEN="test-token" TASK_NAME="hotfix" TASK_LEVEL="L0" bash .bkit/hooks/notify-completion.sh 2>&1 | grep -q "긴급\|URGENT"` |
| B-12 | 🟡 경계 | webhook + Slack 둘 다 실패해도 exit 0 | 알림 전체 실패가 PDCA 체인을 차단하면 안 됨 | `SLACK_BOT_TOKEN="invalid" WEBHOOK_URL="http://invalid:18789" TASK_NAME="test" bash .bkit/hooks/notify-completion.sh 2>/dev/null; [ $? -eq 0 ]` |

### TDD 검증 순서

```
1. 테스트 파일 생성
   __tests__/hooks/approval-handler-scope/approval-scope.test.sh  (A-01 ~ A-12)
   __tests__/hooks/notify-completion-dm/notify-dm.test.sh          (B-01 ~ B-12)

2. 구현 전 실행 → 전량 FAIL 확인 (Red)

3. 구현
   - approval-handler.sh: 화이트리스트 매칭 로직 추가
   - notify-completion.sh: Slack DM 전송 로직 추가

4. 구현 후 실행 → 전량 PASS 확인 (Green)

5. 리팩터 (필요 시) → 재실행 → 전량 PASS 유지
```

---

# Chapter 7. 절대원칙 카탈로그

## 7.1 TIER 0 — 절대 불변

어떤 상황에서도 깨지면 안 되는 원칙. hook으로 80% 강제, 나머지 20%는 모찌+Smith님이 감시.

### [A0-1] T-PDCA 프로세스 준수

| 항목 | 내용 |
|------|------|
| **원칙** | 모찌가 TASK 작성 → Smith님 확인 → 팀 전달. 이 순서 역전 금지 |
| **위반 케이스** | 모찌가 Smith님 확인 없이 CTO에 직접 "이거 구현해"라고 전달 |
| **위반 시 영향** | 방향 틀린 구현 → 전량 폐기 → 시간 낭비 |
| **시스템 강제** | ⚠️ 부분 (coo_approved 게이팅 hook 구현 예정). 현재는 규칙으로만 강제 |
| **hook** | validate-task.sh (TASK 파일 유효성 검증) |

### [A0-2] 단일 소스 원칙

| 항목 | 내용 |
|------|------|
| **원칙** | Track A의 모든 상태는 대시보드 DB가 단일 진실 소스. 완료 = 커밋 + TaskCompleted + DB 업데이트 + Slack 보고. 전부 없으면 미완료 |
| **위반 케이스** | CTO가 Slack에만 "완료"라고 보고. task-state JSON 미업데이트 |
| **위반 시 영향** | 대시보드에 "진행 중" 표시 → 모찌가 상태 파악 불가 → 중복 작업 or 누락 |
| **시스템 강제** | ✅ TaskCompleted 체인에서 자동 업데이트 (task-completed.sh + notify-completion.sh) |
| **hook** | task-completed.sh, notify-completion.sh |

### [A0-3] 역할 경계 불침범

| 항목 | 내용 |
|------|------|
| **원칙** | Smith님: 정의. 모찌: 체계화. PM: Plan+Design. CTO: Do+QA. 각 역할 범위 침범 금지 |
| **위반 케이스 1** | CTO 리더가 src/ 코드 직접 수정 |
| **위반 케이스 2** | PM이 코드 구현 시도 |
| **위반 케이스 3** | 리더가 gcloud 인프라 명령어 직접 실행 (PM-004) |
| **위반 시 영향** | 역할 혼란 → 품질 저하 → 책임 소재 불명 |
| **시스템 강제** | ✅ validate-delegate.sh (리더 src/ 수정 차단), enforce-teamcreate.sh (팀원 없이 작업 차단) |
| **hook** | validate-delegate.sh, enforce-teamcreate.sh, validate-deploy-authority.sh |

**PM-004 교훈**: "리더=코드 안 씀" 원칙을 "리더=아무것도 안 함"으로 과확장하면 배포 자체가 불가능. 코드 수정 차단과 인프라 명령 차단은 구분해야 한다.

### [A0-4] Smith님 프로세스 보호

| 항목 | 내용 |
|------|------|
| **원칙** | tmux 세션 kill 금지. Smith님 프로세스 kill 금지. gateway stop 후 start 확인 |
| **위반 케이스** | auto-shutdown.sh가 Smith님의 tmux 세션까지 종료 |
| **위반 시 영향** | Smith님 작업 중단 → 데이터 유실 가능 |
| **시스템 강제** | ✅ auto-shutdown.sh에 Smith님 세션 예외 처리 |
| **hook** | auto-shutdown.sh (예외 로직 내장) |

### [A0-5] 에이전트 자율 체인

| 항목 | 내용 |
|------|------|
| **원칙** | Smith님이 T 단계에서 승인하면 → 팀이 체인으로 완료까지 자율 진행. 중간 개입 최소화 |
| **위반 케이스** | 매 단계마다 "다음 진행해도 될까요?" 확인 요청 |
| **위반 시 영향** | 불필요한 대기 → 처리 속도 저하 → Smith님 피로 |
| **시스템 강제** | ✅ pdca-chain-handoff.sh (자동 다음 단계 전환) |
| **hook** | pdca-chain-handoff.sh, task-completed.sh |

### [A0-6] 차단 = 다음 행동 트리거

| 항목 | 내용 |
|------|------|
| **원칙** | hook 차단 시 이유 + 필요한 것 + 담당 역할 명시. "막혔으니 안 함" = 절대 금지 |
| **위반 케이스** | CTO가 "Design 없어서 못 합니다"라고만 보고하고 정지 |
| **위반 시 영향** | 전체 체인 교착 → 다른 팀도 대기 → 진행 정체 |
| **시스템 강제** | ⚠️ 부분. hook이 차단 사유를 JSON으로 출력하지만, 자동 요청 전송은 에이전트 판단 |
| **hook** | 모든 validate-*.sh 에서 차단 사유 JSON 출력 |

**PM-003 교훈**: 차단 후 알림이 없으면 차단은 교착이 된다. 차단→알림→해제가 세트. approval-handler.sh에 tmux send-keys 추가로 해결.

### [A0-7] 팀원 pane 직접 접근 금지

| 항목 | 내용 |
|------|------|
| **원칙** | 팀의 리더(pane 0)만 해당 팀 팀원(pane 1+)에 tmux send-keys 가능. COO, 타 팀 리더, 팀원 → 타 팀/자기 팀 팀원 pane 직접 접근 금지 |
| **위반 케이스** | 모찌(COO)가 CTO 팀원 pane에 직접 "이거 고쳐"라고 send-keys |
| **위반 시 영향** | 리더 모르게 팀원에 직접 지시 → 작업 충돌, 리더 조율 실패 |
| **시스템 강제** | ✅ pane-access-guard.sh (PreToolUse:Bash) |
| **hook** | pane-access-guard.sh |

## 7.2 TIER 1 — 운영 원칙 (반복 실패 기반)

### [A1-1] 완료 즉시 상태 업데이트

| 항목 | 내용 |
|------|------|
| **원칙** | 팀 완료 보고 → 모찌가 즉시 대시보드 DB + SESSION-STATE 업데이트 |
| **위반 케이스** | CTO가 3건 완료 보고했는데 대시보드에 반영 안 됨 |
| **위반 시 영향** | "완료됐는데 문서에 없음" → Smith님 혼란 |
| **시스템 강제** | ⚠️ 부분. TaskCompleted 자동 업데이트 있지만, COO 수동 확인도 필요 |
| **hook** | task-completed.sh (자동), 모찌 수동 확인 (보완) |

### [A1-2] 충동 차단 (모찌)

| 항목 | 내용 |
|------|------|
| **원칙** | Smith님 말 → 바로 Do 점프 금지. 반드시 의도 파악 → 역할 체크 → 선행 문서 확인 → Smith님 확인 |
| **위반 케이스** | Smith님 "슬랙 알림 연동해" → 모찌가 바로 CTO에 "Slack API 연동하세요" |
| **위반 시 영향** | 의도 오해 → 잘못된 구현 → 전량 폐기 |
| **시스템 강제** | ❌ hook 불가 (모찌 내부 판단). Sequential Thinking 7단계로 강제 |

### [A1-3] 버그 케이스 판단 기준

| 항목 | 내용 |
|------|------|
| **원칙** | 원인 불명 → CTO 조사 먼저. GCS/이관 관련 → 항상 L2 이상. 고객 직접 영향 → L0 or L1 |
| **위반 케이스** | GCS 경로 오류를 L1로 판정 → 조사 없이 수정 → 더 큰 문제 |
| **위반 시 영향** | 근본 원인 미해결 → 재발 |
| **시스템 강제** | ⚠️ detect-process-level.sh가 일부 자동 판단. 최종은 모찌 확인 |

### [A1-4] 병렬 사고 우선

| 항목 | 내용 |
|------|------|
| **원칙** | 한 팀 대기 중이어도 다른 팀 병렬 배정. "PM 끝날 때까지 CTO 대기" = 위반 |
| **위반 케이스** | PM이 Design 작성 중인데 CTO가 다른 TASK 없이 대기 |
| **위반 시 영향** | 리소스 낭비 → 전체 처리량 감소 |
| **시스템 강제** | ❌ hook 불가. 모찌가 병렬 배정 판단 |

### [A1-5] 컨텍스트 회복 프로토콜

| 항목 | 내용 |
|------|------|
| **원칙** | 세션 시작 시: 대시보드 DB → 오늘 memory → MEMORY.md 순서. "읽지 않아서 틀린 것"이 더 큰 실패 |
| **위반 케이스** | 새 세션에서 이전 컨텍스트(Supabase) 기준으로 작업 → Cloud SQL 환경에서 에러 |
| **위반 시 영향** | 잘못된 환경/설정 기준 → 구현 오류 |
| **시스템 강제** | ✅ session-resume-check.sh + living-context-loader.sh (V2) |
| **hook** | session-resume-check.sh |

**PM-006 교훈**: ADR-002에 "프론트: Vercel" 기재 상태에서 실제 Cloud Run 배포. 정본 문서(ADR)가 틀리면 모든 하위 판단이 틀린다. 인프라 전환 후 ADR 즉시 업데이트 필수.

## 7.3 TIER 2 — 품질 원칙

### [A2-1] TDD 필수

| 항목 | 내용 |
|------|------|
| **원칙** | 모든 구현은 TDD 케이스 먼저. 테스트 없는 코드 = 미완료 |
| **위반 케이스** | 구현 먼저 → 테스트 나중에 → "시간 없어서 테스트 생략" |
| **위반 시 영향** | 회귀 버그 감지 불가 → PM-001 같은 대형 장애 |
| **시스템 강제** | ⚠️ 부분. task-quality-gate.sh가 TDD 존재 확인하지만 강제력 약함 |

### [A2-2] Match Rate 90% 이상 통일

| 항목 | 내용 |
|------|------|
| **원칙** | 레벨 무관 90% 미달 = 미완료. COO 재지시 루프 |
| **위반 케이스** | "이 정도면 됐다" 판단으로 80%에서 완료 보고 |
| **위반 시 영향** | 미구현 기능 잔존 → 다음 Feature에서 의존성 문제 |
| **시스템 강제** | ✅ task-quality-gate.sh가 Match Rate 체크 + 재작업 플래그 |
| **hook** | task-quality-gate.sh, match-rate-parser.sh |

### [A2-3] 로컬 수집 금지

| 항목 | 내용 |
|------|------|
| **원칙** | 데이터 수집은 프로덕션에서만. 로컬에서 Meta API 호출 금지 |
| **위반 케이스** | 개발 중 테스트로 Meta API 직접 호출 → rate limit 소진 |
| **위반 시 영향** | 프로덕션 수집 실패 → 수강생 데이터 갱신 중단 |
| **시스템 강제** | ❌ hook 미구현. 규칙으로만 강제 |

### [A2-4] 커밋 전 TDD 전량 통과 필수

| 항목 | 내용 |
|------|------|
| **원칙** | 테스트 실패 상태로 push 금지 |
| **위반 케이스** | "이 테스트는 관련 없어서" 판단으로 실패 상태 push |
| **위반 시 영향** | 다른 팀원이 실패 테스트 기반으로 작업 → 연쇄 실패 |
| **시스템 강제** | ⚠️ enforce-qa-before-merge.sh (merge 시 체크). commit 시점은 미강제 |

---

# Chapter 8. 기존 문서 흡수 현황

## 8.1 기존 Plan 문서 흡수 매핑

### 활성 Plan 문서 (docs/01-plan/features/)

| 문서 | 플레이북 챕터 | 상태 |
|------|-------------|------|
| agent-harness-v2.plan.md | Ch.3 하네스 설계, Ch.4 대시보드 | 활성 — 구현 진행 중 |
| embed-creatives-job.plan.md | 해당 없음 (기능별 Plan) | 활성 — 독립 유지 |
| video-collection-audit.plan.md | 해당 없음 (기능별 Plan) | 활성 — 독립 유지 |

### 아카이브 Plan 문서 (docs/01-plan/archive/) — 총 127건

주요 카테고리별 흡수 현황:

| 카테고리 | 문서 수 | 플레이북 흡수 | 비고 |
|---------|--------|-------------|------|
| 에이전트 운영 | 8건 | Ch.2 역할, Ch.3 하네스 | agent-dashboard, agent-ops-*, agent-team-operations |
| 총가치각도기 | 12건 | 해당 없음 (기능별) | protractor-v5-*, protractor-ux-* |
| 수집/파이프라인 | 15건 | 해당 없음 (기능별) | collect-daily-*, pipeline-*, wave-* |
| 경쟁사 분석 | 10건 | 해당 없음 (기능별) | competitor-v2-*, brand-search-* |
| 인프라 | 6건 | Ch.4 대시보드 | db-restructure, cloud-sql-*, vercel-supabase-* |
| QA/큐레이션 | 8건 | 해당 없음 (기능별) | qa-*, curation-* |
| 마케팅/뉴스레터 | 5건 | 해당 없음 (기능별) | newsletter-*, organic-* |
| 보안/인증 | 4건 | Ch.7 절대원칙 | auth-rls, security-*, privacy-* |
| 기타 | 59건 | 개별 유지 | 버그수정, UI, 스프린트 등 |

### 통합 아키텍처 문서

| 문서 | 플레이북 흡수 |
|------|-------------|
| docs/01-plan/rag-engine-architecture.md | 해당 없음 (기능별) |
| docs/01-plan/unified-data-architecture.md | 해당 없음 (기능별) |
| docs/01-plan/reviews/rag-architecture-review.md | 해당 없음 (기능별) |

## 8.2 기존 Design 문서 흡수 매핑

### 활성 Design 문서 (docs/02-design/features/)

| 문서 | 플레이북 챕터 | 상태 |
|------|-------------|------|
| agent-harness-v2.design.md | Ch.3 하네스, Ch.4 대시보드 | 활성 — 구현 진행 중 |
| agent-process-v2.design.md | Ch.1 T-PDCA, Ch.2 역할 | 활성 — V3로 진화 중 |
| agent-process-v3.design.md | Ch.1 T-PDCA, Ch.3 하네스 | 활성 — V3 핵심 설계 |
| chain-100-percent.design.md | Ch.6 에스컬레이션 | 활성 — 체인 100% 달성 |
| chain-bulletproof.design.md | Ch.6 에스컬레이션 | 활성 — 방탄 체인 |
| content-pipeline.design.md | 해당 없음 (기능별) | 활성 — 독립 유지 |
| embed-creatives-job.design.md | 해당 없음 (기능별) | 활성 — 독립 유지 |
| paperclip-bkit-integration-*.design.md | Ch.3 하네스 | 활성 — bkit 통합 |
| pdca-postmortem.design.md | Ch.5 완료 기준, Ch.7 절대원칙 | 활성 — 회고 시스템 |

### 아카이브 Design 문서 (docs/02-design/archive/) — 총 130건+

에이전트 운영 관련 아카이브가 플레이북에 가장 많이 흡수됨:

| 카테고리 | 주요 흡수 문서 | 플레이북 반영 |
|---------|-------------|-------------|
| 에이전트 프로세스 | agent-ops-phase2~4, orchestration-chain | Ch.1, Ch.2, Ch.3, Ch.6 |
| 대시보드 | dashboard-design, dashboard-routing | Ch.4 |
| 체인 자동화 | pdca-chain-automation | Ch.6 |
| 슬랙 알림 | slack-notification | Ch.5 (완료 기준) |

## 8.3 기타 흡수 문서

### TEAM-ABSOLUTE-PRINCIPLES.md

| 챕터 | 흡수된 내용 |
|------|-----------|
| Ch.1 | T-PDCA 프로세스 전체 구조, T 단계 상세, 레벨별 매핑 |
| Ch.2 | 역할 정의 (Owner/Orchestrator/Planner/Executor) |
| Ch.3 | 하네스 빈 구멍 3가지, hook 분기 목표 |
| Ch.6 | 차단 → 에스컬레이션 흐름 (A0-6) |
| Ch.7 | TIER 0/1/2 절대원칙 전체 |

### ADR 문서

| 문서 | 흡수 챕터 |
|------|----------|
| ADR-001 계정 종속 구조 | Ch.7 (데이터 관련 원칙 배경) |
| ADR-002 서비스 맥락 | Ch.2 (역할별 서비스 이해), Ch.7 (PM-006 교훈) |

### Postmortem 문서 (6건)

| 회고 | 흡수 챕터 |
|------|----------|
| PM-001 쿼리빌더 Big Bang | Ch.5 (위험 패턴), Ch.7 (A2-1 TDD, 마이그레이션 분할) |
| PM-002 team-context 충돌 | Ch.3 (team-context-resolver), Ch.7 (병렬 에이전트 파일 분리) |
| PM-003 승인 미전달 | Ch.6 (차단→알림→해제 세트), Ch.7 (A0-6 교훈) |
| PM-004 배포 차단 | Ch.2 (리더 권한 범위), Ch.6 (유형 5), Ch.7 (A0-3 교훈) |
| PM-005 무한 커밋 루프 | Ch.4 (md5 비교 설계), Ch.5 (위험 패턴) |
| PM-006 Vercel/GCS 혼동 | Ch.7 (A1-5 정본 문서 관리) |

### CLAUDE.md / CLAUDE-DETAIL.md

| 내용 | 흡수 챕터 |
|------|----------|
| 세션 시작 필수 읽기 | Ch.1 (T-PDCA 전제조건) |
| 절대 규칙 (9개) | Ch.7 (TIER 0/1에 분산) |
| PDCA 자동 순차 진행 | Ch.1 (레벨별 매핑) |
| 에이전트팀 운영 | Ch.2 (역할 매트릭스) |
| 작업 완료 기준 | Ch.5 (완료 정의) |
| 프로세스 레벨 시스템 | Ch.1 (레벨 판단 기준) |
| 배포 규칙 | Ch.5 (완료 후 배포) |

## 8.4 더 이상 유효하지 않은 문서 (Deprecated)

| 문서 | 사유 | 대체 |
|------|------|------|
| docs/02-design/archive/orchestration-chain.design.md | V3 설계로 대체 | agent-process-v3.design.md |
| docs/01-plan/archive/vercel-supabase-migration.plan.md | Cloud Run으로 전환 완료 | ADR-002 업데이트 |
| docs/02-design/archive/agent-ops-phase2~4.design.md | V2 하네스로 통합 | agent-harness-v2.design.md |
| docs/01-plan/archive/agent-ops-*.plan.md (6건) | 에이전트 운영 리뉴얼 | agent-harness-v2.plan.md |
| docs/01-plan/archive/prescription-system-mvp.plan.md | MVP 보류 결정 (2026-03-25) | 추후 재기획 |
| .claude/hooks/dashboard-sync-loop.sh | 무한 커밋 루프 사고 (PM-005) | dashboard-sync.sh (md5 비교) |

## 8.5 앞으로 문서 관리 원칙

### 어디에 무엇을 쓰는가

```
문서 유형              │ 위치                              │ 관리 주체
───────────────────────┼──────────────────────────────────┼──────────
이 플레이북             │ docs/TEAM-PLAYBOOK.md            │ PM (주), COO (검토)
절대원칙 (원본)         │ TEAM-ABSOLUTE-PRINCIPLES.md      │ COO (주), Smith님 (확정)
CLAUDE.md (규칙)        │ CLAUDE.md                        │ COO
기능별 Plan             │ docs/01-plan/features/           │ PM
기능별 Design           │ docs/02-design/features/         │ PM
기능별 Gap 분석          │ docs/03-analysis/                │ CTO (자동 생성)
ADR (아키텍처 결정)      │ docs/adr/                        │ PM (L3)
회고록 (사고)            │ docs/postmortem/                 │ 자동 생성 + PM 보완
서비스 비전              │ SERVICE-VISION.md                │ COO
프로젝트 상태            │ project-status.md                │ COO (완료 시 업데이트)
```

### 문서 생명주기

```
1. 생성: 해당 PDCA 단계에서 생성 (Plan→plan.md, Design→design.md)
2. 활성: docs/{01-plan|02-design}/features/ 에 위치
3. 완료: 구현 완료 + Gap 통과 후에도 유지 (참조용)
4. 아카이브: 다음 버전 출시 또는 기능 폐기 시 archive/ 로 이동
5. 삭제: 안 함. 아카이브가 최종 상태. (git history에 이력 보존)
```

### 문서 업데이트 규칙

```
1. ADR은 인프라/아키텍처 변경 시 즉시 업데이트 (PM-006 교훈)
2. SERVICE-VISION.md는 기능 추가/완료 시 업데이트
3. project-status.md는 TASK 완료 시 업데이트
4. 이 플레이북은:
   - 새 절대원칙 추가 시
   - 새 hook 추가 시
   - 새 역할/팀 추가 시
   - 사고 발생 후 재발 방지책 추가 시
```

---

# 부록: 용어 사전

| 용어 | 정의 |
|------|------|
| T-PDCA | Task → Plan → Design → Do → Check → Act. bscamp의 핵심 업무 프로세스 |
| Match Rate | Design 산출물과 구현 코드의 일치율 (%) |
| Gap 분석 | Design vs 구현 비교. Check 단계에서 자동 수행 |
| hook | settings.local.json에 등록된 자동 실행 스크립트. 프로세스 강제 수단 |
| 하네스 (Harness) | hook + 규칙 + 체인으로 구성된 프로세스 강제 시스템 |
| 체인 (Chain) | 팀 간 자동 핸드오프 시스템. PDCA 단계 완료 시 다음 팀에 자동 전달 |
| 게이트 (Gate) | 특정 조건 충족 여부를 판정하는 체크포인트. 미충족 시 진행 차단 |
| peer-map | claude-peers의 역할→peerId 매핑 파일. 체인 통신의 핵심 |
| TaskCompleted | Claude Code의 작업 완료 이벤트. hook 체인의 트리거 |
| ACK | COO가 완료 보고를 수신했음을 확인하는 신호 |
| 에스컬레이션 | 하위 단계에서 해결 불가 시 상위 단계로 올리는 것 |
| Living Context | 세션 시작 시 PDCA 단계별로 필요한 문서를 자동 로딩하는 시스템 |
| coo_approved | TASK 파일의 Smith님 승인 여부 플래그 |
| Track A | PDCA 필수 적용 업무 (bscamp 개발, 에이전트팀 작업) |
| Track B | PDCA 미적용 업무 (크론, 개인 설정, 모찌 자체 설정) |

---

> 이 문서는 살아있는 문서. 새로운 실패 케이스, hook 추가, 역할 변경 시 즉시 업데이트.
> 최종 확정: COO 검토 → Smith님 확인 → 전팀 배포.
