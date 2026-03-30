"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { createServiceClient } from "@/lib/db";
import { createAIAnswerForQuestion } from "@/lib/rag";
import { getCurrentUser } from "@/lib/firebase/auth";
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("questions") as any)
    .select(selectStr, { count: "exact" })
    .is("parent_question_id", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (categoryId) query = query.eq("category_id", categoryId);
  if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
  if (tab === "mine" && authorId) query = query.eq("author_id", authorId);
  else if (tab === "answered") query = query.in("status", ["answered", "closed"]);
  else if (tab === "pending") query = query.eq("status", "open");

  const { data, count, error } = await query;

  if (error) {
    console.error("getQuestions error:", error);
    return { data: [], count: 0, error: error.message };
  }

  // answers(count) 결과를 answers_count 필드로 정규화
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enriched: Record<string, any>[] = (data || []).map((q: any) => {
    const answersArray = q.answers as { count: number }[] | null;
    const answers_count = answersArray?.[0]?.count ?? 0;
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

  // view_count 비동기 (응답 반환 후 실행)
  after(async () => {
    await supabase
      .from("questions")
      .update({ view_count: (data.view_count || 0) + 1 })
      .eq("id", id);
  });

  return { data, error: null };
}

export async function createQuestion(formData: {
  title: string;
  content: string;
  categoryId: number | null;
  imageUrls?: string[];
  parentQuestionId?: string;
}) {
  const user = await getCurrentUser();

  if (!user) {
    return { data: null, error: "인증되지 않은 사용자입니다." };
  }

  const svc = createServiceClient();

  // role 체크: student/member/admin만 질문 작성 가능
  const { data: profile } = await svc
    .from("profiles")
    .select("role, name")
    .eq("id", user.uid)
    .single();

  if (!profile || !["student", "member", "admin"].includes(profile.role)) {
    return { data: null, error: "질문 작성 권한이 없습니다. 수강생만 질문할 수 있습니다." };
  }

  // parent_question_id가 database.ts 타입에 미반영 → as any 필요 (DB 타입 재생성 후 제거 예정)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.from("questions") as any)
    .insert({
      title: formData.title,
      content: formData.content,
      category_id: formData.categoryId,
      author_id: user.uid,
      // JSONB 컬럼 → JSON.stringify 필수 (쿼리빌더가 string[]을 pg 네이티브 배열로 보내면 JSONB 파싱 실패)
      image_urls: JSON.stringify(
        formData.imageUrls && formData.imageUrls.length > 0
          ? formData.imageUrls
          : []
      ),
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

  // fire-and-forget: 슬랙 채널에 새 질문 알림
  notifyNewQuestion({
    title: formData.title,
    authorName: profile.name || "이름 없음",
    questionId: data.id,
  }).catch(err => console.error("[Slack] 알림 실패:", err));

  // AI 답변 자동 생성 (동기 실행 — after()는 서버리스 타임아웃 시 silent fail)
  try {
    await createAIAnswerForQuestion(data.id, formData.title, formData.content, formData.imageUrls);
  } catch (err) {
    console.error("[createQuestion] AI 답변 생성 실패:", err);
  }

  revalidatePath("/questions");
  revalidatePath("/dashboard");
  // 꼬리질문인 경우 부모 질문 페이지도 갱신
  if (formData.parentQuestionId) {
    revalidatePath(`/questions/${formData.parentQuestionId}`);
  }
  return { data, error: null };
}

/**
 * 꼬리질문 삭제 — 답변 cascade 삭제 + 부모 스레드 임베딩 재생성
 */
export async function deleteFollowUpQuestion(id: string, parentQuestionId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();

  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.uid).single();
  const isAdmin = profile?.role === "admin";

  const { data: question } = await svc.from("questions").select("author_id").eq("id", id).single();
  if (!question) return { error: "질문을 찾을 수 없습니다." };

  const isOwner = question.author_id === user.uid;
  if (!isAdmin && !isOwner) return { error: "권한이 없습니다." };

  // 답변 먼저 삭제
  await svc.from("answers").delete().eq("question_id", id);

  const { error } = await svc.from("questions").delete().eq("id", id);
  if (error) {
    console.error("deleteFollowUpQuestion error:", error);
    return { error: error.message };
  }

  // 스레드 임베딩 재생성 (fire-and-forget)
  const { embedQAThread } = await import("@/lib/qa-embedder");
  Promise.resolve(embedQAThread(parentQuestionId))
    .catch(err => console.error("[QAThread] Re-embed after delete failed:", err));

  revalidatePath(`/questions/${parentQuestionId}`);
  revalidatePath("/questions");
  return { error: null };
}

export async function deleteQuestion(id: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "인증되지 않은 사용자입니다." };

  const svc = createServiceClient();

  // Get user role
  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.uid).single();
  const isAdmin = profile?.role === "admin";

  // Get question author
  const { data: question } = await svc.from("questions").select("author_id").eq("id", id).single();
  if (!question) return { error: "질문을 찾을 수 없습니다." };

  const isOwner = question.author_id === user.uid;
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
  const user = await getCurrentUser();

  if (!user) {
    return { data: null, error: "인증되지 않은 사용자입니다." };
  }

  const svc = createServiceClient();

  // 권한 체크: 본인 또는 admin/assistant
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
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

  const isOwner = question.author_id === user.uid;
  if (!isStaff && !isOwner) {
    return { data: null, error: "수정 권한이 없습니다." };
  }

  const { data, error } = await svc
    .from("questions")
    .update({
      title: formData.title,
      content: formData.content,
      category_id: formData.categoryId,
      // JSONB 컬럼 → JSON.stringify 필수
      image_urls: JSON.stringify(
        formData.imageUrls && formData.imageUrls.length > 0
          ? formData.imageUrls
          : []
      ),
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
 * 꼬리질문 조회 — parent_question_id로 연결된 꼬리질문 목록 반환
 */
export async function getFollowUpQuestions(parentQuestionId: string) {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("questions") as any)
    .select("*, author:profiles!questions_author_id_fkey(id, name, shop_name)")
    .eq("parent_question_id", parentQuestionId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getFollowUpQuestions error:", error.message);
    return { data: [], error: null };
  }

  return { data: data || [], error: null };
}

/**
 * 질문의 parent_question_id 조회 (스레드 임베딩용)
 */
export async function getParentQuestionId(questionId: string): Promise<string | null> {
  const supabase = createServiceClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase.from("questions") as any)
    .select("parent_question_id")
    .eq("id", questionId)
    .single();

  return data?.parent_question_id || null;
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
