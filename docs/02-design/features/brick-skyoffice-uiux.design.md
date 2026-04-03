# Brick SkyOffice UI/UX Design: 공간형 워크플로우 조립기

> **피처**: `brick-skyoffice-uiux`
> **레벨**: L2
> **작성**: Codex | 2026-04-04
> **입력 문서**: `TASK-skyoffice-uiux-design`, `brick-skyoffice-ui.design`, `brick-product-vision`, `brick-product-spec`

---

## 0. 문서 목적

SkyOffice를 브릭 엔진의 공간형 인터페이스로 확장한다.

- **Phaser 오피스 뷰**는 실행 상태를 보여주는 운영 화면이다.
- **React 패널**은 블록을 조립하고 팀을 배정하는 설계 화면이다.
- **복도는 없다.** Handoff는 "한 에이전트가 상대 에이전트에게 직접 걸어가 서류를 전달"하는 동작으로 표현한다.

이 문서는 아래 4가지를 고정한다.

1. 5개 핵심 화면의 와이어프레임
2. Phaser/React/Redux/Colyseus 기준 컴포넌트 트리
3. Colyseus ↔ Brick API 메시지 스키마
4. `map.tmx` 기준 맵 수정 사항

---

## 1. 설계 원칙

### 1.1 3축 매핑

| 브릭 축 | SkyOffice 표현 | UI 책임 |
|---|---|---|
| Brick | 방(Room) + 책상 + 상태 보드 | Phaser 뷰 + React 인스펙터 |
| Team | 캐릭터(Agent) + 아바타 카드 | Phaser 뷰 + 팀 관리 패널 |
| Link | 빌더 캔버스의 연결선 | React 빌더 패널 |

### 1.2 모드 분리 원칙

| 영역 | 역할 | 하지 않는 일 |
|---|---|---|
| Phaser | 방 상태, 에이전트 이동, handoff 애니메이션, 선택 피드백 | 복잡한 폼 편집, 블록 연결 편집 |
| React | 블록 조립, Gate/Adapter 편집, 팀 배정, 타임라인 | 캐릭터 이동 연출, 맵 충돌 처리 |
| Colyseus | 실시간 동기화, 오피스 상태 fan-out, 클라이언트 세션 관리 | 브릭 실행 로직 자체 |
| Brick API | 실행/검증/프리셋/승인/로그의 소스 오브 트루스 | 렌더링, 실시간 UI 애니메이션 |

### 1.3 UX 불변식

1. 사용자는 항상 "현재 어떤 블록이 돌고 있고, 누가 맡았고, 어디로 넘길지"를 3초 안에 파악해야 한다.
2. 방을 클릭하면 블록 정보가 열리고, 사람을 클릭하면 에이전트 정보가 열린다.
3. 빌더에서 바꾼 구조는 오피스 뷰의 방/배정/연결 후보에 즉시 반영된다.
4. 실행 중인 워크플로우는 빌더에서 구조 수정이 제한된다. 수정 가능 범위는 별도로 표시한다.
5. handoff는 항상 `출발 에이전트 이동 → 수신 에이전트와 근접 → 서류 전달 → 출발자 복귀` 순서를 따른다.

---

## 2. 정보 구조

