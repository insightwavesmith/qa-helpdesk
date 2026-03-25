/**
 * POST /api/auth/firebase-session
 * Firebase ID Token → 세션 쿠키 생성
 * 로그인 성공 후 클라이언트에서 호출
 */
import { NextResponse } from "next/server";
import { createSessionCookie, SESSION_COOKIE_NAME } from "@/lib/firebase/auth";

const SESSION_MAX_AGE = 5 * 24 * 60 * 60; // 5일 (초)

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { idToken } = body as { idToken?: string };

    if (!idToken) {
      return NextResponse.json(
        { error: "idToken 필수" },
        { status: 400 }
      );
    }

    const sessionCookie = await createSessionCookie(idToken);

    const response = NextResponse.json({ ok: true });
    response.cookies.set(SESSION_COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
      sameSite: "lax",
    });
    return response;
  } catch (err) {
    console.error("[firebase-session] error:", err);
    return NextResponse.json(
      { error: "세션 생성에 실패했습니다." },
      { status: 500 }
    );
  }
}
