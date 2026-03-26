/**
 * Cloud SQL PostgreSQL 연결 풀
 * Phase 4: Supabase → Cloud SQL 이관
 */
import { Pool, types } from "pg";

// pg 드라이버는 NUMERIC/DECIMAL을 문자열로 반환 → parseFloat 변환 필수
// OID 1700 = NUMERIC, OID 20 = BIGINT, OID 700 = FLOAT4, OID 701 = FLOAT8
types.setTypeParser(1700, (val: string) => parseFloat(val));
types.setTypeParser(20, (val: string) => parseInt(val, 10));
types.setTypeParser(700, (val: string) => parseFloat(val));
types.setTypeParser(701, (val: string) => parseFloat(val));

// pg 드라이버는 TIMESTAMP를 Date 객체로 반환 → 문자열 그대로 유지 (Supabase 호환)
// OID 1114 = TIMESTAMP, OID 1184 = TIMESTAMPTZ
types.setTypeParser(1114, (val: string) => val);
types.setTypeParser(1184, (val: string) => val);

// OID 1082 = DATE — 문자열 그대로 유지 (시간대 변환 방지)
types.setTypeParser(1082, (val: string) => val);

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const isUnixSocket = (process.env.DATABASE_URL || "").includes("/cloudsql/");
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ...(isUnixSocket ? {} : { ssl: { rejectUnauthorized: false } }),
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
