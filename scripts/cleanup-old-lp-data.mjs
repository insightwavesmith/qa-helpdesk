#!/usr/bin/env node
/**
 * 기존 LP 스크린샷 데이터 전체 정리
 * Usage: node scripts/cleanup-old-lp-data.mjs --dry-run    # 확인만
 *        node scripts/cleanup-old-lp-data.mjs --confirm    # 실제 삭제
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");
const CONFIRM = process.argv.includes("--confirm");

if (!DRY_RUN && !CONFIRM) {
  console.error("사용법:");
  console.error(
    "  node scripts/cleanup-old-lp-data.mjs --dry-run    # 확인만"
  );
  console.error(
    "  node scripts/cleanup-old-lp-data.mjs --confirm    # 실제 삭제"
  );
  process.exit(1);
}

// .env.local 읽기
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

// REST API 헬퍼
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbDelete(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    method: "DELETE",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      Prefer: "return=minimal",
    },
  });
  if (!res.ok) throw new Error(`sbDelete ${res.status}: ${await res.text()}`);
  return res;
}

async function sbPatch(path, updates) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    method: "PATCH",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error(`sbPatch ${res.status}: ${await res.text()}`);
  return res;
}

// Storage 파일 목록 조회 (페이지네이션)
async function listAllFiles(supabase, bucket, folder) {
  const PAGE_SIZE = 1000;
  const allFiles = [];
  let offset = 0;

  while (true) {
    const { data: files, error } = await supabase.storage
      .from(bucket)
      .list(folder, { limit: PAGE_SIZE, offset });

    if (error) throw new Error(`Storage list error (${bucket}/${folder}): ${error.message}`);
    if (!files || files.length === 0) break;

    allFiles.push(...files);
    if (files.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return allFiles;
}

// Storage 파일 삭제 (배치)
async function deleteStorageFiles(supabase, bucket, filePaths) {
  const BATCH_SIZE = 100;
  let deleted = 0;
  let errors = 0;

  for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
    const batch = filePaths.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      console.error(`  삭제 실패 배치 [${i}~${i + batch.length}]: ${error.message}`);
      errors += batch.length;
    } else {
      deleted += batch.length;
    }
    process.stdout.write(`\r  삭제 진행: ${deleted + errors}/${filePaths.length}`);
  }

  process.stdout.write("\n");
  return { deleted, errors };
}

async function main() {
  const mode = DRY_RUN ? "(dry-run)" : "(실제 삭제)";
  console.log(`\n━━━ LP 데이터 정리 ${mode} ━━━\n`);

  const supabase = createClient(SB_URL, SB_KEY);
  const PAGE_SIZE = 1000;

  // ── 1. lp_crawl_queue 건수 조회 ──────────────────────────────────
  console.log("1. lp_crawl_queue:");

  let queueCount = 0;
  let offset = 0;
  while (true) {
    const batch = await sbGet(
      `/lp_crawl_queue?select=id&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    queueCount += batch.length;
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`   삭제 대상: ${queueCount}건`);

  // ── 2. ad_creative_embeddings LP 컬럼 NULL 대상 건수 조회 ─────────
  console.log("\n2. ad_creative_embeddings LP 컬럼 NULL 처리:");

  let embCount = 0;
  offset = 0;
  while (true) {
    const batch = await sbGet(
      `/ad_creative_embeddings?select=id&lp_screenshot_url=not.is.null&order=id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    embCount += batch.length;
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`   대상: ${embCount}건 (lp_screenshot_url IS NOT NULL)`);

  // ── 3. Storage 파일 목록 조회 ─────────────────────────────────────
  console.log("\n3. Storage 파일 삭제:");

  // lp-screenshots 버킷 (루트)
  const lpScreenshotFiles = await listAllFiles(supabase, "lp-screenshots", "");
  const lpScreenshotPaths = lpScreenshotFiles
    .filter((f) => f.name)
    .map((f) => f.name);
  console.log(`   lp-screenshots 버킷: ${lpScreenshotPaths.length}개 파일`);

  // lp-mobile 버킷 (루트)
  const lpMobileFiles = await listAllFiles(supabase, "lp-mobile", "");
  const lpMobilePaths = lpMobileFiles
    .filter((f) => f.name)
    .map((f) => f.name);
  console.log(`   lp-mobile 버킷: ${lpMobilePaths.length}개 파일`);

  // creatives 버킷 — lp-* 패턴 파일
  const creativesLpFiles = await listAllFiles(supabase, "creatives", "");
  const creativesLpPaths = creativesLpFiles
    .filter((f) => f.name && f.name.startsWith("lp-"))
    .map((f) => f.name);
  console.log(`   creatives 버킷 (lp-* 패턴): ${creativesLpPaths.length}개 파일`);

  // ── dry-run 종료 ───────────────────────────────────────────────────
  if (DRY_RUN) {
    console.log("\n--confirm 플래그로 실제 삭제를 실행하세요.");
    return;
  }

  // ── 실제 삭제 실행 ─────────────────────────────────────────────────
  console.log("\n━━━ 실제 삭제 실행 ━━━\n");

  // 1. lp_crawl_queue 전체 삭제
  console.log("1. lp_crawl_queue 삭제 중...");
  if (queueCount > 0) {
    await sbDelete("/lp_crawl_queue?id=not.is.null");
    console.log(`   완료: ${queueCount}건 삭제`);
  } else {
    console.log("   건너뜀 (데이터 없음)");
  }

  // 2. ad_creative_embeddings LP 컬럼 NULL 처리
  console.log("\n2. ad_creative_embeddings LP 컬럼 NULL 처리 중...");
  if (embCount > 0) {
    await sbPatch("/ad_creative_embeddings?lp_screenshot_url=not.is.null", {
      lp_screenshot_url: null,
      lp_cta_screenshot_url: null,
      lp_embedding: null,
      lp_text_embedding: null,
      lp_cta_embedding: null,
      lp_headline: null,
      lp_price: null,
      lp_crawled_at: null,
    });
    console.log(`   완료: ${embCount}건 NULL 처리`);
  } else {
    console.log("   건너뜀 (대상 없음)");
  }

  // 3. Storage 파일 삭제
  console.log("\n3. Storage 파일 삭제 중...");

  // lp-screenshots 버킷
  if (lpScreenshotPaths.length > 0) {
    console.log(`   lp-screenshots 버킷 (${lpScreenshotPaths.length}개):`);
    const r1 = await deleteStorageFiles(supabase, "lp-screenshots", lpScreenshotPaths);
    console.log(`   삭제: ${r1.deleted}개, 실패: ${r1.errors}개`);
  } else {
    console.log("   lp-screenshots 버킷: 파일 없음");
  }

  // lp-mobile 버킷
  if (lpMobilePaths.length > 0) {
    console.log(`   lp-mobile 버킷 (${lpMobilePaths.length}개):`);
    const r2 = await deleteStorageFiles(supabase, "lp-mobile", lpMobilePaths);
    console.log(`   삭제: ${r2.deleted}개, 실패: ${r2.errors}개`);
  } else {
    console.log("   lp-mobile 버킷: 파일 없음");
  }

  // creatives 버킷 — lp-* 패턴
  if (creativesLpPaths.length > 0) {
    console.log(`   creatives 버킷 lp-* (${creativesLpPaths.length}개):`);
    const r3 = await deleteStorageFiles(supabase, "creatives", creativesLpPaths);
    console.log(`   삭제: ${r3.deleted}개, 실패: ${r3.errors}개`);
  } else {
    console.log("   creatives 버킷 (lp-* 패턴): 파일 없음");
  }

  console.log("\n━━━ 정리 완료 ━━━\n");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
