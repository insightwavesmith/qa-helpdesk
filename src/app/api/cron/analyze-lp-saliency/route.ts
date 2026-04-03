/**
 * GET /api/cron/analyze-lp-saliency
 * LP 스크린샷 시선 분석 크론 — Cloud Run DeepGaze 서비스 호출
 * lp_analysis.eye_tracking이 NULL인 항목을 분석
 */

import { NextRequest, NextResponse } from "next/server";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const start = Date.now();

  // Cron 인증 확인
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun("analyze-lp-saliency");

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

    console.log("[analyze-lp-saliency] Cloud Run /lp-saliency 호출 시작");

    const res = await fetch(`${pipelineUrl}/lp-saliency`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-SECRET": pipelineSecret || "",
      },
      body: JSON.stringify({ limit: 50 }),
      signal: AbortSignal.timeout(280_000),
    });

    const result = await res.json();
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);

    console.log(
      `[analyze-lp-saliency] 완료: ${JSON.stringify(result).slice(0, 300)}, ${elapsed}s`,
    );

    const analyzed = (result as Record<string, unknown>)?.analyzed as number ?? 0;
    await completeCronRun(runId, "success", analyzed);

    return NextResponse.json({
      message: "analyze-lp-saliency 완료",
      elapsed: `${elapsed}s`,
      ...result,
    });
  } catch (e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`[analyze-lp-saliency] 에러 (${elapsed}s):`, e);
    await completeCronRun(runId, "error", 0, e instanceof Error ? e.message : String(e));
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        elapsed: `${elapsed}s`,
      },
      { status: 500 },
    );
  }
}
