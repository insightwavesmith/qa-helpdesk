import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { getQuestions, getCategories } from "@/actions/questions";
import { QuestionsListClient } from "./questions-list-client";
import { createClient } from "@/lib/supabase/server";

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

  // Get current user for "내 질문" tab
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  const categories = await getCategories();

  let categoryId: number | null = null;
  if (categorySlug && categorySlug !== "all") {
    const found = categories.find((c) => c.slug === categorySlug);
    if (found) categoryId = found.id;
  }

  const { data: questions, count } = await getQuestions({
    page,
    pageSize: 10,
    categoryId: tab === "all" ? categoryId : undefined, // 카테고리 필터는 전체 Q&A에서만
    search: search || undefined,
    status: status !== "all" ? status : undefined,
    tab,
    authorId: tab === "mine" ? currentUserId : undefined,
  });

  const totalPages = Math.ceil((count || 0) / 10);

  const categoryTabs = categories.map((c) => ({
    value: c.slug,
    label: c.name,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold tracking-tight">Q&A</h1>
        <Button asChild size="sm" variant="ghost" className="text-primary hover:text-primary">
          <Link href="/questions/new">
            <Plus className="mr-1 h-4 w-4" />
            새 질문
          </Link>
        </Button>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
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
    </div>
  );
}
