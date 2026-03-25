import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createServiceClient } from "@/lib/db";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import { embedContentToChunks } from "@/actions/embed-pipeline";
import { parseRSSFeed, parseYouTubeRSS, fetchAndParseUrl, fetchYouTubeTranscript } from "@/lib/content-crawler";

// ── URL 정규화 (utm 파라미터 등 제거) ──────────────────────────
function normalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    // utm_* 및 트래킹 파라미터 제거
    const removeParams = [...u.searchParams.keys()].filter(
      (k) => k.startsWith("utm_") || ["ref", "source", "fbclid", "gclid"].includes(k)
    );
    for (const k of removeParams) u.searchParams.delete(k);
    // 남은 파라미터가 없으면 깔끔한 URL 반환
    const cleaned = u.searchParams.toString()
      ? `${u.origin}${u.pathname}?${u.searchParams}`
      : `${u.origin}${u.pathname}`;
    // 끝 슬래시 제거 (통일)
    return cleaned.replace(/\/+$/, "");
  } catch {
    return rawUrl;
  }
}

// ── Cloud Run Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

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
    // 1. content_sources에서 활성 소스 조회 (youtube 포함)
    // consecutive_failures, last_success_at 등 DB 타입 미등록 컬럼 포함 → as any 캐스팅
    const { data: sources, error: srcErr } = await (svc
      .from("content_sources")
      .select("id, name, url, feed_type, config, consecutive_failures")
      .eq("is_active", true) as unknown as Promise<{
        data: Array<{
          id: string;
          name: string;
          url: string;
          feed_type: string;
          config: Record<string, unknown> | null;
          consecutive_failures: number | null;
        }> | null;
        error: { message: string } | null;
      }>);

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
        feed_type: source.feed_type,
        inserted: 0,
        skipped: 0,
        errors: [] as string[],
      };

      try {
        let items: { title: string; link: string; bodyMd?: string }[] = [];

        if (source.feed_type === "youtube") {
          // YouTube: parseYouTubeRSS → 자막/설명 → body_md
          const ytItems = await parseYouTubeRSS(source.url, 3);
          for (const yt of ytItems) {
            const transcript = await fetchYouTubeTranscript(yt.videoId);
            const bodyMd = transcript
              ? `## ${yt.title}\n\n${yt.description || ""}\n\n### 자막\n${transcript}`
              : yt.description
                ? `## ${yt.title}\n\n${yt.description}`
                : `## ${yt.title}\n\n(자막/설명 없음)`;
            items.push({ title: yt.title, link: yt.link, bodyMd });
          }
        } else {
          // RSS/HTML: 기존 방식
          const rssItems = await parseRSSFeed(source.url, 5);
          items = rssItems.map((item) => ({ title: item.title, link: item.link }));
        }

        for (const item of items) {
          try {
            // 중복 체크 (URL 정규화 후 비교)
            const normalizedLink = normalizeUrl(item.link);
            const { data: existingByUrl } = await svc
              .from("contents")
              .select("id")
              .eq("source_ref", normalizedLink)
              .maybeSingle();

            if (existingByUrl) {
              (sourceResult.skipped as number)++;
              continue;
            }

            // 원본 URL로도 중복 체크 (기존 데이터와 호환)
            if (normalizedLink !== item.link) {
              const { data: existingByRaw } = await svc
                .from("contents")
                .select("id")
                .eq("source_ref", item.link)
                .maybeSingle();

              if (existingByRaw) {
                (sourceResult.skipped as number)++;
                continue;
              }
            }

            // 제목 유사도 체크 (같은 제목의 글이 이미 있으면 skip)
            const { data: existingByTitle } = await svc
              .from("contents")
              .select("id")
              .eq("title", item.title)
              .eq("source_type", source.feed_type === "youtube" ? "youtube" : "crawl")
              .maybeSingle();

            if (existingByTitle) {
              (sourceResult.skipped as number)++;
              continue;
            }

            // 본문 가져오기
            let title = item.title;
            let bodyMd = item.bodyMd || "";

            if (!bodyMd) {
              // RSS/HTML: URL 크롤링
              const parsed = await fetchAndParseUrl(item.link);
              if ("error" in parsed) {
                (sourceResult.errors as string[]).push(`${item.title}: ${parsed.error}`);
                continue;
              }
              title = parsed.title || item.title;
              bodyMd = parsed.bodyMd;
            }

            // contents INSERT
            const { data: inserted, error: insertErr } = await svc
              .from("contents")
              .insert({
                title,
                body_md: bodyMd,
                type: "info_share",
                source_type: source.feed_type === "youtube" ? "youtube" : "crawl",
                source_ref: normalizedLink,
                status: "draft",
                curation_status: "new",
              })
              .select("id")
              .single();

            if (insertErr) {
              (sourceResult.errors as string[]).push(`${item.title}: INSERT 실패 - ${insertErr.message}`);
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

        // 성공: last_crawled_at + last_success_at 갱신, consecutive_failures 리셋
        // DB 타입 미등록 컬럼(last_success_at, consecutive_failures) → as any 캐스팅
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (svc.from("content_sources") as any)
          .update({
            last_crawled_at: new Date().toISOString(),
            last_success_at: new Date().toISOString(),
            consecutive_failures: 0,
          })
          .eq("id", source.id);
      } catch (srcError) {
        const errMsg = srcError instanceof Error ? srcError.message : String(srcError);
        sourceResult.error = errMsg;
        hasPartialError = true;

        // 실패: consecutive_failures 증가, 3회 연속 시 자동 비활성화
        const newFailCount = ((source.consecutive_failures as number) || 0) + 1;
        const updates: Record<string, unknown> = {
          last_crawled_at: new Date().toISOString(),
          consecutive_failures: newFailCount,
        };
        if (newFailCount >= 3) {
          updates.is_active = false;
          sourceResult.auto_disabled = true;
          console.warn(`[collect-content] ${source.name}: 3회 연속 실패 → 자동 비활성화`);
        }
        // DB 타입 미등록 컬럼(consecutive_failures, is_active) → as any 캐스팅
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (svc.from("content_sources") as any).update(updates).eq("id", source.id);
      }

      results.push(sourceResult);
    }

    await completeCronRun(
      cronRunId,
      hasPartialError ? "partial" : "success",
      totalInserted,
      hasPartialError ? "일부 소스 실패" : undefined,
      results
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

    // 0건 수집 경고
    const warning = totalInserted === 0 ? "수집 0건 — 소스 상태 확인 필요" : undefined;

    return NextResponse.json({
      message: "collect-content 완료",
      inserted: totalInserted,
      ...(warning && { warning }),
      sources: results,
    });
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    console.error("[collect-content] fatal error:", e);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
