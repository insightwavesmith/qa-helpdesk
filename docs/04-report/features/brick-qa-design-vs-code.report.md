# Brick QA: Design vs 구현 일치 검토 보고서

> **작성**: PM | 2026-04-03
> **대상**: engine-bridge, ceo-approval-gate, review-block, project-layer
> **검토 기준**: Design 문서 TDD/API/DB/기능 vs 실제 코드

---

## Executive Summary

| 항목 | 값 |
|------|-----|
| **피처** | Brick Design vs 구현 일치 QA (4건) |
| **작성일** | 2026-04-03 |
| **검토 대상** | engine-bridge, ceo-approval-gate, review-block, project-layer |

### 결과 요약

| 피처 | 구조 일치 | CRITICAL 갭 | TDD 구현율 | 종합 판정 |
|------|----------|------------|-----------|----------|
| **engine-bridge** | 8/8 EP 일치 | 2건 | 7/37 (19%) | **부분 일치** |
| **ceo-approval-gate** | 코어 로직 일치 | 1건 (치명) | 0/18 (0%) | **미완성** |
| **review-block** | 모듈 구조 일치 | 2건 | 0/24 (0%) | **미완성** |
| **project-layer** | 전체 구조 일치 | 1건 | 0/34 (0%) | **부분 일치** |
| **합계** | — | **6건** | **7/113 (6%)** | — |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | Design 작성 후 구현과의 괴리 미검증 — 실제 런타임 장애 잠재 |
| **Solution** | 4개 피처 Design vs 코드 전수 대조 + CRITICAL 갭 식별 |
| **Function UX Effect** | 6건 CRITICAL 갭 사전 발견 → 런타임 AttributeError/빈 워크플로우 방지 |
| **Core Value** | Design-Code 동기화 기준선 확립, TDD 부채 113건 가시화 |

---

## 1. Engine-Bridge (brick-engine-bridge.design.md)

### 1.1 API 엔드포인트 일치 현황

| EP | Design | 코드 (Python) | 코드 (Express) | 일치 |
|----|--------|--------------|----------------|------|
| EP-1 | POST /workflows | `create_workflow()` | proxy → 3202 | ✅ |
| EP-2 | GET /workflows | `list_workflows()` | DB 직접 조회 | ✅ |
| EP-3 | GET /workflows/:id | `get_workflow()` | DB 직접 조회 | ✅ |
| EP-4 | POST /workflows/:id/start | `start_workflow()` | proxy → 3202 | ✅ |
| EP-5 | POST /blocks/:id/complete | `complete_block()` | proxy → 3202 | ✅ |
| EP-6 | POST /workflows/:id/cancel | `cancel_workflow()` | proxy → 3202 | ⚠️ |
| EP-7 | GET /workflows/:id/status | `get_status()` | DB 직접 조회 | ✅ |
| EP-8 | GET /engine/health | `health_check()` | proxy → 3202 | ✅ |

### 1.2 INV 준수 현황

| INV | 규칙 | 준수 |
|-----|------|------|
| INV-EB-1 | 상태 변경 POST → 엔진 경유 | ✅ |
| INV-EB-2 | GET → DB 직접 조회 | ✅ |
| INV-EB-3 | BlockStatus 9가지 | ✅ |
| INV-EB-4 | POST /pause — 엔진 경유 필요 | ⚠️ 부분 위반 |

### 1.3 CRITICAL 갭

| ID | 위치 | 내용 | 심각도 |
|----|------|------|--------|
| **EB-GAP-1** | EP-6 cancel | Design: status → `"cancelled"`, 코드: status → `"failed"` | **HIGH** — 상태값 불일치로 프론트 필터링 오류 |
| **EB-GAP-2** | bridge.ts | Design: `retryAdapter()` 메서드 명시, 코드: 미구현 | **MEDIUM** — 엔진 연결 실패 시 재시도 없음 |

### 1.4 기타 차이

| 항목 | Design | 코드 | 영향 |
|------|--------|------|------|
| 엔진 포트 | bridge 기본값 18700 | 실제 3202 | 환경변수로 오버라이드, 실동작 정상 |
| POST /pause | INV-EB-4 엔진 경유 필요 | Express에서 DB 직접 UPDATE | 부분 위반, 상태 동기화 불일치 가능 |

### 1.5 TDD 현황

| 구분 | 건수 |
|------|------|
| Design TDD 케이스 | 37건 |
| 구현된 테스트 | 7건 (Python test_engine_bridge.py) |
| **미구현** | **30건** (Express 측 테스트 전무) |

---

## 2. CEO-Approval-Gate (brick-ceo-approval-gate.design.md)

### 2.1 코어 로직 일치 현황

