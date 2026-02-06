import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// 알림 전송 API
// TODO: 이메일/슬랙 알림 구현

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { type, message } = body;

    if (!type || !message) {
      return NextResponse.json(
        { error: "type과 message는 필수입니다." },
        { status: 400 }
      );
    }

    // TODO: 사용자 알림 설정 확인 후 전송
    // - 이메일 알림
    // - 슬랙 웹훅 알림

    return NextResponse.json({ message: "알림이 전송되었습니다." });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
