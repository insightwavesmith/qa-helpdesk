/**
 * Cloud SQL 클라이언트 팩토리
 *
 * Supabase 호환 인터페이스를 제공하여 기존 코드 최소 변경으로 전환.
 * 사용법: const db = createDbClient();
 *         const { data, error } = await db.from("profiles").select("*").eq("id", userId).single();
 *
 * 환경변수:
 * - DATABASE_URL: Cloud SQL 연결 문자열
 * - USE_CLOUD_SQL: "true"이면 Cloud SQL 사용, 아니면 Supabase 유지
 */
import { Pool } from "pg";
import { getPool } from "./pool";
import { PostgresQueryBuilder, PostgresRpcBuilder } from "./query-builder";

export interface DbClient {
  from: <T = Record<string, unknown>>(table: string) => PostgresQueryBuilder<T>;
  rpc: <T = Record<string, unknown>>(funcName: string, params?: Record<string, unknown>) => PostgresRpcBuilder<T>;
}

let cachedClient: DbClient | null = null;

/**
 * Cloud SQL 직접 연결 클라이언트 생성
 * Supabase의 .from().select().eq() 패턴 호환
 */
export function createDbClient(): DbClient {
  if (cachedClient) return cachedClient;

  const pool: Pool = getPool();

  cachedClient = {
    from: <T = Record<string, unknown>>(table: string) => new PostgresQueryBuilder<T>(pool, table),
    rpc: <T = Record<string, unknown>>(funcName: string, params?: Record<string, unknown>) =>
      new PostgresRpcBuilder<T>(pool, funcName, params),
  };

  return cachedClient;
}

/**
 * 환경변수 기반 클라이언트 선택
 * USE_CLOUD_SQL=true → Cloud SQL
 * 그 외 → Supabase (기존 로직)
 */
export function useCloudSql(): boolean {
  return process.env.USE_CLOUD_SQL === "true";
}

export { getPool, query } from "./pool";
export { PostgresQueryBuilder, PostgresRpcBuilder } from "./query-builder";
