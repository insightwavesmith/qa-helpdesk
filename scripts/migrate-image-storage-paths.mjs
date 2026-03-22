#!/usr/bin/env node
/**
 * 이미지 Storage 경로 마이그레이션: 플랫 → 계정 종속 구조
 *
 * 기존: creatives/media/{ad_id}.jpg
 * 신규: creatives/{account_id}/media/{ad_id}.jpg
 *
 * ADR-001 준수: {account_id} 폴더 분리
 *
 * 데이터 소스: ad_creative_embeddings (v1 테이블 — creative_media에 아직 IMAGE 없음)
 * 업데이트 대상: ad_creative_embeddings.storage_url + creative_media.storage_url (있으면)
 *
 * Usage:
 *   node scripts/migrate-image-storage-paths.mjs --dry-run
 *   node scripts/migrate-image-storage-paths.mjs
 *   node scripts/migrate-image-storage-paths.mjs --limit 100
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const LIMIT_IDX = process.argv.indexOf("--limit");
const LIMIT = LIMIT_IDX !== -1 ? parseInt(process.argv[LIMIT_IDX + 1], 10) : null;

// ── .env.local 파싱 ──
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

// ── 헬퍼 ──
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
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
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
}

// ── main ──
async function main() {
  console.log(`이미지 Storage 경로 마이그레이션${DRY_RUN ? " (dry-run)" : ""}`);
  console.log(`기존: ${BUCKET}/media/{ad_id}.jpg`);
  console.log(`신규: ${BUCKET}/{account_id}/media/{ad_id}.jpg\n`);

  // 1. ad_creative_embeddings에서 storage_url이 media/ 패턴인 것 조회
  const PAGE_SIZE = 1000;
  let offset = 0;
  const allRows = [];
  while (true) {
    const batch = await sbGet(
      `/ad_creative_embeddings?select=ad_id,account_id,storage_url` +
        `&storage_url=not.is.null&order=ad_id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    allRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`전체 (storage_url 있음): ${allRows.length}건`);

  // media/ 패턴만 필터 (이미 account_id/media/ 패턴이면 스킵)
  const pending = allRows.filter((r) => {
    const key = r.storage_url.replace(PUBLIC_PREFIX, "");
    return key.startsWith("media/");
  });
  console.log(`이동 대상 (media/ 패턴): ${pending.length}건`);

  const toProcess = LIMIT && LIMIT > 0 ? pending.slice(0, LIMIT) : pending;
  console.log(`처리 예정: ${toProcess.length}건\n`);

  if (toProcess.length === 0) {
    console.log("이동할 이미지가 없습니다.");
    return;
  }

  // creative_media ad_id 매핑 (있으면 같이 업데이트)
  console.log("creative_media 매핑 조회 중...");
  const cmRows = [];
  offset = 0;
  while (true) {
    const batch = await sbGet(
      `/creative_media?select=id,storage_url,creatives!inner(ad_id)` +
        `&storage_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    cmRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  const cmMap = new Map(); // ad_id → creative_media.id
  for (const r of cmRows) {
    if (r.creatives?.ad_id) cmMap.set(r.creatives.ad_id, r.id);
  }
  console.log(`creative_media 매핑: ${cmMap.size}건\n`);

  let moved = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    const { ad_id: adId, account_id: accountId, storage_url } = row;
    const prefix = `[${i + 1}/${toProcess.length}]`;

    if (!adId || !accountId || !storage_url) {
      console.log(`${prefix} ⚠ 데이터 누락 — 스킵`);
      skipped++;
      continue;
    }

    const currentKey = storage_url.replace(PUBLIC_PREFIX, "");
    const ext = currentKey.split(".").pop() || "jpg";
    const newKey = `${accountId}/media/${adId}.${ext}`;
    const newUrl = `${PUBLIC_PREFIX}${newKey}`;

    if (currentKey === newKey) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      if (i < 5 || i % 500 === 0) {
        console.log(`${prefix} [dry-run] ${currentKey} → ${newKey}`);
      }
      moved++;
      continue;
    }

    try {
      // Storage 파일 이동
      await storageMove(currentKey, newKey);

      // ad_creative_embeddings DB 업데이트
      const aceResult = await sbPatch(
        "ad_creative_embeddings",
        `ad_id=eq.${adId}`,
        { storage_url: newUrl }
      );
      if (!aceResult.ok) {
        console.error(`${prefix} ⚠ ace 업데이트 실패: ${aceResult.body}`);
      }

      // creative_media도 있으면 같이 업데이트
      if (cmMap.has(adId)) {
        await sbPatch("creative_media", `id=eq.${cmMap.get(adId)}`, {
          storage_url: newUrl,
        });
      }

      if (i < 10 || i % 100 === 0 || i === toProcess.length - 1) {
        console.log(`${prefix} ✅ ${adId}`);
      }
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
