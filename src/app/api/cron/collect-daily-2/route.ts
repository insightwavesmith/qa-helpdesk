import { NextRequest, NextResponse } from "next/server";
import { runCollectDaily } from "@/app/api/cron/collect-daily/route";

// Vercel 최대 실행 시간 5분
export const maxDuration = 300;

// ── GET /api/cron/collect-daily-2 ────────────────────────────
// 계정 11~20번 처리 (전체 계정 중 offset=10, size=10)
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateParam = searchParams.get("date") ?? undefined;

  try {
    const result = await runCollectDaily(dateParam, 2);
    return NextResponse.json(result);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
