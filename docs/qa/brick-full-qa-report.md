# Brick 전체 QA 보고서

> **일자**: 2026-04-03 | **기준 문서**: `docs/brick-product-spec.md` v1.0
> **테스트 환경**: vitest + pytest (단위), 코드 레벨 정적 검증

---

## 종합 결과

| 구분 | 항목 수 | Pass | Partial | Fail | Match Rate |
|------|---------|------|---------|------|-----------|
| QA-A: 엔진 코어 | 7 | 4 | 3 | 0 | 57% |
| QA-B: CEO 승인 Gate | 5 | 0 | 5 | 0 | 0% |
| QA-C: 프로젝트 레이어 | 5 | 5 | 0 | 0 | **100%** |
| QA-D: 프론트엔드 | 36 | 36 | 0 | 0 | **100%** |
| QA-E: API 62개 | 62 | 62 | 0 | 0 | **100%** |
| QA-F: DB/불변식/프리셋 | 43 | 43 | 0 | 0 | **100%** |
| **합계** | **158** | **150** | **8** | **0** | **94.9%** |

**테스트 스위트**: Python 12 passed / vitest 274 passed, 19 skipped, **0 failed**

---

## QA-A: 엔진 코어 (A1~A7)

| # | 항목 | 상태 | 구현 위치 | 테스트 | 비고 |
|---|------|------|----------|--------|------|
| A1 | 워크플로우 시작 | ✅ | executions.ts → bridge.ts → engine_bridge.py → executor.start() | 있음 | 체인 완성 |
| A2 | 블록 완료 + Gate | ✅ | executor.complete_block() → gate_executor.run_gates() | 있음 | StateMachine 전이 정상 |
| A3 | Gate 실패 → 재시도 | ✅ | state_machine.py:119-150 | BS-015/016 | on_fail:retry 동작 |
| A4 | 3회 초과 → FAILED | ⚠️ | state_machine.py:145-148 | **경계값 테스트 없음** | 로직 구현됨, 테스트 보강 필요 |
| A5 | Suspend/Resume | ⚠️ | bridge.suspendWorkflow() 있음 | — | **resume이 DB만 업데이트, engine 미프록시** |
| A6 | Cancel | ⚠️ | bridge.cancelWorkflow() 있음 | — | **workflows.ts cancel이 bridge 미호출** |
| A7 | 전체 PDCA 완주 | ✅ | plan→design→do→check→act | BK-98 e2e | COMPLETED 전이 검증됨 |

---

## QA-B: CEO 승인 Gate (B1~B5)

| # | 항목 | 상태 | 구현 위치 | 이슈 |
|---|------|------|----------|------|
| B1 | 승인 요청 INSERT | ⚠️ | approvals.ts, concrete.py | _run_approval()이 DB INSERT 미수행 (gate 진입 시 자동 생성 불가) |
| B2 | approve → Do 시작 | ⚠️ | POST /approve/:executionId | **engine resume 트리거 없음 → Do 자동 시작 불가** |
| B3 | reject → Design 회귀 | ⚠️ | POST /reject/:executionId | **engine resume 트리거 없음 → 자동 전이 불가** |
| B4 | 반려 3회 → FAILED | ⚠️ | YAML loop max_retries:3 | B2/B3 미연결로 카운트 추적 불가 |
| B5 | human 우회 불가 | ⚠️ | HumanAdapter (파일마커 기반) | **engine_bridge.py:180 metrics 주입으로 우회 가능** |

**CEO 승인 Gate는 API/DB 구조는 구현됐으나, engine 연동(자동 전이)이 미완성.**

---

## QA-C: 프로젝트 레이어 (C1~C5)

| # | 항목 | 상태 | 구현 위치 |
|---|------|------|----------|
| C1 | 서버 시작 → bscamp 자동 등록 | ✅ | index.ts: syncProjectYaml() |
| C2 | INV-EB-1~11 시드 11건 | ✅ | seed-invariants.ts (멱등) |
| C3 | projectId → context infrastructure | ✅ | context-builder.ts → executor.py |
| C4 | POST /projects/sync → YAML→DB | ✅ | projects.ts:94-103 |
| C5 | PUT /invariants → version+1 + history | ✅ | invariants.ts:101-145 |

---

## QA-D: 프론트엔드 (36건)

