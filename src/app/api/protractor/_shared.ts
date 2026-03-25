import { NextResponse } from "next/server";
import { createServiceClient, type DbClient } from "@/lib/db";
import type { UserRole } from "@/types";
import { getCurrentUser } from "@/lib/firebase/auth";

const ALLOWED_ROLES: UserRole[] = ["student", "member", "admin"];

type AuthSuccess = {
  user: { uid: string; email?: string };
  profile: { role: UserRole };
  svc: DbClient;
};
type AuthFailure = { response: NextResponse };

export async function requireProtractorAccess(): Promise<AuthSuccess | AuthFailure> {
  const user = await getCurrentUser();

  if (!user) {
    return {
      response: NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      ),
    };
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (!profile || !ALLOWED_ROLES.includes(profile.role)) {
    return {
      response: NextResponse.json(
        { error: "접근 권한이 없습니다." },
        { status: 403 }
      ),
    };
  }

  return { user, profile, svc };
}

// 계정 소유권 확인 (admin은 전체 접근 가능)
export async function verifyAccountOwnership(
  svc: DbClient,
  userId: string,
  role: UserRole,
  accountId: string
): Promise<boolean> {
  if (role === "admin") return true;

  const { data } = await svc
    .from("ad_accounts")
    .select("id")
    .eq("account_id", accountId)
    .eq("user_id", userId)
    .single();

  return !!data;
}
