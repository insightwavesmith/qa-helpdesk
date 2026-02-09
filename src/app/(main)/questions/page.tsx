import { Suspense } from "react";
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
  let userRole: string | undefined;
  if (user) {
    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();
    userRole = profile?.role || undefined;
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
        canCreateQuestion={canCreateQuestion}
        userRole={userRole}
      />
    </Suspense>
  );
}

function QuestionsLoading() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-32 bg-muted rounded animate-pulse" />
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        </div>
        <div className="h-10 w-24 bg-muted rounded-md animate-pulse" />
      </div>
      <div className="h-10 bg-muted rounded-md animate-pulse" />
      <div className="h-9 w-80 bg-muted rounded-md animate-pulse" />
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-28 bg-muted rounded-lg animate-pulse" />
        ))}
      </div>
    </div>
  );
}