| 항목 | Design | 코드 | 일치 |
|------|--------|------|------|
| ApprovalGate 클래스 | `gates/concrete.py` | `_run_approval()` 존재 | ✅ |
| ApprovalConfig 모델 | `models/block.py` | 필드 일치 | ✅ |
| BlockStatus 9가지 | `models/events.py` | waiting_approval, rejected 포함 | ✅ |
| brick_approvals 테이블 | `schema.ts` | SQLite CREATE TABLE 일치 | ✅ |
| 프리셋 YAML | `t-pdca-l2-approval.yaml` | 존재, 구조 일치 | ✅ |
| Express CRUD 4개 | `approvals.ts` | GET/POST/PATCH/DELETE 존재 | ✅ |

### 2.2 CRITICAL 갭

| ID | 위치 | 내용 | 심각도 |
|----|------|------|--------|
| **AG-GAP-1** | `gates/concrete.py` | `_send_approval_notification()`, `_notify_slack()`, `_notify_dashboard()`, `_notify_slack_dm()` — **4개 메서드 전부 미구현**. `_run_approval()` 내부에서 호출하나 메서드 정의 없음 → **런타임 AttributeError** | **CRITICAL** — 승인 게이트 진입 시 즉시 크래시 |

### 2.3 프론트엔드 갭

| 항목 | Design | 코드 |
|------|--------|------|
| `ApprovalsPage.tsx` | §10 UI 명세 | **미구현** — 파일 없음 |
| 승인/거부 버튼 UI | 상세 명세 | 미구현 |

### 2.4 TDD 현황

| 구분 | 건수 |
|------|------|
| Design TDD 케이스 | 18건 (AG-001~AG-018) |
| 구현된 테스트 | **0건** |
| **미구현** | **18건** |

---

## 3. Review-Block (brick-review-block.design.md)

### 3.1 모듈 구조 일치 현황

| 파일 | Design | 코드 | 일치 |
|------|--------|------|------|
| `review/__init__.py` | 모듈 초기화 | 존재 | ✅ |
| `review/collector.py` | 산출물 수집기 | 존재, 코어 로직 일치 | ✅ |
| `review/harness.py` | LLM 리뷰 하네스 | 존재, 프롬프트 구조 일치 | ✅ |
| `review/applier.py` | 제안 적용기 | 존재 | ⚠️ |
| `review/models.py` | 데이터 모델 | 존재, ReviewResult 등 일치 | ✅ |

### 3.2 CRITICAL 갭

| ID | 위치 | 내용 | 심각도 |
|----|------|------|--------|
| **RB-GAP-1** | 프리셋 YAML | Design: learn/review 블록 포함, 코드: **t-pdca-l0~l3.yaml에 learn/review 블록 없음** → R-Brick 실행 경로 자체가 트리거되지 않음 | **CRITICAL** — 기능 비활성 상태 |
| **RB-GAP-2** | `review/applier.py` | Design: 7가지 핸들러(rename, move, delete, modify, create, merge, split), 코드: **2가지만 구현** (modify, create) — 나머지 5개 `raise NotImplementedError` | **HIGH** — 제안 적용 시 5/7 경로 실패 |

### 3.3 기타 갭

| 항목 | Design | 코드 | 영향 |
|------|--------|------|------|
| `_append_to_memory_index()` | 학습 결과 메모리 인덱스 추가 | 미구현 | 학습 이력 축적 안 됨 |
| `ReviewPage.tsx` | 리뷰 결과 UI | 미구현 | 프론트 표시 불가 |

### 3.4 TDD 현황

| 구분 | 건수 |
|------|------|
| Design TDD 케이스 | 24건 (RB-001~RB-024) |
| 구현된 테스트 | **0건** |
| **미구현** | **24건** |

---

## 4. Project-Layer (brick-project-layer.design.md)

### 4.1 구조 일치 현황

| 항목 | Design | 코드 | 일치 |
|------|--------|------|------|
| `.bkit/project.yaml` | §3 YAML 구조 | 존재, 구조 일치 | ✅ |
| `brick_projects` 테이블 | §5 DB 스키마 | 존재, SQLite 일치 | ✅ |
| `brick_invariants` 테이블 | §5.2 DB 스키마 | 존재 | ✅ |
| `brick_invariant_history` | §5.3 DB 스키마 | 존재 | ✅ |
| `brick_executions.projectId` | §5.4 FK 추가 | 존재 | ✅ |
| Express CRUD (projects) | §7 API 5+1개 | 존재, 라우트 일치 | ✅ |
| Express CRUD (invariants) | §7 API 5개 | 존재, 라우트 일치 | ✅ |
| `ProjectContextBuilder` | §6 컨텍스트 빌더 | 존재 (sync 방식) | ✅ |
| `seed-invariants.ts` | §5.5 시드 데이터 | 11개 INV 시드 | ✅ |
| `bridge.startWorkflow()` | §8 컨텍스트 주입 | initialContext 전달 | ✅ |

### 4.2 CRITICAL 갭

| ID | 위치 | 내용 | 심각도 |
|----|------|------|--------|
| **PL-GAP-1** | `gates/concrete.py` | Design §9.3: `{context.project.*}` 게이트 템플릿 변수 해석 — `_resolve_template()`, `_resolve_path()` 메서드 미구현. 게이트 프롬프트에서 프로젝트 컨텍스트 참조 불가 | **HIGH** — 게이트에서 프로젝트 제약조건 자동 주입 안 됨 |

