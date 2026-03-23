/**
 * GET /api/cron/creative-saliency
 * 광고 소재 시선 분석 크론 — Railway DeepGaze 서비스 호출
 * creative_saliency 테이블에 결과 없는 소재(IMAGE + VIDEO)를 분석
 */

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  const start = Date.now();

  try {
    const pipelineUrl = process.env.CREATIVE_PIPELINE_URL;
    const pipelineSecret = process.env.CREATIVE_PIPELINE_SECRET;

    if (!pipelineUrl) {
      return NextResponse.json(
        { error: "CREATIVE_PIPELINE_URL 미설정" },
        { status: 500 },
      );
    }

    console.log("[creative-saliency] Railway /saliency, /video-saliency 호출 시작");

    // 1) IMAGE saliency
    let imageResult: Record<string, unknown> = {};
    try {
      const imageRes = await fetch(`${pipelineUrl}/saliency`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-SECRET": pipelineSecret || "",
        },
        body: JSON.stringify({ limit: 50 }),
        signal: AbortSignal.timeout(240_000),
      });
      imageResult = await imageRes.json();
      console.log(
        `[creative-saliency] IMAGE 완료: ${JSON.stringify(imageResult).slice(0, 200)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[creative-saliency] IMAGE 오류: ${msg}`);
      imageResult = { error: msg };
    }

    // 2) VIDEO saliency
    let videoResult: Record<string, unknown> = {};
    try {
      const videoRes = await fetch(`${pipelineUrl}/video-saliency`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-SECRET": pipelineSecret || "",
        },
        body: JSON.stringify({ limit: 20 }),
        signal: AbortSignal.timeout(240_000),
      });
      videoResult = await videoRes.json();
      console.log(
        `[creative-saliency] VIDEO 완료: ${JSON.stringify(videoResult).slice(0, 200)}`,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[creative-saliency] VIDEO 오류: ${msg}`);
      videoResult = { error: msg };
    }

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    return NextResponse.json({
      message: "creative-saliency 완료",
      elapsed: `${elapsed}s`,
      image: imageResult,
      video: videoResult,
    });
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[creative-saliency] 에러 (${elapsed}s):`, e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        elapsed: `${elapsed}s`,
      },
      { status: 500 },
    );
  }
}
