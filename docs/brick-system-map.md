# Brick System Map — 전체 구조 현황

> **작성**: PM | 2026-04-03
> **범위**: Engine(Python) + Backend API(TypeScript) + Frontend(React) + Design 10건
> **목적**: 전 모듈 역할, 연결 상태, 미완성 부분 일목요연 정리

---

## 1. 아키텍처 개요

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Brick System V2                              │
│                                                                     │
│  ┌──────────────┐   ┌──────────────────┐   ┌──────────────────┐    │
│  │  Python CLI  │   │  TypeScript API  │   │  React Frontend  │    │
│  │  brick/      │   │  dashboard/      │   │  dashboard/src/  │    │
│  │              │   │  server/         │   │                  │    │
│  │  - Engine    │   │  - Express 4     │   │  - React Flow    │    │
│  │  - Gates     │   │  - Drizzle ORM   │   │  - TanStack Q.   │    │
│  │  - Adapters  │   │  - SQLite        │   │  - Zustand       │    │
│  │  - Links     │   │  - WebSocket     │   │  - WebSocket     │    │
│  │  - Dashboard │   │                  │   │                  │    │
│  │    (FastAPI)  │   │                  │   │                  │    │
│  └──────┬───────┘   └────────┬─────────┘   └────────┬─────────┘    │
│         │                    │                       │              │
│         │  .bkit/ YAML       │  SQLite DB            │  HTTP/WS    │
│         │  (Source of Truth)  │  (캐시+실행이력)       │  (/api/brick)│
│         │                    │                       │              │
│  ┌──────┴────────────────────┴───────────────────────┴──────────┐   │
│  │                    .bkit/ 파일 시스템                          │   │
│  │  presets/*.yaml  |  teams/*.yaml  |  runtime/workflows/      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

**이중 런타임 구조**: Python CLI(`brick` 명령) + TypeScript API(`dashboard/server`)가 공존.
- Python: 엔진 코어(StateMachine, Executor, Gates, Adapters) + FastAPI 대시보드 서버
- TypeScript: 프론트엔드가 직접 사용하는 REST API + WebSocket + DB

---

## 2. Python 엔진 (`brick/brick/`)

### 2.1 모듈 구성

| 디렉토리 | 파일 수 | 라인 수 | 역할 |
|----------|--------|--------|------|
| `engine/` | 8 | ~870 | 워크플로우 실행 코어 |
| `models/` | 6 | ~460 | 데이터 모델 |
| `adapters/` | 8 | ~665 | 팀 어댑터 (Claude/Human/Webhook 등) |
| `gates/` | 10 | ~630 | 게이트 검증기 (command/http/prompt/agent) |
| `links/` | 7 | ~170 | 링크 핸들러 (sequential/parallel/loop 등) |
| `dashboard/` | 18 | ~1,600 | FastAPI 대시보드 서버 |
| `tests/` | 29 | ~7,340 | 테스트 374건 |
| `cli.py` | 1 | 219 | Click CLI 진입점 |
| **합계** | **87** | **~11,950** | |

### 2.2 Engine 상세

| 파일 | 클래스/함수 | 상태 | 핵심 |
|------|-----------|------|------|
| `state_machine.py` (204줄) | `StateMachine.transition()` | 완성 | 순수 함수. (상태,이벤트)→(다음상태,명령). side-effect 0 |
| `executor.py` (301줄) | `PresetLoader`, `WorkflowExecutor` | 완성 | YAML 로드→인스턴스 생성→블록 실행→Gate 검증 |
| `event_bus.py` (38줄) | `EventBus.publish/subscribe` | 완성 | 이벤트 발행/구독. 와일드카드 `*` 지원 |
| `checkpoint.py` (77줄) | `CheckpointStore.save/load` | 완성 | 원자적 쓰기(tmp→rename). state.json + events.jsonl |
| `task_queue.py` (41줄) | `TaskQueue.enqueue/dequeue` | 완성 | 파일 기반 우선순위 큐 |
| `validator.py` (95줄) | `Validator.validate_workflow` | 완성 | INV-1~8 검증 + DAG 순환 검사 |
| `condition_evaluator.py` (94줄) | `evaluate_condition()` | 완성 | 문자열/dict 조건 평가. 6가지 비교 연산자 |
| `learning.py` (153줄) | `LearningCollector`, `PatternAnalyzer`, `RuleSuggester` | 완성 | 반복 실패 패턴 감지→규칙 제안→승인/거부/롤백 |
| `lifecycle.py` (64줄) | `TeammateLifecycleManager` | 부분 | `_notify_leader()` 스텁 |

### 2.3 Models 상세

| 파일 | 주요 모델 | 상태 |
|------|----------|------|
| `events.py` (63줄) | `WorkflowStatus`(5), `BlockStatus`(7), `Event`, `Command`, `StartBlockCommand`, `CheckGateCommand`, `EmitEventCommand`, `SaveCheckpointCommand` | 완성 |
| `block.py` (70줄) | `Block`, `DoneCondition`, `GateConfig`, `GateHandler`, `ReviewConfig`, `InputConfig` | 완성 |
| `workflow.py` (236줄) | `WorkflowDefinition`, `WorkflowInstance`, `BlockInstance` + 직렬화(to_dict/from_dict) | 완성 |
| `link.py` (26줄) | `LinkDefinition`(11필드), `LinkDecision` | 완성 |
| `team.py` (54줄) | `TeamDefinition`, `TeammateSpec`, `IdlePolicy`, `CommunicationConfig`, `AdapterStatus` | 완성 |
| `gate.py` (13줄) | `GateResult(passed, detail, type, confidence, metadata, metrics)` | 완성 |

### 2.4 Adapters 상세

| 파일 | 어댑터 | 상태 | 비고 |
|------|-------|------|------|
| `base.py` (39줄) | `TeamAdapter` (ABC) | 완성 | start_block/check_status/get_artifacts/cancel/send_signal/get_logs |
| `claude_agent_teams.py` (284줄) | `ClaudeAgentTeamsAdapter` | **완성** | MCP+tmux 이중 전달, 팀원 suspend/terminate/resume |
| `mcp_bridge.py` (111줄) | `MCPBridge` | **완성** | 3단계 peer 탐색(캐시→파일→broker), ACK 대기 |
| `claude_code.py` (37줄) | `SingleClaudeCodeAdapter` | **부분** | check_status 항상 "running", 프로세스 추적 없음 |
| `human.py` (40줄) | `HumanAdapter` | 완성 | 파일 마커 기반 완료 감지 |
| `webhook.py` (64줄) | `WebhookAdapter` | 대부분 | get_artifacts 스텁 |
| `codex.py` (26줄) | `CodexAdapter` | **스텁** | 전 메서드 NotImplementedError ("Phase 2") |
| `management.py` (53줄) | `TeamManagementAdapter` (ABC) | 완성 | 팀 관리 인터페이스 정의 |
| `human_management.py` (55줄) | `HumanManagementAdapter` | **부분** | list_members만 구현, 나머지 NotImplementedError |

### 2.5 Gates 상세

| 파일 | 게이트 | 상태 |
|------|-------|------|
| `base.py` (83줄) | `GateExecutor` — sequential/parallel/vote 평가 모드 | 완성 (구체 구현은 concrete.py) |
| `concrete.py` (314줄) | `ConcreteGateExecutor` — command/http/prompt/agent/review 전부 구현 | **완성** |
| `artifact_exists.py` (21줄) | 파일 존재 확인 | 완성 |
| `match_rate.py` (19줄) | 매치율 비교 | 완성 |
| `tsc_pass.py` (24줄) | `npx tsc --noEmit --quiet` | 완성 |
| `build_pass.py` (27줄) | `npm run build` | 완성 |
| `deploy_health.py` (30줄) | HTTP GET 헬스체크 | 완성 |
| `http_check.py` (31줄) | 범용 HTTP GET | 완성 |
| `prompt_eval.py` (50줄) | LLM 프롬프트 평가 (다수결 + 신뢰도) | 완성 (외부 llm_client 필요) |
| `agent_eval.py` (34줄) | 서브에이전트 평가 | 완성 (외부 agent_runner 필요) |

### 2.6 Links 상세

| 파일 | 링크 타입 | 상태 |
|------|----------|------|
| `base.py` (17줄) | `LinkHandler` (ABC) | 완성 |
| `sequential.py` (22줄) | 순차 (항상 진행) | 완성 |
| `parallel.py` (25줄) | 병렬 (merge_strategy: all/any/n_of_m) | 완성 |
| `compete.py` (23줄) | 경쟁 (judge 미구현) | 대부분 |
| `loop.py` (32줄) | 반복 (condition + max_retries) | 완성 |
| `branch.py` (27줄) | 분기 (branches 리스트 매칭) | 완성 |
| `cron.py` (26줄) | 크론 (문법 검증만, 실제 스케줄링 없음) | **부분** |

### 2.7 Dashboard (FastAPI Python)

| 파일 | 역할 | 상태 |
|------|------|------|
| `server.py` (36줄) | FastAPI 앱 생성 + 라우트 등록 | 완성 |
| `file_store.py` (175줄) | .bkit/ 파일 CRUD, built-in/user 분리, readonly 보호 | 완성 (watch는 스텁) |
| `validation_pipeline.py` (265줄) | 6개 Validator 체인 (Invariant/Schema/DAG/Reference/Readonly/AdapterCompat) | 완성 |
| `event_bridge.py` (135줄) | WebSocket 클라이언트 관리 + 이벤트 브로드캐스트 + 재연결 | 완성 |
| `converters.py` (171줄) | PresetYAML↔CanvasState 변환 + dagre 레이아웃 | 완성 |
| `review_block.py` (220줄) | 리뷰 상태 관리 (체크리스트, 코멘트, 승인/거부) | 완성 (인메모리) |
| `conflict_detector.py` (53줄) | 파일 버전 충돌 감지 + Gate 타임아웃 | 완성 |
| `plugin_manager.py` (199줄) | entry_points 기반 플러그인 탐색 + config 검증 | 완성 |
| `system_layer.py` (44줄) | INV 배너, readonly 배지, 저장 가능 여부 | 완성 |
| `webhook_handler.py` (16줄) | Slack 승인 payload 파싱 | 최소 |
| `learning/pattern_detector.py` (104줄) | 반복 실패 패턴 감지 + 규칙 제안 | 완성 |
| `learning/rule_applicator.py` (84줄) | 승인된 규칙 → YAML 패치 적용 | 완성 |
| `routes/` (8개 모듈, ~800줄) | block_types/teams/presets/workflows/validation/type_catalog/resources/learning | 전부 완성 |
| `models/resource.py` (34줄) | BrickResource, ValidationError, ValidationResult | 완성 |
| `models/canvas.py` (34줄) | CanvasNode, CanvasEdge, CanvasState | 완성 |

### 2.8 CLI (`cli.py`)

| 명령 | 상태 | 비고 |
|------|------|------|
| `brick init` | 완성 | .bkit/ 구조 생성 + built-in 프리셋 복사 |
| `brick start` | 완성 | PresetLoader → WorkflowExecutor.start() |
| `brick status` | 완성 | checkpoint에서 상태 로드 |
| `brick complete` | 완성 | executor.complete_block() |
| `brick validate` | 완성 | Validator 실행 |
| `brick viz` | 완성 | ASCII 워크플로우 시각화 |
| `brick serve` | 완성 | FastAPI uvicorn 서버 |
| `brick approve` | **스텁** | 메시지 출력만 |
| `brick gate` | **스텁** | 메시지 출력만 |
| `brick approve-rule` | 완성 | RuleSuggester.approve() |

### 2.9 테스트

| 파일 | 라인 | 테스트 수 | 커버리지 대상 |
|------|-----|----------|-------------|
| `test_state_machine.py` | 116 | 7 | StateMachine 전이 |
| `test_event_bus.py` | 97 | 6 | publish/subscribe |
| `test_checkpoint.py` | 95 | 6 | save/load/events.jsonl |
| `test_task_queue.py` | 66 | 4 | enqueue/dequeue |
| `test_validator.py` | 215 | 13 | INV-1~8 + DAG |
| `test_executor.py` | 203 | 4 | start/complete/resume |
| `test_blocks.py` | 31 | 4 | Block 모델 |
| `test_gates.py` | 294 | 6 | Gate 핸들러 5종 |
| `test_links.py` | 213 | 17 | Link 핸들러 6종 |
| `test_adapters.py` | 165 | 2 | 어댑터 기본 |
| `test_team_adapter.py` | 556 | 30 | ClaudeAgentTeams 관리 |
| `test_cli.py` | 137 | 8 | CLI 명령 |
| `test_integration.py` | 131 | 4 | 통합 시나리오 |
| `test_e2e.py` | 176 | 3 | E2E |
| `test_learning.py` | 144 | 9 | Learning 수집/분석/제안 |
| `test_dashboard_api.py` | 435 | 30 | FastAPI REST |
| `test_dashboard_converters.py` | 180 | 9 | 변환기 |
| `test_dashboard_filestore.py` | 227 | 11 | FileStore |
| `test_dashboard_gaps.py` | 232 | 17 | Gap 분석 |
| `test_dashboard_validation.py` | 266 | 11 | ValidationPipeline |
| `test_dashboard_phase3a.py` | 871 | 38 | 대시보드 Phase 3 |
| `test_dashboard_phase3b.py` | 183 | 9 | Phase 3 추가 |
| `test_dashboard_phase4.py` | 249 | 12 | Phase 4 |
| `test_dashboard_phase5a.py` | 549 | 23 | EventBridge/Learning |
| `test_dashboard_phase5b.py` | 179 | 10 | Phase 5 추가 |
| `engine/test_state_sync.py` | 505 | 20 | 상태 동기화 버그 |
| `engine/test_spec_wrapper.py` | 298 | 12 | spec wrapper 버그 |
| `engine/test_loop_exit.py` | 444 | 30 | loop 탈출 조건 |
| **합계** | **7,343** | **~374** | |

---

## 3. TypeScript 백엔드 API (`dashboard/server/`)

### 3.1 DB 스키마 (8 테이블)

| 테이블 | 주요 컬럼 | 역할 |
|--------|----------|------|
| `brick_block_types` | name, displayName, icon, color, category, isCore, thinkLogRequired | 블록 타입 카탈로그 (10종 seed) |
| `brick_teams` | name, adapter, adapterConfig, members(json), skills(json), mcpServers(json), maxDepth | 팀 정의 (3팀 seed) |
| `brick_presets` | name, yaml(전체 YAML), isCore, labels(json) | 프리셋 정의 (4개 seed) |
| `brick_links` | workflowId(FK→presets), fromBlock, toBlock, linkType, condition | 링크 인스턴스 (UNIQUE idx) |
| `brick_executions` | presetId(FK→presets), feature, status, currentBlock, blocksState(json) | 실행 인스턴스 |
| `brick_execution_logs` | executionId(FK→executions), eventType, blockId, data(json) | 실행 이벤트 로그 |
| `brick_gate_results` | executionId(FK→executions), blockId, handlerType, passed, detail(json) | 게이트 결과 |
| `brick_learning_proposals` | axis, title, pattern(json), confidence, diff, status | 학습 제안 |

### 3.2 API 엔드포인트 (43개)

| 모듈 | 엔드포인트 수 | 경로 | 상태 |
|------|-------------|------|------|
| `block-types.ts` | 4 | GET/POST/PUT/DELETE `/api/brick/block-types` | **완성** |
| `teams.ts` | 10 | CRUD + members/skills/mcp/model/status | **완성** |
| `presets.ts` | 8 | CRUD + export/import/apply | **완성** |
| `executions.ts` | 5 | start/pause/status/logs/block-complete | **완성** |
| `workflows.ts` | 2 | resume/cancel | **완성** |
| `links.ts` | 5 | link-types + CRUD + DAG 검증 | **완성** |
| `gates.ts` | 2 | result 조회 + override | **완성** |
| `review.ts` | 2 | approve/reject | **완성** |
| `learning.ts` | 3 | proposals 조회 + approve/reject | **완성** |
| `notify.ts` | 1 | test (스텁) | **스텁** |
| `system.ts` | 1 | invariants (스텁) | **스텁** |
| `websocket.ts` | - | /api/brick/ws | **부분** (인바운드 메시지 미처리) |

### 3.3 Seed 데이터

- **블록 타입 10종**: plan, design, implement, test, review, deploy, monitor, rollback, custom, notify
- **팀 3개**: pm-team(기획), cto-team(개발), coo-team(운영)
- **프리셋 4개**: t-pdca-l0~l3 (`.bkit/presets/*.yaml`에서 로드)

### 3.4 실행 엔진 (`dashboard/server/brick/engine/executor.ts`, 139줄)

| 함수 | 역할 |
|------|------|
| `emitThinkLog(db, ctx, thought, optionsConsidered)` | HP-001: 판단 로그 항상 저장 |
| `startBlock(db, executionId, blockId, blockType, feature)` | 블록 시작 이벤트 + ThinkLog |
| `completeBlock(db, executionId, blockId, result?)` | 블록 완료 이벤트 |
| `validateThinkLogGate(db, executionId, blockId)` | ThinkLog 존재 검증 |
| `isThinkLogRequired(db, blockTypeName)` | 블록 타입별 ThinkLog 필수 여부 |

---

## 4. React 프론트엔드 (`dashboard/src/`)

### 4.1 페이지 (10개)

| 페이지 | 라인 | API 사용 | 상태 |
|--------|-----|---------|------|
| `BrickCanvasPage.tsx` | 490 | presets GET/PUT, executions POST/GET, logs GET | **기능** (presetId 하드코딩, 레이아웃 미연결) |
| `BrickOverviewPage.tsx` | 71 | 없음 (prop 주입) | **셸** |
| `BlockCatalogPage.tsx` | 84 | blockTypes GET/POST | **기능** (수정/삭제 UI 없음) |
| `TeamManagePage.tsx` | 21 | teams GET | **읽기전용** |
| `TeamDetailPage.tsx` | 105 | teams sub-resources 6개 | **기능** (MCP 목록 하드코딩) |
| `PresetListPage.tsx` | 38 | presets GET/POST | **기능** (편집/삭제 미연결) |
| `PresetEditorPage.tsx` | 30 | 없음 | **스텁** (저장 버튼 핸들러 없음) |
| `RunHistoryPage.tsx` | 64 | 없음 (내부 placeholder) | **스텁** |
| `RunDetailPage.tsx` | 73 | executions GET, logs GET | **기능** |
| `LearningHarnessPage.tsx` | 71 | 없음 (prop 주입) | **셸** |

### 4.2 Hooks (9개)

| Hook | 엔드포인트 수 | 상태 | 페이지 연결 |
|------|-------------|------|-----------|
| `useBlockTypes.ts` | 4 (CRUD) | 완성 | BlockCatalogPage |
| `useTeams.ts` | 10 (CRUD+sub) | 완성 | TeamManagePage, TeamDetailPage |
| `usePresets.ts` | 5 (CRUD+export/import/apply) | 완성 | PresetListPage |
| `useExecutions.ts` | 6 (lifecycle+polling) | 완성 | BrickCanvasPage, RunDetailPage |
| `useLinks.ts` | 5 (CRUD) | 완성 | **미사용** (캔버스가 로컬 state로 관리) |
| `useLearning.ts` | 3 (proposals+approve/reject) | 완성 | **미연결** (LearningHarnessPage가 prop 주입 셸) |
| `useGates.ts` | 2 (result+override) | 완성 | **미연결** |
| `useSystem.ts` | 1 (invariants) | 완성 | **미연결** |
| `useBrickLiveUpdates.ts` | WebSocket | 완성 | **미연결** (마운트 안 됨) |

### 4.3 컴포넌트 (27개)

#### 노드 (5종)
| 컴포넌트 | 라인 | 핵심 |
|---------|------|------|
| `BlockNode.tsx` | 112 | 10가지 블록 타입, 카테고리 배경색, 팀 라벨, 게이트 도트 |
| `ReviewNode.tsx` | 109 | 보라 테두리, 리뷰어 아바타, 체크리스트 진행률 |
| `NotifyNode.tsx` | 115 | 채널 아이콘, 이벤트 체크마크, 마지막 발송 결과 |
| `StartNode.tsx` | 19 | 초록 원형, source 핸들만 |
| `EndNode.tsx` | 19 | 빨강 원형, target 핸들만 |

#### 엣지 (1종)
| 컴포넌트 | 라인 | 핵심 |
|---------|------|------|
| `LinkEdge.tsx` | 142 | 6가지 링크 타입별 스타일 (색상/점선/라벨). 활성 시 dash 애니메이션 |

#### 패널 (7종)
| 컴포넌트 | 라인 | 핵심 |
|---------|------|------|
| `DetailPanel.tsx` | 51 | 선택 노드/엣지에 따라 하위 패널 라우팅 |
| `BlockDetailPanel.tsx` | 65 | 이름 편집 + 팀 드롭다운 + GateConfigPanel |
| `LinkDetailPanel.tsx` | 64 | 링크 타입 select + condition 입력 |
| `GateConfigPanel.tsx` | 318 | 5가지 게이트 타입 하위 폼 (command/http/prompt/agent/review) |
| `ReviewDetailPanel.tsx` | 232 | 체크리스트, diff 뷰, 코멘트, 승인/거부 버튼 |
| `NotifyConfigPanel.tsx` | 246 | 4채널 설정 (slack/telegram/discord/webhook) + 테스트 발송 |
| `EmptyDetailPanel.tsx` | 7 | "선택하세요" 메시지 |

#### 기타
| 컴포넌트 | 라인 | 핵심 |
|---------|------|------|
| `BlockSidebar.tsx` | 33 | 10종 블록 드래그 팔레트 |
| `CanvasToolbar.tsx` | 141 | 실행/정지/재개/중지 + 레이아웃 + 저장 |
| `ExecutionTimeline.tsx` | 66 | 가로 스크롤 타임라인, 상태 아이콘+색상 |
| `ExecuteDialog.tsx` | 43 | feature 이름 입력 (regex 검증) |
| `team/TeamMemberList.tsx` | 71 | 멤버 목록 + 추가/삭제 |
| `team/SkillEditor.tsx` | 34 | Monaco 에디터 (markdown) |
| `team/McpServerList.tsx` | 31 | 토글 체크박스 목록 |
| `team/ModelSelector.tsx` | 35 | 4개 모델 라디오 버튼 |
| `team/AdapterSelector.tsx` | 30 | 4개 어댑터 드롭다운 (**미사용**) |
| `learning/ProposalDetail.tsx` | 35 | before/after diff + reasoning |
| `learning/ApproveRejectForm.tsx` | 57 | 승인 코멘트 + 거부 사유 폼 |

### 4.4 Lib (6개)

| 파일 | 라인 | 역할 | 상태 |
|------|-----|------|------|
| `serializer.ts` | 183 | yamlToFlow / flowToYaml / flowToYamlFull | 완성 |
| `canvas-store.ts` | 103 | Zustand + zundo undo/redo (50단계) | **미연결** (캔버스가 useNodesState 직접 사용) |
| `connection-validator.ts` | 54 | INV-1(순환)/INV-2(자기참조)/INV-3(중복) | 완성 |
| `layout.ts` | 55 | dagre 자동 레이아웃 (TB/LR) | **미연결** (레이아웃 버튼 핸들러 없음) |
| `channel-adapter.ts` | 17 | 알림 채널 메타데이터 | 완성 |
| `ws-throttle.ts` | 33 | RAF 기반 WebSocket 이벤트 배치 | 완성 (useBrickLiveUpdates에서 사용) |

---

## 5. Design 문서 (10건)

### 5.1 문서 목록

| # | 문서 | 레벨 | TDD | 구현 상태 |
|---|------|-----|-----|----------|
| 1 | `brick-architecture.design.md` | L3 | 100건 (BK) | 설계 완료, 구현 완료 |
| 2 | `brick-dashboard.design.md` | L3 | 150건 | 설계 완료, Python→TS 전환 (원본) |
| 3 | `brick-backend-api.design.md` | L2 | 65건 (BA) | 설계 완료, **구현 완료** |
| 4 | `brick-dashboard-frontend.design.md` | L2 | 151건 (BF) | 설계 완료, **부분 구현** |
| 5 | `brick-pdca-preset.design.md` | L2 | 35건 (BP) | 설계 완료, YAML+seed 구현 |
| 6 | `brick-cli-state-sync.design.md` | L2 | 20건 (BS) | 설계 완료, **구현 완료** |
| 7 | `brick-team-adapter.design.md` | L2 | 30건 (TA) | 설계 완료, **구현 완료** |
| 8 | `brick-spec-wrapper.design.md` | L1 | 12건 (SW) | 설계 완료, **구현 완료** |
| 9 | `brick-loop-exit.design.md` | L2 | 30건 (LE) | 설계 완료, **구현 완료** |
| 10 | `brick-canvas-save.design.md` | L2 | 35건 (CS) | 설계 완료, **미구현** |

**TDD 합계: 628건**

### 5.2 설계 간 참조 관계

```
brick-architecture (L3, 모든 설계의 기반)
├── brick-dashboard (L3, 원본 통합 설계 — Python/FastAPI)
│   ├── brick-backend-api (L2, TypeScript/Express로 재구현)
│   │   └── brick-dashboard-frontend (L2, 프론트 hooks ↔ API 매핑)
│   │       └── brick-canvas-save (L2, 캔버스 저장→실행 파이프)
│   └── brick-pdca-preset (L2, YAML 프리셋 구현)
│       ├── brick-spec-wrapper (L1, YAML 파싱 버그)
│       └── brick-loop-exit (L2, 링크 조건 평가 버그)
├── brick-cli-state-sync (L2, executor 이벤트 계약 버그)
└── brick-team-adapter (L2, MCP 기반 TASK 전달)
```

---

## 6. 연결 상태: 무엇이 연결되고 무엇이 끊어져 있나

### 6.1 정상 연결 (작동 중)

| 연결 | 경로 | 상태 |
|------|------|------|
| 캔버스 → 프리셋 로드 | GET /api/brick/presets/:id → yamlToFlow → ReactFlow | OK |
| 캔버스 → 프리셋 저장 | flowToYaml → PUT /api/brick/presets/:id | OK |
| 캔버스 → 링크 연결 | onConnect → validateConnection → 링크 타입 다이얼로그 | OK |
| 블록 카탈로그 CRUD | useBlockTypes ↔ /api/brick/block-types | OK |
| 팀 관리 CRUD | useTeams ↔ /api/brick/teams + sub-resources | OK |
| 프리셋 목록 | usePresets ↔ /api/brick/presets | OK |
| 실행 시작 | POST /api/brick/executions | OK |
| 실행 상태 폴링 | useExecutionStatus → GET /api/brick/executions/:id (3초) | OK |
| 실행 로그 폴링 | useExecutionLogs → GET /api/brick/executions/:id/logs (5초) | OK |
| Python CLI → Engine | `brick start` → PresetLoader → WorkflowExecutor | OK |
| Engine → Checkpoint | state.json + events.jsonl 원자적 쓰기 | OK |

### 6.2 끊어진 연결 (미연결)

| 연결 | 문제 | 관련 Design |
|------|------|------------|
| **캔버스 ↔ 실행 상태** | blocksState 폴링 결과가 노드 status에 반영 안 됨 | brick-canvas-save (CS-015~020) |
| **캔버스 ↔ 타임라인** | 로그 폴링 결과가 ExecutionTimeline에 연결 안 됨 | brick-canvas-save (CS-021~022) |
| **캔버스 ↔ CanvasToolbar** | 인라인 버튼 사용 중, CanvasToolbar 컴포넌트 미사용 | brick-canvas-save (G-1) |
| **캔버스 presetId** | `'default'` 하드코딩, URL params 미사용 | brick-canvas-save |
| **useLinks ↔ 캔버스** | DB 링크 CRUD hooks 존재하지만 캔버스가 로컬 state로만 관리 | brick-backend-api |
| **useBrickLiveUpdates** | WebSocket hook 존재하지만 어떤 페이지에도 마운트 안 됨 | brick-dashboard-frontend |
| **useGates / useSystem** | hooks 존재하지만 어떤 페이지에도 연결 안 됨 | - |
| **useLearning ↔ LearningHarnessPage** | 페이지가 prop 주입 셸, hooks 미연결 | - |
| **레이아웃 버튼** | CanvasToolbar에 세로/가로/자동정렬 있지만 핸들러 없음 | - |
| **useCanvasStore** | Zustand store 정의됐지만 캔버스가 useNodesState 직접 사용 | - |
| **validationErrors 배너** | state 존재하지만 값을 채우는 코드 경로 없음 (죽은 UI) | - |
| **Python ↔ TypeScript** | 두 런타임 간 직접 통신 없음. 같은 .bkit/ 파일 참조할 뿐 | - |

### 6.3 이중 구현 (동일 로직 두 곳)

| 로직 | Python | TypeScript | 동기화 위험 |
|------|--------|-----------|-----------|
| spec wrapper 해제 | `executor.py._parse_preset()` | `executions.ts POST` | **높음** |
| YAML 파싱 | `yaml.safe_load` | `js-yaml` OR `yaml` (두 패키지 혼용) | 중간 |
| DAG 순환 검증 | `validator.py.validate_dag()` | `links.ts` POST 핸들러 | 중간 |
| 블록 상태 매핑 | `BlockStatus` enum (7종) | `BlockStatus` type (7종, 이름 다름) | 낮음 |
| 프리셋 변환 | `converters.py` (PresetToCanvas) | `serializer.ts` (yamlToFlow) | 중간 |

---

## 7. 미완성 부분 종합

### 7.1 스텁/부분 구현

| 모듈 | 항목 | 상태 |
|------|------|------|
| Python `CodexAdapter` | 전 메서드 NotImplementedError | Phase 2 예정 |
| Python `SingleClaudeCodeAdapter.check_status` | 항상 "running" | 프로세스 추적 미구현 |
| Python `CronLink` | 문법 검증만, 실제 스케줄링 없음 | 시간 기반 트리거 미구현 |
| Python `cli.approve` / `cli.gate` | 메시지 출력만 | Gate 승인 CLI 미구현 |
| TS `notify.ts` | 성공 반환만 | 실제 알림 발송 없음 |
| TS `system.ts` | 전부 `'ok'` 고정 | 실제 INV 검증 없음 |
| TS WebSocket | 아웃바운드만 | 인바운드 메시지 처리 없음 |
| React `PresetEditorPage` | 저장 핸들러 없음 | YAML 에디터 셸 |
| React `RunHistoryPage` | placeholder hook | 실행 이력 데이터 미연결 |
| React `BrickOverviewPage` / `LearningHarnessPage` | prop 주입 셸 | hooks 미연결 |

### 7.2 알려진 충돌/불일치

| # | 충돌 | 영향 |
|---|------|------|
| 1 | **API 경로**: brick-dashboard(원본)는 `/api/v1/*`, 구현은 `/api/brick/*` | brick-dashboard-frontend의 일부 매핑 테이블에 `/api/v1/*` 잔존 |
| 2 | **executor.py 이중 수정**: brick-cli-state-sync(block.completed 이벤트) + brick-loop-exit(metrics→context) | 같은 `complete_block()` 메서드에 두 설계가 적용 — 단일 PR 필수 |
| 3 | **Python FastAPI vs TypeScript Express**: 같은 시스템의 대시보드 서버가 두 언어로 존재 | 최종 운영 런타임 결정 필요 |
| 4 | **YAML 파서 혼용**: `executions.ts`는 npm `yaml`, `presets.ts`는 `js-yaml` (CJS require) | 파싱 결과 미묘한 차이 가능 |
| 5 | **useExecutions 경로 불일치**: resume/cancel은 `/workflows/:id/...`, 나머지는 `/executions/:id/...` | 혼란 유발, 통일 필요 |

### 7.3 구현 우선순위 제안 (COO 의견)

| 순위 | 항목 | 이유 |
|------|------|------|
| P0 | 캔버스 저장→실행→상태반영 파이프 (brick-canvas-save) | 핵심 UX 완성 — 블록 배치→실행 시각화 |
| P1 | useBrickLiveUpdates 마운트 | WebSocket 실시간 업데이트 활성화 |
| P1 | useLinks ↔ 캔버스 연결 | DB 링크 영속성 보장 |
| P2 | RunHistoryPage 데이터 연결 | 실행 이력 조회 |
| P2 | LearningHarnessPage hooks 연결 | 학습 제안 검토 UI |
| P3 | PresetEditorPage 저장 | YAML 직접 편집 |
| P3 | system.ts 실제 INV 검증 | 불변식 모니터링 |
| P3 | notify.ts 실제 알림 발송 | Slack/Telegram 연동 |

---

## 8. 수치 요약

| 항목 | 수치 |
|------|------|
| Python 소스 파일 | 87개 (~11,950줄) |
| Python 테스트 | 374건 (7,343줄) |
| TypeScript 백엔드 파일 | 17개 (~1,600줄) |
| TypeScript API 엔드포인트 | 43개 |
| DB 테이블 | 8개 |
| React 페이지 | 10개 |
| React hooks | 9개 |
| React 컴포넌트 | 27개 |
| React lib | 6개 |
| Design 문서 | 10건 |
| Design TDD 합계 | 628건 |
| YAML 프리셋 | 6개 (.bkit/presets/) |
| 링크 타입 | 6종 (sequential/parallel/compete/loop/cron/branch) |
| 블록 타입 | 10종 (plan~notify) |
| 게이트 타입 | 5종 (command/http/prompt/agent/review) |
| 어댑터 | 6종 (claude_agent_teams/claude_code/human/webhook/codex/mcp_bridge) |
