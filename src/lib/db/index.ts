/**
 * Cloud SQL 클라이언트 팩토리
 *
 * Supabase 호환 인터페이스를 제공하여 기존 코드 최소 변경으로 전환.
 * 사용법: const db = createDbClient();
 *         const { data, error } = await db.from("profiles").select("*").eq("id", userId).single();
 *
 * 환경변수:
 * - DATABASE_URL: Cloud SQL 연결 문자열
 */
import { Pool } from "pg";
import { getPool } from "./pool";
import { PostgresQueryBuilder, PostgresRpcBuilder } from "./query-builder";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DbClient {
  from: <T = any>(table: string) => PostgresQueryBuilder<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
  rpc: <T = any>(funcName: string, params?: Record<string, unknown>) => PostgresRpcBuilder<T>; // eslint-disable-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: <T = any>(table: string) => new PostgresQueryBuilder<T>(pool, table),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rpc: <T = any>(funcName: string, params?: Record<string, unknown>) =>
      new PostgresRpcBuilder<T>(pool, funcName, params),
  };

  return cachedClient;
}

/**
 * 서비스 역할 클라이언트 (Server Actions, API Routes — RLS 우회)
 * 기존 createServiceClient() 호환 — Cloud SQL 직접 연결
 */
export function createServiceClient(): DbClient {
  return createDbClient();
}

export { getPool, query } from "./pool";
export { PostgresQueryBuilder, PostgresRpcBuilder } from "./query-builder";
