# TASK: Brick Sprint 2 Design

## 개요
브릭 엔진을 실제로 사용 가능한 상태로 만들기 위한 Design 작성.
3개 Step을 하나의 Design으로 통합.

## 범위

### Step 1. 대시보드↔엔진 데이터 동기화
- Express(SQLite)와 Python 엔진(yaml/checkpoint) 사이 팀/블록타입/프리셋 동기화
- 대시보드에서 팀 만들면 엔진도 알아야 하고, 엔진에서 워크플로우 상태 바뀌면 대시보드도 알아야 함
- 단방향이 아닌 양방향 동기화 필요

### Step 2. 실행 → Adapter 연결
- 엔진 executor가 adapter_pool에서 adapter를 꺼내서 실제 tmux send-keys로 메시지 보내는 것
- claude_agent_teams adapter: tmux 세션명 + 메시지 포맷 + 완료 감지
- 최소: claude_agent_teams 1종만 실연결하면 됨

### Step 3. 실행 상태 실시간 표시
- 엔진 상태 변경 → WebSocket으로 대시보드에 push
- 기존 /api/brick/ws WebSocket 활용
- 블록 상태 변경 시 캔버스 노드 색상 실시간 반영 (코드 이미 있음, 연결만)

## 참고 파일
- 엔진: `brick/brick/engine/executor.py` (349줄)
- 어댑터: `brick/brick/adapters/claude_agent_teams.py`
- 브릿지: `dashboard/server/brick/engine/bridge.ts`
- WebSocket: `dashboard/server/routes/brick/websocket.ts`
- 캔버스: `dashboard/src/pages/brick/BrickCanvasPage.tsx`

## 산출물
- `docs/02-design/features/brick-sprint2-engine-sync.design.md`

## 제약
- COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
- 기존 코드를 최대한 활용. 새로 만들기보다 연결 우선.
