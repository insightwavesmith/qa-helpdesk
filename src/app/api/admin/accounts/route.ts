import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// GET /api/admin/accounts
// admin만 접근 가능 - 전체 ad_accounts + 배정된 수강생 정보 join
export async function GET() {
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

    // 전체 계정 조회
    const { data: accounts, error: accountsError } = await svc
      .from("ad_accounts")
      .select("id, account_id, account_name, user_id, active, created_at")
      .order("created_at", { ascending: false });

    if (accountsError) throw accountsError;

    // 배정된 user_id 목록에서 프로필 조회
    const userIds = (accounts || [])
      .map((a) => a.user_id)
      .filter((id): id is string => !!id);

    let profilesMap: Record<string, { name: string; email: string }> = {};
    if (userIds.length > 0) {
      const { data: profiles } = await svc
        .from("profiles")
        .select("id, name, email")
        .in("id", userIds);

      profilesMap = (profiles || []).reduce(
        (acc, p) => {
          acc[p.id] = { name: p.name, email: p.email };
          return acc;
        },
        {} as Record<string, { name: string; email: string }>
      );
    }

    // 수강생/멤버 목록 (배정 드롭다운용)
    const { data: students } = await svc
      .from("profiles")
      .select("id, name, email, role")
      .in("role", ["student", "member"])
      .order("name");

    const result = (accounts || []).map((acc) => ({
      ...acc,
      assigned_user: acc.user_id ? profilesMap[acc.user_id] || null : null,
    }));

    return NextResponse.json({ accounts: result, students: students || [] });
  } catch (error) {
    console.error("Admin accounts error:", error);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
