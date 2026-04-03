# TASK: SkyOffice Brick World UI Design

## 개요
SkyOffice 오픈소스를 커스텀해서 브릭 에이전트 시각화 UI로 만든다.
3축(Brick/Team/Link) 기반 공간형 UI.

## 범위

### 맵 설계
- Tiled 에디터로 맵 수정 (`client/public/assets/map/map.tmx`)
- 방 5개: Plan Room, Design Room, Do Room, QA Room, Review Room
- 복도: Link (방 사이 연결 통로)
- 각 방에 컴퓨터/화이트보드 오브젝트 배치

### 캐릭터 설계
- 에이전트 4명: PM, CTO-1, CTO-2, Codex
- 기존 스프라이트(adam/ash/lucy/nancy) 활용 가능
- 이름표 + 상태 표시 (idle/working/reviewing)

### 엔진 연동 설계
- Brick 엔진 WebSocket에서 에이전트 상태 받아서 캐릭터 자동 이동
- "Plan 블록 실행 중" → PM 캐릭터가 Plan Room으로 이동
- "Do 블록 실행 중" → CTO 캐릭터가 Do Room으로 이동
- 클릭하면 현재 TASK 정보 표시

### 사이드 패널
- React + MUI 기반 사이드 패널 (기존 SkyOffice 구조 활용)
- 워크플로우 상태, 블록 진행률, 팀 현황 표시

## 참고
- SkyOffice: `/Users/smith/projects/SkyOffice`
- 기술 스택: Phaser 3 + Colyseus + React + Redux + MUI
- 맵 에디터: Tiled (tmx 포맷)
- 비전: 에이전트가 운영하는 회사를 블록으로 건축하는 도구 (Minecraft + Scratch + EVE Online)

## 산출물
- `docs/02-design/features/brick-skyoffice-ui.design.md`

## 제약
- COO 의견은 하나의 의견일 뿐. 참고하되 최고의 방법을 찾아라.
- SkyOffice 기존 구조 최대한 활용. 게임 로직은 유지하고 콘텐츠만 교체.
