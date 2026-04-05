# TASK: dashboard-phase3-4

> 작성일: 2026-04-05
> 작성자: 모찌 (COO)
> 프로젝트: bscamp

---

## 배경

브릭 엔진 3축 QA 통과 (230/240 PASS). Building 돌릴 수 있는 상태.
근데 대시보드에서 Building 실행하면 **진행 상황을 실시간으로 못 보고, 승인/반려를 Slack에서만 해야 한다.**

지금: Building 실행 → 새로고침해야 상태 보임 → 승인 요청 오면 Slack에서 처리 → API 직접 호출
이후: Building 실행 → 블록 상태가 실시간 변경 → 승인 요청이 대시보드에 뜨면 버튼 클릭

이게 안 되면 이후 Building(Codex 어댑터, OpenChrome 등)을 대시보드로 관리할 수 없다.

---

## 현재 상태

```
있는 것:
  ✅ Phase 1: 프로젝트 선택 드롭다운 (ProjectSelector.tsx)
  ✅ Phase 2: 원클릭 실행 (PresetListPage → ▶실행 → ExecuteDialog)
  ✅ Phase 5: 블록 드래그앤드롭 (BlockSidebar + LinkTypePopover)
  ✅ Phase 6: 3축 직관화 패널 (ThreeAxisPanel + GateConfigPanel)
  ✅ WebSocket 클라이언트 훅 (useBrickLiveUpdates.ts 146줄) — 7종 메시지 처리 구현됨
  ✅ RunDetailPage 기본 구조 (133줄) — 타임라인 + 로그 + 일시정지/중지 버튼
  ✅ PM Design 완료 (BD-014~032, 19건 TDD)

없는 것 / 개선 필요:
  ❌ WebSocket 서버 엔드포인트 (/api/brick/ws) — 클라이언트는 있는데 서버 연결 미확인
  ❌ 블록 상태 실시간 반영 — WebSocket 메시지 → React Flow 노드 색상 변경
  ❌ 승인/반려 버튼 — RunDetailPage에 approve/reject 버튼 없음
  ❌ 승인 대기 시 알림 배너 — WAITING_APPROVAL 블록 강조 + 승인 요청 표시
```

---

## 요구사항

| ID | 요구사항 | 우선순위 |
|----|---------|---------|
| REQ-1 | Building 실행 중 블록 상태가 실시간으로 변한다 (QUEUED→RUNNING→COMPLETED 색상 변화) | P0 |
| REQ-2 | 블록이 WAITING_APPROVAL이면 대시보드에 승인/반려 버튼이 뜬다 | P0 |
| REQ-3 | 승인 버튼 클릭 → POST /engine/complete-block (approval_action=approve) → 다음 블록 진행 | P0 |
| REQ-4 | 반려 버튼 클릭 → 반려 사유 입력 → 해당 블록 루프백 | P0 |
| REQ-5 | Gate 실패/통과 시 토스트 알림 | P1 |
| REQ-6 | RunDetailPage에 블록별 진행 프로그레스바 실시간 업데이트 | P1 |
| REQ-7 | WebSocket 끊김 시 자동 재연결 (3초) + 연결 상태 표시 | P1 |

---

## 범위 제한

- Phase 1/2/5/6 수정 안 함 (이미 완료)
- 새 페이지 안 만듦 (RunDetailPage + BrickCanvasPage 기존 페이지 확장)
- 백엔드 엔진 로직 수정 안 함 (프론트엔드 + Express WebSocket만)
- 모바일 대응 안 함

---

## 레퍼런스

- PM Design: `docs/02-design/features/brick-dashboard-ux-improve.design.md` (BD-014~032)
- 기존 WebSocket 훅: `dashboard/src/hooks/brick/useBrickLiveUpdates.ts`
- 기존 RunDetail: `dashboard/src/pages/brick/RunDetailPage.tsx`
- 엔진 API: `POST /api/v1/engine/complete-block` (approval_action 필드)
- 엔진 이벤트: `gate.approval_pending`, `block.started`, `block.completed`
