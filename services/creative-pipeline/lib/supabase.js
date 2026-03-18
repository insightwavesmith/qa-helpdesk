'use strict';
/**
 * Supabase REST 공용 헬퍼
 * process.env.NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 사용
 */

const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error('[supabase] NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요');
  process.exit(1);
}

/**
 * Supabase REST GET
 * @param {string} path - /rest/v1 이하 경로 (예: /ad_creative_embeddings?select=*)
 * @returns {Promise<any[]>}
 */
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

/**
 * Supabase REST POST (UPSERT 포함)
 * @param {string} table - 테이블명
 * @param {object|object[]} row - 삽입할 행(들)
 * @param {string|null} onConflict - 충돌 컬럼 (UPSERT 시 사용)
 * @returns {Promise<{ok: boolean, status: number, text?: string}>}
 */
async function sbPost(table, row, onConflict = null) {
  const url = onConflict
    ? `${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`
    : `${SB_URL}/rest/v1/${table}`;
  const body = Array.isArray(row) ? row : row;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: res.ok ? '' : await res.text() };
}

module.exports = { sbGet, sbPost };
