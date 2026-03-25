import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/db";
import { verifyIdToken } from "@/lib/firebase/auth";
import { handleOptions, withCors } from "../_cors";

export function OPTIONS() {
  return handleOptions();
}

/**
 * 크롬 확장 로그인 엔드포인트
 * 클라이언트(확장)에서 Firebase signInWithEmailAndPassword() 후
 * ID Token을 이 엔드포인트로 전송하여 사용자 정보 + 역할을 조회
 */
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

  if (typeof idToken !== "string" || !idToken) {
    return withCors(
      NextResponse.json(
        { error: "ID 토큰이 필요합니다." },
        { status: 400 }
      )
    );
  }

  const authUser = await verifyIdToken(idToken);
  if (!authUser) {
    return withCors(
      NextResponse.json(
        { error: "유효하지 않은 토큰입니다." },
        { status: 401 }
      )
    );
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", authUser.uid)
    .single();

  return withCors(
    NextResponse.json({
      idToken,
      user: {
        id: authUser.uid,
        email: authUser.email,
        role: profile?.role ?? null,
      },
    })
  );
}
