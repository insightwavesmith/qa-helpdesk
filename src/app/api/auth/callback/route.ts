/**
 * Firebase Auth 전환 후 이 Supabase OAuth 콜백은 더 이상 사용하지 않음.
 * 비밀번호 재설정 등 일부 레거시 플로우가 있을 수 있어 파일 유지.
 * Firebase로 완전 전환 후 삭제 예정.
 */
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const next = searchParams.get("next") ?? "/dashboard";
  const redirectPath = next.startsWith("/") ? next : "/dashboard";

  // Firebase Auth 전환 완료 — Supabase code exchange 제거됨
  // 이 경로로 오는 요청은 /login으로 리다이렉트
  return NextResponse.redirect(`${origin}${redirectPath}`);
}
