import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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

  const { email, password } = body as { email?: unknown; password?: unknown };

  if (typeof email !== "string" || !email.trim()) {
    return withCors(
      NextResponse.json({ error: "이메일을 입력해주세요." }, { status: 400 })
    );
  }

  if (typeof password !== "string" || !password) {
    return withCors(
      NextResponse.json(
        { error: "비밀번호를 입력해주세요." },
        { status: 400 }
      )
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { data: authData, error: authError } =
    await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

  if (authError || !authData.session || !authData.user) {
    return withCors(
      NextResponse.json(
        { error: "이메일 또는 비밀번호가 올바르지 않습니다." },
        { status: 401 }
      )
    );
  }

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .single();

  return withCors(
    NextResponse.json({
      accessToken: authData.session.access_token,
      refreshToken: authData.session.refresh_token,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        role: profile?.role ?? null,
      },
    })
  );
}
