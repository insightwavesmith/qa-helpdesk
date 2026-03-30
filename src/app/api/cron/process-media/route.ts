/**
 * ═══════════════════════════════════════════════════════════════
 * process-media — 미디어 파일 다운로드 & GCS 업로드
 * ═══════════════════════════════════════════════════════════════
 *
 * 역할: collect-daily가 수집한 creative_media 중 storage_url이
 *       NULL인 항목의 미디어 파일을 Meta API에서 다운로드하여
 *       GCS에 업로드하고 storage_url을 채운다.
 *
 * 소유 테이블 (이 크론이 갱신하는 테이블):
 *   - creative_media : storage_url, media_url, thumbnail_url 업데이트
 *
 * API:
 *   GET /api/cron/process-media
 *   Authorization: Bearer {CRON_SECRET}
 *   Query: accountId, limit (기본 200), type (IMAGE|VIDEO)
 *
 * Cloud Run Cron: 매일 1회 (collect-daily 이후)
 * ═══════════════════════════════════════════════════════════════
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import {
  fetchImageUrlsByHash,
  fetchVideoThumbnails,
  fetchVideoSourceUrls,
} from "@/lib/protractor/creative-image-fetcher";
import { uploadToGcs } from "@/lib/gcs-storage";
import { triggerNext } from "@/lib/pipeline-chain";

// ── Cloud Run Cron 인증 ──────────────────────────────────────────
function verifyCron(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return false;
  return authHeader === `Bearer ${process.env.CRON_SECRET}`;
}

// ── 타입 정의 ─────────────────────────────────────────────────
interface PendingMediaRow {
  id: string;
  creative_id: string;
  media_type: string | null;
  media_url: string | null;
  raw_creative: Record<string, unknown> | null;
  position: number;
  media_hash: string | null;
  content_hash: string | null;
  creatives: {
    ad_id: string;
    account_id: string;
  };
}

interface ProcessResult {
  processed: number;
  uploaded: number;
  errors: number;
  dedup: number;
  byType: {
    IMAGE: { processed: number; uploaded: number; errors: number };
    VIDEO: { processed: number; uploaded: number; errors: number };
  };
}

// ── 메인 핸들러 ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const accountIdParam = searchParams.get("accountId");
  const limitParam = parseInt(searchParams.get("limit") ?? "200", 10);
  const typeParam = searchParams.get("type")?.toUpperCase() as "IMAGE" | "VIDEO" | null;

  const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 200;

  const cronRunId = await startCronRun("process-media");

  const result: ProcessResult = {
    processed: 0,
    uploaded: 0,
    errors: 0,
    dedup: 0,
    byType: {
      IMAGE: { processed: 0, uploaded: 0, errors: 0 },
      VIDEO: { processed: 0, uploaded: 0, errors: 0 },
    },
  };

  try {
    const svc = createServiceClient();

    // 1. storage_url이 NULL인 creative_media 조회 (90일 이내만)
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (svc as any)
      .from("creative_media")
      .select("id, creative_id, media_type, media_url, raw_creative, position, media_hash, content_hash")
      .is("storage_url", null)
      .gte("created_at", ninetyDaysAgo)
      .order("created_at", { ascending: true })
      .limit(limit);

    // 타입 필터
    if (typeParam === "IMAGE" || typeParam === "VIDEO") {
      query = query.eq("media_type", typeParam);
    }

    const { data: pendingRows, error: queryErr } = await query;

    if (queryErr) {
      console.error("[process-media] 조회 실패:", queryErr);
      await completeCronRun(cronRunId, "error", 0, queryErr.message);
      return NextResponse.json({ error: queryErr.message }, { status: 500 });
    }

    if (!pendingRows || pendingRows.length === 0) {
      await completeCronRun(cronRunId, "success", 0);
      return NextResponse.json({ message: "처리할 미디어 없음", ...result });
    }

    // 2단계: creative_id → creatives 테이블에서 ad_id, account_id 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creativeIds = [...new Set(pendingRows.map((r: any) => r.creative_id as string))];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: creativesData } = await (svc as any)
      .from("creatives")
      .select("id, ad_id, account_id")
      .in("id", creativeIds);

    const creativeMap = new Map<string, { ad_id: string; account_id: string }>(
      (creativesData ?? []).map((c: { id: string; ad_id: string; account_id: string }) => [c.id, { ad_id: c.ad_id, account_id: c.account_id }])
    );

    // creative 정보 합치기 + media_url/raw_creative 없는 행 필터
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: PendingMediaRow[] = pendingRows
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const creative = creativeMap.get(r.creative_id);
        if (!creative) return null;
        if (!r.media_url && !r.raw_creative) return null;
        return { ...r, creatives: creative } as PendingMediaRow;
      })
      .filter(Boolean) as PendingMediaRow[];

    if (rows.length === 0) {
      await completeCronRun(cronRunId, "success", 0);
      return NextResponse.json({ message: "처리할 미디어 없음 (creative 매칭 실패)", ...result });
    }

    // accountId 필터 (쿼리 파라미터로 받은 경우 JS 레벨 필터링)
    const filteredRows = accountIdParam
      ? rows.filter((r) => {
          const accId = r.creatives?.account_id ?? "";
          const cleanParam = accountIdParam.replace(/^act_/, "");
          const cleanAcc = accId.replace(/^act_/, "");
          return cleanAcc === cleanParam;
        })
      : rows;

    // 2. 계정별 그룹핑
    const byAccount = new Map<string, PendingMediaRow[]>();
    for (const row of filteredRows) {
      const accountId = row.creatives?.account_id ?? "";
      if (!accountId) continue;
      const cleanId = accountId.replace(/^act_/, "");
      if (!byAccount.has(cleanId)) byAccount.set(cleanId, []);
      byAccount.get(cleanId)!.push(row);
    }

    // ━━━ VIDEO 소스 URL 전체 계정 사전 조회 (교차 계정 폴백) ━━━
    const allVideoRows = filteredRows.filter((r) => r.media_type === "VIDEO");
    const allVideoIdSet = new Set<string>();
    for (const row of allVideoRows) {
      const videoId = extractVideoId(row);
      if (videoId) allVideoIdSet.add(videoId);
    }

    let globalVideoSources = new Map<string, string>();
    if (allVideoIdSet.size > 0) {
      const allVids = [...allVideoIdSet];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: activeAccounts } = await (svc as any)
        .from("ad_accounts")
        .select("account_id")
        .eq("active", true);

      for (const acc of (activeAccounts ?? []) as { account_id: string }[]) {
        const remaining = allVids.filter((vid) => !globalVideoSources.has(vid));
        if (remaining.length === 0) break;
        try {
          const found = await fetchVideoSourceUrls(acc.account_id, remaining, true);
          for (const [vid, url] of found) globalVideoSources.set(vid, url);
        } catch {
          // 계정 에러 무시, 다음 계정 시도
        }
      }

      console.log(
        `[process-media] VIDEO 소스 URL 사전 조회: ${globalVideoSources.size}/${allVideoIdSet.size}건 발견 (${(activeAccounts ?? []).length}개 계정 탐색)`
      );
    }

    // 3. 계정별 독립 처리
    for (const [cleanAccountId, accountRows] of byAccount) {
      try {
        await processAccountMedia(cleanAccountId, accountRows, svc, result, globalVideoSources);
      } catch (err) {
        const msg = `account ${cleanAccountId}: ${err instanceof Error ? err.message : String(err)}`;
        console.error(`[process-media] ${msg}`);
        result.errors++;
      }
    }

    const status = result.errors > 0 && result.uploaded === 0
      ? "error"
      : result.errors > 0
      ? "partial"
      : "success";

    await completeCronRun(cronRunId, status, result.uploaded, undefined, result);

    // 이벤트 체인: chain=true이고 처리 결과가 있으면 embed+saliency 병렬 트리거
    const isChain = searchParams.get("chain") === "true";
    if (isChain && (result.uploaded > 0 || result.processed > 0 || result.dedup > 0)) {
      await triggerNext([
        "embed-creatives",
        "creative-saliency",
        "video-saliency",
      ]);
      console.log(
        `[process-media] chain → embed+saliency triggered (uploaded=${result.uploaded}, processed=${result.processed}, dedup=${result.dedup})`
      );
    }

    return NextResponse.json({
      message: "process-media completed",
      ...result,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("[process-media] Fatal error:", err);
    await completeCronRun(cronRunId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}

// ── 계정별 미디어 처리 ─────────────────────────────────────────
async function processAccountMedia(
  cleanAccountId: string,
  rows: PendingMediaRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  result: ProcessResult,
  globalVideoSources?: Map<string, string>,
): Promise<void> {
  // IMAGE / VIDEO 분리
  const imageRows = rows.filter((r) => (r.media_type ?? "IMAGE") === "IMAGE");
  const videoRows = rows.filter((r) => r.media_type === "VIDEO");

  // 4a. IMAGE 처리
  if (imageRows.length > 0) {
    await processImageRows(cleanAccountId, imageRows, svc, result);
  }

  // 4b. VIDEO 처리
  if (videoRows.length > 0) {
    await processVideoRows(cleanAccountId, videoRows, svc, result, globalVideoSources);
  }
}

// ── IMAGE 처리 ────────────────────────────────────────────────
async function processImageRows(
  cleanAccountId: string,
  rows: PendingMediaRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  result: ProcessResult,
): Promise<void> {
  // image_hash → Meta API URL 조회
  const hashSet = new Set<string>();
  for (const row of rows) {
    const hash = row.media_hash || (row.raw_creative?.image_hash as string | undefined);
    if (hash) hashSet.add(hash);
    // asset_feed_spec 하위 hash도 수집
    const afsImages = (row.raw_creative?.asset_feed_spec as { images?: { hash?: string }[] } | undefined)?.images;
    if (afsImages && Array.isArray(afsImages)) {
      for (const img of afsImages) {
        if (img.hash) hashSet.add(img.hash);
      }
    }
  }

  let hashToUrl = new Map<string, string>();
  if (hashSet.size > 0) {
    try {
      hashToUrl = await fetchImageUrlsByHash(cleanAccountId, [...hashSet]);
    } catch (err) {
      console.warn(`[process-media] IMAGE fetchImageUrlsByHash 실패 [${cleanAccountId}]:`, err);
    }
  }

  for (const row of rows) {
    // ═══ content_hash 기반 중복 제거 ═══
    // 같은 콘텐츠(image_hash)가 이미 다운로드됐으면 storage_url 복사
    if (row.content_hash) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: donor } = await (svc as any)
        .from("creative_media")
        .select("storage_url, thumbnail_url")
        .eq("content_hash", row.content_hash)
        .not("storage_url", "is", null)
        .neq("id", row.id)
        .limit(1)
        .maybeSingle();

      if (donor?.storage_url) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (svc as any)
          .from("creative_media")
          .update({
            storage_url: donor.storage_url,
            thumbnail_url: donor.thumbnail_url || null,
          })
          .eq("id", row.id);

        console.log(
          `[process-media] IMAGE content_hash 재사용: ${row.content_hash} → ${donor.storage_url.slice(-40)}`
        );
        result.dedup++;
        result.processed++;
        result.byType.IMAGE.processed++;
        continue; // 다운로드 스킵
      }
    }

    result.byType.IMAGE.processed++;
    result.processed++;

    try {
      // 이미지 URL 결정: media_url 우선 → hash 조회 결과
      const hash = row.media_hash || (row.raw_creative?.image_hash as string | undefined);
      let imageUrl = row.media_url || null;
      if (!imageUrl && hash) {
        imageUrl = hashToUrl.get(hash) || null;
      }
      if (!imageUrl) {
        // asset_feed_spec 폴백
        const afsImages = (row.raw_creative?.asset_feed_spec as { images?: { hash?: string }[] } | undefined)?.images;
        if (afsImages && Array.isArray(afsImages)) {
          for (const img of afsImages) {
            if (img.hash && hashToUrl.has(img.hash)) {
              imageUrl = hashToUrl.get(img.hash)!;
              break;
            }
          }
        }
      }

      if (!imageUrl) {
        console.warn(`[process-media] IMAGE URL 없음: ${row.id}`);
        continue;
      }

      // 이미지 다운로드
      const imgRes = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
      if (!imgRes.ok) {
        console.warn(`[process-media] IMAGE 다운로드 실패 (${imgRes.status}): ${row.id}`);
        result.byType.IMAGE.errors++;
        result.errors++;
        continue;
      }

      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const contentType = imgRes.headers.get("content-type") || "image/jpeg";

      // GCS 경로 결정
      const adId = row.creatives.ad_id;
      const fileName = row.position > 0 ? `${adId}_card${row.position}.jpg` : `${adId}.jpg`;
      const gcsPath = `${cleanAccountId}/media/${fileName}`;

      const { publicUrl, error: uploadErr } = await uploadToGcs(
        "creatives",
        gcsPath,
        imgBuffer,
        contentType,
      );

      if (uploadErr || !publicUrl) {
        console.error(`[process-media] GCS IMAGE 업로드 실패 [${row.id}]:`, uploadErr);
        result.byType.IMAGE.errors++;
        result.errors++;
        continue;
      }

      // creative_media 업데이트
      const { error: updateErr } = await svc
        .from("creative_media")
        .update({
          storage_url: publicUrl,
          media_url: imageUrl,
        })
        .eq("id", row.id);

      if (updateErr) {
        console.error(`[process-media] IMAGE DB 업데이트 실패 [${row.id}]:`, updateErr);
        result.byType.IMAGE.errors++;
        result.errors++;
        continue;
      }

      result.byType.IMAGE.uploaded++;
      result.uploaded++;
    } catch (err) {
      console.error(`[process-media] IMAGE 처리 실패 [${row.id}]:`, err);
      result.byType.IMAGE.errors++;
      result.errors++;
    }

    // Rate limit 방지 딜레이
    await new Promise((r) => setTimeout(r, 50));
  }
}

// ── VIDEO 처리 ────────────────────────────────────────────────
const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB

/**
 * video_id 추출 — 4단계 폴백
 * 1순위: raw_creative.video_id (직접 필드)
 * 2순위: raw_creative.object_story_spec.video_data.video_id (SHARE 타입)
 * 3순위: raw_creative.asset_feed_spec.videos[0].video_id (Advantage+)
 * 4순위: content_hash (collect-daily가 videoId를 content_hash에 저장)
 */
