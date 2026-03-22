#!/usr/bin/env node
/**
 * LP 재크롤링 — landing_pages → Railway 크롤러 → lp_snapshots
 * Usage: node scripts/crawl-all-lps.mjs [--limit N] [--viewport mobile|desktop|both] [--dry-run]
 *
 * --limit N: 처리할 LP 수 제한
 * --viewport: 크롤링할 뷰포트 (기본: both)
 * --dry-run: 크롤링 없이 대상만 출력
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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
const CRAWLER_URL =
  env.CRAWLER_URL || "https://bscamp-crawler-production.up.railway.app";
const CRAWLER_SECRET = env.CRAWLER_SECRET || "";

if (!SB_URL || !SB_KEY) {
  console.error(
    "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다"
  );
  process.exit(1);
}

// CLI 인자 파싱
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");

const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

const viewportIdx = args.indexOf("--viewport");
const VIEWPORT_ARG =
  viewportIdx !== -1 ? args[viewportIdx + 1] : "both";
const VIEWPORTS =
  VIEWPORT_ARG === "mobile"
    ? ["mobile"]
    : VIEWPORT_ARG === "desktop"
    ? ["desktop"]
    : ["mobile", "desktop"];

// Supabase client (Storage 업로드용)
const supabase = createClient(SB_URL, SB_KEY);

// ─── REST API 헬퍼 ───────────────────────────────────────────────────────────

async function sbGet(path) {
  const res = await fetch(`${SB_URL}/rest/v1${path}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  });
  if (!res.ok) throw new Error(`sbGet ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sbUpsert(table, rows, onConflict) {
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
    const text = await res.text();
    throw new Error(`sbUpsert ${res.status}: ${text}`);
  }
}

// ─── Railway 크롤러 ──────────────────────────────────────────────────────────

async function callCrawler(url, viewport) {
  const res = await fetch(`${CRAWLER_URL}/crawl`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-secret": CRAWLER_SECRET,
    },
    body: JSON.stringify({ url, clickCta: true, viewport }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`Crawler ${res.status}: ${await res.text()}`);
  return res.json();
}

async function callCrawlerWithRetry(url, viewport, maxAttempts = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await callCrawler(url, viewport);
    } catch (err) {
      lastErr = err;
      if (attempt < maxAttempts) {
        console.log(
          `    재시도 ${attempt}/${maxAttempts - 1}: ${err.message}`
        );
        await sleep(3000);
      }
    }
  }
  throw lastErr;
}

// ─── Storage 업로드 ──────────────────────────────────────────────────────────

async function uploadScreenshot(lpId, viewport, filename, base64Data) {
  const buffer = Buffer.from(base64Data, "base64");
  const storagePath = `${lpId}/${viewport}/${filename}`;

  const { error } = await supabase.storage
    .from("lp-screenshots")
    .upload(storagePath, buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });

  if (error) throw new Error(`Storage 업로드 실패: ${error.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from("lp-screenshots").getPublicUrl(storagePath);

  return publicUrl;
}

// ─── 유틸리티 ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function simpleHash(str) {
  // 스크린샷 base64의 앞 256자로 간단한 해시 생성 (변경 감지용)
  let hash = 0;
  const sample = str.slice(0, 256);
  for (let i = 0; i < sample.length; i++) {
    hash = (Math.imul(31, hash) + sample.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `LP 크롤링 시작${DRY_RUN ? " (dry-run)" : ""} — viewport: ${VIEWPORT_ARG}${LIMIT ? ` — limit: ${LIMIT}` : ""}`
  );

  // 1. 활성 product LP 조회
  let lps = await sbGet(
    `/landing_pages?select=id,canonical_url,title&page_type=eq.product&is_active=eq.true&order=id.asc`
  );

  console.log(`  조회된 LP: ${lps.length}건`);

  if (LIMIT) {
    lps = lps.slice(0, LIMIT);
    console.log(`  처리 제한: ${LIMIT}건`);
  }

  if (lps.length === 0) {
    console.log("  처리할 LP 없음. 종료.");
    return;
  }

  if (DRY_RUN) {
    console.log(`\n[dry-run] 크롤링 대상 목록:`);
    for (const lp of lps) {
      console.log(`  - [${lp.id}] ${lp.canonical_url} (${lp.title || "제목없음"})`);
    }
    console.log(
      `\n총 ${lps.length}건 × ${VIEWPORTS.length}뷰포트 = ${lps.length * VIEWPORTS.length}회 크롤링 예정`
    );
    return;
  }

  // 2. 크롤링 실행
  let totalSuccess = 0;
  let totalFailed = 0;
  let screenshotsUploaded = 0;
  let ctaScreenshotsCaptured = 0;

  const total = lps.length;

  for (let i = 0; i < lps.length; i++) {
    const lp = lps[i];
    const domain = (() => {
      try {
        return new URL(lp.canonical_url).hostname;
      } catch {
        return lp.canonical_url;
      }
    })();

    for (const viewport of VIEWPORTS) {
      const prefix = `[${i + 1}/${total}] ${viewport}`;
      process.stdout.write(`  ${prefix} ⏳ ${domain} ...`);

      try {
        const crawlResult = await callCrawlerWithRetry(
          lp.canonical_url,
          viewport
        );

        // 스크린샷 업로드
        let screenshotUrl = null;
        let ctaScreenshotUrl = null;
        let screenshotHash = null;
        let ctaScreenshotHash = null;

        if (crawlResult.screenshot) {
          screenshotUrl = await uploadScreenshot(
            lp.id,
            viewport,
            "main.jpg",
            crawlResult.screenshot
          );
          screenshotHash = simpleHash(crawlResult.screenshot);
          screenshotsUploaded++;
        }

        if (crawlResult.ctaScreenshot) {
          ctaScreenshotUrl = await uploadScreenshot(
            lp.id,
            viewport,
            "cta.jpg",
            crawlResult.ctaScreenshot
          );
          ctaScreenshotHash = simpleHash(crawlResult.ctaScreenshot);
          ctaScreenshotsCaptured++;
        }

        // Section screenshots
        const sectionUrls = {};
        if (crawlResult.sections) {
          for (const [name, base64] of Object.entries(crawlResult.sections)) {
            if (!base64) continue;
            const sectionPath = `${lp.id}/${viewport}/section_${name}.jpg`;
            const sectionBuf = Buffer.from(base64, "base64");
            const { error: sErr } = await supabase.storage
              .from("lp-screenshots")
              .upload(sectionPath, sectionBuf, {
                contentType: "image/jpeg",
                upsert: true,
              });
            if (!sErr) {
              const {
                data: { publicUrl },
              } = supabase.storage
                .from("lp-screenshots")
                .getPublicUrl(sectionPath);
              sectionUrls[name] = publicUrl;
            }
          }
        }

        // lp_snapshots upsert
        await sbUpsert(
          "lp_snapshots",
          [
            {
              lp_id: lp.id,
              viewport,
              screenshot_url: screenshotUrl,
              cta_screenshot_url: ctaScreenshotUrl,
              screenshot_hash: screenshotHash,
              cta_screenshot_hash: ctaScreenshotHash,
              section_screenshots: sectionUrls,
              crawled_at: new Date().toISOString(),
              crawler_version: crawlResult.version || null,
            },
          ],
          "lp_id,viewport"
        );

        const sectionCount = Object.keys(sectionUrls).length;
        const ctaLabel = ctaScreenshotUrl ? " + cta" : "";
        const sectionLabel = sectionCount > 0 ? ` + ${sectionCount} sections` : "";
        process.stdout.write(
          `\r  ${prefix} ✅ ${domain} (screenshot${ctaLabel}${sectionLabel})\n`
        );
        totalSuccess++;
      } catch (err) {
        process.stdout.write(`\r  ${prefix} ❌ ${domain} — ${err.message}\n`);
        totalFailed++;
      }

      // 요청 간 딜레이 (Railway 부하 방지)
      if (i < lps.length - 1 || viewport !== VIEWPORTS[VIEWPORTS.length - 1]) {
        await sleep(2000);
      }
    }
  }

  // 3. 결과 요약
  console.log(`\n━━━ 결과 ━━━`);
  console.log(`총 LP: ${total}건 × ${VIEWPORTS.length}뷰포트`);
  console.log(`성공: ${totalSuccess}건`);
  console.log(`실패: ${totalFailed}건`);
  console.log(`스크린샷 업로드: ${screenshotsUploaded}장`);
  console.log(`CTA 스크린샷: ${ctaScreenshotsCaptured}장`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
