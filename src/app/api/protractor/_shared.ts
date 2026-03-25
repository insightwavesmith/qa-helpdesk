import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { UserRole } from "@/types";

type ServiceClient = SupabaseClient<Database>;

const ALLOWED_ROLES: UserRole[] = ["student", "member", "admin"];

type AuthSuccess = {
  user: { id: string };
  profile: { role: UserRole };
  svc: ServiceClient;
};
type AuthFailure = { response: NextResponse };

export async function requireProtractorAccess(): Promise<AuthSuccess | AuthFailure> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    .eq("id", user.id)
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
  svc: ServiceClient,
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
