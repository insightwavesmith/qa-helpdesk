# 🧱 Brick — 개발 계획서 (Development Roadmap)

> **버전**: v1.0 | **작성일**: 2026-04-03 | **작성자**: 모찌 (COO)
> **대상**: 개발팀 (CTO-1, PM) + CEO
> **목적**: 뭘 어떤 순서로 만들지. 우선순위와 의존성.

---

## 현재 위치

### 코드 규모
- Python 엔진: 6,720줄 (80+ 파일)
- Express API: 2,312줄 (20 파일)
- 프론트엔드: 4,516줄 (50+ 파일)
- 합계: ~14,000줄

### QA 결과 (2026-04-03, 5팀 병렬)

| 팀 | 범위 | 결과 |
|---|---|---|
| COO | pytest + vitest | 421+274 pass |
| PM | Design vs 코드 14개 전수 | 평균 Match 74% |
| CTO-1 | API 111건 E2E | 94.6% pass |
| CTO-2 | bscamp 통합 | 100% pass |
| Codex | 기획서 vs 코드 전수 | HIGH 8건 발견 |

### 핵심 판단

**API 껍데기는 완성이다.** 62개 엔드포인트, CRUD, 에러핸들링, 대시보드 10페이지 다 있다.

**엔진 속이 비었다.** Gate가 실행 안 되고, Adapter가 연결 안 되고, 승인이 전이 안 된다. 워크플로우 "자동 실행"이 안 되는 상태.

---

## Sprint 1: 표면 버그 수정 (진행 중)

**담당**: CTO-1 | **기간**: ~1일 | **Design**: `brick-bugfix-sprint1.design.md`

| # | 버그 | 심각도 | 상태 |
|---|------|--------|------|
| BUG-2 | js-yaml 미설치 | MEDIUM | 🔄 |
| BUG-3 | review FK → 500 | MEDIUM | 🔄 |
| BUG-7 | linkType 검증 없음 | MEDIUM | 🔄 |
| BUG-1 | DELETE /projects 미구현 | HIGH | 🔄 |
| BUG-4 | GET /projects/:id/invariants 미구현 | MEDIUM | 🔄 |
| BUG-6 | resume 상태 가드 누락 | MEDIUM | 🔄 |
| BUG-5 | 승인 → engine bridge 미연결 | MEDIUM | 🔄 |

**완료 기준**: pytest + vitest 전체 pass + 7건 TDD 통과

---

## Sprint 2: 엔진 연동 (핵심)

**담당**: CTO-1 | **기간**: ~3일 | **Design 필요**: PM 작성

### 왜 이게 제일 중요한가

지금 브릭은 "워크플로우 엔진"이라고 하면서 실제로 워크플로우가 자동으로 안 돌아간다.
Sprint 2가 끝나면 "Plan 블록 시작 → Gate 검증 → 다음 블록 자동 시작"이 실제로 동작한다.

### 작업 목록

| # | 작업 | 코덱스 ID | 핵심 |
|---|------|-----------|------|
| S2-1 | **ConcreteGateExecutor 연결** | BRK-QA-001 | `init_engine()`에서 ConcreteGateExecutor 인스턴스화. llm_client, agent_runner 의존성 주입 |
| S2-2 | **adapter_pool 주입** | BRK-QA-002 | 9종 Adapter registry 빌드. WorkflowExecutor에 주입. 없는 adapter → 워크플로우 시작 실패 |
| S2-3 | **WAITING_APPROVAL 전이** | BRK-QA-003 | approval gate 결과가 "대기"면 GATE_CHECKING → WAITING_APPROVAL. approve/reject → 다음 전이 |
| S2-4 | **Loop/Branch 실제 동작** | BRK-QA-004 | gate 실패 시 on_fail 정책별 동작: retry(같은 블록), loop(지정 블록으로), fail(워크플로우 중단) |
| S2-5 | **resume/cancel 엔진 경유** | BRK-QA-005 | Express → Python bridge → engine command. execution ID로 조회 |
| S2-6 | **인증 추가** | BRK-QA-006 | 승인/반려/override에 approver 검증. 최소한 execution owner 체크 |
| S2-7 | **Shell Injection 차단** | BRK-QA-011 | command gate: subprocess_exec + allowlist. 문자열 포맷 금지 |

### 의존성

```
S2-1 (Gate 연결) ──→ S2-3 (승인 전이) ──→ S2-4 (Loop/Branch)
S2-2 (Adapter 주입) ──→ 독립
S2-5 (resume/cancel) ──→ 독립
S2-6 (인증) ──→ 독립
S2-7 (보안) ──→ 독립
```

S2-1, S2-2가 선행. 나머지는 병렬 가능.

---

## Sprint 3: Adapter 실제 구현

**담당**: CTO-1 | **기간**: ~2일

| Adapter | 현재 | 목표 |
|---------|------|------|
| `claude_agent_teams` | ⚠️ 부분 동작 | ✅ 전체 lifecycle (start/status/cancel/artifacts) |
| `codex` | ❌ NotImplemented | ✅ ACP 하네스로 연결 (OpenClaw sessions_spawn) |
| `human` | ⚠️ 파일마커 | ✅ 대시보드 UI + Slack 알림 |
| `webhook` | ⚠️ 스텁 | ✅ HTTP 호출 + artifact 수집 |
| `mcp_bridge` | ⚠️ 스텁 | ✅ MCP 프로토콜 연동 |

