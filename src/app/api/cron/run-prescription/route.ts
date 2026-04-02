/**
 * GET /api/cron/run-prescription?ids=id1,id2&account_id=xxx
 * GET /api/cron/run-prescription?batch=true
 * CRON 인증으로 처방 배치 실행 (Firebase 세션 불필요)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { generatePrescription } from "@/lib/protractor/prescription-engine";
import { startCronRun, completeCronRun } from "@/lib/cron-logger";
import { triggerNext } from "@/lib/pipeline-chain";

// triggerNext — 향후 체인 확장용 (현재 파이프라인 마지막 단계)
void triggerNext;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function verifyCron(req: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = req.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

async function handleBatchPrescription(svc: ReturnType<typeof createServiceClient>): Promise<{ targets: string[]; ok: number; fail: number }> {
  // 처방 미생성 소재 자동 조회
  // creative_media에서 embedding IS NOT NULL이고 prescription_generated_at이 없는 건
  const { data: pending } = await svc
    .from("creative_media")
    .select("id, creative_id")
    .not("embedding", "is", null)
    .is("prescription_generated_at", null)
    .order("created_at", { ascending: false })
    .limit(50);

  if (!pending || pending.length === 0) {
    return { targets: [], ok: 0, fail: 0 };
  }

  // creative_id → account_id 조회
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const creativeIds = [...new Set(pending.map((p: any) => p.creative_id as string))];
  const { data: creatives } = await svc
    .from("creatives")
    .select("id, account_id")
    .in("id", creativeIds);

  const creativeToAccount = new Map<string, string>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (creatives ?? []).map((c: any) => [c.id, c.account_id])
  );

  // 계정별 그룹핑 후 실행
  let ok = 0;
  let fail = 0;
  const targets: string[] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of pending as any[]) {
    const accountId = creativeToAccount.get(row.creative_id);
    if (!accountId) { fail++; continue; }
    targets.push(row.id);
    try {
      await generatePrescription(svc, row.id, accountId, true);
      ok++;
    } catch (e) {
      console.error(`[run-prescription] 배치 실패: ${row.id} — ${e instanceof Error ? e.message : String(e)}`);
      fail++;
    }
  }

  return { targets, ok, fail };
}

export async function GET(req: NextRequest) {
  if (!verifyCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const ids = searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
  const accountId = searchParams.get("account_id") ?? "";
  const isBatch = searchParams.get("batch") === "true" || (ids.length === 0 && !accountId);

  const svc = createServiceClient();
  const runId = await startCronRun("run-prescription");

  try {
    if (isBatch) {
      // 배치 모드: 처방 미생성 소재 자동 조회 → 실행
      const { targets, ok, fail } = await handleBatchPrescription(svc);
      await completeCronRun(runId, ok > 0 ? "success" : (targets.length === 0 ? "success" : "error"), ok, fail > 0 ? `${fail}건 실패` : undefined, {
        batch: true,
        success: ok,
        failed: fail,
        targets: targets.length,
      });
      return NextResponse.json({
        message: `처방 배치 완료: ${ok}/${targets.length} 성공`,
        batch: true,
        targets: targets.length,
        ok,
        fail,
      });
    }

    // 기존 ids 모드
    if (ids.length === 0 || !accountId) {
      await completeCronRun(runId, "error", 0, "ids, account_id 파라미터 필수");
      return NextResponse.json({ error: "ids, account_id 파라미터 필수" }, { status: 400 });
    }

    const results: Array<{ id: string; status: string; error?: string }> = [];
    for (const mediaId of ids) {
      try {
        console.log(`[run-prescription] 처방 시작: ${mediaId}`);
        const result = await generatePrescription(svc, mediaId, accountId, true);
        const hasScores = !!result.scores;
        const hasRx = (result.top3_prescriptions?.length ?? 0) > 0;
        console.log(`[run-prescription] 완료: ${mediaId} scores=${hasScores} rx=${hasRx}`);
        results.push({ id: mediaId, status: "ok" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`[run-prescription] 실패: ${mediaId} — ${msg}`);
        results.push({ id: mediaId, status: "error", error: msg });
      }
    }

    const okCount = results.filter(r => r.status === "ok").length;
    await completeCronRun(runId, okCount > 0 ? "success" : "error", okCount, undefined, {
      batch: false,
      ids: ids.length,
      success: okCount,
      failed: ids.length - okCount,
    });

    return NextResponse.json({
      message: `처방 완료: ${okCount}/${ids.length}`,
      results,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await completeCronRun(runId, "error", 0, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
