/**
 * 스크립트용 이중 모드 DB 헬퍼 (Cloud SQL / Supabase REST)
 *
 * USE_CLOUD_SQL=true → pg Pool 직접 쿼리
 * USE_CLOUD_SQL=false → Supabase PostgREST REST API
 *
 * 기존 sbGet/sbPatch/sbPost/sbUpsert/sbDelete 와 동일한 인터페이스 유지
 * → 각 스크립트에서 import만 변경하면 됨
 *
 * Usage:
 *   import { sbGet, sbPatch, sbPost, sbUpsert, sbDelete } from './lib/db-helpers.mjs';
 */

import { getSupabaseConfig, useCloudSql } from "./env.mjs";

const { SB_URL, SB_KEY, env } = getSupabaseConfig();
const USE_CLOUD_SQL = useCloudSql();

let _pool = null;

if (USE_CLOUD_SQL) {
  const pg = await import("pg");
  _pool = new pg.default.Pool({
    connectionString: env.DATABASE_URL || process.env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
  });
  console.log("[DB] Cloud SQL 모드");
} else {
  console.log("[DB] Supabase REST 모드");
}

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

  // URLSearchParams 대신 수동 파싱 (select, order, limit, offset 등 예약어 스킵)
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
      // in.(a,b,c)
      const inner = rest.slice(4, -1); // remove "in.(" and ")"
      const vals = inner.split(",");
      const placeholders = vals.map((v) => `$${idx++}`);
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
 * 예: "/creative_media?select=id,name&media_type=eq.IMAGE&order=created_at.desc&limit=100"
 */
function parseGetPath(path) {
  const [tablePart, queryString] = path.split("?");
  const table = tablePart.replace(/^\//, "");
  const params = new URLSearchParams(queryString || "");

  const select = params.get("select") || "*";
  const order = params.get("order");
  const limit = params.get("limit");
  const offset = params.get("offset");

  // 필터만 추출 (예약어 제외)
  const filterStr = (queryString || "")
    .split("&")
    .filter((s) => {
      const key = s.split("=")[0];
      return !["select", "order", "limit", "offset", "on_conflict"].includes(key);
    })
    .join("&");

  const { where, params: filterParams, nextIdx } = parseFilters(filterStr);

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

// ── 공개 API (Supabase REST 호환) ──

/**
 * sbGet — PostgREST GET 호환
 * @param {string} path — 예: "/creative_media?select=id,name&media_type=eq.IMAGE&order=created_at.desc&limit=100"
 * @returns {Promise<any[]>}
 */
export async function sbGet(path) {
  if (USE_CLOUD_SQL) {
    const { sql, params } = parseGetPath(path);
    const result = await _pool.query(sql, params);
    return result.rows;
  }

  // Supabase REST fallback
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * sbPatch — PostgREST PATCH 호환
 * @param {string} table — 테이블명
 * @param {string} query — 필터 쿼리 (예: "id=eq.123")
 * @param {object} body — 업데이트할 데이터
 * @returns {Promise<{ok: boolean, status?: number, body?: string}>}
 */
export async function sbPatch(table, query, body) {
  if (USE_CLOUD_SQL) {
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

  // Supabase REST fallback
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

/**
 * sbPost — PostgREST POST 호환
 * @param {string} table — 테이블명
 * @param {object|object[]} rows — 삽입할 데이터
 * @param {string} [onConflict] — ON CONFLICT 컬럼 (upsert용)
 * @returns {Promise<{ok: boolean, status?: number, body?: string}>}
 */
export async function sbPost(table, rows, onConflict) {
  const rowArr = Array.isArray(rows) ? rows : [rows];

  if (USE_CLOUD_SQL) {
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

  // Supabase REST fallback
  const url = onConflict
    ? `${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`
    : `${SB_URL}/rest/v1/${table}`;
  const prefer = onConflict
    ? "resolution=merge-duplicates,return=minimal"
    : "return=minimal";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: prefer,
    },
    body: JSON.stringify(rowArr),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

/**
 * sbUpsert — PostgREST UPSERT 호환 (sbPost + onConflict 래퍼)
 * @param {string} table — 테이블명
 * @param {object|object[]} rows — 삽입/업데이트할 데이터
 * @param {string} onConflict — ON CONFLICT 컬럼
 */
export async function sbUpsert(table, rows, onConflict) {
  const result = await sbPost(table, rows, onConflict);
  if (!result.ok) {
    throw new Error(`sbUpsert ${result.status}: ${result.body}`);
  }
}

/**
 * sbDelete — PostgREST DELETE 호환
 * @param {string} table — 테이블명
 * @param {string} filter — 필터 쿼리 (예: "id=eq.123")
 * @returns {Promise<{ok: boolean, status?: number, body?: string}>}
 */
export async function sbDelete(table, filter) {
  if (USE_CLOUD_SQL) {
    const { where, params } = parseFilters(filter);
    const sql = `DELETE FROM "${table}"${where}`;
    try {
      await _pool.query(sql, params);
      return { ok: true };
    } catch (err) {
      return { ok: false, status: 500, body: err.message };
    }
  }

  // Supabase REST fallback
  const res = await fetch(`${SB_URL}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

/**
 * 직접 SQL 쿼리 (Cloud SQL 전용, Supabase 모드에서는 에러)
 */
export async function rawQuery(sql, params) {
  if (!USE_CLOUD_SQL) {
    throw new Error("rawQuery는 Cloud SQL 모드에서만 사용 가능");
  }
  const result = await _pool.query(sql, params);
  return result.rows;
}

/**
 * Pool 종료
 */
export async function closePool() {
  if (_pool) await _pool.end();
}

// 환경 설정 re-export
export { SB_URL, SB_KEY, env, USE_CLOUD_SQL };
