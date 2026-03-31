/**
 * POST /api/cron/prescription-reanalysis
 * CRON_SECRET 인증 기반 처방 재분석 (미들웨어 우회)
 * body: { ids: string[] }
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { generatePrescription } from "@/lib/protractor/prescription-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const ids: string[] = body.ids ?? [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "ids 필수" }, { status: 400 });
  }

  const svc = createServiceClient();
  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const id of ids) {
    try {
      // creative_media에서 account_id 조회
      const { data: media } = await svc
        .from("creative_media")
        .select("id, creative_id")
        .eq("id", id)
        .single();

      if (!media) {
        results.push({ id, status: "error", error: "media not found" });
        continue;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const creativeId = (media as any).creative_id;
      const { data: creative } = await svc
        .from("creatives")
        .select("account_id")
        .eq("id", creativeId)
        .single();

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const accountId = (creative as any)?.account_id ?? "";

      await generatePrescription(svc, id, accountId, true);
      results.push({ id, status: "ok" });
    } catch (err) {
      results.push({ id, status: "error", error: String(err) });
    }
  }

  return NextResponse.json({ results });
}
