import { NextRequest, NextResponse } from "next/server";
import { getFirebaseAuth } from "@/lib/firebase/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { handleOptions, withCors } from "../_cors";

export function OPTIONS() {
  return handleOptions();
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(
      NextResponse.json(
        { error: "요청 본문을 파싱할 수 없습니다." },
        { status: 400 }
      )
    );
  }

  const { idToken } = body as { idToken?: unknown };

  if (typeof idToken !== "string" || !idToken.trim()) {
    return withCors(
      NextResponse.json(
        { error: "idToken이 필요합니다." },
        { status: 400 }
      )
    );
  }

  try {
    // Firebase ID 토큰 검증
    const auth = getFirebaseAuth();
    const decoded = await auth.verifyIdToken(idToken);

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", decoded.uid)
      .single();

    return withCors(
      NextResponse.json({
        user: {
          id: decoded.uid,
          email: decoded.email,
          role: profile?.role ?? null,
        },
      })
    );
  } catch (err) {
    console.error("[ext/auth] Firebase 토큰 검증 실패:", err);
    return withCors(
      NextResponse.json(
        { error: "유효하지 않은 토큰입니다." },
        { status: 401 }
      )
    );
  }
}
