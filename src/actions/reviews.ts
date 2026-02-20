"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";

// 수강후기 목록 조회
export async function getReviews({
  page = 1,
  pageSize = 12,
}: { page?: number; pageSize?: number } = {}) {
  const svc = createServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await svc
    .from("reviews")
    .select("*, author:profiles!reviews_author_id_fkey(name)", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("getReviews error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

// 수강후기 상세 조회
export async function getReviewById(id: string) {
  const svc = createServiceClient();

  const { data, error } = await svc
    .from("reviews")
    .select("*, author:profiles!reviews_author_id_fkey(name)")
    .eq("id", id)
    .single();

  if (error) {
    console.error("getReviewById error:", error);
    return { data: null, error: error.message };
  }

  // 조회수 증가
  await svc
    .from("reviews")
    .update({ view_count: (data.view_count || 0) + 1 })
    .eq("id", id);

  return { data, error: null };
}

// 수강후기 작성
export async function createReview(data: {
  title: string;
  content: string;
  imageUrls: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  // student 권한 확인
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "student") {
    return { error: "수강생만 후기를 작성할 수 있습니다." };
  }

  const { data: review, error } = await svc
    .from("reviews")
    .insert({
      author_id: user.id,
      title: data.title,
      content: data.content,
      image_urls: data.imageUrls,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createReview error:", error);
    return { error: error.message };
  }

  revalidatePath("/reviews");
  return { data: review, error: null };
}

// 수강후기 삭제 (admin만)
export async function deleteReview(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    return { error: "관리자만 삭제할 수 있습니다." };
  }

  const { error } = await svc.from("reviews").delete().eq("id", id);

  if (error) {
    console.error("deleteReview error:", error);
    return { error: error.message };
  }

  revalidatePath("/reviews");
  return { error: null };
}
