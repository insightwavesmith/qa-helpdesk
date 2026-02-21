"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { embedContentToChunks } from "@/actions/embed-pipeline";

async function requireAdmin() {
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

export async function getCurationContents({
  source,
  minScore,
  period,
  showDismissed = false,
  page = 1,
  pageSize = 100,
}: {
  source?: string;
  minScore?: number;
  period?: string;
  showDismissed?: boolean;
  page?: number;
  pageSize?: number;
} = {}) {
  const supabase = await requireAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("contents")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  // curation_status 필터
  if (showDismissed) {
    query = query.in("curation_status", ["new", "selected", "dismissed"]);
  } else {
    query = query.in("curation_status", ["new", "selected"]);
  }

  // 소스 필터
  if (source && source !== "all") {
    query = query.eq("source_type", source);
  } else {
    // 큐레이션 대상: crawl, youtube만
    query = query.in("source_type", ["crawl", "youtube"]);
  }

  // 중요도 필터
  if (minScore && minScore > 0) {
    query = query.gte("importance_score", minScore);
  }

  // 기간 필터
  if (period === "today") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    query = query.gte("created_at", today.toISOString());
  } else if (period === "week") {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    query = query.gte("created_at", weekAgo.toISOString());
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getCurationContents error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function getCurationCount() {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (supabase as any)
    .from("contents")
    .select("id", { count: "exact", head: true })
    .in("curation_status", ["new", "selected"])
    .in("source_type", ["crawl", "youtube"]);

  if (error) {
    console.error("getCurationCount error:", error);
    return 0;
  }

  return count || 0;
}

export async function updateCurationStatus(
  id: string,
  status: "selected" | "dismissed" | "published"
) {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("contents")
    .update({
      curation_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    console.error("updateCurationStatus error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { error: null };
}

export async function batchUpdateCurationStatus(
  ids: string[],
  status: "selected" | "dismissed" | "published"
) {
  const supabase = await requireAdmin();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("contents")
    .update({
      curation_status: status,
      updated_at: new Date().toISOString(),
    })
    .in("id", ids);

  if (error) {
    console.error("batchUpdateCurationStatus error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/content");
  return { error: null };
}

export async function publishInfoShare({
  title,
  bodyMd,
  category = "education",
  sourceContentIds,
}: {
  title: string;
  bodyMd: string;
  category?: string;
  sourceContentIds: string[];
}) {
  const supabase = await requireAdmin();
  const now = new Date().toISOString();

  // 1. 새 contents 행 INSERT (정보공유)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newContent, error: insertError } = await (supabase as any)
    .from("contents")
    .insert({
      title,
      body_md: bodyMd,
      status: "published",
      type: "education",
      category,
      source_type: "info_share",
      source_ref: sourceContentIds.join(","),
      curation_status: "published",
      published_at: now,
      embedding_status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !newContent) {
    console.error("publishInfoShare insert error:", insertError);
    return { data: null, error: insertError?.message || "게시 실패" };
  }

  // 2. 원본 콘텐츠 curation_status → published
  if (sourceContentIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from("contents")
      .update({ curation_status: "published", updated_at: now })
      .in("id", sourceContentIds);
  }

  // 3. 자동 임베딩 (fire-and-forget)
  embedContentToChunks(newContent.id).catch((err) =>
    console.error("publishInfoShare 임베딩 실패 (무시됨):", err)
  );

  revalidatePath("/admin/content");
  revalidatePath("/posts");
  return { data: { id: newContent.id }, error: null };
}

export async function getInfoShareContents({
  page = 1,
  pageSize = 50,
}: { page?: number; pageSize?: number } = {}) {
  const supabase = await requireAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, count, error } = await (supabase as any)
    .from("contents")
    .select("*", { count: "exact" })
    .eq("source_type", "info_share")
    .eq("curation_status", "published")
    .order("published_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("getInfoShareContents error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}
