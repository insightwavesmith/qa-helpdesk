/**
 * GET /api/cron/video-saliency
 * 영상 소재 1초별 DeepGaze 시선 흐름 분석 크론
 *
 * 처리 흐름:
 *   1. creative_media에서 VIDEO + storage_url(.mp4) + 미분석 조회
 *   2. 계정별 그룹핑
 *   3. Cloud Run /video-saliency 호출 (계정별)
 *      → ffmpeg 1fps 프레임 추출 → DeepGaze 프레임별 분석 → creative_saliency 저장
 *   4. creative_saliency → creative_media.video_analysis 시계열 동기화
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ━━━ 타입 ━━━
interface VideoMediaRow {
  id: string;
  creative_id: string;
  media_type: string;
  storage_url: string | null;
  video_analysis: Record<string, unknown> | null;
  creatives: {
    ad_id: string;
    account_id: string;
  } | null;
}

interface AccountGroup {
  accountId: string;
  adIds: string[];
  mediaIds: string[];
}

export async function GET(req: NextRequest) {
  const start = Date.now();

  // Cron 인증 확인
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const pipelineUrl = process.env.CREATIVE_PIPELINE_URL
      || "https://creative-pipeline-906295665279.asia-northeast3.run.app";
    const pipelineSecret = process.env.CREATIVE_PIPELINE_SECRET;

    if (!pipelineUrl) {
      return NextResponse.json(
        { error: "CREATIVE_PIPELINE_URL 미설정" },
        { status: 500 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svc = createServiceClient() as any;

    // ━━━ 1. 미분석 VIDEO 조회 (2단계 쿼리 — Cloud SQL 호환) ━━━
    // video_analysis IS NULL = 아직 시선 분석 안 된 영상
    // storage_url LIKE '%.mp4' = mp4 다운로드 가능한 것만
    const { data: rawMedia, error: queryErr } = await svc
      .from("creative_media")
      .select(
        "id, creative_id, media_type, storage_url, video_analysis",
      )
      .eq("media_type", "VIDEO")
      .is("video_analysis", null)
      .not("storage_url", "is", null)
      .like("storage_url", "%.mp4")
      .order("creative_id", { ascending: true })
      .limit(200);

    if (queryErr) {
      console.error("[video-saliency] creative_media 조회 실패:", queryErr.message);
      return NextResponse.json(
        { error: `DB 조회 실패: ${queryErr.message}` },
        { status: 500 },
      );
    }

    if (!rawMedia || rawMedia.length === 0) {
      return NextResponse.json({
        message: "video-saliency 완료 — 처리 대상 없음",
        elapsed: "0.0s",
        totalVideos: 0,
        accounts: 0,
        results: [],
        synced: 0,
      });
    }

    // 2단계: creative_id → creatives 테이블에서 ad_id, account_id 조회
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const creativeIds = [...new Set(rawMedia.map((r: any) => r.creative_id as string))];
    const { data: creativesData } = await svc
      .from("creatives")
      .select("id, ad_id, account_id")
      .in("id", creativeIds);

    const creativeMap = new Map<string, { ad_id: string; account_id: string }>(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (creativesData ?? []).map((c: any) => [c.id, { ad_id: c.ad_id, account_id: c.account_id }])
    );

    // JS에서 합치기 (creatives!inner 대체)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: VideoMediaRow[] = rawMedia
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => {
        const creative = creativeMap.get(r.creative_id);
        if (!creative) return null;
        return { ...r, creatives: creative } as VideoMediaRow;
      })
      .filter(Boolean) as VideoMediaRow[];
    const totalVideos = rows.length;
    console.log(`[video-saliency] 미분석 VIDEO: ${totalVideos}건`);

    if (totalVideos === 0) {
      return NextResponse.json({
        message: "video-saliency 완료 — 처리 대상 없음",
        elapsed: "0.0s",
        totalVideos: 0,
        accounts: 0,
        results: [],
        synced: 0,
      });
    }

    // ━━━ 1-B. creative_saliency 사전 체크 — 이미 분석된 건 분리 ━━━
    const allAdIds = rows
      .map((r) => r.creatives?.ad_id)
      .filter(Boolean) as string[];

    let alreadyAnalyzedAdIds = new Set<string>();
    if (allAdIds.length > 0) {
      const { data: existingSaliency } = await svc
        .from("creative_saliency")
        .select("ad_id")
        .in("ad_id", allAdIds)
        .eq("target_type", "video");

      if (existingSaliency && existingSaliency.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        alreadyAnalyzedAdIds = new Set(existingSaliency.map((s: any) => s.ad_id as string));
        console.log(
          `[video-saliency] creative_saliency 이미 존재: ${alreadyAnalyzedAdIds.size}건 → 동기화만 실행`
        );
      }
    }

    // 분리: 동기화만 필요 vs Cloud Run 호출 필요
    const syncOnlyRows = rows.filter(
      (r) => r.creatives?.ad_id && alreadyAnalyzedAdIds.has(r.creatives.ad_id)
    );
    const needsCloudRun = rows.filter(
      (r) => !r.creatives?.ad_id || !alreadyAnalyzedAdIds.has(r.creatives.ad_id)
    );

    console.log(
      `[video-saliency] 분류: 동기화만=${syncOnlyRows.length}건, Cloud Run=${needsCloudRun.length}건`
    );

    // ━━━ 1-C. 이미 분석된 건 즉시 동기화 ━━━
    let preSynced = 0;
    if (syncOnlyRows.length > 0) {
      const syncAdIds = syncOnlyRows
        .map((r) => r.creatives?.ad_id)
        .filter(Boolean) as string[];

      const { data: saliencyRows } = await svc
        .from("creative_saliency")
        .select("ad_id, cta_attention_score, cognitive_load, top_fixations, attention_map_url")
        .in("ad_id", syncAdIds)
        .eq("target_type", "video");

      if (saliencyRows && saliencyRows.length > 0) {
        const summaryMap = new Map<string, Record<string, unknown>>();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const s of saliencyRows as any[]) {
          summaryMap.set(s.ad_id as string, {
            cta_attention_score: s.cta_attention_score,
            cognitive_load: s.cognitive_load,
            attention_map_url: s.attention_map_url,
            synced_at: new Date().toISOString(),
            model_version: "deepgaze-iie",
          });
        }

        for (const row of syncOnlyRows) {
          const adId = row.creatives?.ad_id;
          if (!adId) continue;
          const summary = summaryMap.get(adId);
          if (!summary) continue;

          const { error: updateErr } = await svc
            .from("creative_media")
            .update({ video_analysis: summary })
            .eq("id", row.id);

          if (!updateErr) {
            preSynced++;
          } else {
            console.error(
              `[video-saliency] 사전동기화 실패 id=${row.id}: ${updateErr.message}`
            );
          }
        }
        console.log(`[video-saliency] 사전동기화 완료: ${preSynced}건`);
      }
    }

    // ━━━ 2. 계정별 그룹핑 (Cloud Run 필요한 건만) ━━━
    const accountMap = new Map<string, AccountGroup>();

    for (const row of needsCloudRun) {
      const creative = row.creatives;
      if (!creative) continue;

      const { account_id, ad_id } = creative;
      if (!accountMap.has(account_id)) {
        accountMap.set(account_id, {
          accountId: account_id,
          adIds: [],
          mediaIds: [],
        });
      }
      const group = accountMap.get(account_id)!;
      group.adIds.push(ad_id);
      group.mediaIds.push(row.id);
    }

    const accountList = Array.from(accountMap.values());
    console.log(
      `[video-saliency] 계정 ${accountList.length}개, 총 VIDEO ${totalVideos}건`,
    );

    // ━━━ 3. 계정별 Cloud Run /video-saliency 호출 ━━━
    const results: Record<string, unknown>[] = [];

    for (const { accountId, adIds } of accountList) {
      try {
        console.log(
          `[video-saliency] account=${accountId} VIDEO ${adIds.length}건 → Cloud Run 호출`,
        );

        const res = await fetch(`${pipelineUrl}/video-saliency`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-API-SECRET": pipelineSecret || "",
          },
          body: JSON.stringify({
            limit: adIds.length,
            accountId,
            maxFrames: 30,
          }),
          signal: AbortSignal.timeout(240_000),
        });

        const result = await res.json();
        results.push({ accountId, ...result });
        console.log(
          `[video-saliency] account=${accountId} 완료: analyzed=${result.analyzed ?? 0}, errors=${result.errors ?? 0}`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[video-saliency] account=${accountId} 오류: ${msg}`);
        results.push({ accountId, error: msg });
      }

      // 계정 간 2초 딜레이 (Cloud Run 부하 분산)
      await new Promise((r) => setTimeout(r, 2000));
    }

    // ━━━ 4. Cloud Run 응답의 videoResults → creative_media.video_analysis 직접 저장 ━━━
    // Python이 반환한 분석 결과를 Cloud SQL에 직접 반영 (Supabase→Cloud SQL 경로 불일치 해소)
    let synced = 0;
    try {
      // ad_id → creative_media row 매핑 (역방향 lookup)
      const adIdToMediaRow = new Map<string, VideoMediaRow>();
      for (const row of rows) {
        const adId = row.creatives?.ad_id;
        if (adId) adIdToMediaRow.set(adId, row);
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const res of results as any[]) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const videoResults = res.videoResults as { ad_id: string; summary: Record<string, unknown> }[] | undefined;
        if (!videoResults || !Array.isArray(videoResults)) continue;

        for (const vr of videoResults) {
          const mediaRow = adIdToMediaRow.get(vr.ad_id);
          if (!mediaRow) continue;
          if (mediaRow.video_analysis) continue; // 이미 있으면 스킵

          const { error: updateErr } = await svc
            .from("creative_media")
            .update({ video_analysis: vr.summary })
            .eq("id", mediaRow.id);

          if (!updateErr) {
            synced++;
          } else {
            console.error(
              `[video-saliency] video_analysis 저장 실패 id=${mediaRow.id}: ${updateErr.message}`,
            );
          }
        }
      }
    } catch (syncErr) {
      console.error("[video-saliency] 동기화 오류 (무시):", syncErr);
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(
      `[video-saliency] 완료: ${totalVideos}건 처리, ${synced}건 동기화, ${elapsed}s`,
    );

    return NextResponse.json({
      message: "video-saliency 완료",
      elapsed: `${elapsed}s`,
      totalVideos,
      preSynced,
      cloudRunProcessed: needsCloudRun.length,
      accounts: accountList.length,
      results,
      synced,
    });
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[video-saliency] 에러 (${elapsed}s):`, e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        elapsed: `${elapsed}s`,
      },
      { status: 500 },
    );
  }
}
