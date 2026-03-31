/**
 * GET /api/protractor/axis-distribution?account_id=xxx
 * 계정 소재 5축별 분포 (포맷/훅/메시징/타겟/카테고리)
 */

import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AJ = Record<string, any>;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("account_id");
  if (!accountId) {
    return NextResponse.json({ error: "account_id 필수" }, { status: 400 });
  }

  const svc = createServiceClient();

  // 계정의 소재 조회
  const { data: creatives } = await svc
    .from("creatives")
    .select("id, account_id")
    .eq("account_id", accountId);

  if (!creatives || creatives.length === 0) {
    return NextResponse.json({
      format: [],
      hook: [],
      messaging: [],
      target: [],
      category: [],
    });
  }

  const creativeIds = (creatives as AJ[]).map((c) => c.id as string);

  // creative_media에서 analysis_json 가져오기
  const { data: mediaRows } = await svc
    .from("creative_media")
    .select("creative_id, analysis_json")
    .in("creative_id", creativeIds)
    .not("analysis_json", "is", null);

  if (!mediaRows || mediaRows.length === 0) {
    return NextResponse.json({
      format: [],
      hook: [],
      messaging: [],
      target: [],
      category: [],
    });
  }

  // 5축 집계
  const formatCounts: Record<string, number> = {};
  const hookCounts: Record<string, number> = {};
  const messagingCounts: Record<string, number> = {};
  const targetCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};

  for (const row of mediaRows as AJ[]) {
    const aj = row.analysis_json as AJ;
    if (!aj) continue;

    // 포맷 (visual_style 또는 format)
    const format = aj?.hook?.visual_style ?? aj?.format ?? null;
    if (format) formatCounts[format] = (formatCounts[format] ?? 0) + 1;

    // 훅
    const hook = aj?.hook?.hook_type ?? null;
    if (hook) hookCounts[hook] = (hookCounts[hook] ?? 0) + 1;

    // 메시징
    const messaging = aj?.messaging?.strategy ?? aj?.messaging?.type ?? null;
    if (messaging)
      messagingCounts[messaging] = (messagingCounts[messaging] ?? 0) + 1;

    // 타겟
    const target = aj?.target?.persona ?? aj?.target?.audience ?? null;
    if (target) targetCounts[target] = (targetCounts[target] ?? 0) + 1;

    // 카테고리
    const category = aj?.category ?? aj?.product_category ?? null;
    if (category)
      categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
  }

  // 상위 3개씩 정렬
  const toSorted = (counts: Record<string, number>) =>
    Object.entries(counts)
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);

  return NextResponse.json({
    format: toSorted(formatCounts),
    hook: toSorted(hookCounts),
    messaging: toSorted(messagingCounts),
    target: toSorted(targetCounts),
    category: toSorted(categoryCounts),
  });
}
