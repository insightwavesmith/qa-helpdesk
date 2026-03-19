#!/usr/bin/env node
/**
 * LP 크롤링 폴백 스크립트 — Playwright 없이 fetch+cheerio로 LP 데이터 추출
 *
 * Railway Playwright 크롤러가 EAGAIN 에러로 장애 상태일 때 사용.
 * lp_crawl_queue의 pending/failed 항목을 처리.
 *
 * ══ 사용법 ══════════════════════════════════════════════════════════
 *   node scripts/crawl-lp-fallback.mjs [--batch-size N] [--repeat] [--dry-run]
 *   node scripts/crawl-lp-fallback.mjs --include-failed   (failed도 재처리)
 *   node scripts/crawl-lp-fallback.mjs --status            (현황만 출력)
 *
 * ══ 차이점 (vs trigger-lp-crawl.mjs) ═══════════════════════════════
 *   - Railway 크롤러 호출 안 함 (Playwright 불필요)
 *   - fetch + cheerio로 텍스트/메타 추출 (lp-crawler.ts 로직)
 *   - OG 이미지 다운로드 → Supabase Storage 업로드 (스크린샷 대체)
 *   - 풀페이지 스크린샷 없음 (OG 이미지로 대체)
 */

import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";

// ── .env.local 파싱 ───────────────────────────────────────────────
function loadEnvLocal() {
  try {
    const raw = readFileSync(
      new URL("../.env.local", import.meta.url).pathname,
      "utf-8",
    );
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // .env.local 없으면 환경변수가 이미 설정된 것으로 가정
  }
}

loadEnvLocal();

// ── 설정 ─────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("환경변수 누락: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── 인수 파싱 ─────────────────────────────────────────────────────
const args = process.argv.slice(2);
const batchSize = parseInt(args.find((_, i, a) => a[i - 1] === "--batch-size") || "20");
const repeat = args.includes("--repeat");
const dryRun = args.includes("--dry-run");
const includeFailed = args.includes("--include-failed");
const modeStatus = args.includes("--status");
const concurrency = parseInt(args.find((_, i, a) => a[i - 1] === "--concurrency") || "5");

// ═══════════════════════════════════════════════════════════════════
// LP 크롤링 (fetch + cheerio) — lp-crawler.ts 로직 이식
// ═══════════════════════════════════════════════════════════════════

const USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

async function crawlLP(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8",
      },
      redirect: "follow",
      signal: controller.signal,
    });

    if (!res.ok) return { error: `HTTP ${res.status}` };

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("application/xhtml")) {
      return { error: `비-HTML: ${contentType.split(";")[0]}` };
    }

    const html = await res.text();
    return parseHTML(html, url);
  } catch (err) {
    if (err.name === "AbortError") return { error: "타임아웃 (15초)" };
    return { error: err.message?.slice(0, 200) || "알 수 없는 에러" };
  } finally {
    clearTimeout(timeout);
  }
}

function parseHTML(html, url) {
  const $ = cheerio.load(html);

  // OG 메타
  const ogTitle = $('meta[property="og:title"]').attr("content") || null;
  const ogDescription = $('meta[property="og:description"]').attr("content") || null;
  const ogImage = $('meta[property="og:image"]').attr("content") || null;

  // 헤드라인: og:title > h1 > title
  const h1Text = $("h1").first().text().trim();
  const titleText = $("title").text().trim();
  const headline = ogTitle || h1Text || titleText || null;

  // 설명
  const metaDescription = $('meta[name="description"]').attr("content") || null;
  const description = ogDescription || metaDescription || null;

  // 가격 추출
  const price = extractPrice($);

  // OG 이미지 URL 정규화
  let ogImageUrl = null;
  if (ogImage) {
    try {
      ogImageUrl = new URL(ogImage, url).toString();
    } catch {
      ogImageUrl = ogImage;
    }
  }

  // 본문 텍스트
  $("script, style, nav, footer, header, iframe, noscript").remove();
  const mainContent =
    $("main").text().trim() ||
    $("article").text().trim() ||
    $('[role="main"]').text().trim() ||
    $(".content, .product, #content, #product").text().trim();
  const bodyText = (mainContent || $("body").text().trim())
    .replace(/\s+/g, " ")
    .replace(/\n+/g, "\n")
    .trim();

  const parts = [];
  if (headline) parts.push(headline);
  if (description) parts.push(description);
  if (bodyText) parts.push(bodyText);
  const text = parts.join("\n").slice(0, 2000);

  return { headline, description, price, ogImageUrl, text, url };
}

