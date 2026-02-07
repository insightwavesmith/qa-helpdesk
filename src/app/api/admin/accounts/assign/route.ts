import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// PUT /api/admin/accounts/assign
// admin만 접근 가능 - 광고계정에 수강생 배정/해제
export async function PUT(request: NextRequest) {
  try {
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

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin") {
      return NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 }
      );
    }

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
