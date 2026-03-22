#!/usr/bin/env node
/**
 * DB v2 데이터 이관: ad_creative_embeddings → creatives + creative_media + creative_performance + landing_pages
 *
 * 순서:
 *   1. creatives INSERT (ad_creative_embeddings 메타 필드)
 *   2. creative_media INSERT (미디어 + 임베딩)
 *   3. creative_performance INSERT (성과)
 *   4. landing_pages INSERT (LP URL 정규화)
 *   5. creatives.lp_id UPDATE (LP 연결)
 *
 * Usage: node scripts/migrate-to-v2.mjs [--dry-run]
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes("--dry-run");

// ── 환경변수 ─────────────────────────────────────────
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const m = line.match(/^([^#=]+)=(.*)$/);
  if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, "");
}

const SB_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const SB_ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PROJECT_REF = SB_URL?.match(/https:\/\/(.+)\.supabase\.co/)?.[1];

if (!SB_URL || !SB_KEY) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
if (!SB_ACCESS_TOKEN || !PROJECT_REF) {
  console.error("❌ SUPABASE_ACCESS_TOKEN 환경변수 필요 (Management API용)");
  process.exit(1);
}

// ── SQL 실행 (Management API) ────────────────────────
async function execSQL(sql, label) {
  if (DRY_RUN) {
    console.log(`[DRY-RUN] ${label}`);
    console.log(`  SQL: ${sql.slice(0, 200)}...`);
    return null; // caller handles null
  }

  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SB_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    }
  );

  const text = await res.text();
  if (!res.ok || text.includes('"message":"Failed to run sql query')) {
    throw new Error(`SQL 실패 [${label}]: ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

// ── REST API ─────────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbPost(table, rows, onConflict) {
  if (DRY_RUN) {
    console.log(`[DRY-RUN] ${table} upsert ${rows.length}건`);
    return;
  }
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
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`sbPost ${table} ${res.status}: ${err}`);
  }
}

// ── LP URL 정규화 ────────────────────────────────────
const EXTERNAL_DOMAINS = [
  "fb.com",
  "facebook.com",
  "instagram.com",
  "naver.com",
  "naver.me",
  "bit.ly",
  "t.co",
  "youtube.com",
  "youtu.be",
];

function normalizeURL(rawUrl) {
  if (!rawUrl) return null;

  try {
    let url = new URL(rawUrl);

    // 쿼리 파라미터 전부 제거
    url.search = "";
    url.hash = "";

    // www/m 서브도메인 통합
    url.hostname = url.hostname.replace(/^(www|m)\./, "");

    // 트레일링 슬래시 정리
    let path = url.pathname.replace(/\/+$/, "") || "/";
    url.pathname = path;

    return url.toString().replace(/\/+$/, "");
  } catch {
    return rawUrl.split("?")[0].replace(/\/+$/, "");
  }
}

function classifyPageType(url) {
  if (!url) return "unknown";

  const lower = url.toLowerCase();

  // 외부 도메인
  for (const d of EXTERNAL_DOMAINS) {
    if (lower.includes(d)) return "external";
  }

  // 기사/블로그
  if (lower.includes("/article/") || lower.includes("/blog/")) return "article";

  // 홈페이지 (루트만)
  try {
    const u = new URL(url);
    if (u.pathname === "/" || u.pathname === "") return "homepage";
  } catch {}

  return "product";
}

function detectPlatform(url) {
  if (!url) return null;
  const lower = url.toLowerCase();

  if (lower.includes("smartstore.naver.com")) return "smartstore";
  if (lower.includes("oliveyoung.co.kr")) return "oliveyoung";
  if (
    lower.includes("surl/") ||
    lower.includes("product/detail.html") ||
    lower.includes("cafe24")
  )
    return "cafe24";

  return "custom";
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace(/^(www|m)\./, "");
  } catch {
    return null;
  }
}

// ── MAIN ─────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════");
  console.log("  DB v2 데이터 이관" + (DRY_RUN ? " [DRY-RUN]" : ""));
  console.log("═══════════════════════════════════════════════\n");

  // ── Step 0: 사전 확인 ──────────────────────────────
  const counts = await execSQL(
    `SELECT
      (SELECT count(*) FROM ad_creative_embeddings) as ace,
      (SELECT count(*) FROM creatives) as cr,
      (SELECT count(*) FROM creative_media) as cm,
      (SELECT count(*) FROM creative_performance) as cp,
      (SELECT count(*) FROM landing_pages) as lp`,
    "사전 확인"
  );
  const c = counts[0];
  console.log(`📊 현재 상태:`);
  console.log(`   ad_creative_embeddings: ${c.ace}건`);
  console.log(`   creatives: ${c.cr}건`);
  console.log(`   creative_media: ${c.cm}건`);
  console.log(`   creative_performance: ${c.cp}건`);
  console.log(`   landing_pages: ${c.lp}건\n`);

  if (parseInt(c.cr) > 0) {
    console.log(
      `⚠️  creatives에 이미 ${c.cr}건 있음. ON CONFLICT DO NOTHING으로 중복 건너뜀.\n`
    );
  }

  // ── Step 1: creatives INSERT ───────────────────────
  console.log("━━━ Step 1/5: creatives 이관 ━━━");
  const step1 = await execSQL(
    `INSERT INTO creatives (ad_id, account_id, creative_type, source, brand_name, category, cohort, is_active, duration_days, lp_url, created_at, updated_at)
     SELECT
       ad_id,
       account_id,
       creative_type,
       CASE WHEN source = 'own' THEN 'member' ELSE source END,
       brand_name,
       category,
       cohort,
       COALESCE(is_active, true),
       duration_days,
       lp_url,
       COALESCE(created_at, now()),
       COALESCE(updated_at, now())
     FROM ad_creative_embeddings
     WHERE ad_id IS NOT NULL
     ON CONFLICT (ad_id) DO NOTHING
     RETURNING ad_id`,
    "creatives INSERT"
  );
  console.log(`   ✅ ${step1.length}건 삽입\n`);

  // ── Step 2: creative_media INSERT ──────────────────
  console.log("━━━ Step 2/5: creative_media 이관 (미디어 + 임베딩) ━━━");
  const step2 = await execSQL(
    `INSERT INTO creative_media (creative_id, media_type, media_url, media_hash, ad_copy, video_analysis, embedding, text_embedding, embedding_model, embedded_at)
     SELECT
       c.id,
       COALESCE(ace.media_type, 'IMAGE'),
       ace.media_url,
       ace.media_hash,
       ace.ad_copy,
       ace.video_analysis,
       COALESCE(ace.embedding_3072, ace.embedding),
       COALESCE(ace.text_embedding_3072, ace.text_embedding),
       ace.embedding_model,
       ace.embedded_at
     FROM ad_creative_embeddings ace
     JOIN creatives c ON c.ad_id = ace.ad_id
     ON CONFLICT (creative_id) DO NOTHING
     RETURNING creative_id`,
    "creative_media INSERT"
  );
  console.log(`   ✅ ${step2.length}건 삽입\n`);

  // ── Step 3: creative_performance INSERT ────────────
  console.log("━━━ Step 3/5: creative_performance 이관 (성과) ━━━");
  const step3 = await execSQL(
    `INSERT INTO creative_performance (creative_id, roas, ctr, click_to_purchase_rate, roas_percentile, quality_ranking, computed_at)
     SELECT
       c.id,
       ace.roas,
       ace.ctr,
       ace.click_to_purchase_rate,
       ace.roas_percentile,
       ace.quality_ranking,
       now()
     FROM ad_creative_embeddings ace
     JOIN creatives c ON c.ad_id = ace.ad_id
     WHERE ace.roas IS NOT NULL
        OR ace.ctr IS NOT NULL
        OR ace.quality_ranking IS NOT NULL
     ON CONFLICT (creative_id) DO NOTHING
     RETURNING creative_id`,
    "creative_performance INSERT"
  );
  console.log(`   ✅ ${step3.length}건 삽입\n`);

  // ── Step 4: landing_pages INSERT (LP 정규화) ───────
  console.log("━━━ Step 4/5: landing_pages 정규화 ━━━");

  // 고유 LP URL 추출
  const lpRows = await execSQL(
    `SELECT DISTINCT lp_url, account_id
     FROM ad_creative_embeddings
     WHERE lp_url IS NOT NULL AND lp_url != ''
     ORDER BY lp_url`,
    "LP URL 추출"
  );
  console.log(`   원본 LP URL: ${lpRows.length}개`);

  // 정규화
  const lpMap = new Map(); // canonical_url → { original_urls, account_id, ... }
  let externalCount = 0;

  for (const row of lpRows) {
    const canonical = normalizeURL(row.lp_url);
    if (!canonical) continue;

    const pageType = classifyPageType(canonical);
    if (pageType === "external") {
      externalCount++;
    }

    if (lpMap.has(canonical)) {
      const existing = lpMap.get(canonical);
      if (!existing.original_urls.includes(row.lp_url)) {
        existing.original_urls.push(row.lp_url);
      }
    } else {
      lpMap.set(canonical, {
        canonical_url: canonical,
        original_urls: [row.lp_url],
        account_id: row.account_id,
        domain: extractDomain(canonical),
        page_type: pageType,
        platform: detectPlatform(canonical),
      });
    }
  }

  console.log(`   정규화 후: ${lpMap.size}개 (외부: ${externalCount}개)`);

  // landing_pages upsert (배치 50개씩)
  const lpEntries = Array.from(lpMap.values());
  let lpInserted = 0;

  for (let i = 0; i < lpEntries.length; i += 50) {
    const batch = lpEntries.slice(i, i + 50).map((lp) => ({
      canonical_url: lp.canonical_url,
      original_urls: lp.original_urls,
      account_id: lp.account_id,
      domain: lp.domain,
      page_type: lp.page_type,
      platform: lp.platform,
      ad_count: lp.original_urls.length,
    }));

    await sbPost("landing_pages", batch, "canonical_url");
    lpInserted += batch.length;
  }

  console.log(`   ✅ landing_pages ${lpInserted}건 upsert\n`);

  // ── Step 5: creatives.lp_id 연결 ──────────────────
  console.log("━━━ Step 5/5: creatives.lp_id 연결 ━━━");

  // landing_pages 전체 조회 (canonical_url → id 매핑)
  const allLPs = await sbGet("/landing_pages?select=id,canonical_url");
  console.log(`   landing_pages: ${allLPs.length}건 로드`);

  // canonical_url → id 맵
  const lpIdMap = new Map();
  for (const lp of allLPs) {
    lpIdMap.set(lp.canonical_url, lp.id);
  }

  // creatives에서 lp_url이 있지만 lp_id가 null인 건 업데이트
  // SQL로 직접 UPDATE — lpIdMap을 VALUES로 전달
  let linkedCount = 0;

  // creatives의 lp_url을 정규화해서 landing_pages.canonical_url과 매칭
  // 배치로 처리: 한 번에 SQL UPDATE
  const updateSQL = `
    UPDATE creatives c
    SET lp_id = lp.id
    FROM landing_pages lp
    WHERE c.lp_url IS NOT NULL
      AND c.lp_id IS NULL
      AND lp.original_urls @> ARRAY[c.lp_url]`;

  const step5 = await execSQL(updateSQL, "creatives.lp_id UPDATE (array contains)");

  // 결과 확인
  const linkedResult = await execSQL(
    `SELECT count(*) as linked FROM creatives WHERE lp_id IS NOT NULL`,
    "lp_id 연결 확인"
  );
  linkedCount = parseInt(linkedResult[0]?.linked || 0);
  console.log(`   ✅ creatives.lp_id 연결: ${linkedCount}건\n`);

  // ── 최종 결과 ──────────────────────────────────────
  console.log("═══════════════════════════════════════════════");
  console.log("  이관 완료 — 최종 확인");
  console.log("═══════════════════════════════════════════════\n");

  const final = await execSQL(
    `SELECT
      (SELECT count(*) FROM creatives) as creatives,
      (SELECT count(*) FROM creative_media) as media,
      (SELECT count(*) FROM creative_performance) as performance,
      (SELECT count(*) FROM landing_pages) as lps,
      (SELECT count(*) FROM creatives WHERE lp_id IS NOT NULL) as lp_linked,
      (SELECT count(*) FROM creative_media WHERE embedding IS NOT NULL) as has_embedding,
      (SELECT count(*) FROM creative_media WHERE storage_url IS NOT NULL) as has_storage,
      (SELECT count(*) FROM creative_performance WHERE roas IS NOT NULL) as has_roas`,
    "최종 확인"
  );

  const f = final[0];
  console.log(`  creatives:            ${f.creatives}건`);
  console.log(`  creative_media:       ${f.media}건 (임베딩: ${f.has_embedding}, Storage: ${f.has_storage})`);
  console.log(`  creative_performance: ${f.performance}건 (ROAS: ${f.has_roas})`);
  console.log(`  landing_pages:        ${f.lps}건`);
  console.log(`  LP 연결:              ${f.lp_linked}건`);
  console.log("");

  // 데이터 무결성 체크
  const integrity = await execSQL(
    `SELECT
      (SELECT count(*) FROM creatives) as cr_total,
      (SELECT count(*) FROM ad_creative_embeddings WHERE ad_id IS NOT NULL) as ace_total,
      (SELECT count(*) FROM creatives c WHERE NOT EXISTS (SELECT 1 FROM creative_media cm WHERE cm.creative_id = c.id)) as cr_no_media`,
    "무결성 체크"
  );
  const i = integrity[0];

  if (parseInt(i.cr_total) === parseInt(i.ace_total)) {
    console.log(`  ✅ 무결성: creatives(${i.cr_total}) = ace(${i.ace_total}) — 일치`);
  } else {
    console.log(
      `  ⚠️  무결성: creatives(${i.cr_total}) ≠ ace(${i.ace_total}) — 차이 ${parseInt(i.ace_total) - parseInt(i.cr_total)}건`
    );
  }

  if (parseInt(i.cr_no_media) > 0) {
    console.log(`  ⚠️  creative_media 누락: ${i.cr_no_media}건`);
  } else {
    console.log(`  ✅ creative_media: 모든 creatives에 media 있음`);
  }

  console.log("\n🎉 이관 완료!");
}

main().catch((err) => {
  console.error("❌ 이관 실패:", err.message);
  process.exit(1);
});
