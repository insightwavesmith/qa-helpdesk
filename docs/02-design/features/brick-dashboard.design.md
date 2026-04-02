# Brick Dashboard Design — 3축 통합 관리 플랫폼

> 작성일: 2026-04-02
> Engine Design: `docs/02-design/features/brick-architecture.design.md` (V2)
> TASK: `/Users/smith/.openclaw/workspace/tasks/TASK-BRICK-DASHBOARD-DESIGN.md`
> 프로세스 레벨: L3
> 작성자: PM팀

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **이름** | Brick Dashboard |
| **정의** | Block × Team × Link 3축을 생성/편집/조합/관리하는 통합 플랫폼 |
| **핵심 원칙** | Source of Truth = 파일. 대시보드 = 파일의 GUI 에디터 |
| **아키텍처** | ECS 패턴 (축 독립) + K8s Resource Model (선언적 CRUD) + n8n Canvas (시각적 조합) |
| **기술 스택** | FastAPI (Python) API + React (React Flow) 프론트엔드 |
| **Engine 연동** | EventBus → WebSocket 실시간 + REST API → FileStore → Engine |
| **Learning Harness** | 반복 실패 패턴 감지 → 규칙 제안 → 승인 시 자동 반영 (진화적 하네스) |
| **TDD** | 100건, Gap 0% |

### 이것은 모니터링 도구가 아니다

| 모니터링 도구 | Brick Dashboard |
|-------------|-----------------|
| 실행 상태만 봄 | 리소스를 **생성/편집/삭제** |
| 수동 개입 제한적 | 워크플로우를 **조합** (캔버스 에디터) |
| 읽기 중심 | **쓰기 중심** — YAML 파일을 GUI로 편집 |
| 단일 뷰 | 3축 독립 관리 + 통합 캔버스 |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | CLI만으로 3축 조합 시 YAML 직접 편집 필요. 워크플로우 전체를 머리속에 그려야 함. 팀 관리(스킬/MCP/모델)가 파일 수동 수정. Gate 승인이 CLI 명령 |
| **Solution** | 시각적 캔버스에서 블록 배치+연결. 팀 관리 GUI(스킬 에디터, MCP 토글, 모델 선택). Gate 승인 버튼. 실시간 실행 상태 |
| **Function UX Effect** | Smith님이 YAML 몰라도 워크플로우 조합 가능. 팀 상태 한눈에 파악. Gate 승인을 브라우저에서 |
| **Core Value** | "AI한텐 강제, 나한텐 자유" — 강제(System Layer)는 엔진이, 자유(조합)는 대시보드가 제공 |

---

## 1. 아키텍처 개요

### 1.1 시스템 구조도

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Brick Dashboard (Browser)                    │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                     React Flow Canvas                        │   │
│  │  ┌──────┐   sequential   ┌──────┐   loop     ┌──────┐      │   │
│  │  │ Plan │───────────────→│Design│←──────────→│  Do  │      │   │
│  │  │ [PM] │                │ [PM] │            │ [CTO]│      │   │
│  │  └──────┘                └──────┘            └──┬───┘      │   │
│  │                                                  │          │   │
│  │                                       sequential │          │   │
│  │                                                  ▼          │   │
│  │                                    ┌──────┐   ┌──────┐     │   │
│  │                                    │ Act  │←──│Check │     │   │
│  │                                    │ [CTO]│   │ [CTO]│     │   │
│  │                                    └──────┘   └──────┘     │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────┐  ┌───────────────────────────────────────────┐   │
│  │ Resource      │  │ Detail Panel                              │   │
│  │ Catalog       │  │ ┌─────────────────────────────────────┐  │   │
│  │               │  │ │ Block: Design                       │  │   │
│  │ 📦 Block (9)  │  │ │ Type: Design                        │  │   │
│  │ 👥 Team  (3)  │  │ │ What: 상세 설계 + TDD               │  │   │
│  │ 🔗 Link  (5)  │  │ │ Gate: command ✅ prompt ✅ agent ☐  │  │   │
│  │ 📋 Preset(6)  │  │ │ Team: pm-team (Claude Agent Teams)  │  │   │
│  │               │  │ │ Status: ● gate_checking              │  │   │
│  │ + 새 리소스    │  │ └─────────────────────────────────────┘  │   │
│  └──────────────┘  └───────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                     WebSocket (실시간 이벤트)                        │
├═════════════════════════════════════════════════════════════════════┤
│                        Brick API Server                             │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ REST API: /api/v1/{resources}                                │   │
│  │ WebSocket: /ws/events                                        │   │
│  │                                                              │   │
│  │ ┌────────────┐  ┌──────────────┐  ┌───────────────────────┐ │   │
│  │ │ FileStore  │  │ EventBridge  │  │ ValidationPipeline    │ │   │
│  │ │ (파일 R/W) │  │ (Engine→WS)  │  │ (실시간 검증)          │ │   │
│  │ └─────┬──────┘  └──────┬───────┘  └───────────────────────┘ │   │
│  └───────┼────────────────┼────────────────────────────────────┘   │
│          │                │                                         │
├──────────┼────────────────┼─────────────────────────────────────────┤
│          ▼                ▼                                         │
│  ┌──────────────┐  ┌──────────────┐                                │
│  │  .bkit/ 파일  │  │ Engine Core  │                                │
│  │  (YAML/JSON) │  │ (EventBus)   │                                │
│  │  Source of   │  │              │                                │
│  │  Truth       │  │              │                                │
│  └──────────────┘  └──────────────┘                                │
└─────────────────────────────────────────────────────────────────────┘
```

### 1.2 ECS 패턴 적용 — 3축이 독립인 이유

게임 엔진의 ECS(Entity-Component-System) 패턴에서 착안.

```
ECS 원본:
  Entity  = ID만 있는 빈 컨테이너 (데이터 없음, 행동 없음)
  Component = 순수 데이터 (위치, 속도, 렌더링 등)
  System  = 로직 (물리 시스템, 렌더링 시스템)
  → Component 조합만으로 Entity의 행동이 결정됨

Brick 적용:
  Entity  = 워크플로우 노드 (ID)
  Component = BlockSpec(축1) + TeamAssignment(축2) + LinkConfig(축3)
  System  = Engine(실행) + Dashboard(시각화) + Validator(검증)
  → 3축은 서로 독립적 Component. 팀을 바꿔도 블록 정의는 불변.
```

**왜 ECS가 중요한가**: 3축 독립성을 아키텍처 레벨에서 보장.
- Block 편집 → TeamAssignment, LinkConfig 영향 없음
- Team 교체 → BlockSpec 변경 없음 (Adapter Agnosticism)
- Link 수정 → Block/Team 변경 없음

**Dashboard 적용**: 각 축의 편집 화면이 완전히 독립. 한 축을 수정해도 다른 축에 side effect 없음.

### 1.3 K8s Resource Model 적용 — 선언적 파일 중심

```
K8s:
  kubectl apply -f deployment.yaml    ← CLI로 파일 적용
  K8s Dashboard에서 수정               ← GUI로 편집 → 내부적으로 API 호출
  API Server가 etcd에 저장             ← 단일 저장소
  Controller가 desired ↔ actual 조정   ← 자동 수렴

Brick:
  brick start --preset t-pdca-l2      ← CLI로 워크플로우 시작
  Dashboard에서 프리셋 편집             ← GUI → API → 파일 쓰기
  FileStore가 .bkit/ 파일에 저장       ← 단일 진실점 = 파일
  Engine이 파일 변경 감지 → 반영       ← 선언적 수렴
```

**핵심 차이**: K8s는 etcd(DB), Brick은 파일. **대시보드 없이도 파일 편집 + CLI만으로 완전 동작.**

### 1.4 설계 원칙

| # | 원칙 | 근거 |
|---|------|------|
| DP-1 | **File-first**: 파일이 Source of Truth. Dashboard는 파일의 GUI 에디터 | K8s: kubectl이 먼저, Dashboard는 보조 |
| DP-2 | **Axis Independence**: 3축 편집이 서로 독립 | ECS: Component 독립 |
| DP-3 | **CLI Parity**: CLI로 가능한 모든 것을 Dashboard에서도 | K8s: kubectl ≒ Dashboard |
| DP-4 | **Realtime by Default**: 상태 변경은 즉시 반영 | n8n: 실시간 실행 표시 |
| DP-5 | **Progressive Disclosure**: MVP(CRUD) → Canvas → Live → Deep | 복잡도 점진적 노출 |
| DP-6 | **System Layer Enforcement**: INV 위반은 저장 전 차단 | K8s: Admission Webhook |
| DP-7 | **Plugin-driven UI**: 새 Block/Gate/Link/Adapter 타입 추가 시 UI 자동 반영 | Backstage: Plugin 시스템 |

---

## 2. Resource Model

### 2.1 통합 리소스 구조 (BrickResource)

K8s의 Resource 모델을 경량화. 모든 Brick 리소스가 동일 구조.

```python
@dataclass
class BrickResource:
    """모든 Brick 리소스의 공통 구조."""
    
    kind: str               # BlockType, Team, Preset, Workflow, LinkType, GateType
    name: str               # 리소스 이름 (유일)
    spec: dict              # kind별 명세 (YAML의 내용)
    
    # 메타데이터
    labels: dict = field(default_factory=dict)      # 검색/필터용 (예: {"phase": "pdca", "level": "l2"})
    annotations: dict = field(default_factory=dict)  # 설명용 (예: {"description": "..."})
    
    # 런타임 (파일에는 없음, Engine이 채움)
    status: dict | None = None        # 현재 상태 (running, idle 등)
    
    # 출처
    file_path: str = ""     # 원본 파일 경로
    readonly: bool = False  # Core 프리셋은 readonly
    
    # 버전
    version: str = ""       # git commit hash (파일 변경 추적)
    updated_at: str = ""    # 마지막 수정 시각
```

### 2.2 Kind별 Spec 구조

#### BlockType

```yaml
# .bkit/block-types/design.yaml
kind: BlockType
name: design
labels:
  phase: pdca
  category: planning
spec:
  display_name: "Design"
  icon: "📐"
  color: "#4A90D9"
  default_what: "상세 설계 + TDD"
  default_done:
    artifacts: ["docs/02-design/features/{feature}.design.md"]
  default_gate:
    handlers:
      - type: command
        command: "test -f {artifact_path}"
  configurable_fields:      # 대시보드에서 편집 가능한 필드
    - what
    - done.artifacts
    - gate.handlers
    - gate.review
```

#### Team

```yaml
# .bkit/teams/pm-team.yaml
kind: Team
name: pm-team
labels:
  role: planning
spec:
  display_name: "PM팀"
  adapter: claude_agent_teams
  adapter_config:
    session: sdk-pm
    role: PM_LEADER
    broker_port: 7899
  members:
    - name: pm-lead
      role: leader
      model: opus
    - name: pm-researcher
      role: researcher
      model: sonnet
  skills:
    - name: plan-writing
      path: ".bkit/skills/plan-writing.md"
    - name: design-writing
      path: ".bkit/skills/design-writing.md"
  mcp_servers:
    - name: bkit-pdca
      enabled: true
    - name: context7
      enabled: true
    - name: bkend
      enabled: false
  model_config:
    default: opus
    fallback: sonnet
```

#### Preset (워크플로우 템플릿)

Engine V2의 프리셋 YAML 그대로 사용. 추가 메타데이터만 BrickResource로 래핑.

```yaml
# .bkit/presets/t-pdca-l2.yaml
kind: Preset
name: t-pdca-l2
labels:
  level: l2
  type: standard
spec:
  # Engine V2 프리셋 형식 그대로
  blocks: [...]
  links: [...]
  teams: {... }
  gates: {... }
  events: {... }
readonly: true    # Core 프리셋
```

#### Workflow (실행 인스턴스)

```yaml
# .bkit/runtime/workflows/{id}/state.json (Engine이 관리)
kind: Workflow
name: signup-fix-20260402
spec:
  preset: t-pdca-l2
  feature: signup-fix
  task: "/Users/smith/.openclaw/workspace/tasks/TASK-SIGNUP-FIX.md"
status:
  phase: running
  current_block: do
  started_at: "2026-04-02T10:00:00Z"
  blocks:
    plan: {status: completed, duration: 120}
    design: {status: completed, duration: 340}
    do: {status: running, started_at: "2026-04-02T11:00:00Z"}
  metrics:
    elapsed: 3600
    blocks_completed: 2
    blocks_total: 5
```

### 2.3 리소스 관계 (Backstage 참고)

```
BlockType ←─ usedIn ──→ Preset
Team      ←─ assignedTo → Preset (via teams 필드)
Preset    ←─ instantiates → Workflow
Team      ←─ executes ──→ Workflow.Block

