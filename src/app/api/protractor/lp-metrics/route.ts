import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";

// GET /api/protractor/lp-metrics?account_id=xxx&start=YYYY-MM-DD&end=YYYY-MM-DD
// student 이상만 접근 가능 + 자신의 계정만 (admin은 전체)
export async function GET(request: NextRequest) {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { user, profile, svc } = auth;

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

    // 계정 소유권 확인
    const hasAccess = await verifyAccountOwnership(svc, user.id, profile.role, accountId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "해당 계정에 대한 접근 권한이 없습니다." },
        { status: 403 }
      );
    }

    let query = svc
      .from("daily_lp_metrics")
      .select("*")
      .eq("account_id", accountId)
      .order("date", { ascending: true });

    if (start) query = query.gte("date", start);
    if (end) query = query.lte("date", end);

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
