/**
 * GET /api/cron/crawl-lps
 * LP 크롤링 크론 v2 — landing_pages 기준, ADR-001 Storage 경로, lp_snapshots 저장
 * Vercel Cron: 1시간마다 또는 수동 호출
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { crawlV2 } from "@/lib/railway-crawler";
import { downloadLpMedia, type MediaAsset } from "@/lib/lp-media-downloader";
import { uploadToGcs } from "@/lib/gcs-storage";

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
  if (!cronSecret) return false;
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
    htmlSaved: 0,
    mediaSaved: 0,
  };
  const errorMessages: string[] = [];

  const { searchParams } = new URL(req.url);
  const accountFilter = searchParams.get("account_id");

  try {
    // 1. 크롤 대상 조회: is_active + (last_crawled_at NULL or 7일 이상 경과)
    const sevenDaysAgo = new Date(
      Date.now() - 7 * 24 * 60 * 60 * 1000,
    ).toISOString();

    let lpQuery = supabase
      .from("landing_pages")
      .select("id, account_id, canonical_url, content_hash, last_crawled_at, media_assets")
      .eq("is_active", true);
    if (accountFilter) {
      lpQuery = lpQuery.eq("account_id", accountFilter);
    } else {
      lpQuery = lpQuery.or(`last_crawled_at.is.null,last_crawled_at.lt.${sevenDaysAgo}`);
    }
    const { data: rows, error: fetchError } = await lpQuery
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
      media_assets: MediaAsset[] | null;
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

        // HTML 원본 다운로드 → Storage 업로드 (best-effort)
        let htmlStoragePath: string | null = null;
        let htmlContent: string | null = null;
        try {
          htmlContent = await fetchHtmlContent(lp.canonical_url);
          if (htmlContent) {
            const htmlPath = `lp/${lp.account_id}/${lp.id}/page.html`;
            const htmlOk = await uploadHtmlToStorage(supabase, htmlPath, htmlContent);
            if (htmlOk) {
              htmlStoragePath = htmlPath;
              stats.htmlSaved++;
            }
          }
        } catch (htmlErr) {
          // HTML 다운로드 실패는 크롤링 전체를 중단하지 않음
          console.warn(`[crawl-lps v2] HTML 다운로드 실패 (${lp.id}):`, htmlErr);
        }

        // ── 미디어 리소스 다운로드 (HTML 파싱 → img/video/gif → Storage) ──
        let newMediaAssets: MediaAsset[] = [];
        if (htmlContent) {
          try {
            newMediaAssets = await downloadLpMedia(
              supabase,
              { id: lp.id, account_id: lp.account_id, canonical_url: lp.canonical_url },
              htmlContent,
              lp.media_assets || [],
            );
            stats.mediaSaved += newMediaAssets.length;
          } catch (mediaErr) {
            console.warn(`[crawl-lps v2] 미디어 다운로드 실패 (${lp.id}):`, mediaErr);
          }
        }

        // lp_snapshots UPSERT
        const sectionScreenshots: Record<string, string> = {};
        if (htmlStoragePath) {
          sectionScreenshots.html_path = htmlStoragePath;
        }

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
              section_screenshots: sectionScreenshots,
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

        // landing_pages UPDATE (hash + last_crawled_at + media_assets)
        const now = new Date().toISOString();
        // 기존 media_assets에 신규 추가 (중복 hash 제거)
        const existingAssets: MediaAsset[] = lp.media_assets || [];
        const mergedAssets = [...existingAssets, ...newMediaAssets];
        // hash 기준 중복 제거
        const uniqueAssets = Array.from(
          new Map(mergedAssets.map((a) => [a.hash, a])).values(),
        );

        await supabase
          .from("landing_pages")
          .update({
            content_hash: newHash,
            last_crawled_at: now,
            updated_at: now,
            media_assets: uniqueAssets,
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
 * base64 → Storage 업로드 (creatives 버킷)
 * ADR-001 경로: lp/{account_id}/{lp_id}/{viewport}_full.jpg
 * GCS 또는 Supabase 듀얼 라이트 패턴.
 */
async function uploadToStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  path: string,
  base64Data: string,
): Promise<boolean> {
  try {
    const buffer = Buffer.from(base64Data, "base64");

    if (process.env.USE_CLOUD_SQL === "true") {
      const { error } = await uploadToGcs("creatives", path, buffer, "image/jpeg");
      if (error) {
        console.error(`[crawl-lps v2] GCS upload failed (${path}):`, error);
        return false;
      }
      return true;
    }

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

/**
 * LP URL에서 HTML 원본을 가져옴 (best-effort)
 * 타임아웃 15초, 최대 5MB
 */
async function fetchHtmlContent(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
          Accept: "text/html,application/xhtml+xml",
        },
        signal: controller.signal,
        redirect: "follow",
      });

      if (!res.ok) {
        console.warn(`[crawl-lps v2] HTML fetch HTTP ${res.status} for ${url}`);
        return null;
      }

      const contentType = res.headers.get("content-type") || "";
      if (!contentType.includes("text/html") && !contentType.includes("xhtml")) {
        console.warn(`[crawl-lps v2] HTML fetch: 비-HTML 응답 (${contentType})`);
        return null;
      }

      const html = await res.text();

      // 5MB 초과 시 스킵
      if (html.length > 5 * 1024 * 1024) {
        console.warn(`[crawl-lps v2] HTML 크기 초과 (${(html.length / 1024 / 1024).toFixed(1)}MB)`);
        return null;
      }

      return html;
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      console.warn(`[crawl-lps v2] HTML fetch 타임아웃 (15s) for ${url}`);
    } else {
      console.warn(`[crawl-lps v2] HTML fetch 실패:`, err);
    }
    return null;
  }
}

/**
 * HTML 문자열 → Storage 업로드 (creatives 버킷)
 * ADR-001 경로: lp/{account_id}/{lp_id}/page.html
 * GCS 또는 Supabase 듀얼 라이트 패턴.
 */
async function uploadHtmlToStorage(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  path: string,
  htmlContent: string,
): Promise<boolean> {
  try {
    const buffer = Buffer.from(htmlContent, "utf-8");

    if (process.env.USE_CLOUD_SQL === "true") {
      const { error } = await uploadToGcs("creatives", path, buffer, "text/html");
      if (error) {
        console.error(`[crawl-lps v2] GCS HTML upload failed (${path}):`, error);
        return false;
      }
      return true;
    }

    const { error } = await supabase.storage
      .from("creatives")
      .upload(path, buffer, { contentType: "text/html", upsert: true });

    if (error) {
      console.error(`[crawl-lps v2] HTML Storage upload failed (${path}):`, error.message);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`[crawl-lps v2] HTML Storage upload error:`, err);
    return false;
  }
}