function extractPrice($) {
  const selectors = [
    '[class*="price"]', '[class*="Price"]', '[id*="price"]',
    '[class*="cost"]', '[class*="amount"]',
    'meta[property="product:price:amount"]',
  ];

  for (const selector of selectors) {
    const el = $(selector).first();
    if (el.length) {
      const content = el.attr("content") || el.text().trim();
      const price = matchPrice(content);
      if (price) return price;
    }
  }

  const bodyText = $("body").text();
  const priceMatch = bodyText.match(/(?:₩|원|KRW)\s*[\d,]+|[\d,]+\s*(?:원|₩)/);
  if (priceMatch) return priceMatch[0].trim();

  return null;
}

function matchPrice(text) {
  if (!text) return null;
  const patterns = [
    /(?:₩|원|KRW)\s*[\d,]+/,
    /[\d,]+\s*(?:원|₩)/,
    /[\d]{1,3}(?:,\d{3})+(?:\s*원)?/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].trim();
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════
// OG 이미지 다운로드 → Supabase Storage 업로드
// ═══════════════════════════════════════════════════════════════════

async function downloadAndUploadOgImage(adId, ogImageUrl) {
  if (!ogImageUrl) return null;

  try {
    const res = await fetch(ogImageUrl, {
      headers: { "User-Agent": USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "image/png";
    const buffer = Buffer.from(await res.arrayBuffer());

    if (buffer.length < 1000) return null; // 너무 작으면 스킵

    // 확장자 결정
    const ext = contentType.includes("jpeg") || contentType.includes("jpg") ? "jpg"
      : contentType.includes("webp") ? "webp"
      : "png";

    const path = `lp-screenshots/${adId}/main.${ext}`;

    const { error } = await supabase.storage
      .from("creatives")
      .upload(path, buffer, {
        contentType: contentType.split(";")[0],
        upsert: true,
      });

    if (error) {
      console.warn(`    [스토리지] 업로드 실패 ${adId}: ${error.message}`);
      return null;
    }

    const { data } = supabase.storage.from("creatives").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    // 이미지 다운로드 실패는 무시 (텍스트 데이터만으로도 가치 있음)
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════
// 큐 관리
// ═══════════════════════════════════════════════════════════════════

async function getQueueCounts() {
  const statuses = ["pending", "processing", "completed", "failed"];
  const counts = {};
  for (const s of statuses) {
    const { count } = await supabase
      .from("lp_crawl_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", s);
    counts[s] = count ?? 0;
  }
  return counts;
}

async function fetchPendingBatch(limit) {
  const statusFilter = includeFailed ? ["pending", "failed"] : ["pending"];
  const { data, error } = await supabase
    .from("lp_crawl_queue")
    .select("id, ad_id, lp_url")
    .in("status", statusFilter)
    .order("id", { ascending: true })
    .limit(limit);

  if (error) throw new Error(`큐 조회 실패: ${error.message}`);
  return data ?? [];
}

async function markProcessing(ids) {
  await supabase.from("lp_crawl_queue").update({ status: "processing" }).in("id", ids);
}

async function markCompleted(ids) {
  if (ids.length === 0) return;
  await supabase.from("lp_crawl_queue")
    .update({ status: "completed", processed_at: new Date().toISOString() })
    .in("id", ids);
}

async function markFailed(id, errorMsg) {
  await supabase.from("lp_crawl_queue")
    .update({ status: "failed", error_msg: String(errorMsg).slice(0, 500), processed_at: new Date().toISOString() })
    .eq("id", id);
}

// ═══════════════════════════════════════════════════════════════════
// 상태 출력
// ═══════════════════════════════════════════════════════════════════

async function runStatus() {
  const counts = await getQueueCounts();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);

  console.log(`\n┌─────────────────────────────┐`);
  console.log(`│   lp_crawl_queue (폴백모드)   │`);
  console.log(`├──────────────┬──────────────┤`);
  console.log(`│ 전체         │ ${String(total).padStart(12)} │`);
  console.log(`├──────────────┼──────────────┤`);
  for (const [s, c] of Object.entries(counts)) {
    console.log(`│ ${s.padEnd(12)} │ ${String(c).padStart(12)} │`);
  }
  console.log(`└──────────────┴──────────────┘`);

  if (counts.failed > 0) {
    const { data } = await supabase.from("lp_crawl_queue")
      .select("id, ad_id, error_msg")
      .eq("status", "failed")
      .order("processed_at", { ascending: false })
      .limit(5);
    if (data?.length) {
      console.log(`\n최근 실패 5건:`);
      for (const r of data) {
        console.log(`  [${r.id}] ${r.ad_id} — ${r.error_msg || "에러 없음"}`);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// 메인 처리 루프
// ═══════════════════════════════════════════════════════════════════

async function processItem(queueRow, sourceRow, crawlCache) {
  const { ad_id, lp_url } = queueRow;

  // URL 캐시 확인 (같은 URL은 1번만 크롤링)
  let crawlResult = crawlCache.get(lp_url);
  if (!crawlResult) {
    crawlResult = await crawlLP(lp_url);
    crawlCache.set(lp_url, crawlResult);
  }

  if (crawlResult.error) {
    return { success: false, error: crawlResult.error };
  }

  // DB 업데이트 데이터
  const updates = {
    lp_headline: crawlResult.headline,
    lp_price: crawlResult.price,
    lp_crawled_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // OG 이미지 → 스토리지 업로드 (스크린샷 대체)
  if (crawlResult.ogImageUrl) {
    const screenshotUrl = await downloadAndUploadOgImage(ad_id, crawlResult.ogImageUrl);
    if (screenshotUrl) {
      updates.lp_screenshot_url = screenshotUrl;
    }
  }

  // ad_creative_embeddings 업데이트
  const { error: updateErr } = await supabase
    .from("ad_creative_embeddings")
    .update(updates)
    .eq("id", sourceRow.id);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  return { success: true, hasScreenshot: !!updates.lp_screenshot_url };
}

async function runProcessBatch() {
  let totalSaved = 0;
  let totalFailed = 0;
  let totalWithScreenshot = 0;
  let round = 0;

  do {
    round++;
    const queueRows = await fetchPendingBatch(batchSize);

    if (queueRows.length === 0) {
      if (round === 1) console.log("처리할 항목 없음.");
      else console.log(`\n모든 항목 처리 완료!`);
      break;
    }

    const counts = await getQueueCounts();
    const remaining = counts.pending + (includeFailed ? counts.failed : 0);
    console.log(`\n━━━ Round ${round} (${queueRows.length}건 처리, 남은 건수: ${remaining}) ━━━`);

    // 선점
    const queueIds = queueRows.map((r) => r.id);
    await markProcessing(queueIds);

    // ad_creative_embeddings에서 source row 조회
    const adIds = queueRows.map((r) => r.ad_id);
    const { data: sourceRows } = await supabase
      .from("ad_creative_embeddings")
      .select("id, ad_id, lp_url")
      .in("ad_id", adIds);

    const sourceMap = new Map((sourceRows ?? []).map((r) => [r.ad_id, r]));

    if (dryRun) {
      console.log(`[dry-run] ${queueRows.length}건 대상 — 실제 처리 없이 종료.`);
      // 되돌림
      await supabase.from("lp_crawl_queue").update({ status: "pending" }).in("id", queueIds);
      break;
    }

    // URL별 크롤링 캐시 (같은 URL 중복 크롤링 방지)
    const crawlCache = new Map();
    const completedIds = [];
    let batchSaved = 0;
    let batchFailed = 0;
    let batchScreenshot = 0;

    const t0 = Date.now();

    // 동시 처리 (concurrency 제한)
    for (let i = 0; i < queueRows.length; i += concurrency) {
      const chunk = queueRows.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map(async (qr) => {
          const sourceRow = sourceMap.get(qr.ad_id);
          if (!sourceRow) {
            await markFailed(qr.id, "소스 row 없음");
            return { qr, success: false };
          }

          const result = await processItem(qr, sourceRow, crawlCache);

          if (result.success) {
            completedIds.push(qr.id);
            return { qr, success: true, hasScreenshot: result.hasScreenshot };
          } else {
            await markFailed(qr.id, result.error);
            return { qr, success: false, error: result.error };
          }
        }),
      );

      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value.success) {
            batchSaved++;
            if (r.value.hasScreenshot) batchScreenshot++;
          } else {
            batchFailed++;
          }
        } else {
          batchFailed++;
        }
      }

      // 진행률 표시
      const done = Math.min(i + concurrency, queueRows.length);
      process.stdout.write(`  진행: ${done}/${queueRows.length}  (성공: ${batchSaved}, 실패: ${batchFailed})\r`);
    }

    // 완료 마킹
    if (completedIds.length > 0) await markCompleted(completedIds);

    const elapsed = Math.round((Date.now() - t0) / 1000);
    totalSaved += batchSaved;
    totalFailed += batchFailed;
    totalWithScreenshot += batchScreenshot;

    console.log(`\n  완료: ${batchSaved}건 저장 (스크린샷 ${batchScreenshot}건), ${batchFailed}건 실패 (${elapsed}초)`);
    console.log(`  고유 URL 크롤링: ${crawlCache.size}건`);

    if (!repeat) break;

    if (remaining - queueRows.length > 0) {
      console.log("  2초 대기...");
      await new Promise((r) => setTimeout(r, 2_000));
    }
  } while (repeat);

  console.log(`\n━━━ 최종 결과 ━━━`);
  console.log(`저장 성공: ${totalSaved}건 (스크린샷 포함: ${totalWithScreenshot}건)`);
  console.log(`저장 실패: ${totalFailed}건`);
  console.log(`라운드: ${round}회`);
}

// ═══════════════════════════════════════════════════════════════════
// 엔트리포인트
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log(`\n━━━ LP 크롤링 폴백 (fetch+cheerio, Playwright 없음) ━━━`);
  console.log(`모드: ${modeStatus ? "상태 확인" : "폴백 크롤링"}`);
  console.log(`배치 크기: ${batchSize}건 / 동시: ${concurrency}건 / 반복: ${repeat} / dry-run: ${dryRun}`);
  console.log(`failed 포함: ${includeFailed}`);
  console.log(`시작: ${new Date().toLocaleString("ko-KR")}\n`);

  if (modeStatus) {
    await runStatus();
  } else {
    // 먼저 stuck processing 항목 리셋 (이전 세션에서 중단된 것)
    const { count: stuckCount } = await supabase
      .from("lp_crawl_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "processing");

    if (stuckCount > 0) {
      console.log(`⚠️  stuck processing 항목 ${stuckCount}건 → pending으로 리셋`);
      await supabase
        .from("lp_crawl_queue")
        .update({ status: "pending" })
        .eq("status", "processing");
    }

    await runProcessBatch();
  }

  console.log(`\n종료: ${new Date().toLocaleString("ko-KR")}`);
}

main().catch((e) => {
  console.error("치명적 에러:", e.message);
  process.exit(1);
});
