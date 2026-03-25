import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/supabase/server";
import { getQuestionById, getCategories } from "@/actions/questions";
import { NewQuestionForm } from "../../new/new-question-form";

export default async function EditQuestionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // 인증 체크
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // 질문 로드
  const { data: question, error } = await getQuestionById(id);
  if (error || !question) notFound();

  // 권한 체크: 본인 또는 admin/assistant
  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  const isStaff =
    profile?.role === "admin" || profile?.role === "assistant";
  const isOwner = question.author?.id === user.uid;

  if (!isStaff && !isOwner) {
    redirect(`/questions/${id}`);
  }

  const categories = await getCategories();

  return (
    <NewQuestionForm
      categories={categories}
      mode="edit"
      initialData={{
        id: question.id,
        title: question.title,
        content: question.content,
        categoryId: question.category?.id ? String(question.category.id) : "",
        imageUrls: Array.isArray(question.image_urls)
          ? (question.image_urls as string[])
          : [],
      }}
    />
  );
}
