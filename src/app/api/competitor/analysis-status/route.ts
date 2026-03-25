import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/competitor/analysis-status?brand_page_id=xxx
 * 특정 브랜드의 L1 분석 현황 집계
 * Response: { total, pending, processing, completed, failed }
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(
      { error: "로그인이 필요합니다" },
      { status: 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const brandPageId = searchParams.get("brand_page_id");

  if (!brandPageId) {
    return NextResponse.json(
      { error: "brand_page_id가 필요합니다" },
      { status: 400 },
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const svc = createServiceClient() as any;

  // 전체 건수
  const { count: total } = await svc
    .from("competitor_analysis_queue")
    .select("id", { count: "exact", head: true })
    .eq("brand_page_id", brandPageId);

  // 상태별 건수
  const { data: statusRows } = await svc
    .from("competitor_analysis_queue")
    .select("status")
    .eq("brand_page_id", brandPageId);

  const counts = { pending: 0, processing: 0, completed: 0, failed: 0 };
  for (const row of (statusRows ?? []) as Array<{ status: string }>) {
    if (row.status in counts) {
      counts[row.status as keyof typeof counts]++;
    }
  }

  return NextResponse.json({
    brandPageId,
    total: total ?? 0,
    pending: counts.pending,
    processing: counts.processing,
    completed: counts.completed,
    failed: counts.failed,
  });
}