### 2.1 전체 화면 레이아웃

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Top Bar: Workspace / Preset / Execution / Run / Pause / Approval    │
├───────────────────────────────┬──────────────────────────────────────┤
│                               │ Right Panel                          │
│ Office View (Phaser)          │ - Builder                            │
│ - room state                  │ - Inspector                          │
│ - agent movement              │ - Team manager                       │
│ - handoff animation           │                                      │
│                               │                                      │
├───────────────────────────────┴──────────────────────────────────────┤
│ Bottom Timeline: execution history / retries / approvals / logs      │
└──────────────────────────────────────────────────────────────────────┘
```

### 2.2 주요 객체

| 객체 | 식별자 | 설명 |
|---|---|---|
| RoomNode | `plan`, `design`, `do`, `qa`, `review` | 오피스 뷰의 방이자 브릭 블록 |
| AgentAvatar | `pm`, `cto_1`, `cto_2`, `codex` | 방에 배정된 실행자 |
| HandoffJob | `fromBlockId`, `toBlockId`, `artifactId` | 서류 전달 애니메이션 단위 |
| BuilderNode | `blockId` | React 캔버스의 조립 단위 |
| BuilderEdge | `linkId` | 블록 간 연결 규칙 |
| ExecutionTrack | `executionId` | 타임라인 렌더링 단위 |

---

## 3. 사용자 흐름

### 3.1 빌드 흐름

1. 사용자가 프리셋 또는 빈 캔버스를 연다.
2. 블록 팔레트에서 블록을 드래그해 캔버스에 놓는다.
3. 팀 팔레트에서 에이전트를 블록에 드롭해 담당자를 정한다.
4. 연결선을 그어 `sequential`, `branch`, `loop`, `parallel` 중 Link를 정한다.
5. 블록을 클릭해 Gate, Adapter, 입력 컨텍스트를 편집한다.
6. 저장하면 Colyseus room state와 React store가 갱신되고, 오피스 뷰 방 레이블과 상태 보드도 동기화된다.

### 3.2 실행 흐름

1. 사용자가 실행 버튼을 누른다.
2. Colyseus 브리지 서버가 Brick API에 execution 시작 요청을 보낸다.
3. 블록 상태가 `running`이 되면 담당 에이전트가 해당 책상으로 이동해 working 애니메이션을 시작한다.
4. 블록 완료 시 출발 에이전트가 다음 블록 담당자에게 직접 걸어가 서류를 넘긴다.
5. Gate가 실패하면 해당 방 상태 보드와 타임라인이 `failed` 또는 `retrying`으로 바뀐다.
6. 승인 대기면 Review 방이 강조되고 Top Bar 및 Timeline에 승인 배지가 뜬다.

---

## 4. 화면 설계

## 화면 1. 오피스 뷰

### 목적

워크플로우를 "사무실 안에서 사람들이 일하는 장면"으로 읽게 하는 메인 모니터링 화면.

### 와이어프레임

```text
┌──────────────────────────────────────────────────────────────┐
│ Top Bar: Brick World | Preset: T-PDCA L2 | Run | Pause      │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [Plan]         [Design]                 [Do]                │
│  ┌──────────┐   ┌──────────┐            ┌──────────────┐      │
│  │ status   │   │ status   │            │ status       │      │
│  │ PM desk  │   │ PM desk  │            │ CTO-1 desk   │      │
│  │ bubble   │   │ handoff  │            │ CTO-2 desk   │      │
│  └──────────┘   └──────────┘            └──────────────┘      │
│        \              agent walking + document icon   /       │
│                                                              │
│  [Review]                                 [QA]               │
│  ┌──────────┐                             ┌──────────┐        │
│  │ approve  │                             │ codex    │        │
│  │ board    │                             │ gate     │        │
│  └──────────┘                             └──────────┘        │
│                                                              │
├──────────────────────────────────────────────────────────────┤
│ Bottom Timeline preview                                      │
└──────────────────────────────────────────────────────────────┘
```

### 인터랙션

- 방 클릭: 우측 패널이 Block Inspector 탭으로 전환된다.
- 에이전트 클릭: Agent Drawer가 열리고 현재 TASK, 배정 블록, 최근 handoff를 보여준다.
- 진행 중인 방: 바닥 네온 글로우 + 상태 보드 점멸.
- handoff 중: 출발/도착 에이전트 둘 다 하이라이트, 서류 스프라이트 표시.
- 승인 대기: Review 방 문 앞에 잠금 아이콘 표시.

### 시각 규칙

| 상태 | 방 바닥 | 상태 보드 | 캐릭터 |
|---|---|---|---|
| pending | muted navy | 회색 | idle |
| running | neon coral glow | 진행 바 | working |
| gate_checking | amber pulse | 검사중 | reviewing |
| waiting_approval | locked red | 승인대기 | standing |
| completed | teal accent | 완료 | idle |
| failed | dark red | 실패 | stunned bubble |

---

## 화면 2. 빌더 패널

### 목적

브릭의 3축을 조립하는 메인 편집 화면. Phaser 위에 떠 있는 React 사이드 패널이다.

### 와이어프레임

```text
┌────────────────────────────────────────────┐
│ Builder                                    │
├──────────────┬─────────────────────────────┤
│ Block Palette│ Canvas                      │
│ - Plan       │  [Plan]──seq──>[Design]     │
│ - Design     │      \                      │
│ - Do         │       \branch               │
│ - Gate       │        v                    │
│ - Approval   │      [Research]             │
│              │                \            │
│ Team Palette │                 \           │
│ - PM         │         [Do]──loop──>[QA]   │
│ - CTO-1      │                  \          │
│ - CTO-2      │                   >[Review] │
│ - Codex      │                             │
├──────────────┴─────────────────────────────┤
│ Presets: T-PDCA L0 L1 L2 L3 | Hotfix | Research             │
└────────────────────────────────────────────┘
```

### 인터랙션

- 블록 드래그 앤 드롭: 새 블록 생성.
- 팀 아바타 드롭: `assignedTeamId`, `agentIds` 즉시 변경.
- 엣지 생성: Link 타입 선택 팝오버 오픈.
- 실행 중인 노드: 위치 이동 불가, 설정 변경 가능 범위만 노출.
- 오피스와 동기화: 선택된 BuilderNode가 대응 방을 Phaser에서 강조한다.

### UX 결정

- 캔버스는 자유 배치지만 기본 스냅은 좌우 흐름이다.
- Link는 선의 모양보다 의미가 중요하므로 색상 + 라벨을 같이 쓴다.
- "방 생성"은 별도 기능이 아니라 블록 생성 결과다.

---

## 화면 3. 블록 인스펙터

### 목적

선택된 블록의 실행 규칙을 수정하는 정밀 편집 화면.

### 와이어프레임

```text
┌────────────────────────────────────┐
│ Block Inspector                    │
├────────────────────────────────────┤
│ Block: Design                      │
│ Type: [Design v]                   │
│ Assigned Team: [PM Team v]         │
│ Agent: [PM]                        │
│ Input Context: feature, spec, ADR  │
│                                    │
│ Gate                               │
│ - Type: [match_rate v]             │
│ - Threshold: [95 ] %               │
│ - On Fail: [loop to Design v]      │
│                                    │
│ Adapter                            │
│ - Type: [claude_agent_teams v]     │
│ - Team: [pm-team v]                │
│                                    │
│ Runtime                            │
│ - status: running                  │
│ - startedAt: 01:33                 │
│ - retries: 1                       │
└────────────────────────────────────┘
```

### 인터랙션

- Gate 타입 변경 시 필드 셋이 동적으로 바뀐다.
- Link on fail은 기존 연결 목록에서만 선택 가능하다.
- 실행 중일 때는 구조 필드 일부 읽기 전용으로 잠근다.
- 하단에는 최근 실행 결과와 artifact 링크를 노출한다.

---

## 화면 4. 팀 관리

### 목적

에이전트 풀과 블록 배정을 관리하는 운영 화면.

### 와이어프레임

```text
┌──────────────────────────────────────────┐
│ Team Manager                             │
├──────────────────────────────────────────┤
│ Agents                                   │
│ [PM]     idle      assigned: Plan,Review │
│ [CTO-1]  working   assigned: Do          │
│ [CTO-2]  idle      assigned: Do          │
│ [Codex]  waiting   assigned: QA          │
│                                          │
│ Assignment Board                         │
│ Plan    <- PM                            │
│ Design  <- PM                            │
│ Do      <- CTO-1, CTO-2                  │
│ QA      <- Codex                         │
│ Review  <- PM                            │
│                                          │
│ [+ Add Agent] [Rebalance] [Apply preset] │
└──────────────────────────────────────────┘
```

### 인터랙션

- 에이전트 카드를 블록 슬롯에 드롭하면 배정이 바뀐다.
- 에이전트 클릭 시 skill/adaptor/capacity를 편집한다.
- 새 에이전트 추가는 캐릭터 스프라이트 선택과 Adapter 타입 선택을 함께 요구한다.
- Rebalance는 추천안만 생성하고 자동 적용은 하지 않는다.

---

## 화면 5. 실행 타임라인

### 목적

현재 execution의 시간 흐름, 재시도, 승인, 실패 원인을 한 줄로 읽는 하단 운영 패널.

### 와이어프레임

```text
┌──────────────────────────────────────────────────────────────┐
│ Execution Timeline                                           │
├──────────────────────────────────────────────────────────────┤
│ Plan  ✓  01:10-01:14                                         │
│ Design✓  01:14-01:22                                         │
│ Do    ↻  01:22-01:40   retry 1                               │
│ QA    !  gate failed: coverage < 90                          │
│ Review⏸  waiting approval by Smith                           │
├──────────────────────────────────────────────────────────────┤
│ [filter: all / failures / approvals] [open logs]             │
└──────────────────────────────────────────────────────────────┘
```

### 인터랙션

- 타임라인 항목 클릭: 우측 패널이 해당 블록 또는 승인 상세로 이동한다.
- 실패 항목 hover: Gate 결과와 reject reason 툴팁 노출.
- 하단 로그 버튼: 상세 이벤트 스트림 열기.

---

## 5. 컴포넌트 트리

## 5.1 React 트리

```text
App
├─ WorkspaceShell
│  ├─ TopBar
│  │  ├─ WorkspaceSwitcher
│  │  ├─ PresetSelector
│  │  ├─ ExecutionControls
│  │  └─ ApprovalIndicator
│  ├─ OfficeViewport
│  │  ├─ PhaserContainer
│  │  └─ OfficeOverlay
│  │     ├─ RoomHoverTooltip
│  │     ├─ AgentProfileCard
│  │     └─ HandoffToast
│  ├─ SidePanel
│  │  ├─ PanelTabs
│  │  ├─ BuilderPanel
│  │  │  ├─ BlockPalette
│  │  │  ├─ TeamPalette
│  │  │  ├─ PresetRail
│  │  │  └─ BuilderCanvas
│  │  ├─ BlockInspector
│  │  │  ├─ BlockHeader
│  │  │  ├─ GateEditor
│  │  │  ├─ AdapterEditor
│  │  │  ├─ LinkSummary
│  │  │  └─ RuntimeSummary
│  │  └─ TeamManager
│  │     ├─ AgentList
│  │     ├─ AssignmentBoard
│  │     └─ AgentEditorDialog
│  └─ BottomDock
│     ├─ ExecutionTimeline
│     ├─ EventLogDrawer
│     └─ ApprovalDrawer
└─ Existing dialogs
   ├─ LoginDialog
   ├─ RoomSelectionDialog
   ├─ VideoConnectionDialog
   └─ Chat
