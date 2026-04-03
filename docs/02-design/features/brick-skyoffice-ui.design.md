# Brick SkyOffice UI Design: 에이전트가 운영하는 회사

> **피처**: brick-skyoffice-ui (3축 기반 공간형 UI)
> **레벨**: L2
> **작성**: PM | 2026-04-04
> **비전**: Minecraft + Scratch + EVE Online — 에이전트가 운영하는 회사를 블록으로 건축

---

## 0. 프로젝트 제약 조건

| 항목 | 값 |
|------|-----|
| **SkyOffice 경로** | `/Users/smith/projects/SkyOffice` |
| **기술 스택** | Phaser 3.55 + Colyseus 0.14 + React 18 + Redux Toolkit + MUI v5 |
| **맵 에디터** | Tiled (.tmx → .json, 40x30 타일, 32x32px) |
| **캐릭터** | 4종 스프라이트 (adam/ash/lucy/nancy, 32x48px, 52프레임) |
| **빌드** | Vite 3 + TypeScript |
| **포트** | Colyseus: 2567, Brick API: 3200, Python 엔진: 3202 |

### 0.1 SkyOffice 기존 구조 (유지)

| 컴포넌트 | 경로 | 상태 |
|----------|------|------|
| Phaser 게임 엔진 | `client/src/PhaserGame.ts` | ✅ 유지 |
| 3 씬 (Bootstrap, Background, Game) | `client/src/scenes/` | ✅ 유지 |
| Player 시스템 (MyPlayer/OtherPlayer) | `client/src/characters/` | ✅ 유지, 확장 |
| Item 시스템 (Chair/Computer/Whiteboard) | `client/src/items/` | ✅ 유지, 확장 |
| Redux 스토어 (5 슬라이스) | `client/src/stores/` | ✅ 유지, 슬라이스 추가 |
| phaserEvents 이벤트 버스 | `client/src/events/EventCenter.ts` | ✅ 유지 |
| 채팅 시스템 | `client/src/components/Chat.tsx` | ✅ 유지 |
| WebRTC 비디오 | `client/src/web/WebRTC.ts` | ✅ 유지 |
| MUI 다크 테마 | `client/src/MuiTheme.ts` | 🔄 커스텀 (Primary 컬러) |

### 0.2 커스텀 완료 항목

| 항목 | 상태 |
|------|------|
| 타이틀: "Brick World — 에이전트가 운영하는 회사" | ✅ 완료 |
| 방 이름: "Brick HQ" | ✅ 완료 |
| RoomSelectionDialog: "Welcome to Brick World" | ✅ 완료 |

---

## 1. 3축 기반 공간형 UI 개념

```
축 1: Brick (공간) ─── 방 5개 = PDCA 블록
축 2: Team (캐릭터) ── 에이전트 4명 = 실행자
축 3: Link (복도) ──── 방 사이 연결 = 워크플로우 흐름
```

### 1.1 맵 ↔ 워크플로우 매핑

| 게임 오브젝트 | Brick 개념 | 상태 표현 |
|-------------|-----------|----------|
| 방 (Room) | Block (Plan/Design/Do/QA/Review) | 바닥 타일 색상 = BlockStatus |
| 복도 (Corridor) | Link (sequential/loop/branch) | 복도 색상 = LinkType |
| 캐릭터 (Character) | Agent (PM/CTO-1/CTO-2/Codex) | 위치 = 현재 블록, 애니메이션 = 상태 |
| 컴퓨터 (Computer) | Block Detail 패널 | 클릭 시 블록 상세 표시 |
| 화이트보드 (Whiteboard) | Block Output 표시 | 클릭 시 artifacts 표시 |

---

## 2. 맵 설계

### 2.1 방 배치 (Tiled 에디터)

```
┌─────────────────────────────────────────────┐
│                                             │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐ │
│  │  Plan    │────│ Design  │────│   Do    │ │
│  │  Room    │    │  Room   │    │  Room   │ │
│  └────┬────┘    └─────────┘    └────┬────┘ │
│       │                              │      │
│       │         ┌─────────┐         │      │
│       │         │  로비    │         │      │
│       │         │ (시작점) │         │      │
│       │         └─────────┘         │      │
│       │                              │      │
│  ┌────┴────┐                   ┌────┴────┐ │
│  │ Review  │───────────────────│   QA    │ │
│  │  Room   │                   │  Room   │ │
│  └─────────┘                   └─────────┘ │
│                                             │
└─────────────────────────────────────────────┘
```

