import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";

// GET /api/protractor/benchmarks
// student 이상만 접근 가능
// benchmarks 테이블에서 최근 벤치마크 데이터 조회
export async function GET() {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { svc } = auth;

    const { data, error } = await svc
      .from("benchmarks")
      .select("*")
      .order("calculated_at", { ascending: false })
      .limit(100);

    if (error) {
      console.error("benchmarks 조회 오류:", error);
      return NextResponse.json(
        { error: "벤치마크 데이터 조회에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ data });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
