/**
 * 스크립트용 Cloud SQL 연결 헬퍼
 *
 * 기존 sbGet/sbPatch/sbPost (PostgREST REST API) 를
 * pg Pool 직접 쿼리로 대체.
 *
 * Usage:
 *   import { pool, query, getConfig } from './lib/cloud-sql.mjs';
 *   const rows = await query('SELECT * FROM profiles WHERE role = $1', ['admin']);
 */

import pg from "pg";
import { loadEnv } from "./env.mjs";

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL || process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL 필요 (.env.local 또는 환경변수)");
  process.exit(1);
}

export const pool = new pg.Pool({
  connectionString: DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});

/**
 * 쿼리 실행 + rows 반환
 */
export async function query(text, params) {
  const result = await pool.query(text, params);
  return result.rows;
}

/**
 * 단일 행 조회
 */
export async function queryOne(text, params) {
  const result = await pool.query(text, params);
  return result.rows[0] || null;
}

/**
 * UPDATE 실행 + rowCount 반환
 */
export async function execute(text, params) {
  const result = await pool.query(text, params);
  return result.rowCount;
}

/**
 * Cloud SQL 사용 여부 확인
 */
export function useCloudSql() {
  const flag = env.USE_CLOUD_SQL || process.env.USE_CLOUD_SQL;
  return flag === "true";
}

/**
 * 환경 설정 반환
 */
export function getConfig() {
  return {
    DATABASE_URL,
    GEMINI_API_KEY: env.GEMINI_API_KEY || process.env.GEMINI_API_KEY,
    env,
  };
}
