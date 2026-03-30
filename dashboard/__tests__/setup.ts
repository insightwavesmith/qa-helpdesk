import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from '../server/db/schema.js';
import { createSchema } from '../server/db/create-schema.js';
import { beforeEach } from 'vitest';

// 인메모리 SQLite로 테스트 DB 생성
const testSqlite = new Database(':memory:');
testSqlite.pragma('foreign_keys = ON');

export const testDb = drizzle(testSqlite, { schema });

// 최초 스키마 생성
createSchema(testSqlite);

export function cleanDb() {
  const tables = [
    'knowledge_entries', 'routines',
    'notifications', 'events', 'pdca_features', 'workflow_steps',
    'budget_incidents', 'budget_policies', 'cost_events',
    'heartbeat_runs', 'tickets', 'agents', 'workflow_chains',
  ];
  for (const table of tables) {
    testSqlite.exec(`DELETE FROM ${table}`);
  }
}

// 각 테스트 전 DB 클린
beforeEach(() => {
  cleanDb();
});
