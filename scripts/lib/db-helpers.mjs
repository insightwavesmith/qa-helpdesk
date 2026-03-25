/**
 * 스크립트용 DB 헬퍼 (Cloud SQL 전용)
 *
 * pg Pool로 직접 쿼리. PostgREST 호환 인터페이스 유지.
 * → 각 스크립트에서 sbGet/sbPatch/sbPost/sbUpsert/sbDelete 그대로 사용 가능
 *
 * Usage:
 *   import { sbGet, sbPatch, sbPost, sbUpsert, sbDelete } from './lib/db-helpers.mjs';
 */

import { loadEnv, getSupabaseConfig } from "./env.mjs";

const env = loadEnv();

// Storage 스크립트 호환용 (DB 쿼리는 Cloud SQL 전용)
const { SB_URL, SB_KEY } = getSupabaseConfig();

import pg from "pg";
const _pool = new pg.Pool({
  connectionString: env.DATABASE_URL || process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
});
console.log("[DB] Cloud SQL 모드");

// ── PostgREST 파서 ──

/**
 * PostgREST 필터를 SQL WHERE 절로 변환
 * 예: "id=eq.123&media_type=eq.IMAGE" → { where: ' WHERE "id" = $1 AND "media_type" = $2', params: ['123','IMAGE'] }
 */
function parseFilters(queryStr, startIdx = 1) {
  if (!queryStr) return { where: "", params: [], nextIdx: startIdx };
  const parts = [];
  const params = [];
  let idx = startIdx;

  const reserved = new Set(["select", "order", "limit", "offset", "on_conflict"]);

  for (const segment of queryStr.split("&")) {
    const eqPos = segment.indexOf("=");
    if (eqPos === -1) continue;
    const col = decodeURIComponent(segment.slice(0, eqPos));
    if (reserved.has(col)) continue;
    const rest = segment.slice(eqPos + 1);

    if (rest.startsWith("eq.")) {
      parts.push(`"${col}" = $${idx++}`);
      params.push(rest.slice(3));
    } else if (rest.startsWith("neq.")) {
      parts.push(`"${col}" != $${idx++}`);
      params.push(rest.slice(4));
    } else if (rest.startsWith("is.null")) {
      parts.push(`"${col}" IS NULL`);
    } else if (rest.startsWith("not.is.null")) {
      parts.push(`"${col}" IS NOT NULL`);
    } else if (rest.startsWith("gte.")) {
      parts.push(`"${col}" >= $${idx++}`);
      params.push(rest.slice(4));
    } else if (rest.startsWith("lte.")) {
      parts.push(`"${col}" <= $${idx++}`);
      params.push(rest.slice(4));
    } else if (rest.startsWith("gt.")) {
      parts.push(`"${col}" > $${idx++}`);
      params.push(rest.slice(3));
    } else if (rest.startsWith("lt.")) {
      parts.push(`"${col}" < $${idx++}`);
      params.push(rest.slice(3));
    } else if (rest.startsWith("like.")) {
      parts.push(`"${col}" LIKE $${idx++}`);
      params.push(rest.slice(5).replace(/\*/g, "%"));
    } else if (rest.startsWith("ilike.")) {
      parts.push(`"${col}" ILIKE $${idx++}`);
      params.push(rest.slice(6).replace(/\*/g, "%"));
    } else if (rest.startsWith("in.")) {
      const inner = rest.slice(4, -1);
      const vals = inner.split(",");
      const placeholders = vals.map(() => `$${idx++}`);
      parts.push(`"${col}" IN (${placeholders.join(",")})`);
      params.push(...vals);
    }
  }

  return {
    where: parts.length > 0 ? ` WHERE ${parts.join(" AND ")}` : "",
    params,
    nextIdx: idx,
  };
}

/**
 * PostgREST GET 경로를 SQL SELECT로 변환
 */
