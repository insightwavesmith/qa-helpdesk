#!/usr/bin/env node
// scripts/embed-creatives-job.mjs
import { pool, query } from "./lib/cloud-sql.mjs";
import { generateEmbedding } from "./lib/gemini-embed.mjs";

const BATCH_SIZE = 50;
const DELAY_MS = 500;
const BATCH_DELAY_MS = 2000;
const MAX_ITERATIONS = 100;  // 안전장치: 50 × 100 = 5,000건 상한
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "gemini-embedding-2-preview";

async function main() {
  console.log("[embed-job] 시작");
  const startTime = Date.now();

  // ── Advisory Lock 획득 (동시 실행 방지) ──
  const locked = await acquireLock();
  if (!locked) {
    console.log("[embed-job] 다른 인스턴스 실행 중 — 즉시 종료");
    await pool.end();
    process.exit(0);
  }

  try {
    // ── Phase A: content_hash 기반 임베딩 재사용 ──
    const reuseCount = await phaseHashReuse();
    console.log(`[embed-job] Phase A 완료: hash 재사용 ${reuseCount}건`);

    // ── Phase B: 배치 루프 임베딩 ──
    const embedStats = await phaseBatchEmbed();
    console.log(`[embed-job] Phase B 완료: ${JSON.stringify(embedStats)}`);

    // ── 최종 리포트 ──
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const remaining = await countRemaining();

    console.log("──────────────────────────────────");
    console.log(`[embed-job] 완료 (${elapsed}초)`);
    console.log(`  hash 재사용: ${reuseCount}건`);
    console.log(`  신규 임베딩: ${embedStats.embedded}건`);
    console.log(`  오류: ${embedStats.errors}건`);
    console.log(`  잔여 미임베딩: ${remaining}건`);
    console.log("──────────────────────────────────");

    await releaseLock();
    await pool.end();
    process.exit(embedStats.errors > embedStats.embedded ? 1 : 0);
  } catch (err) {
    await releaseLock().catch(() => {});
    throw err;
  }
}

// ── Advisory Lock ──

async function acquireLock() {
  const result = await query(
    `SELECT pg_try_advisory_lock(hashtext('embed-creatives-job')) as acquired`
  );
  return result[0]?.acquired === true;
}

async function releaseLock() {
  await query(`SELECT pg_advisory_unlock(hashtext('embed-creatives-job'))`);
}

/**
 * Phase A: content_hash가 동일한 row에서 임베딩 복사
 * Gemini API 호출 없이 DB 복사만으로 해결 가능한 건 먼저 처리
 */
async function phaseHashReuse() {
  const missing = await query(`
    SELECT cm.id, cm.content_hash
    FROM creative_media cm
    WHERE cm.embedding IS NULL
      AND cm.content_hash IS NOT NULL
      AND cm.is_active = true
  `);

  let count = 0;
  for (const row of missing) {
    const donors = await query(`
      SELECT embedding, embedding_model, embedded_at
      FROM creative_media
      WHERE content_hash = $1
        AND embedding IS NOT NULL
        AND id != $2
      LIMIT 1
    `, [row.content_hash, row.id]);

    if (donors.length > 0) {
      await query(`
        UPDATE creative_media
        SET embedding = $1, embedding_model = $2, embedded_at = $3, updated_at = NOW()
        WHERE id = $4
      `, [donors[0].embedding, donors[0].embedding_model, donors[0].embedded_at, row.id]);
      count++;
    }
  }
  return count;
}

/**
 * Phase B: 배치 루프 — 미임베딩 row를 50개씩 처리, 전량 완료까지 반복
 */
async function phaseBatchEmbed() {
  const stats = { processed: 0, embedded: 0, errors: 0, iterations: 0 };

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    // 배치 조회: embedding 또는 text_embedding이 NULL인 row
    const batch = await query(`
      SELECT id, media_url, ad_copy, embedding, text_embedding
      FROM creative_media
      WHERE (embedding IS NULL OR text_embedding IS NULL)
        AND is_active = true
        AND media_url IS NOT NULL
      LIMIT $1
    `, [BATCH_SIZE]);

    if (batch.length === 0) {
      console.log(`[embed-job] 배치 ${iter + 1}: 처리할 항목 없음 — 루프 종료`);
      break;
    }

    console.log(`[embed-job] 배치 ${iter + 1}: ${batch.length}건 처리 시작`);

    for (const row of batch) {
      const updates = {};

      // 이미지 임베딩
      if (!row.embedding && row.media_url) {
        try {
          updates.embedding = await generateEmbedding({ imageUrl: row.media_url });
        } catch (err) {
          console.error(`[embed-job] 이미지 임베딩 실패 (id=${row.id}): ${err.message}`);
          stats.errors++;
        }
      }

      // 텍스트 임베딩
      if (!row.text_embedding && row.ad_copy && row.ad_copy.trim().length > 5) {
        try {
          updates.text_embedding = await generateEmbedding(row.ad_copy);
        } catch (err) {
          console.error(`[embed-job] 텍스트 임베딩 실패 (id=${row.id}): ${err.message}`);
          stats.errors++;
        }
      }

      // DB 업데이트
      if (updates.embedding || updates.text_embedding) {
        const setClauses = [];
        const params = [];
        let idx = 1;

        if (updates.embedding) {
          setClauses.push(`embedding = $${idx}::vector`);
          params.push(JSON.stringify(updates.embedding));
          idx++;
        }
        if (updates.text_embedding) {
          setClauses.push(`text_embedding = $${idx}::vector`);
          params.push(JSON.stringify(updates.text_embedding));
          idx++;
        }
        setClauses.push(`embedding_model = $${idx}`);
        params.push(EMBEDDING_MODEL);
        idx++;
        setClauses.push(`embedded_at = NOW()`);
        setClauses.push(`updated_at = NOW()`);

        params.push(row.id);
        await query(
          `UPDATE creative_media SET ${setClauses.join(", ")} WHERE id = $${idx}`,
          params
        );
        stats.embedded++;
      }

      stats.processed++;
      await sleep(DELAY_MS);
    }

    stats.iterations++;

    // 진행률 로깅
    const remaining = await countRemaining();
    console.log(`[embed-job] 배치 ${iter + 1} 완료: 누적 ${stats.embedded}건 임베딩, 잔여 ${remaining}건`);

    if (remaining === 0) break;
    await sleep(BATCH_DELAY_MS);
  }

  return stats;
}

async function countRemaining() {
  const result = await query(`
    SELECT COUNT(*) as cnt
    FROM creative_media
    WHERE (embedding IS NULL OR text_embedding IS NULL)
      AND is_active = true
      AND media_url IS NOT NULL
  `);
  return parseInt(result[0]?.cnt || "0", 10);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

main().catch(err => {
  console.error("[embed-job] Fatal:", err);
  pool.end();
  process.exit(1);
});
