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

  // 소스 필터 (T3: 모든 source_type 허용, info_share만 제외)
  if (source && source !== "all") {
    query = query.eq("source_type", source);
  } else {
    query = query.neq("source_type", "info_share");
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
    .neq("source_type", "info_share");

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

export async function createInfoShareDraft({
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

  // 1. 새 contents 행 INSERT (draft — 콘텐츠 탭에서 편집/게시)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: newContent, error: insertError } = await (supabase as any)
    .from("contents")
    .insert({
      title,
      body_md: bodyMd,
      status: "draft",
      type: "education",
      category,
      source_type: "info_share",
      source_ref: sourceContentIds.join(","),
      curation_status: "published",
    })
    .select("id")
    .single();

  if (insertError || !newContent) {
    console.error("createInfoShareDraft insert error:", insertError);
    return { data: null, error: insertError?.message || "생성 실패" };
  }

  // 2. 원본 콘텐츠 curation_status → published (별도 클라이언트)
  if (sourceContentIds.length > 0) {
    const svc2 = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateError } = await (svc2 as any)
      .from("contents")
      .update({ curation_status: "published", updated_at: now })
      .in("id", sourceContentIds);

    if (updateError) {
      console.error("createInfoShareDraft 원본 상태 업데이트 실패:", updateError);
      for (const srcId of sourceContentIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: retryErr } = await (svc2 as any)
          .from("contents")
          .update({ curation_status: "published", updated_at: now })
          .eq("id", srcId);
        if (retryErr) {
          console.error(`  원본 ${srcId} 재시도 실패:`, retryErr);
        }
      }
    }
  }

  revalidatePath("/admin/content");
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

// ─── T7: 파이프라인 현황 ─────────────────────────────────────

export interface PipelineStat {
  sourceType: string;
  label: string;
  contentsCount: number;
  chunksCount: number;
  newCount: number;
}

const SOURCE_LABELS: Record<string, string> = {
  blueprint: "블루프린트",
  lecture: "자사몰사관학교",
  youtube: "YouTube",
  crawl: "블로그",
  marketing_theory: "마케팅원론",
  webinar: "웨비나",
  papers: "논문",
  file: "파일",
};

export async function getPipelineStats(): Promise<PipelineStat[]> {
  const supabase = await requireAdmin();
  const dayAgo = new Date(Date.now() - 86400000).toISOString();

  // 3개 쿼리 병렬 실행
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const s = supabase as any;
  const [contentsRes, chunksRes, newRes] = await Promise.all([
    s.from("contents").select("source_type").neq("source_type", "info_share"),
    s.from("knowledge_chunks").select("source_type"),
    s.from("contents").select("source_type").gte("created_at", dayAgo).neq("source_type", "info_share"),
  ]);

  // 집계
  const contentsCounts: Record<string, number> = {};
  const chunksCounts: Record<string, number> = {};
  const newCounts: Record<string, number> = {};

  for (const row of (contentsRes.data || []) as { source_type: string }[]) {
    const st = row.source_type || "unknown";
    contentsCounts[st] = (contentsCounts[st] || 0) + 1;
  }
  for (const row of (chunksRes.data || []) as { source_type: string }[]) {
    const st = row.source_type || "unknown";
    chunksCounts[st] = (chunksCounts[st] || 0) + 1;
  }
  for (const row of (newRes.data || []) as { source_type: string }[]) {
    const st = row.source_type || "unknown";
    newCounts[st] = (newCounts[st] || 0) + 1;
  }

  const allSources = new Set([...Object.keys(contentsCounts), ...Object.keys(chunksCounts)]);
  const stats: PipelineStat[] = [];
  for (const st of allSources) {
    if (st === "info_share" || st === "unknown") continue;
    stats.push({
      sourceType: st,
      label: SOURCE_LABELS[st] || st,
      contentsCount: contentsCounts[st] || 0,
      chunksCount: chunksCounts[st] || 0,
      newCount: newCounts[st] || 0,
    });
  }
  stats.sort((a, b) => b.chunksCount - a.chunksCount);
  return stats;
}