### 4.3 기타 차이

| 항목 | Design | 코드 | 영향 |
|------|--------|------|------|
| `ProjectContextBuilder` | async 방식 | sync 방식 (`buildSync()`) | 동작 정상, 비동기 필요 시 래핑 가능 |
| 프로젝트 동기화 | `POST /projects/sync` | 존재 | ✅ 정상 |

### 4.4 TDD 현황

| 구분 | 건수 |
|------|------|
| Design TDD 케이스 | 34건 (PL-001~PL-034) |
| 구현된 테스트 | **0건** |
| **미구현** | **34건** |

---

## 5. 종합 분석

### 5.1 CRITICAL 갭 우선순위

| 순위 | ID | 피처 | 내용 | 영향 |
|------|-----|------|------|------|
| **P0** | AG-GAP-1 | ceo-approval-gate | 알림 메서드 4개 미구현 → AttributeError | 승인 게이트 진입 즉시 크래시 |
| **P1** | RB-GAP-1 | review-block | 프리셋에 learn/review 블록 없음 | R-Brick 기능 전체 비활성 |
| **P2** | RB-GAP-2 | review-block | applier 핸들러 5/7 미구현 | 제안 적용 대부분 실패 |
| **P3** | EB-GAP-1 | engine-bridge | cancel 상태값 불일치 | 프론트 필터링 오류 |
| **P4** | PL-GAP-1 | project-layer | 게이트 템플릿 변수 해석 미구현 | 게이트에서 프로젝트 컨텍스트 사용 불가 |
| **P5** | EB-GAP-2 | engine-bridge | retryAdapter 미구현 | 엔진 연결 실패 시 재시도 없음 |

### 5.2 TDD 부채 총괄

| 피처 | Design TDD | 구현 | 미구현 | 구현율 |
|------|-----------|------|--------|--------|
| engine-bridge | 37 | 7 | 30 | 19% |
| ceo-approval-gate | 18 | 0 | 18 | 0% |
| review-block | 24 | 0 | 24 | 0% |
| project-layer | 34 | 0 | 34 | 0% |
| **합계** | **113** | **7** | **106** | **6%** |

### 5.3 피처별 구현 완성도

| 피처 | 백엔드 | 프론트엔드 | DB | 테스트 | 종합 |
|------|--------|-----------|-----|--------|------|
| engine-bridge | 90% | — | 100% | 19% | **70%** |
| ceo-approval-gate | 60% | 0% | 100% | 0% | **40%** |
| review-block | 50% | 0% | — | 0% | **25%** |
| project-layer | 85% | — | 100% | 0% | **60%** |

### 5.4 공통 패턴

1. **DB 스키마는 모두 일치**: SQLite 마이그레이션 완료 상태, Design과 코드 일치율 높음
2. **Express 라우트 완비**: API 엔드포인트 구조는 Design 대로 구현됨
3. **Python 엔진 코어 부분 구현**: 핵심 로직은 존재하나 주변 기능(알림, 템플릿, 핸들러) 미완성
4. **프론트엔드 전무**: 4개 피처 중 전용 UI 페이지 구현된 것 없음
5. **TDD 94% 미구현**: 113건 중 106건 테스트 부재 — 품질 보증 불가 상태

---

## 6. 권고사항

### 즉시 조치 (P0~P1)

1. **AG-GAP-1**: `gates/concrete.py`에 `_send_approval_notification()` 등 4개 메서드 구현 — 이것 없이는 승인 게이트 사용 불가
2. **RB-GAP-1**: `t-pdca-l2.yaml` 이상 프리셋에 learn/review 블록 + 링크 추가 — R-Brick 활성화 전제조건

### 단기 조치 (P2~P3)

3. **RB-GAP-2**: `review/applier.py` 나머지 5개 핸들러(rename, move, delete, merge, split) 구현
4. **EB-GAP-1**: `cancel_workflow()` 반환 status를 `"cancelled"`로 통일 (Design 기준)

### 중기 조치 (P4~P5)

5. **PL-GAP-1**: `gates/concrete.py`에 `_resolve_template()`, `_resolve_path()` 구현 — 게이트 프롬프트 프로젝트 컨텍스트 주입
6. **EB-GAP-2**: `bridge.ts`에 `retryAdapter()` 구현 — 엔진 연결 안정성

### TDD 부채 해소

7. 113건 TDD 케이스 중 **P0 피처부터 순차 구현** 권장
8. engine-bridge Express 측 테스트 30건 우선 (기존 7건 Python 테스트 패턴 참고)

---

## 7. 검토 방법론

- 4개 피처를 병렬 Explore 에이전트로 동시 검토
- 각 에이전트가 Design 문서 + 실제 코드 파일을 대조
- API 엔드포인트, DB 스키마, 모델 정의, INV 준수, TDD 구현 여부 5축 검증
- CRITICAL = 런타임 장애 유발, HIGH = 기능 불완전, MEDIUM = 비기능 누락

---

*보고서 끝*
