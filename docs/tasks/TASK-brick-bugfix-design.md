# TASK: 브릭 버그 수정 Design 작성

> **담당**: PM팀
> **유형**: Design (Plan 스킵 — QA 결과 기반 버그 수정이므로)
> **우선순위**: P0
> **산출물**: `docs/02-design/features/brick-bugfix-sprint1.design.md`
> **기한**: 즉시

---

## 배경

5개 팀(COO, PM, CTO-1, CTO-2, 코덱스)이 병렬 QA를 수행했고, 결과가 나왔다.
이 버그들의 수정 Design을 작성하라.

**COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.**

---

## QA 결과 종합 — 수정 대상 버그 목록

### 🔴 HIGH (베타 전 필수)

| # | 버그 | 위치 | 발견팀 | 증상 |
|---|------|------|--------|------|
| BUG-1 | `DELETE /projects/:id` 미구현 | `brick/express/src/routes/projects.ts` | CTO-1 | 프로젝트 삭제 불가, 테스트 데이터 정리 불가 |

### 🟡 MEDIUM (베타 전 권장)

| # | 버그 | 위치 | 발견팀 | 증상 |
|---|------|------|--------|------|
| BUG-2 | `js-yaml` 미설치 → 프리셋 apply/import YAML 파싱 불가 | `brick/express/package.json` | CTO-1 | JSON만 동작, YAML 파싱 실패 |
| BUG-3 | `review.ts` FK constraint → 500 | `brick/express/src/routes/review.ts` | CTO-1 | 없는 executionId → 500 반환 (404 반환 필요) |
| BUG-4 | `GET /projects/:id/invariants` 미구현 | `brick/express/src/routes/projects.ts` | CTO-1 | 별도 라우트 없음 (GET /:id에 포함돼 있긴 함) |
| BUG-5 | CEO 승인 Gate → engine 자동 전이 미연결 | `brick/python/concrete.py` + `brick/express/src/routes/approvals.ts` | PM+CTO-1 | approve 후 Do 블록 자동 시작 안 됨, reject 후 Design 회귀 안 됨 |
| BUG-6 | resume 상태 가드 누락 | `brick/express/src/routes/workflows.ts` | CTO-1 | completed 워크플로우도 resume 가능 (paused/cancelled만 허용해야) |
| BUG-7 | linkType DB CHECK 없음 | `brick/express/src/db/create-schema.ts` + `links.ts` | CTO-1 | 잘못된 linkType이 DB에 저장됨 |

### 🔵 LOW (베타 이후 개선)

| # | 버그 | 위치 | 발견팀 | 증상 |
|---|------|------|--------|------|
| BUG-8 | Gate 실패 3회 초과 → FAILED 경계값 테스트 없음 | `brick/python/state_machine.py:145-148` | CTO-1 | 로직 있으나 테스트 미작성 |
| BUG-9 | cancel이 bridge 미호출 | `brick/express/src/routes/workflows.ts` | CTO-1 | DB만 업데이트, Python 엔진 미통보 |
| BUG-10 | custom Link 미구현 (Design "7종" 명시, 코드 6종) | 엔진 전체 | PM | Design에 7종 명시됐으나 6종만 구현 |

### ⚪ 미완성 피처 (Design Gap — 이번 스프린트 대상 아님, 참고용)

| 피처 | Match Rate | 핵심 갭 |
|------|-----------|---------|
| pdca-preset | 45% | TDD 16/35만 구현 |
| ceo-approval-gate | 40% | API/DB 있으나 engine 연동 없음 (= BUG-5와 동일) |
| review-block | 25% | collector/harness 있으나 실행 파이프 미연결 |

---

## Design 작성 요구사항

1. **BUG-1 ~ BUG-7** 각각에 대해:
   - 원인 분석 (코드 위치 + 현재 동작)
   - 수정 방안 (구체적 코드 변경 사항)
   - TDD 케이스 (수정 후 통과해야 할 테스트)
   - 영향 범위 (다른 기능에 미치는 영향)

2. **BUG-8 ~ BUG-10**은 참고사항으로만 기재 (이번 스프린트 대상 아님)

3. **수정 순서 제안** (의존성 고려)

---

### 🔴 코덱스 코드 리뷰 추가 발견 (HIGH 8건, MEDIUM 5건)

**이 항목들이 가장 심각하다. API 응답 코드는 정상이지만 엔진 내부가 기획서와 불일치.**

| # | 심각도 | 내용 | 위치 |
|---|---|---|---|
| BRK-QA-001 | 🔴 HIGH | GateExecutor → ConcreteGateExecutor 미연결. **모든 gate 미동작** | `engine_bridge.py:56` |
| BRK-QA-002 | 🔴 HIGH | adapter_pool 미주입 → 블록 시작 no-op | `engine_bridge.py:68` |
| BRK-QA-003 | 🔴 HIGH | WAITING_APPROVAL 상태 전환 없음. 승인 대기 불가 | `concrete.py:358`, `state_machine.py:119` |
| BRK-QA-004 | 🔴 HIGH | check→do 루프백, approval→design 루프백 미동작 | `state_machine.py:124` |
| BRK-QA-005 | 🔴 HIGH | resume/cancel 엔진 우회 + presetId로 조회 (INV-EB-1 위반) | `workflows.ts:9` |
| BRK-QA-006 | 🔴 HIGH | 승인/리뷰/override 인증 없이 DB 직접 수정 (auth bypass) | `approvals.ts:50` |
| BRK-QA-007 | 🔴 HIGH | POST /presets/:id/apply가 실행 생성 안 함 | `presets.ts:188` |
| BRK-QA-011 | 🔴 HIGH | Command gate Shell Injection 취약점 | `concrete.py:27` |
| BRK-QA-008 | 🟡 MEDIUM | loop 링크도 cycle로 거부 — loop 워크플로우 생성 불가 | `links.ts:17` |
| BRK-QA-009 | 🟡 MEDIUM | execution status DB 제약 없음, 레이어별 불일치 | `create-schema.ts:281` |
| BRK-QA-010 | 🟡 MEDIUM | system invariants, notify placeholder | `system.ts:6` |
| BRK-QA-012 | 🟡 MEDIUM | 어댑터 대부분 스텁 (claude_code, codex, webhook) | `adapters/*.py` |
| BRK-QA-013 | 🟡 MEDIUM | 프리셋 스키마 검증 없음 | `presets.ts:7` |

상세: `docs/04-report/features/brick-qa-codex-review.report.md`

---

## 참조 문서

- `docs/brick-product-spec.md` — 상세기획서
- `docs/04-report/features/brick-qa-design-vs-code.report.md` — PM QA 보고서 (14개 피처 전수)
- `docs/04-report/features/brick-full-qa.report.md` — CTO-1 Full QA (111건)
- `docs/04-report/features/brick-qa-api-integration.report.md` — CTO-2 통합 테스트
- `docs/qa/brick-full-qa-report.md` — CTO-1 추가 보고서 (158건)
- `docs/04-report/features/brick-qa-codex-review.report.md` — 코덱스 코드 리뷰 (14건)
- 코덱스 QA: Python pytest 421 passed, 0 failed

---

## 테스트 현황 (참고)

| 스위트 | 결과 |
|--------|------|
| Python pytest | 421 passed, 0 failed |
| vitest | 274 passed, 19 skipped, 0 failed |
| CTO-1 API QA | 105/111 pass (6건 이슈) |
| CTO-2 통합 | 11/11 pass |
