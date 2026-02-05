"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAIAnswerForQuestion } from "@/lib/rag";

export async function getQuestions({
  page = 1,
  pageSize = 10,
  categoryId,
  search,
  status,
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
  if (tab === "all") {
    // 전체 Q&A: only answered questions
    query = query.eq("status", "answered");
  } else if (tab === "mine" && authorId) {
    // 내 질문: all statuses for the author
    query = query.eq("author_id", authorId);
  }

  // Additional status filter (only if not using tab-specific filtering)
  if (tab === "mine" && status && status !== "all") {
    query = query.eq("status", status as "open" | "answered" | "closed");
  }

  const { data, count, error } = await query;

  if (error) {
    console.error("getQuestions error:", error);
    return { data: [], count: 0, error: error.message };
  }

  // Get answer counts for each question
  if (data && data.length > 0) {
    const questionIds = data.map((q) => q.id);
    const { data: answerCounts } = await supabase
      .from("answers")
      .select("question_id")
      .in("question_id", questionIds);

    const countMap: Record<string, number> = {};
    answerCounts?.forEach((a) => {
      countMap[a.question_id] = (countMap[a.question_id] || 0) + 1;
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

  // AI 답변 자동 생성 (비동기, 실패해도 질문 생성은 성공)
  createAIAnswerForQuestion(data.id, formData.title, formData.content).catch(
    (err) => console.error("AI answer generation failed:", err)
  );

  revalidatePath("/questions");
  revalidatePath("/dashboard");
  return { data, error: null };
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
