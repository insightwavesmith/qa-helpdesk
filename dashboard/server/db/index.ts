import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { createSchema } from './create-schema.js';

const DB_PATH = process.env.DB_PATH || '.data/bkit.db';

// .data/ 디렉토리 자동 생성
const dir = dirname(DB_PATH);
if (!existsSync(dir)) {
  mkdirSync(dir, { recursive: true });
}

const sqlite: DatabaseType = new Database(DB_PATH);

// WAL 모드 활성화 (동시 읽기 성능 향상)
sqlite.pragma('journal_mode = WAL');
sqlite.pragma('busy_timeout = 5000');
sqlite.pragma('foreign_keys = ON');

// 테이블/인덱스 자동 생성 (IF NOT EXISTS)
createSchema(sqlite);

export const db = drizzle(sqlite, { schema });
export { sqlite };
export default db;
