import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T1: tickets — PDCA 태스크
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const tickets = sqliteTable('tickets', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  feature: text('feature').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status', {
    enum: ['backlog', 'todo', 'in_progress', 'in_review', 'completed', 'cancelled'],
  }).notNull().default('backlog'),
  priority: text('priority', {
    enum: ['critical', 'high', 'medium', 'low'],
  }).notNull().default('medium'),

  // 배정
  assigneeAgent: text('assignee_agent'),
  assigneeTeam: text('assignee_team'),

  // PDCA 연결
  pdcaPhase: text('pdca_phase', {
    enum: ['plan', 'design', 'do', 'check', 'act', 'deploy'],
  }),
  processLevel: text('process_level', {
    enum: ['L0', 'L1', 'L2', 'L3'],
  }),
  matchRate: real('match_rate'),

  // 체인 연결
  chainId: text('chain_id').references(() => workflowChains.id),
  chainStepId: text('chain_step_id'),

  // 실행 추적
  executionRunId: text('execution_run_id'), // FK to heartbeat_runs (앱 레벨 — 순환 참조 방지)
  commitHash: text('commit_hash'),
  pushVerified: integer('push_verified').default(0),
  changedFiles: integer('changed_files').default(0),

  // 체크리스트 (JSON 배열)
  checklist: text('checklist').default('[]'),

  // 타임스탬프
  startedAt: text('started_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  featureIdx: index('idx_tickets_feature').on(table.feature),
  statusIdx: index('idx_tickets_status').on(table.status),
  assigneeIdx: index('idx_tickets_assignee').on(table.assigneeTeam, table.status),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T2: agents — 에이전트 레지스트리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  name: text('name').notNull().unique(),
  displayName: text('display_name'),
  role: text('role', {
    enum: ['leader', 'developer', 'qa', 'pm', 'coo'],
  }).notNull().default('developer'),
  team: text('team'),
  status: text('status', {
    enum: ['idle', 'running', 'paused', 'error', 'terminated'],
  }).notNull().default('idle'),
  pauseReason: text('pause_reason'),

  // 계층 구조
  reportsTo: text('reports_to').references((): any => agents.id),

  // 런타임 연결
  tmuxSession: text('tmux_session'),
  tmuxPane: text('tmux_pane'),
  peerId: text('peer_id'),
  pid: integer('pid'),

  // 비용 추적
  budgetMonthlyCents: integer('budget_monthly_cents').default(0),
  spentMonthlyCents: integer('spent_monthly_cents').default(0),

  // heartbeat
  lastHeartbeatAt: text('last_heartbeat_at'),
  idleWarningSent: integer('idle_warning_sent').default(0),

  // 메타
  icon: text('icon').default('🤖'),
  capabilities: text('capabilities'),
  model: text('model').default('claude-opus-4-6'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T3: heartbeat_runs — 에이전트 실행 기록
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const heartbeatRuns = sqliteTable('heartbeat_runs', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  agentId: text('agent_id').notNull().references(() => agents.id),
  ticketId: text('ticket_id').references(() => tickets.id),

  status: text('status', {
    enum: ['queued', 'running', 'completed', 'failed', 'cancelled'],
  }).notNull().default('running'),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),

  // 프로세스 정보
  pid: integer('pid'),
  exitCode: integer('exit_code'),

  // 토큰 사용량
  inputTokens: integer('input_tokens').default(0),
  outputTokens: integer('output_tokens').default(0),
  cachedTokens: integer('cached_tokens').default(0),

  // 로그
  stdoutExcerpt: text('stdout_excerpt'),
  resultJson: text('result_json'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  agentIdx: index('idx_runs_agent').on(table.agentId, table.startedAt),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T4: cost_events — 비용 이벤트 (불변, 추가 전용)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const costEvents = sqliteTable('cost_events', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  agentId: text('agent_id').notNull().references(() => agents.id),
  ticketId: text('ticket_id').references(() => tickets.id),
  runId: text('run_id').references(() => heartbeatRuns.id),

  provider: text('provider').notNull().default('anthropic'),
  model: text('model').notNull(),

  inputTokens: integer('input_tokens').notNull().default(0),
  cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  costCents: integer('cost_cents').notNull(),

  occurredAt: text('occurred_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  agentIdx: index('idx_cost_agent').on(table.agentId, table.occurredAt),
  modelIdx: index('idx_cost_model').on(table.model, table.occurredAt),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T5: budget_policies — 예산 정책
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const budgetPolicies = sqliteTable('budget_policies', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  scopeType: text('scope_type', {
    enum: ['global', 'agent', 'team'],
  }).notNull().default('global'),
  scopeId: text('scope_id'),
  amountCents: integer('amount_cents').notNull(),
  warnPercent: integer('warn_percent').notNull().default(80),
  hardStop: integer('hard_stop').notNull().default(1),
  windowKind: text('window_kind', {
    enum: ['monthly', 'weekly', 'daily'],
  }).notNull().default('monthly'),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T6: budget_incidents — 예산 초과 이력
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const budgetIncidents = sqliteTable('budget_incidents', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  policyId: text('policy_id').notNull().references(() => budgetPolicies.id),
  agentId: text('agent_id').references(() => agents.id),
  kind: text('kind', {
    enum: ['warn', 'hard_stop'],
  }).notNull(),
  amountAtTrigger: integer('amount_at_trigger').notNull(),
  thresholdAmount: integer('threshold_amount').notNull(),
  resolved: integer('resolved').notNull().default(0),
  resolvedAt: text('resolved_at'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T7: workflow_chains — 워크플로 체인 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const workflowChains = sqliteTable('workflow_chains', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  name: text('name').notNull(),
  description: text('description'),
  active: integer('active').notNull().default(1),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T8: workflow_steps — 체인 단계 정의
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const workflowSteps = sqliteTable('workflow_steps', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  chainId: text('chain_id').notNull().references(() => workflowChains.id, { onDelete: 'cascade' }),
  stepOrder: integer('step_order').notNull(),

  teamRole: text('team_role').notNull(),
  phase: text('phase').notNull(),
  label: text('label').notNull(),

  // 완료 조건 (JSON)
  completionCondition: text('completion_condition').notNull().default('{"type":"manual"}'),

  autoTriggerNext: integer('auto_trigger_next').notNull().default(1),
  assignee: text('assignee'),

  // 배포 설정
  deployConfig: text('deploy_config'),

  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  chainIdx: index('idx_steps_chain').on(table.chainId, table.stepOrder),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T9: events — 이벤트 로그 (불변, 시간순)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  eventType: text('event_type').notNull(),
  actor: text('actor').notNull(),
  targetType: text('target_type'),
  targetId: text('target_id'),
  payload: text('payload'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now','localtime'))`),
}, (table) => ({
  typeIdx: index('idx_events_type').on(table.eventType, table.createdAt),
  targetIdx: index('idx_events_target').on(table.targetType, table.targetId),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T10: pdca_features — PDCA 피처 상태
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const pdcaFeatures = sqliteTable('pdca_features', {
  id: text('id').primaryKey(),
  displayName: text('display_name').notNull(),
  phase: text('phase', {
    enum: ['planning', 'designing', 'implementing', 'checking', 'acting', 'completed', 'archived'],
  }).notNull().default('planning'),
  processLevel: text('process_level').default('L2'),

  planDone: integer('plan_done').default(0),
  planDoc: text('plan_doc'),
  planAt: text('plan_at'),
  designDone: integer('design_done').default(0),
  designDoc: text('design_doc'),
  designAt: text('design_at'),
  doDone: integer('do_done').default(0),
  doCommit: text('do_commit'),
  doAt: text('do_at'),
  checkDone: integer('check_done').default(0),
  checkDoc: text('check_doc'),
  matchRate: real('match_rate'),
  actDone: integer('act_done').default(0),
  actCommit: text('act_commit'),
  deployedAt: text('deployed_at'),

  chainId: text('chain_id').references(() => workflowChains.id),
  currentStep: integer('current_step'),
  automationLevel: integer('automation_level').default(2),
  iterationCount: integer('iteration_count').default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T11: notifications — 알림
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const notifications = sqliteTable('notifications', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  sourceEventId: integer('source_event_id').references(() => events.id),
  read: integer('read').notNull().default(0),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  unreadIdx: index('idx_notif_unread').on(table.read, table.createdAt),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T12: routines — 반복 작업 관리
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const routines = sqliteTable('routines', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  name: text('name').notNull(),
  description: text('description'),
  cronExpression: text('cron_expression').notNull(),
  command: text('command').notNull(),
  enabled: integer('enabled').notNull().default(1),
  lastRunAt: text('last_run_at'),
  nextRunAt: text('next_run_at'),
  lastRunStatus: text('last_run_status', {
    enum: ['success', 'failed', 'running'],
  }),
  lastRunOutput: text('last_run_output'),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
  updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// T13: knowledge_entries — 에이전트 학습 데이터
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const knowledgeEntries = sqliteTable('knowledge_entries', {
  id: text('id').primaryKey().$defaultFn(() => randomHex(8)),
  agentId: text('agent_id').notNull().references(() => agents.id),
  category: text('category', {
    enum: ['general', 'pattern', 'mistake', 'convention', 'architecture', 'performance'],
  }).notNull().default('general'),
  title: text('title').notNull(),
  content: text('content').notNull(),
  sourceTicketId: text('source_ticket_id').references(() => tickets.id),
  tags: text('tags').default('[]'),
  learnedAt: text('learned_at').notNull().default(sql`(datetime('now'))`),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  agentIdx: index('idx_knowledge_agent').on(table.agentId, table.category),
  categoryIdx: index('idx_knowledge_category').on(table.category, table.learnedAt),
}));

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 유틸
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function randomHex(bytes: number): string {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, '0')).join('');
}
