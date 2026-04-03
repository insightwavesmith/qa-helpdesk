import type { Database as DatabaseType } from 'better-sqlite3';

const createTableStatements = [
  // T7: workflow_chains (FK 참조 대상이므로 먼저)
  `CREATE TABLE IF NOT EXISTS workflow_chains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T2: agents (자기참조 FK)
  `CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT,
    role TEXT NOT NULL DEFAULT 'developer' CHECK(role IN ('leader','developer','qa','pm','coo')),
    team TEXT,
    status TEXT NOT NULL DEFAULT 'idle' CHECK(status IN ('idle','running','paused','error','terminated')),
    pause_reason TEXT,
    reports_to TEXT REFERENCES agents(id),
    tmux_session TEXT,
    tmux_pane TEXT,
    peer_id TEXT,
    pid INTEGER,
    budget_monthly_cents INTEGER DEFAULT 0,
    spent_monthly_cents INTEGER DEFAULT 0,
    last_heartbeat_at TEXT,
    idle_warning_sent INTEGER DEFAULT 0,
    icon TEXT DEFAULT '🤖',
    capabilities TEXT,
    model TEXT DEFAULT 'claude-opus-4-6',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T1: tickets
  `CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    feature TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'backlog' CHECK(status IN ('backlog','todo','in_progress','in_review','completed','cancelled')),
    priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
    assignee_agent TEXT,
    assignee_team TEXT,
    pdca_phase TEXT CHECK(pdca_phase IN ('plan','design','do','check','act','deploy')),
    process_level TEXT CHECK(process_level IN ('L0','L1','L2','L3')),
    match_rate REAL,
    chain_id TEXT REFERENCES workflow_chains(id),
    chain_step_id TEXT,
    execution_run_id TEXT,
    commit_hash TEXT,
    push_verified INTEGER DEFAULT 0,
    changed_files INTEGER DEFAULT 0,
    checklist TEXT DEFAULT '[]',
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T3: heartbeat_runs
  `CREATE TABLE IF NOT EXISTS heartbeat_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    ticket_id TEXT REFERENCES tickets(id),
    status TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('queued','running','completed','failed','cancelled')),
    started_at TEXT,
    finished_at TEXT,
    pid INTEGER,
    exit_code INTEGER,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    cached_tokens INTEGER DEFAULT 0,
    stdout_excerpt TEXT,
    result_json TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T4: cost_events
  `CREATE TABLE IF NOT EXISTS cost_events (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    ticket_id TEXT REFERENCES tickets(id),
    run_id TEXT REFERENCES heartbeat_runs(id),
    provider TEXT NOT NULL DEFAULT 'anthropic',
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    cached_input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cost_cents INTEGER NOT NULL,
    occurred_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T5: budget_policies
  `CREATE TABLE IF NOT EXISTS budget_policies (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL DEFAULT 'global' CHECK(scope_type IN ('global','agent','team')),
    scope_id TEXT,
    amount_cents INTEGER NOT NULL,
    warn_percent INTEGER NOT NULL DEFAULT 80,
    hard_stop INTEGER NOT NULL DEFAULT 1,
    window_kind TEXT NOT NULL DEFAULT 'monthly' CHECK(window_kind IN ('monthly','weekly','daily')),
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T6: budget_incidents
  `CREATE TABLE IF NOT EXISTS budget_incidents (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL REFERENCES budget_policies(id),
    agent_id TEXT REFERENCES agents(id),
    kind TEXT NOT NULL CHECK(kind IN ('warn','hard_stop')),
    amount_at_trigger INTEGER NOT NULL,
    threshold_amount INTEGER NOT NULL,
    resolved INTEGER NOT NULL DEFAULT 0,
    resolved_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T8: workflow_steps
  `CREATE TABLE IF NOT EXISTS workflow_steps (
    id TEXT PRIMARY KEY,
    chain_id TEXT NOT NULL REFERENCES workflow_chains(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    team_role TEXT NOT NULL,
    phase TEXT NOT NULL,
    label TEXT NOT NULL,
    completion_condition TEXT NOT NULL DEFAULT '{"type":"manual"}',
    auto_trigger_next INTEGER NOT NULL DEFAULT 1,
    assignee TEXT,
    deploy_config TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T9: events
  `CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    actor TEXT NOT NULL,
    target_type TEXT,
    target_id TEXT,
    payload TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
  )`,

  // T10: pdca_features
  `CREATE TABLE IF NOT EXISTS pdca_features (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    phase TEXT NOT NULL DEFAULT 'planning' CHECK(phase IN ('planning','designing','implementing','checking','acting','completed','archived')),
    process_level TEXT DEFAULT 'L2',
    plan_done INTEGER DEFAULT 0,
    plan_doc TEXT,
    plan_at TEXT,
    design_done INTEGER DEFAULT 0,
    design_doc TEXT,
    design_at TEXT,
    do_done INTEGER DEFAULT 0,
    do_commit TEXT,
    do_at TEXT,
    check_done INTEGER DEFAULT 0,
    check_doc TEXT,
    match_rate REAL,
    act_done INTEGER DEFAULT 0,
    act_commit TEXT,
    deployed_at TEXT,
    chain_id TEXT REFERENCES workflow_chains(id),
    current_step INTEGER,
    automation_level INTEGER DEFAULT 2,
    iteration_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T11: notifications
  `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source_event_id INTEGER REFERENCES events(id),
    read INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T12: routines
  `CREATE TABLE IF NOT EXISTS routines (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    cron_expression TEXT NOT NULL,
    command TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    last_run_at TEXT,
    next_run_at TEXT,
    last_run_status TEXT CHECK(last_run_status IN ('success','failed','running')),
    last_run_output TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // T13: knowledge_entries
  `CREATE TABLE IF NOT EXISTS knowledge_entries (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    category TEXT NOT NULL DEFAULT 'general' CHECK(category IN ('general','pattern','mistake','convention','architecture','performance')),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_ticket_id TEXT REFERENCES tickets(id),
    tags TEXT DEFAULT '[]',
    learned_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // ── Brick 도메인 ──

  // B1: brick_block_types
  `CREATE TABLE IF NOT EXISTS brick_block_types (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    category TEXT NOT NULL,
    config TEXT,
    is_core INTEGER DEFAULT 0,
    think_log_required INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // B2: brick_teams
  `CREATE TABLE IF NOT EXISTS brick_teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    adapter TEXT NOT NULL,
    adapter_config TEXT,
    members TEXT,
    skills TEXT,
    mcp_servers TEXT,
    model_config TEXT,
    status TEXT DEFAULT 'idle',
    allowed_tools TEXT,
    max_depth INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // B3: brick_presets
  `CREATE TABLE IF NOT EXISTS brick_presets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    yaml TEXT NOT NULL,
    is_core INTEGER DEFAULT 0,
    labels TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // B4: brick_links
  `CREATE TABLE IF NOT EXISTS brick_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workflow_id INTEGER REFERENCES brick_presets(id),
    from_block TEXT NOT NULL,
    to_block TEXT NOT NULL,
    link_type TEXT NOT NULL DEFAULT 'sequential',
    condition TEXT,
    judge TEXT,
    cron TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // B5: brick_executions
  `CREATE TABLE IF NOT EXISTS brick_executions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    preset_id INTEGER REFERENCES brick_presets(id),
    feature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    current_block TEXT,
    blocks_state TEXT,
    engine_workflow_id TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL
  )`,

  // B6: brick_execution_logs
  `CREATE TABLE IF NOT EXISTS brick_execution_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER REFERENCES brick_executions(id),
    event_type TEXT NOT NULL,
    block_id TEXT,
    data TEXT,
    timestamp TEXT NOT NULL
  )`,

  // B7: brick_gate_results
  `CREATE TABLE IF NOT EXISTS brick_gate_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    execution_id INTEGER REFERENCES brick_executions(id),
    block_id TEXT NOT NULL,
    handler_type TEXT NOT NULL,
    passed INTEGER,
    detail TEXT,
    executed_at TEXT NOT NULL
  )`,

  // B8: brick_learning_proposals
  `CREATE TABLE IF NOT EXISTS brick_learning_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    axis TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    pattern TEXT,
    confidence INTEGER,
    target_file TEXT,
    diff TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by TEXT,
    reviewed_at TEXT,
    reject_reason TEXT,
    created_at TEXT NOT NULL
  )`,
];

const createIndexStatements = [
  `CREATE INDEX IF NOT EXISTS idx_tickets_feature ON tickets(feature)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status)`,
  `CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_team, status)`,
  `CREATE INDEX IF NOT EXISTS idx_runs_agent ON heartbeat_runs(agent_id, started_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_events(agent_id, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cost_model ON cost_events(model, occurred_at)`,
  `CREATE INDEX IF NOT EXISTS idx_steps_chain ON workflow_steps(chain_id, step_order)`,
  `CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_events_target ON events(target_type, target_id)`,
  `CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(read, created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_agent ON knowledge_entries(agent_id, category)`,
  `CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_entries(category, learned_at)`,

  // Brick 인덱스
  `CREATE INDEX IF NOT EXISTS idx_brick_links_workflow ON brick_links(workflow_id)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_brick_links_pair ON brick_links(workflow_id, from_block, to_block)`,
];

export function createSchema(sqlite: { exec: (sql: string) => void }) {
  for (const stmt of createTableStatements) {
    sqlite.exec(stmt);
  }
  for (const stmt of createIndexStatements) {
    sqlite.exec(stmt);
  }
}
