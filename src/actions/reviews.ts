"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServiceClient } from "@/lib/db";
import { getCurrentUser } from "@/lib/firebase/auth";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

// 수강후기 목록 조회
export async function getReviews({
  page = 1,
  pageSize = 12,
  filters,
}: {
  page?: number;
  pageSize?: number;
  filters?: { cohort?: string; category?: string; sortBy?: "latest" | "rating" };
} = {}) {
  const svc = createServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = svc
    .from("reviews")
    .select("*, author:profiles!reviews_author_id_fkey(name)", { count: "exact" });

  if (filters?.cohort) {
    query = query.eq("cohort", filters.cohort);
  }
  if (filters?.category) {
    query = query.eq("category", filters.category);
  }

  // is_featured first, then is_pinned, then sort
  if (filters?.sortBy === "rating") {
    query = query
      .order("is_featured", { ascending: false })
      .order("featured_order", { ascending: true, nullsFirst: false })
      .order("is_pinned", { ascending: false })
      .order("rating", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .order("is_featured", { ascending: false })
      .order("featured_order", { ascending: true, nullsFirst: false })
      .order("is_pinned", { ascending: false })
      .order("created_at", { ascending: false });
  }

  query = query.range(from, to);

  const { data, count, error } = await query;

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

  // view_count 비동기 (응답 반환 후 실행)
  after(async () => {
    await svc
      .from("reviews")
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq("id", id);
  });

  return { data, error: null };
}

// 수강후기 작성
export async function createReview(data: {
  title: string;
  content: string;
  imageUrls: string[];
  cohort?: string | null;
  category?: string;
  rating?: number | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  // student 권한 확인
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (profile?.role !== "student") {
    return { error: "수강생만 후기를 작성할 수 있습니다." };
  }

  const { data: review, error } = await svc
    .from("reviews")
    .insert({
      author_id: toProfileId(user.uid),
      title: data.title,
      content: data.content,
      image_urls: data.imageUrls,
      cohort: data.cohort || null,
      category: data.category || "general",
      rating: data.rating || null,
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

// 관리자 후기 등록 (유튜브 URL 선택, 텍스트 내용 필수)
export async function createAdminReview(data: {
  title: string;
  content: string;
  youtubeUrl?: string;
  cohort?: string | null;
  category?: string;
  rating?: number | null;
}) {
  const user = await getCurrentUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (profile?.role !== "admin") {
    return { error: "관리자만 후기를 등록할 수 있습니다." };
  }

  // 별점 범위 검증
  if (data.rating != null && (data.rating < 1 || data.rating > 5)) {
    return { error: "별점은 1~5 사이 값이어야 합니다." };
  }

  const { data: review, error } = await svc
    .from("reviews")
    .insert({
      author_id: toProfileId(user.uid),
      title: data.title,
      content: data.content,
      youtube_url: data.youtubeUrl || null,
      cohort: data.cohort || null,
      category: data.category || "general",
      rating: data.rating || null,
    })
    .select("id")
    .single();

  if (error) {
    console.error("createAdminReview error:", error);
    return { error: error.message };
  }

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { data: review, error: null };
}

// 후기 고정/해제 토글 (관리자 전용)
export async function togglePinReview(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (profile?.role !== "admin") {
    return { error: "관리자만 고정할 수 있습니다." };
  }

  const { data: review, error: fetchError } = await svc
    .from("reviews")
    .select("is_pinned")
    .eq("id", id)
    .single();

  if (fetchError) {
    return { error: fetchError.message };
  }

  const { error } = await svc
    .from("reviews")
    .update({ is_pinned: !review.is_pinned })
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { error: null };
}

// 베스트 후기 선정/해제 토글 (관리자 전용, 최대 5개)
export async function toggleFeaturedReview(reviewId: string) {
  const user = await getCurrentUser();
  if (!user) return { success: false, error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (profile?.role !== "admin") {
    return { success: false, error: "관리자만 베스트 후기를 선정할 수 있습니다." };
  }

  const { data: review, error: fetchError } = await svc
    .from("reviews")
    .select("is_featured")
    .eq("id", reviewId)
    .single();

  if (fetchError || !review) {
    return { success: false, error: "후기를 찾을 수 없습니다." };
  }

  if (review.is_featured) {
    // 해제
    await svc
      .from("reviews")
      .update({ is_featured: false, featured_order: null })
      .eq("id", reviewId);

    // 나머지 순서 재정렬
    await reorderFeaturedReviews(svc);
  } else {
    // 선정: 최대 5개 확인
    const { count } = await svc
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("is_featured", true);

    if ((count ?? 0) >= 5) {
      return { success: false, error: "베스트 후기는 최대 5개까지 선정할 수 있습니다." };
    }

    // 다음 순서 번호
    const { data: maxOrder } = await svc
      .from("reviews")
      .select("featured_order")
      .eq("is_featured", true)
      .order("featured_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxOrder?.featured_order ?? 0) + 1;

    await svc
      .from("reviews")
      .update({ is_featured: true, featured_order: nextOrder })
      .eq("id", reviewId);
  }

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { success: true, error: null };
}

// 베스트 후기 순서 재정렬 (내부 헬퍼)
async function reorderFeaturedReviews(
  svc: ReturnType<typeof createServiceClient>,
) {
  const { data: featured } = await svc
    .from("reviews")
    .select("id, featured_order")
    .eq("is_featured", true)
    .order("featured_order", { ascending: true });

  if (!featured) return;

  for (let i = 0; i < featured.length; i++) {
    if (featured[i].featured_order !== i + 1) {
      await svc
        .from("reviews")
        .update({ featured_order: i + 1 })
        .eq("id", featured[i].id);
    }
  }
}

// 관리자 후기 목록 (전체 + 작성자 정보)
export async function getReviewsAdmin() {
  const svc = createServiceClient();

  const { data, error } = await svc
    .from("reviews")
    .select("*, author:profiles!reviews_author_id_fkey(name)")
    .order("is_featured", { ascending: false })
    .order("featured_order", { ascending: true, nullsFirst: false })
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getReviewsAdmin error:", error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

// 수강후기 삭제 (admin만)
export async function deleteReview(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  // Check if admin or author
  const { data: review } = await svc
    .from("reviews")
    .select("author_id")
    .eq("id", id)
    .single();
  if (!review) return { error: "후기를 찾을 수 없습니다." };

  const isAdmin = profile?.role === "admin";
  const isOwner = review.author_id === toProfileId(user.uid);
  if (!isAdmin && !isOwner) {
    return { error: "권한이 없습니다." };
  }

  const { error } = await svc.from("reviews").delete().eq("id", id);

  if (error) {
    console.error("deleteReview error:", error);
    return { error: error.message };
  }

  revalidatePath("/reviews");
  revalidatePath("/admin/reviews");
  return { error: null };
}
