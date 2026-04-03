# QA 보고서: 코덱스 코드 리뷰 (기획서 vs 코드 전수 대조)

> **작성일**: 2026-04-03
> **작성자**: Codex (ACP 서브에이전트)
> **기준 문서**: docs/brick-product-spec.md v1.0
> **검토 범위**: Python 엔진 전체 + Express API 전체 + DB 스키마

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| 총 발견 | 14건 |
| HIGH | 8건 |
| MEDIUM | 4건 |
| LOW | 1건 |
| NOTE | 1건 |
| **핵심 판정** | **엔진 부트스트랩(Gate/Adapter), 승인 플로우, Express 라우트의 엔진 우회가 최대 위험** |

---

## 발견 목록

### 🔴 HIGH (8건)

| ID | 파일 | 설명 |
|----|------|------|
| **BRK-QA-001** | `engine_bridge.py:56`, `gates/base.py:74` | FastAPI 엔진이 `GateExecutor()` 사용 → `ConcreteGateExecutor()` 아님. 모든 gate(command/http/prompt/agent/review/metric/approval)가 `NotImplementedError` 발생. **프리셋 gate 전부 동작 불가** |
| **BRK-QA-002** | `engine_bridge.py:68`, `executor.py:324` | `adapter_pool` 미주입 → `StartBlockCommand` no-op → 블록이 queued에서 running으로 전환 안 됨. **기획서의 "adapter가 블록 시작" 플로우 미동작** |
| **BRK-QA-003** | `concrete.py:358`, `state_machine.py:119` | 승인 gate가 `WAITING_APPROVAL` 상태로 전환 안 됨. `_run_approval()`이 `passed=False` 반환 → state machine이 gate 실패로 처리 → **승인 대기 자체가 불가** |
| **BRK-QA-004** | `state_machine.py:124`, `condition_evaluator.py:62` | check→do 루프백, approval→design 루프백 미동작. `on_fail: retry`가 같은 블록 재실행일 뿐 루프 타겟으로 안 감. `match_rate_below` 조건 형식 미지원 |
| **BRK-QA-005** | `workflows.ts:9`, `bridge.ts:147` | resume/cancel이 Python 엔진 우회 (INV-EB-1 위반). `presetId`로 조회해서 **다른 execution이 resume/cancel될 수 있음** |
| **BRK-QA-006** | `approvals.ts:50`, `review.ts:8`, `gates.ts:26` | 승인/반려/리뷰/override가 **인증 없이 DB 직접 수정**. 엔진 전이도 안 탐. CEO gate를 누구나 approve 가능 (auth bypass) |
| **BRK-QA-007** | `presets.ts:188` | `POST /presets/:id/apply`가 기획서는 "실행 시작"인데 실제로는 캔버스 노드/엣지 변환만 함. **실행 생성 안 됨** |
| **BRK-QA-011** | `concrete.py:27` | Command gate가 `create_subprocess_shell()`로 포맷 문자열 실행. 프리셋/context가 API로 수정 가능 → **Shell Injection 취약점** |

### 🟡 MEDIUM (4건)

| ID | 파일 | 설명 |
|----|------|------|
| **BRK-QA-008** | `links.ts:17,74` | 링크 CRUD가 모든 cycle 거부 — loop 링크(check→do)도 차단. **기획서의 loop 워크플로우 생성 불가** |
| **BRK-QA-009** | `create-schema.ts:281`, `executions.ts:135` | execution status에 DB 제약 없음. Express/Python/기획서가 다른 값 사용 (paused/cancelled/failed/suspended) |
| **BRK-QA-010** | `system.ts:6`, `notify.ts:6` | system invariants, notify-test가 하드코딩 placeholder. 실제 invariant 레지스트리/notifier 미연동 |
| **BRK-QA-012** | `claude_code.py:19`, `codex.py:10`, `webhook.py:42` | 어댑터 대부분 스텁. claude_code는 프로세스 추적 안 함, codex는 NotImplemented, webhook은 artifact/cancel 미구현 |
| **BRK-QA-013** | `presets.ts:7`, `validator.py:13` | 프리셋 import/create에 스키마 검증 없음. YAML 아무거나 저장 가능 |

### 🔵 LOW (1건)

| ID | 파일 | 설명 |
|----|------|------|
| **BRK-QA-014** | `gates/*.py`, `links/*.py` | 사용되지 않는 이중 gate/link 구현 존재 (BuildPassGate, TscPassGate 등). 혼동 유발 가능 |

---

## 핵심 판단

CTO-1의 API QA(111건 94.6% pass)와 코덱스 리뷰의 차이:
- CTO-1은 **API 응답 코드** 기준 → 대부분 pass
- 코덱스는 **기획서 명세 vs 실제 동작** 기준 → 엔진 내부가 기획서와 불일치

**가장 치명적인 3건:**
1. Gate 전부 미동작 (BRK-QA-001) — ConcreteGateExecutor 미연결
2. Adapter 미주입 (BRK-QA-002) — 블록 시작 자체가 no-op
3. 승인 플로우 미동작 (BRK-QA-003) — WAITING_APPROVAL 전환 없음
