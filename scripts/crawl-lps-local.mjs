#!/usr/bin/env node
/**
 * LP 로컬 재크롤링 스크립트 v2
 *
 * landing_pages(page_type=product, is_active=true)를 Playwright로 크롤링하여
 * lp_snapshots 테이블에 저장 (mobile + desktop 각각)
 *
 * Usage:
 *   node scripts/crawl-lps-local.mjs
 *   node scripts/crawl-lps-local.mjs --dry-run
 *   node scripts/crawl-lps-local.mjs --limit 5
 *   node scripts/crawl-lps-local.mjs --viewport mobile
 *   node scripts/crawl-lps-local.mjs --viewport desktop
 *   node scripts/crawl-lps-local.mjs --lp-id <uuid>
 *
 * 전제:
 *   npx playwright install chromium
 *   .env.local에 NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 있어야 함
 */

import { readFileSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI 인자 파싱 ─────────────────────────────────
const args = process.argv.slice(2);

const DRY_RUN = args.includes("--dry-run");

const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : Infinity;

const viewportIdx = args.indexOf("--viewport");
const VIEWPORT_FILTER = viewportIdx >= 0 ? args[viewportIdx + 1] : null; // 'mobile' | 'desktop' | null

const lpIdIdx = args.indexOf("--lp-id");
const LP_ID_FILTER = lpIdIdx >= 0 ? args[lpIdIdx + 1] : null;

// ── .env.local 파싱 ───────────────────────────────
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

// ── REST 헬퍼 ─────────────────────────────────────
async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
    },
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

