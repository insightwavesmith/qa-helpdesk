# Plan: Dashboard Phase 3-4 — WebSocket 실시간 상태 + 승인/반려 버튼

> 작성일: 2026-04-05
> 작성자: PM
> 레벨: L2-기능
> 선행: brick-dashboard-ux-improve.plan.md (P3+P4 항목), brick-dashboard-ux-improve.design.md
> 관련: brick-dashboard-frontend.plan.md (초기 프론트 Phase 1~5 정의)

---

## 1. 목표

대시보드의 **폴링 기반 상태 조회를 WebSocket 실시간으로 전환**하고,
**approval Gate 대기 블록에 승인/반려 버튼**을 추가하여
Smith님이 브라우저에서 워크플로우 진행 상황을 즉시 확인하고 승인/반려를 완결할 수 있게 한다.

### 1.1 TASK 재해석

> "대시보드에서 워크플로우 상태가 실시간으로 바뀌고, 승인 대기 블록에서 버튼 한 번으로 승인/반려를 처리한다."

### 1.2 현재 상태 (코드 확인 기반)

| 항목 | 상태 | 위치 | 비고 |
|------|------|------|------|
| EventBridge 클래스 | **구현 완료** | `brick/dashboard/event_bridge.py` | connect/disconnect/reconnect/broadcast/filter/snapshot |
| EventBridge 테스트 | **통과** | `tests/test_dashboard_phase3a.py` BD-57~63 | 7건 모두 pass |
| ReviewBlockService | **구현 완료** | `brick/dashboard/review_block.py` | approve/reject/request_changes/checklist |
| ReviewBlock 테스트 | **통과** | `tests/test_dashboard_phase3b.py` BD-132~140 | 9건 모두 pass |
| REST approve/reject | **구현 완료** | `brick/dashboard/routes/workflows.py` | 파일 기반 command 쓰기만 (엔진 미연결) |
| useBrickLiveUpdates 훅 | **존재** | `dashboard/src/hooks/brick/useBrickLiveUpdates.ts` | 캔버스에 미연결 |
| canvas-store (zustand) | **정의됨** | `dashboard/src/stores/canvas-store.ts` | BrickCanvasPage가 로컬 state 사용 중 |
| BrickCanvasPage | **구현됨** | `dashboard/src/pages/brick/BrickCanvasPage.tsx` | 3s/5s 폴링 (refetchInterval) |
| WebSocket 엔드포인트 | **미구현** | server.py에 WS 라우트 없음 | EventBridge가 서버에 미등록 |
| 승인/반려 버튼 | **미구현** | approval Gate용 UI 없음 | review 노드에만 기본 표시 |

### 1.3 핵심 결론

**빌딩 블록은 모두 존재한다.** 백엔드 EventBridge + ReviewBlockService는 구현+테스트 완료.
프론트엔드 useBrickLiveUpdates 훅과 canvas-store도 정의되어 있다.
**필요한 것은 "연결(wiring)"이다:**
1. EventBridge를 server.py에 WebSocket 엔드포인트로 노출
2. init_engine()에서 EventBridge 인스턴스를 생성하여 EventBus에 연결
3. 프론트엔드 useBrickLiveUpdates를 BrickCanvasPage에 연결 (폴링 대체)
4. ApprovalPanel 컴포넌트 신규 생성 + BlockNode에 승인 상태 표시

---

## 2. 영향 범위

### 2.1 변경 파일 (백엔드 — Python)

| 파일 | 변경 유형 | 변경 내용 |
|------|----------|----------|
| `brick/dashboard/server.py` | **수정** | WebSocket 엔드포인트 마운트, EventBridge 초기화 |
| `brick/dashboard/routes/engine_bridge.py` | **수정** | init_engine()에 EventBridge 인스턴스 생성 + EventBus 연결 |
| `brick/dashboard/routes/workflows.py` | **수정** | approve/reject가 ReviewBlockService + WorkflowExecutor 호출하도록 연결 |
| `brick/dashboard/routes/ws.py` | **신규** | WebSocket 라우트 (`/ws`) — EventBridge.connect/disconnect 중계 |

