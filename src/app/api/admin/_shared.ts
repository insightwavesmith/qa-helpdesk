import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ServiceClient = SupabaseClient<Database>;

type AdminAuthSuccess = {
  user: { id: string; email?: string };
  svc: ServiceClient;
};
type AdminAuthFailure = { response: NextResponse };

/**
 * Admin 권한 확인 헬퍼 — admin API 라우트에서 공통 사용
 * @param allowedRoles 허용할 역할 목록 (기본: ["admin"])
 */
export async function requireAdmin(
  allowedRoles: string[] = ["admin"],
): Promise<AdminAuthSuccess | AdminAuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 },
      ),
    };
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !allowedRoles.includes(profile.role)) {
    return {
      response: NextResponse.json(
        { error: "관리자 권한이 필요합니다." },
        { status: 403 },
      ),
    };
  }

  return { user, svc };
}