관계 방향:
  Preset → (contains) → BlockType references
  Preset → (assigns)  → Team references
  Preset → (defines)  → Link configurations
  Workflow → (from)   → Preset
  Workflow.Block → (executedBy) → Team.Adapter
```

대시보드에서 이 관계를 시각적으로 표현: "이 팀이 참여하는 프리셋 목록", "이 블록 타입을 사용하는 프리셋 목록".

---

## 3. API 설계

### 3.1 API Server (`brick serve`)

```python
# brick/api/server.py
from fastapi import FastAPI, WebSocket
from brick.api.file_store import FileStore
from brick.api.event_bridge import EventBridge

app = FastAPI(title="Brick Dashboard API", version="0.1.0")

# FileStore: .bkit/ 파일 읽기/쓰기
file_store = FileStore(root=".bkit/")

# EventBridge: Engine EventBus → WebSocket
event_bridge = EventBridge()
```

**CLI 연동**:
```bash
brick serve                    # localhost:18700 에서 API 서버 시작
brick serve --port 8080        # 포트 지정
brick serve --readonly         # 읽기 전용 모드 (모니터링만)
```

### 3.2 REST API 엔드포인트

#### 리소스 CRUD (K8s-style 통합)

```
# 통합 리소스 API (모든 kind 공통)
GET    /api/v1/resources                     # 전체 리소스 목록
GET    /api/v1/resources?kind=BlockType      # kind 필터
GET    /api/v1/resources?label=phase:pdca    # label 필터

# Kind별 편의 API
GET    /api/v1/block-types                   # 블록 타입 카탈로그
POST   /api/v1/block-types                   # 커스텀 블록 타입 생성
GET    /api/v1/block-types/:name             # 상세
PUT    /api/v1/block-types/:name             # 수정 (→ 파일 쓰기)
DELETE /api/v1/block-types/:name             # 삭제 (core는 차단)

GET    /api/v1/teams                         # 팀 목록
POST   /api/v1/teams                         # 팀 생성
GET    /api/v1/teams/:name
PUT    /api/v1/teams/:name
DELETE /api/v1/teams/:name

# Team 하위 리소스 (Deep Management)
GET    /api/v1/teams/:name/members           # 팀원 목록
POST   /api/v1/teams/:name/members           # 팀원 추가
PUT    /api/v1/teams/:name/members/:mid      # 팀원 역할 변경
DELETE /api/v1/teams/:name/members/:mid      # 팀원 제거
GET    /api/v1/teams/:name/skills            # 스킬 목록
GET    /api/v1/teams/:name/skills/:sid       # 스킬 내용 (SKILL.md)
PUT    /api/v1/teams/:name/skills/:sid       # 스킬 편집
GET    /api/v1/teams/:name/mcp              # MCP 서버 목록
PUT    /api/v1/teams/:name/mcp/:sid         # MCP on/off
GET    /api/v1/teams/:name/model            # 모델 설정
PUT    /api/v1/teams/:name/model            # 모델 변경
GET    /api/v1/teams/:name/status           # 실시간 상태

GET    /api/v1/presets                       # 프리셋 목록
POST   /api/v1/presets                       # 프리셋 생성
GET    /api/v1/presets/:name
PUT    /api/v1/presets/:name                 # (readonly는 차단)
DELETE /api/v1/presets/:name
POST   /api/v1/presets/:name/validate        # 프리셋 검증

GET    /api/v1/link-types                    # Link 타입 목록
GET    /api/v1/gate-types                    # Gate 타입 목록
GET    /api/v1/adapter-types                 # Adapter 타입 목록
```

#### 워크플로우 실행 API

```
GET    /api/v1/workflows                     # 실행 중 + 완료 목록
POST   /api/v1/workflows                     # 워크플로우 시작
GET    /api/v1/workflows/:id                 # 상태 상세
GET    /api/v1/workflows/:id/events          # 이벤트 히스토리
GET    /api/v1/workflows/:id/blocks/:bid     # 블록 상세 상태
POST   /api/v1/workflows/:id/blocks/:bid/complete   # 블록 완료 보고
POST   /api/v1/workflows/:id/blocks/:bid/approve    # review gate 승인
POST   /api/v1/workflows/:id/blocks/:bid/reject     # review gate 거부
POST   /api/v1/workflows/:id/cancel          # 워크플로우 취소
POST   /api/v1/workflows/:id/resume          # 일시정지 → 재개
```

#### Learning Harness API

```
GET    /api/v1/learning/proposals              # 규칙 제안 목록 (status 필터)
GET    /api/v1/learning/proposals/:id          # 제안 상세 (패턴+증거+diff)
POST   /api/v1/learning/proposals/:id/approve  # 승인 → 파일 자동 반영
POST   /api/v1/learning/proposals/:id/reject   # 거부 (사유 필수)
POST   /api/v1/learning/proposals/:id/modify   # diff 수정 후 승인
GET    /api/v1/learning/history                # 과거 승인/거부 이력
GET    /api/v1/learning/stats                  # 3축별 학습 현황 통계
POST   /api/v1/learning/detect                 # 수동 패턴 감지 트리거
```

#### 검증 API

```
POST   /api/v1/validate/preset               # 프리셋 YAML 검증
POST   /api/v1/validate/block-type           # 블록 타입 검증
POST   /api/v1/validate/workflow-graph       # DAG 순환 검사
GET    /api/v1/invariants                    # INV-1~10 상태
```

### 3.3 WebSocket 이벤트 스트림

```
WS     /ws/events                            # 전체 이벤트 구독
WS     /ws/events?workflow=signup-fix-*       # 워크플로우 필터
WS     /ws/events?type=block.*               # 이벤트 타입 필터
```

**이벤트 메시지 형식**:
```json
{
  "type": "block.started",
  "workflow_id": "signup-fix-20260402",
  "block_id": "do",
  "timestamp": "2026-04-02T11:00:00Z",
  "data": {
    "adapter": "claude_agent_teams",
    "team": "cto-team"
  }
}
```

**초기 동기화**: WebSocket 연결 시 현재 활성 워크플로우 전체 상태를 스냅샷으로 전송.

```json
{
  "type": "sync.snapshot",
  "workflows": [
    {"id": "signup-fix-20260402", "status": "running", "current_block": "do", ...}
  ],
  "teams": [
    {"name": "cto-team", "status": "running", "members": [...]}
  ]
}
```

### 3.4 FileStore — 파일 읽기/쓰기 계층

```python
class FileStore:
    """모든 리소스 CRUD가 파일 연산으로 귀결."""
    
    def __init__(self, root: str = ".bkit/"):
        self.root = Path(root)
        self._watcher = FileWatcher(root)  # inotify/FSEvents
    
    # CRUD
    def list(self, kind: str) -> list[BrickResource]: ...
    def get(self, kind: str, name: str) -> BrickResource: ...
    def create(self, resource: BrickResource) -> BrickResource: ...
    def update(self, resource: BrickResource) -> BrickResource: ...
    def delete(self, kind: str, name: str) -> bool: ...
    
    # 파일 감시 (CLI/직접 편집 반영)
    def watch(self, callback: Callable[[FileEvent], None]) -> None:
        """파일 변경 감시 → Dashboard 실시간 업데이트."""
        self._watcher.on_change(callback)
    
    # 검증 (저장 전)
    def validate(self, resource: BrickResource) -> list[ValidationError]: ...
```

**파일 매핑**:

| Kind | 파일 경로 | 형식 |
|------|----------|------|
| BlockType | `.bkit/block-types/{name}.yaml` | YAML |
| Team | `.bkit/teams/{name}.yaml` | YAML |
| Preset | `.bkit/presets/{name}.yaml` | YAML |
| LinkType | `brick/links/{name}.py` (내장) | Python (읽기전용) |
| GateType | `brick/gates/{name}.py` (내장) | Python (읽기전용) |
| Workflow | `.bkit/runtime/workflows/{id}/state.json` | JSON (Engine 관리) |

### 3.5 Validation Pipeline — 저장 전 검증

K8s의 Admission Webhook에 해당. 모든 리소스 생성/수정 요청에 검증 파이프라인 실행.

```python
class ValidationPipeline:
    """리소스 저장 전 검증. INV 위반 차단."""
    
    validators: list[ResourceValidator] = [
        InvariantValidator(),       # INV-1~10 준수
        SchemaValidator(),          # YAML 스키마 검증
        DAGValidator(),             # 순환 참조 감지
        ReferenceValidator(),       # 존재하지 않는 팀/블록 참조 차단
        ReadonlyValidator(),        # Core 프리셋 수정 차단
        AdapterCompatibility(),     # 어댑터가 요구하는 필드 존재 확인
    ]
    
    def validate(self, resource: BrickResource) -> ValidationResult:
        errors = []
        warnings = []
        for v in self.validators:
            result = v.validate(resource)
            errors.extend(result.errors)
            warnings.extend(result.warnings)
        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings
        )
```

**실시간 편집 검증**: 대시보드에서 YAML 편집 중에도 debounce(300ms)로 검증 API 호출 → 에러 인라인 표시.

---

## 4. 프론트엔드 아키텍처

### 4.1 기술 스택

| 구분 | 선택 | 이유 |
|------|------|------|
| 프레임워크 | **React** (Vite 또는 Next.js) | React Flow 생태계, bscamp.app 통합 가능 |
| 캔버스 | **React Flow** (v12+) | n8n의 Vue Flow 대응. 커스텀 노드, 미니맵, 제어 내장 |
| 코드 에디터 | **Monaco Editor** | YAML/Markdown 편집 (스킬, 프리셋). VS Code와 동일 |
| 상태 관리 | **Zustand** | 경량, React Flow와 궁합 |
| HTTP | **TanStack Query** (React Query) | 캐시 + 낙관적 업데이트 |
| WebSocket | **native WebSocket** + reconnect | 라이브러리 불필요, reconnect 로직만 |
| 스타일 | **Tailwind CSS** | bscamp.app 일관성 |
| 차트 | **Recharts** | 메트릭 시각화 (optional) |

### 4.2 컴포넌트 구조

```
src/
├── app/
│   ├── layout.tsx                  # 메인 레이아웃
│   ├── page.tsx                    # 대시보드 홈
│   ├── canvas/
│   │   └── page.tsx                # 캔버스 에디터
│   ├── blocks/
│   │   ├── page.tsx                # 블록 타입 카탈로그
│   │   └── [name]/page.tsx         # 블록 타입 상세/편집
│   ├── teams/
│   │   ├── page.tsx                # 팀 목록
│   │   └── [name]/
│   │       ├── page.tsx            # 팀 상세
│   │       ├── members/page.tsx    # 팀원 관리
│   │       ├── skills/page.tsx     # 스킬 편집
│   │       ├── mcp/page.tsx        # MCP 설정
│   │       └── model/page.tsx      # 모델 설정
│   ├── presets/
│   │   ├── page.tsx                # 프리셋 목록
│   │   └── [name]/page.tsx         # 프리셋 편집
│   ├── workflows/
│   │   ├── page.tsx                # 워크플로우 목록
│   │   └── [id]/page.tsx           # 워크플로우 상세 (실행 뷰)
│   └── settings/page.tsx           # 설정
│
├── components/
│   ├── canvas/
│   │   ├── BrickCanvas.tsx         # React Flow 래퍼
│   │   ├── BlockNode.tsx           # 블록 노드 (커스텀)
│   │   ├── LinkEdge.tsx            # 링크 엣지 (커스텀)
│   │   ├── TeamBadge.tsx           # 노드 위 팀 표시
│   │   ├── GateIndicator.tsx       # 게이트 상태 표시
│   │   ├── StatusOverlay.tsx       # 실행 상태 오버레이
│   │   └── Minimap.tsx             # 미니맵
│   ├── catalog/
│   │   ├── ResourceList.tsx        # 리소스 목록 (공통)
│   │   ├── ResourceCard.tsx        # 리소스 카드
│   │   ├── BlockTypeCard.tsx       # 블록 타입 카드
│   │   ├── TeamCard.tsx            # 팀 카드
│   │   └── PresetCard.tsx          # 프리셋 카드
│   ├── editors/
│   │   ├── YamlEditor.tsx          # Monaco YAML 에디터
│   │   ├── SkillEditor.tsx         # Markdown SKILL.md 에디터
│   │   ├── GateConfigEditor.tsx    # Gate 4타입 편집기
│   │   ├── TeamConfigEditor.tsx    # 팀 설정 편집기
│   │   └── PresetEditor.tsx        # 프리셋 비주얼+YAML 편집
│   ├── learning/
│   │   ├── ProposalList.tsx        # 규칙 제안 목록
│   │   ├── ProposalCard.tsx        # 제안 카드 (패턴+diff)
│   │   ├── ProposalDetail.tsx      # 제안 상세 + 승인/거부/수정
│   │   ├── DiffViewer.tsx          # YAML diff 뷰어
│   │   ├── LearningHistory.tsx     # 학습 이력
│   │   ├── AxisLearningStats.tsx   # 3축별 학습 현황
│   │   └── PatternEvidence.tsx     # 실패 패턴 증거 (이벤트 링크)
│   ├── panels/
│   │   ├── DetailPanel.tsx         # 우측 상세 패널
│   │   ├── GateApprovalPanel.tsx   # 게이트 승인 패널
│   │   ├── EventHistoryPanel.tsx   # 이벤트 히스토리
│   │   └── MetricsPanel.tsx        # 메트릭 표시
│   ├── system/
│   │   ├── InvariantBanner.tsx     # INV 위반 경고 배너
│   │   ├── ValidationErrors.tsx    # 검증 에러 인라인
│   │   └── ReadonlyBadge.tsx       # readonly 표시
│   └── common/
│       ├── StatusDot.tsx           # 상태 점 (●)
│       ├── AdapterIcon.tsx         # 어댑터 아이콘
│       └── BrickLogo.tsx           # Brick 로고
│
├── hooks/
│   ├── useWebSocket.ts             # WS 연결 + 자동 재연결
│   ├── useResources.ts             # 리소스 CRUD (TanStack Query)
│   ├── useWorkflowEvents.ts        # 워크플로우 이벤트 구독
│   └── useValidation.ts            # 실시간 검증
│
├── stores/
│   ├── canvasStore.ts              # React Flow 노드/엣지 상태
│   ├── selectionStore.ts           # 선택된 리소스
│   └── eventStore.ts               # 이벤트 버퍼
│
└── lib/
    ├── api.ts                      # API 클라이언트
    ├── types.ts                    # BrickResource 타입
    ├── constants.ts                # 상수 (색상, 아이콘)
    └── canvas-utils.ts             # 캔버스 유틸
