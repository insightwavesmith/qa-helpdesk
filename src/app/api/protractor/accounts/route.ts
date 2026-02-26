import { NextRequest, NextResponse } from "next/server";
import { requireProtractorAccess } from "../_shared";

// GET /api/protractor/accounts
// student/member/admin만 접근 가능
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

// DELETE /api/protractor/accounts
// admin만 계정 삭제 가능 (soft delete: active=false + service_secrets 삭제)
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireProtractorAccess();
    if ("response" in auth) return auth.response;
    const { profile, svc } = auth;

    if (profile.role !== "admin") {
      return NextResponse.json({ error: "관리자만 삭제할 수 있습니다." }, { status: 403 });
    }

    const { account_id } = await request.json();
    if (!account_id) {
      return NextResponse.json({ error: "account_id가 필요합니다." }, { status: 400 });
    }

    // service_secrets 삭제
    await svc
      .from("service_secrets" as never)
      .delete()
      .eq("key_name" as never, `secret_${account_id}`);

    // ad_accounts soft delete (서버 액션과 동일 방식)
    const { error } = await svc
      .from("ad_accounts")
      .update({ active: false })
      .eq("account_id", account_id);

    if (error) {
      console.error("ad_accounts 비활성화 오류:", error);
      return NextResponse.json({ error: "삭제 실패" }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}