// ── Storage 업로드 (REST PUT) ─────────────────────
async function uploadToStorage(storagePath, buffer) {
  const url = `${SB_URL}/storage/v1/object/creatives/${storagePath}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "image/jpeg",
      "x-upsert": "true",
    },
    body: buffer,
  });
  if (!res.ok) {
    throw new Error(`Storage 업로드 실패 (${res.status}): ${await res.text()}`);
  }
  return `${SB_URL}/storage/v1/object/public/creatives/${storagePath}`;
}

// ── LP 비활성화 필터 (런타임 안전장치) ────────────────
// DB에서 is_active=true만 가져오지만, 추가로 URL 패턴 검사
const SKIP_PATTERNS = [
  (url, domain) => /fb\.com\/canvas_doc/i.test(url) || /facebook\.com\/canvas_doc/i.test(url),
  (url, domain) => domain === "naver.com" || domain === "google.com",
  (url, domain) => domain === "mkt.shopping.naver.com",
];

function shouldSkipLP(canonicalUrl, domain) {
  return SKIP_PATTERNS.some((fn) => fn(canonicalUrl, domain));
}

// ── 뷰포트 설정 ───────────────────────────────────
const VIEWPORT_CONFIG = {
  mobile: {
    viewport: { width: 375, height: 812 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  },
  desktop: {
    viewport: { width: 1280, height: 800 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  },
};

// ── 섹션 셀렉터 ───────────────────────────────────
const SECTION_SELECTORS = {
  detail: [
    '[class*="detail"]',
    '[class*="description"]',
    ".prd_detail",
    "#prd_detail",
    '[id*="detail"]',
    ".product-description",
  ],
  review: [
    '[class*="review"]',
    '[class*="Review"]',
    "#review",
    ".review_board",
    '[id*="review"]',
    '[class*="후기"]',
  ],
};

// CTA 셀렉터 (모바일 우선 — fixed bottom 버튼)
const CTA_SELECTORS_MOBILE = [
  '[style*="position: fixed"][style*="bottom"] button',
  ".fixed.bottom-0 button",
  '[class*="buy"]',
  '[class*="purchase"]',
  ".btn_buy",
  "#btn_buy",
];

const CTA_TEXT_PATTERNS = [
  "구매하기",
  "바로구매",
  "장바구니",
  "담기",
  "바로 구매",
  "BUY",
  "ADD TO CART",
];

// ── CTA 버튼 탐지 ─────────────────────────────────
async function findCtaButton(page, vpType) {
  const selectors =
    vpType === "mobile" ? CTA_SELECTORS_MOBILE : CTA_SELECTORS_MOBILE.slice(2);

  // 1) 셀렉터 기반 탐지
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        return el;
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }

  // 2) 텍스트 패턴 기반 탐지
  for (const text of CTA_TEXT_PATTERNS) {
    try {
      const el = page
        .locator(`button:has-text("${text}"), a:has-text("${text}")`)
        .first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        return el;
      }
    } catch {
      // 다음 패턴 시도
    }
  }

  return null;
}

// ── 섹션 스크린샷 캡처 ────────────────────────────
async function captureSectionScreenshot(page, sectionName, selectors, scrollPct) {
  // 셀렉터로 요소 탐색
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.isVisible({ timeout: 1000 }).catch(() => false)) {
        await el.scrollIntoViewIfNeeded({ timeout: 3000 });
        await page.waitForTimeout(500);
        return await page.screenshot({ fullPage: false, type: "jpeg", quality: 85 });
      }
    } catch {
      // 다음 셀렉터 시도
    }
  }

  // 셀렉터 없으면 비율 스크롤
  try {
    await page.evaluate((pct) => {
      const height = document.body.scrollHeight;
      window.scrollTo({ top: Math.floor(height * pct), behavior: "instant" });
    }, scrollPct);
    await page.waitForTimeout(500);
    return await page.screenshot({ fullPage: false, type: "jpeg", quality: 85 });
  } catch {
    return null;
  }
}

// ── LP 크롤링 (단건, 단일 뷰포트) ─────────────────
async function crawlLP(browser, lp, vpType) {
  const vpConfig = VIEWPORT_CONFIG[vpType];
  const context = await browser.newContext({
    viewport: vpConfig.viewport,
    userAgent: vpConfig.userAgent,
    locale: "ko-KR",
  });

  const captures = {
    full: null,
    hero: null,
    detail: null,
    review: null,
    cta: null,
  };

  let page = null;
  try {
    page = await context.newPage();

    // 페이지 로드 (실패 시 1회 재시도)
    let loadOk = false;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await page.goto(lp.canonical_url, {
          waitUntil: "networkidle",
          timeout: 30_000,
        });
        loadOk = true;
        break;
      } catch (e) {
        if (attempt === 2) {
          console.log(`    로드 실패 (2회): ${e.message.slice(0, 80)}`);
        } else {
          console.log(`    로드 재시도... (${e.message.slice(0, 60)})`);
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
    }

    if (!loadOk) {
      return null;
    }

    await page.waitForTimeout(2000);

    // ── a) full (풀페이지 스크롤 후 캡처) ──────────
    try {
      // lazy load 트리거
      await page.evaluate(async () => {
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        const step = 400;
        for (let y = 0; y < document.body.scrollHeight; y += step) {
          window.scrollTo(0, y);
          await delay(80);
        }
        window.scrollTo(0, 0);
        await delay(300);
      });
      captures.full = await page.screenshot({
        fullPage: true,
        type: "jpeg",
        quality: 80,
      });
    } catch (e) {
      console.log(`    full 캡처 실패: ${e.message.slice(0, 60)}`);
    }

    // ── b) hero (최상단 뷰포트) ─────────────────────
    try {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      captures.hero = await page.screenshot({
        fullPage: false,
        type: "jpeg",
        quality: 85,
      });
    } catch (e) {
      console.log(`    hero 캡처 실패: ${e.message.slice(0, 60)}`);
    }

    // ── c) detail (상품 상세 섹션) ──────────────────
    try {
      captures.detail = await captureSectionScreenshot(
        page,
        "detail",
        SECTION_SELECTORS.detail,
        0.4
      );
    } catch (e) {
      console.log(`    detail 캡처 실패: ${e.message.slice(0, 60)}`);
    }

    // ── d) review (리뷰 섹션) ───────────────────────
    try {
      captures.review = await captureSectionScreenshot(
        page,
        "review",
        SECTION_SELECTORS.review,
        0.7
      );
    } catch (e) {
      console.log(`    review 캡처 실패: ${e.message.slice(0, 60)}`);
    }

    // ── e) cta (구매 버튼 클릭 후) ─────────────────
    try {
      // 스크롤 초기화 후 CTA 탐지
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      const ctaBtn = await findCtaButton(page, vpType);
      if (ctaBtn) {
        await ctaBtn.click({ timeout: 5000 });
        await page.waitForTimeout(3000);
        captures.cta = await page.screenshot({
          fullPage: false,
          type: "jpeg",
          quality: 85,
        });
      } else {
        console.log(`    CTA 버튼 없음`);
      }
    } catch (e) {
      console.log(`    cta 캡처 실패: ${e.message.slice(0, 60)}`);
    }
  } finally {
    await context.close();
  }

  return captures;
}

// ── sha256 해시 ───────────────────────────────────
function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// ── 섹션 업로드 (Storage) ─────────────────────────
// ADR-001: lp/{account_id}/{lp_id}/{viewport}_{section}.jpg
async function uploadSection(accountId, lpId, vpType, sectionName, buffer) {
  if (!buffer) return null;
  const storagePath = `lp/${accountId}/${lpId}/${vpType}_${sectionName}.jpg`;
  try {
    return await uploadToStorage(storagePath, buffer);
  } catch (e) {
    console.log(`    업로드 실패 (${sectionName}): ${e.message.slice(0, 80)}`);
    return null;
  }
}

// ── 메인 ─────────────────────────────────────────
async function main() {
  console.log(
    `LP 로컬 재크롤링 시작${DRY_RUN ? " (dry-run)" : ""}${VIEWPORT_FILTER ? ` viewport=${VIEWPORT_FILTER}` : ""}${LP_ID_FILTER ? ` lp-id=${LP_ID_FILTER}` : ""}`
  );

  // 1. landing_pages 조회
  let queryPath =
    "/landing_pages?page_type=eq.product&is_active=eq.true&select=id,canonical_url,domain,account_id&order=id.asc";
  if (LP_ID_FILTER) {
    queryPath = `/landing_pages?id=eq.${LP_ID_FILTER}&select=id,canonical_url,domain,account_id`;
  }

  const lpList = await sbGet(queryPath);
  const limited = isFinite(LIMIT) ? lpList.slice(0, LIMIT) : lpList;

  console.log(`대상: ${limited.length}건 (전체 ${lpList.length}건)`);

  if (limited.length === 0) {
    console.log("크롤링 대상 없음. 종료.");
    return;
  }

  if (DRY_RUN) {
    console.log("\n[dry-run] 크롤링 없음. 대상 목록:");
    for (const lp of limited) {
      console.log(`  ${lp.id} ${lp.canonical_url}`);
    }
    return;
  }

  // 2. Playwright 브라우저 시작
  const browser = await chromium.launch({ headless: true });

  const viewports = VIEWPORT_FILTER
    ? [VIEWPORT_FILTER]
    : ["mobile", "desktop"];

  const stats = { total: 0, ok: 0, skip: 0, errors: 0 };

  try {
    let lpIdx = 0;
    for (const lp of limited) {
      lpIdx++;

      // 런타임 LP 필터 (canvas_doc, 포털 등 스킵)
      if (shouldSkipLP(lp.canonical_url, lp.domain)) {
        console.log(`[${lpIdx}/${limited.length}] ⚠ ${lp.domain} — 비활성 패턴 스킵`);
        stats.skip += viewports.length;
        stats.total += viewports.length;
        continue;
      }

      for (const vpType of viewports) {
        stats.total++;
        const prefix = `[${lpIdx}/${limited.length}] ${vpType} ${lp.domain || lp.canonical_url.slice(0, 40)}`;
        process.stdout.write(`${prefix} ...`);

        // 크롤링
        const captures = await crawlLP(browser, lp, vpType);

        if (!captures) {
          process.stdout.write(` 건너뜀\n`);
          stats.skip++;
          continue;
        }

        // 섹션 업로드 (ADR-001: lp/{account_id}/{lp_id}/...)
        const acctId = lp.account_id;
        if (!acctId) {
          process.stdout.write(` account_id 없음 — 스킵\n`);
          stats.skip++;
          continue;
        }
        const [fullUrl, heroUrl, detailUrl, reviewUrl, ctaUrl] =
          await Promise.all([
            uploadSection(acctId, lp.id, vpType, "full", captures.full),
            uploadSection(acctId, lp.id, vpType, "hero", captures.hero),
            uploadSection(acctId, lp.id, vpType, "detail", captures.detail),
            uploadSection(acctId, lp.id, vpType, "review", captures.review),
            uploadSection(acctId, lp.id, vpType, "cta", captures.cta),
          ]);

        const capturedCount = [fullUrl, heroUrl, detailUrl, reviewUrl, ctaUrl].filter(Boolean).length;

        // lp_snapshots upsert
        const snapshotRow = {
          lp_id: lp.id,
          viewport: vpType,
          screenshot_url: fullUrl,
          cta_screenshot_url: ctaUrl,
          screenshot_hash: captures.full ? sha256(captures.full) : null,
          cta_screenshot_hash: captures.cta ? sha256(captures.cta) : null,
          section_screenshots: {
            hero: heroUrl,
            detail: detailUrl,
            review: reviewUrl,
            cta: ctaUrl,
          },
          crawled_at: new Date().toISOString(),
          crawler_version: "local-v2",
        };

        const result = await sbPost(
          "lp_snapshots",
          snapshotRow,
          "lp_id,viewport"
        );

        if (result.ok) {
          process.stdout.write(
            ` (${capturedCount}섹션 캡처, CTA ${ctaUrl ? "있음" : "없음"})\n`
          );
          stats.ok++;
        } else {
          process.stdout.write(` DB 저장 실패: ${result.body.slice(0, 80)}\n`);
          stats.errors++;
        }

        // 쿨다운 (사이트 부하 방지)
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  } finally {
    await browser.close();
  }

  console.log("\n━━━ 결과 ━━━");
  console.log(`전체: ${stats.total}`);
  console.log(`성공: ${stats.ok}`);
  console.log(`건너뜀: ${stats.skip}`);
  console.log(`에러: ${stats.errors}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