### 2.2 타일맵 사양

| 항목 | 값 |
|------|-----|
| 맵 크기 | 50x40 타일 (1600x1280px) |
| 타일 크기 | 32x32px |
| 방 크기 | 각 10x8 타일 (320x256px) |
| 복도 폭 | 3 타일 (96px) |
| 로비 | 중앙 8x6 타일 |

### 2.3 레이어 구조 (Tiled)

| 레이어 | 타입 | 용도 |
|--------|------|------|
| `Ground` | Tile | 바닥 (방별 색상 구분) |
| `Wall` | Object | 벽 충돌체 |
| `Rooms` | Object | 방 영역 정의 (Custom Property: `roomId`, `blockType`) |
| `Corridors` | Object | 복도 영역 (Custom Property: `linkType`, `from`, `to`) |
| `Computer` | Object | 방별 컴퓨터 (5개, `roomId` 프로퍼티) |
| `Whiteboard` | Object | 방별 화이트보드 (5개, `roomId` 프로퍼티) |
| `Chair` | Object | 좌석 (방별 2~4개) |
| `StatusBoard` | Object | 방 입구 상태 게시판 (5개, 신규 아이템) |
| `Decoration` | Object | 장식 (식물, 시계 등) |

### 2.4 방 Custom Properties (Tiled Object)

```json
{
  "name": "Plan Room",
  "type": "room",
  "properties": {
    "roomId": "plan",
    "blockType": "Plan",
    "color": "#3B82F6"
  }
}
```

| roomId | blockType | 색상 | 가구 |
|--------|----------|------|------|
| `plan` | Plan | #3B82F6 (blue) | 컴퓨터 1 + 화이트보드 1 + 의자 3 |
| `design` | Design | #8B5CF6 (purple) | 컴퓨터 1 + 화이트보드 1 + 의자 3 |
| `do` | Do | #10B981 (green) | 컴퓨터 2 + 의자 4 |
| `qa` | QA | #F59E0B (amber) | 컴퓨터 1 + 화이트보드 1 + 의자 2 |
| `review` | Review | #EF4444 (red) | 화이트보드 2 + 의자 3 |

---

## 3. 캐릭터 설계

### 3.1 에이전트 ↔ 캐릭터 매핑

| 에이전트 | 스프라이트 | 역할 | 기본 위치 |
|----------|----------|------|----------|
| PM | `adam` | Plan/Design 담당 | Plan Room |
| CTO-1 | `ash` | 구현 + QA 담당 | Do Room |
| CTO-2 | `lucy` | 구현 + 통합 담당 | Do Room |
| Codex | `nancy` | 코드 리뷰 + 테스트 | QA Room |

### 3.2 AI 캐릭터 (BrickAgent) — 신규 클래스

`client/src/characters/BrickAgent.ts`:

```typescript
import Player from './Player';

interface AgentConfig {
  agentId: string;         // "pm", "cto-1", "cto-2", "codex"
  agentName: string;       // 한국어 표시명
  texture: string;         // "adam", "ash", "lucy", "nancy"
  homeRoom: string;        // 기본 방 ID
}

export class BrickAgent extends Player {
  private agentId: string;
  private currentRoom: string;
  private status: 'idle' | 'working' | 'reviewing' | 'moving' = 'idle';
  private targetPosition: { x: number; y: number } | null = null;

  constructor(scene: Phaser.Scene, config: AgentConfig) {
    super(scene, config.homeRoom_x, config.homeRoom_y, config.texture, config.agentId);
    this.agentId = config.agentId;
    this.currentRoom = config.homeRoom;
    this.setNameLabel(config.agentName);
    this.setStatusBadge('idle');
  }

  // 방 이동 (자동 패스파인딩)
  moveTo(roomId: string): void {
    if (roomId === this.currentRoom) return;
    const target = this.scene.getRoomCenter(roomId);
    this.targetPosition = target;
    this.status = 'moving';
    this.setStatusBadge('이동 중...');
  }

  // 상태 업데이트
  setAgentStatus(status: 'idle' | 'working' | 'reviewing'): void {
    this.status = status;
    const labels = { idle: '대기', working: '작업 중', reviewing: '리뷰 중' };
    this.setStatusBadge(labels[status]);
  }

  // 이름 위 상태 뱃지
  private setStatusBadge(text: string): void {
    // playerContainer에 상태 텍스트 추가 (기존 nameLabel 아래)
    this.updateDialogBubble(text);
  }

  update(dt: number): void {
    if (this.targetPosition) {
      // 단순 이동: 목표까지 200px/s로 이동
      const dx = this.targetPosition.x - this.x;
      const dy = this.targetPosition.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) {
        this.targetPosition = null;
        this.setVelocity(0, 0);
        this.currentRoom = this.getClosestRoom();
      } else {
        const speed = 200;
        this.setVelocity((dx / dist) * speed, (dy / dist) * speed);
        // 이동 방향에 따른 애니메이션
        this.playMoveAnimation(dx, dy);
      }
    }
  }
}
```

