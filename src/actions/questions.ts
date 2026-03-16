"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { createAIAnswerForQuestion } from "@/lib/rag";
import { notifyNewQuestion } from "@/lib/slack";

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

  const selectStr =
    "*, author:profiles!questions_author_id_fkey(id, name, shop_name), category:qa_categories!questions_category_id_fkey(id, name, slug), answers(count)";

  // 꼬리질문 제외 필터: parent_question_id IS NULL
  // migration 미실행 시 컬럼이 없어 에러 → 필터 없는 쿼리로 폴백
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let data: any[] | null = null;
  let count: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let error: any = null;

  // 1차 시도: parent_question_id IS NULL 필터 포함
  {
    let query = supabase
      .from("questions")
      .select(selectStr, { count: "exact" })
      .is("parent_question_id", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (categoryId) query = query.eq("category_id", categoryId);
    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    if (tab === "mine" && authorId) query = query.eq("author_id", authorId);
    else if (tab === "answered") query = query.in("status", ["answered", "closed"]);
    else if (tab === "pending") query = query.eq("status", "open");

    const result = await query;
    data = result.data;
    count = result.count;
    error = result.error;
  }

  // 2차 폴백: 컬럼 미존재 에러 시 필터 없이 재시도
  if (error) {
    console.warn("getQuestions: parent_question_id filter failed, falling back:", error.message);
    let query = supabase
      .from("questions")
      .select(selectStr, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (categoryId) query = query.eq("category_id", categoryId);
    if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    if (tab === "mine" && authorId) query = query.eq("author_id", authorId);
    else if (tab === "answered") query = query.in("status", ["answered", "closed"]);
    else if (tab === "pending") query = query.eq("status", "open");

    const fallback = await query;
    data = fallback.data;
    count = fallback.count;
    error = fallback.error;
  }

  if (error) {
    console.error("getQuestions error:", error);
    return { data: [], count: 0, error: error.message };
  }

  // answers(count) 결과를 answers_count 필드로 정규화
  const enriched = (data || []).map((q) => {
    const answersArray = q.answers as { count: number }[] | null;
    const answers_count = answersArray?.[0]?.count ?? 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { answers: _answers, ...rest } = q;
    return { ...rest, answers_count };
  });

  return { data: enriched, count: count || 0, error: null };
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
  parentQuestionId?: string;
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
    .select("role, name")
    .eq("id", user.id)
    .single();

  if (!profile || !["student", "member", "admin"].includes(profile.role)) {
    return { data: null, error: "질문 작성 권한이 없습니다. 수강생만 질문할 수 있습니다." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.from("questions") as any)
    .insert({
      title: formData.title,
      content: formData.content,
      category_id: formData.categoryId,
      author_id: user.id,
      image_urls: formData.imageUrls && formData.imageUrls.length > 0
        ? formData.imageUrls
        : [],
      ...(formData.parentQuestionId
        ? { parent_question_id: formData.parentQuestionId }
        : {}),
    })
    .select()
    .single();

  if (error) {
    console.error("createQuestion error:", error);
    return { data: null, error: error.message };
  }

  // AI 답변 자동 생성 + 슬랙 알림 (after: 응답 반환 후 실행, Vercel serverless 종료 방지)
  after(async () => {
    try {
      await Promise.all([
        createAIAnswerForQuestion(data.id, formData.title, formData.content, formData.imageUrls),
        notifyNewQuestion({
          questionId: data.id,
          title: formData.title,
          authorName: profile.name || "알 수 없음",
        }),
      ]);
    } catch (err) {
      console.error("AI answer generation or Slack notification failed:", err);
    }
  });

  revalidatePath("/questions");
  revalidatePath("/dashboard");
  // 꼬리질문인 경우 부모 질문 페이지도 갱신
  if (formData.parentQuestionId) {
    revalidatePath(`/questions/${formData.parentQuestionId}`);
  }
  return { data, error: null };
}

export async function deleteQuestion(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();

  // Get user role
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
  const isAdmin = profile?.role === "admin";

  // Get question author
  const { data: question } = await svc.from("questions").select("author_id").eq("id", id).single();
  if (!question) return { error: "질문을 찾을 수 없습니다." };

  const isOwner = question.author_id === user.id;
  if (!isAdmin && !isOwner) return { error: "권한이 없습니다." };

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

export async function updateQuestion(formData: {
  id: string;
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

  // 권한 체크: 본인 또는 admin/assistant
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  const isStaff =
    profile?.role === "admin" || profile?.role === "assistant";

  const { data: question } = await svc
    .from("questions")
    .select("author_id")
    .eq("id", formData.id)
    .single();

  if (!question) {
    return { data: null, error: "질문을 찾을 수 없습니다." };
  }

  const isOwner = question.author_id === user.id;
  if (!isStaff && !isOwner) {
    return { data: null, error: "수정 권한이 없습니다." };
  }

  const { data, error } = await svc
    .from("questions")
    .update({
      title: formData.title,
      content: formData.content,
      category_id: formData.categoryId,
      image_urls:
        formData.imageUrls && formData.imageUrls.length > 0
          ? formData.imageUrls
          : [],
    })
    .eq("id", formData.id)
    .select()
    .single();

  if (error) {
    console.error("updateQuestion error:", error);
    return { data: null, error: error.message };
  }

  revalidatePath(`/questions/${formData.id}`);
  revalidatePath("/questions");
  return { data, error: null };
}

/**
 * 꼬리질문 조회 — parent_question_id 컬럼이 없어도 안전하게 빈 배열 반환
 */
export async function getFollowUpQuestions(parentQuestionId: string) {
  const supabase = createServiceClient();

  try {
    const { data, error } = await supabase
      .from("questions")
      .select(
        "*, author:profiles!questions_author_id_fkey(id, name, shop_name)"
      )
      .eq("parent_question_id", parentQuestionId)
      .order("created_at", { ascending: true });

    if (error) {
      // parent_question_id 컬럼 미존재 시 에러 → 빈 배열 (기존 기능 영향 없음)
      console.error("getFollowUpQuestions error:", error.message);
      return { data: [], error: null };
    }

    return { data: data || [], error: null };
  } catch (e) {
    console.error("getFollowUpQuestions exception:", e);
    return { data: [], error: null };
  }
}

/**
 * 질문의 parent_question_id 조회 (스레드 임베딩용)
 * 컬럼 없으면 null 반환
 */
export async function getParentQuestionId(questionId: string): Promise<string | null> {
  const supabase = createServiceClient();

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("questions")
      .select("parent_question_id")
      .eq("id", questionId)
      .single();

    return data?.parent_question_id || null;
  } catch {
    return null;
  }
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
