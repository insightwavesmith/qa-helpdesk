# Plan: Brick Dashboard UX 개선 — 스크래치 + 3축 직관화

> 작성일: 2026-04-05
> 작성자: PM
> 레벨: L2-기능
> TASK: docs/tasks/TASK-brick-dashboard-ux-improve.md
> 선행: brick-dashboard-frontend.design.md (초기 구현 완료)

---

## 1. 목표

기존 대시보드(React Flow + Express + SQLite)에 **6가지 UX 개선**을 적용하여
Smith님이 YAML 없이 "스크래치처럼" 3축을 조합·실행·관리할 수 있게 한다.

### 1.1 현재 상태 (코드 확인 기반)

| 항목 | 상태 | 비고 |
|------|------|------|
| React Flow 캔버스 | ✅ 구현됨 | BrickCanvasPage 490줄 |
| 블록 팔레트 드래그 | ✅ 구현됨 | HTML5 drag API (dnd-kit 아님) |
| YAML↔Flow 직렬화 | ✅ 구현됨 | serializer.ts 183줄 |
| 연결 검증 (INV) | ✅ 구현됨 | connection-validator.ts 54줄 |
| dagre 자동배치 | ⚠️ 함수만 존재 | layout.ts — 툴바 버튼 미연결 |
| Zustand canvas-store | ⚠️ 정의만 됨 | BrickCanvasPage가 로컬 state 사용 |
| WebSocket 실시간 | ⚠️ 훅만 존재 | useBrickLiveUpdates — 캔버스에 미연결 |
| 실행 다이얼로그 | ✅ 구현됨 | ExecuteDialog — feature명 입력 |
| 실행 상태 폴링 | ✅ 구현됨 | 3s/5s refetchInterval |
| 승인/반려 | ⚠️ review 노드만 | approval Gate용 UI 없음 |
| 프로젝트 선택 | ❌ 없음 | presetId 하드코딩 'default' |
| 3축 설정 패널 | ⚠️ 부분 구현 | GateConfigPanel 318줄 — 개선 필요 |

### 1.2 핵심 원칙

1. **기존 코드 최대 활용** — WebSocket 훅, Zustand store, dagre 레이아웃은 이미 있다. 연결만 하면 됨.
2. **새 라이브러리 추가 없음** — @xyflow, zustand, dagre, TanStack Query 모두 설치 완료.
3. **파일 최소 변경** — BrickCanvasPage 리팩터링 + 신규 컴포넌트 추가 위주.

---

## 2. UX 6건 우선순위 + 의존성

### 2.1 의존성 그래프

```
UX-5 (프로젝트 선택) ─────────────┐
                                   ↓
UX-1 (원클릭 실행) ──→ UX-3 (실시간 상태) ──→ UX-4 (승인/반려)
                                   ↑
UX-2 (드래그 조합 개선) ───────────┘
                                   
UX-6 (3축 직관화) ← 독립 (DetailPanel 리팩터링)
```

### 2.2 구현 순서

| Phase | UX | 이유 | 예상 파일 수 |
|-------|----|------|------------|
| **P1** | UX-5 프로젝트 선택 | 모든 UX의 전제 — presetId 하드코딩 해소 | 3~4 |
| **P2** | UX-1 원클릭 실행 | 가장 직접적 가치 — "실행" 버튼 한 번이면 끝 | 2~3 |
| **P3** | UX-3 실시간 상태 | useBrickLiveUpdates 연결 — 폴링 제거 | 3~4 |
| **P4** | UX-4 승인/반려 | UX-3 실시간 의존 — 승인 대기 블록 알림 | 2~3 |
| **P5** | UX-2 드래그 조합 개선 | 팔레트 확장 + 자동배치 연결 | 3~4 |
| **P6** | UX-6 3축 직관화 | DetailPanel 리팩터링 — 독립 | 4~5 |

---

## 3. Phase별 상세

### P1: 프로젝트 선택 (UX-5)

**목적**: presetId 하드코딩 제거. 프로젝트별 프리셋 필터링.

