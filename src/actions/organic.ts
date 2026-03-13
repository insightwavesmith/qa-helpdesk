"use server";

import { requireAdmin } from "@/lib/auth-utils";
import type {
  OrganicPost,
  CreateOrganicPostInput,
  UpdateOrganicPostInput,
  OrganicStats,
  KeywordStat,
} from "@/types/organic";

// organic_posts / organic_analytics / keyword_stats 테이블은 database.ts에 아직 미등록
// (Supabase migration 실행 전 상태) — supabase 클라이언트를 any로 우회
// TODO: migration 실행 후 database.ts 업데이트 → as any 제거

// ─── 목록 조회 ────────────────────────────────────────────────────────────────

export async function getOrganicPosts(
  filters: {
    channel?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: OrganicPost[]; count: number; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;
    const { channel, status, page = 1, limit = 20 } = filters;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("organic_posts")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (channel) {
      query = query.eq("channel", channel);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("getOrganicPosts error:", error);
      return { data: [], count: 0, error: error.message };
    }

    return { data: (data as OrganicPost[]) || [], count: count || 0, error: null };
  } catch (e) {
    console.error("getOrganicPosts exception:", e);
    return { data: [], count: 0, error: e instanceof Error ? e.message : "조회 실패" };
  }
}

// ─── 단건 조회 ────────────────────────────────────────────────────────────────

export async function getOrganicPost(
  id: string
): Promise<{ data: OrganicPost | null; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    const { data, error } = await supabase
      .from("organic_posts")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      console.error("getOrganicPost error:", error);
      return { data: null, error: error.message };
    }

    return { data: data as OrganicPost, error: null };
  } catch (e) {
    console.error("getOrganicPost exception:", e);
    return { data: null, error: e instanceof Error ? e.message : "조회 실패" };
  }
}

// ─── 새 글 생성 ───────────────────────────────────────────────────────────────

export async function createOrganicPost(
  input: CreateOrganicPostInput
): Promise<{ data: OrganicPost | null; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    const insertPayload = {
      title: input.title,
      content: input.content ?? null,
      channel: input.channel,
      keywords: input.keywords ?? [],
      level: input.level ?? null,
      status: "draft",
    };

    const { data, error } = await supabase
      .from("organic_posts")
      .insert(insertPayload)
      .select()
      .single();

    if (error) {
      console.error("createOrganicPost error:", error);
      return { data: null, error: error.message };
    }

    return { data: data as OrganicPost, error: null };
  } catch (e) {
    console.error("createOrganicPost exception:", e);
    return { data: null, error: e instanceof Error ? e.message : "생성 실패" };
  }
}

// ─── 수정 ─────────────────────────────────────────────────────────────────────

export async function updateOrganicPost(
  id: string,
  input: UpdateOrganicPostInput
): Promise<{ data: OrganicPost | null; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    const { data, error } = await supabase
      .from("organic_posts")
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("updateOrganicPost error:", error);
      return { data: null, error: error.message };
    }

    return { data: data as OrganicPost, error: null };
  } catch (e) {
    console.error("updateOrganicPost exception:", e);
    return { data: null, error: e instanceof Error ? e.message : "수정 실패" };
  }
}

// ─── 발행 ─────────────────────────────────────────────────────────────────────

export async function publishOrganicPost(
  id: string
): Promise<{ data: OrganicPost | null; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("organic_posts")
      .update({
        status: "published",
        published_at: now,
        updated_at: now,
      })
      .eq("id", id)
      .select()
      .single();

    if (error) {
      console.error("publishOrganicPost error:", error);
      return { data: null, error: error.message };
    }

    return { data: data as OrganicPost, error: null };
  } catch (e) {
    console.error("publishOrganicPost exception:", e);
    return { data: null, error: e instanceof Error ? e.message : "발행 실패" };
  }
}

// ─── 삭제 ─────────────────────────────────────────────────────────────────────

export async function deleteOrganicPost(
  id: string
): Promise<{ error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    const { error } = await supabase
      .from("organic_posts")
      .delete()
      .eq("id", id);

    if (error) {
      console.error("deleteOrganicPost error:", error);
      return { error: error.message };
    }

    return { error: null };
  } catch (e) {
    console.error("deleteOrganicPost exception:", e);
    return { error: e instanceof Error ? e.message : "삭제 실패" };
  }
}

// ─── 대시보드 통계 ────────────────────────────────────────────────────────────

export async function getOrganicStats(): Promise<{
  data: OrganicStats | null;
  error: string | null;
}> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;

    // organic_posts status별 카운트
    const { data: postRows, error: postsError } = await supabase
      .from("organic_posts")
      .select("status");

    if (postsError) {
      console.error("getOrganicStats posts error:", postsError);
      return { data: null, error: postsError.message };
    }

    const rows = (postRows as Array<{ status: string }>) || [];
    const totalPosts = rows.length;
    const publishedPosts = rows.filter((r) => r.status === "published").length;
    const draftPosts = rows.filter((r) => r.status === "draft").length;
    const reviewPosts = rows.filter((r) => r.status === "review").length;

    // organic_analytics views 합계
    const { data: analyticsRows, error: analyticsError } = await supabase
      .from("organic_analytics")
      .select("views");

    if (analyticsError) {
      console.error("getOrganicStats analytics error:", analyticsError);
      // 분석 데이터가 없어도 stats는 반환 (테이블 미존재 시 포함)
    }

    const totalViews = ((analyticsRows as Array<{ views: number | null }>) || []).reduce(
      (sum, row) => sum + (row.views ?? 0),
      0
    );

    // keyword_stats 개수
    const { count: keywordCount, error: keywordError } = await supabase
      .from("keyword_stats")
      .select("*", { count: "exact", head: true });

    if (keywordError) {
      console.error("getOrganicStats keyword error:", keywordError);
    }

    const stats: OrganicStats = {
      totalPosts,
      publishedPosts,
      draftPosts,
      reviewPosts,
      totalViews,
      totalKeywords: (keywordCount as number) ?? 0,
    };

    return { data: stats, error: null };
  } catch (e) {
    console.error("getOrganicStats exception:", e);
    return { data: null, error: e instanceof Error ? e.message : "통계 조회 실패" };
  }
}

// ─── 키워드 통계 목록 ─────────────────────────────────────────────────────────

export async function getKeywordStats(
  filters: {
    channel?: string;
    page?: number;
    limit?: number;
  } = {}
): Promise<{ data: KeywordStat[]; count: number; error: string | null }> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supabase = (await requireAdmin()) as any;
    const { channel, page = 1, limit = 50 } = filters;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase
      .from("keyword_stats")
      .select(
        "id, keyword, channel, pc_search, mobile_search, total_search, competition, fetched_at",
        { count: "exact" }
      )
      .order("fetched_at", { ascending: false })
      .range(from, to);

    if (channel) {
      query = query.eq("channel", channel);
    }

    const { data, count, error } = await query;

    if (error) {
      console.error("getKeywordStats error:", error);
      return { data: [], count: 0, error: error.message };
    }

    return { data: (data as KeywordStat[]) || [], count: count || 0, error: null };
  } catch (e) {
    console.error("getKeywordStats exception:", e);
    return { data: [], count: 0, error: e instanceof Error ? e.message : "키워드 조회 실패" };
  }
}
