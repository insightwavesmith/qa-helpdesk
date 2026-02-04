import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { getQuestions, getCategories } from "@/actions/questions";
import { QuestionsListClient } from "./questions-list-client";

export default async function QuestionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    category?: string;
    search?: string;
    status?: string;
  }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const categorySlug = params.category || "all";
  const search = params.search || "";
  const status = params.status || "all";

  const categories = await getCategories();

  let categoryId: number | null = null;
  if (categorySlug && categorySlug !== "all") {
    const found = categories.find((c) => c.slug === categorySlug);
    if (found) categoryId = found.id;
  }

  const { data: questions, count } = await getQuestions({
    page,
    pageSize: 10,
    categoryId,
    search: search || undefined,
    status: status !== "all" ? status : undefined,
  });

  const totalPages = Math.ceil((count || 0) / 10);

  const categoryTabs = categories.map((c) => ({
    value: c.slug,
    label: c.name,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Q&A</h1>
          <p className="text-muted-foreground text-sm mt-1">
            질문을 올리고 답변을 받아보세요.
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link href="/questions/new">
            <Plus className="mr-1.5 h-4 w-4" />
            질문하기
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
        />
      </Suspense>
    </div>
  );
}
