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

  // v1 creative_element_performance 테이블은 삭제됨.
  // 분석 데이터는 creative_media.analysis_json에 통합. 레거시 벤치마크 빈 결과 반환.
  void svc; // suppress unused warning

  return NextResponse.json({
    element_type: elementType || "all",
    total: 0,
    benchmarks: {},
  });
}
