import { Suspense } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { getQuestions, getCategories } from "@/actions/questions";
import { QuestionsListClient } from "./questions-list-client";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    category?: string;
    search?: string;
    status?: string;
    tab?: string;
  }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const categorySlug = params.category || "all";
  const search = params.search || "";
  const status = params.status || "all";
  const tab = params.tab || "all";

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  // 역할 조회: student/alumni/admin만 질문 작성 가능
  let canCreateQuestion = false;
  if (user) {
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    canCreateQuestion = ["student", "alumni", "admin"].includes(profile?.role || "");
  }

  const categories = await getCategories();

  let categoryId: number | null = null;
  if (categorySlug && categorySlug !== "all") {
    const found = categories.find((c) => c.slug === categorySlug);
    if (found) categoryId = found.id;
  }

  const { data: questions, count } = await getQuestions({
    page,
    pageSize: 12,
    categoryId: tab === "all" ? categoryId : undefined,
    search: search || undefined,
    status: status !== "all" ? status : undefined,
    tab,
    authorId: tab === "mine" ? currentUserId : undefined,
  });

  const totalPages = Math.ceil((count || 0) / 12);

  const categoryTabs = categories.map((c) => ({
    value: c.slug,
    label: c.name,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 relative">
      <Suspense fallback={<QuestionsLoading />}>
        <QuestionsListClient
          questions={questions}
          categories={categoryTabs}
          currentCategory={categorySlug}
          currentSearch={search}
          currentStatus={status}
          currentPage={page}
          totalPages={totalPages}
          totalCount={count || 0}
          currentTab={tab}
          currentUserId={currentUserId}
        />
      </Suspense>
      
      {/* 플로팅 질문 작성 버튼 (student/alumni/admin만) */}
      {canCreateQuestion && (
        <Link 
          href="/questions/new"
          className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-lg hover:shadow-xl transition-shadow btn-primary flex items-center justify-center z-50"
        >
          <Plus className="w-6 h-6" />
        </Link>
      )}
    </div>
  );
}

function QuestionsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-12 bg-card-bg rounded-xl animate-pulse" />
      <div className="h-10 bg-card-bg rounded-lg animate-pulse w-1/2" />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="h-48 bg-card-bg rounded-xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
