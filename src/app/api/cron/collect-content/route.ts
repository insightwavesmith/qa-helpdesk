import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import { embedContentToChunks } from "@/actions/embed-pipeline";
import { parseRSSFeed, fetchAndParseUrl } from "@/lib/content-crawler";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export const maxDuration = 300;

// ── GET /api/cron/collect-content ─────────────────────────────
// 매일 UTC 20:00 (KST 05:00) — 블로그/뉴스 RSS 크롤링
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const cronRunId = await startCronRun("collect-content");
  const newContentIds: string[] = [];

  let totalInserted = 0;
  let hasPartialError = false;

  try {
    // 1. content_sources에서 활성 블로그/뉴스 소스 조회
    const { data: sources, error: srcErr } = await svc
      .from("content_sources")
      .select("id, name, url, feed_type, config")
      .eq("is_active", true)
      .in("feed_type", ["rss", "html"]);

    if (srcErr) {
      throw new Error(`content_sources 조회 실패: ${srcErr.message}`);
    }

    if (!sources || sources.length === 0) {
      await completeCronRun(cronRunId, "success", 0, "활성 소스 없음");
      return NextResponse.json({ message: "활성 소스 없음", inserted: 0 });
    }

    const results: Record<string, unknown>[] = [];

    // 2. 소스별 수집
    for (const source of sources) {
      const sourceResult: Record<string, unknown> = {
        name: source.name,
        inserted: 0,
        skipped: 0,
        errors: [] as string[],
      };

      try {
        // RSS 피드 파싱
        const items = await parseRSSFeed(source.url, 5);

        for (const item of items) {
          try {
            // 중복 체크 (source_ref = URL)
            const { data: existing } = await svc
              .from("contents")
              .select("id")
              .eq("source_ref", item.link)
              .maybeSingle();

            if (existing) {
              (sourceResult.skipped as number)++;
              continue;
            }

            // URL 크롤링 → 마크다운 변환
            const parsed = await fetchAndParseUrl(item.link);

            if ("error" in parsed) {
              (sourceResult.errors as string[]).push(
                `${item.title}: ${parsed.error}`
              );
              continue;
            }

            // contents INSERT
            const { data: inserted, error: insertErr } = await svc
              .from("contents")
              .insert({
                title: parsed.title || item.title,
                body_md: parsed.bodyMd,
                type: "info_share",
                source_type: "crawl",
                source_ref: item.link,
                status: "draft",
                curation_status: "new",
              })
              .select("id")
              .single();

            if (insertErr) {
              (sourceResult.errors as string[]).push(
                `${item.title}: INSERT 실패 - ${insertErr.message}`
              );
              continue;
            }

            if (inserted) {
              newContentIds.push(inserted.id);
              (sourceResult.inserted as number)++;
              totalInserted++;
            }
          } catch (itemErr) {
            (sourceResult.errors as string[]).push(
              `${item.title}: ${itemErr instanceof Error ? itemErr.message : String(itemErr)}`
            );
          }
        }

        // last_crawled_at 갱신
        await svc
          .from("content_sources")
          .update({ last_crawled_at: new Date().toISOString() })
          .eq("id", source.id);
      } catch (srcError) {
        sourceResult.error =
          srcError instanceof Error ? srcError.message : String(srcError);
        hasPartialError = true;
      }

      results.push(sourceResult);
    }

    await completeCronRun(
      cronRunId,
      hasPartialError ? "partial" : "success",
      totalInserted,
      hasPartialError ? "일부 소스 실패" : undefined
    );

    // 3. 백그라운드 임베딩 (응답 후)
    if (newContentIds.length > 0) {
      after(async () => {
        for (const id of newContentIds) {
          try {
            await embedContentToChunks(id);
            console.log(`[collect-content] 임베딩 완료: ${id}`);
          } catch (err) {
            console.error(`[collect-content] 임베딩 실패 (${id}):`, err);
          }
        }
      });
    }

    return NextResponse.json({
      message: "collect-content 완료",
      inserted: totalInserted,
      sources: results,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    console.error("[collect-content] fatal error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