### 2.2 변경 파일 (프론트엔드 — React)

| 파일 | 변경 유형 | 변경 내용 |
|------|----------|----------|
| `dashboard/src/pages/brick/BrickCanvasPage.tsx` | **수정** | 로컬 state → canvas-store, useBrickLiveUpdates 연결, 폴링 제거 |
| `dashboard/src/hooks/brick/useBrickLiveUpdates.ts` | **수정** | block status → canvas-store styledNodes 반영 |
| `dashboard/src/stores/canvas-store.ts` | **수정** | BrickCanvasPage에서 실제 사용하도록 상태 전환 |
| `dashboard/src/components/brick/panels/ApprovalPanel.tsx` | **신규** | 승인/반려 UI (체크리스트 + 사유 입력 + 버튼) |
| `dashboard/src/hooks/brick/useApproval.ts` | **신규** | 승인/반려 API 호출 + 상태 관리 |
| `dashboard/src/components/brick/nodes/BlockNode.tsx` | **수정** | approval gate 대기 상태 시 아이콘/배지 표시 |
| `dashboard/src/components/brick/DetailPanel.tsx` | **수정** | approval gate 선택 시 ApprovalPanel으로 라우팅 |
| `dashboard/src/pages/brick/RunDetailPage.tsx` | **수정** | 로그 실시간 스트리밍 (WebSocket) |

### 2.3 변경하지 않는 것

- React Flow 노드/엣지 타입 정의
- Express 서버 구조 (API 프록시만 담당)
- 직렬화 로직 (serializer.ts)
- 연결 검증 (connection-validator.ts)
- 디자인 시스템 (색상/폰트)
- Python 엔진 코어 (StateMachine, WorkflowExecutor 등)

---

## 3. 의존성

### 3.1 선행 작업

| 항목 | 상태 | 비고 |
|------|------|------|
| EventBridge 클래스 | 완료 | BD-57~63 테스트 통과 |
| ReviewBlockService | 완료 | BD-132~140 테스트 통과 |
| REST approve/reject | 완료 | workflows.py에 구현됨 |
| useBrickLiveUpdates 훅 | 완료 | 훅 정의됨 (연결만 필요) |
| canvas-store | 완료 | 스토어 정의됨 (사용만 필요) |

### 3.2 병렬 작업 충돌 확인

| 피처 | 상태 | 충돌 가능성 |
|------|------|------------|
| adapters | do 진행중 | **없음** — Python 어댑터 코드, 프론트 미접근 |
| engine | do 진행중 | **주의** — engine_bridge.py 공유. init_engine() 수정 시 조율 필요 |
| routes | do 진행중 | **주의** — workflows.py 공유. approve/reject 수정 시 조율 필요 |
| brick-dashboard-ux-improve | design 완료 | **동일 범위** — 본 Plan은 해당 Design의 P3+P4 구현용 |

---

## 4. 구현 접근법

### 접근법 A: EventBridge 직접 WebSocket 노출 (채택)

server.py에 WebSocket 엔드포인트를 추가하고, EventBridge를 init_engine()에서 생성하여
기존 EventBus에 연결한다. 프론트엔드는 useBrickLiveUpdates가 이 WS에 접속.

**장점**: EventBridge 코드 재사용 100%, 기존 테스트(BD-57~63) 유효, 최소 변경
**단점**: server.py에 WS 라우트 추가 필요

### 접근법 B: SSE(Server-Sent Events) 폴백 추가

WebSocket + SSE 양쪽 지원. WS 불가 환경에서 SSE 폴백.

**장점**: 네트워크 제한 환경 대응
**단점**: EventBridge 이중 구현 필요, 현재 요구사항 초과

**결정**: 접근법 A 채택. 로컬/사내 네트워크에서 WS 제약 없음. SSE는 향후 필요 시 추가.

---

## 5. 구현 Phase

