import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import { embedContentToChunks } from "@/actions/embed-pipeline";
import {
  parseYouTubeRSS,
  fetchYouTubeTranscript,
} from "@/lib/content-crawler";

// ── Vercel Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

export const maxDuration = 300;

// ── GET /api/cron/collect-youtube ─────────────────────────────
// 매일 UTC 21:00 (KST 06:00) — YouTube 자막 수집
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const svc = createServiceClient();
  const cronRunId = await startCronRun("collect-youtube");
  const newContentIds: string[] = [];

  let totalInserted = 0;
  let hasPartialError = false;

  try {
    // 1. content_sources에서 YouTube 소스 조회
    const { data: sources, error: srcErr } = await svc
      .from("content_sources")
      .select("id, name, url, config")
      .eq("is_active", true)
      .eq("feed_type", "youtube");

    if (srcErr) {
      throw new Error(`content_sources 조회 실패: ${srcErr.message}`);
    }

    if (!sources || sources.length === 0) {
      await completeCronRun(cronRunId, "success", 0, "YouTube 소스 없음");
      return NextResponse.json({
        message: "YouTube 소스 없음",
        inserted: 0,
      });
    }

    const results: Record<string, unknown>[] = [];

    // 2. 채널별 수집
    for (const source of sources) {
      const sourceResult: Record<string, unknown> = {
        name: source.name,
        inserted: 0,
        skipped: 0,
        errors: [] as string[],
      };

      try {
        // YouTube RSS 피드 파싱
        const videos = await parseYouTubeRSS(source.url, 3);

        for (const video of videos) {
          try {
            // 중복 체크 (source_ref = youtube:{videoId})
            const sourceRef = `youtube:${video.videoId}`;
            const { data: existing } = await svc
              .from("contents")
              .select("id")
              .eq("source_ref", sourceRef)
              .maybeSingle();

            if (existing) {
              (sourceResult.skipped as number)++;
              continue;
            }

            // 자막 가져오기 (TranscriptAPI.com)
            let bodyMd = await fetchYouTubeTranscript(video.videoId);

            // 자막 없으면 description + title fallback
            if (!bodyMd) {
              bodyMd = [
                `# ${video.title}`,
                "",
                video.description || "(자막/설명 없음)",
                "",
                `원본: ${video.link}`,
              ].join("\n");
            }

            // contents INSERT
            const title = `YouTube: ${source.name} - ${video.title}`;
            const { data: inserted, error: insertErr } = await svc
              .from("contents")
              .insert({
                title,
                body_md: bodyMd,
                type: "info_share",
                source_type: "youtube",
                source_ref: sourceRef,
                status: "draft",
                curation_status: "new",
              })
              .select("id")
              .single();

            if (insertErr) {
              (sourceResult.errors as string[]).push(
                `${video.title}: INSERT 실패 - ${insertErr.message}`
              );
              continue;
            }

            if (inserted) {
              newContentIds.push(inserted.id);
              (sourceResult.inserted as number)++;
              totalInserted++;
            }
          } catch (videoErr) {
            (sourceResult.errors as string[]).push(
              `${video.title}: ${videoErr instanceof Error ? videoErr.message : String(videoErr)}`
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
      hasPartialError ? "일부 채널 실패" : undefined
    );

    // 3. 백그라운드 임베딩
    if (newContentIds.length > 0) {
      after(async () => {
        for (const id of newContentIds) {
          try {
            await embedContentToChunks(id);
            console.log(`[collect-youtube] 임베딩 완료: ${id}`);
          } catch (err) {
            console.error(`[collect-youtube] 임베딩 실패 (${id}):`, err);
          }
        }
      });
    }

    return NextResponse.json({
      message: "collect-youtube 완료",
      inserted: totalInserted,
      channels: results,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    console.error("[collect-youtube] fatal error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