```

## 5.2 Phaser 트리

```text
BootstrapScene
BackgroundScene
GameScene
├─ TilemapLayers
│  ├─ Ground
│  ├─ Wall
│  ├─ Objects
│  ├─ ObjectsOnCollide
│  ├─ GenericObjects
│  └─ Basement
├─ RoomZoneManager
│  ├─ RoomZone(plan)
│  ├─ RoomZone(design)
│  ├─ RoomZone(do)
│  ├─ RoomZone(qa)
│  └─ RoomZone(review)
├─ OfficeFurniture
│  ├─ Computer instances
│  ├─ Whiteboard instances
│  ├─ Chair instances
│  └─ StatusBoard instances
├─ AgentLayer
│  ├─ BrickAgent(pm)
│  ├─ BrickAgent(cto-1)
│  ├─ BrickAgent(cto-2)
│  └─ BrickAgent(codex)
├─ HandoffLayer
│  ├─ DocumentSprite
│  ├─ PathPreview
│  └─ ArrivalPulse
└─ InteractionLayer
   ├─ PlayerSelector
   ├─ RoomHitAreas
   └─ AgentHitAreas
```

## 5.3 Redux 슬라이스 제안

| 슬라이스 | 책임 |
|---|---|
| `brickWorkflow` | 블록/링크/프리셋/선택 상태 |
| `brickExecution` | execution 상태, 타임라인, 로그, approval |
| `brickTeam` | 에이전트 풀, 배정, capacity |
| `officeView` | 선택 방, 선택 에이전트, handoff overlay |
| 기존 `room/user/chat/computer/whiteboard` | SkyOffice 기본 기능 유지 |

---

## 6. 데이터 흐름

### 6.1 시스템 흐름

```text
React Builder/Inspector
        │ dispatch
        v