### Phase 1: 백엔드 WebSocket 엔드포인트 (P3 백엔드)

**목적**: EventBridge를 서버에 실제로 노출

1. `routes/ws.py` 신규 — FastAPI WebSocket 라우트 `/ws`
2. `engine_bridge.py` 수정 — init_engine()에서 EventBridge 인스턴스 생성, EventBus 연결
3. `server.py` 수정 — ws 라우터 등록
4. approve/reject 라우트를 ReviewBlockService + executor에 연결 (workflows.py 수정)

**완료 기준**: `wscat -c ws://localhost:8000/api/v1/ws` 접속 시 sync.snapshot 수신

### Phase 2: 프론트엔드 실시간 전환 (P3 프론트)

**목적**: 폴링 제거, WebSocket으로 블록 상태 즉시 반영

1. `BrickCanvasPage.tsx` — 로컬 state를 canvas-store(zustand)로 전환
2. `useBrickLiveUpdates.ts` — WS 이벤트 수신 → canvas-store 노드 상태 업데이트
3. `canvas-store.ts` — BrickCanvasPage가 실제 사용하도록 API 확장
4. `RunDetailPage.tsx` — 로그 실시간 스트리밍
5. 폴링(refetchInterval) 코드 제거

**완료 기준**: 워크플로우 실행 시 캔버스 노드 색상이 1초 이내에 변경

### Phase 3: 승인/반려 UI (P4 프론트)

**목적**: approval Gate 대기 블록에서 버튼으로 승인/반려 완결

1. `ApprovalPanel.tsx` 신규 — 체크리스트, 사유 입력, 승인/반려 버튼
2. `useApproval.ts` 신규 — POST complete-block(approval_action) API 호출
3. `BlockNode.tsx` 수정 — gate_checking + approval 상태 시 아이콘/펄스 표시
4. `DetailPanel.tsx` 수정 — approval gate 선택 시 ApprovalPanel 라우팅

**완료 기준**: 대시보드에서 승인 버튼 클릭 → 워크플로우 다음 블록 진행 확인

### Phase 4: 통합 + E2E 검증

1. 백엔드 WS + 프론트 WS 통합 테스트
2. 승인/반려 → 워크플로우 전환 E2E 워크스루
3. 재연결 시나리오 검증 (WS 끊김 → 자동 재연결 → 놓친 이벤트 재생)

**완료 기준**: tsc 0 에러, build 성공, 모든 TDD 케이스 통과

---

## 6. E2E 시나리오 워크스루

### 시나리오 1: 실시간 상태 확인

```
1. Smith님이 브라우저에서 /brick/canvas/:presetId 접속
2. BrickCanvasPage → useBrickLiveUpdates → WebSocket ws://localhost:8000/api/v1/ws 접속
3. EventBridge.connect() → sync.snapshot (현재 워크플로우 상태) 전송
4. 캔버스에 블록 노드들이 현재 상태 색상으로 렌더링 (idle=회색, running=파랑, done=초록)
5. 에이전트가 블록을 완료 → engine EventBus에 block.completed 이벤트 발행
6. EventBridge._on_engine_event() → 등록된 WS 클라이언트에 broadcast
7. useBrickLiveUpdates가 이벤트 수신 → canvas-store 노드 상태 업데이트
8. 캔버스 노드 색상이 running(파랑) → done(초록)으로 즉시 변경
9. (WS 끊김 시) → 3초 내 자동 재연결 → handle_reconnect() → 놓친 이벤트 재생
```

### 시나리오 2: 승인/반려 처리