**변경 대상**:
- `src/components/brick/ProjectSelector.tsx` (신규)
- `src/hooks/brick/useProjects.ts` (신규)
- `BrickCanvasPage.tsx` — presetId를 URL param에서 받도록 수정
- `PresetListPage.tsx` — 프로젝트별 필터 추가

**API**: 기존 `GET /api/brick/presets` + project 쿼리 파라미터 추가

---

### P2: 원클릭 실행 (UX-1)

**목적**: 프리셋 목록 → 클릭 → feature명 입력 → 실행 → 자동 이동.

**변경 대상**:
- `PresetListPage.tsx` — 프리셋 카드에 [▶ 실행] 버튼 추가
- `ExecuteDialog.tsx` — 프리셋 선택 상태 연동
- `BrickCanvasPage.tsx` — 실행 후 `/brick/runs/{id}`로 자동 이동

**플로우**: PresetListPage → ExecuteDialog(feature명) → POST /api/brick/executions → navigate(`/brick/runs/${id}`)

---

### P3: 실시간 상태 (UX-3)

**목적**: 폴링 제거. WebSocket으로 블록 상태 즉시 업데이트.

**변경 대상**:
- `BrickCanvasPage.tsx` — useBrickLiveUpdates 연결, canvas-store 전환
- `useBrickLiveUpdates.ts` — block status → styledNodes 반영
- `canvas-store.ts` — BrickCanvasPage의 로컬 state 대체
- `RunDetailPage.tsx` — 로그 실시간 스트리밍

**핵심**: 이미 구현된 WebSocket 훅과 canvas-store를 캔버스 페이지에 연결하는 것이 핵심.

---

### P4: 승인/반려 (UX-4)

**목적**: approval Gate 대기 중 블록에 승인/반려 버튼.

**변경 대상**:
- `src/components/brick/panels/ApprovalPanel.tsx` (신규)
- `src/hooks/brick/useApproval.ts` (신규)
- `BlockNode.tsx` — gate_checking + approval 상태 시 승인 아이콘 표시
- `DetailPanel.tsx` — approval gate 선택 시 ApprovalPanel 라우팅

**API**: 기존 bridge.ts `complete-block` + approval_action context

---

### P5: 드래그 조합 개선 (UX-2)

**목적**: 팔레트 확장 + 자동배치 연결 + Link 타입 선택 개선.

**변경 대상**:
- `BlockSidebar.tsx` — PDCA 카테고리 그룹핑 + 검색
- `BrickCanvasPage.tsx` — autoLayout 연결 (CanvasToolbar 콜백)
- `CanvasToolbar.tsx` — 레이아웃 버튼 활성화
- 링크 타입 선택 — 연결 시 인라인 팝오버로 개선

---

### P6: 3축 직관화 (UX-6)

**목적**: YAML 없이 Block/Team/Gate/Link 설정.

**변경 대상**:
- `panels/BlockDetailPanel.tsx` — what 입력 강화
- `panels/TeamConfigPanel.tsx` (신규) — adapter/model/agent 통합 셀렉터
- `panels/GateConfigPanel.tsx` — 체크박스 + 슬라이더 UX로 리팩터
- `panels/LinkDetailPanel.tsx` — 조건 빌더 UI

---

## 4. 범위 제한

- ❌ 디자인 시스템 변경 없음 (기존 색상/폰트 유지)
- ❌ 새 npm 패키지 추가 없음
- ❌ Express 서버 대규모 변경 없음
- ❌ Python 엔진 수정 없음
- ✅ 기존 컴포넌트 최소 수정 + 신규 컴포넌트 추가 위주

---

## 5. 성공 기준

| 기준 | 측정 |
|------|------|
| Smith님 첫 워크플로우 생성 | 5분 이내 (YAML 작성 0줄) |
| 실행 → 상태 확인 | 1초 이내 반영 (폴링 3s → WebSocket 즉시) |
| 승인/반려 | 대시보드에서 버튼 클릭으로 완결 |
| 프로젝트 전환 | 드롭다운 선택 1회 |
| tsc + build | 에러 0 |
