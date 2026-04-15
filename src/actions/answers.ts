"use server";

import { revalidatePath } from "next/cache";
import { createServiceClient } from "@/lib/db";
import { requireStaff } from "@/lib/auth-utils";
import { embedImage } from "@/lib/image-embedder";
import { embedQAPair, embedQAThread } from "@/lib/qa-embedder";
import { getParentQuestionId } from "@/actions/questions";
import { runStyleLearning } from "@/lib/style-learner";
import { sendKakaoNotification } from "@/lib/solapi";
import { getCurrentUser } from "@/lib/firebase/auth";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

export async function getAnswersByQuestionId(
  questionId: string,
  { includeUnapproved = false }: { includeUnapproved?: boolean } = {}
) {
  const db = createServiceClient();

  let query = db
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
  const db = createServiceClient();

  const { count, error } = await db
    .from("answers")
    .select("*", { count: "exact", head: true })
    .or("is_approved.eq.false,is_approved.is.null");

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
  const user = await getCurrentUser();

  if (!user) {
    return { data: null, error: "인증되지 않은 사용자입니다." };
  }

  const svc = createServiceClient();

  // role 체크: student/member/admin/assistant만 답변 작성 가능
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  if (!profile || !["student", "member", "admin", "assistant"].includes(profile.role)) {
    return { data: null, error: "답변 작성 권한이 없습니다." };
  }

  // 관리자(admin/assistant)가 작성하면 바로 승인 처리
  const isStaff = ["admin", "assistant"].includes(profile.role);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (svc.from("answers") as any)
    .insert({
      question_id: formData.questionId,
      content: formData.content,
      author_id: toProfileId(user.uid),
      is_ai: false,
      is_approved: isStaff,
      ...(isStaff ? { approved_at: new Date().toISOString() } : {}),
      image_urls: JSON.stringify(formData.imageUrls || []),
    })
    .select("*")
    .single();

  if (error) {
    console.error("createAnswer error:", error);
    return { data: null, error: error.message };
  }

  // T5b: 이미지가 있으면 자동 임베딩 (fire-and-forget)
  if (formData.imageUrls && formData.imageUrls.length > 0 && data) {
    // 질문 제목을 별도 조회
    const { data: question } = await svc
      .from("questions")
      .select("title")
      .eq("id", formData.questionId)
      .single();
    const questionTitle = question?.title || "QA 답변";
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

  // 관리자 답변이면 바로 질문 상태 변경 + 알림톡 발송
  if (isStaff && data) {
    await svc
      .from("questions")
      .update({ status: "answered" })
      .eq("id", formData.questionId);

    // fire-and-forget: QA 임베딩
    Promise.resolve(embedQAPair(formData.questionId, data.id))
      .catch(err => console.error("[QAEmbed] Failed:", err));

    // fire-and-forget: 알림톡 발송
    Promise.resolve(
      (async () => {
        const { data: question } = await svc
          .from("questions")
          .select("author_id")
          .eq("id", formData.questionId)
          .single();
        if (!question?.author_id) return;

        const { data: authorProfile } = await svc
          .from("profiles")
          .select("phone")
          .eq("id", question.author_id)
          .single();
        if (!authorProfile?.phone) return;

        await sendKakaoNotification(authorProfile.phone, formData.questionId);
      })()
    ).catch(err => console.error("[KakaoNotify] Failed:", err));
  }

  revalidatePath(`/questions/${formData.questionId}`);
  revalidatePath("/questions");
  revalidatePath("/dashboard");
  revalidatePath("/admin/answers");
  return { data, error: null };
}

export async function getPendingAnswers({
  page = 1,
  pageSize = 20,
}: { page?: number; pageSize?: number } = {}) {
  const db = await requireStaff();
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data, count, error } = await db
    .from("answers")
    .select(
      "*, author:profiles!answers_author_id_fkey(id, name), question:questions!answers_question_id_fkey(id, title, content, image_urls)",
      { count: "exact" }
    )
    .or("is_approved.eq.false,is_approved.is.null")
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("getPendingAnswers error:", error);
    return { data: [], count: 0, error: error.message };
  }

  return { data: data || [], count: count || 0, error: null };
}

