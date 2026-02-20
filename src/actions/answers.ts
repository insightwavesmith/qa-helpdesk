"use server";

import { revalidatePath } from "next/cache";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { embedImage } from "@/lib/image-embedder";
import { embedQAPair } from "@/lib/qa-embedder";

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

export async function getAnswersByQuestionId(
  questionId: string,
  { includeUnapproved = false }: { includeUnapproved?: boolean } = {}
) {
  const supabase = createServiceClient();

  let query = supabase
    .from("answers")
    .select(
      "*, author:profiles!answers_author_id_fkey(id, name, shop_name)"
    )
    .eq("question_id", questionId)
    .order("created_at", { ascending: true });

  // 수강생: 승인된 답변만 표시 / 관리자: 전체 표시
  if (!includeUnapproved) {
    query = query.eq("is_approved", true);
  }

  const { data, error } = await query;

  if (error) {
    console.error("getAnswersByQuestionId error:", error);
    return { data: [], error: error.message };
  }

  return { data: data || [], error: null };
}

export async function getPendingAnswersCount() {
  const supabase = createServiceClient();

  const { count, error } = await supabase
    .from("answers")
    .select("*", { count: "exact", head: true })
    .eq("is_approved", false);

  if (error) {
    console.error("getPendingAnswersCount error:", error);
    return 0;
  }

  return count || 0;
}

export async function createAnswer(formData: {
  questionId: string;
  content: string;
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

  // role 체크: student/alumni/admin만 답변 작성 가능
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || !["student", "alumni", "admin"].includes(profile.role)) {
    return { data: null, error: "답변 작성 권한이 없습니다." };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.from("answers") as any)
    .insert({
      question_id: formData.questionId,
      content: formData.content,
      author_id: user.id,
      is_ai: false,
      is_approved: false,
      image_urls: formData.imageUrls || [],
    })
    .select("*, question:questions!answers_question_id_fkey(id, title)")
    .single();

  if (error) {
    console.error("createAnswer error:", error);
    return { data: null, error: error.message };
  }

  // T5b: 이미지가 있으면 자동 임베딩 (fire-and-forget)
  if (formData.imageUrls && formData.imageUrls.length > 0 && data) {
    const questionTitle = data.question?.title || "QA 답변";
    Promise.all(
      formData.imageUrls.map((url: string) =>
        embedImage(url, {
          sourceType: "qa",
          lectureName: questionTitle,
        }).catch((err: unknown) =>
          console.error("[T5b] Image embed failed:", err)
        )
      )
    ).catch(() => {});
  }

  // 답변 등록만 하고, 상태 변경은 관리자 승인 시 처리
  revalidatePath(`/questions/${formData.questionId}`);
  revalidatePath("/questions");
  revalidatePath("/dashboard");
  return { data, error: null };
}

export async function getPendingAnswers({
  page = 1,
  pageSize = 20,
}: { page?: number; pageSize?: number } = {}) {
  const supabase = await requireAdmin();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await supabase
    .from("answers")
    .select(
      "*, author:profiles!answers_author_id_fkey(id, name), question:questions!answers_question_id_fkey(id, title)",
      { count: "exact" }
    )
    .eq("is_approved", false)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("getPendingAnswers error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function approveAnswer(answerId: string) {
  const supabase = await requireAdmin();

  // 답변 승인
  const { data: answer, error } = await supabase
    .from("answers")
    .update({
      is_approved: true,
      approved_at: new Date().toISOString(),
    })
    .eq("id", answerId)
    .select("question_id")
    .single();

  if (error) {
    console.error("approveAnswer error:", error);
    return { error: error.message };
  }

  // 답변 승인 시 질문 상태를 "answered"로 변경
  if (answer?.question_id) {
    await supabase
      .from("questions")
      .update({ status: "answered" })
      .eq("id", answer.question_id);

    // fire-and-forget: QA 분리 임베딩 (실패해도 승인은 정상)
    Promise.resolve(embedQAPair(answer.question_id, answerId))
      .catch(err => console.error("[QAEmbed] Failed:", err));

    revalidatePath(`/questions/${answer.question_id}`);
  }

  revalidatePath("/admin/answers");
  revalidatePath("/questions");
  revalidatePath("/dashboard");
  return { error: null };
}

export async function deleteAnswer(answerId: string) {
  const supabase = await requireAdmin();

  const { error } = await supabase
    .from("answers")
    .delete()
    .eq("id", answerId);

  if (error) {
    console.error("deleteAnswer error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/answers");
  return { error: null };
}

export async function updateAnswer(answerId: string, content: string) {
  const supabase = await requireAdmin();

  const { error } = await supabase
    .from("answers")
    .update({ content })
    .eq("id", answerId);

  if (error) {
    console.error("updateAnswer error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/answers");
  return { error: null };
}
