#!/usr/bin/env node
/**
 * LP 크롤링 스크립트 — Railway 크롤러로 LP 스크린샷 + 임베딩 생성
 * 로컬 실행 전용 (cron route 대체, 타임아웃 문제 회피)
 *
 * Usage: node scripts/crawl-lps.mjs [--limit 10]
 *
 * 플로우:
 * 1. ad_creative_embeddings에서 lp_url IS NOT NULL AND lp_screenshot_url IS NULL 조회
 * 2. 각 row → Railway 크롤러(/crawl) 단건 호출
 * 3. 스크린샷 → Supabase Storage 업로드
 * 4. LP 텍스트 → Gemini 임베딩
 * 5. DB UPDATE
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env.local 파싱
const envPath = resolve(__dirname, "..", ".env.local");
const envContent = readFileSync(envPath, "utf-8");
const env = {};
for (const line of envContent.split("\n")) {
  const match = line.match(/^([^#=]+)=(.*)$/);
  if (match) env[match[1].trim()] = match[2].trim();
}

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const CRAWLER_URL =
  env.CRAWLER_URL || "https://bscamp-crawler-production.up.railway.app";
const CRAWLER_SECRET = env.CRAWLER_SECRET || "123455";
const EMBEDDING_MODEL = env.EMBEDDING_MODEL || "gemini-embedding-2-preview";
const EMBEDDING_DIMENSIONS = parseInt(
  env.EMBEDDING_DIMENSIONS || "3072",
  10,
);

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_API_KEY) {
  console.error("필수 환경변수 누락: SUPABASE_URL, SUPABASE_KEY, GEMINI_API_KEY");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// CLI args
const args = process.argv.slice(2);
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : 999;

// ── Railway 단건 크롤링 ──────────────────────────
async function crawlSingle(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 90_000); // 90s

    const res = await fetch(`${CRAWLER_URL}/crawl`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(CRAWLER_SECRET
          ? { Authorization: `Bearer ${CRAWLER_SECRET}` }
          : {}),
      },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`  ⚠ HTTP ${res.status} for ${url}`);
      return null;
    }

    return await res.json();
  } catch (err) {
    if (err.name === "AbortError") {
      console.warn(`  ⚠ 타임아웃 (90s): ${url}`);
    } else {
      console.warn(`  ⚠ 크롤링 실패: ${url}`, err.message);
    }
    return null;
  }
}

// ── Gemini 임베딩 ─────────────────────────────────
async function generateEmbedding(content, taskType = "RETRIEVAL_DOCUMENT") {
  const parts = [];

  if (typeof content === "string") {
    parts.push({ text: content });
  } else if (content.imageBase64) {
    parts.push({
      inline_data: {
        mime_type: content.mimeType || "image/png",
        data: content.imageBase64,
      },
    });
  }

  if (parts.length === 0) return null;

  const requestBody = {
    model: `models/${EMBEDDING_MODEL}`,
    content: { parts },
    outputDimensionality: EMBEDDING_DIMENSIONS,
    taskType,
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    },
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini 임베딩 실패 (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data?.embedding?.values || null;
}

// ── Supabase Storage 업로드 ──────────────────────
async function uploadScreenshot(adId, type, base64Data) {
  const buffer = Buffer.from(base64Data, "base64");
  const path = `lp-screenshots/${adId}/${type}.png`;

  const { error } = await supabase.storage
    .from("creatives")
    .upload(path, buffer, { contentType: "image/png", upsert: true });

  if (error) {
    console.warn(`  ⚠ 업로드 실패 ${adId}/${type}:`, error.message);
    return null;
  }

  const { data } = supabase.storage.from("creatives").getPublicUrl(path);
  return data?.publicUrl || null;
}

// ── 딜레이 ────────────────────────────────────────
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ── 메인 ─────────────────────────────────────────
async function main() {
  console.log("=== LP 크롤링 시작 ===");
  console.log(`크롤러: ${CRAWLER_URL}`);
  console.log(`임베딩 모델: ${EMBEDDING_MODEL} (${EMBEDDING_DIMENSIONS}차원)`);

  // 1. 대상 조회
  const { data: rows, error } = await supabase
    .from("ad_creative_embeddings")
    .select("id, ad_id, lp_url, screenshot_hash")
    .not("lp_url", "is", null)
    .is("lp_screenshot_url", null)
    .eq("is_active", true)
    .limit(LIMIT);

  if (error) {
    console.error("DB 조회 실패:", error.message);
    process.exit(1);
  }

  console.log(`대상: ${rows.length}건\n`);

  if (rows.length === 0) {
    console.log("크롤링 대상 없음. 종료.");
    return;
  }

  const stats = {
    total: rows.length,
    crawled: 0,
    screenshots: 0,
    embeddings: 0,
    errors: 0,
  };

  // 2. 순차 크롤링
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    console.log(`[${i + 1}/${rows.length}] ${row.ad_id} → ${row.lp_url}`);

    // 크롤링
    const result = await crawlSingle(row.lp_url);
    if (!result) {
      stats.errors++;
      console.log("  ✗ 크롤링 실패\n");
      await delay(1000);
      continue;
    }

    stats.crawled++;
    console.log(
      `  ✓ 크롤링 성공 (headline: ${result.text?.headline?.slice(0, 40) || "없음"})`,
    );

    // 업데이트 객체
    const updates = {
      lp_headline: result.text?.headline || null,
      lp_price: result.text?.price || null,
      screenshot_hash: result.screenshotHash || null,
      lp_crawled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // 스크린샷 업로드
    if (result.screenshot) {
      const mainUrl = await uploadScreenshot(
        row.ad_id,
        "main",
        result.screenshot,
      );
      if (mainUrl) {
        updates.lp_screenshot_url = mainUrl;
        stats.screenshots++;
        console.log("  ✓ 메인 스크린샷 업로드");
      }
    }

    if (result.ctaScreenshot) {
      const ctaUrl = await uploadScreenshot(
        row.ad_id,
        "cta",
        result.ctaScreenshot,
      );
      if (ctaUrl) {
        updates.lp_cta_screenshot_url = ctaUrl;
        console.log("  ✓ CTA 스크린샷 업로드");
      }
    }

    // LP 스크린샷 임베딩 (이미지)
    if (result.screenshot) {
      try {
        const lpEmbed = await generateEmbedding(
          { imageBase64: result.screenshot, mimeType: "image/png" },
          "RETRIEVAL_DOCUMENT",
        );
        if (lpEmbed) {
          updates.lp_embedding = lpEmbed;
          stats.embeddings++;
          console.log("  ✓ LP 이미지 임베딩 생성");
        }
      } catch (err) {
        console.warn("  ⚠ LP 이미지 임베딩 실패:", err.message);
      }
      await delay(500); // Gemini rate limit
    }

    // LP 텍스트 임베딩
    const lpText = [result.text?.headline, result.text?.description]
      .filter(Boolean)
      .join("\n");
    if (lpText.trim().length > 10) {
      try {
        const textEmbed = await generateEmbedding(lpText, "RETRIEVAL_DOCUMENT");
        if (textEmbed) {
          updates.lp_text_embedding = textEmbed;
          console.log("  ✓ LP 텍스트 임베딩 생성");
        }
      } catch (err) {
        console.warn("  ⚠ LP 텍스트 임베딩 실패:", err.message);
      }
      await delay(500); // Gemini rate limit
    }

    // DB 업데이트
    const { error: updateErr } = await supabase
      .from("ad_creative_embeddings")
      .update(updates)
      .eq("id", row.id);

    if (updateErr) {
      console.error("  ✗ DB 업데이트 실패:", updateErr.message);
      stats.errors++;
    } else {
      console.log("  ✓ DB 업데이트 완료");
    }

    console.log("");
    await delay(1000); // 크롤러 rate limit
  }

  // 결과 출력
  console.log("=== 크롤링 완료 ===");
  console.log(`전체: ${stats.total}`);
  console.log(`크롤링 성공: ${stats.crawled}`);
  console.log(`스크린샷 업로드: ${stats.screenshots}`);
  console.log(`임베딩 생성: ${stats.embeddings}`);
  console.log(`에러: ${stats.errors}`);
}

main().catch(console.error);
