import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "../../_shared";

// PUT /api/admin/accounts/assign
// admin만 접근 가능 - 광고계정에 수강생 배정/해제
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("response" in auth) return auth.response;
    const { svc } = auth;

    const body = await request.json();
    const { accountId, userId } = body as {
      accountId: string;
      userId: string | null;
    };

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId가 필요합니다." },
        { status: 400 }
      );
    }

    const { error: updateError } = await svc
      .from("ad_accounts")
      .update({ user_id: userId })
      .eq("id", accountId);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin assign error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
