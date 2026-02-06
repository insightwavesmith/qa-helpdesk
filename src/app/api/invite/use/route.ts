import { NextRequest, NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";

// 초대 코드 사용 횟수 증가
export async function POST(req: NextRequest) {
  const { code } = await req.json();
  if (!code) {
    return NextResponse.json({ error: "코드가 없습니다" }, { status: 400 });
  }

  const supabase = createServiceClient();
  
  // used_count 증가
  const { error } = await supabase
    .from("invite_codes")
    .update({ used_count: (await supabase.from("invite_codes").select("used_count").eq("code", code).single()).data?.used_count! + 1 })
    .eq("code", code);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