| 구분 | 결과 |
|------|------|
| 페이지 10개 | ✅ 10/10 (파일 존재 + export + App.tsx 라우팅) |
| 노드 5종 + 엣지 1종 | ✅ 6/6 (nodeTypes/edgeTypes 등록) |
| 패널 4종 | ✅ 4/4 |
| 팀 컴포넌트 4종 | ✅ 4/4 |
| Hooks 9개 | ✅ 9/9 |
| 학습 컴포넌트 2종 | ✅ 2/2 |
| 타임라인 1종 | ✅ 1/1 |

---

## QA-E: API 엔드포인트 (62개)

**62/62 구현 완료 (100%)**

| 카테고리 | API 수 | 상태 |
|---------|--------|------|
| 워크플로우 실행 | 6 | ✅ |
| 워크플로우 제어 | 2 | ✅ |
| 프리셋 | 8 | ✅ |
| 블록 타입 | 4 | ✅ |
| 팀 | 13 | ✅ |
| 링크 | 5 | ✅ |
| Gate | 2 | ✅ |
| 승인 | 4 | ✅ |
| 회고 | 2 | ✅ |
| 학습 | 3 | ✅ |
| 프로젝트 | 6 | ✅ |
| 불변식 | 5 | ✅ |
| 시스템 | 2 | ✅ |

---

## QA-F: DB 스키마 + 불변식 + 프리셋

### F1. DB 테이블: 25/25 ✅
기획서 "24개"는 오기 — 실제 나열 25개, 구현 25개 일치.

### F2. 불변식 시드: 11/11 ✅
INV-EB-1 ~ INV-EB-11 전부 seed-invariants.ts에 멱등 구현.

### F3. 프리셋: 7/7 ✅

| 프리셋 | 기획서 블록 수 | 실제 | 일치 |
|--------|-------------|------|------|
| hotfix | 1 | 1 | ✅ |
| research | 2 | 2 | ✅ |
| t-pdca-l0 | 2 | 2 | ✅ |
| t-pdca-l1 | 3 | 3 | ✅ |
| t-pdca-l2 | 5 | 5 | ✅ |
| t-pdca-l2-approval | 7 | 7 | ✅ |
| t-pdca-l3 | 6 | 6 | ✅ |

---

## Critical 이슈 (2건)

### CRIT-1: CEO 승인 Gate → Engine 자동 전이 미연결
- **영향**: approve/reject 후 다음 블록 자동 시작 불가
- **원인**: approvals.ts가 DB만 업데이트, bridge를 통한 engine resume/context 주입 없음
- **수정 범위**: approvals.ts approve/reject 핸들러에 bridge.resumeWorkflow() 또는 bridge.completeBlock() 호출 추가

### CRIT-2: workflows.ts resume/cancel bridge 미호출
- **영향**: 대시보드에서 resume/cancel 클릭 시 DB만 변경, engine 상태와 불일치
- **원인**: executions.ts의 pause는 bridge 호출하나, workflows.ts의 resume/cancel은 미호출 (비대칭)
- **수정 범위**: workflows.ts에 bridge.resumeWorkflow() / bridge.cancelWorkflow() 호출 추가

---

## Warning 이슈 (4건)

| # | 이슈 | 위치 | 설명 |
|---|------|------|------|
| W1 | 승인 REST 경로 비표준 | approvals.ts | `/approve/:id` → `/approvals/:id/approve` 권장 |
| W2 | system/invariants placeholder | system.ts:7 | 하드코딩 배열, DB 미조회 |
| W3 | human adapter 우회 가능 | engine_bridge.py:180 | metrics 주입으로 approval_action 세팅 가능 |
| W4 | max_retries 경계값 테스트 없음 | state_machine.py | 3회 초과→FAILED 로직 테스트 보강 필요 |

---

## 미구현 항목 (기획서 §17 확인)

| # | 항목 | Design | TDD | 우선순위 |
|---|------|--------|-----|---------|
| 1 | TeammateLifecycleManager | ✅ | 39건 | P0 |
| 2 | canvas-save | ✅ | 55건 | P1 |
| 3 | loop-exit 정밀 제어 | ✅ | 40건 | P1 |
| 4 | spec-wrapper 스키마 검증 | ✅ | 18건 | P2 |
| 5 | cli-state-sync | ✅ | 29건 | P2 |

이들은 기획서에 "베타 이후" 명시 — QA 대상 외.
