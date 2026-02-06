import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// Mixpanel 시크릿 저장
export async function POST(req: NextRequest) {
  const { userId, metaAccountId, mixpanelSecret } = await req.json();
  
  if (!userId || !metaAccountId || !mixpanelSecret) {
    return NextResponse.json({ error: "필수 필드 누락" }, { status: 400 });
  }

  const supabase = createServiceClient();

  // service_secrets에 저장
  const { error } = await supabase
    .from("service_secrets" as never)
    .upsert({
      user_id: userId,
      service: "mixpanel",
      key_name: `secret_${metaAccountId}`,
      key_value: mixpanelSecret,
    } as never, { onConflict: "user_id,service,key_name" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
