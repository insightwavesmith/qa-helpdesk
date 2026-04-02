# Plan: Brick Dashboard Frontend (프론트엔드)

> 작성일: 2026-04-02
> 작성자: PM
> 레벨: L2-기능
> 선행: brick-dashboard.design.md (API 백엔드 완료, 308 tests)

---

## 1. 목표

기존 `dashboard/` 프로젝트(Vite + React + Express)에 **Brick 워크플로우 캔버스 에디터**를 추가한다.
브라우저에서 블록 드래그&드롭, 링크 연결, 실시간 모니터링, Gate 결과 확인, Review 블록 승인이 가능한 웹 UI.

### 1.1 비전
> "AI한텐 강제, 나한텐 자유, 시스템 안에서 AI도 자율" — Smith님

n8n처럼 직관적 캔버스 + Backstage처럼 리소스 카탈로그 + K8s Dashboard처럼 실시간 상태.

### 1.2 핵심 원칙
1. **파일이 원본** — 대시보드는 파일(YAML/JSON/MD)의 GUI 에디터. DB는 실행 이력만.
2. **CLI 등가** — CLI로 할 수 있는 모든 것을 대시보드에서도 할 수 있음.
3. **Adapter-agnostic** — Team 관리 UI는 adapter에 무관. Claude/Codex/Human 교체 가능.
4. **INV 불변 보장** — System Layer(INV-1~10) 위반 시 실시간 경고. 사용자가 깨뜨릴 수 없음.

---

## 2. 기술 스택

### 2.1 확정 (기존 + 추가)

| 영역 | 기존 dashboard/ | 추가 |
|------|----------------|------|
| 프레임워크 | React 19 + Vite 5 | - |
| 라우터 | react-router-dom 7 | - |
| 서버 상태 | TanStack React Query 5 | - |
| 실시간 | native WebSocket (useLiveUpdates) | entity 확장 (block/team/link/gate) |
| 스타일 | Tailwind CSS 3 | - |
| 아이콘 | Lucide React | - |
| DnD | @dnd-kit/core + @dnd-kit/sortable | React Flow 내부 DnD |
| **캔버스** | - | **@xyflow/react (React Flow)** |
| **자동 레이아웃** | - | **dagre** |
| **코드 에디터** | - | **@monaco-editor/react** (YAML/MD 편집) |
| **클라이언트 상태** | - | **zustand** (캔버스 상태 관리) |
| 차트 | Recharts 2 | - |
| DB | better-sqlite3 + Drizzle ORM | - |
| 서버 | Express 4 | - |
| 테스트 | Vitest + Testing Library | - |

### 2.2 왜 이 선택인가

| 결정 | 이유 |
|------|------|
| React Flow | n8n의 Vue Flow 대응. 커스텀 노드/엣지, 미니맵, 자동 레이아웃 지원. TypeScript 네이티브. |
| dagre | DAG 방향 자동 배치. React Flow 공식 예제. ELK보다 경량. |
| zustand | 캔버스 상태(노드/엣지/선택)를 React Query 서버 상태와 분리. 가벼움. |
| Monaco Editor | SKILL.md 편집, YAML preset 편집에 최적. VSCode 수준 syntax highlighting. |
| 기존 스택 유지 | dashboard/ 프로젝트가 이미 Express+Vite+React로 동작 중. 별도 앱 불필요. |

---

## 3. 페이지 구조

```
App.tsx (기존 라우터)
├── /              → DashboardPage (기존)
├── /tickets       → TicketsPage (기존)
├── /activity      → ActivityPage (기존)
├── /costs         → CostsPage (기존)
├── /org           → OrgChartPage (기존)
├── /chains        → ChainsPage (기존)
├── /agents        → AgentsPage (기존)
├── /routines      → RoutinesPage (기존)
│
├── /brick                → BrickOverviewPage (신규 — 워크플로우 목록)
├── /brick/canvas/:id     → BrickCanvasPage (신규 — React Flow 캔버스 에디터)
├── /brick/blocks         → BlockCatalogPage (신규 — BlockType CRUD)
├── /brick/teams          → TeamManagePage (신규 — Team 관리)
├── /brick/teams/:id      → TeamDetailPage (신규 — 팀원/스킬/MCP/모델)
├── /brick/presets        → PresetListPage (신규 — Preset 목록)
├── /brick/presets/:id    → PresetEditorPage (신규 — Preset YAML 편집)
├── /brick/runs           → RunHistoryPage (신규 — 실행 이력)
├── /brick/runs/:id       → RunDetailPage (신규 — 실행 상세 + 로그)
└── /brick/learning       → LearningHarnessPage (신규 — 제안/승인)
```

### 3.1 네비게이션

