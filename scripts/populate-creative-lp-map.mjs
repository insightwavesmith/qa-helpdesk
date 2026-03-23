#!/usr/bin/env node
/**
 * creative_lp_map 매핑 생성
 *
 * creatives.lp_url → landing_pages.canonical_url 매칭하여
 * creative_lp_map에 (creative_id, lp_id) INSERT.
 *
 * Usage:
 *   node scripts/populate-creative-lp-map.mjs
 *   node scripts/populate-creative-lp-map.mjs --account 1577307499783821
 *   node scripts/populate-creative-lp-map.mjs --dry-run
 */

import { sbGet, sbUpsert } from "./lib/db-helpers.mjs";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const ACCOUNT_IDX = args.indexOf("--account");
const FILTER_ACCOUNT = ACCOUNT_IDX !== -1 ? args[ACCOUNT_IDX + 1] : null;

function normalizeUrl(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    const keysToRemove = [];
    u.searchParams.forEach((_, key) => {
      if (key.startsWith("utm_") || key === "fbclid" || key === "gclid" ||
          key === "ref" || key === "source" || key.startsWith("cafe_mkt")) {
        keysToRemove.push(key);
      }
    });
    for (const k of keysToRemove) u.searchParams.delete(k);
    let path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol}//${u.host}${path}${u.search}`;
  } catch { return url; }
}

async function main() {
  console.log(`creative_lp_map 매핑 생성${DRY_RUN ? " (dry-run)" : ""}${FILTER_ACCOUNT ? ` account=${FILTER_ACCOUNT}` : ""}`);

  // 1. creatives에서 lp_url 있는 건 조회
  let creativePath = `/creatives?lp_url=not.is.null&select=id,ad_id,account_id,lp_url&limit=2000`;
  if (FILTER_ACCOUNT) creativePath += `&account_id=eq.${FILTER_ACCOUNT}`;
  const creatives = await sbGet(creativePath);
  console.log(`  creatives (lp_url 있음): ${creatives.length}건`);

  // 2. landing_pages 전체 조회
  let lpPath = `/landing_pages?select=id,canonical_url,account_id&limit=2000`;
  if (FILTER_ACCOUNT) lpPath += `&account_id=eq.${FILTER_ACCOUNT}`;
  const lps = await sbGet(lpPath);
  console.log(`  landing_pages: ${lps.length}건`);

  // canonical_url → lp_id 매핑
  const urlToLpId = new Map();
  for (const lp of lps) {
    urlToLpId.set(lp.canonical_url, lp.id);
  }

  // 3. 기존 매핑 확인
  let existingPath = `/creative_lp_map?select=creative_id,lp_id&limit=5000`;
  const existing = await sbGet(existingPath);
  const existingSet = new Set(existing.map((r) => `${r.creative_id}:${r.lp_id}`));
  console.log(`  기존 매핑: ${existing.length}건`);

  // 4. 매칭
  const toInsert = [];
  let matched = 0;
  let unmatched = 0;

  for (const c of creatives) {
    const normalized = normalizeUrl(c.lp_url);
    const lpId = urlToLpId.get(normalized);

    if (!lpId) {
      unmatched++;
      continue;
    }

    if (existingSet.has(`${c.id}:${lpId}`)) continue;

    matched++;
    toInsert.push({ creative_id: c.id, lp_id: lpId });
  }

  console.log(`  매칭됨: ${matched}건, 미매칭: ${unmatched}건, 신규 삽입: ${toInsert.length}건`);

  if (DRY_RUN) {
    for (const r of toInsert.slice(0, 5)) {
      console.log(`  [DRY] creative=${r.creative_id.slice(0, 8)} → lp=${r.lp_id.slice(0, 8)}`);
    }
    return;
  }

  // 5. 배치 UPSERT
  const BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const batch = toInsert.slice(i, i + BATCH);
    try {
      await sbUpsert("creative_lp_map", batch, "creative_id,lp_id");
      inserted += batch.length;
      console.log(`  inserted ${inserted}/${toInsert.length}`);
    } catch (e) {
      console.error(`  upsert 실패: ${e.message.slice(0, 80)}`);
    }
  }

  console.log(`\n완료: ${inserted}건 삽입`);
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
