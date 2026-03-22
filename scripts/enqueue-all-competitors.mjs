#!/usr/bin/env node
/**
 * 경쟁사 광고 전체 큐 등록 — competitor_ad_cache → competitor_analysis_queue
 *
 * Usage: node scripts/enqueue-all-competitors.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// .env.local 읽기
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
  console.error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, rows, onConflict) {
  const url = `${SB_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(rows),
  });
  return { ok: res.ok, status: res.status };
}

async function main() {
  console.log(`경쟁사 광고 전체 큐 등록 ${DRY_RUN ? "(dry-run)" : ""}`);

  // 1. 이미지 있는 경쟁사 광고 전체 조회 (페이지네이션)
  const PAGE_SIZE = 1000;
  const allAds = [];
  let offset = 0;

  while (true) {
    const batch = await sbGet(
      `/competitor_ad_cache?select=ad_archive_id,page_id&image_url=not.is.null&order=ad_archive_id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    allAds.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  console.log(`  이미지 있는 경쟁사 광고: ${allAds.length}건`);

  // 2. 이미 큐에 있는 항목 확인
  const existingQueue = [];
  offset = 0;
  while (true) {
    const batch = await sbGet(
      `/competitor_analysis_queue?select=ad_id&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    existingQueue.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  const existingSet = new Set(existingQueue.map((r) => r.ad_id));
  console.log(`  큐 기등록: ${existingSet.size}건`);

  // 3. 이미 L1 분석 완료된 경쟁사 소재 확인
  const existingAnalysis = [];
  offset = 0;
  while (true) {
    const batch = await sbGet(
      `/creative_element_analysis?select=ad_id&ad_id=like.competitor:*&offset=${offset}&limit=${PAGE_SIZE}`
    );
    existingAnalysis.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  const analyzedSet = new Set(
    existingAnalysis.map((r) => r.ad_id.replace("competitor:", ""))
  );
  console.log(`  L1 분석 완료: ${analyzedSet.size}건`);

  // 4. 신규 등록 대상 필터
  const newAds = allAds.filter(
    (ad) => !existingSet.has(ad.ad_archive_id) && !analyzedSet.has(ad.ad_archive_id)
  );
  console.log(`  신규 등록 대상: ${newAds.length}건`);

  if (newAds.length === 0) {
    console.log("  등록할 항목 없음. 종료.");
    return;
  }

  if (DRY_RUN) {
    console.log(`  [dry-run] ${newAds.length}건 등록 예정 (DB 저장 없음)`);
    return;
  }

  // 5. 배치 등록 (100건씩)
  const BATCH_SIZE = 100;
  let enqueued = 0;
  let errors = 0;

  for (let i = 0; i < newAds.length; i += BATCH_SIZE) {
    const batch = newAds.slice(i, i + BATCH_SIZE).map((ad) => ({
      brand_page_id: ad.page_id,
      ad_id: ad.ad_archive_id,
      status: "pending",
    }));

    const result = await sbPost("competitor_analysis_queue", batch, "brand_page_id,ad_id");
    if (result.ok) {
      enqueued += batch.length;
      process.stdout.write(`\r  등록: ${enqueued}/${newAds.length}`);
    } else {
      errors += batch.length;
      console.log(`\n  배치 실패: ${result.status}`);
    }
  }

  console.log(`\n\n━━━ 결과 ━━━`);
  console.log(`등록: ${enqueued}건, 실패: ${errors}건`);
  console.log(`스킵 (기존 큐): ${existingSet.size}건`);
  console.log(`스킵 (분석 완료): ${analyzedSet.size}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
