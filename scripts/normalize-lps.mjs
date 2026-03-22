#!/usr/bin/env node
/**
 * LP URL 정규화 — ad_creative_embeddings.lp_url → landing_pages
 * Usage: node scripts/normalize-lps.mjs [--dry-run]
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
  console.error("NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
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
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, status: res.status, body };
  }
  return { ok: true, status: res.status };
}

// ──────────────────────────────────────────────
// 외부 도메인 목록 (page_type='external')
// ──────────────────────────────────────────────
const EXTERNAL_DOMAINS = new Set([
  "fb.com",
  "facebook.com",
  "instagram.com",
  "l.facebook.com",
  "naver.com",
  "link.naver.com",
]);

// ──────────────────────────────────────────────
// LP 비활성화 필터 (is_active=false)
// 크롤링 불가 또는 LP가 아닌 URL 패턴
// ──────────────────────────────────────────────
const INACTIVE_PATTERNS = [
  { test: (url, domain) => /fb\.com\/canvas_doc/i.test(url) || /facebook\.com\/canvas_doc/i.test(url), reason: "meta_canvas" },
  { test: (url, domain) => domain === "naver.com" || domain === "google.com", reason: "portal_main" },
  { test: (url, domain) => domain === "mkt.shopping.naver.com", reason: "naver_shopping_redirect" },
];

function shouldDeactivate(canonicalUrl, domain) {
  for (const p of INACTIVE_PATTERNS) {
    if (p.test(canonicalUrl, domain)) return p.reason;
  }
  return null;
}

// ──────────────────────────────────────────────
// URL 정규화
// ──────────────────────────────────────────────
function normalizeUrl(raw) {
  if (!raw || raw.trim() === "") return null;

  let url = raw.trim();

  // 프로토콜 없으면 추가
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null; // 파싱 불가
  }

  // UTM 등 쿼리스트링 제거
  parsed.search = "";
  parsed.hash = "";

  // /utm_source=... 형태 path param 제거
  let pathname = parsed.pathname.replace(/\/utm_[^/]*/gi, "");

  // 도메인 정규화: www. / m. 제거
  let hostname = parsed.hostname.toLowerCase();
  if (hostname.startsWith("www.")) hostname = hostname.slice(4);
  if (hostname.startsWith("m.")) hostname = hostname.slice(2);

  // 후행 슬래시 제거 (루트 "/" 제외)
  if (pathname.length > 1 && pathname.endsWith("/")) {
    pathname = pathname.slice(0, -1);
  }

  const canonical = `${parsed.protocol}//${hostname}${pathname}`;
  return { canonical, hostname };
}

// ──────────────────────────────────────────────
// URL 분류
// ──────────────────────────────────────────────
function classifyUrl(canonical, hostname) {
  // page_type
  let page_type = "product";
  if (EXTERNAL_DOMAINS.has(hostname)) {
    page_type = "external";
  } else if (/\/article\//i.test(canonical)) {
    page_type = "article";
  }

  // platform
  let platform = "custom";
  if (/surl|product\/detail\.html/i.test(canonical)) {
    platform = "cafe24";
  } else if (/smartstore\.naver\.com/i.test(canonical)) {
    platform = "smartstore";
  } else if (/oliveyoung/i.test(canonical)) {
    platform = "oliveyoung";
  }

  return { page_type, platform };
}

// ──────────────────────────────────────────────
// product_id 추출
// ──────────────────────────────────────────────
function extractProductId(canonical) {
  // cafe24: product/detail.html?product_no=123 (쿼리 제거 전에는 추출 불가, path 파싱으로 시도)
  // canonical에는 이미 query가 없으므로 path에서 숫자 시퀀스만 추출
  const cafe24Match = canonical.match(/product_no=(\d+)/);
  if (cafe24Match) return cafe24Match[1];

  // smartstore: /products/12345678
  const smartstoreMatch = canonical.match(/\/products\/(\d+)/);
  if (smartstoreMatch) return smartstoreMatch[1];

  return null;
}

// ──────────────────────────────────────────────
// surl 리다이렉트 해소
// ──────────────────────────────────────────────
async function resolveRedirect(url) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return { url: res.url || url, failed: false };
  } catch {
    return { url: null, failed: true }; // 타임아웃 or 실패
  }
}