Redux Store
        │ sync intent
        v
Colyseus Room (SkyOffice)
        │ bridge call
        v
Brick Bridge Service
        │ REST
        v
Brick API (:3200)
        │ engine bridge
        v
Python Engine (:3202)
```

### 6.2 책임 분리

- React는 사용자 편집 intent를 만든다.
- Colyseus는 여러 클라이언트에 office 상태를 fan-out 한다.
- Brick Bridge Service는 REST 요청과 execution 이벤트 구독을 담당한다.
- Phaser는 Colyseus state를 애니메이션 가능한 뷰 상태로 변환한다.

---

## 7. Colyseus ↔ Brick API 메시지 스키마

## 7.1 Colyseus Room State 확장

```ts
type BlockStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'gate_checking'
  | 'waiting_approval'
  | 'completed'
  | 'failed'
  | 'retrying'

interface OfficeRoomNode {
  roomId: 'plan' | 'design' | 'do' | 'qa' | 'review'
  blockId: string
  blockType: string
  status: BlockStatus
  assignedAgentIds: string[]
  activeArtifactId?: string
  queueCount: number
}

interface OfficeAgentState {
  agentId: string
  name: string
  role: string
  sprite: 'adam' | 'ash' | 'lucy' | 'nancy'
  homeRoomId: string
  currentRoomId: string
  status: 'idle' | 'walking' | 'working' | 'reviewing' | 'handoff'
  currentTask?: string
  assignedBlockIds: string[]
}

