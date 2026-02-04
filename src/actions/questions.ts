"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function getQuestions({
  page = 1,
  pageSize = 10,
  categoryId,
  search,
  status,
}: {
  page?: number;
  pageSize?: number;
  categoryId?: number | null;
  search?: string;
  status?: string;
} = {}) {
  const supabase = await createClient();
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

  if (status && status !== "all") {
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
  const supabase = await createClient();

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

  const { data, error } = await supabase
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

  // AI 답변 비동기 생성 (백그라운드, 에러 시 조용히 실패)
  triggerAiAnswer(data.id, `${formData.title}\n${formData.content}`);

  revalidatePath("/questions");
  revalidatePath("/dashboard");
  return { data, error: null };
}

/**
 * AI 답변 생성 API 비동기 호출
 * 질문 등록 완료 후 백그라운드에서 실행되며, 실패해도 질문 등록에 영향 없음
 */
function triggerAiAnswer(questionId: string, questionText: string) {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL
    || process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000";

  fetch(`${baseUrl}/api/ai-answer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questionId, questionText }),
  }).catch((err) => {
    console.error("AI 답변 트리거 실패 (무시됨):", err);
  });
}

export async function getCategories() {
  const supabase = await createClient();

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