나머지(human_management, management, base)는 Phase 2에서.

---

## Sprint 4: R-Brick 활성화

**담당**: CTO-1 | **기간**: ~2일

R-Brick = 자동 회고 시스템. 블록 실행 결과를 분석해서 개선 제안을 생성하고, 다음 TASK에 교훈을 자동 주입.

| 작업 | 내용 |
|------|------|
| ReviewCollector 연결 | 블록 완료 시 결과 수집 → 카테고리별 분류 |
| ReviewHarness 연결 | AI가 개선 제안 생성 |
| ReviewApplier 연결 | 승인된 제안을 프리셋/Gate에 자동 반영 |
| 학습 제안 UI | 대시보드에서 제안 승인/거부 |

---

## Sprint 5: 프리셋 apply → 실행

**담당**: CTO-1 | **기간**: ~1일

현재 `POST /presets/:id/apply`가 캔버스 프리뷰만 하고 실행을 안 만든다 (BRK-QA-007).

| 작업 | 내용 |
|------|------|
| apply 동작 변경 | 프리셋 → 실행 생성 (bridge 경유) |
| 프리셋 스키마 검증 | import/create 시 preset-v2.json 스키마 체크 (BRK-QA-013) |
| 데드코드 정리 | 사용 안 하는 이중 Gate/Link 구현 제거 (BRK-QA-014) |

---

## Sprint 6: 실전 적용

**담당**: COO + CTO-1 | **기간**: ~2일

bscamp 실제 개발 TASK를 브릭으로 실행해본다.

| 시나리오 | 프리셋 | 검증 |
|---------|--------|------|
| 기능 개발 (PDCA) | t-pdca-l0 | Plan→Design→Do→Check→Act 전체 자동 |
| CEO 승인 포함 | t-pdca-l2-approval | Design 후 CEO 승인 → Do 자동 시작 |
| QA 루프 | t-pdca-l1 | Check 실패 → Do 재실행 (최대 3회) |
| 경쟁 | 커스텀 | CTO-1 vs CTO-2 경쟁 → 우수 산출물 채택 |

---

## Sprint 7+: 공간형 UI (Phase 4)

**Design 필요** | **기간**: 추후 결정

| 작업 | 내용 |
|------|------|
| 2D 공간 렌더링 | Phaser.js 또는 PixiJS |
| 에이전트 아바타 | 스프라이트 + 위치 = 현재 블록 |
| WebSocket 실시간 | 블록 전환 시 아바타 이동 애니메이션 |
| 방/복도 구조 | 블록 = 방, Link = 복도 |

---

## 전체 타임라인

```
Week 1 (현재):
  Sprint 1: 표면 버그 7건 ──────── CTO-1 🔄
  제품 비전서 + 개발 계획서 ────── COO ✅

Week 2:
  Sprint 2: 엔진 연동 7건 ──────── CTO-1
  Sprint 2 Design ─────────────── PM

Week 3:
  Sprint 3: Adapter 구현 ────────  CTO-1
  Sprint 4: R-Brick ──────────── CTO-1 (병렬 가능)

Week 4:
  Sprint 5: 프리셋 apply ────────  CTO-1
  Sprint 6: 실전 적용 ──────────── COO + CTO-1

Week 5+:
  Sprint 7: 공간형 UI Design ──── PM
```

---

## 우선순위 판단 근거

| 순위 | Sprint | 이유 |
|------|--------|------|
| 1 | Sprint 1 (표면 버그) | 테스트가 깨져있으면 다음 작업 검증 불가 |
| 2 | Sprint 2 (엔진 연동) | **핵심 가치 실현** — "워크플로우 자동 실행" |
| 3 | Sprint 3 (Adapter) | 엔진 연동 후 실제 실행자 연결 |
| 4 | Sprint 6 (실전 적용) | 실전에서 문제 발견 → Sprint 4,5 우선순위 재조정 |
| 5 | Sprint 4 (R-Brick) | 학습 시스템은 기본 동작 후 |
| 6 | Sprint 5 (프리셋) | UX 개선 |
| 7 | Sprint 7 (공간형 UI) | 비전은 확실하지만, 엔진부터 |

---

> **이 문서는 모찌(COO)가 6단계 사고를 거쳐 직접 작성했다.**
>
> 1. 의도 파악: 코덱스 QA 결과 반영한 Phase별 로드맵
> 2. 역할 체크: 개발 계획 = COO 범위 (구현 X)
> 3. 선행 문서: brick-product-spec.md, brick-qa-codex-review.report.md, brick-bugfix-sprint1.design.md
> 4. 과거 결정: CTO-1=Brick 전담, Sprint 1 진행 중
> 5. 영향 범위: 4주 개발 로드맵
> 6. 판단: Sprint 2(엔진 연동)가 핵심. 여기서 브릭의 존재 이유가 실현된다.
