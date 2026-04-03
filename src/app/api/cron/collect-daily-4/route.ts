import { NextRequest, NextResponse } from "next/server";
import { runCollectDaily } from "@/app/api/cron/collect-daily/route";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

// ── GET /api/cron/collect-daily-4 ────────────────────────────
// 계정 31번 이후 전부 처리 (전체 계정 중 offset=30~끝)
// 마지막 배치이므로 임베딩/사전계산/pipeline 후처리도 함께 실행
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun("collect-daily-4");

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") ?? undefined;

  try {
    const result = await runCollectDaily(dateParam, 4);
    await completeCronRun(runId, "success", result.accounts);
    return NextResponse.json(result);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    await completeCronRun(runId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
