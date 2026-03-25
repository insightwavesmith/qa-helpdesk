import { NextResponse } from "next/server";

/**
 * Auth callback route
 * Firebase Auth는 클라이언트측에서 직접 처리하므로
 * 이 라우트는 레거시 호환용으로 로그인 페이지로 리다이렉트만 수행
 */
export async function GET(request: Request) {
  const { origin } = new URL(request.url);
  return NextResponse.redirect(`${origin}/login`);
}