```
사이드바 (기존 Layout 확장)
├── 대시보드 (기존)
├── 티켓 (기존)
├── 에이전트 (기존)
├── 체인 (기존)
├── 비용 (기존)
├── ─── 구분선 ───
├── ◆ Brick (신규 섹션)
│   ├── 워크플로우
│   ├── 블록 카탈로그
│   ├── 팀 관리
│   ├── 프리셋
│   ├── 실행 이력
│   └── 학습 하네스
└── 루틴 (기존)
```

---

## 4. API 연동 매핑

### 4.1 기존 백엔드 API (Express routes 10개 그룹)

이미 구현됨: tickets, chains, costs, budgets, dashboard, notifications, pdca, hooks, agents, routines.

### 4.2 Brick 전용 API (신규 37개 — brick-dashboard.design.md §5)

프론트엔드가 연동해야 할 API:

| 그룹 | API 수 | 주요 엔드포인트 |
|------|--------|---------------|
| BlockType | 5 | CRUD + list, validate |
| Gate | 4 | result, override, retry, stats |
| Team | 6 | CRUD, members, skills, mcp, model, status |
| Link | 4 | CRUD + validate |
| Preset | 5 | CRUD + export/import, apply |
| Execution | 5 | start, pause, resume, cancel, status, logs |
| Learning | 4 | proposals, approve, reject, config |
| System | 4 | invariants, health, metrics, audit |

### 4.3 WebSocket 이벤트 (brick-dashboard.design.md §7)

| 이벤트 | 방향 | UI 반영 |
|--------|------|--------|
| block_status_changed | server→client | 캔버스 노드 색상 변경 |
| team_status_changed | server→client | 팀 상태 배지 업데이트 |
| gate_result | server→client | Gate 결과 토스트 + 노드 업데이트 |
| execution_progress | server→client | 실행 진행률 + 활성 블록 하이라이트 |
| review_requested | server→client | Review 알림 팝업 |
| learning_proposal | server→client | Learning 제안 알림 |
| preset_applied | server→client | 캔버스 노드/엣지 갱신 |

---

## 5. 컴포넌트 계층

### 5.1 캔버스 영역

```
BrickCanvasPage
├── CanvasToolbar (상단 — 실행/일시정지/중지, 줌, 레이아웃, 저장)
├── BlockSidebar (좌측 — 블록 타입 드래그 팔레트)
├── ReactFlowCanvas (중앙)
│   ├── BlockNode (커스텀 노드 — 9종 + custom)
│   │   ├── NodeHeader (타입 아이콘 + 이름)
│   │   ├── NodeStatus (상태 배지)
│   │   ├── NodeHandles (입출력 핸들)
│   │   └── GateIndicator (Gate 결과 표시)
│   ├── ReviewNode (리뷰 블록 전용 노드)
│   │   ├── ReviewerAvatars
│   │   ├── ChecklistProgress
│   │   └── ApproveRejectButtons
│   ├── LinkEdge (커스텀 엣지)
│   │   ├── EdgeLabel (타입 표시)
│   │   └── EdgeAnimation (실행 중 애니메이션)
│   ├── MiniMap
│   ├── Controls
│   └── Background
├── DetailPanel (우측 — 선택된 노드/엣지 상세)
│   ├── BlockDetailPanel (블록 설정)
│   ├── LinkDetailPanel (링크 조건 설정)
│   ├── GateConfigPanel (Gate 5종 설정)
│   └── TeamAssignPanel (팀 배정)
└── ExecutionTimeline (하단 — 실행 로그 타임라인)
```

### 5.2 리소스 관리 영역

```
BlockCatalogPage
├── BlockTypeGrid (카드 그리드)
├── BlockTypeForm (생성/편집 모달)
└── GateConfigEditor (Gate 5종 설정 UI)

TeamManagePage
├── TeamList (팀 목록 카드)
└── TeamDetailPage
    ├── TeamMemberList (팀원 추가/제거)
    ├── SkillEditor (Monaco — SKILL.md 편집)
    ├── McpServerList (MCP 도구 토글)
    ├── ModelSelector (LLM 모델 선택)
    └── AdapterSelector (adapter 교체)

PresetListPage
├── PresetGrid (프리셋 카드)
└── PresetEditorPage
    ├── PresetYamlEditor (Monaco — YAML 편집)
    └── PresetPreview (React Flow 미니 캔버스 미리보기)

LearningHarnessPage
├── ProposalList (제안 목록)
├── ProposalDetail (제안 상세 + diff)
└── ApproveRejectForm (승인/거부 + 코멘트)
```

---

## 6. 구현 단계 (Phase)

### Phase 1: 기반 구축 (1주차)

**목표**: React Flow 통합 + 빈 캔버스 + 라우팅 + 기본 노드 렌더링

