import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/db";
import { getCategories } from "@/actions/questions";
import { NewQuestionForm } from "./new-question-form";

export default async function NewQuestionPage() {
  // 접근제어: student/member/admin만 질문 작성 가능
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const svc = createServiceClient();
  const { data: profile } = await svc
    .from("profiles")
    .select("role")
    .eq("id", user.uid)
    .single();

  if (!["student", "member", "admin"].includes(profile?.role || "")) {
    redirect("/questions");
  }

  const categories = await getCategories();

  return <NewQuestionForm categories={categories} />;
}
