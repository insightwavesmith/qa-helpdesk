import { NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";

// GET /api/protractor/accounts
// student/alumni/admin만 접근 가능
// ad_accounts 테이블에서 현재 사용자의 계정 조회 (admin은 전체)
export async function GET() {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { user, profile, svc } = auth;

    let query = svc.from("ad_accounts").select("*");
    if (profile.role !== "admin") {
      query = query.eq("user_id", user.id);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("ad_accounts 조회 오류:", error);
      return NextResponse.json(
        { error: "계정 조회에 실패했습니다." },
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