export async function approveAnswer(answerId: string) {
  const user = await getCurrentUser();
  if (!user) {
    return { error: "인증되지 않은 사용자입니다." };
  }

  const db = await requireStaff();
  const approverProfileId = toProfileId(user.uid);

  // 답변 조회 (AI 여부 확인)
  const { data: existingAnswer } = await db
    .from("answers")
    .select("is_ai, question_id")
    .eq("id", answerId)
    .single();

  // 답변 승인 — AI 답변이면 author_id를 승인 관리자로 설정
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateData: Record<string, any> = {
    is_approved: true,
    approved_at: new Date().toISOString(),
  };

  if (existingAnswer?.is_ai) {
    updateData.author_id = approverProfileId;
  }

  const { data: answer, error } = await db
    .from("answers")
    .update(updateData)
    .eq("id", answerId)
    .select("question_id")
    .single();

  if (error) {
    console.error("approveAnswer error:", error);
    return { error: error.message };
  }

  // 답변 승인 시 질문 상태를 "answered"로 변경
  if (answer?.question_id) {
    await db
      .from("questions")
      .update({ status: "answered" })
      .eq("id", answer.question_id);

    // fire-and-forget: QA 분리 임베딩 (실패해도 승인은 정상)
    Promise.resolve(embedQAPair(answer.question_id, answerId))
      .catch(err => console.error("[QAEmbed] Failed:", err));

    // 꼬리질문인 경우: 원본 스레드 전체를 하나의 맥락으로 임베딩
    Promise.resolve(
      (async () => {
        const parentId = await getParentQuestionId(answer.question_id);
        if (parentId) {
          // 꼬리질문의 답변 → 원본 질문 스레드 전체 재임베딩
          await embedQAThread(parentId);
        }
      })()
    ).catch(err => console.error("[QAThread] Failed:", err));

    // fire-and-forget: 질문 작성자에게 카카오 알림톡 발송 (질문 URL 포함)
    const svcForPhone = createServiceClient();
    Promise.resolve(
      (async () => {
        const { data: question } = await svcForPhone
          .from("questions")
          .select("author_id")
          .eq("id", answer.question_id)
          .single();
        if (!question?.author_id) return;

        const { data: authorProfile } = await svcForPhone
          .from("profiles")
          .select("phone")
          .eq("id", question.author_id)
          .single();
        if (!authorProfile?.phone) return;

        await sendKakaoNotification(authorProfile.phone, answer.question_id);
      })()
    ).catch(err => console.error("[KakaoNotify] Failed:", err));

    revalidatePath(`/questions/${answer.question_id}`);
  }

  revalidatePath("/admin/answers");
  revalidatePath("/questions");
  revalidatePath("/dashboard");

  // 승인 10개마다 말투 자동 학습 (fire-and-forget)
  try {
    const svc = createServiceClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: latestProfile } = await (svc as any)
      .from("style_profiles")
      .select("created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const sinceDate = latestProfile?.created_at || "1970-01-01T00:00:00Z";

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count } = await (svc as any)
      .from("answers")
      .select("*", { count: "exact", head: true })
      .eq("is_approved", true)
      .gt("updated_at", sinceDate);

    if ((count ?? 0) >= 10) {
      Promise.resolve(runStyleLearning())
        .catch(err => console.error("[StyleAutoLearn] Failed:", err));
    }
  } catch (err) {
    console.error("[StyleAutoLearn] Check failed:", err);
  }

  return { error: null };
}

export async function deleteAnswer(answerId: string) {
  const db = await requireStaff();

  const { error } = await db
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

export async function updateAnswer(answerId: string, content: string, imageUrls?: string[]) {
  const db = await requireStaff();

  const updateData: Record<string, unknown> = { content };
  if (imageUrls !== undefined) {
    updateData.image_urls = JSON.stringify(imageUrls || []);
  }

  const { error } = await db
    .from("answers")
    .update(updateData)
    .eq("id", answerId);

  if (error) {
    console.error("updateAnswer error:", error);
    return { error: error.message };
  }

  revalidatePath("/admin/answers");
  return { error: null };
}

export async function updateAnswerByAuthor(answerId: string, content: string, imageUrls?: string[]) {
  const user = await getCurrentUser();

  if (!user) {
    return { error: "로그인이 필요합니다." };
  }

  const svc = createServiceClient();

  // 답변 조회 (작성자 확인용)
  const { data: answer, error: fetchError } = await svc
    .from("answers")
    .select("author_id, question_id")
    .eq("id", answerId)
    .single();

  if (fetchError || !answer) {
    return { error: "답변을 찾을 수 없습니다." };
  }

  // 권한 확인: 본인 OR staff
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", toProfileId(user.uid))
    .single();

  const isStaff = profile?.role === "admin" || profile?.role === "assistant";
  const isAuthor = answer.author_id === toProfileId(user.uid);

  if (!isAuthor && !isStaff) {
    return { error: "수정 권한이 없습니다." };
  }

  const updateData: Record<string, unknown> = { content, updated_at: new Date().toISOString() };
  if (imageUrls !== undefined) {
    updateData.image_urls = JSON.stringify(imageUrls || []);
  }

  const { error } = await svc
    .from("answers")
    .update(updateData)
    .eq("id", answerId);

  if (error) {
    console.error("updateAnswerByAuthor error:", error);
    return { error: error.message };
  }

  // fire-and-forget: QA 재임베딩 (수정된 내용 반영)
  Promise.resolve(embedQAPair(answer.question_id, answerId))
    .catch(err => console.error("[re-embed] failed:", err));

  revalidatePath(`/questions/${answer.question_id}`);
  revalidatePath("/admin/answers");
  revalidatePath("/questions");
  return { error: null };
}
