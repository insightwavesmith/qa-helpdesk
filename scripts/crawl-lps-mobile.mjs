#!/usr/bin/env node
/**
 * LP 모바일 크롤러 — 로컬 Playwright (iPhone 14 Pro)
 *
 * Usage: node scripts/crawl-lps-mobile.mjs [--limit 20] [--recrawl]
 *   --limit N    : 최대 N건 크롤링 (기본: 전체)
 *   --recrawl    : 이미 크롤링된 LP도 재크롤링
 *
 * 플로우:
 * 1. ad_creative_embeddings에서 lp_url IS NOT NULL 조회
 * 2. Playwright iPhone 14 Pro 에뮬레이션으로 LP 로드
 * 3. 풀스크롤 스크린샷 (JPEG 80%) + 구매 옵션창 스크린샷
 * 4. 텍스트 추출 (H1, 가격, 설명, OG)
 * 5. Supabase Storage 업로드 + DB UPDATE
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { chromium, devices } from "playwright";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 9999;
const RECRAWL = args.includes("--recrawl");

// .env.local
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
  console.error("❌ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const supabase = createClient(SB_URL, SB_KEY);

// iPhone 14 Pro 디바이스 설정
const DEVICE = {
  ...devices["iPhone 14 Pro"],
  locale: "ko-KR",
};

// 구매 버튼 셀렉터 목록
const BUY_SELECTORS = [
  'button:has-text("구매하기")',
  'button:has-text("장바구니")',
  'button:has-text("바로구매")',
  'button:has-text("구매")',
  'a:has-text("구매하기")',
  'a:has-text("장바구니")',
  '[class*="buy"]',
  '[class*="cart"]',
  '[class*="purchase"]',
  '[id*="buy"]',
  '[id*="cart"]',
];

async function extractPageData(page) {
  return page.evaluate(() => {
    const og = (name) => {
      const el = document.querySelector(
        `meta[property="og:${name}"], meta[name="og:${name}"]`
      );
      return el?.getAttribute("content") || null;
    };

    const h1 = document.querySelector("h1")?.textContent?.trim() || null;
    const title = document.title || null;
    const headline = og("title") || h1 || title;

    const desc =
      og("description") ||
      document.querySelector('meta[name="description"]')?.getAttribute("content") ||
      null;

    // 가격 추출
    const priceMatch = document.body.innerText.match(
      /(?:₩|원|KRW)\s?[\d,]+|[\d,]+\s?(?:원|₩)/
    );
    const price = priceMatch ? priceMatch[0] : null;

    const ogImage = og("image") || null;

    return { headline, description: desc, price, ogImage };
  });
}

async function crawlLP(page, url, adId) {
  const result = {
    mainScreenshot: null,
    optionScreenshot: null,
    text: null,
    error: null,
  };

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30_000 });
    // 추가 대기 (lazy load 등)
    await page.waitForTimeout(2000);
  } catch (e) {
    // timeout은 무시하고 진행 (부분 로드된 상태에서라도 스크린샷)
    if (!e.message.includes("Timeout")) {
      result.error = e.message;
      return result;
    }
  }

  // 텍스트 추출
  try {
    result.text = await extractPageData(page);
  } catch {
    result.text = { headline: null, description: null, price: null, ogImage: null };
  }

  // 풀스크롤 → fullPage 스크린샷
  try {
    // 스크롤 다운 (lazy load 트리거)
    await page.evaluate(async () => {
      const delay = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let y = 0; y < document.body.scrollHeight; y += 400) {
        window.scrollTo(0, y);
        await delay(100);
      }
      window.scrollTo(0, 0);
      await delay(500);
    });

    result.mainScreenshot = await page.screenshot({
      fullPage: true,
      type: "jpeg",
      quality: 80,
    });
  } catch (e) {
    console.log(`    ⚠️ 스크린샷 실패: ${e.message}`);
  }

  // 구매 버튼 탐지 + 옵션창 스크린샷
  try {
    let buyBtn = null;
    for (const sel of BUY_SELECTORS) {
      const btn = page.locator(sel).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        buyBtn = btn;
        break;
      }
    }

    if (buyBtn) {
      await buyBtn.click({ timeout: 5000 });
      await page.waitForTimeout(1500); // 모달/옵션창 렌더 대기

      result.optionScreenshot = await page.screenshot({
        type: "jpeg",
        quality: 80,
      });
    }
  } catch {
    // 구매 버튼 없거나 클릭 실패 — 무시
  }

  return result;
}

async function uploadToStorage(bucket, path, buffer, contentType) {
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType, upsert: true });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data?.publicUrl || null;
}

async function main() {
  console.log("🚀 LP 모바일 크롤링 시작 (iPhone 14 Pro)");
  console.log(`  limit: ${LIMIT}, recrawl: ${RECRAWL}`);

  // 대상 조회
  let query = supabase
    .from("ad_creative_embeddings")
    .select("ad_id, lp_url")
    .not("lp_url", "is", null)
    .eq("is_active", true);

  if (!RECRAWL) {
    // lp_screenshot_url이 mobile 경로가 아닌 것만 (데스크톱 크롤 or 미크롤)
    query = query.or("lp_screenshot_url.is.null,lp_screenshot_url.not.ilike.%lp-mobile%");
  }

  const { data: rows, error } = await query.limit(LIMIT);
  if (error) {
    console.error("❌ DB 조회 실패:", error.message);
    process.exit(1);
  }

  // lp_url 중복 제거 (같은 LP를 여러 소재가 공유)
  const urlMap = new Map();
  for (const row of rows) {
    if (!urlMap.has(row.lp_url)) {
      urlMap.set(row.lp_url, []);
    }
    urlMap.get(row.lp_url).push(row.ad_id);
  }
  console.log(`  대상: ${rows.length}건 (고유 LP: ${urlMap.size}개)`);

  if (urlMap.size === 0) {
    console.log("✅ 크롤링할 LP 없음");
    return;
  }

  // Playwright 브라우저 시작
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(DEVICE);
  const page = await context.newPage();

  let crawled = 0;
  let uploaded = 0;
  let errors = 0;

  for (const [lpUrl, adIds] of urlMap) {
    const primaryAdId = adIds[0];
    console.log(`\n[${crawled + 1}/${urlMap.size}] ${lpUrl.slice(0, 80)}...`);

    const result = await crawlLP(page, lpUrl, primaryAdId);

    if (result.error) {
      console.log(`  ❌ ${result.error}`);
      errors++;
      continue;
    }

    let mainUrl = null;
    let optionUrl = null;

    // Storage 업로드
    if (result.mainScreenshot) {
      try {
        mainUrl = await uploadToStorage(
          "creatives",
          `lp-mobile/${primaryAdId}/main.jpg`,
          result.mainScreenshot,
          "image/jpeg"
        );
        console.log(`  📸 메인 스크린샷 업로드`);
      } catch (e) {
        console.log(`  ⚠️ 메인 업로드 실패: ${e.message}`);
      }
    }

    if (result.optionScreenshot) {
      try {
        optionUrl = await uploadToStorage(
          "creatives",
          `lp-mobile/${primaryAdId}/option.jpg`,
          result.optionScreenshot,
          "image/jpeg"
        );
        console.log(`  📸 옵션창 스크린샷 업로드`);
      } catch (e) {
        console.log(`  ⚠️ 옵션 업로드 실패: ${e.message}`);
      }
    }

    // 같은 LP를 공유하는 모든 ad_id 업데이트
    const updates = {
      lp_screenshot_url: mainUrl,
      lp_cta_screenshot_url: optionUrl,
      lp_headline: result.text?.headline?.slice(0, 500) || null,
      lp_price: result.text?.price || null,
      lp_crawled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    for (const adId of adIds) {
      const { error: upErr } = await supabase
        .from("ad_creative_embeddings")
        .update(updates)
        .eq("ad_id", adId);

      if (upErr) {
        console.log(`  ⚠️ DB UPDATE 실패 ${adId}: ${upErr.message}`);
      }
    }

    uploaded++;
    crawled++;

    // 쿨다운
    await new Promise((r) => setTimeout(r, 1000));
  }

  await browser.close();

  console.log(`\n━━━ 결과 ━━━`);
  console.log(`크롤링: ${crawled}, 업로드: ${uploaded}, 에러: ${errors}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