### 3.3 이름표 + 상태 표시

기존 `Player` 클래스의 `playerContainer`(name label + dialog bubble) 활용:
- **이름표**: `[PM] 모찌`, `[CTO-1] 개발자1` 형식
- **상태 뱃지**: 이름표 아래 작은 텍스트 (`대기` / `작업 중` / `리뷰 중` / `이동 중`)
- **말풍선**: 현재 TASK 내용 표시 (`updateDialogBubble`)

### 3.4 상태별 애니메이션

| 상태 | 애니메이션 | 설명 |
|------|----------|------|
| `idle` | `{texture}_idle_down` | 대기 (방 안에서 정지) |
| `working` | `{texture}_sit_down` | 컴퓨터 앞 착석 |
| `reviewing` | `{texture}_idle_left` + 말풍선 | 화이트보드 앞 서있기 |
| `moving` | `{texture}_run_{direction}` | 방 이동 중 |

---

## 4. 엔진 연동 설계

### 4.1 Brick WebSocket → Phaser 이벤트

`client/src/services/BrickEngineService.ts` (신규):

```typescript
import { phaserEvents } from '../events/EventCenter';
import { store } from '../stores';

export class BrickEngineService {
  private ws: WebSocket | null = null;

  connect(brickApiUrl: string): void {
    this.ws = new WebSocket(`ws://${brickApiUrl}`);

    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case 'brick.block.changed':
          this.handleBlockChanged(msg.data);
          break;
        case 'brick.execution.updated':
          this.handleExecutionUpdated(msg.data);
          break;
      }
    };
  }

  private handleBlockChanged(data: {
    executionId: number;
    blockId: string;
    oldStatus: string;
    newStatus: string;
  }): void {
    // 1. Redux 스토어 업데이트
    store.dispatch(updateBlockStatus(data));

    // 2. Phaser 이벤트 발행 → 캐릭터 이동 트리거
    phaserEvents.emit('BRICK_BLOCK_CHANGED', data);

    // 3. 블록 시작 → 담당 에이전트를 해당 방으로 이동
    if (data.newStatus === 'running') {
      phaserEvents.emit('BRICK_AGENT_MOVE', {
        blockId: data.blockId,
        status: 'working',
      });
    }
  }

  private handleExecutionUpdated(data: any): void {
    store.dispatch(updateExecution(data));
    phaserEvents.emit('BRICK_EXECUTION_UPDATED', data);
  }
}
```

### 4.2 블록 상태 → 에이전트 이동 규칙

| 블록 상태 변경 | 에이전트 동작 |
|-------------|-------------|
| Plan → `running` | PM이 Plan Room으로 이동, `working` 상태 |
| Design → `running` | PM이 Design Room으로 이동, `working` 상태 |
| Do → `running` | CTO-1, CTO-2가 Do Room으로 이동, `working` 상태 |
| QA → `running` | Codex가 QA Room으로 이동, `reviewing` 상태 |
| Review → `running` | PM이 Review Room으로 이동, `reviewing` 상태 |
| 블록 → `completed` | 해당 방의 에이전트들 `idle` 전환 |
| 블록 → `gate_checking` | 해당 에이전트 말풍선 "Gate 검사 중..." |
| 블록 → `waiting_approval` | PM이 Review Room 이동, 말풍선 "CEO 승인 대기" |

### 4.3 Game 씬 연동

`client/src/scenes/Game.ts` — 기존 `create()` 메서드에 추가:

```typescript
// BrickAgent 생성 (4명)
this.agents = {
  pm: new BrickAgent(this, { agentId: 'pm', agentName: '[PM] 모찌', texture: 'adam', homeRoom: 'plan' }),
  'cto-1': new BrickAgent(this, { agentId: 'cto-1', agentName: '[CTO-1] 개발자1', texture: 'ash', homeRoom: 'do' }),
  'cto-2': new BrickAgent(this, { agentId: 'cto-2', agentName: '[CTO-2] 개발자2', texture: 'lucy', homeRoom: 'do' }),
  codex: new BrickAgent(this, { agentId: 'codex', agentName: '[Codex] 코드리뷰', texture: 'nancy', homeRoom: 'qa' }),
};

