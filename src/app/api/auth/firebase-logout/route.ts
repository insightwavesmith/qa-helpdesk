/**
 * POST /api/auth/firebase-logout
 * 세션 쿠키 삭제 (로그아웃)
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.delete(SESSION_COOKIE_NAME);
  response.cookies.delete("x-user-role");
  response.cookies.delete("x-onboarding-status");
  return response;
}