// ──────────────────────────────────────────────
// main
// ──────────────────────────────────────────────
async function main() {
  console.log(`LP URL 정규화 시작 ${DRY_RUN ? "(dry-run)" : ""}`);

  // 1. ad_creative_embeddings에서 lp_url 전체 조회 (페이지네이션)
  const PAGE_SIZE = 1000;
  const allRows = [];
  let offset = 0;

  process.stdout.write("  lp_url 조회 중...");
  while (true) {
    const batch = await sbGet(
      `/ad_creative_embeddings?select=ad_id,account_id,lp_url&lp_url=not.is.null&order=ad_id.asc&offset=${offset}&limit=${PAGE_SIZE}`
    );
    allRows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  console.log(` ${allRows.length}건`);

  // 2. 각 URL 정규화
  console.log("  URL 정규화 중...");
  const surlEntries = []; // redirect 해소가 필요한 surl URL

  // canonical_url → { account_id, original_urls, page_type, platform, product_id, domain, ad_count }
  const canonicalMap = new Map();

  for (const row of allRows) {
    const result = normalizeUrl(row.lp_url);
    if (!result) continue;

    const { canonical, hostname } = result;
    const isSurl =
      /surl/i.test(canonical) && !/product\/detail\.html/i.test(canonical);

    if (isSurl) {
      surlEntries.push({ canonical, originalUrl: row.lp_url, row });
      continue; // surl은 redirect 해소 후 처리
    }

    mergeIntoMap(canonicalMap, canonical, hostname, row);
  }

  // 3. surl redirect 해소
  if (surlEntries.length > 0) {
    console.log(`  surl 리다이렉트 해소 중... (${surlEntries.length}건)`);
    let resolved = 0;
    let skipped = 0;

    for (const { canonical, row } of surlEntries) {
      const redirect = await resolveRedirect(canonical);
      if (redirect.failed || !redirect.url || redirect.url === canonical) {
        // 리다이렉트 실패 → 원본 유지, 실패 시 is_active=false
        const normResult = normalizeUrl(canonical);
        if (normResult) {
          mergeIntoMap(canonicalMap, normResult.canonical, normResult.hostname, row);
          if (redirect.failed) {
            // 단축 URL + 리다이렉트 실패 → 비활성화
            const entry = canonicalMap.get(normResult.canonical);
            if (entry) entry.is_active = false;
          }
        }
        skipped++;
      } else {
        const normResult = normalizeUrl(redirect.url);
        if (normResult) {
          mergeIntoMap(canonicalMap, normResult.canonical, normResult.hostname, row, canonical);
        } else {
          const origNorm = normalizeUrl(canonical);
          if (origNorm) {
            mergeIntoMap(canonicalMap, origNorm.canonical, origNorm.hostname, row);
          }
          skipped++;
        }
        resolved++;
      }
      process.stdout.write(
        `\r  surl: ${resolved}건 해소, ${skipped}건 스킵 (${resolved + skipped}/${surlEntries.length})`
      );
    }
    console.log();
  }

  // 4. 결과 집계
  const entries = Array.from(canonicalMap.values());

  // 통계
  const byPageType = {};
  const byPlatform = {};
  for (const e of entries) {
    byPageType[e.page_type] = (byPageType[e.page_type] || 0) + 1;
    byPlatform[e.platform || "custom"] = (byPlatform[e.platform || "custom"] || 0) + 1;
  }

  console.log("\n━━━ 정규화 결과 ━━━");
  console.log(`전체 lp_url: ${allRows.length}건`);
  console.log(`고유 canonical URL: ${entries.length}건`);
  console.log("page_type 분포:");
  for (const [k, v] of Object.entries(byPageType)) {
    console.log(`  ${k}: ${v}건`);
  }
  console.log("platform 분포:");
  for (const [k, v] of Object.entries(byPlatform)) {
    console.log(`  ${k}: ${v}건`);
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] DB 저장 없음. 상위 10건 미리보기:");
    for (const e of entries.slice(0, 10)) {
      console.log(
        `  [${e.page_type}/${e.platform}] ${e.canonical_url} (광고 ${e.ad_count}건, 원본 ${e.original_urls.length}건)`
      );
    }
    return;
  }

  // 5. landing_pages에 upsert (50건 배치)
  console.log("\n  landing_pages upsert 중...");
  const BATCH_SIZE = 50;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);
    const result = await sbPost("landing_pages", batch, "canonical_url");
    if (result.ok) {
      inserted += batch.length;
    } else {
      errors += batch.length;
      console.log(`\n  배치 실패 (${result.status}): ${result.body}`);
    }
    process.stdout.write(`\r  저장: ${inserted}/${entries.length}`);
  }

  console.log("\n\n━━━ 완료 ━━━");
  console.log(`저장: ${inserted}건, 실패: ${errors}건`);
}

// ──────────────────────────────────────────────
// 헬퍼: canonicalMap에 항목 병합
// ──────────────────────────────────────────────
function mergeIntoMap(canonicalMap, canonical, hostname, row, extraOriginal = null) {
  const { page_type, platform } = classifyUrl(canonical, hostname);
  const product_id = extractProductId(canonical);

  if (canonicalMap.has(canonical)) {
    const existing = canonicalMap.get(canonical);
    // original_urls 병합 (중복 제거)
    const origSet = new Set(existing.original_urls);
    if (row.lp_url) origSet.add(row.lp_url);
    if (extraOriginal) origSet.add(extraOriginal);
    existing.original_urls = Array.from(origSet);
    existing.ad_count += 1;
  } else {
    const origUrls = [];
    if (row.lp_url) origUrls.push(row.lp_url);
    if (extraOriginal) origUrls.push(extraOriginal);

    const deactivateReason = shouldDeactivate(canonical, hostname);
    canonicalMap.set(canonical, {
      account_id: row.account_id || "unknown",
      canonical_url: canonical,
      original_urls: origUrls,
      domain: hostname,
      product_id: product_id || null,
      product_name: null,
      page_type,
      platform: platform || null,
      is_active: !deactivateReason,
      ad_count: 1,
    });
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
