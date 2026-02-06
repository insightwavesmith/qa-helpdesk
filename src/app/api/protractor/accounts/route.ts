import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// GET /api/protractor/accounts
// student/alumni/admin만 접근 가능
// ad_accounts 테이블에서 현재 사용자의 계정 조회
// admin은 전체 조회
export async function GET() {
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

    // admin은 전체 조회, 그 외는 자신의 계정만
    // ad_accounts 테이블은 database.ts 타입에 미정의 → any 캐스트
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let query = (svc as any).from("ad_accounts").select("*");
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
