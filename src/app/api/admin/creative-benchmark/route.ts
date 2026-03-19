import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/app/api/admin/_shared";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/creative-benchmark
 *
 * 요소별 성과 벤치마크 조회
 *
 * Query params:
 *   element: 특정 요소 타입 필터 (예: hook_type, style, cta_type 등)
 *            생략 시 전체 반환
 *
 * Response:
 *   {
 *     element_type: string | "all",
 *     total: number,
 *     benchmarks: Record<element_type, BenchmarkRow[]>
 *   }
 */
export async function GET(req: NextRequest) {
  // 관리자 권한 확인
  const auth = await requireAdmin(["admin", "student", "member"]);
  if ("response" in auth) return auth.response;
  const { svc } = auth;

  const elementType = req.nextUrl.searchParams.get("element");

  // creative_element_performance 테이블 조회
  // avg_roas 내림차순 정렬 (성과 좋은 요소가 상단)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (svc as any)
    .from("creative_element_performance")
    .select("*")
    .order("avg_roas", { ascending: false });

  // 특정 요소 타입 필터 적용
  if (elementType) {
    query = query.eq("element_type", elementType);
  }

  const { data: results, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // element_type별 그룹핑
  const grouped: Record<string, typeof results> = {};
  for (const row of results || []) {
    if (!grouped[row.element_type]) grouped[row.element_type] = [];
    grouped[row.element_type].push(row);
  }

  return NextResponse.json({
    element_type: elementType || "all",
    total: results?.length ?? 0,
    benchmarks: grouped,
  });
}
