"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/auth-utils";
import { createAIAnswerForQuestion } from "@/lib/rag";

export async function getQuestions({
  page = 1,
  pageSize = 10,
  categoryId,
  search,
  tab = "all",
  authorId,
}: {
  page?: number;
  pageSize?: number;
  categoryId?: number | null;
  search?: string;
  status?: string;
  tab?: string;
  authorId?: string;
} = {}) {
  const supabase = createServiceClient();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("questions")
    .select(
      "*, author:profiles!questions_author_id_fkey(id, name, shop_name), category:qa_categories!questions_category_id_fkey(id, name, slug)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .range(from, to);

  if (categoryId) {
    query = query.eq("category_id", categoryId);
  }

  if (search) {
    query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  }

  // Handle tab-specific filtering
  if (tab === "mine" && authorId) {
    query = query.eq("author_id", authorId);
  } else if (tab === "answered") {
    query = query.in("status", ["answered", "closed"]);
  } else if (tab === "pending") {
    query = query.eq("status", "open");
  }
  // tab === "all" → 필터 없음 (전체 표시)

  const { data, count, error } = await query;

  if (error) {
    console.error("getQuestions error:", error);
    return { data: [], count: 0, error: error.message };
  }

  // Get answer counts for each question
  if (data && data.length > 0) {
    const questionIds = data.map((q) => q.id);
    const countResults = await Promise.all(
      questionIds.map((qid) =>
        supabase
          .from("answers")
          .select("*", { count: "exact", head: true })
          .eq("question_id", qid)
      )
    );

    const countMap: Record<string, number> = {};
    questionIds.forEach((qid, i) => {
      countMap[qid] = countResults[i].count || 0;
    });

    const enriched = data.map((q) => ({
      ...q,
      answers_count: countMap[q.id] || 0,
    }));

    return { data: enriched, count: count || 0, error: null };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function getQuestionById(id: string) {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("questions")
    .select(
      "*, author:profiles!questions_author_id_fkey(id, name, shop_name), category:qa_categories!questions_category_id_fkey(id, name, slug)"
    )
    .eq("id", id)
    .single();

  if (error) {
    console.error("getQuestionById error:", error);
    return { data: null, error: error.message };
  }

  // Increment view count
  await supabase
    .from("questions")
    .update({ view_count: (data.view_count || 0) + 1 })
    .eq("id", id);

  return { data, error: null };
}

export async function createQuestion(formData: {
  title: string;
  content: string;
  categoryId: number | null;
  imageUrls?: string[];
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: "인증되지 않은 사용자입니다." };
  }

  const svc = createServiceClient();

  // role 체크: student/member/admin만 질문 작성 가능
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["student", "member", "admin"].includes(profile.role)) {
    return { data: null, error: "질문 작성 권한이 없습니다. 수강생만 질문할 수 있습니다." };
  }

  const { data, error } = await svc
    .from("questions")
    .insert({
      title: formData.title,
      content: formData.content,
      category_id: formData.categoryId,
      author_id: user.id,
      image_urls: formData.imageUrls && formData.imageUrls.length > 0
        ? formData.imageUrls
        : [],
    })
    .select()
    .single();

  if (error) {
    console.error("createQuestion error:", error);
    return { data: null, error: error.message };
  }

  // AI 답변 자동 생성 (after: 응답 반환 후 실행, Vercel serverless 종료 방지)
  after(async () => {
    try {
      await createAIAnswerForQuestion(data.id, formData.title, formData.content, formData.imageUrls);
    } catch (err) {
      console.error("AI answer generation failed:", err);
    }
  });

  revalidatePath("/questions");
  revalidatePath("/dashboard");
  return { data, error: null };
}

export async function deleteQuestion(id: string) {
  const svc = await requireAdmin();

  // 답변 먼저 삭제
  await svc.from("answers").delete().eq("question_id", id);

  const { error } = await svc.from("questions").delete().eq("id", id);

  if (error) {
    console.error("deleteQuestion error:", error);
    return { error: error.message };
  }

  revalidatePath("/questions");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function getCategories() {
  const supabase = createServiceClient();

  const { data, error } = await supabase
    .from("qa_categories")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("getCategories error:", error);
    return [];
  }

  return data || [];
}
