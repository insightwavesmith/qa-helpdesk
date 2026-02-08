"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// 기존 posts 카테고리 → contents 카테고리 매핑
const legacyToCategory: Record<string, string> = {
  info: "education",
  notice: "news",
  webinar: "case_study",
};

// contents 행을 기존 Post 인터페이스 형태로 변환
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapContentToPost<T extends Record<string, any>>(row: T): T & { content: string; is_published: boolean } {
  return {
    ...row,
    // body_md → content 호환 필드 매핑
    content: (row.body_md as string) || "",
    // is_published 호환 (status가 published면 true)
    is_published: row.status === "published",
  };
}

export async function getPosts({
  page = 1,
  pageSize = 10,
  category,
  search,
}: {
  page?: number;
  pageSize?: number;
  category?: string;
  search?: string;
} = {}) {
  const supabase = createServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("contents")
    .select(
      "*, author:profiles(id, name, shop_name)",
      { count: "exact" }
    )
    .eq("status", "published")
    .order("is_pinned", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (category && category !== "all") {
    // 기존 카테고리(info/notice/webinar) → contents 카테고리 변환
    const mapped = legacyToCategory[category] || category;
    query = query.eq("category", mapped);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,body_md.ilike.%${search}%`);
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getPosts error:", error);
    return { data: [], count: 0, error: error.message };
  }

  const mapped = (data || []).map(mapContentToPost);
  return { data: mapped, count: count || 0, error: null };
}

export async function getPostById(id: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("contents")
    .select(
      "*, author:profiles(id, name, shop_name)"
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("getPostById error:", error);
    return { data: null, error: error.message };
  }

  // Increment view count
  await supabase
    .from("contents")
    .update({ view_count: (data.view_count || 0) + 1 })
    .eq("id", id);

  return { data: mapContentToPost(data), error: null };
}

export async function createPost(formData: {
  title: string;
  content: string;
  category: "education" | "news" | "case_study";
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "인증되지 않은 사용자입니다." };
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("contents")
    .insert({
      title: formData.title,
      body_md: formData.content,
      category: formData.category,
      author_id: user.id,
      status: "draft", // 관리자 승인 후 공개
    })
    .select()
    .single();

  if (error) {
    console.error("createPost error:", error);
    return { data: null, error: error.message };
  }

  revalidatePath("/posts");
  revalidatePath("/dashboard");
  return { data: mapContentToPost(data), error: null };
}

export async function getCommentsByPostId(postId: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("comments")
    .select(
      "*, author:profiles!comments_author_id_fkey(id, name, shop_name)"
    )
    .eq("post_id", postId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getCommentsByPostId error:", error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

export async function createComment(formData: {
  postId?: string;
  questionId?: string;
  content: string;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "인증되지 않은 사용자입니다." };
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("comments")
    .insert({
      post_id: formData.postId || null,
      question_id: formData.questionId || null,
      content: formData.content,
      author_id: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("createComment error:", error);
    return { data: null, error: error.message };
  }

  if (formData.postId) {
    revalidatePath(`/posts/${formData.postId}`);
  }
  if (formData.questionId) {
    revalidatePath(`/questions/${formData.questionId}`);
  }
  return { data, error: null };
}