1. `@xyflow/react`, `dagre`, `zustand`, `@monaco-editor/react` 설치
2. BrickCanvasPage + BrickOverviewPage 라우트 추가
3. 사이드바에 Brick 섹션 추가
4. 기본 BlockNode 커스텀 노드 (9종 아이콘 + 이름)
5. 기본 LinkEdge 커스텀 엣지 (6종 타입 라벨)
6. dagre 자동 레이아웃
7. BlockSidebar 드래그 팔레트
8. MiniMap + Controls + Background

### Phase 2: 리소스 CRUD (2주차)

**목표**: BlockType/Team/Preset CRUD UI + API 연동

1. BlockCatalogPage — 블록 타입 목록/생성/편집/삭제
2. TeamManagePage — 팀 목록/생성/삭제
3. TeamDetailPage — 팀원 관리 + 스킬 편집 (Monaco)
4. McpServerList + ModelSelector + AdapterSelector
5. PresetListPage + PresetEditorPage (Monaco YAML)
6. API hooks (useQuery/useMutation) 37개 엔드포인트 연동

### Phase 3: 캔버스 인터랙션 (3주차)

**목표**: 완전한 캔버스 에디터 + Gate 설정 + 상세 패널

1. DetailPanel — 선택 노드/엣지 상세 편집
2. GateConfigPanel — Gate 5종 설정 UI (command/http/prompt/agent/review)
3. 노드 연결 시 Link 타입 선택 + 조건 설정
4. 연결 유효성 검증 (isValidConnection — DAG 순환 방지, INV 체크)
5. 캔버스 저장 → YAML 파일 쓰기 API 호출
6. 캔버스 로드 → YAML 파일 읽기 → 노드/엣지 변환
7. Undo/Redo (zustand middleware)

### Phase 4: 실시간 모니터링 (4주차)

**목표**: WebSocket 실시간 + 실행 제어 + 상태 시각화

1. useLiveUpdates 확장 — block/team/link/gate/execution 엔티티
2. 블록 상태별 노드 색상 변경 (idle=회색, running=파랑, done=초록, error=빨강)
3. 실행 중 활성 블록 하이라이트 + 링크 애니메이션
4. CanvasToolbar — 실행/일시정지/재개/중지 버튼
5. ExecutionTimeline — 하단 로그 타임라인
6. Gate 결과 토스트 알림

### Phase 5: Review + Learning + 마무리 (5주차)

**목표**: Review 블록 전용 UX + Learning Harness + System Layer

1. ReviewNode — 체크리스트, diff 뷰, 코멘트, 승인/거부
2. 리뷰어 아바타 표시 + 캔버스 노드에 진행률 바
3. LearningHarnessPage — 제안 목록, 상세, 승인/거부
4. System Layer 경고 — INV 위반 시 빨간 테두리 + 경고 배너
5. Core 프리셋 readonly 표시
6. RunHistoryPage + RunDetailPage
7. 반응형 레이아웃 + 접근성 (키보드, aria)

---

## 7. 비기능 요구사항

| 항목 | 기준 |
|------|------|
| 노드 100개 캔버스 렌더링 | < 100ms FCP |
| WebSocket 재연결 | 3초 내 자동 재연결 (기존 패턴) |
| 캔버스 저장 | YAML 직렬화 < 50ms |
| 접근성 | 키보드 노드 선택/이동, aria-label |
| 번들 크기 | React Flow + Monaco 코드 분할 (lazy import) |
| 테스트 커버리지 | TDD 기준 — Design 매핑 100% |

---

## 8. 위험 요소

| 위험 | 대응 |
|------|------|
| React Flow + Monaco 번들 크기 | React.lazy + Suspense 코드 분할 |
| 100+ 노드 성능 | memo() + useCallback + 가상화 |
| YAML ↔ React Flow 양방향 변환 | 별도 serializer 모듈, 단위 테스트 집중 |
| Gate 5종 UI 복잡도 | 플러그인 패턴 (config_schema → DynamicConfigForm) |
| WebSocket 메시지 폭주 | throttle + batch update (requestAnimationFrame) |

---

## 9. 산출물

| # | 산출물 | 경로 |
|---|--------|------|
| 1 | 이 Plan 문서 | docs/01-plan/features/brick-dashboard-frontend.plan.md |
| 2 | Design 문서 (TDD 포함) | docs/02-design/features/brick-dashboard-frontend.design.md |
| 3 | 프론트엔드 코드 | dashboard/src/pages/brick/, dashboard/src/components/brick/ |
| 4 | 테스트 | dashboard/__tests__/brick/ |

---

## 10. 관련 문서

- Dashboard API Design: `docs/02-design/features/brick-dashboard.design.md`
- Engine Design V2: `docs/02-design/features/brick-architecture.design.md`
- Engine Plan: `docs/01-plan/features/brick-architecture.plan.md`
- Brick 비전: `memory/2026-04-02.md`
