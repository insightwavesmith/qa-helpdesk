/**
 * Cloud SQL PostgreSQL 연결 풀
 * Phase 4: Supabase → Cloud SQL 이관
 */
import { Pool } from "pg";

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: { rejectUnauthorized: false },
    });

    pool.on("error", (err) => {
      console.error("[CloudSQL] Pool error:", err.message);
    });
  }
  return pool;
}

export async function query(text: string, params?: unknown[]) {
  const p = getPool();
  const start = Date.now();
  const result = await p.query(text, params);
  const duration = Date.now() - start;
  if (duration > 1000) {
    console.warn(`[CloudSQL] Slow query (${duration}ms):`, text.slice(0, 100));
  }
  return result;
}
