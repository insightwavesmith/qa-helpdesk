import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Supabase recovery 이메일은 token_hash + type 방식으로 전달될 수 있음 (PKCE 설정에 따라)
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/dashboard";

  // 외부 URL 리다이렉트 방지: 내부 경로만 허용
  const redirectPath = next.startsWith("/") ? next : "/dashboard";

  const supabase = await createClient();

  // Case 1: OAuth / Magic Link / PKCE code exchange
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  // Case 2: Recovery 이메일 token_hash 방식 (비밀번호 재설정)
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(`${origin}${redirectPath}`);
    }
  }

  // 실패 시 로그인 페이지로
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
