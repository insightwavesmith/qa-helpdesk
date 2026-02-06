import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    // 인증 + admin 권한 확인
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

    // 각 그룹별 수신자 수 조회 (병렬)
    const [leadsResult, studentsResult, membersResult] = await Promise.all([
      svc
        .from("leads")
        .select("id", { count: "exact", head: true })
        .eq("email_opted_out", false),
      svc
        .from("student_registry")
        .select("id", { count: "exact", head: true }),
      svc
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .in("role", ["member", "student", "alumni", "admin"]),
    ]);

    return NextResponse.json({
      leads: leadsResult.count || 0,
      students: studentsResult.count || 0,
      members: membersResult.count || 0,
    });
  } catch (error) {
    console.error("Recipients count error:", error);
    return NextResponse.json(
      { error: "수신자 조회 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