function parseGetPath(path) {
  const [tablePart, queryString] = path.split("?");
  const table = tablePart.replace(/^\//, "");
  const params = new URLSearchParams(queryString || "");

  const select = params.get("select") || "*";
  const order = params.get("order");
  const limit = params.get("limit");
  const offset = params.get("offset");

  const filterStr = (queryString || "")
    .split("&")
    .filter((s) => {
      const key = s.split("=")[0];
      return !["select", "order", "limit", "offset", "on_conflict"].includes(key);
    })
    .join("&");

  const { where, params: filterParams } = parseFilters(filterStr);

  let sql = `SELECT ${select} FROM "${table}"${where}`;

  if (order) {
    const orderParts = order.split(",").map((o) => {
      const [col, dir] = o.split(".");
      return `"${col}" ${(dir || "asc").toUpperCase()}`;
    });
    sql += ` ORDER BY ${orderParts.join(", ")}`;
  }

  if (limit) sql += ` LIMIT ${parseInt(limit)}`;
  if (offset) sql += ` OFFSET ${parseInt(offset)}`;

  return { sql, params: filterParams, table };
}

// ── 공개 API (PostgREST 호환 인터페이스) ──

/**
 * sbGet — SELECT
 * @param {string} path — 예: "/creative_media?select=id,name&media_type=eq.IMAGE&order=created_at.desc&limit=100"
 * @returns {Promise<any[]>}
 */
export async function sbGet(path) {
  const { sql, params } = parseGetPath(path);
  const result = await _pool.query(sql, params);
  return result.rows;
}

/**
 * sbPatch — UPDATE
 * @param {string} table — 테이블명
 * @param {string} query — 필터 쿼리 (예: "id=eq.123")
 * @param {object} body — 업데이트할 데이터
 */
export async function sbPatch(table, query, body) {
  const { where, params, nextIdx } = parseFilters(query);
  const setClauses = [];
  let idx = nextIdx;
  for (const [col, val] of Object.entries(body)) {
    if (val !== undefined && val !== null && typeof val === "object") {
      setClauses.push(`"${col}" = $${idx++}::jsonb`);
      params.push(JSON.stringify(val));
    } else {
      setClauses.push(`"${col}" = $${idx++}`);
      params.push(val);
    }
  }
  const sql = `UPDATE "${table}" SET ${setClauses.join(", ")}${where}`;
  try {
    await _pool.query(sql, params);
    return { ok: true };
  } catch (err) {
    return { ok: false, status: 500, body: err.message };
  }
}

/**
 * sbPost — INSERT (onConflict 지정 시 UPSERT)
 * @param {string} table — 테이블명
 * @param {object|object[]} rows — 삽입할 데이터
 * @param {string} [onConflict] — ON CONFLICT 컬럼 (upsert용)
 */
export async function sbPost(table, rows, onConflict) {
  const rowArr = Array.isArray(rows) ? rows : [rows];

  try {
    for (const row of rowArr) {
      const cols = Object.keys(row);
      const vals = [];
      const placeholders = [];
      let idx = 1;
      for (const col of cols) {
        const val = row[col];
        if (val !== undefined && val !== null && typeof val === "object") {
          placeholders.push(`$${idx++}::jsonb`);
          vals.push(JSON.stringify(val));
        } else {
          placeholders.push(`$${idx++}`);
          vals.push(val);
        }
      }

      let sql;
      if (onConflict) {
        const updateCols = cols.filter((c) => c !== onConflict);
        const updateClause = updateCols
          .map((c) => `"${c}" = EXCLUDED."${c}"`)
          .join(", ");
        sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")})
            VALUES (${placeholders.join(",")})
            ON CONFLICT ("${onConflict}") DO UPDATE SET ${updateClause}`;
      } else {
        sql = `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")})
            VALUES (${placeholders.join(",")})`;
      }
      await _pool.query(sql, vals);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, status: 500, body: err.message };
  }
}

/**
 * sbUpsert — INSERT ... ON CONFLICT UPDATE
 */
export async function sbUpsert(table, rows, onConflict) {
  const result = await sbPost(table, rows, onConflict);
  if (!result.ok) {
    throw new Error(`sbUpsert ${result.status}: ${result.body}`);
  }
}

/**
 * sbDelete — DELETE
 * @param {string} table — 테이블명
 * @param {string} filter — 필터 쿼리 (예: "id=eq.123")
 */
export async function sbDelete(table, filter) {
  const { where, params } = parseFilters(filter);
  const sql = `DELETE FROM "${table}"${where}`;
  try {
    await _pool.query(sql, params);
    return { ok: true };
  } catch (err) {
    return { ok: false, status: 500, body: err.message };
  }
}

/**
 * 직접 SQL 쿼리
 */
export async function rawQuery(sql, params) {
  const result = await _pool.query(sql, params);
  return result.rows;
}

/**
 * Pool 종료
 */
export async function closePool() {
  if (_pool) await _pool.end();
}

// 환경 설정 re-export (Storage 스크립트 호환)
export { env, SB_URL, SB_KEY };
