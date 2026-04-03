// dashboard/server/db/schema/brick.ts — Brick 도메인 8개 테이블
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── Block Types ──
export const brickBlockTypes = sqliteTable('brick_block_types', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  category: text('category').notNull(),
  config: text('config', { mode: 'json' }),
  isCore: integer('is_core', { mode: 'boolean' }).default(false),
  thinkLogRequired: integer('think_log_required', { mode: 'boolean' }).default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Teams ──
export const brickTeams = sqliteTable('brick_teams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  adapter: text('adapter').notNull(),
  adapterConfig: text('adapter_config', { mode: 'json' }),
  members: text('members', { mode: 'json' }),
  skills: text('skills', { mode: 'json' }),
  mcpServers: text('mcp_servers', { mode: 'json' }),
  modelConfig: text('model_config', { mode: 'json' }),
  status: text('status').default('idle'),
  allowedTools: text('allowed_tools', { mode: 'json' }),
  maxDepth: integer('max_depth').default(0),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Presets ──
export const brickPresets = sqliteTable('brick_presets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  yaml: text('yaml').notNull(),
  isCore: integer('is_core', { mode: 'boolean' }).default(false),
  labels: text('labels', { mode: 'json' }),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Links (블록 간 연결) ──
export const brickLinks = sqliteTable('brick_links', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workflowId: integer('workflow_id').references(() => brickPresets.id),
  fromBlock: text('from_block').notNull(),
  toBlock: text('to_block').notNull(),
  linkType: text('link_type').notNull().default('sequential'),
  condition: text('condition'),
  judge: text('judge'),
  cron: text('cron'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Executions (워크플로우 실행 인스턴스) ──
export const brickExecutions = sqliteTable('brick_executions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  presetId: integer('preset_id').references(() => brickPresets.id),
  feature: text('feature').notNull(),
  status: text('status').notNull().default('pending'),
  currentBlock: text('current_block'),
  blocksState: text('blocks_state', { mode: 'json' }),
  engineWorkflowId: text('engine_workflow_id'),  // Python 엔진 ID 매핑
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Execution Logs ──
export const brickExecutionLogs = sqliteTable('brick_execution_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  executionId: integer('execution_id').references(() => brickExecutions.id),
  eventType: text('event_type').notNull(),
  blockId: text('block_id'),
  data: text('data', { mode: 'json' }),
  timestamp: text('timestamp').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Gate Results ──
export const brickGateResults = sqliteTable('brick_gate_results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  executionId: integer('execution_id').references(() => brickExecutions.id),
  blockId: text('block_id').notNull(),
  handlerType: text('handler_type').notNull(),
  passed: integer('passed', { mode: 'boolean' }),
  detail: text('detail', { mode: 'json' }),
  executedAt: text('executed_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Learning Proposals ──
export const brickLearningProposals = sqliteTable('brick_learning_proposals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  axis: text('axis').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  pattern: text('pattern', { mode: 'json' }),
  confidence: integer('confidence'),
  targetFile: text('target_file'),
  diff: text('diff'),
  status: text('status').notNull().default('pending'),
  reviewedBy: text('reviewed_by'),
  reviewedAt: text('reviewed_at'),
  rejectReason: text('reject_reason'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

// ── Approvals (CEO 승인 Gate) ──
export const brickApprovals = sqliteTable('brick_approvals', {
  id: text('id').primaryKey(),  // uuid() 앱 레이어 생성
  executionId: integer('execution_id').references(() => brickExecutions.id).notNull(),
  blockId: text('block_id').notNull(),
  approver: text('approver').notNull(),
  status: text('status').notNull().default('waiting'),  // waiting|approved|rejected|escalated|timeout
  summary: text('summary'),
  artifacts: text('artifacts').default('[]'),  // JSON 문자열
  rejectReason: text('reject_reason'),
  comment: text('comment'),
  reminderCount: integer('reminder_count').default(0),
  timeoutAt: text('timeout_at').notNull(),
  resolvedAt: text('resolved_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
