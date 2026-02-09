"use server";

import { createServiceClient } from "@/lib/supabase/server";

export async function subscribeNewsletter(email: string, name?: string) {
  if (!email || !email.includes("@")) {
    return { error: "유효한 이메일 주소를 입력해주세요.", status: "error" as const };
  }

  const svc = createServiceClient();

  // 이미 존재하는지 확인
  const { data: existing } = await svc
    .from("leads")
    .select("id, email_opted_out")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    // 수신거부 상태 → 재구독 처리
    if (existing.email_opted_out) {
      const updateData: Record<string, unknown> = { email_opted_out: false };
      if (name) updateData.name = name;
      const { error } = await svc
        .from("leads")
        .update(updateData)
        .eq("id", existing.id);
      if (error) {
        console.error("resubscribe error:", error);
        return { error: "재구독 처리 중 오류가 발생했습니다.", status: "error" as const };
      }
      return { error: null, status: "resubscribed" as const };
    }
    // 이미 구독 중
    return { error: null, status: "already" as const };
  }

  const { error } = await svc.from("leads").insert({
    email,
    name: name || "",
    status: "new",
  });

  if (error) {
    console.error("subscribeNewsletter error:", error);
    return { error: "구독 처리 중 오류가 발생했습니다.", status: "error" as const };
  }

  return { error: null, status: "success" as const };
}

function decodeToken(token: string): string | null {
  try {
    // base64url → base64 → decode
    const base64 = token.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

export async function unsubscribeByToken(token: string) {
  const email = decodeToken(token);
  if (!email || !email.includes("@")) {
    return { error: "잘못된 링크입니다." };
  }

  const svc = createServiceClient();

  const { data: existing } = await svc
    .from("leads")
    .select("id, email_opted_out")
    .eq("email", email)
    .maybeSingle();

  if (!existing) {
    return { error: "등록되지 않은 이메일입니다." };
  }

  if (existing.email_opted_out) {
    return { error: null, alreadyOptedOut: true };
  }

  const { error } = await svc
    .from("leads")
    .update({ email_opted_out: true })
    .eq("id", existing.id);

  if (error) {
    console.error("unsubscribeByToken error:", error);
    return { error: "수신거부 처리 중 오류가 발생했습니다." };
  }

  return { error: null, alreadyOptedOut: false };
}

export async function resubscribeByToken(token: string) {
  const email = decodeToken(token);
  if (!email || !email.includes("@")) {
    return { error: "잘못된 링크입니다." };
  }

  const svc = createServiceClient();

  const { data: existing } = await svc
    .from("leads")
    .select("id")
    .eq("email", email)
    .maybeSingle();

  if (!existing) {
    return { error: "등록되지 않은 이메일입니다." };
  }

  const { error } = await svc
    .from("leads")
    .update({ email_opted_out: false })
    .eq("id", existing.id);

  if (error) {
    console.error("resubscribeByToken error:", error);
    return { error: "재구독 처리 중 오류가 발생했습니다." };
  }

  return { error: null };
}
