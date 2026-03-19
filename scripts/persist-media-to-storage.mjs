#!/usr/bin/env node
/**
 * 소재 미디어 영구 저장 스크립트 — Meta CDN URL → Supabase Storage
 *
 * Meta CDN URL (media_url, image_url, video_preview_url)은 시간이 지나면 만료됨.
 * 이 스크립트는 해당 URL에서 이미지를 다운로드하여 Supabase Storage에 영구 저장한다.
 *
 * Usage:
 *   node scripts/persist-media-to-storage.mjs [--limit N] [--dry-run] [--source own|competitor|all]
 *
 * Options:
 *   --limit N          최대 N건 처리 (기본: 100)
 *   --dry-run          다운로드만 하고 Storage 업로드 및 DB 업데이트 안 함
 *   --source           처리 대상 (own=자사 소재, competitor=경쟁사, all=둘 다, 기본: all)
 *
 * 환경변수 (이미 설정되어 있어야 함):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * ─────────────────────────────────────────────────────────────────────
 * DB 마이그레이션 (처음 실행 전 Supabase SQL Editor에서 실행):
 *
 * -- ad_creative_embeddings에 storage_url 추가
 * ALTER TABLE ad_creative_embeddings
 *   ADD COLUMN IF NOT EXISTS storage_url TEXT;
 *
 * -- competitor_ad_cache에 storage_url 추가
 * ALTER TABLE competitor_ad_cache
 *   ADD COLUMN IF NOT EXISTS storage_url TEXT;
 *
 * ─────────────────────────────────────────────────────────────────────
 *
 * Storage 버킷 레이아웃 (creatives 버킷):
 *   media/{ad_id}.jpg          — 자사 소재 이미지
 *   thumb/{ad_id}.jpg          — 자사 소재 동영상 썸네일
 *   competitor/{ad_archive_id}.jpg — 경쟁사 소재
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// ── .env.local 파싱 ──────────────────────────────────────────────────
try {
  const raw = readFileSync(
    new URL("../.env.local", import.meta.url).pathname, "utf-8"
  );
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!process.env[k]) process.env[k] = v;
  }
} catch { /* .env.local 없으면 환경변수가 이미 설정된 것으로 가정 */ }

// ── 환경변수 ──────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error(
    "❌ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수 필요"
  );
  process.exit(1);
}

// ── CLI 인수 파싱 ──────────────────────────────────────────────────────
const args = process.argv.slice(2);

const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 100;

const DRY_RUN = args.includes("--dry-run");

const sourceIdx = args.indexOf("--source");
const SOURCE = sourceIdx >= 0 ? args[sourceIdx + 1] : "all";

if (!["own", "competitor", "all"].includes(SOURCE)) {
  console.error("❌ --source 옵션은 own, competitor, all 중 하나여야 합니다.");
  process.exit(1);
}

// ── Supabase 클라이언트 ───────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── 유틸리티 ─────────────────────────────────────────────────────────

/**
 * URL에서 이미지 다운로드 → Buffer 반환
 * @returns {Promise<Buffer|null>}
 */
async function downloadImage(url) {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(20_000),
      headers: {
        // Meta CDN은 일반 브라우저 User-Agent를 선호하는 경우가 있음
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
    });

    if (!res.ok) {
      console.warn(`    ⚠️  다운로드 실패 ${res.status}: ${url.slice(0, 80)}`);
      return null;
    }

    const contentType = res.headers.get("content-type") || "";

    // HTML이 반환되면 URL 만료 가능성 높음
    if (contentType.includes("text/html")) {
      console.warn(`    ⚠️  HTML 응답 (URL 만료 가능성): ${url.slice(0, 80)}`);
      return null;
    }

    const arrayBuf = await res.arrayBuffer();
    return { buffer: Buffer.from(arrayBuf), contentType };
  } catch (err) {
    console.warn(`    ⚠️  fetch 에러: ${err.message.slice(0, 100)}`);
    return null;
  }
}

/**
 * Buffer → Supabase Storage 업로드
 * @returns {Promise<string|null>} publicUrl 또는 null
 */
