/**
 * POST /api/cron/crawl-lps
 * LP 크롤링 크론 — lp_url 있지만 스크린샷 없는 row를 Railway 배치 크롤링
 * Vercel Cron: 1시간마다 또는 수동 호출
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { crawlBatch } from "@/lib/railway-crawler";
import { generateEmbedding } from "@/lib/gemini";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

// Vercel Cron은 GET 호출
export async function GET(req: NextRequest) {
  return handleCrawl(req);
}

export async function POST(req: NextRequest) {
  return handleCrawl(req);
}

async function handleCrawl(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServiceClient();
  const stats = {
    pending: 0,
    crawled: 0,
    screenshotsUploaded: 0,
    reembedded: 0,
    errors: [] as string[],
  };

  try {
    // 1. lp_url 있지만 lp_screenshot_url 없는 row 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: rows, error } = await (supabase as any)
      .from("ad_creative_embeddings")
      .select("id, ad_id, lp_url, screenshot_hash, lp_crawled_at")
      .not("lp_url", "is", null)
      .is("lp_screenshot_url", null)
      .eq("is_active", true)
      .limit(20);

    if (error) {
      return NextResponse.json(
        { error: "DB 조회 실패", detail: error.message },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      // 스크린샷 있는 row 중 해시 변경 감지 대상 체크
      const changed = await checkAndRecrawlChanged(supabase, stats);
      return NextResponse.json({
        message: "새 크롤링 대상 없음",
        changedRecrawled: changed,
        ...stats,
      });
    }

    stats.pending = rows.length;

    // 2. Railway 배치 크롤링
    const urls = rows.map((r: { lp_url: string }) => r.lp_url);
    const batchResult = await crawlBatch(urls);

    // 3. 결과 처리
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const result = batchResult.results[i];

      if (!result) {
        stats.errors.push(`${row.ad_id}: 크롤링 실패`);
        continue;
      }

      stats.crawled++;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {
        lp_headline: result.text.headline || null,
        lp_price: result.text.price || null,
        screenshot_hash: result.screenshotHash || null,
        lp_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      // 스크린샷 → Supabase Storage
      if (result.screenshot) {
        const mainUrl = await uploadToStorage(
          supabase,
          row.ad_id,
          "main",
          result.screenshot,
        );
        if (mainUrl) {
          updates.lp_screenshot_url = mainUrl;
          stats.screenshotsUploaded++;
        }
      }
      if (result.ctaScreenshot) {
        const ctaUrl = await uploadToStorage(
          supabase,
          row.ad_id,
          "cta",
          result.ctaScreenshot,
        );
        if (ctaUrl) {
          updates.lp_cta_screenshot_url = ctaUrl;
        }
      }

      // LP 스크린샷 임베딩
      if (result.screenshot) {
        try {
          updates.lp_embedding = await generateEmbedding(
            { imageUrl: `data:image/png;base64,${result.screenshot}` },
            { taskType: "RETRIEVAL_DOCUMENT" },
          );
          stats.reembedded++;
        } catch (err) {
          stats.errors.push(
            `${row.ad_id} lp_embedding: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      // LP 텍스트 임베딩
      const lpText = [result.text.headline, result.text.description]
        .filter(Boolean)
        .join("\n");
      if (lpText.trim().length > 10) {
        try {
          updates.lp_text_embedding = await generateEmbedding(lpText, {
            taskType: "RETRIEVAL_DOCUMENT",
          });
        } catch {
          // 텍스트 임베딩 실패 무시
        }
      }

      // DB 업데이트
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase as any)
        .from("ad_creative_embeddings")
        .update(updates)
        .eq("id", row.id);

      if (updateErr) {
        stats.errors.push(`${row.ad_id} update: ${updateErr.message}`);
      }
    }

    return NextResponse.json({
      message: "crawl-lps 완료",
      ...stats,
    });
  } catch (err) {
    console.error("[crawl-lps] Fatal:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err), ...stats },
      { status: 500 },
    );
  }
}

/**
 * 이미 크롤링된 row 중 오래된 것 재크롤링 (해시 변경 감지)
 */
async function checkAndRecrawlChanged(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  stats: { crawled: number; reembedded: number; screenshotsUploaded: number; errors: string[] },
): Promise<number> {
  // 7일 이상 된 크롤링 결과 재확인 (최대 10개)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleRows } = await supabase
    .from("ad_creative_embeddings")
    .select("id, ad_id, lp_url, screenshot_hash")
    .not("lp_url", "is", null)
    .not("lp_screenshot_url", "is", null)
    .lt("lp_crawled_at", sevenDaysAgo)
    .eq("is_active", true)
    .limit(10);

  if (!staleRows || staleRows.length === 0) return 0;

  const urls = staleRows.map((r: { lp_url: string }) => r.lp_url);
  const batchResult = await crawlBatch(urls);

  let recrawled = 0;

  for (let i = 0; i < staleRows.length; i++) {
    const row = staleRows[i];
    const result = batchResult.results[i];
    if (!result) continue;

    // 해시 비교 → 변경된 경우만 업데이트
    if (result.screenshotHash && result.screenshotHash !== row.screenshot_hash) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const updates: Record<string, any> = {
        screenshot_hash: result.screenshotHash,
        lp_headline: result.text.headline || null,
        lp_price: result.text.price || null,
        lp_crawled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (result.screenshot) {
        const url = await uploadToStorage(supabase, row.ad_id, "main", result.screenshot);
        if (url) {
          updates.lp_screenshot_url = url;
          stats.screenshotsUploaded++;
        }

        try {
          updates.lp_embedding = await generateEmbedding(
            { imageUrl: `data:image/png;base64,${result.screenshot}` },
            { taskType: "RETRIEVAL_DOCUMENT" },
          );
          stats.reembedded++;
        } catch {
          // 임베딩 실패 무시
        }
      }

      await supabase
        .from("ad_creative_embeddings")
        .update(updates)
        .eq("id", row.id);

      recrawled++;
    } else {
      // 해시 미변경 → 타임스탬프만 갱신
      await supabase
        .from("ad_creative_embeddings")
        .update({
          lp_crawled_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", row.id);
    }
  }

  return recrawled;
}

/**
 * base64 → Supabase Storage 업로드
 */
async function uploadToStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  adId: string,
  type: "main" | "cta",
  base64Data: string,
): Promise<string | null> {
  try {
    const buffer = Buffer.from(base64Data, "base64");
    const path = `lp-screenshots/${adId}/${type}.png`;

    const { error } = await supabase.storage
      .from("creatives")
      .upload(path, buffer, { contentType: "image/png", upsert: true });

    if (error) {
      console.error(`[crawl-lps] Upload failed ${adId}/${type}:`, error.message);
      return null;
    }

    const { data } = supabase.storage.from("creatives").getPublicUrl(path);
    return data?.publicUrl || null;
  } catch (err) {
    console.error(`[crawl-lps] Upload error:`, err);
    return null;
  }
}
