"use server";

import { createClient, createServiceClient } from "@/lib/supabase/server";

async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("인증이 필요합니다.");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin") throw new Error("관리자 권한이 필요합니다.");

  return svc;
}

export async function getSubscribers(page = 1, pageSize = 20) {
  const svc = await requireAdmin();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, error, count } = await svc
    .from("leads")
    .select("id, name, email, created_at, email_opted_out", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error("구독자 목록 조회 실패");

  return { data: data || [], count: count || 0 };
}

export async function getSubscriberCount() {
  const svc = await requireAdmin();

  const { count, error } = await svc
    .from("leads")
    .select("id", { count: "exact", head: true });

  if (error) throw new Error("구독자 수 조회 실패");

  return count || 0;
}
