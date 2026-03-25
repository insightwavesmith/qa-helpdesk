import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { verifyIdToken } from "@/lib/firebase/auth";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type ServiceClient = SupabaseClient<Database>;

type ExtAuthSuccess = {
  user: { id: string; email?: string };
  svc: ServiceClient;
};
type ExtAuthFailure = { response: NextResponse };

/**
 * 크롬 확장 API 인증 헬퍼
 * Authorization: Bearer <firebase_id_token> 헤더에서 토큰 검증
 * 허용 역할: admin, member, student (기본)
 */
export async function requireExtUser(
  request: Request,
  allowedRoles: string[] = ["admin", "member", "student"]
): Promise<ExtAuthSuccess | ExtAuthFailure> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      response: NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      ),
    };
  }

  const token = authHeader.replace("Bearer ", "");

  const authUser = await verifyIdToken(token);
  if (!authUser) {
    return {
      response: NextResponse.json(
        { error: "유효하지 않은 토큰입니다." },
        { status: 401 }
      ),
    };
  }

  const user = { id: authUser.uid, email: authUser.email };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile?.role || !allowedRoles.includes(profile.role)) {
    return {
      response: NextResponse.json(
        { error: "권한이 없습니다." },
        { status: 403 }
      ),
    };
  }

  return { user, svc };
}