```
1. 워크플로우가 design-review 블록에 도달 → gate.pending 이벤트 발행
2. EventBridge가 WS로 gate.pending 이벤트 전송
3. 대시보드 캔버스에서 design-review 노드가 주황색 펄스 + 🔔 아이콘 표시
4. Smith님이 design-review 노드 클릭 → DetailPanel이 ApprovalPanel 렌더링
5. ApprovalPanel에서:
   - 이전 블록(design) 산출물(artifact) 확인
   - 체크리스트 항목 하나씩 체크
   - (선택) 코멘트 입력
6-a. [승인] 버튼 클릭:
   - useApproval → POST /api/v1/engine/complete-block { approval_action: "approve" }
   - engine이 design-review 완료 → do 블록 시작
   - EventBridge가 block.completed + block.started 이벤트 broadcast
   - 캔버스에서 design-review 노드 → 초록, do 노드 → 파랑으로 변경
6-b. [반려] 버튼 클릭:
   - 반려 사유 입력 모달 표시
   - useApproval → POST /api/v1/engine/complete-block { approval_action: "reject", reject_reason: "TDD 누락" }
   - engine이 design-review → design으로 루프백 (loop link)
   - design 블록이 reject_reason을 context로 받아 재실행
   - 캔버스에서 design-review → 빨강, design → 파랑으로 변경
```

---

## 7. 범위 제한

| 포함 | 제외 |
|------|------|
| WebSocket 실시간 상태 업데이트 | SSE 폴백 |
| approval Gate 승인/반려 UI | 전체 review 블록 리팩터링 |
| canvas-store 전환 | undo/redo 구현 (별도 Phase) |
| 재연결 + 이벤트 재생 | 오프라인 모드 |
| RunDetailPage 로그 스트리밍 | 전체 RunHistoryPage 리빌드 |

---

## 8. 위험 요소

| 위험 | 대응 |
|------|------|
| engine 피처와 engine_bridge.py 동시 수정 충돌 | CTO에 파일 경계 명시 — init_engine()만 수정, 기존 라우트 미변경 |
| WS 메시지 폭주 (블록 100개 워크플로우) | EventBridge 기존 설계: 1000 이벤트 버퍼 + 5분 TTL. 추가 throttle 불필요 |
| 폴링 제거 후 WS 불안정 | 3초 자동 재연결 + 폴백: WS 실패 시 10s 폴링으로 전환 |
| ReviewBlockService in-memory 상태 → 서버 재시작 시 유실 | Phase 4에서 CheckpointStore 연동 검증 |

---

## 9. 성공 기준

| 기준 | 측정 |
|------|------|
| 블록 상태 변경 반영 | < 1초 (폴링 3s → WebSocket 즉시) |
| 승인/반려 완결 | 대시보드 버튼 1회 클릭 |
| WS 재연결 | 끊김 후 3초 이내 자동 복구 |
| tsc + build | 에러 0 |
| 기존 테스트 | BD-57~63, BD-132~140 모두 통과 유지 |

---

## 10. 산출물

| # | 산출물 | 경로 |
|---|--------|------|
| 1 | 이 Plan 문서 | `docs/01-plan/features/dashboard-phase3-4.plan.md` |
| 2 | Design 문서 (TDD 포함) | `docs/02-design/features/dashboard-phase3-4.design.md` |
| 3 | 백엔드 WS 엔드포인트 | `brick/brick/dashboard/routes/ws.py` |
| 4 | 프론트엔드 컴포넌트 | `dashboard/src/components/brick/panels/ApprovalPanel.tsx` |
| 5 | 프론트엔드 훅 | `dashboard/src/hooks/brick/useApproval.ts` |

---

## 11. 관련 문서

| 문서 | 관계 |
|------|------|
| `brick-dashboard-ux-improve.plan.md` | 상위 UX 개선 Plan — 본 문서는 P3+P4 |
| `brick-dashboard-ux-improve.design.md` | 상위 UX 개선 Design — BD-001~062 TDD |
| `brick-dashboard-frontend.plan.md` | 초기 프론트 Plan — Phase 4 실시간 모니터링 |
| `brick-dashboard-frontend.design.md` | 초기 프론트 Design |
| `brick-dashboard.design.md` | API 백엔드 Design — BD-57~63, BD-132~140 |
| `brick-p1-operations.design.md` | reject_reason/approval context 설계 |
| `docs/adr/ADR-001-account-ownership.md` | 계정 종속 원칙 (본 피처에 해당 없음) |