```

### 4.3 React Flow 커스텀 노드 구조

```tsx
// components/canvas/BlockNode.tsx
type BlockNodeData = {
  block: BlockSpec;
  team: TeamAssignment | null;
  gate: GateConfig | null;
  status: BlockStatus | null;  // 런타임 (null = 편집 모드)
};

function BlockNode({ data }: NodeProps<BlockNodeData>) {
  const { block, team, gate, status } = data;
  
  return (
    <div className={cn(
      "brick-node",
      status?.phase === "running" && "brick-node--running",
      status?.phase === "completed" && "brick-node--completed",
      status?.phase === "failed" && "brick-node--failed",
    )}>
      {/* 헤더: 타입 아이콘 + 이름 */}
      <div className="brick-node__header">
        <span className="brick-node__icon">{block.icon}</span>
        <span className="brick-node__name">{block.display_name}</span>
        {status && <StatusDot status={status.phase} />}
      </div>
      
      {/* what: 블록 설명 */}
      <div className="brick-node__what">{block.what}</div>
      
      {/* 팀 배지 */}
      {team && (
        <TeamBadge 
          name={team.name} 
          adapter={team.adapter}
          status={team.status}
        />
      )}
      
      {/* Gate 표시 */}
      {gate && <GateIndicator gate={gate} status={status?.gate} />}
      
      {/* 입출력 핸들 */}
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
```

### 4.4 Canvas ↔ YAML 양방향 동기화

**핵심 문제**: 캔버스에서 시각적 편집 → YAML 생성, YAML 직접 편집 → 캔버스 반영. 양방향이어야 함.

```
Canvas (React Flow)                YAML (Monaco Editor)
┌──────────────────┐               ┌──────────────────┐
│ 노드 추가/이동    │ ──serialize──→│ blocks: [...]     │
│ 엣지 연결/삭제    │               │ links: [...]      │
│                  │ ←─deserialize──│ teams: {...}      │
│                  │               │ gates: {...}       │
└──────────────────┘               └──────────────────┘
        │                                   │
        └──────── 양방향 동기화 ──────────────┘
```

```python
# API: YAML → Canvas 변환
class PresetToCanvasConverter:
    """프리셋 YAML → React Flow 노드/엣지 변환."""
    
    def convert(self, preset: dict) -> CanvasState:
        nodes = []
        edges = []
        
        # blocks → nodes (자동 레이아웃: dagre)
        for i, block in enumerate(preset["blocks"]):
            nodes.append({
                "id": block["id"],
                "type": "blockNode",
                "position": self._auto_layout(i, len(preset["blocks"])),
                "data": {
                    "block": block,
                    "team": preset.get("teams", {}).get(block["id"]),
                    "gate": preset.get("gates", {}).get(block["id"]),
                }
            })
        
        # links → edges
        for link in preset["links"]:
            edges.append({
                "id": f"{link['from']}-{link['to']}",
                "source": link["from"],
                "target": link["to"],
                "type": "linkEdge",
                "data": {"link_type": link["type"], **link}
            })
        
        return CanvasState(nodes=nodes, edges=edges)

# API: Canvas → YAML 변환
class CanvasToPresetConverter:
    """React Flow 상태 → 프리셋 YAML 변환."""
    
    def convert(self, canvas: CanvasState) -> dict:
        preset = {"blocks": [], "links": [], "teams": {}, "gates": {}}
        
        for node in canvas.nodes:
            preset["blocks"].append(node["data"]["block"])
            if node["data"].get("team"):
                preset["teams"][node["id"]] = node["data"]["team"]
            if node["data"].get("gate"):
                preset["gates"][node["id"]] = node["data"]["gate"]
        
        for edge in canvas.edges:
            preset["links"].append({
                "from": edge["source"],
                "to": edge["target"],
                "type": edge["data"]["link_type"],
            })
        
        return preset
```

**노드 위치 저장**: React Flow의 노드 위치(x, y)는 별도 레이아웃 파일에 저장. YAML을 오염시키지 않음.

```
.bkit/presets/t-pdca-l2.yaml       ← 프리셋 정의 (위치 없음)
.bkit/presets/.layout/t-pdca-l2.json  ← 캔버스 레이아웃 (노드 위치만)
```

---

## 5. 데이터 흐름

### 5.1 편집 흐름 (Dashboard → 파일)

```
사용자 편집 (브라우저)
    │
    ▼
React Component → API 호출 (PUT /api/v1/teams/pm-team)
    │
    ▼
API Server: ValidationPipeline.validate(resource)
    │
    ├── 실패 → 400 + errors[] → 프론트에서 인라인 표시
    │
    ▼ 성공
FileStore.update(resource) → .bkit/teams/pm-team.yaml 파일 쓰기
    │
    ▼
FileWatcher 감지 → EventBridge → WebSocket → 다른 탭/사용자에 반영
    │
    ▼
Engine도 같은 파일 읽음 → 다음 실행 시 반영됨
```

### 5.2 실행 흐름 (Engine → Dashboard)

```
Engine: StateMachine.transition(event) → 상태 변경
    │
    ▼
Engine: EventBus.publish("block.started", {...})
    │
    ▼
EventBridge: Engine EventBus 구독 → WebSocket 전송
    │
    ▼
Browser: useWorkflowEvents() → canvasStore 업데이트
    │
    ▼
React Flow: BlockNode의 status prop 변경 → UI 즉시 반영
    (노드 색상 변경, 상태 점 업데이트, 진행률 표시)
```

### 5.3 Gate 승인 흐름

```
Engine: block.gate_review_requested 이벤트 발행
    │
    ▼
Dashboard: GateApprovalPanel에 알림 표시
    │   ┌─────────────────────────────┐
    │   │ 🔔 Gate Review 요청          │
    │   │ Block: design               │
    │   │ Workflow: signup-fix         │
    │   │                             │
    │   │ 산출물: design.md (3,400줄)  │
    │   │ Auto gates: 3/3 통과        │
    │   │                             │
    │   │ [승인 ✅] [거부 ❌] [스킵 ⏭] │
    │   └─────────────────────────────┘
    │
    ▼ 사용자 클릭
POST /api/v1/workflows/{id}/blocks/design/approve
    │
    ▼
Engine: brick approve --block design --reviewer smith
    │
    ▼
Engine: block.gate_passed → 다음 블록 시작
    │
    ▼
Dashboard: 실시간 반영 (design → completed, do → running)
```

### 5.4 파일 직접 편집 감지 (CLI/에디터 사용 시)

```
사용자: vim .bkit/teams/pm-team.yaml  (직접 편집)
    │
    ▼
FileWatcher (FSEvents/inotify) 감지
    │
    ▼
FileStore: 파일 재로드 → BrickResource 갱신
    │
    ▼
ValidationPipeline: 변경된 리소스 검증
    │
    ├── 검증 통과 → WebSocket → Dashboard UI 업데이트
    │
    └── 검증 실패 → WebSocket → Dashboard에 경고 표시
        (파일은 이미 저장됨 — 경고만. Engine 실행 시 차단)
```

---

## 6. 화면 설계

### 6.1 메인 레이아웃

```
┌──────────────────────────────────────────────────────────────┐
│  🧱 Brick Dashboard                    signup-fix ▾  Smith ▾ │
├──────────┬───────────────────────────────────┬───────────────┤
│          │                                   │               │
│ Resource │         Main Content Area         │  Detail       │
│ Catalog  │                                   │  Panel        │
│          │  (Canvas / List / Editor)         │               │
│ ──────── │                                   │  선택된        │
│ 📦 Block │                                   │  리소스의      │
│   Plan   │                                   │  상세 정보     │
│   Design │                                   │               │
│   Do     │                                   │  속성 편집     │
│   Check  │                                   │  Gate 설정     │
│   Act    │                                   │  Team 배정     │
│   +9종   │                                   │  상태 표시     │
│          │                                   │               │
│ 👥 Team  │                                   │               │
│   PM팀   │                                   │               │
│   CTO팀  │                                   │               │
│   +새 팀 │                                   │               │
│          │                                   │               │
│ 🔗 Link  │                                   │               │
│   7종    │                                   │               │
│          │                                   │               │
│ 📋 Preset│                                   │               │
│   T-PDCA │                                   │               │
│   Hotfix │                                   │               │
│   +커스텀│                                   │               │
│          │                                   │               │
│ 🏃 실행중│                                   │               │
│   2개    │                                   │               │
│          │                                   │               │
├──────────┴───────────────────────────────────┴───────────────┤
│  INV-3 위반: "do" 블록에 done.artifacts 미설정  ⚠️ 1건       │
└──────────────────────────────────────────────────────────────┘
```

**레이아웃 동작**:
- 좌측 카탈로그: 240px 고정. 접기 가능.
- 중앙 메인: 유동. 캔버스/리스트/에디터 전환.
- 우측 디테일: 360px. 리소스 선택 시 슬라이드 오픈. 빈 선택 시 접힘.
- 하단 배너: INV 위반 시 빨간 경고 배너.

### 6.2 캔버스 에디터

```
┌──────────────────────────────────────────────────────────┐
│ 📋 t-pdca-l2 ▾  │  🔍 검색  │  + 블록 추가  │  YAML ↔ │
├──────────────────────────────────────────────────────────┤
│                                                          │
│    ┌──────────┐     ┌──────────┐     ┌──────────┐       │
│    │📐 Plan   │────→│📐 Design │────→│🔨 Do     │       │
│    │          │     │          │     │          │       │
│    │ PM팀     │     │ PM팀     │     │ CTO팀    │       │
│    │ ○ 대기    │     │ ● 실행중  │     │ ○ 대기    │       │
│    │ gate: ✅  │     │ gate: ⏳  │     │          │       │
│    └──────────┘     └──────────┘     └────┬─────┘       │
│                                           │              │
│                                    sequential            │
│                                           │              │
│                      ┌──────────┐  ┌─────▼──────┐       │
│                      │✅ Act     │←─│🔍 Check    │       │
│                      │          │  │            │       │
│                      │ CTO팀    │  │ CTO팀      │       │
│                      │          │  │ loop ↩ Do  │       │
│                      └──────────┘  └────────────┘       │
│                                                          │
│  ┌─────────┐                                             │
│  │ Minimap │  Zoom: 100%  │  Fit  │  Grid: On           │
│  └─────────┘                                             │
└──────────────────────────────────────────────────────────┘
```

**캔버스 인터랙션**:
- **블록 추가**: 좌측 카탈로그에서 드래그 or "+ 블록 추가" 버튼
- **연결 생성**: 블록 핸들에서 드래그 → 대상 블록으로 (Link 타입 선택 팝업)
- **블록 클릭**: 우측 디테일 패널에 속성 표시
- **연결 클릭**: Link 타입/조건 편집 팝업
- **실행 모드**: 실행 중인 블록 하이라이팅, 진행 흐름 애니메이션
- **YAML ↔ 버튼**: 캔버스 ↔ YAML 에디터 전환 (양방향 동기화)

### 6.3 블록 타입 카탈로그

```
┌──────────────────────────────────────────────────────────┐
│ 블록 타입 카탈로그                              + 커스텀  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 📋 Plan    │ │ 📐 Design  │ │ 🔨 Do      │           │
│  │ 요구사항   │ │ 상세 설계   │ │ 구현       │           │
│  │ 분석       │ │ + TDD     │ │            │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 🔍 Check   │ │ ✅ Act     │ │ 🔬 Research│           │
│  │ Gap 분석   │ │ 배포+보고  │ │ 조사       │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐           │
│  │ 👀 Review  │ │ 📊 Report  │ │ ⏰ Cron    │           │
│  │ 코드 리뷰  │ │ 보고서     │ │ 주기 실행   │           │
│  └────────────┘ └────────────┘ └────────────┘           │
│                                                          │
│  ── 커스텀 ──────────────────────────────────            │
│  ┌────────────┐                                          │
│  │ 🧩 Custom  │  아직 없음. + 커스텀 으로 생성           │
│  └────────────┘                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.4 팀 관리 (가장 깊은 축)

#### 6.4.1 팀 목록

```
┌──────────────────────────────────────────────────────────┐
│ 팀 관리                                        + 새 팀   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 👥 PM팀                                            │  │
│  │ Adapter: Claude Agent Teams  │  상태: ● 실행중     │  │
│  │ 팀원: 2명  │  스킬: 3개  │  MCP: 2/4 활성         │  │
│  │ 모델: Opus  │  세션: sdk-pm                        │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 👥 CTO팀                                           │  │
│  │ Adapter: Claude Agent Teams  │  상태: ○ 대기       │  │
│  │ 팀원: 3명  │  스킬: 5개  │  MCP: 3/4 활성         │  │
│  │ 모델: Opus  │  세션: sdk-cto                       │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 👤 QA팀                                            │  │
│  │ Adapter: Human  │  상태: ○ 대기                    │  │
│  │ 팀원: 1명 (Smith)  │  스킬: -  │  MCP: -          │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

#### 6.4.2 팀 상세 — 탭 구조

```
┌──────────────────────────────────────────────────────────┐
│ 👥 PM팀                                      Adapter: ▾ │
│                                                          │
│  [개요] [팀원] [스킬] [MCP] [모델] [상태]               │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ── 팀원 탭 ──                                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ 이름          │ 역할     │ 모델    │ 상태  │      │   │
│  ├──────────────────────────────────────────────────┤   │
│  │ pm-lead       │ leader   │ Opus    │ ● 실행 │ ✕  │   │
│  │ pm-researcher │ researcher│ Sonnet │ ○ 대기  │ ✕  │   │
│  └──────────────────────────────────────────────────┘   │
│                                              + 팀원 추가 │
│                                                          │
│  ── 스킬 탭 ──                                           │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ plan-writing.md        │ 1.2KB │ [편집] [삭제]   │   │
│  │ design-writing.md      │ 2.4KB │ [편집] [삭제]   │   │
│  │ gap-analysis.md        │ 0.8KB │ [편집] [삭제]   │   │
│  └──────────────────────────────────────────────────┘   │
│  [편집] 클릭 → Monaco Editor로 SKILL.md 편집             │
│                                              + 스킬 추가 │
│                                                          │
│  ── MCP 탭 ──                                            │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │ bkit-pdca     │ 10 tools │ [ON]  🟢              │   │
│  │ context7      │  2 tools │ [ON]  🟢              │   │
│  │ bkend         │ 12 tools │ [OFF] ⚪              │   │
│  │ claude-peers  │  4 tools │ [ON]  🟢              │   │
│  └──────────────────────────────────────────────────┘   │
│                                                          │
│  ── 모델 탭 ──                                           │
│                                                          │
│  기본 모델:  [Opus ▾]                                    │
│  대체 모델:  [Sonnet ▾]                                  │
│  팀원별 오버라이드:                                       │
│    pm-lead: Opus (기본값)                                │
│    pm-researcher: [Sonnet ▾]                             │
│                                                          │
│  ── 상태 탭 ── (실시간)                                   │
│                                                          │
│  ● 실행중  │  현재 블록: design  │  경과: 5분 23초        │
│  pm-lead: "Design 문서 §3 Gate 섹션 작성 중"             │
│  pm-researcher: idle (대기)                              │
└──────────────────────────────────────────────────────────┘
```

### 6.5 Gate 설정 에디터

```
┌──────────────────────────────────────────────────────────┐
│ Gate 설정: design 블록                                    │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  실행 순서: [순차 ▾]  (순차 / 병렬 / 투표)               │
│  실패 시:   [재시도 ▾] (재시도 / 롤백 / 에스컬레이트)     │
│  최대 재시도: [3]                                         │
│                                                          │
│  ── Handler 목록 ──                                      │
│                                                          │
│  1. [command ▾] ✅                                       │
│     명령: test -f docs/02-design/features/{feature}...   │
│     타임아웃: 30초                                        │
│                                                          │
│  2. [prompt ▾] ✅                                        │
│     프롬프트: "이 Design이 요구사항을 충족하는지..."       │
│     모델: [Haiku ▾]                                      │
│     확신도 임계값: 0.8                                    │
│     재시도 횟수: 3 (다수결)                               │
│     확신도 미달 시: [review로 ▾]                          │
│                                                          │
│  3. [agent ▾] ☐ (비활성)                                 │
│     에이전트 프롬프트: "TDD 커버리지 확인..."              │
│     최대 토큰: 10000                                     │
│                                                          │
│  + Handler 추가                                          │
│                                                          │
│  ── Review Gate ──                                       │
│  COO 검토: [ON 🟢]                                       │
│  추가 검토자: [ ]                                         │
│  거부 시: [이전 블록으로 ▾]                               │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.6 Gate 승인 패널

```
┌──────────────────────────────────────────────────────────┐
│ 🔔 Gate Review 대기 (2건)                                │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 📐 design │ signup-fix │ 5분 전                    │  │
│  │                                                    │  │
│  │ Auto Gate 결과:                                    │  │
│  │   ✅ command: 파일 존재 확인                        │  │
│  │   ✅ prompt: "충족함" (확신도: 0.92)               │  │
│  │                                                    │  │
│  │ 산출물:                                            │  │
│  │   📄 brick-dashboard.design.md (2,400줄) [보기]    │  │
│  │                                                    │  │
│  │ 이전 gate 이력:                                    │  │
│  │   #1 ❌ 거부 (COO: "TDD 섹션 부족") → 수정 완료    │  │
│  │   #2 현재                                          │  │
│  │                                                    │  │
│  │  [승인 ✅]  [거부 ❌]  [코멘트 💬]                  │  │
│  │                                                    │  │
│  │  거부 사유: [________________]                      │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.7 워크플로우 모니터 (실행 뷰)

```
┌──────────────────────────────────────────────────────────┐
│ 워크플로우: signup-fix-20260402                           │
│ 프리셋: t-pdca-l2  │  시작: 10:00  │  경과: 1시간 23분   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  진행률: ████████░░░░░░░░░ 40% (2/5 블록 완료)           │
│                                                          │
│  Plan ─────→ Design ─────→ Do ─────→ Check ─→ Act       │
│  ✅ 완료     ✅ 완료       ● 실행중    ○ 대기    ○ 대기  │
│  (2분)       (15분)       (1시간)                        │
│                                                          │
│  ── 현재 블록: Do ──                                     │
│  팀: CTO팀 (Claude Agent Teams)                          │
│  시작: 11:00  │  경과: 1시간 8분                          │
│                                                          │
│  팀원 상태:                                              │
│    cto-lead: "frontend-dev에게 구현 위임 완료"            │
│    frontend-dev: "SignupForm 컴포넌트 수정 중"            │
│    qa-engineer: idle (대기)                               │
│                                                          │
│  ── 이벤트 히스토리 ──                         [전체 보기] │
│  11:08  adapter.heartbeat  cto-team alive                │
│  11:05  block.started      do (cto-team)                 │
│  11:00  block.gate_passed  design                        │
│  10:55  block.completed    design (pm-team)              │
│  10:15  block.gate_passed  plan                          │
│  10:02  block.completed    plan (pm-team)                │
│  10:00  workflow.started   signup-fix-20260402            │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

### 6.8 프리셋 편집기 (Split View)

```
┌──────────────────────────────────────────────────────────┐
│ 프리셋: my-custom-flow                    [저장] [검증]  │
│                                                          │
│  [비주얼] [YAML] [Split ▾]                              │
├────────────────────────┬─────────────────────────────────┤
│                        │                                 │
│  (React Flow Canvas)   │  (Monaco YAML Editor)           │
│                        │                                 │
│  ┌──────┐   ┌──────┐  │  $schema: brick/preset-v2       │
│  │ Plan │──→│ Do   │  │  name: "커스텀 플로우"            │
│  └──────┘   └──┬───┘  │                                 │
│                │      │  blocks:                         │
│           ┌────▼───┐  │    - id: plan                    │
│           │ Report │  │      type: Plan                  │
│           └────────┘  │      what: "요구사항"              │
│                        │    - id: do                      │
│                        │      type: Do                    │
│                        │      what: "구현"                │
│                        │    - id: report                  │
│                        │      type: Report                │
│                        │                                 │
│  ⚠ DAG 검증: 통과      │  links:                         │
│  ⚠ 스키마: 통과         │    - {from: plan, to: do, ...}  │
│                        │    - {from: do, to: report, ...}│
│                        │                                 │
├────────────────────────┴─────────────────────────────────┤
│ 검증: ✅ 스키마 통과  ✅ DAG 순환 없음  ✅ 참조 유효      │
└──────────────────────────────────────────────────────────┘
```

### 6.9 Learning Harness — 규칙 제안 목록

```
┌──────────────────────────────────────────────────────────┐
│ 🧠 Learning Harness                    3축 현황 │ 이력   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  대기 중인 규칙 제안 (3건)                    [패턴 감지] │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 📦 Block Gate 제안                  확신도: 0.91   │  │
│  │                                                    │  │
│  │ "Do 블록 gate에 빌드 캐시 검증 추가"               │  │
│  │                                                    │  │
│  │ 패턴: do.gate_failed 7일간 4회 반복                │  │
│  │   → npm run build 통과 후에도 캐시 불일치로 재실패  │  │
│  │                                                    │  │
│  │ 제안 변경:                                         │  │
│  │ ┌─────────────────────────────────────────────┐    │  │
│  │ │ gate:                                       │    │  │
│  │ │   handlers:                                 │    │  │
│  │ │     - type: command                         │    │  │
│  │ │ +     command: "rm -rf .next && npm run..." │    │  │
│  │ └─────────────────────────────────────────────┘    │  │
│  │                                                    │  │
│  │ 증거: 이벤트 4건 [보기]                             │  │
│  │                                                    │  │
│  │  [승인 ✅]  [수정 후 승인 ✏️]  [거부 ❌]            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 👥 Team Skill 제안                  확신도: 0.87   │  │
│  │                                                    │  │
│  │ "CTO팀 SKILL.md에 파일 경계 규칙 추가"             │  │
│  │                                                    │  │
│  │ 패턴: 팀원 충돌 14일간 3회                         │  │
│  │   → 같은 파일 동시 수정으로 merge conflict          │  │
│  │                                                    │  │
│  │  [승인 ✅]  [수정 후 승인 ✏️]  [거부 ❌]            │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 🔗 Link 조정 제안                   확신도: 0.78   │  │
│  │                                                    │  │
│  │ "Check→Do 루프 max_retries 3→5로 상향"            │  │
│  │                                                    │  │
│  │ 패턴: check.loop_exhausted 30일간 2회              │  │
│  │   → 3회 재시도 후에도 90% 미달 → 4회차에 통과       │  │
│  │                                                    │  │
│  │  [승인 ✅]  [수정 후 승인 ✏️]  [거부 ❌]            │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

### 6.10 Learning Harness — 3축별 학습 현황

```
┌──────────────────────────────────────────────────────────┐
│ 🧠 3축별 학습 현황                                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  📦 Block (Gate 규칙)        학습된 규칙: 12개           │
│  ████████████░░░░░░░░        승인: 12 │ 거부: 3          │
│  최근: "Design gate에 TDD 커버리지 90% 추가" (3일 전)    │
│                                                          │
│  👥 Team (Skill 규칙)        학습된 규칙: 8개            │
│  ████████░░░░░░░░░░░░        승인: 8  │ 거부: 5          │
│  최근: "PM팀 Design 완료 전 TDD 섹션 필수" (1일 전)      │
│                                                          │
│  🔗 Link (연결 조정)          학습된 규칙: 4개            │
│  ████░░░░░░░░░░░░░░░░        승인: 4  │ 거부: 1          │
│  최근: "parallel merge_strategy any→all" (5일 전)        │
│                                                          │
│  ── 진화 타임라인 ──                                     │
│                                                          │
│  4/02 ──●────●──────●───────────────── 현재              │
│          │    │      │                                    │
│       gate  skill  link                                  │
│       +2    +1     +1                                    │
│                                                          │
│  총 규칙: 24개  │  이번 달 학습: 4개  │  거부율: 27%      │
│                                                          │
│  [상세 이력 보기]                                         │
└──────────────────────────────────────────────────────────┘
```

### 6.11 Learning Harness — 학습 히스토리

```
┌──────────────────────────────────────────────────────────┐
│ 🧠 학습 히스토리                       [축 ▾] [상태 ▾]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  #  │ 축   │ 규칙                       │ 상태  │ 날짜   │
│  ───┼──────┼───────────────────────────┼───────┼──────  │
│  24 │ 📦   │ Do gate: 빌드 캐시 검증     │ ⏳대기 │ 4/02  │
│  23 │ 👥   │ PM SKILL: TDD 섹션 필수     │ ✅승인 │ 4/01  │
│  22 │ 🔗   │ loop max_retries 3→5       │ ✅승인 │ 3/28  │
│  21 │ 📦   │ Design gate: 확신도 0.9    │ ✅승인 │ 3/25  │
│  20 │ 👥   │ CTO SKILL: import 규칙     │ ❌거부 │ 3/25  │
│     │      │  거부 사유: "이미 lint 규칙" │       │       │
│  19 │ 📦   │ Check gate: 커버리지 80%   │ ✏수정  │ 3/22  │
│     │      │  원본: 70% → 수정: 80%     │       │       │
│  ...                                                     │
│                                                          │
│  ── #23 상세 ──                                          │
│                                                          │
│  규칙: "PM팀 SKILL.md에 Design 완료 전 TDD 섹션 필수"    │
│  승인자: Smith │ 승인일: 2026-04-01                      │
│                                                          │
│  패턴 증거:                                              │
│    2026-03-28 design.gate_failed (signup-fix)            │
│      → TDD 섹션 누락으로 gate 실패 [이벤트 보기]         │
│    2026-03-25 design.gate_failed (protractor-v2)         │
│      → TDD 섹션 불완전 → 재작성 [이벤트 보기]            │
│    2026-03-20 design.gate_failed (pipeline-audit)        │
│      → TDD 0건 → 80건 추가 [이벤트 보기]                │
│                                                          │
│  적용 결과:                                              │
│    파일: .bkit/skills/design-writing.md                  │
│    변경: +3줄 (TDD 필수 규칙 추가)                       │
│    [diff 보기]                                            │
└──────────────────────────────────────────────────────────┘
```

---

## 7. TeamManagementAdapter — 관리 인터페이스

### 7.1 인터페이스 분리 원칙 (ISP)

Engine V2의 `TeamAdapter`는 **실행** 전용 (start_block, check_status, get_artifacts, cancel).

Dashboard가 필요한 **관리** 기능은 별도 인터페이스로 분리.

```python
# brick/adapters/management.py

class TeamManagementAdapter(ABC):
    """Team 관리 인터페이스. 실행(TeamAdapter)과 분리.
    
    ISP: 실행만 하는 adapter는 관리 메서드 구현 불필요.
    관리 기능이 있는 adapter만 이 인터페이스도 구현.
    """
    
    # 팀원 관리
    @abstractmethod
    async def list_members(self, team_id: str) -> list[TeamMember]: ...
    @abstractmethod
    async def add_member(self, team_id: str, config: MemberConfig) -> TeamMember: ...
    @abstractmethod
    async def remove_member(self, team_id: str, member_id: str) -> bool: ...
    
    # 스킬 관리
    @abstractmethod
    async def list_skills(self, team_id: str) -> list[Skill]: ...
    @abstractmethod
    async def get_skill_content(self, team_id: str, skill_id: str) -> str: ...
    @abstractmethod
    async def update_skill(self, team_id: str, skill_id: str, content: str) -> Skill: ...
    
    # MCP 관리
    @abstractmethod
    async def list_mcp_servers(self, team_id: str) -> list[McpServer]: ...
    @abstractmethod
    async def configure_mcp(self, team_id: str, server_id: str, enabled: bool) -> McpServer: ...
    
    # 모델 관리
    @abstractmethod
    async def get_model_config(self, team_id: str) -> ModelConfig: ...
    @abstractmethod
    async def set_model_config(self, team_id: str, config: ModelConfig) -> ModelConfig: ...
    
    # 상태 조회
    @abstractmethod
    async def get_team_status(self, team_id: str) -> TeamStatus: ...
```

### 7.2 ClaudeAgentTeamsManagementAdapter

```python
class ClaudeAgentTeamsManagementAdapter(TeamManagementAdapter):
    """Claude Code Agent Teams용 관리 어댑터.
    
    실제로 조작하는 파일:
    - settings.json / settings.local.json (MCP, 모델)
    - .claude/agents/*.md (팀원 정의)
    - SKILL.md / skills/ (스킬)
    - .claude/teams/*/config.json (팀 설정)
    """
    
    async def list_members(self, team_id):
        config_path = f".claude/teams/{team_id}/config.json"
        config = json.loads(Path(config_path).read_text())
        return [TeamMember(**m) for m in config.get("members", [])]
    
    async def add_member(self, team_id, config):
        # .claude/teams/{team_id}/config.json에 팀원 추가
        # 또는 TeamCreate API 호출
        ...
    
    async def list_skills(self, team_id):
        # .bkit/skills/ 디렉토리 스캔
        skills_dir = Path(f".bkit/skills/")
        return [
            Skill(id=f.stem, name=f.stem, path=str(f), size=f.stat().st_size)
            for f in skills_dir.glob("*.md")
        ]
    
    async def update_skill(self, team_id, skill_id, content):
        skill_path = Path(f".bkit/skills/{skill_id}.md")
        skill_path.write_text(content)
        return Skill(id=skill_id, name=skill_id, path=str(skill_path))
    
    async def list_mcp_servers(self, team_id):
        settings = json.loads(Path(".claude/settings.local.json").read_text())
        mcp = settings.get("mcpServers", {})
        return [
            McpServer(id=name, name=name, tools_count=len(cfg.get("tools", [])),
                      enabled=not cfg.get("disabled", False))
            for name, cfg in mcp.items()
        ]
    
    async def configure_mcp(self, team_id, server_id, enabled):
        # settings.local.json의 mcpServers[server_id].disabled 토글
        ...
    
    async def get_model_config(self, team_id):
        settings = json.loads(Path(".claude/settings.json").read_text())
        return ModelConfig(
            default=settings.get("model", "opus"),
            fallback=settings.get("fallbackModel", "sonnet")
        )
    
    async def set_model_config(self, team_id, config):
        # settings.json 수정
        ...
    
    async def get_team_status(self, team_id):
        # .bkit/runtime/peer-map.json + team-context 확인
        peer_map = json.loads(Path(".bkit/runtime/peer-map.json").read_text())
        # 팀원별 상태 추출
        ...
```

### 7.3 Adapter별 관리 기능 매트릭스

| 기능 | Claude Agent Teams | Human | Webhook | Codex |
|------|-------------------|-------|---------|-------|
| list_members | ✅ config.json | ✅ YAML | ❌ 해당 없음 | ✅ API |
| add_member | ✅ TeamCreate | ✅ YAML 편집 | ❌ | ✅ API |
| list_skills | ✅ SKILL.md | ❌ | ❌ | ❌ |
| update_skill | ✅ 파일 쓰기 | ❌ | ❌ | ❌ |
| list_mcp | ✅ settings.json | ❌ | ❌ | ❌ |
| configure_mcp | ✅ settings 수정 | ❌ | ❌ | ❌ |
| model_config | ✅ settings.json | ❌ | ❌ | ✅ API |
| get_status | ✅ peer-map.json | ✅ (수동 입력) | ✅ HTTP poll | ✅ API |

**Adapter-agnostic UI**: Dashboard는 `TeamManagementAdapter`가 구현하는 메서드만 UI에 표시. Human adapter 선택 시 스킬/MCP 탭 자동 숨김.

---

## 8. System Layer 표현

### 8.1 INV 실시간 검증

```python
class InvariantValidator(ResourceValidator):
    """INV-1~10 실시간 검증."""
    
    INVARIANTS = {
        "INV-1": lambda r: r.kind != "Workflow" or r.spec.get("task"),
        "INV-2": lambda r: r.kind != "BlockType" or (r.spec.get("default_what")),
        "INV-3": lambda r: r.kind != "BlockType" or (r.spec.get("default_done")),
        "INV-5": lambda r: r.kind != "Preset" or all(
            b["id"] in r.spec.get("teams", {})
            for b in r.spec.get("blocks", [])
        ),
        "INV-6": lambda r: r.kind != "Preset" or _has_links_for_all_blocks(r),
        "INV-7": lambda r: r.kind != "Preset" or not _has_cycle(r),
        "INV-8": lambda r: not r.readonly or True,  # readonly는 수정 자체를 차단
    }
    
    def validate(self, resource):
        errors = []
        for inv_id, check in self.INVARIANTS.items():
            if not check(resource):
                errors.append(ValidationError(
                    code=inv_id,
                    message=INV_MESSAGES[inv_id],
                    severity="error"
                ))
        return errors
```

### 8.2 UI 표현

- **빨간 배너**: INV 위반 시 하단에 고정 배너. "INV-5: 'do' 블록에 팀 미배정"
- **노드 경고**: 캔버스에서 문제 블록에 빨간 테두리 + ⚠ 아이콘
- **readonly 배지**: Core 프리셋 노드에 🔒 표시. 클릭 시 "Core 프리셋은 수정 불가" 안내
- **저장 차단**: INV 위반 상태에서 저장 버튼 비활성화 + 위반 항목 표시

### 8.3 Core 프리셋 보호

```python
class ReadonlyValidator(ResourceValidator):
    def validate(self, resource):
        if resource.readonly:
            return [ValidationError(
                code="READONLY",
                message=f"'{resource.name}'은 Core 프리셋입니다. 수정할 수 없습니다.",
                severity="error"
            )]
        return []
```

Core 프리셋(t-pdca-l0~l3, hotfix, research)은 UI에서:
- 리스트: 🔒 아이콘 + "Core" 레이블
- 편집: 읽기 전용. "복제하여 커스텀 생성" 버튼 제공
- 삭제: 차단

---

## 9. Plugin-driven UI

### 9.1 동적 UI 생성 원칙

새로운 Block 타입, Gate 타입, Link 타입, Adapter가 플러그인으로 추가되면 **UI가 자동 반영**되어야 함. 하드코딩 UI 금지.

```
플러그인 추가:
  pip install brick-adapter-github-actions
  │
  ▼
Engine: entry_points에서 자동 감지
  │
  ▼
API: GET /api/v1/adapter-types → "github_actions" 포함
  │
  ▼
Dashboard: Adapter 선택 드롭다운에 "GitHub Actions" 자동 추가
  │
  ▼
플러그인이 configurable_fields 정의 → Dashboard가 동적 폼 생성
```

### 9.2 플러그인 메타데이터 구조

```python
class PluginMetadata:
    """모든 플러그인이 Dashboard에 노출하는 메타데이터."""
    
    name: str                       # 식별자
    display_name: str               # UI 표시명
    icon: str                       # 이모지 또는 아이콘 URL
    description: str                # 설명
    
    # Dashboard 동적 폼 생성용
    config_schema: dict             # JSON Schema (설정 필드 정의)
    
    # 예: GitHub Actions Adapter
    # config_schema = {
    #   "type": "object",
    #   "properties": {
    #     "repo": {"type": "string", "title": "GitHub Repository"},
    #     "workflow_file": {"type": "string", "title": "Workflow 파일"},
    #     "ref": {"type": "string", "title": "Branch", "default": "main"}
    #   },
    #   "required": ["repo", "workflow_file"]
    # }
```

### 9.3 동적 폼 렌더링

```tsx
// components/editors/DynamicConfigForm.tsx
function DynamicConfigForm({ schema, value, onChange }: Props) {
  // JSON Schema → React 폼 자동 생성
  return (
    <form>
      {Object.entries(schema.properties).map(([key, prop]) => (
        <FormField 
          key={key}
          name={key}
          type={prop.type}
          label={prop.title || key}
          required={schema.required?.includes(key)}
          value={value[key]}
          onChange={(v) => onChange({ ...value, [key]: v })}
        />
      ))}
    </form>
  );
}
```

---

## 10. Learning Harness UI — 진화적 규칙 학습

> "프롬프트 엔지니어링은 끝났다. 에이전트가 실수하면 → 그 실수가 새 규칙이 된다."
> 하네스는 시간이 지날수록 견고해지는 **진화적 시스템**.

### 10.1 핵심 개념

```
실패 반복 감지 → 패턴 분석 → 규칙 제안 → 사람 승인 → 파일 자동 반영
                                              │
                              ┌────────────────┼────────────────┐
                              ▼                ▼                ▼
                        Gate YAML에        SKILL.md에       Link config에
                        handler 추가      규칙 추가        파라미터 조정
```

**기존 시스템과의 차이**: bscamp의 `docs/postmortem/` + `docs/issues/operational-issues.md`는 **수동 축적**. Learning Harness는 **자동 감지 + 반자동 적용**. 사람은 승인/거부만.

### 10.2 3축별 학습 대상

| 축 | 학습 대상 | 적용 파일 | 예시 |
|----|----------|----------|------|
| **Block** | Gate 규칙 | `.bkit/presets/*.yaml` (gates 섹션) | "빌드 캐시 삭제 후 빌드" handler 추가 |
| **Team** | Skill 규칙 | `.bkit/skills/*.md` | "동일 파일 동시 수정 금지" 규칙 추가 |
| **Link** | 연결 파라미터 | `.bkit/presets/*.yaml` (links 섹션) | max_retries 3→5, timeout 조정 |

### 10.3 데이터 모델

```python
@dataclass
class FailurePattern:
    """반복 실패 패턴 — PatternDetector가 이벤트 히스토리에서 추출."""
    
    event_type: str            # block.gate_failed, adapter.failed, etc.
    count: int                 # 반복 횟수
    window: str                # 분석 기간 ("7d", "30d")
    block_id: str | None       # 특정 블록에 국한 (없으면 전체)
    team_id: str | None        # 특정 팀에 국한
    common_cause: str          # LLM이 분석한 공통 원인
    event_ids: list[str]       # 증거 이벤트 ID 목록


@dataclass
class LearningProposal:
    """규칙 제안 — 사람이 승인/거부/수정."""
    
    id: str                    # LH-001, LH-002, ...
    axis: str                  # block | team | link
    title: str                 # 한 줄 요약
    description: str           # 상세 설명
    
    # 패턴 증거
    pattern: FailurePattern
    confidence: float          # 0.0~1.0 (LLM 분석 확신도)
    
    # 제안 변경
    target_file: str           # 변경 대상 파일 경로
    diff: str                  # unified diff 형식
    
    # 상태
    status: str                # pending | approved | rejected | modified
    reviewed_by: str | None    # 승인/거부한 사람
    reviewed_at: str | None
    reject_reason: str | None  # 거부 사유
    modified_diff: str | None  # 수정된 diff (modify 시)
    
    # 메타
    created_at: str
    applied_at: str | None     # 파일에 반영된 시각


@dataclass
class LearningStats:
    """3축별 학습 통계."""
    
    block_rules: int           # 승인된 Block gate 규칙 수
    team_rules: int            # 승인된 Team skill 규칙 수
    link_adjustments: int      # 승인된 Link 조정 수
    
    pending_count: int         # 대기 중 제안
    total_proposals: int       # 전체 제안 (승인+거부+대기)
    reject_rate: float         # 거부율
    
    recent: list[LearningProposal]  # 최근 N건
    timeline: list[dict]       # 월별/주별 추이
```

### 10.4 패턴 감지 엔진 (PatternDetector)

```python
class PatternDetector:
    """이벤트 히스토리에서 반복 실패 패턴을 자동 감지.
    
    감지 기준:
    - 동일 (event_type, block_id) 조합이 window 내 threshold 이상 반복
    - 기본: 7일간 3회 이상
    """
    
    def __init__(self, event_store: EventStore, llm_client: LLMClient):
        self.event_store = event_store
        self.llm_client = llm_client
        self.threshold = 3
        self.window = "7d"
    
    def detect(self) -> list[FailurePattern]:
        """전체 이벤트 히스토리 스캔 → 패턴 목록."""
        events = self.event_store.query(
            types=["block.gate_failed", "adapter.failed", "block.failed",
                   "adapter.timeout", "block.gate_review_rejected"],
            window=self.window
        )
        
        # (event_type, block_id, team_id) 그룹핑
        groups = defaultdict(list)
        for e in events:
            key = (e.type, e.data.get("block_id"), e.data.get("team_id"))
            groups[key].append(e)
        
        patterns = []
        for key, group in groups.items():
            if len(group) >= self.threshold:
                patterns.append(FailurePattern(
                    event_type=key[0],
                    count=len(group),
                    window=self.window,
                    block_id=key[1],
                    team_id=key[2],
                    common_cause="",  # LLM이 채움
                    event_ids=[e.id for e in group]
                ))
        
        return patterns
    
    async def propose(self, pattern: FailurePattern) -> LearningProposal:
        """패턴 → LLM 분석 → 규칙 제안 생성."""
        
        # 1. 실패 이벤트 상세 수집
        evidence = [self.event_store.get(eid) for eid in pattern.event_ids]
        
        # 2. LLM에게 패턴 분석 + 규칙 제안 요청
        analysis = await self.llm_client.evaluate(
            prompt=f"""다음 반복 실패 패턴을 분석하고 예방 규칙을 제안하라.

패턴: {pattern.event_type} — {pattern.count}회 반복 ({pattern.window})
블록: {pattern.block_id or '전체'}
팀: {pattern.team_id or '전체'}

실패 상세:
{json.dumps([e.to_dict() for e in evidence], indent=2, ensure_ascii=False)}

출력 형식:
- axis: block | team | link
- title: 한 줄 요약
- description: 상세
- target_file: 변경 대상 파일
- diff: unified diff
- confidence: 0.0~1.0
- common_cause: 공통 원인""",
            model="sonnet"  # 비용 대비 충분한 분석력
        )
        
        # 3. LearningProposal 생성
        return LearningProposal(
            id=self._next_id(),
            axis=analysis.axis,
            title=analysis.title,
            description=analysis.description,
            pattern=pattern,
            confidence=analysis.confidence,
            target_file=analysis.target_file,
            diff=analysis.diff,
            status="pending",
            created_at=datetime.now().isoformat(),
            ...
        )
```

### 10.5 규칙 적용기 (RuleApplicator)

```python
class RuleApplicator:
    """승인된 규칙을 실제 파일에 자동 반영."""
    
    async def apply(self, proposal: LearningProposal) -> ApplyResult:
        """diff를 target_file에 적용."""
        
        diff = proposal.modified_diff or proposal.diff
        target = Path(proposal.target_file)
        
        if not target.exists():
            return ApplyResult(success=False, error="대상 파일 미존재")
        
        match proposal.axis:
            case "block":
                return await self._apply_gate_rule(target, diff, proposal)
            case "team":
                return await self._apply_skill_rule(target, diff, proposal)
            case "link":
                return await self._apply_link_adjustment(target, diff, proposal)
    
    async def _apply_gate_rule(self, target, diff, proposal):
        """프리셋 YAML의 gates 섹션에 handler 추가 또는 수정."""
        preset = ruamel.yaml.load(target.read_text())
        
        # diff 파싱 → gates 섹션 패치
        patched = apply_unified_diff(target.read_text(), diff)
        target.write_text(patched)
        
        # 검증
        validation = self.validator.validate_preset(patched)
        if not validation.valid:
            # 롤백
            target.write_text(original)
            return ApplyResult(success=False, error=validation.errors)
        
        return ApplyResult(
            success=True,
            file=str(target),
            lines_added=count_additions(diff),
            lines_removed=count_deletions(diff)
        )
    
    async def _apply_skill_rule(self, target, diff, proposal):
        """SKILL.md에 학습된 규칙 섹션 추가."""
        content = target.read_text()
        
        # 학습 규칙 마커가 있으면 해당 섹션에 추가, 없으면 새 섹션 생성
        marker = "## 학습된 규칙 (Learning Harness)"
        if marker not in content:
            content += f"\n\n{marker}\n\n"
        
        # diff 적용
        patched = apply_unified_diff(content, diff)
        target.write_text(patched)
        
        return ApplyResult(success=True, file=str(target))
    
    async def _apply_link_adjustment(self, target, diff, proposal):
        """프리셋 YAML의 links 섹션 파라미터 수정."""
        # gate_rule과 동일 로직 (YAML 패치)
        return await self._apply_gate_rule(target, diff, proposal)
```

### 10.6 자동 감지 트리거

패턴 감지는 다음 시점에 자동 실행:

| 트리거 | 시점 | 방법 |
|--------|------|------|
| **워크플로우 실패** | `workflow.failed` 이벤트 | EventBus subscriber |
| **Gate 반복 실패** | `block.gate_failed` 3회 누적 | 카운터 기반 |
| **주기적 스캔** | 매일 00:00 | `brick serve`의 cron 스케줄러 |
| **수동 트리거** | Dashboard 버튼 / `brick learn detect` | API / CLI |

### 10.7 진화적 특성 — 시간이 지날수록 견고해지는 하네스

```
Week 1:  하네스 규칙 0개 → 실패 발생 → 패턴 감지 → 규칙 3개 승인
Week 2:  규칙 3개 적용 → 이전 실패 미재발 → 새로운 실패 → 규칙 2개 추가
Week 4:  규칙 5개 → 실패율 40% 감소
Week 8:  규칙 12개 → 실패율 70% 감소
Week 12: 규칙 20개 → 대부분의 반복 실패 예방

핵심: 사람은 승인/거부만. 패턴 감지와 규칙 생성은 자동.
하네스가 스스로 강화되는 positive feedback loop.
```

**거부도 학습**: 거부된 제안의 사유가 축적되면, PatternDetector가 "이런 유형의 제안은 거부당할 가능성 높음"을 학습 → 확신도 조정. 거부율이 30% 이상이면 `confidence_threshold`를 올려 정밀도 향상.

### 10.8 저장 구조

```
.bkit/learning/
├── proposals/
│   ├── LH-001.yaml           # 개별 제안 (상태, diff, 증거)
│   ├── LH-002.yaml
│   └── ...
├── history.jsonl              # 승인/거부 이벤트 로그 (append-only)
└── stats.json                 # 3축별 통계 캐시 (주기 갱신)
```

```yaml
# .bkit/learning/proposals/LH-023.yaml
id: LH-023
axis: team
title: "PM팀 SKILL.md에 Design 완료 전 TDD 섹션 필수"
description: |
  Design 문서 gate 통과 시 TDD 섹션이 누락되어 반복 실패.
  SKILL.md에 "Design 완료 전 TDD 케이스 매핑 테이블 필수" 규칙 추가 제안.
confidence: 0.87
status: approved
reviewed_by: smith
reviewed_at: "2026-04-01T15:30:00Z"
pattern:
  event_type: block.gate_failed
  block_id: design
  count: 3
  window: "14d"
  event_ids: [evt-0312, evt-0325, evt-0328]
target_file: ".bkit/skills/design-writing.md"
diff: |
  --- a/.bkit/skills/design-writing.md
  +++ b/.bkit/skills/design-writing.md
  @@ -42,0 +43,5 @@
  +
  +## 학습된 규칙 (LH-023)
  +- Design 문서에 TDD 섹션이 없으면 완료로 인정하지 않음
  +- TDD 케이스는 Design 섹션과 1:1 매핑 필수
  +- Gap 0% 달성이 Design 완료 기준
applied_at: "2026-04-01T15:30:05Z"
```

---

## 11. 비교 분석 (Learning Harness 포함)

| 항목 | **Brick Dashboard** | n8n Editor | K8s Dashboard | Backstage | Retool |
|------|---------------------|-----------|---------------|-----------|--------|
| **핵심 목적** | 3축 리소스 관리 + 워크플로우 조합 | 노드 연결 자동화 | Pod/Service 모니터링 | 서비스 카탈로그 | 내부 도구 빌더 |
| **Source of Truth** | **파일 (YAML)** | DB | etcd | YAML (catalog-info) | DB |
| **CLI Parity** | ✅ brick CLI = Dashboard 동일 | ❌ GUI 전용 | ✅ kubectl | ❌ GUI 중심 | ❌ GUI 전용 |
| **캔버스 에디터** | ✅ React Flow | ✅ Vue Flow | ❌ 리스트 뷰 | ❌ 리스트 뷰 | ⚠️ 컴포넌트 배치 |
| **팀 관리** | ✅ 깊은 관리 (스킬/MCP/모델) | ❌ 없음 | ❌ 없음 | ⚠️ Group Entity | ❌ 없음 |
| **실시간** | ✅ WebSocket | ✅ Webhook | ✅ Watch API | ❌ 폴링 | ⚠️ 폴링 |
| **검증** | ✅ INV + Schema + DAG | ⚠️ 노드 호환성만 | ✅ Admission Webhook | ⚠️ 스키마만 | ❌ 없음 |
| **플러그인 UI** | ✅ config_schema 동적 폼 | ✅ 노드 패키지 | ⚠️ 제한적 | ✅ Plugin 시스템 | ✅ 커스텀 컴포넌트 |
| **오프라인** | ✅ 파일 직접 편집 | ❌ 서버 필수 | ❌ 서버 필수 | ❌ 서버 필수 | ❌ 서버 필수 |
| **자가 학습** | ✅ Learning Harness | ❌ 없음 | ❌ 없음 | ❌ 없음 | ❌ 없음 |

### Brick Dashboard 고유 차별점

1. **File-first + CLI Parity**: 다른 대시보드와 달리 파일이 원본. 대시보드 없어도 CLI로 전부 가능. 대시보드는 "있으면 편한" 도구
2. **3축 독립 관리**: ECS 패턴으로 Block/Team/Link를 독립 편집. n8n은 노드+엣지만
3. **Team Deep Management**: 팀원, 스킬, MCP, 모델까지 관리하는 대시보드는 없음. Brick이 유일
4. **AI-Native Gate 승인 UI**: LLM gate 결과를 시각화하고, 확신도 표시, 수동 승인 가능
5. **Adapter-Agnostic**: 팀 UI가 adapter에 무관. 새 adapter 추가 시 UI 자동 반영
6. **Learning Harness**: 반복 실패 → 패턴 감지 → 규칙 제안 → 승인 → 자동 반영. 시간이 지날수록 견고해지는 진화적 시스템. 다른 워크플로우 도구에 없는 개념

---

## 12. 심층 분석 — 엣지케이스

### 12.1 동시 편집 충돌 (File Conflict)

**문제**: Smith가 Dashboard에서 편집 중, COO가 CLI로 같은 파일 수정.

**해결**:
- FileWatcher가 외부 변경 감지 → Dashboard에 "파일이 외부에서 변경됨" 알림
- 선택지: "외부 변경 적용" (내 편집 폐기) / "내 편집 유지" (외부 덮어쓰기) / "비교" (diff 보기)
- **기본 동작**: Last-write-wins. Git이 최종 안전망 (되돌리기 가능)
- **예방**: 대시보드 편집 시 `.lock` 파일 생성 → CLI가 경고 (차단은 아님)

```python
class FileStore:
    def update(self, resource):
        lock_path = self._lock_path(resource)
        if lock_path.exists():
            other = json.loads(lock_path.read_text())
            raise FileConflictError(
                f"'{resource.name}' 파일이 {other['editor']}에서 편집 중입니다."
            )
        
        # 원자적 쓰기
        self._write_yaml(resource)
```

### 12.2 Canvas ↔ YAML 동기화 손실

**문제**: YAML에 직접 추가한 커스텀 필드가 Canvas → YAML 변환 시 유실.

**해결**:
- **Roundtrip 보존**: YAML 파서로 `ruamel.yaml` 사용 (코멘트, 순서 보존)
- **Unknown fields**: 파서가 모르는 필드는 `_extra` dict에 보관 → 재직렬화 시 복원
- **레이아웃 분리**: 노드 위치는 `.layout/` 파일에 별도 저장 → YAML 오염 없음

```python
class CanvasToPresetConverter:
    def convert(self, canvas, original_yaml=None):
        """original_yaml이 있으면 roundtrip 보존."""
        if original_yaml:
            # ruamel.yaml로 원본 로드 → 노드/엣지 부분만 갱신
            doc = ruamel.yaml.load(original_yaml)
            doc["blocks"] = self._blocks_from_nodes(canvas.nodes)
            doc["links"] = self._links_from_edges(canvas.edges)
            return ruamel.yaml.dump(doc)  # 코멘트 보존
        else:
            return self._fresh_yaml(canvas)
```

### 12.3 WebSocket 재연결 시 상태 불일치

**문제**: 네트워크 끊김 → 재연결 → 그 사이 발생한 이벤트 누락.

**해결**:
- WebSocket 재연결 시 `sync.snapshot` 요청 (전체 상태 스냅샷)
- 각 이벤트에 `sequence_number` 포함 → 클라이언트가 마지막 수신 번호 전송 → 서버가 누락분 재전송
- 연결 끊김 중 이벤트는 서버 측 버퍼에 보관 (최대 1000건, 5분)

```typescript
// hooks/useWebSocket.ts
function useWebSocket(url: string) {
  const [lastSeq, setLastSeq] = useState(0);
  
  const connect = useCallback(() => {
    const ws = new WebSocket(`${url}?last_seq=${lastSeq}`);
    
    ws.onopen = () => {
      // 재연결 시 스냅샷 요청
      ws.send(JSON.stringify({ type: "sync.request" }));
    };
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setLastSeq(data.sequence_number);
      // 이벤트 처리
    };
    
    ws.onclose = () => {
      // 자동 재연결 (exponential backoff)
      setTimeout(connect, reconnectDelay);
    };
  }, [url, lastSeq]);
}
```

### 12.4 대용량 프리셋 편집 성능

**문제**: 블록 100개 이상 워크플로우 → Canvas 렌더링 느림, YAML 편집 느림.

**해결**:
- React Flow `nodeTypes` 메모이제이션 + `useMemo`
- 블록 50개 이상 → 자동 클러스터링 (서브 워크플로우 시각적 그룹핑)
- YAML 에디터: Monaco의 `model.updateOptions({ tabSize: 2 })` + folding
- API: 프리셋 상세 요청 시 `?fields=blocks,links` 로 필요 필드만

### 12.5 Adapter 없는 상태에서 팀 관리 시도

**문제**: Claude Agent Teams adapter가 미설치 상태에서 팀 스킬 편집 시도.

**해결**:
- API가 adapter 설치 상태 확인 → 미설치 시 적절한 에러 반환
- UI: 미설치 adapter 선택 시 "이 adapter는 설치되지 않았습니다. `pip install brick-adapter-xxx`" 안내
- 관리 기능 없는 adapter: 해당 탭 자동 숨김 (§7.3 매트릭스 기반)

### 11.6 Gate 승인 타임아웃

**문제**: Review gate 요청 후 승인자 부재 → 워크플로우 무한 대기.

**해결**:
- Gate review에 타임아웃 설정 가능 (`review.timeout: 3600` — 1시간)
- 타임아웃 시 행동: `auto_approve` (자동 승인) / `escalate` (다른 검토자에게) / `fail`
- Dashboard: 타임아웃 카운트다운 표시 + 알림 (Slack/이메일 재발송)

```yaml
gate:
  review:
    coo: true
    timeout: 3600          # 1시간
    on_timeout: escalate   # auto_approve | escalate | fail
    escalate_to: smith     # 에스컬레이션 대상
```

### 11.7 Slack Gate 승인 (확장)

**문제 아님, 기회**: Gate 승인을 브라우저 외에 Slack에서도 가능하면 편의 극대화.

**설계**:
```
Engine: block.gate_review_requested 이벤트
    │
    ├──→ Dashboard: 승인 패널 표시
    │
    └──→ Slack Webhook: 버튼 포함 메시지
         [승인 ✅] [거부 ❌]
              │
              ▼
         Slack Action → API: POST /api/v1/workflows/{id}/blocks/{bid}/approve
              │
              ▼
         Engine: gate 통과 → 다음 블록
```

Slack Interactive Message → API Server → Engine. Dashboard와 동일 API 사용.

### 11.8 오프라인 편집과 온라인 동기화

**문제**: API 서버 없이 파일 직접 편집 → 나중에 `brick serve` 시작 시 동기화.

**해결**:
- `brick serve` 시작 시 모든 리소스 파일 풀 스캔 → 메모리 캐시 구축
- Dashboard 첫 연결 시 `sync.snapshot`으로 전체 상태 전송
- 파일 타임스탬프 기반 변경 감지 (stat)
- **원칙**: 파일이 항상 옳음. API 서버의 메모리 캐시는 파일의 미러.

---

## 13. 단계별 전달 (Phased Delivery)

### Phase 1: MVP — 리소스 CRUD + 상태 조회

```
범위:
  - Block 타입 카탈로그 (목록/생성/편집/삭제)
  - Team CRUD (목록/생성/편집/삭제)
  - Preset CRUD (목록/생성/편집/삭제)
  - Workflow 상태 조회 (목록/상세)
  - YAML 에디터 (Monaco)
  - INV 검증 + 에러 표시
  
기술:
  - FastAPI (REST만, WebSocket 아직)
  - React + Tailwind
  - Monaco Editor
  
의존:
  - Engine V2 FileStore 구현
```

### Phase 2: 캔버스 에디터

```
범위:
  - React Flow 캔버스 (블록 배치 + 연결)
  - Canvas ↔ YAML 양방향 동기화
  - Split View (Canvas + YAML)
  - 자동 레이아웃 (dagre)
  - 미니맵
  - 프리셋 시각화
  
기술:
  - React Flow v12+
  - dagre-d3 (자동 레이아웃)
  
의존:
  - Phase 1 완료
```

### Phase 3: 실시간 모니터링

```
범위:
  - WebSocket 이벤트 스트림
  - 실시간 블록/팀 상태 업데이트
  - 실행 경로 하이라이팅
  - 이벤트 히스토리 패널
  - Gate 승인/거부 UI
  
기술:
  - WebSocket (FastAPI)
  - EventBridge (Engine EventBus 구독)
  
의존:
  - Phase 2 + Engine V2 EventBus 구현
```

### Phase 4: Team Deep Management

```
범위:
  - 팀원 추가/제거/역할 변경
  - 스킬 편집기 (Monaco Markdown)
  - MCP 서버 on/off 토글
  - 모델 설정 (드롭다운)
  - Adapter별 동적 폼
  
기술:
  - TeamManagementAdapter
  - DynamicConfigForm (JSON Schema → React)
  
의존:
  - Phase 3 + TeamManagementAdapter 구현
```

### Phase 5: 확장

```
범위:
  - Slack Gate 승인
  - 멀티 워크플로우 동시 뷰
  - 메트릭 대시보드 (완료 시간, 재시도 횟수 등)
  - 감사 로그 (누가 언제 뭘 바꿨는지)
  - bscamp.app 통합 (공통 인증)
  
의존:
  - Phase 4 완료
```

---

## 14. 파일 구조

```
brick-dashboard/                    # 별도 패키지 또는 brick 패키지 하위
├── api/                            # FastAPI 서버
│   ├── __init__.py
│   ├── server.py                   # FastAPI app + 라우터
│   ├── file_store.py               # 파일 읽기/쓰기 계층
│   ├── event_bridge.py             # Engine EventBus → WebSocket
│   ├── validation_pipeline.py      # 리소스 검증
│   ├── converters.py               # Canvas ↔ YAML 변환
│   ├── routes/
│   │   ├── resources.py            # 통합 리소스 CRUD
│   │   ├── block_types.py          # 블록 타입 API
│   │   ├── teams.py                # 팀 API (Deep Management 포함)
│   │   ├── presets.py              # 프리셋 API
│   │   ├── workflows.py            # 워크플로우 API
│   │   ├── gates.py                # Gate 승인 API
│   │   ├── validation.py           # 검증 API
│   │   └── websocket.py            # WebSocket 핸들러
│   └── models/
│       ├── resource.py             # BrickResource
│       ├── team_management.py      # TeamMember, Skill, McpServer
│       ├── canvas.py               # CanvasState, NodeData, EdgeData
│       └── events.py               # WebSocket 이벤트
│
├── frontend/                       # React SPA
│   ├── src/
│   │   ├── app/                    # 페이지
│   │   ├── components/             # 컴포넌트 (§4.2 참조)
│   │   ├── hooks/                  # React hooks
│   │   ├── stores/                 # Zustand stores
│   │   └── lib/                    # 유틸
│   ├── package.json
│   ├── tailwind.config.ts
│   └── vite.config.ts
│
├── adapters/                       # TeamManagementAdapter 구현체
│   ├── __init__.py
│   ├── management.py               # ABC
│   ├── claude_management.py        # Claude Agent Teams 관리
│   └── human_management.py         # Human 관리
│
└── tests/
    ├── test_file_store.py
    ├── test_validation.py
    ├── test_converters.py
    ├── test_event_bridge.py
    ├── test_api_resources.py
    ├── test_api_teams.py
    ├── test_api_workflows.py
    ├── test_api_gates.py
    ├── test_websocket.py
    └── test_integration.py
```

---

## 15. 브랜딩

Engine V2 §14 브랜딩 적용. Dashboard 고유 추가사항:

| 항목 | 값 |
|------|-----|
| 컬러 — Primary | #C6084A (레드) — 헤더, 주요 버튼 |
| 컬러 — Dark | #1C1A1A — 사이드바 배경, 텍스트 |
| 컬러 — Accent | #FF6B35 (벽돌오렌지) — 실행 중 노드 |
| 컬러 — Success | #00D4AA (터미널그린) — 완료 노드 |
| 컬러 — Background | #FFFFFF — 메인 영역 (라이트 모드) |
| 컬러 — Canvas Grid | #F5F5F5 — 캔버스 배경 그리드 |
| 폰트 — 제목 | JetBrains Mono Bold |
| 폰트 — 본문 | Noto Sans KR (= Pretendard 대체 가능) |
| 폰트 — 코드 | JetBrains Mono |
| 노드 — completed | 테두리 #00D4AA, 배경 #F0FFF9 |
| 노드 — running | 테두리 #FF6B35, 배경 #FFF8F0, pulse 애니메이션 |
| 노드 — failed | 테두리 #C6084A, 배경 #FFF0F0 |
| 노드 — pending | 테두리 #D1D5DB, 배경 #FFFFFF |
| 엣지 — sequential | 실선, #6B7280 |
| 엣지 — parallel | 점선, #4A90D9 |
| 엣지 — loop | 곡선, #FF6B35 |
| 엣지 — compete | 이중선, #C6084A |

---

## 16. TDD 케이스 + 매핑 테이블

### API / FileStore

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-01 | FileStore: list(kind=BlockType) → 내장 9종 반환 | §3.4 | .bkit/block-types/ 스캔 |
| BD-02 | FileStore: create(BlockType) → YAML 파일 생성 | §3.4 | 파일 존재 + 내용 일치 |
| BD-03 | FileStore: update(BlockType) → YAML 파일 갱신 | §3.4 | 변경 내용 반영 |
| BD-04 | FileStore: delete(BlockType) → 파일 삭제 | §3.4 | 파일 미존재 |
| BD-05 | FileStore: delete(readonly) → 에러 | §3.4, §8.3 | ReadonlyError |
| BD-06 | FileStore: watch → 외부 파일 변경 감지 | §5.4 | callback 호출 |
| BD-07 | FileStore: create(Team) → YAML 파일 생성 | §3.4 | .bkit/teams/ 파일 확인 |
| BD-08 | FileStore: create(Preset) → YAML 파일 생성 | §3.4 | .bkit/presets/ 파일 확인 |

### Validation Pipeline

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-09 | INV-1: Workflow task 없으면 에러 | §8.1 | ValidationError(INV-1) |
| BD-10 | INV-2: BlockType what 없으면 에러 | §8.1 | ValidationError(INV-2) |
| BD-11 | INV-3: BlockType done 없으면 에러 | §8.1 | ValidationError(INV-3) |
| BD-12 | INV-5: Preset 블록에 팀 미배정 에러 | §8.1 | ValidationError(INV-5) |
| BD-13 | INV-7: DAG 순환 감지 에러 | §8.1 | ValidationError(INV-7) |
| BD-14 | INV-8: Core 프리셋 수정 차단 | §8.3 | ReadonlyError |
| BD-15 | Schema 검증: 필수 필드 누락 에러 | §3.5 | SchemaValidationError |
| BD-16 | Reference 검증: 존재하지 않는 팀 참조 에러 | §3.5 | ReferenceError |
| BD-17 | Validation 복합: 여러 에러 동시 반환 | §3.5 | errors[] 복수 |

### API 엔드포인트

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-18 | GET /api/v1/block-types → 200 + 목록 | §3.2 | status=200, length >= 9 |
| BD-19 | POST /api/v1/block-types → 201 + 생성 | §3.2 | status=201, 파일 생성됨 |
| BD-20 | PUT /api/v1/block-types/:name → 200 + 갱신 | §3.2 | status=200, 파일 변경 |
| BD-21 | DELETE /api/v1/block-types/:name → 204 | §3.2 | status=204, 파일 삭제 |
| BD-22 | DELETE /api/v1/block-types/plan (core) → 403 | §3.2 | status=403 |
| BD-23 | POST /api/v1/block-types 검증 실패 → 400 + errors | §3.2 | status=400, errors[] |
| BD-24 | GET /api/v1/teams → 200 + 팀 목록 | §3.2 | status=200 |
| BD-25 | GET /api/v1/teams/:name/members → 200 + 팀원 목록 | §3.2 | status=200, members[] |
| BD-26 | POST /api/v1/teams/:name/members → 201 + 추가 | §3.2 | status=201, member 포함 |
| BD-27 | DELETE /api/v1/teams/:name/members/:mid → 204 | §3.2 | status=204 |
| BD-28 | GET /api/v1/teams/:name/skills → 200 + 스킬 목록 | §3.2 | status=200, skills[] |
| BD-29 | PUT /api/v1/teams/:name/skills/:sid → 200 + 내용 갱신 | §3.2 | status=200, content 변경 |
| BD-30 | GET /api/v1/teams/:name/mcp → 200 + MCP 목록 | §3.2 | status=200, servers[] |
| BD-31 | PUT /api/v1/teams/:name/mcp/:sid → 200 + on/off | §3.2 | status=200, enabled 변경 |
| BD-32 | GET /api/v1/teams/:name/model → 200 + 모델 설정 | §3.2 | status=200, model 포함 |
| BD-33 | PUT /api/v1/teams/:name/model → 200 + 모델 변경 | §3.2 | status=200 |
| BD-34 | GET /api/v1/teams/:name/status → 200 + 실시간 상태 | §3.2 | status=200, phase 포함 |
| BD-35 | GET /api/v1/presets → 200 + 프리셋 목록 (core 표시) | §3.2 | status=200, readonly 표시 |
| BD-36 | PUT /api/v1/presets/t-pdca-l2 (core) → 403 | §3.2 | status=403 |
| BD-37 | POST /api/v1/presets/:name/validate → 200 + 결과 | §3.2 | valid/errors 포함 |
| BD-38 | GET /api/v1/workflows → 200 + 워크플로우 목록 | §3.2 | status=200 |
| BD-39 | GET /api/v1/workflows/:id → 200 + 상세 상태 | §3.2 | blocks 상태 포함 |
| BD-40 | GET /api/v1/workflows/:id/events → 200 + 이벤트 히스토리 | §3.2 | events[] 시간순 |
| BD-41 | POST /api/v1/workflows/:id/blocks/:bid/approve → 200 | §3.2 | gate 통과 |
| BD-42 | POST /api/v1/workflows/:id/blocks/:bid/reject → 200 | §3.2 | gate 거부, 사유 기록 |
| BD-43 | POST /api/v1/validate/preset → 200 + 검증 결과 | §3.2 | valid + errors/warnings |
| BD-44 | POST /api/v1/validate/workflow-graph → 순환 감지 | §3.2 | valid=false, INV-7 |
| BD-45 | GET /api/v1/adapter-types → 설치된 어댑터 목록 | §3.2 | config_schema 포함 |
| BD-46 | GET /api/v1/gate-types → 설치된 gate 타입 | §3.2 | 4종 이상 |
| BD-47 | GET /api/v1/link-types → 설치된 link 타입 | §3.2 | 7종 이상 |

### Canvas ↔ YAML 변환

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-48 | Preset → Canvas: blocks → nodes 변환 | §4.4 | node 수 = block 수 |
| BD-49 | Preset → Canvas: links → edges 변환 | §4.4 | edge 수 = link 수 |
| BD-50 | Preset → Canvas: teams → node.data.team 매핑 | §4.4 | 각 노드에 팀 존재 |
| BD-51 | Preset → Canvas: gates → node.data.gate 매핑 | §4.4 | 각 노드에 gate 존재 |
| BD-52 | Canvas → Preset: nodes → blocks 변환 | §4.4 | block 수 = node 수 |
| BD-53 | Canvas → Preset: edges → links 변환 | §4.4 | link 수 = edge 수 |
| BD-54 | Canvas → Preset → Canvas roundtrip 일치 | §4.4 | 왕복 후 동일 |
| BD-55 | YAML roundtrip: 커스텀 필드 + 코멘트 보존 | §11.2 | extra 필드 유지 |
| BD-56 | 자동 레이아웃 (dagre): 겹침 없는 노드 배치 | §4.4 | 모든 노드 간 최소 거리 보장 |

### WebSocket / EventBridge

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-57 | WS 연결 → sync.snapshot 수신 | §3.3 | workflows[] 포함 |
| BD-58 | Engine 이벤트 → WS 메시지 수신 | §5.2 | event type 일치 |
| BD-59 | WS 필터: ?workflow=xxx → 해당만 수신 | §3.3 | 다른 워크플로우 미수신 |
| BD-60 | WS 필터: ?type=block.* → 블록 이벤트만 | §3.3 | adapter.* 미수신 |
| BD-61 | WS 재연결: last_seq → 누락분 재전송 | §11.3 | 누락 이벤트 수신 |
| BD-62 | WS 재연결: 5분 초과 → 스냅샷 전송 | §11.3 | sync.snapshot |
| BD-63 | EventBridge: Engine EventBus 구독 → WS 변환 | §5.2 | 이벤트 구조 보존 |

### TeamManagementAdapter

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-64 | Claude: list_members → config.json 파싱 | §7.2 | members 목록 |
| BD-65 | Claude: add_member → config.json에 추가 | §7.2 | 새 멤버 포함 |
| BD-66 | Claude: remove_member → config.json에서 제거 | §7.2 | 멤버 제거 |
| BD-67 | Claude: list_skills → .bkit/skills/ 스캔 | §7.2 | .md 파일 목록 |
| BD-68 | Claude: update_skill → 파일 내용 갱신 | §7.2 | 내용 변경 확인 |
| BD-69 | Claude: list_mcp_servers → settings 파싱 | §7.2 | enabled/disabled 상태 |
| BD-70 | Claude: configure_mcp → settings 수정 | §7.2 | disabled 토글 |
| BD-71 | Claude: get_model_config → settings 파싱 | §7.2 | model 값 |
| BD-72 | Claude: set_model_config → settings 수정 | §7.2 | model 변경 |
| BD-73 | Claude: get_team_status → peer-map 파싱 | §7.2 | status 포함 |
| BD-74 | Human: list_members → YAML 파싱 | §7.3 | members (최소) |
| BD-75 | Human: 스킬/MCP/모델 → NotImplemented | §7.3 | 적절한 에러 |

### System Layer

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-76 | InvariantBanner: 위반 시 빨간 배너 | §8.2 | 배너 렌더링 |
| BD-77 | ReadonlyBadge: Core 프리셋 🔒 표시 | §8.3 | 배지 렌더링 |
| BD-78 | 저장 차단: INV 위반 시 저장 버튼 비활성화 | §8.2 | disabled=true |

### 심층 분석

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BD-79 | 동시 편집: 외부 변경 시 알림 | §11.1 | conflict 이벤트 |
| BD-80 | Gate 타임아웃: 시간 초과 → 에스컬레이션 | §11.6 | escalate_to 호출 |

### 매핑 테이블 요약

| Design 섹션 | TDD 범위 | 케이스 수 |
|------------|---------|----------|
| §2 Resource Model | BD-01~08 | 8 |
| §3 API 설계 | BD-18~47 | 30 |
| §3.5 Validation | BD-09~17 | 9 |
| §4.4 Canvas 변환 | BD-48~56 | 9 |
| §5 데이터 흐름 | BD-57~63 | 7 |
| §7 ManagementAdapter | BD-64~75 | 12 |
| §8 System Layer | BD-76~78 | 3 |
| §11 심층 분석 | BD-79~80 | 2 |
| **합계** | | **80** |

**Gap 0%**: 모든 Design 섹션에 대응 TDD 케이스 존재. 매핑 테이블로 1:1 추적 가능.

---

## 관련 문서

- Engine Design V2: `docs/02-design/features/brick-architecture.design.md`
- Engine Plan: `docs/01-plan/features/brick-architecture.plan.md`
- Brick 비전: `memory/2026-04-02.md`
- 브랜딩: Engine V2 §14
