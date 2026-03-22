#!/usr/bin/env node
/**
 * Storage 경로 마이그레이션: 플랫 → 계정 종속 구조
 *
 * 기존: creatives/video/{ad_id}.mp4
 * 신규: creatives/{account_id}/video/{ad_id}.mp4
 *
 * Supabase Storage move API 사용
 *
 * Usage:
 *   node scripts/migrate-storage-paths.mjs
 *   node scripts/migrate-storage-paths.mjs --dry-run
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ──────────────────────────────────────────────
// .env.local 파싱
// ──────────────────────────────────────────────
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const BUCKET = "creatives";
const PUBLIC_PREFIX = `${SB_URL}/storage/v1/object/public/${BUCKET}/`;

// ──────────────────────────────────────────────
// Supabase 헬퍼
// ──────────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPatch(table, query, body) {
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
  if (!res.ok) {
    const text = await res.text();
    return { ok: false, status: res.status, body: text };
  }
  return { ok: true };
}

async function storageMove(sourceKey, destKey) {
  const res = await fetch(`${SB_URL}/storage/v1/object/move`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      bucketId: BUCKET,
      sourceKey,
      destinationKey: destKey,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`move 실패 (${res.status}): ${text}`);
  }
  return true;
}

// ──────────────────────────────────────────────
// main
// ──────────────────────────────────────────────
async function main() {
  console.log(`Storage 경로 마이그레이션${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`기존: ${BUCKET}/video/{ad_id}.mp4`);
  console.log(`신규: ${BUCKET}/{account_id}/video/{ad_id}.mp4\n`);

  // 1. storage_url이 있는 VIDEO creative_media 조회
  const PAGE_SIZE = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const batch = await sbGet(
      `/creative_media?select=id,creative_id,storage_url,media_type,creatives!inner(ad_id,account_id)` +
        `&storage_url=not.is.null&media_type=eq.VIDEO&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`대상: ${rows.length}건\n`);

  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const adId = row.creatives?.ad_id;
    const accountId = row.creatives?.account_id;
    const currentUrl = row.storage_url;
    const prefix = `[${i + 1}/${rows.length}]`;

    if (!adId || !accountId || !currentUrl) {
      console.log(`${prefix} ⚠ 데이터 누락 — 스킵`);
      skipped++;
      continue;
    }

    // 현재 storage key 추출
    const currentKey = currentUrl.replace(PUBLIC_PREFIX, "");
    const newKey = `${accountId}/video/${adId}.mp4`;
    const newUrl = `${PUBLIC_PREFIX}${newKey}`;

    // 이미 새 경로면 스킵
    if (currentKey === newKey) {
      console.log(`${prefix} ✓ ${adId} — 이미 올바른 경로`);
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`${prefix} [dry-run] ${currentKey} → ${newKey}`);
      moved++;
      continue;
    }

    // Storage move
    try {
      await storageMove(currentKey, newKey);

      // DB 업데이트
      const patch = await sbPatch(
        "creative_media",
        `id=eq.${row.id}`,
        { storage_url: newUrl }
      );
      if (!patch.ok) {
        console.error(`${prefix} ⚠ DB 업데이트 실패: ${patch.body}`);
        errors++;
        continue;
      }

      console.log(`${prefix} ✅ ${adId} — ${currentKey} → ${newKey}`);
      moved++;
    } catch (err) {
      console.error(`${prefix} ✗ ${adId} — ${err.message}`);
      errors++;
    }
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`이동: ${moved}건, 스킵: ${skipped}건, 실패: ${errors}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
