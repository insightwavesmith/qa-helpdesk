import { Suspense } from "react";
import { getQuestions, getCategories } from "@/actions/questions";
import { QuestionsListClient } from "./questions-list-client";
import { getCurrentUser } from "@/lib/firebase/auth";
import { createServiceClient } from "@/lib/db";
import { toProfileId } from "@/lib/firebase-uid-to-uuid";

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

  const user = await getCurrentUser();
  const currentUserId = user ? toProfileId(user.uid) : undefined;

  // 역할 조회: student/member/admin만 질문 작성 가능
  let canCreateQuestion = false;

  // 카테고리 필터 없는 경우 (가장 빈번) → auth + categories + getQuestions 3개 병렬
  const needsCategoryLookup = categorySlug && categorySlug !== "all" && tab === "all";

  // categories + profile + (가능하면 questions) 병렬 실행
  const categoriesPromise = getCategories();
  const profilePromise = user
    ? createServiceClient().from("profiles").select("role").eq("id", toProfileId(user.uid)).single()
    : Promise.resolve({ data: null });

  // 카테고리 필터 불필요 시 getQuestions도 즉시 시작
  const earlyQuestionsPromise = !needsCategoryLookup
    ? getQuestions({
        page,
        pageSize: 12,
        categoryId: undefined,
        search: search || undefined,
        status: status !== "all" ? status : undefined,
        tab,
        authorId: tab === "mine" ? currentUserId : undefined,
      })
    : null;

  const [categories, { data: profile }] = await Promise.all([
    categoriesPromise,
    profilePromise,
  ]);

  const userRole = profile?.role || undefined;
  canCreateQuestion = ["student", "member", "admin"].includes(profile?.role || "");

  let questionsResult: Awaited<ReturnType<typeof getQuestions>>;

  if (earlyQuestionsPromise) {
    questionsResult = await earlyQuestionsPromise;
  } else {
    // 카테고리 slug → id 변환 필요
    let categoryId: number | null = null;
    const found = categories.find((c: any) => c.slug === categorySlug); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (found) categoryId = found.id;

    questionsResult = await getQuestions({
      page,
      pageSize: 12,
      categoryId,
      search: search || undefined,
      status: status !== "all" ? status : undefined,
      tab,
      authorId: tab === "mine" ? currentUserId : undefined,
    });
  }

  const { data: questions, count } = questionsResult;

  const totalPages = Math.ceil((count || 0) / 12);

  const categoryTabs = categories.map((c: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
    value: c.slug,
    label: c.name,
  }));

  return (
    <Suspense fallback={<QuestionsLoading />}>
      <QuestionsListClient
        questions={questions.map((q) => ({
          id: q.id,
          title: q.title,
          content: q.content,
          status: q.status ?? "open",
          view_count: q.view_count ?? 0,
          like_count: q.like_count ?? 0,
          created_at: q.created_at ?? "",
          answers_count: "answers_count" in q ? (q as { answers_count?: number }).answers_count : undefined,
          author: q.author,
          category: q.category,
        }))}
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
