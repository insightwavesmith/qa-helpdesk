import { NextResponse } from "next/server";
import { createServiceClient, type DbClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/firebase/auth";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

type AdminAuthSuccess = {
  user: { uid: string; email?: string };
  svc: DbClient;
};
type AdminAuthFailure = { response: NextResponse };

/**
 * Admin 권한 확인 헬퍼 — admin API 라우트에서 공통 사용
 * @param allowedRoles 허용할 역할 목록 (기본: ["admin"])
 */
export async function requireAdmin(
  allowedRoles: string[] = ["admin"],
): Promise<AdminAuthSuccess | AdminAuthFailure> {
  const user = await getCurrentUser();

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
    .eq("id", toProfileId(user.uid))
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
