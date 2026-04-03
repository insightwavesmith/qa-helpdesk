import { NextRequest, NextResponse } from "next/server";
import { runCollectDaily } from "@/app/api/cron/collect-daily/route";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";

// ── GET /api/cron/collect-daily-1 ────────────────────────────
// 계정 1~10번 처리 (전체 계정 중 offset=0, size=10)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const runId = await startCronRun("collect-daily-1");

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") ?? undefined;
  const accountId = searchParams.get("account_id") ?? undefined;

  try {
    const result = await runCollectDaily(dateParam, accountId ? undefined : 1, accountId);
    await completeCronRun(runId, "success", result.accounts);
    return NextResponse.json(result);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    await completeCronRun(runId, "error", 0, errorMessage);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