interface HandoffState {
  handoffId: string
  executionId: string
  fromBlockId: string
  toBlockId: string
  fromAgentId: string
  toAgentId: string
  artifactId: string
  stage: 'walking' | 'delivering' | 'returning' | 'done'
}
```

## 7.2 Colyseus 클라이언트 → 브리지 메시지

| 메시지 | 용도 | 페이로드 |
|---|---|---|
| `brick:workflow.save` | 빌더 저장 | `presetId?`, `blocks`, `links`, `teams` |
| `brick:execution.start` | execution 시작 | `workflowId`, `projectId`, `feature`, `presetId?` |
| `brick:execution.pause` | 일시정지 | `executionId` |
| `brick:execution.resume` | 재개 | `executionId` |
| `brick:block.patch` | 블록 편집 | `blockId`, `patch` |
| `brick:assignment.patch` | 에이전트 배정 변경 | `blockId`, `agentIds` |
| `brick:approval.submit` | 승인/반려 | `approvalId`, `action`, `comment?` |

### 예시

```json
{
  "type": "brick:execution.start",
  "payload": {
    "workflowId": "wf_skyoffice_l2",
    "projectId": "bscamp",
    "feature": "skyoffice-uiux",
    "presetId": "t-pdca-l2"
  }
}
```

## 7.3 브리지 → Brick API REST

| REST | 설명 |
|---|---|
| `POST /api/brick/workflows` | 워크플로우 저장 |
| `PATCH /api/brick/workflows/:workflowId/blocks/:blockId` | 블록 수정 |
| `PATCH /api/brick/workflows/:workflowId/assignments` | 팀 배정 수정 |
| `POST /api/brick/executions` | 실행 시작 |
| `POST /api/brick/executions/:id/pause` | 일시정지 |
| `POST /api/brick/executions/:id/resume` | 재개 |
| `POST /api/brick/approvals/:id/decision` | 승인/반려 |

## 7.4 Brick API 이벤트 → Colyseus broadcast

| 이벤트 | 설명 | Phaser 반응 |
|---|---|---|
| `brick.execution.started` | execution 시작 | Top Bar/Timeline 초기화 |
| `brick.block.status.changed` | 블록 상태 전이 | 방 색상, 상태 보드 변경 |
| `brick.block.assigned` | 팀/에이전트 배정 변경 | 방 좌석/인스펙터 갱신 |
| `brick.handoff.created` | 다음 블록으로 전달 시작 | 캐릭터 walking + 문서 스프라이트 |
| `brick.handoff.completed` | 전달 완료 | 수신 방 강조, 발신자 복귀 |
| `brick.gate.result` | Gate 통과/실패 | QA/Review 패널 및 타임라인 갱신 |
| `brick.approval.requested` | 승인 대기 | Review 방 lock 표시 |
| `brick.execution.completed` | 전체 완료 | 전체 성공 상태 표시 |
| `brick.execution.failed` | 전체 실패 | 실패 토스트/로그 강조 |

### 예시

```json
{
  "type": "brick.block.status.changed",
  "payload": {
    "executionId": "exec_104",
    "blockId": "do_main",
    "roomId": "do",
    "previousStatus": "running",
    "status": "gate_checking",
    "assignedAgentIds": ["cto-1", "cto-2"],
    "startedAt": "2026-04-04T01:22:00+09:00",
    "updatedAt": "2026-04-04T01:40:31+09:00"
  }
}
```

## 7.5 Handoff 이벤트 페이로드

```json
{
  "type": "brick.handoff.created",
  "payload": {
    "handoffId": "handoff_22",
    "executionId": "exec_104",
    "fromBlockId": "design_main",
    "toBlockId": "do_main",
    "fromRoomId": "design",
    "toRoomId": "do",
    "fromAgentId": "pm",
    "toAgentId": "cto-1",
    "artifactId": "artifact_design_v3",
    "artifactLabel": "Design Spec v3",
    "path": [
      { "x": 608, "y": 320 },
      { "x": 812, "y": 356 }
    ]
  }
}
```

## 7.6 설계 판단

- Colyseus는 REST의 대체재가 아니라 실시간 projection 계층이다.
- Brick API가 소스 오브 트루스이고, Colyseus state는 UI용 캐시다.
- Handoff는 Link 자체가 아니라 실행 중 발생하는 이벤트다.

---

## 8. 맵 수정 사항

## 8.1 기본 방향

현재 `client/public/assets/map/map.tmx`와 `map.json`을 최대한 유지하고, 오피스용 오브젝트 레이어를 추가한다.

- 기존 `Ground`, `Wall`, `Chair`, `Computer`, `Whiteboard`, `Objects*` 레이어는 유지
- 신규 레이어로 브릭 전용 의미를 부여
- 복도 타일을 별도로 강조하지 않는다. 이동은 열린 오피스 바닥 위 직접 동선으로 처리한다.

## 8.2 맵 크기 및 공간 배치

| 항목 | 제안 |
|---|---|
| 맵 크기 | 기존 40x30 유지 우선 |
| 타일 크기 | 32x32 유지 |
| 핵심 방 수 | 5개 |
| 중앙 공간 | 열린 handoff 존 |
| 이동 방식 | 방 문 사이 최단 직선 + obstacle avoidance |

### 배치 개념

```text
┌──────────────────────────────────────────────┐
│ Plan           Design            Do          │
│ [desk][board]  [desk][board]   [desk][desk] │
│                                              │
│              Open Handoff Zone               │
│         (복도 대신 사람들이 오가는 공간)      │
│                                              │
│ Review                         QA            │
│ [board][seal]                  [desk][board] │
└──────────────────────────────────────────────┘
```

## 8.3 신규 Tiled 레이어

| 레이어 | 타입 | 용도 |
|---|---|---|
| `RoomZones` | Object | 각 방 hit area, `roomId`, `blockType` |
| `DeskSpots` | Object | 에이전트 작업 위치, `roomId`, `agentSlot` |
| `HandoffSpots` | Object | 방별 문 앞 전달 위치, `roomId` |
| `StatusBoards` | Object | 상태 게시판 위치 |
| `AgentSpawn` | Object | 각 에이전트 기본 시작 위치 |
| `NoBuildOverlay` | Object | 패널과 충돌하는 시각 가림 영역 |

## 8.4 RoomZones 프로퍼티

```json
{
  "name": "Plan Room",
  "type": "room_zone",
  "properties": {
    "roomId": "plan",
    "blockType": "Plan",
    "label": "Plan",
    "capacity": 1
  }
}
```

## 8.5 오브젝트 수량 조정

| 오브젝트 | 현재 | 제안 |
|---|---|---|
| Computer | 5 | 유지, Do 방 2석 중심으로 재배치 |
| Whiteboard | 3 | 5로 확장, Plan/Design/QA/Review 우선 |
| Chair | 기존 유지 | 방별 좌석 수 재정렬 |
| StatusBoard | 0 | 5 추가 |
| ApprovalSeal/Lock icon anchor | 0 | Review 방 1 추가 |

## 8.6 방별 가구 구성

| 방 | 역할 | 필수 오브젝트 |
|---|---|---|
| Plan | 요구사항 해석 | 책상 1, 화이트보드 1, 상태 보드 1 |
| Design | 설계 문서화 | 책상 1, 화이트보드 1, 상태 보드 1 |
| Do | 구현 | 책상 2, 컴퓨터 2, 상태 보드 1 |
| QA | 검증 | 책상 1, 화이트보드 1, 상태 보드 1 |
| Review | 승인/회고 | 화이트보드 1, 승인 보드 1, 상태 보드 1 |

## 8.7 이동 규칙

1. 에이전트는 각 방 `DeskSpots`에서 working 상태가 된다.
2. handoff 발생 시 출발자는 `HandoffSpots[fromRoomId]`로 이동한다.
3. 수신자는 `HandoffSpots[toRoomId]` 또는 방 입구 앞에서 대기한다.
4. 전달 완료 후 출발자는 자신의 `DeskSpots` 또는 `homeRoomId`로 복귀한다.

---

## 9. 구현 우선순위

### Phase 1. 시각적 MVP

- 방 5개 의미 부여
- 에이전트 4명 배치
- 블록 상태에 따른 방 하이라이트
- handoff 애니메이션 1종
- React 우측 패널 탭 3종

### Phase 2. 편집 가능 빌더

- 블록/링크/팀 드래그 편집
- Inspector 편집 저장
- Colyseus 상태 동기화

### Phase 3. 운영 기능

- 승인 대기 UX
- 실패/재시도 타임라인
- 로그/아티팩트 drill-down

---

## 10. 완료 기준

아래가 되면 이 설계는 구현 착수 가능 상태다.

1. 사용자가 빌더에서 블록과 팀을 조립할 수 있다.
2. 오피스 뷰에서 현재 실행 상태와 handoff를 시각적으로 읽을 수 있다.
3. Colyseus 메시지와 Brick API 이벤트의 경계가 명확하다.
4. `map.tmx` 수정 범위가 기존 SkyOffice 구조를 깨지 않는다.
5. `복도 없음`, `직접 전달`, `Phaser/React 역할 분리`가 모든 화면에서 유지된다.
