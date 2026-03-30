/**
 * GET /api/cron/run-prescription?ids=id1,id2&account_id=xxx
 * CRON 인증으로 처방 배치 실행 (Firebase 세션 불필요)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { generatePrescription } from "@/lib/protractor/prescription-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const accountId = searchParams.get("account_id") ?? "";

  if (ids.length === 0 || !accountId) {
    return NextResponse.json(
      { error: "ids, account_id 파라미터 필수" },
      { status: 400 },
    );
  }

  const svc = createServiceClient();
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const mediaId of ids) {
    try {
      console.log(`[run-prescription] 처방 시작: ${mediaId}`);
      const result = await generatePrescription(svc, mediaId, accountId, true);
      const hasScores = !!result.scores;
      const hasRx = (result.top3_prescriptions?.length ?? 0) > 0;
      console.log(
        `[run-prescription] 완료: ${mediaId} scores=${hasScores} rx=${hasRx}`,
      );
      results.push({ id: mediaId, status: "ok" });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[run-prescription] 실패: ${mediaId} — ${msg}`);
      results.push({ id: mediaId, status: "error", error: msg });
    }
  }

  return NextResponse.json({
    message: `처방 완료: ${results.filter((r) => r.status === "ok").length}/${ids.length}`,
    results,
  });
}
