/**
 * GET /api/cron/crawl-lps
 * LP 크롤링 크론 v2 — landing_pages 기준, ADR-001 Storage 경로, lp_snapshots 저장
 * Vercel Cron: 1시간마다 또는 수동 호출
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { crawlV2 } from "@/lib/railway-crawler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// 크롤링 배제 URL 패턴 (자동 비활성화)
const BLOCKED_URL_PATTERNS = [
  "facebook.com/canvas_doc",
  "mkt.shopping.naver.com",
  "naver.com",
  "google.com",
];

function isBlockedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const full = parsed.href;
    return BLOCKED_URL_PATTERNS.some((pattern) => full.includes(pattern));
  } catch {
    return false;
  }
}

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

function computeHash(base64Data: string): string {
  return createHash("sha256").update(base64Data).digest("hex");
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supabase = createServiceClient() as any;

  const stats = {
    crawled: 0,
    skipped: 0,
    errors: 0,
    hashChanged: 0,
  };
  const errorMessages: string[] = [];

  try {
    // 1. 크롤 대상 조회: is_active + (last_crawled_at NULL or 7일 이상 경과)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const { data: rows, error: fetchError } = await supabase
      .from("landing_pages")
      .select("id, account_id, canonical_url, content_hash, last_crawled_at")
      .eq("is_active", true)
      .or(`last_crawled_at.is.null,last_crawled_at.lt.${sevenDaysAgo}`)
      .order("last_crawled_at", { ascending: true, nullsFirst: true })
      .limit(10);

    if (fetchError) {
      return NextResponse.json(
        { error: "DB 조회 실패", detail: fetchError.message },
        { status: 500 },
      );
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        message: "크롤링 대상 없음 (모두 최신 상태)",
        ...stats,
      });
    }

    // 2. 각 LP 처리
    for (const lp of rows as Array<{
      id: string;
      account_id: string;
      canonical_url: string;
      content_hash: string | null;
      last_crawled_at: string | null;
    }>) {
      // 차단 URL 감지 → is_active = false
      if (isBlockedUrl(lp.canonical_url)) {
        await supabase
          .from("landing_pages")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", lp.id);
        stats.skipped++;
        continue;
      }

      // Railway 크롤링 (mobile 뷰포트)
      const crawlResult = await crawlV2(lp.canonical_url, {
        viewport: "mobile",
        sections: false,
      });

      if (!crawlResult || !crawlResult.screenshot) {
        // 타임아웃 또는 크롤 실패 → last_crawled_at 미갱신 (다음 크론 재시도)
        errorMessages.push(`${lp.id}: 크롤 실패 또는 스크린샷 없음`);
        stats.errors++;
        continue;
      }

      // content_hash 계산
      const newHash = computeHash(crawlResult.screenshot);
      const hashChanged = lp.content_hash !== newHash;

      if (hashChanged) {
        // 스크린샷 → Storage 업로드
        const storagePath = `lp/${lp.account_id}/${lp.id}/mobile_full.jpg`;
        const uploadOk = await uploadToStorage(
          supabase,
          storagePath,
          crawlResult.screenshot,
        );

        if (!uploadOk) {
          errorMessages.push(`${lp.id}: Storage 업로드 실패`);
          stats.errors++;
          // Storage 실패 → lp_snapshots 저장 스킵, last_crawled_at도 갱신 안 함
          continue;
        }

        // CTA 스크린샷 업로드 (있는 경우)
        let ctaStoragePath: string | null = null;
        if (crawlResult.ctaScreenshot) {
          const ctaPath = `lp/${lp.account_id}/${lp.id}/mobile_cta.jpg`;
          const ctaOk = await uploadToStorage(
            supabase,
            ctaPath,
            crawlResult.ctaScreenshot,
          );
          if (ctaOk) {
            ctaStoragePath = ctaPath;
          }
        }

        // lp_snapshots UPSERT
        const { error: upsertError } = await supabase
          .from("lp_snapshots")
          .upsert(
            {
              lp_id: lp.id,
              viewport: "mobile",
              screenshot_url: storagePath,
              cta_screenshot_url: ctaStoragePath,
              screenshot_hash: newHash,
              cta_screenshot_hash: crawlResult.ctaScreenshot
                ? computeHash(crawlResult.ctaScreenshot)
                : null,
              section_screenshots: {},
              crawled_at: new Date().toISOString(),
              crawler_version: "v2-cron",
            },
            { onConflict: "lp_id,viewport" },
          );

        if (upsertError) {
          errorMessages.push(
            `${lp.id}: lp_snapshots upsert 실패: ${upsertError.message}`,
          );
          stats.errors++;
          continue;
        }

        // landing_pages UPDATE (hash + last_crawled_at)
        const now = new Date().toISOString();
        await supabase
          .from("landing_pages")
          .update({
            content_hash: newHash,
            last_crawled_at: now,
            updated_at: now,
          })
          .eq("id", lp.id);

        // change_log에 LP 변경 기록 (순환 학습)
        await supabase.from("change_log").insert({
          entity_type: "lp",
          entity_id: lp.id,
          account_id: lp.account_id,
          change_detected_at: now,
          change_type: lp.content_hash ? "new_version" : "element_added",
          element_diff: {
            old_hash: lp.content_hash,
            new_hash: newHash,
          },
        });

        // lp_analysis 재분석 트리거: analyzed_at NULL로 리셋
        await supabase
          .from("lp_analysis")
          .update({ analyzed_at: null })
          .eq("lp_id", lp.id);

        stats.hashChanged++;
        stats.crawled++;
      } else {
        // 동일 hash → last_crawled_at만 갱신 (스크린샷 재업로드 안 함)
        await supabase
          .from("landing_pages")
          .update({
            last_crawled_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", lp.id);

        stats.crawled++;
      }
    }

    return NextResponse.json({
      message: "crawl-lps v2 완료",
      ...stats,
      errorMessages: errorMessages.length > 0 ? errorMessages : undefined,
    });
  } catch (err) {
    console.error("[crawl-lps v2] Fatal:", err);
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : String(err),
        ...stats,
      },
      { status: 500 },
    );
  }
}

/**
 * base64 → Supabase Storage 업로드 (creatives 버킷)
 * ADR-001 경로: lp/{account_id}/{lp_id}/{viewport}_full.jpg
 */
async function uploadToStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  path: string,
  base64Data: string,
): Promise<boolean> {
  try {
    const buffer = Buffer.from(base64Data, "base64");

    const { error } = await supabase.storage
      .from("creatives")
      .upload(path, buffer, { contentType: "image/jpeg", upsert: true });

    if (error) {
      console.error(`[crawl-lps v2] Storage upload failed (${path}):`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[crawl-lps v2] Storage upload error:`, err);
    return false;
  }
}
