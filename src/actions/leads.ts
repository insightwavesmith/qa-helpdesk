"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function subscribeNewsletter(email: string) {
  if (!email || !email.includes("@")) {
    return { error: "유효한 이메일 주소를 입력해주세요.", alreadySubscribed: false };
  }

  const svc = createServiceClient();

  // 이미 구독 중인지 확인
  const { data: existing } = await svc
    .from("leads")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return { alreadySubscribed: true, error: null };
  }

  const { error } = await svc.from("leads").insert({
    email,
    name: "",
    status: "active",
  });

  if (error) {
    console.error("subscribeNewsletter error:", error);
    return { alreadySubscribed: false, error: "구독 처리 중 오류가 발생했습니다." };
  }

  return { alreadySubscribed: false, error: null };
}
