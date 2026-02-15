// Vercel Pro: 최대 60초 함수 실행 허용 (AI 답변 생성)
export const maxDuration = 60;

import { redirect } from "next/navigation";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { getCategories } from "@/actions/questions";
import { NewQuestionForm } from "./new-question-form";

export default async function NewQuestionPage() {
  // 접근제어: student/alumni/admin만 질문 작성 가능
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!["student", "alumni", "admin"].includes(profile?.role || "")) {
    redirect("/questions");
  }

  const categories = await getCategories();

  return <NewQuestionForm categories={categories} />;
}
