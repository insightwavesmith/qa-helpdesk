import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// GET /api/protractor/lp-metrics?account_id=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
// student 이상만 접근 가능
// daily_lp_metrics 테이블에서 해당 계정의 LP 데이터 조회
export async function GET(request: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    // 역할 확인: student/alumni/admin만 접근 가능
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const allowedRoles = ["student", "alumni", "admin"];
    if (!profile || !allowedRoles.includes(profile.role)) {
      return NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 }
      );
    }

    // 쿼리 파라미터 파싱
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("account_id");
    const start = searchParams.get("start");
    const end = searchParams.get("end");

    if (!accountId) {
      return NextResponse.json(
        { error: "account_id는 필수입니다." },
        { status: 400 }
      );
    }

    // daily_lp_metrics에서 데이터 조회
    // daily_lp_metrics 테이블은 database.ts 타입에 미정의 → any 캐스트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (svc as any)
      .from("daily_lp_metrics")
      .select("*")
      .eq("account_id", accountId)
      .order("date", { ascending: true });

    if (start) {
      query = query.gte("date", start);
    }
    if (end) {
      query = query.lte("date", end);
    }

    const { data, error } = await query;

    if (error) {
      console.error("daily_lp_metrics 조회 오류:", error);
      return NextResponse.json(
        { error: "LP 메트릭 데이터 조회에 실패했습니다." },
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
