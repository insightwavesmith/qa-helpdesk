#!/usr/bin/env node
/**
 * creative_media.storage_url 백필
 *
 * ad_creative_embeddings.storage_url → creative_media.storage_url 복사
 * creatives.ad_id로 매핑 (creative_media.creative_id → creatives.id → ad_id)
 *
 * Usage:
 *   node scripts/backfill-cm-storage-url.mjs --dry-run
 *   node scripts/backfill-cm-storage-url.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ── .env.local 파싱 ──
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim();
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

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

// ── main ──
async function main() {
  console.log(`creative_media.storage_url 백필${DRY_RUN ? " (dry-run)" : ""}\n`);

  // 1. creative_media에서 storage_url이 NULL인 행 조회 (페이지네이션)
  const cmRows = [];
  let cmOffset = 0;
  const CM_PAGE = 1000;
  while (true) {
    const batch = await sbGet(
      `/creative_media?select=id,creative_id&storage_url=is.null&order=id.asc&offset=${cmOffset}&limit=${CM_PAGE}`
    );
    cmRows.push(...batch);
    if (batch.length < CM_PAGE) break;
    cmOffset += CM_PAGE;
  }
  console.log(`storage_url NULL인 creative_media: ${cmRows.length}건`);

  if (cmRows.length === 0) {
    console.log("백필 대상 없음");
    return;
  }

  // 2. creative_id → ad_id 매핑 (creatives 테이블)
  const creativeIds = cmRows.map((r) => r.creative_id);
  const PAGE_SIZE = 100;
  const creativeData = [];
  for (let i = 0; i < creativeIds.length; i += PAGE_SIZE) {
    const batch = creativeIds.slice(i, i + PAGE_SIZE);
    const quoted = batch.map((id) => `"${id}"`).join(",");
    const data = await sbGet(
      `/creatives?select=id,ad_id&id=in.(${quoted})`
    );
    creativeData.push(...data);
  }
  const creativeIdToAdId = new Map(creativeData.map((c) => [c.id, c.ad_id]));
  console.log(`creatives 매핑: ${creativeIdToAdId.size}건`);

  // 3. ad_id → storage_url 매핑 (ad_creative_embeddings)
  const adIds = [...new Set(creativeData.map((c) => c.ad_id))];
  const aceData = [];
  for (let i = 0; i < adIds.length; i += PAGE_SIZE) {
    const batch = adIds.slice(i, i + PAGE_SIZE);
    const data = await sbGet(
      `/ad_creative_embeddings?select=ad_id,storage_url&storage_url=not.is.null&ad_id=in.(${batch.join(",")})`
    );
    aceData.push(...data);
  }
  const adIdToStorageUrl = new Map(aceData.map((r) => [r.ad_id, r.storage_url]));
  console.log(`ad_creative_embeddings storage_url 매핑: ${adIdToStorageUrl.size}건\n`);

  // 4. 백필
  let updated = 0;
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < cmRows.length; i++) {
    const cm = cmRows[i];
    const adId = creativeIdToAdId.get(cm.creative_id);
    if (!adId) {
      skipped++;
      continue;
    }

    const storageUrl = adIdToStorageUrl.get(adId);
    if (!storageUrl) {
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      if (i < 5 || i % 500 === 0) {
        console.log(`[${i + 1}/${cmRows.length}] [dry-run] cm.id=${cm.id} → ${storageUrl.slice(-40)}`);
      }
      updated++;
      continue;
    }

    const result = await sbPatch("creative_media", `id=eq.${cm.id}`, {
      storage_url: storageUrl,
    });

    if (result.ok) {
      updated++;
      if (i < 5 || i % 100 === 0 || i === cmRows.length - 1) {
        console.log(`[${i + 1}/${cmRows.length}] ✅ cm.id=${cm.id}`);
      }
    } else {
      console.error(`[${i + 1}/${cmRows.length}] ✗ cm.id=${cm.id} — ${result.body?.slice(0, 100)}`);
      errors++;
    }
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`업데이트: ${updated}건, 스킵: ${skipped}건, 실패: ${errors}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