function extractVideoId(row: PendingMediaRow): string | null {
  const rc = row.raw_creative;
  if (!rc) return row.content_hash || null;

  // 1순위: 직접 필드
  if (rc.video_id && typeof rc.video_id === "string") return rc.video_id;

  // 2순위: object_story_spec.video_data.video_id
  const oss = rc.object_story_spec as { video_data?: { video_id?: string } } | undefined;
  if (oss?.video_data?.video_id) return oss.video_data.video_id;

  // 3순위: asset_feed_spec.videos[0].video_id
  const afs = rc.asset_feed_spec as { videos?: { video_id?: string }[] } | undefined;
  if (afs?.videos && afs.videos.length > 0 && afs.videos[0].video_id) {
    return afs.videos[0].video_id;
  }

  // 4순위: content_hash (collect-daily가 content_hash = videoId로 저장)
  return row.content_hash || null;
}

async function processVideoRows(
  cleanAccountId: string,
  rows: PendingMediaRow[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  svc: any,
  result: ProcessResult,
  globalVideoSources?: Map<string, string>,
): Promise<void> {
  // video_id 수집 (4단계 폴백 적용)
  const videoIds: string[] = [];
  const rowByVideoId = new Map<string, PendingMediaRow[]>();
  let noVideoIdCount = 0;

  for (const row of rows) {
    const videoId = extractVideoId(row);
    if (!videoId) {
      noVideoIdCount++;
      continue;
    }
    videoIds.push(videoId);
    if (!rowByVideoId.has(videoId)) rowByVideoId.set(videoId, []);
    rowByVideoId.get(videoId)!.push(row);
  }

  if (noVideoIdCount > 0) {
    console.warn(
      `[process-media] VIDEO video_id 추출 불가 ${noVideoIdCount}건 스킵 [${cleanAccountId}] (raw_creative에 video_id/oss.video_data/afs.videos/content_hash 모두 없음)`
    );
    result.byType.VIDEO.processed += noVideoIdCount;
    result.processed += noVideoIdCount;
  }

  if (videoIds.length === 0) {
    return;
  }

  // 소스 URL 조회 (주 계정 페이지네이션)
  let sourceUrlMap = new Map<string, string>();
  try {
    sourceUrlMap = await fetchVideoSourceUrls(cleanAccountId, videoIds);
  } catch (err) {
    console.warn(`[process-media] VIDEO fetchVideoSourceUrls 실패 [${cleanAccountId}]:`, err);
  }

  // 글로벌 소스맵 병합 (교차 계정 사전 조회 결과)
  if (globalVideoSources && globalVideoSources.size > 0) {
    let merged = 0;
    for (const vid of videoIds) {
      if (!sourceUrlMap.has(vid) && globalVideoSources.has(vid)) {
        sourceUrlMap.set(vid, globalVideoSources.get(vid)!);
        merged++;
      }
    }
    if (merged > 0) {
      console.log(
        `[process-media] VIDEO 교차 계정 소스맵 병합: ${merged}건 추가 [${cleanAccountId}]`
      );
    }
  }

  // 썸네일 조회
  let thumbnailMap = new Map<string, string>();
  try {
    thumbnailMap = await fetchVideoThumbnails(videoIds);
  } catch (err) {
    console.warn(`[process-media] VIDEO fetchVideoThumbnails 실패 [${cleanAccountId}]:`, err);
  }

  // 스킵 사유별 카운터
  const skipReasons = { noSourceUrl: 0, oversized: 0, downloadFail: 0 };

  for (const [videoId, videoRows] of rowByVideoId) {
    for (const row of videoRows) {
      // ═══ content_hash 기반 중복 제거 ═══
      // 같은 콘텐츠(video_id)가 이미 다운로드됐으면 storage_url 복사
      if (row.content_hash) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: donor } = await (svc as any)
          .from("creative_media")
          .select("storage_url, thumbnail_url")
          .eq("content_hash", row.content_hash)
          .not("storage_url", "is", null)
          .neq("id", row.id)
          .limit(1)
          .maybeSingle();

        if (donor?.storage_url) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (svc as any)
            .from("creative_media")
            .update({
              storage_url: donor.storage_url,
              thumbnail_url: donor.thumbnail_url || null,
            })
            .eq("id", row.id);

          console.log(
            `[process-media] VIDEO content_hash 재사용: ${row.content_hash} → ${donor.storage_url.slice(-40)}`
          );
          result.dedup++;
          result.processed++;
          result.byType.VIDEO.processed++;
          continue; // 다운로드 스킵
        }
      }

      result.byType.VIDEO.processed++;
      result.processed++;

      try {
        const adId = row.creatives.ad_id;
        const thumbnailUrl = thumbnailMap.get(videoId) || null;
        const sourceUrl = sourceUrlMap.get(videoId) || null;

        if (!sourceUrl) {
          // 최종 폴백: content_hash 기반 storage_url 재사용 (이전 배치에서 다운로드된 경우)
          if (row.content_hash) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const { data: lateDonor } = await (svc as any)
              .from("creative_media")
              .select("storage_url, thumbnail_url")
              .eq("content_hash", row.content_hash)
              .not("storage_url", "is", null)
              .neq("id", row.id)
              .limit(1)
              .maybeSingle();

            if (lateDonor?.storage_url) {
              await svc
                .from("creative_media")
                .update({
                  storage_url: lateDonor.storage_url,
                  thumbnail_url: lateDonor.thumbnail_url || thumbnailUrl || null,
                })
                .eq("id", row.id);
              console.log(
                `[process-media] VIDEO content_hash 최종폴백: ${row.content_hash} → ${lateDonor.storage_url.slice(-40)}`
              );
              result.dedup++;
              continue;
            }
          }

          skipReasons.noSourceUrl++;
          // 썸네일만 있으면 thumbnail_url 업데이트
          if (thumbnailUrl) {
            await svc
              .from("creative_media")
              .update({ thumbnail_url: thumbnailUrl })
              .eq("id", row.id);
          }
          continue;
        }

        // Content-Length 사전 체크 (100MB 제한)
        const headRes = await fetch(sourceUrl, {
          method: "HEAD",
          signal: AbortSignal.timeout(10_000),
        }).catch(() => null);

        if (headRes) {
          const contentLength = parseInt(headRes.headers.get("content-length") ?? "0", 10);
          if (contentLength > MAX_VIDEO_SIZE) {
            console.warn(
              `[process-media] VIDEO 크기 초과 (${(contentLength / 1024 / 1024).toFixed(1)}MB > 100MB): ${row.id} (videoId=${videoId})`
            );
            skipReasons.oversized++;
            // 썸네일만 업데이트
            if (thumbnailUrl) {
              await svc
                .from("creative_media")
                .update({ thumbnail_url: thumbnailUrl })
                .eq("id", row.id);
            }
            continue;
          }
        }

        // mp4 다운로드
        const mp4Res = await fetch(sourceUrl, { signal: AbortSignal.timeout(120_000) });
        if (!mp4Res.ok) {
          console.warn(`[process-media] VIDEO 다운로드 실패 (${mp4Res.status}): ${row.id} (videoId=${videoId})`);
          skipReasons.downloadFail++;
          result.byType.VIDEO.errors++;
          result.errors++;
          continue;
        }

        // 다운로드 중 크기 초과 방어
        const mp4Buffer = Buffer.from(await mp4Res.arrayBuffer());
        if (mp4Buffer.length > MAX_VIDEO_SIZE) {
          console.warn(
            `[process-media] VIDEO 버퍼 크기 초과 (${(mp4Buffer.length / 1024 / 1024).toFixed(1)}MB): ${row.id} (videoId=${videoId})`
          );
          skipReasons.oversized++;
          if (thumbnailUrl) {
            await svc
              .from("creative_media")
              .update({ thumbnail_url: thumbnailUrl })
              .eq("id", row.id);
          }
          continue;
        }

        // GCS 업로드
        const gcsPath = `${cleanAccountId}/media/${adId}.mp4`;
        const { publicUrl, error: uploadErr } = await uploadToGcs(
          "creatives",
          gcsPath,
          mp4Buffer,
          "video/mp4",
        );

        if (uploadErr || !publicUrl) {
          console.error(`[process-media] GCS VIDEO 업로드 실패 [${row.id}]:`, uploadErr);
          result.byType.VIDEO.errors++;
          result.errors++;
          continue;
        }

        // creative_media 업데이트
        const updatePayload: Record<string, string | null> = {
          storage_url: publicUrl,
        };
        if (thumbnailUrl) {
          updatePayload.thumbnail_url = thumbnailUrl;
        }

        const { error: updateErr } = await svc
          .from("creative_media")
          .update(updatePayload)
          .eq("id", row.id);

        if (updateErr) {
          console.error(`[process-media] VIDEO DB 업데이트 실패 [${row.id}]:`, updateErr);
          result.byType.VIDEO.errors++;
          result.errors++;
          continue;
        }

        result.byType.VIDEO.uploaded++;
        result.uploaded++;
      } catch (err) {
        console.error(`[process-media] VIDEO 처리 실패 [${row.id}]:`, err);
        result.byType.VIDEO.errors++;
        result.errors++;
      }
    }

    // 영상 간 딜레이
    await new Promise((r) => setTimeout(r, 200));
  }

  // ═══ VIDEO 스킵 사유 요약 로그 ═══
  const totalSkipped = noVideoIdCount + skipReasons.noSourceUrl + skipReasons.oversized + skipReasons.downloadFail;
  if (totalSkipped > 0) {
    console.log(
      `[process-media] VIDEO 스킵 요약 [${cleanAccountId}]: ` +
      `총 ${totalSkipped}건 — ` +
      `video_id없음=${noVideoIdCount}, ` +
      `소스URL없음=${skipReasons.noSourceUrl}, ` +
      `100MB초과=${skipReasons.oversized}, ` +
      `다운로드실패=${skipReasons.downloadFail}`
    );
  }
}
