#!/usr/bin/env node
/**
 * Phase C: 만료 소재 마킹
 *
 * media_url IS NULL AND storage_url IS NULL인 creative_media를
 * is_active = false로 마킹하여 커버리지 계산 분모에서 제외.
 *
 * Usage:
 *   node scripts/mark-expired-media.mjs
 *   node scripts/mark-expired-media.mjs --dry-run
 */

import pg from "pg";
import { loadEnv } from "./lib/env.mjs";

const env = loadEnv();
const DRY_RUN = process.argv.includes("--dry-run");

const pool = new pg.Pool({
  connectionString: env.DATABASE_URL || process.env.DATABASE_URL,
  max: 5,
});

async function main() {
  const client = await pool.connect();

  try {
    // 1. is_active 컬럼 존재 확인 + 없으면 추가
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'creative_media' AND column_name = 'is_active'
    `);

    if (colCheck.rows.length === 0) {
      console.log("[mark-expired] is_active 컬럼 추가 중...");
      if (!DRY_RUN) {
        await client.query(`
          ALTER TABLE creative_media
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
        `);
        console.log("[mark-expired] is_active 컬럼 추가 완료");
      } else {
        console.log("[mark-expired] [dry-run] ALTER TABLE 스킵");
      }
    } else {
      console.log("[mark-expired] is_active 컬럼 이미 존재");
    }

    // 2. 대상 조회: media_url IS NULL AND storage_url IS NULL
    const targets = await client.query(`
      SELECT cm.id, cm.creative_id, cm.media_type, c.ad_id, c.account_id
      FROM creative_media cm
      JOIN creatives c ON c.id = cm.creative_id
      WHERE cm.media_url IS NULL
        AND cm.storage_url IS NULL
        AND (cm.is_active IS NULL OR cm.is_active = true)
      ORDER BY c.account_id, cm.id
    `);

    console.log(`[mark-expired] 대상: ${targets.rows.length}건`);

    if (targets.rows.length === 0) {
      console.log("[mark-expired] 마킹 대상 없음. 완료.");
      return;
    }

    // 계정별 요약
    const byAccount = {};
    for (const row of targets.rows) {
      const acct = row.account_id || "unknown";
      byAccount[acct] = (byAccount[acct] || 0) + 1;
    }
    console.log("[mark-expired] 계정별 분포:");
    for (const [acct, cnt] of Object.entries(byAccount)) {
      console.log(`  ${acct}: ${cnt}건`);
    }

    // 3. is_active = false 업데이트
    const ids = targets.rows.map((r) => r.id);

    if (!DRY_RUN) {
      const result = await client.query(
        `UPDATE creative_media SET is_active = false WHERE id = ANY($1::uuid[])`,
        [ids]
      );
      console.log(`[mark-expired] ${result.rowCount}건 is_active = false 마킹 완료`);
    } else {
      console.log(`[mark-expired] [dry-run] ${ids.length}건 마킹 예정 (실행 안 함)`);
    }

    // 4. 결과 요약
    const stats = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = true OR is_active IS NULL) as active,
        COUNT(*) FILTER (WHERE is_active = false) as expired,
        COUNT(*) FILTER (WHERE storage_url IS NOT NULL) as has_storage,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL) as has_embedding
      FROM creative_media
    `);
    const s = stats.rows[0];
    console.log("\n=== creative_media 현황 ===");
    console.log(`  전체: ${s.total}건`);
    console.log(`  활성: ${s.active}건`);
    console.log(`  만료: ${s.expired}건`);
    console.log(`  GCS 보유: ${s.has_storage}건`);
    console.log(`  임베딩 완료: ${s.has_embedding}건`);
    const activeCoverage =
      s.active > 0
        ? ((s.has_embedding / s.active) * 100).toFixed(1)
        : "N/A";
    console.log(`  유효 커버리지: ${activeCoverage}%`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[mark-expired] 오류:", err);
  process.exit(1);
});