// 엔진 이벤트 리스너
phaserEvents.on('BRICK_AGENT_MOVE', ({ blockId, status }) => {
  const roomId = blockId; // blockId = roomId (plan, design, do, qa, review)
  const agents = this.getAgentsForBlock(blockId);
  for (const agent of agents) {
    agent.moveTo(roomId);
    agent.setAgentStatus(status);
  }
});
```

### 4.4 블록 ↔ 에이전트 담당 매핑

```typescript
const BLOCK_AGENTS: Record<string, string[]> = {
  plan: ['pm'],
  design: ['pm'],
  do: ['cto-1', 'cto-2'],
  qa: ['codex'],
  review: ['pm', 'codex'],
};
```

---

## 5. 사이드 패널

### 5.1 Redux 슬라이스 추가

`client/src/stores/BrickStore.ts` (신규):

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface BlockState {
  id: string;
  status: string;
  currentAgent: string[];
}

interface BrickState {
  executionId: number | null;
  status: string;
  blocks: Record<string, BlockState>;
  selectedBlockId: string | null;
  sidebarOpen: boolean;
}

const brickSlice = createSlice({
  name: 'brick',
  initialState: {
    executionId: null,
    status: 'idle',
    blocks: {},
    selectedBlockId: null,
    sidebarOpen: false,
  } as BrickState,
  reducers: {
    updateBlockStatus(state, action: PayloadAction<{ blockId: string; newStatus: string }>) {
      if (state.blocks[action.payload.blockId]) {
        state.blocks[action.payload.blockId].status = action.payload.newStatus;
      }
    },
    updateExecution(state, action: PayloadAction<any>) {
      state.status = action.payload.status;
      state.blocks = action.payload.blocksState;
    },
    selectBlock(state, action: PayloadAction<string>) {
      state.selectedBlockId = action.payload;
      state.sidebarOpen = true;
    },
    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen;
    },
  },
});
```

### 5.2 사이드 패널 컴포넌트

`client/src/components/BrickSidebar.tsx` (신규):

```typescript
// MUI Drawer 기반 사이드 패널
// 내용:
// 1. 워크플로우 상태 (running/completed/failed)
// 2. 블록 진행률 (5/6 완료, 프로그레스 바)
// 3. 현재 블록 상세 (블록명, 상태, 시작시간, 에이전트)
// 4. 팀 현황 (4명 에이전트 상태 목록)
// 5. 최근 로그 (이벤트 타임라인)
```

### 5.3 에이전트 클릭 → TASK 정보

`BrickAgent`를 클릭하면 사이드 패널에 해당 에이전트 정보 표시:

```typescript
// Game.ts — 에이전트 클릭 이벤트
for (const agent of Object.values(this.agents)) {
  agent.setInteractive();
  agent.on('pointerdown', () => {
    store.dispatch(selectAgent(agent.agentId));
    phaserEvents.emit('BRICK_AGENT_CLICKED', { agentId: agent.agentId });
  });
}
```

### 5.4 방 바닥 색상 변경

블록 상태에 따라 방 바닥 타일 색상 변경:

```typescript
const ROOM_STATUS_TINT: Record<string, number> = {
  pending: 0x9CA3AF,    // 회색
  running: 0x3B82F6,    // 파란색
  completed: 0x10B981,  // 녹색
  failed: 0xEF4444,     // 빨간색
};

// Game.ts — 방 바닥 타일 tint 적용
phaserEvents.on('BRICK_BLOCK_CHANGED', ({ blockId, newStatus }) => {
  const roomTiles = this.getRoomTiles(blockId);
  const tint = ROOM_STATUS_TINT[newStatus] || 0xFFFFFF;
  for (const tile of roomTiles) {
    tile.setTint(tint);
  }
});
```

