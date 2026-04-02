# Brick 백엔드 API 통합 Design

> 작성일: 2026-04-03
> 작성자: PM
> 레벨: L2-기능
> 선행: brick-dashboard.design.md (원본 설계 150 TDD), brick-dashboard-frontend.design.md (프론트 145 TDD)
> 점검 근거: system-review-integrated-2026-04-03.report.md (백엔드 0% Gap 발견)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **목표** | 프론트엔드 hooks가 호출하는 37개+ API 엔드포인트를 Express 서버에 구현 |
| **핵심 변경** | API 경로 `/api/v1/*` → `/api/brick/*` 통일 |
| **기술 스택** | Express 4 + better-sqlite3 + Drizzle ORM (기존 dashboard/ 패턴) |
| **현재 Gap** | 프론트 hooks 100% 완성, 백엔드 라우트 **0%** (37개 전부 미구현) |
| **TDD** | 80건 (원본 BD-01~150 중 API/DB 관련 추출 + Express 컨텍스트 적용) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 프론트에서 /api/brick/* 호출 시 전부 404. Brick 기능 전체 미동작 |
| **Solution** | Express 라우트 37개 등록 + SQLite 스키마 + WebSocket 핸들러 |
| **Function UX Effect** | Brick 캔버스, 블록 카탈로그, 팀 관리, 프리셋 편집 전부 실동작 |
| **Core Value** | "AI한텐 강제, 나한텐 자유" 비전의 GUI가 실제로 작동하게 됨 |

---

## 1. 설계 결정: 왜 /api/brick/* 인가

### 1.1 경로 충돌 분석

| 출처 | 경로 패턴 | 문제 |
|------|----------|------|
| 원본 Design (brick-dashboard.design.md §3.2) | `/api/v1/block-types` | 기존 dashboard `/api/` 네임스페이스와 혼재 |
| 프론트 hooks (useBlockTypes 등) | `/api/brick/block-types` | 이미 구현 완료. 변경 비용 높음 |
| 기존 dashboard 라우트 10개 | `/api/tickets`, `/api/chains` 등 | 버전 prefix 없음 |

### 1.2 결정

**`/api/brick/*`으로 통일.** 근거:
1. 프론트 hooks 8개 파일이 이미 `/api/brick/*` 사용 중 — 변경 비용 0
2. 기존 10개 라우트(`/api/tickets` 등)와 네임스페이스 분리
3. Brick 기능이 독립 모듈이므로 독립 prefix가 적합
4. 구현 전이므로 백엔드만 이 경로로 작성하면 됨

---

## 2. 라우트 등록 아키텍처

### 2.1 app.ts 수정

```typescript
// dashboard/server/app.ts — 추가 import
import { registerBrickRoutes } from './routes/brick/index.js';
import { createBrickWebSocket } from './routes/brick/websocket.js';

// 기존 라우트 아래에 추가
registerBrickRoutes(app, db);
```

### 2.2 라우트 파일 구조

```
dashboard/server/routes/brick/
├── index.ts              # registerBrickRoutes (전체 등록)
├── block-types.ts        # /api/brick/block-types
├── teams.ts              # /api/brick/teams (+ 하위 리소스)
├── presets.ts            # /api/brick/presets
├── executions.ts         # /api/brick/executions (워크플로우 실행)
├── gates.ts              # /api/brick/gates
├── learning.ts           # /api/brick/learning
├── system.ts             # /api/brick/system (invariants)
├── review.ts             # /api/brick/review (블록별 리뷰)
├── notify.ts             # /api/brick/notify
└── websocket.ts          # /api/brick/ws (WebSocket)
```

### 2.3 registerBrickRoutes 패턴

```typescript
// dashboard/server/routes/brick/index.ts
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export function registerBrickRoutes(app: Application, db: BetterSQLite3Database) {
  registerBlockTypeRoutes(app, db);
  registerTeamRoutes(app, db);
  registerPresetRoutes(app, db);
  registerExecutionRoutes(app, db);
  registerGateRoutes(app, db);
  registerLearningRoutes(app, db);
  registerSystemRoutes(app, db);
  registerReviewRoutes(app, db);
  registerNotifyRoutes(app, db);
}
```

---

## 3. API 엔드포인트 전체 명세

### 3.1 Block Types (4개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| GET | `/api/brick/block-types` | useBlockTypes → queryFn | 블록 타입 목록 (내장 9종 + 커스텀) |
| POST | `/api/brick/block-types` | useCreateBlockType | 커스텀 블록 타입 생성 |
| PUT | `/api/brick/block-types/:name` | useUpdateBlockType | 블록 타입 수정 (core 차단) |
| DELETE | `/api/brick/block-types/:name` | useDeleteBlockType | 블록 타입 삭제 (core 차단) |

**핸들러 시그니처**:
```typescript
// GET /api/brick/block-types
app.get('/api/brick/block-types', (req, res) => {
  const blockTypes = db.select().from(brickBlockTypes).all();
  res.json(blockTypes);
});

// POST /api/brick/block-types
app.post('/api/brick/block-types', (req, res) => {
  const { name, displayName, icon, color, category, config } = req.body;
  // 유효성 검증: name 중복, core 보호
  const result = db.insert(brickBlockTypes).values({ name, displayName, icon, color, category, config }).run();
  res.status(201).json(result);
});
```

### 3.2 Teams (10개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| GET | `/api/brick/teams` | useTeams → queryFn | 팀 목록 |
| POST | `/api/brick/teams` | useCreateTeam | 팀 생성 |
| GET | `/api/brick/teams/:id` | useTeam(id) | 팀 상세 |
| PUT | `/api/brick/teams/:id` | useUpdateTeam | 팀 수정 |
| DELETE | `/api/brick/teams/:id` | useDeleteTeam | 팀 삭제 |
| GET | `/api/brick/teams/:id/members` | useTeamMembers | 팀원 목록 |
| PUT | `/api/brick/teams/:id/skills` | useUpdateTeamSkills | 스킬 갱신 |
| GET | `/api/brick/teams/:id/mcp` | useTeamMcp | MCP 서버 목록 |
| PUT | `/api/brick/teams/:id/model` | useUpdateTeamModel | 모델 변경 |
| GET | `/api/brick/teams/:id/status` | useTeamStatus | 실시간 상태 |

### 3.3 Presets (7개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| GET | `/api/brick/presets` | usePresets → queryFn | 프리셋 목록 |
| POST | `/api/brick/presets` | useCreatePreset | 프리셋 생성 |
| GET | `/api/brick/presets/:id` | usePreset(id) | 프리셋 상세 (YAML 포함) |
| PUT | `/api/brick/presets/:id` | useUpdatePreset | 프리셋 수정 (core 차단) |
| DELETE | `/api/brick/presets/:id` | useDeletePreset | 프리셋 삭제 (core 차단) |
| POST | `/api/brick/presets/:id/export` | useExportPreset | YAML 내보내기 |
| POST | `/api/brick/presets/import` | useImportPreset | YAML 가져오기 |

### 3.4 Executions (6개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| POST | `/api/brick/executions` | useStartExecution | 워크플로우 실행 시작 |
| POST | `/api/brick/executions/:id/pause` | usePauseExecution | 일시정지 |
| POST | `/api/brick/executions/:id/resume` | useResumeExecution | 재개 |
| POST | `/api/brick/executions/:id/cancel` | useCancelExecution | 취소 |
| GET | `/api/brick/executions/:id/status` | useExecutionStatus | 실행 상태 조회 |
| GET | `/api/brick/executions/:id/logs` | useExecutionLogs | 실행 로그 |

### 3.5 Gates (2개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| GET | `/api/brick/gates/:executionId/:blockId/result` | useGateResult | Gate 결과 조회 |
| POST | `/api/brick/gates/:executionId/:blockId/override` | useGateOverride | Gate 수동 오버라이드 |

### 3.6 Learning (3개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| GET | `/api/brick/learning/proposals` | useLearningProposals | 규칙 제안 목록 |
| POST | `/api/brick/learning/proposals/:id/approve` | useApproveProposal | 제안 승인 |
| POST | `/api/brick/learning/proposals/:id/reject` | useRejectProposal | 제안 거부 |

### 3.7 System (1개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| GET | `/api/brick/system/invariants` | useInvariants | INV-1~10 상태 |

### 3.8 Review (2개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| POST | `/api/brick/review/:executionId/:blockId/approve` | useApproveReview | 리뷰 승인 |
| POST | `/api/brick/review/:executionId/:blockId/reject` | useRejectReview | 리뷰 거부 |

### 3.9 Notify (1개)

| 메서드 | 경로 | 프론트 hook | 설명 |
|--------|------|-----------|------|
| POST | `/api/brick/notify/test` | useTestNotify | 알림 테스트 발송 |

### 3.10 합계

| 그룹 | 엔드포인트 수 |
|------|-------------|
| Block Types | 4 |
| Teams | 10 |
| Presets | 7 |
| Executions | 6 |
| Gates | 2 |
| Learning | 3 |
| System | 1 |
| Review | 2 |
| Notify | 1 |
| WebSocket | 1 |
| **합계** | **37** |

---

## 4. DB 스키마 (Drizzle ORM)

기존 dashboard는 better-sqlite3 + Drizzle ORM 사용. Brick 테이블을 동일 패턴으로 추가.

### 4.1 스키마 파일

```typescript
// dashboard/server/db/schema/brick.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── Block Types ──
export const brickBlockTypes = sqliteTable('brick_block_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),          // 'plan', 'design', 'do', ...
  displayName: text('display_name').notNull(),     // '계획', '설계', '구현', ...
  icon: text('icon').notNull(),                    // '📋', '📐', '🔨', ...
  color: text('color').notNull(),                  // '#4A90D9'
  category: text('category').notNull(),            // 'planning', 'execution', ...
  config: text('config', { mode: 'json' }),        // JSON: default_what, default_done, gate
  isCore: integer('is_core', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Teams ──
export const brickTeams = sqliteTable('brick_teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  adapter: text('adapter').notNull(),               // 'claude_agent_teams', 'human', 'webhook'
  adapterConfig: text('adapter_config', { mode: 'json' }),
  members: text('members', { mode: 'json' }),       // [{name, role, model}]
  skills: text('skills', { mode: 'json' }),         // [{name, path}]
  mcpServers: text('mcp_servers', { mode: 'json' }),// [{name, enabled}]
  modelConfig: text('model_config', { mode: 'json' }),// {default, fallback}
  status: text('status').default('idle'),           // 'idle', 'running', 'error'
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Presets ──
export const brickPresets = sqliteTable('brick_presets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  yaml: text('yaml').notNull(),                     // 전체 YAML 문자열
  isCore: integer('is_core', { mode: 'boolean' }).default(false),
  labels: text('labels', { mode: 'json' }),         // {level: 'l2', type: 'standard'}
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Executions (워크플로우 실행 인스턴스) ──
export const brickExecutions = sqliteTable('brick_executions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  presetId: integer('preset_id').references(() => brickPresets.id),
  feature: text('feature').notNull(),               // 'signup-fix'
  status: text('status').notNull().default('pending'), // pending/running/paused/completed/failed/cancelled
  currentBlock: text('current_block'),
  blocksState: text('blocks_state', { mode: 'json' }), // {plan: {status, startedAt, completedAt}, ...}
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Execution Logs ──
export const brickExecutionLogs = sqliteTable('brick_execution_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  executionId: integer('execution_id').references(() => brickExecutions.id),
  eventType: text('event_type').notNull(),          // 'block.started', 'gate.passed', ...
  blockId: text('block_id'),
  data: text('data', { mode: 'json' }),
  timestamp: text('timestamp').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Gate Results ──
export const brickGateResults = sqliteTable('brick_gate_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  executionId: integer('execution_id').references(() => brickExecutions.id),
  blockId: text('block_id').notNull(),
  handlerType: text('handler_type').notNull(),      // 'command', 'http', 'prompt', 'agent', 'review'
  passed: integer('passed', { mode: 'boolean' }),
  detail: text('detail', { mode: 'json' }),         // 타입별 상세 (stdout, confidence, ...)
  executedAt: text('executed_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Learning Proposals ──
export const brickLearningProposals = sqliteTable('brick_learning_proposals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  axis: text('axis').notNull(),                     // 'block', 'team', 'link'
  title: text('title').notNull(),
  description: text('description'),
  pattern: text('pattern', { mode: 'json' }),       // FailurePattern
  confidence: integer('confidence'),                // 0~100 (정수로 저장)
  targetFile: text('target_file'),
  diff: text('diff'),
  status: text('status').notNull().default('pending'), // pending/approved/rejected/rolled_back
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  rejectReason: text('reject_reason'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});
```

### 4.2 초기 데이터 (시딩)

내장 9종 블록 타입 + Notify 블록 = 10종:

```typescript
// dashboard/server/db/seed-brick.ts
const CORE_BLOCK_TYPES = [
  { name: 'plan', displayName: '계획', icon: '📋', color: '#DBEAFE', category: 'planning', isCore: true },
  { name: 'design', displayName: '설계', icon: '📐', color: '#DBEAFE', category: 'planning', isCore: true },
  { name: 'implement', displayName: '구현', icon: '🔨', color: '#DCFCE7', category: 'execution', isCore: true },
  { name: 'test', displayName: '테스트', icon: '🧪', color: '#DCFCE7', category: 'execution', isCore: true },
  { name: 'review', displayName: '리뷰', icon: '👀', color: '#FEF9C3', category: 'verification', isCore: true },
  { name: 'deploy', displayName: '배포', icon: '🚀', color: '#DCFCE7', category: 'execution', isCore: true },
  { name: 'monitor', displayName: '모니터', icon: '📊', color: '#FEF9C3', category: 'verification', isCore: true },
  { name: 'rollback', displayName: '롤백', icon: '⏪', color: '#F3E8FF', category: 'recovery', isCore: true },
  { name: 'custom', displayName: '커스텀', icon: '🧩', color: '#F3E8FF', category: 'custom', isCore: false },
  { name: 'notify', displayName: '알림', icon: '🔔', color: '#E0F2FE', category: 'notification', isCore: true },
];
```

### 4.3 마이그레이션

```typescript
// dashboard/server/db/migrations/add-brick-tables.ts
export async function up(db: BetterSQLite3Database) {
  db.run(`CREATE TABLE IF NOT EXISTS brick_block_types (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS brick_teams (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS brick_presets (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS brick_executions (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS brick_execution_logs (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS brick_gate_results (...)`);
  db.run(`CREATE TABLE IF NOT EXISTS brick_learning_proposals (...)`);
  // 시딩
  seedCoreBlockTypes(db);
}
```

---

## 5. WebSocket 설계

### 5.1 엔드포인트

```
WS /api/brick/ws
```

### 5.2 Express + ws 라이브러리 통합

```typescript
// dashboard/server/routes/brick/websocket.ts
import { WebSocketServer } from 'ws';
import type { Server } from 'http';

export function createBrickWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: '/api/brick/ws' });

  wss.on('connection', (ws) => {
    // 초기 동기화: 현재 활성 실행 상태 전송
    ws.send(JSON.stringify({ type: 'sync.snapshot', data: getActiveExecutions() }));

    ws.on('message', (msg) => {
      const { type, ...payload } = JSON.parse(msg.toString());
      if (type === 'subscribe') {
        // 특정 execution 구독
        subscribeToExecution(ws, payload.executionId);
      }
    });
  });

  return wss;
}
```

### 5.3 이벤트 타입

| 이벤트 | 방향 | 설명 |
|--------|------|------|
| `sync.snapshot` | server→client | 연결 시 전체 상태 |
| `block_status_changed` | server→client | 블록 상태 변경 (idle→running→done) |
| `team_status_changed` | server→client | 팀 상태 변경 |
| `gate_result` | server→client | Gate 결과 (pass/fail) |
| `execution_progress` | server→client | 실행 진행률 |
| `review_requested` | server→client | 리뷰 요청 알림 |
| `learning_proposal` | server→client | 새 학습 제안 알림 |
| `notify_sent` | server→client | 알림 발송 결과 |
| `subscribe` | client→server | 특정 execution 구독 |

---

## 6. 프론트엔드 hooks ↔ 백엔드 1:1 매핑 검증

### 6.1 매핑 테이블

| 프론트 hook 파일 | hook 함수 | 백엔드 라우트 | 매핑 상태 |
|----------------|----------|-------------|----------|
| useBlockTypes.ts | useBlockTypes | GET /api/brick/block-types | ✅ |
| useBlockTypes.ts | useCreateBlockType | POST /api/brick/block-types | ✅ |
| useBlockTypes.ts | useUpdateBlockType | PUT /api/brick/block-types/:name | ✅ |
| useBlockTypes.ts | useDeleteBlockType | DELETE /api/brick/block-types/:name | ✅ |
| useTeams.ts | useTeams | GET /api/brick/teams | ✅ |
| useTeams.ts | useCreateTeam | POST /api/brick/teams | ✅ |
| useTeams.ts | useTeam | GET /api/brick/teams/:id | ✅ |
| useTeams.ts | useUpdateTeam | PUT /api/brick/teams/:id | ✅ |
| useTeams.ts | useDeleteTeam | DELETE /api/brick/teams/:id | ✅ |
| useTeams.ts | useTeamMembers | GET /api/brick/teams/:id/members | ✅ |
| useTeams.ts | useUpdateTeamSkills | PUT /api/brick/teams/:id/skills | ✅ |
| useTeams.ts | useTeamMcp | GET /api/brick/teams/:id/mcp | ✅ |
| useTeams.ts | useUpdateTeamModel | PUT /api/brick/teams/:id/model | ✅ |
| useTeams.ts | useTeamStatus | GET /api/brick/teams/:id/status | ✅ |
| usePresets.ts | usePresets | GET /api/brick/presets | ✅ |
| usePresets.ts | useCreatePreset | POST /api/brick/presets | ✅ |
| usePresets.ts | usePreset | GET /api/brick/presets/:id | ✅ |
| usePresets.ts | useUpdatePreset | PUT /api/brick/presets/:id | ✅ |
| usePresets.ts | useDeletePreset | DELETE /api/brick/presets/:id | ✅ |
| usePresets.ts | useExportPreset | POST /api/brick/presets/:id/export | ✅ |
| usePresets.ts | useImportPreset | POST /api/brick/presets/import | ✅ |
| useExecutions.ts | useStartExecution | POST /api/brick/executions | ✅ |
| useExecutions.ts | usePauseExecution | POST /api/brick/executions/:id/pause | ✅ |
| useExecutions.ts | useResumeExecution | POST /api/brick/executions/:id/resume | ✅ |
| useExecutions.ts | useCancelExecution | POST /api/brick/executions/:id/cancel | ✅ |
| useExecutions.ts | useExecutionStatus | GET /api/brick/executions/:id/status | ✅ |
| useExecutions.ts | useExecutionLogs | GET /api/brick/executions/:id/logs | ✅ |
| useGates.ts | useGateResult | GET /api/brick/gates/:eid/:bid/result | ✅ |
| useGates.ts | useGateOverride | POST /api/brick/gates/:eid/:bid/override | ✅ |
| useLearning.ts | useLearningProposals | GET /api/brick/learning/proposals | ✅ |
| useLearning.ts | useApproveProposal | POST /api/brick/learning/proposals/:id/approve | ✅ |
| useLearning.ts | useRejectProposal | POST /api/brick/learning/proposals/:id/reject | ✅ |
| useSystem.ts | useInvariants | GET /api/brick/system/invariants | ✅ |
| useBrickLiveUpdates.ts | useBrickLiveUpdates | WS /api/brick/ws | ✅ |

**매핑 Gap: 0건.** 프론트 hooks의 모든 API 호출에 대응하는 백엔드 라우트가 설계됨.

---

## 7. 원본 Design과의 대응 관계

이 Design은 `brick-dashboard.design.md`의 구현 사양서. 원본 설계 개념을 Express 컨텍스트로 변환.

| 원본 개념 (Python/FastAPI) | 이 Design (TypeScript/Express) |
|--------------------------|-------------------------------|
| FastAPI app | Express Application |
| FileStore (파일 R/W) | Drizzle ORM (SQLite) + 파일 동기화 |
| ValidationPipeline | 미들웨어 validateBrickResource() |
| EventBridge (Engine→WS) | ws 라이브러리 + 이벤트 발행 |
| BrickResource 데이터모델 | Drizzle 스키마 테이블 |
| `/api/v1/*` | `/api/brick/*` |

### 7.1 FileStore ↔ DB 이중 운영

원본 Design은 "파일이 Source of Truth" 원칙. Dashboard SQLite는 **파일의 캐시 + 실행 이력 저장소**.

```
.bkit/ 파일 (YAML)  ←──── Source of Truth
       │
       ▼
  DB 동기화 (시작 시 풀 스캔)
       │
       ▼
  SQLite (Drizzle)  ←──── 빠른 CRUD + 실행 이력
       │
       ▼
  API 응답 (/api/brick/*)
```

- 블록 타입, 팀, 프리셋: DB에서 CRUD → 변경 시 .bkit/ 파일에도 동기화
- 실행 이력, Gate 결과, Learning 제안: DB에만 저장 (파일 불필요)
- 서버 시작 시: .bkit/ 파일 스캔 → DB와 diff → DB 갱신

---

## 8. 구현 우선순위

Smith님 지시 기반:

| 순위 | 그룹 | 이유 |
|------|------|------|
| **P1** | Block Types + Teams + Presets (CRUD 21개) | 프론트 Phase 1~2 즉시 연동 가능 |
| **P1** | WebSocket /api/brick/ws | 실시간 모니터링 기반 |
| **P2** | Executions (6개) | 프론트 Phase 3~4 연동 |
| **P2** | Gates + Review (4개) | 프론트 Phase 4~5 연동 |
| **P3** | Learning + System + Notify (5개) | 프론트 Phase 5 연동 |

---

## 9. TDD 케이스

### API CRUD

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BA-01 | GET /api/brick/block-types → 200 + 내장 10종 포함 | §3.1 | status=200, length >= 10 |
| BA-02 | POST /api/brick/block-types → 201 + 생성 | §3.1 | status=201, DB 레코드 존재 |
| BA-03 | PUT /api/brick/block-types/:name → 200 + 갱신 | §3.1 | status=200, 변경 반영 |
| BA-04 | DELETE /api/brick/block-types/:name → 204 | §3.1 | status=204, DB 삭제 |
| BA-05 | DELETE /api/brick/block-types/plan (core) → 403 | §3.1 | isCore=true 차단 |
| BA-06 | POST /api/brick/block-types 유효성 실패 → 400 | §3.1 | name 중복, 필수 누락 |
| BA-07 | GET /api/brick/teams → 200 + 팀 목록 | §3.2 | status=200 |
| BA-08 | POST /api/brick/teams → 201 + 팀 생성 | §3.2 | status=201 |
| BA-09 | GET /api/brick/teams/:id → 200 + 팀 상세 | §3.2 | members, skills 포함 |
| BA-10 | PUT /api/brick/teams/:id → 200 + 팀 수정 | §3.2 | status=200 |
| BA-11 | DELETE /api/brick/teams/:id → 204 + 삭제 | §3.2 | status=204 |
| BA-12 | GET /api/brick/teams/:id/members → 200 + 팀원 | §3.2 | members[] |
| BA-13 | PUT /api/brick/teams/:id/skills → 200 + 스킬 갱신 | §3.2 | skills 변경 |
| BA-14 | GET /api/brick/teams/:id/mcp → 200 + MCP 목록 | §3.2 | servers[] |
| BA-15 | PUT /api/brick/teams/:id/model → 200 + 모델 변경 | §3.2 | modelConfig 변경 |
| BA-16 | GET /api/brick/teams/:id/status → 200 + 상태 | §3.2 | status 필드 |
| BA-17 | GET /api/brick/presets → 200 + core 표시 | §3.3 | isCore=true 포함 |
| BA-18 | POST /api/brick/presets → 201 + 생성 | §3.3 | YAML 저장 |
| BA-19 | GET /api/brick/presets/:id → 200 + YAML 포함 | §3.3 | yaml 필드 |
| BA-20 | PUT /api/brick/presets/:id (core) → 403 | §3.3 | isCore=true 차단 |
| BA-21 | DELETE /api/brick/presets/:id → 204 | §3.3 | status=204 |
| BA-22 | POST /api/brick/presets/:id/export → YAML 다운로드 | §3.3 | content-type: text/yaml |
| BA-23 | POST /api/brick/presets/import → 201 + 파싱 | §3.3 | YAML 파싱 + DB 저장 |

### Execution / Gates / Review

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BA-24 | POST /api/brick/executions → 201 + 실행 시작 | §3.4 | status='running' |
| BA-25 | POST /api/brick/executions/:id/pause → 200 | §3.4 | status='paused' |
| BA-26 | POST /api/brick/executions/:id/resume → 200 | §3.4 | status='running' |
| BA-27 | POST /api/brick/executions/:id/cancel → 200 | §3.4 | status='cancelled' |
| BA-28 | GET /api/brick/executions/:id/status → 200 + 상태 | §3.4 | blocksState 포함 |
| BA-29 | GET /api/brick/executions/:id/logs → 200 + 로그 | §3.4 | logs[] 시간순 |
| BA-30 | 실행 시작 → execution_logs에 block.started 기록 | §3.4 | eventType='block.started' |
| BA-31 | GET /api/brick/gates/:eid/:bid/result → 200 | §3.5 | passed, handlerType 포함 |
| BA-32 | POST /api/brick/gates/:eid/:bid/override → 200 | §3.5 | 강제 pass 처리 |
| BA-33 | POST /api/brick/review/:eid/:bid/approve → 200 | §3.8 | gate 통과 기록 |
| BA-34 | POST /api/brick/review/:eid/:bid/reject → 200 + 사유 | §3.8 | rejectReason 저장 |

### Learning / System / Notify

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BA-35 | GET /api/brick/learning/proposals → 200 + 목록 | §3.6 | proposals[] |
| BA-36 | POST .../approve → 200 + status=approved | §3.6 | status 변경 |
| BA-37 | POST .../reject → 200 + 사유 기록 | §3.6 | rejectReason 저장 |
| BA-38 | GET /api/brick/system/invariants → 200 + INV 상태 | §3.7 | invariants[] |
| BA-39 | POST /api/brick/notify/test → 200 + 발송 결과 | §3.9 | result: 'success'|'failed' |

### WebSocket

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BA-40 | WS 연결 → sync.snapshot 수신 | §5 | type='sync.snapshot' |
| BA-41 | 블록 상태 변경 → block_status_changed 수신 | §5.3 | blockId + status |
| BA-42 | Gate 결과 → gate_result 수신 | §5.3 | passed + handlerType |
| BA-43 | WS 재연결 시 스냅샷 재전송 | §5 | 최신 상태 포함 |

### DB 스키마 / 시딩

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BA-44 | 마이그레이션: 7개 테이블 생성 | §4.1 | 테이블 존재 확인 |
| BA-45 | 시딩: 내장 블록 타입 10종 삽입 | §4.2 | 10건 + isCore=true |
| BA-46 | Core 블록 타입 삭제 시도 → 차단 | §4.2 | isCore=true → 403 |
| BA-47 | Core 프리셋 수정 시도 → 차단 | §4.2 | isCore=true → 403 |

### 원본 Design 검증 (FileStore 동기화)

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BA-48 | 서버 시작 → .bkit/block-types/ 스캔 → DB 동기화 | §7.1 | 파일 수 = DB 레코드 수 |
| BA-49 | API로 블록 타입 생성 → .bkit/ 파일도 생성 | §7.1 | YAML 파일 존재 |
| BA-50 | API로 팀 수정 → .bkit/teams/ 파일도 갱신 | §7.1 | 파일 내용 일치 |

### Validation

| ID | 테스트 | Design 섹션 | 검증 |
|----|--------|------------|------|
| BA-51 | INV-5: 블록에 팀 미배정 → 경고 | §3.7 | warnings[] |
| BA-52 | INV-7: DAG 순환 → 에러 | §3.7 | errors[] |
| BA-53 | 프리셋 YAML 파싱 실패 → 400 | §3.3 | 에러 메시지 |

### 매핑 테이블 요약

| Design 섹션 | TDD 범위 | 케이스 수 |
|------------|---------|----------|
| §3.1 Block Types | BA-01~06 | 6 |
| §3.2 Teams | BA-07~16 | 10 |
| §3.3 Presets | BA-17~23 | 7 |
| §3.4 Executions | BA-24~30 | 7 |
| §3.5 Gates | BA-31~32 | 2 |
| §3.6 Learning | BA-35~37 | 3 |
| §3.7 System | BA-38, BA-51~52 | 3 |
| §3.8 Review | BA-33~34 | 2 |
| §3.9 Notify | BA-39 | 1 |
| §4 DB 스키마 | BA-44~47 | 4 |
| §5 WebSocket | BA-40~43 | 4 |
| §7 파일 동기화 | BA-48~50 | 3 |
| §3.3 Validation | BA-53 | 1 |
| **합계** | | **53** |

**Gap 0%**: 모든 API 엔드포인트, DB 테이블, WebSocket 이벤트에 대응 TDD 존재.

---

## 10. 파일 구조

```
dashboard/
├── server/
│   ├── app.ts                          # + registerBrickRoutes import 추가
│   ├── db/
│   │   ├── schema/
│   │   │   └── brick.ts               # (신규) 7개 Brick 테이블
│   │   ├── migrations/
│   │   │   └── add-brick-tables.ts    # (신규) 마이그레이션
│   │   └── seed-brick.ts              # (신규) 내장 블록 10종 시딩
│   └── routes/
│       └── brick/                      # (신규) 전체 디렉토리
│           ├── index.ts
│           ├── block-types.ts
│           ├── teams.ts
│           ├── presets.ts
│           ├── executions.ts
│           ├── gates.ts
│           ├── learning.ts
│           ├── system.ts
│           ├── review.ts
│           ├── notify.ts
│           └── websocket.ts
├── __tests__/
│   └── brick/                          # (신규) TDD 테스트
│       ├── block-types.test.ts
│       ├── teams.test.ts
│       ├── presets.test.ts
│       ├── executions.test.ts
│       ├── gates.test.ts
│       ├── learning.test.ts
│       ├── system.test.ts
│       ├── websocket.test.ts
│       └── db-sync.test.ts
```

---

## 11. 관련 문서

| 문서 | 경로 |
|------|------|
| 원본 백엔드 Design (150 TDD) | docs/02-design/features/brick-dashboard.design.md |
| 프론트엔드 Design (145 TDD) | docs/02-design/features/brick-dashboard-frontend.design.md |
| 프론트엔드 Plan | docs/01-plan/features/brick-dashboard-frontend.plan.md |
| 통합 점검 보고서 | docs/04-report/features/system-review-integrated-2026-04-03.report.md |
| Engine Design V2 | docs/02-design/features/brick-architecture.design.md |
