#!/usr/bin/env node
/**
 * STEP 6: lp_structure_analysis → lp_analysis 이관
 *
 * lp_url → landing_pages.canonical_url 매칭으로 lp_id FK 연결
 * raw_analysis에서 visual 필드 추출 (dominant_color, text_density 등)
 * UNIQUE(lp_id, viewport) 중복 처리 (최신 우선)
 *
 * Usage:
 *   node scripts/migrate-lp-analysis.mjs --dry-run
 *   node scripts/migrate-lp-analysis.mjs
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
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

// ── Supabase 헬퍼 ──
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, body) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text() };
  return { ok: true };
}

/**
 * URL 정규화 (매칭용): 프로토콜/www/m/쿼리스트링/후행슬래시 제거
 */
function normalizeForMatch(url) {
  if (!url) return "";
  let u = url.trim().toLowerCase();
  u = u.replace(/^https?:\/\//, "");
  u = u.replace(/^www\./, "").replace(/^m\./, "");
  u = u.replace(/\?.*$/, "").replace(/#.*$/, "");
  if (u.length > 1 && u.endsWith("/")) u = u.slice(0, -1);
  return u;
}

// ── main ──
async function main() {
  console.log(`lp_structure_analysis → lp_analysis 이관${DRY_RUN ? " (dry-run)" : ""}\n`);

  // 1. landing_pages 조회 → canonical_url → id 매핑
  const lps = await sbGet("/landing_pages?select=id,canonical_url");
  const lpMap = new Map(); // normalizedUrl → lp_id
  for (const lp of lps) {
    if (lp.canonical_url) {
      lpMap.set(normalizeForMatch(lp.canonical_url), lp.id);
    }
  }
  console.log(`landing_pages: ${lpMap.size}건\n`);

  // 2. lp_structure_analysis 전체 조회
  const PAGE_SIZE = 1000;
  let offset = 0;
  const rows = [];
  while (true) {
    const batch = await sbGet(
      `/lp_structure_analysis?select=*&order=analyzed_at.desc.nullslast&offset=${offset}&limit=${PAGE_SIZE}`
    );
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(`lp_structure_analysis: ${rows.length}건`);

  // 3. lp_url → lp_id 매칭
  let matched = 0;
  let unmatched = 0;
  const unmatchedUrls = [];
  const seenKeys = new Set(); // "lp_id:viewport" 중복 방지

  const toInsert = [];

  for (const row of rows) {
    const normalized = normalizeForMatch(row.lp_url);
    const lpId = lpMap.get(normalized);

    if (!lpId) {
      unmatched++;
      if (unmatchedUrls.length < 10) unmatchedUrls.push(row.lp_url);
      continue;
    }

    const key = `${lpId}:${row.viewport || "mobile"}`;
    if (seenKeys.has(key)) continue; // 중복 스킵 (최신 우선 — 이미 정렬됨)
    seenKeys.add(key);

    // raw_analysis에서 visual 필드 추출
    const raw = row.raw_analysis || {};

    const record = {
      lp_id: lpId,
      viewport: row.viewport || "mobile",
      hero_type: row.hero_type,
      price_position: row.price_position,
      discount_highlight: row.discount_highlight,
      review_position_pct: row.review_position_pct,
      review_type: row.review_type,
      review_density: row.review_density,
      review_count: row.review_count,
      cta_type: row.cta_type,
      social_proof: row.social_proof,
      page_length: row.page_length,
      trust_badges: row.trust_badges,
      option_types: row.option_types,
      cross_sell: row.cross_sell,
      easy_pay: row.easy_pay,
      urgency_stock: row.urgency_stock,
      urgency_timedeal: row.urgency_timedeal,
      touches_to_checkout: row.touches_to_checkout,
      // raw_analysis에서 추출하는 visual 필드
      dominant_color: raw.dominant_color || raw.color?.dominant || null,
      color_palette: raw.color_palette || raw.color?.palette || null,
      color_tone: raw.color_tone || raw.color?.tone || null,
      text_density_pct: raw.text_density_pct ?? null,
      photo_review_ratio: raw.photo_review_ratio ?? null,
      video_review_count: raw.video_review_count ?? 0,
      gif_count: raw.gif_count ?? 0,
      gif_positions: raw.gif_positions || null,
      video_count: raw.video_count ?? 0,
      video_autoplay: raw.video_autoplay ?? null,
      // metadata
      raw_analysis: row.raw_analysis,
      model_version: row.model_version,
      analyzed_at: row.analyzed_at,
    };

    toInsert.push(record);
    matched++;
  }

  console.log(`매칭 성공: ${matched}건, 실패: ${unmatched}건`);
  if (unmatchedUrls.length > 0) {
    console.log(`  매칭 실패 URL 샘플:`);
    for (const u of unmatchedUrls) console.log(`    - ${u}`);
  }
  console.log(`삽입 대상 (중복 제거 후): ${toInsert.length}건\n`);

  if (DRY_RUN) {
    console.log("[dry-run] 삽입 생략");
    console.log(`\n샘플 3건:`);
    for (const r of toInsert.slice(0, 3)) {
      console.log(`  lp_id=${r.lp_id}, viewport=${r.viewport}, hero=${r.hero_type}, cta=${r.cta_type}`);
    }
    return;
  }

  // 4. 배치 UPSERT (50건씩)
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const result = await sbPost("lp_analysis", batch);

    if (result.ok) {
      inserted += batch.length;
      console.log(`[${i + batch.length}/${toInsert.length}] ✅ ${batch.length}건 삽입`);
    } else {
      // 배치 실패 시 개별 삽입 시도
      console.warn(`배치 실패 (${result.status}): ${result.body?.slice(0, 200)}`);
      for (const record of batch) {
        const r = await sbPost("lp_analysis", record);
        if (r.ok) {
          inserted++;
        } else {
          console.error(`  ✗ lp_id=${record.lp_id} — ${r.body?.slice(0, 100)}`);
          errors++;
        }
      }
    }
  }

  console.log(`\n━━━ 완료 ━━━`);
  console.log(`삽입: ${inserted}건, 실패: ${errors}건`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
