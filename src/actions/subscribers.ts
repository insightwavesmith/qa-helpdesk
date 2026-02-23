"use server";

import { requireAdmin } from "@/lib/auth-utils";

/** LIKE 인젝션 방지: %, _, \ 이스케이프 */
function escapeLike(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export async function getSubscribers(
  page = 1,
  pageSize = 20,
  options?: { status?: "active" | "opted_out"; search?: string }
) {
  const svc = await requireAdmin();

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = svc
    .from("leads")
    .select("id, name, email, created_at, email_opted_out", { count: "exact" });

  // 수신 상태 필터
  if (options?.status === "active") {
    query = query.eq("email_opted_out", false);
  } else if (options?.status === "opted_out") {
    query = query.eq("email_opted_out", true);
  }

  // 이름/이메일 검색
  if (options?.search?.trim()) {
    const escaped = escapeLike(options.search.trim());
    query = query.or(`email.ilike.%${escaped}%,name.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query
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
