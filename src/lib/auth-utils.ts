"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * admin 전용: 회원 삭제, role 변경, 이메일 발송
 */
export async function requireAdmin(): Promise<SupabaseClient> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("권한이 없습니다.");
  return svc;
}

/**
 * staff(admin + assistant): 회원 목록 조회, 콘텐츠 관리, 큐레이션, 이메일 미리보기, 프로텍터 조회
 */
export async function requireStaff(): Promise<SupabaseClient> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("인증되지 않은 사용자입니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "assistant"].includes(profile.role)) {
    throw new Error("권한이 없습니다.");
  }
  return svc;
}