---

## 6. App.tsx UI 흐름

```
loggedIn=false, roomJoined=false  → RoomSelectionDialog ("Welcome to Brick World")
loggedIn=false, roomJoined=true   → LoginDialog (캐릭터 선택)
loggedIn=true (기본)              → 게임 + Chat + BrickSidebar
  + computerDialogOpen            → ComputerDialog (블록 상세)
  + whiteboardDialogOpen          → WhiteboardDialog (artifacts)
  + brickSidebarOpen              → BrickSidebar (워크플로우 상태)
```

---

## 7. 파일 변경 목록

| 파일 | 변경 유형 | 내용 |
|------|----------|------|
| `client/public/assets/map/map.tmx` | 수정 | 5방+복도 맵 설계 (Tiled) |
| `client/public/assets/map/map.json` | 수정 | 맵 JSON 컴파일 |
| `client/src/characters/BrickAgent.ts` | 신규 | AI 에이전트 캐릭터 클래스 |
| `client/src/services/BrickEngineService.ts` | 신규 | Brick API WebSocket 연동 |
| `client/src/stores/BrickStore.ts` | 신규 | Brick Redux 슬라이스 |
| `client/src/components/BrickSidebar.tsx` | 신규 | 사이드 패널 (MUI Drawer) |
| `client/src/scenes/Game.ts` | 수정 | BrickAgent 생성 + 이벤트 리스너 |
| `client/src/scenes/Bootstrap.ts` | 수정 | BrickEngineService 초기화 |
| `client/src/components/App.tsx` | 수정 | BrickSidebar 추가 |
| `client/src/stores/index.ts` | 수정 | brick 슬라이스 등록 |
| `client/src/MuiTheme.ts` | 수정 | Primary: #F75D5D (bscamp) |
| `server/index.ts` | 수정 | Brick API URL 설정 |

---

## 8. TDD

| ID | 테스트명 | 검증 | 기대 |
|----|---------|------|------|
| SK-01 | `test_sk01_agent_move_to_room` | PM.moveTo('design') | Design Room 좌표로 이동 |
| SK-02 | `test_sk02_agent_status_change` | setAgentStatus('working') | 뱃지 텍스트 '작업 중' |
| SK-03 | `test_sk03_block_changed_triggers_move` | brick.block.changed plan→running | PM이 Plan Room으로 이동 |
| SK-04 | `test_sk04_room_tint_on_status` | plan→completed | Plan Room 타일 녹색 tint |
| SK-05 | `test_sk05_agent_click_opens_sidebar` | 에이전트 클릭 | BrickSidebar 오픈 |
| SK-06 | `test_sk06_sidebar_shows_execution` | 실행 상태 표시 | blocks 진행률 표시 |
| SK-07 | `test_sk07_ws_connects_to_brick_api` | BrickEngineService.connect() | WebSocket 연결 |
| SK-08 | `test_sk08_map_has_5_rooms` | Tiled map rooms 오브젝트 | 5개 roomId |
| SK-09 | `test_sk09_multiple_agents_in_room` | Do 블록 running | CTO-1, CTO-2 둘 다 Do Room |
| SK-10 | `test_sk10_completed_agents_idle` | 블록 completed | 에이전트 idle 상태 |

---

## 9. 불변식

| ID | 규칙 | 검증 |
|----|------|------|
| INV-SK-1 | 블록 running 시 담당 에이전트는 해당 방에 있어야 함 | SK-03 |
| INV-SK-2 | 방 바닥 색상은 BlockStatus와 일치해야 함 | SK-04 |
| INV-SK-3 | 에이전트 클릭 시 사이드 패널에 정확한 TASK 표시 | SK-05 |
| INV-SK-4 | WebSocket 끊김 시 폴링 폴백 동작해야 함 | — |
| INV-SK-5 | 맵에 5개 방 + 복도가 정의돼야 함 | SK-08 |

---

*Design 끝 — SkyOffice 커스텀: 5방 맵 + AI 에이전트 4명 + 엔진 WebSocket 연동 + 사이드 패널*