async function uploadToStorage(storagePath, buffer, contentType) {
  const mimeType =
    contentType && contentType.startsWith("image/")
      ? contentType.split(";")[0]
      : "image/jpeg";

  const { error } = await supabase.storage
    .from("creatives")
    .upload(storagePath, buffer, { contentType: mimeType, upsert: true });

  if (error) {
    console.warn(`    ⚠️  Storage 업로드 실패 (${storagePath}): ${error.message}`);
    return null;
  }

  const { data } = supabase.storage.from("creatives").getPublicUrl(storagePath);
  return data?.publicUrl || null;
}

/**
 * Promise.allSettled를 이용한 동시성 5 배치 처리
 * @param {T[]} items
 * @param {(item: T) => Promise<void>} fn
 */
async function processBatch(items, fn, concurrency = 5) {
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      await fn(items[i], i);
    }
  }

  await Promise.allSettled(
    Array.from({ length: concurrency }, () => worker())
  );
}

// ── 자사 소재 처리 ────────────────────────────────────────────────────

async function processOwnCreatives(limit) {
  console.log("\n── 자사 소재 (ad_creative_embeddings) ──────────────────────────");

  // storage_url이 없고 media_url이 있는 row 조회
  const { data: rows, error } = await supabase
    .from("ad_creative_embeddings")
    .select("id, ad_id, media_url, media_type")
    .not("media_url", "is", null)
    .or("storage_url.is.null")
    .eq("is_active", true)
    .limit(limit);

  if (error) {
    // storage_url 컬럼이 없을 때의 안내
    if (error.message?.includes("storage_url")) {
      console.error(
        "❌ storage_url 컬럼이 없습니다. 상단 주석의 SQL 마이그레이션을 먼저 실행하세요."
      );
    } else {
      console.error(`❌ 조회 실패: ${error.message}`);
    }
    return { processed: 0, uploaded: 0, skipped: 0, errors: 0 };
  }

  if (!rows || rows.length === 0) {
    console.log("✅ 처리할 자사 소재 없음 (모두 저장 완료됨)");
    return { processed: 0, uploaded: 0, skipped: 0, errors: 0 };
  }

  console.log(`대상: ${rows.length}건`);

  const stats = { processed: 0, uploaded: 0, skipped: 0, errors: 0 };

  await processBatch(rows, async (row, i) => {
    const adId = row.ad_id;
    const isVideo = row.media_type === "VIDEO";
    // 동영상은 thumb/, 이미지는 media/ 경로에 저장
    const storagePath = isVideo ? `thumb/${adId}.jpg` : `media/${adId}.jpg`;

    process.stdout.write(
      `  [${i + 1}/${rows.length}] ${adId} (${isVideo ? "VIDEO" : "IMAGE"})... `
    );

    // 다운로드
    const result = await downloadImage(row.media_url);
    if (!result) {
      console.log("스킵 (다운로드 실패)");
      stats.skipped++;
      return;
    }

    stats.processed++;

    if (DRY_RUN) {
      console.log(`✅ dry-run (${Math.round(result.buffer.length / 1024)}KB)`);
      stats.uploaded++;
      return;
    }

    // Storage 업로드
    const publicUrl = await uploadToStorage(
      storagePath,
      result.buffer,
      result.contentType
    );

    if (!publicUrl) {
      console.log("❌ 업로드 실패");
      stats.errors++;
      return;
    }

    // DB 업데이트
    const { error: updateErr } = await supabase
      .from("ad_creative_embeddings")
      .update({ storage_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (updateErr) {
      console.log(`❌ DB 업데이트 실패: ${updateErr.message}`);
      stats.errors++;
    } else {
      console.log(`✅ ${Math.round(result.buffer.length / 1024)}KB → ${storagePath}`);
      stats.uploaded++;
    }
  });

  return stats;
}

// ── 경쟁사 소재 처리 ─────────────────────────────────────────────────

async function processCompetitorCreatives(limit) {
  console.log("\n── 경쟁사 소재 (competitor_ad_cache) ──────────────────────────");

  // storage_url이 없고 image_url 또는 video_preview_url이 있는 row 조회
  const { data: rows, error } = await supabase
    .from("competitor_ad_cache")
    .select("ad_archive_id, image_url, video_preview_url, display_format")
    .or("image_url.not.is.null,video_preview_url.not.is.null")
    .or("storage_url.is.null")
    .limit(limit);

  if (error) {
    if (error.message?.includes("storage_url")) {
      console.error(
        "❌ storage_url 컬럼이 없습니다. 상단 주석의 SQL 마이그레이션을 먼저 실행하세요."
      );
    } else {
      console.error(`❌ 조회 실패: ${error.message}`);
    }
    return { processed: 0, uploaded: 0, skipped: 0, errors: 0 };
  }

  if (!rows || rows.length === 0) {
    console.log("✅ 처리할 경쟁사 소재 없음 (모두 저장 완료됨)");
    return { processed: 0, uploaded: 0, skipped: 0, errors: 0 };
  }

  console.log(`대상: ${rows.length}건`);

  const stats = { processed: 0, uploaded: 0, skipped: 0, errors: 0 };

  await processBatch(rows, async (row, i) => {
    const archiveId = row.ad_archive_id;
    // 동영상은 썸네일, 이미지는 image_url 우선
    const mediaUrl = row.video_preview_url || row.image_url;
    const storagePath = `competitor/${archiveId}.jpg`;

    process.stdout.write(
      `  [${i + 1}/${rows.length}] ${archiveId}... `
    );

    if (!mediaUrl) {
      console.log("스킵 (URL 없음)");
      stats.skipped++;
      return;
    }

    // 다운로드
    const result = await downloadImage(mediaUrl);
    if (!result) {
      console.log("스킵 (다운로드 실패)");
      stats.skipped++;
      return;
    }

    stats.processed++;

    if (DRY_RUN) {
      console.log(`✅ dry-run (${Math.round(result.buffer.length / 1024)}KB)`);
      stats.uploaded++;
      return;
    }

    // Storage 업로드
    const publicUrl = await uploadToStorage(
      storagePath,
      result.buffer,
      result.contentType
    );

    if (!publicUrl) {
      console.log("❌ 업로드 실패");
      stats.errors++;
      return;
    }

    // DB 업데이트
    const { error: updateErr } = await supabase
      .from("competitor_ad_cache")
      .update({ storage_url: publicUrl, updated_at: new Date().toISOString() })
      .eq("ad_archive_id", archiveId);

    if (updateErr) {
      console.log(`❌ DB 업데이트 실패: ${updateErr.message}`);
      stats.errors++;
    } else {
      console.log(`✅ ${Math.round(result.buffer.length / 1024)}KB → ${storagePath}`);
      stats.uploaded++;
    }
  });

  return stats;
}

// ── 메인 ─────────────────────────────────────────────────────────────

async function main() {
  console.log("━━━ 소재 미디어 영구 저장 (Meta CDN → Supabase Storage) ━━━");
  console.log(`limit: ${LIMIT}건 | dry-run: ${DRY_RUN} | source: ${SOURCE}`);
  if (DRY_RUN) {
    console.log("⚠️  DRY-RUN 모드: 업로드/DB 업데이트 없음");
  }

  const totals = { processed: 0, uploaded: 0, skipped: 0, errors: 0 };

  if (SOURCE === "own" || SOURCE === "all") {
    const ownStats = await processOwnCreatives(
      SOURCE === "all" ? Math.ceil(LIMIT / 2) : LIMIT
    );
    totals.processed += ownStats.processed;
    totals.uploaded += ownStats.uploaded;
    totals.skipped += ownStats.skipped;
    totals.errors += ownStats.errors;
  }

  if (SOURCE === "competitor" || SOURCE === "all") {
    const compStats = await processCompetitorCreatives(
      SOURCE === "all" ? Math.ceil(LIMIT / 2) : LIMIT
    );
    totals.processed += compStats.processed;
    totals.uploaded += compStats.uploaded;
    totals.skipped += compStats.skipped;
    totals.errors += compStats.errors;
  }

  console.log("\n━━━ 최종 결과 ━━━");
  console.log(`다운로드 성공: ${totals.processed}건`);
  console.log(`Storage 저장: ${totals.uploaded}건`);
  console.log(`스킵:         ${totals.skipped}건`);
  console.log(`에러:         ${totals.errors}건`);

  if (totals.errors > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err.message);
  process.exit(1);
});
