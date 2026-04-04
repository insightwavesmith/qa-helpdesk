-- Brick Phase 2: 멀티유저 + RBAC 스키마

-- 워크스페이스
CREATE TABLE IF NOT EXISTS workspaces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 사용자
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'viewer',
    workspace_id INTEGER NOT NULL DEFAULT 1,
    email TEXT UNIQUE,
    provider TEXT DEFAULT 'local',
    avatar_url TEXT,
    is_approved INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    last_login_at INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- 세션
CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    ip_address TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- API 키 (사용자 + 에이전트 통합)
CREATE TABLE IF NOT EXISTS api_keys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key_hash TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    owner_type TEXT NOT NULL DEFAULT 'user',
    owner_id INTEGER NOT NULL,
    workspace_id INTEGER NOT NULL,
    scopes TEXT NOT NULL DEFAULT '["viewer"]',
    expires_at INTEGER,
    revoked_at INTEGER,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- 등록된 에이전트
CREATE TABLE IF NOT EXISTS agents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    adapter_type TEXT NOT NULL,
    workspace_id INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'offline',
    last_heartbeat INTEGER,
    config TEXT,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE(name, workspace_id),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id)
);

-- workspace → brick project 매핑
-- (workspaces 테이블에 brick_project 컬럼 추가는 마이그레이션 섹션 참조)

-- 알림
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recipient_id INTEGER,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    source_type TEXT,
    source_id TEXT,
    read_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id, read_at);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_users_workspace ON users(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON user_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);

-- 기본 워크스페이스 (최초 기동 시)
INSERT OR IGNORE INTO workspaces (id, name, slug) VALUES (1, 'Default', 'default');

-- ── 마이그레이션 (기존 DB 호환) ──────────────────────────────────────

-- Google Sign-In 확장 (기존 users 테이블에 컬럼 추가)
-- ALTER TABLE users ADD COLUMN email TEXT UNIQUE;
-- ALTER TABLE users ADD COLUMN provider TEXT DEFAULT 'local';
-- ALTER TABLE users ADD COLUMN avatar_url TEXT;
-- ALTER TABLE users ADD COLUMN is_approved INTEGER DEFAULT 1;

-- workspace → brick project 매핑
-- ALTER TABLE workspaces ADD COLUMN brick_project TEXT;
