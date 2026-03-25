import { NextRequest, NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { encrypt } from "@/lib/crypto";

// POST /api/protractor/save-secret
// 인증된 사용자만 자신의 시크릿 저장 가능
export async function POST(req: NextRequest) {
  try {
    // 인증 확인
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "인증이 필요합니다." },
        { status: 401 }
      );
    }

    const { metaAccountId, mixpanelSecret } = await req.json();

    if (!metaAccountId || !mixpanelSecret) {
      return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
    }

    const svc = createServiceClient();

    // service_secrets에 저장 (자신의 userId만 사용)
    const { error } = await svc
      .from("service_secrets" as never)
      .upsert({
        user_id: user.id,
        service: "mixpanel",
        key_name: `secret_${metaAccountId}`,
        key_value: encrypt(mixpanelSecret),
      } as never, { onConflict: "user_id,service,key_name" });

    if (error) {
      console.error("save-secret 오류:", error);
      return NextResponse.json(
        { error: "시크릿 저장에 실패했습니다." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
