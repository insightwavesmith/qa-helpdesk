import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { getPosts } from "@/actions/posts";
import { PostsListClient } from "./posts-list-client";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const category = params.category || "all";
  const search = params.search || "";

  const { data: posts, count } = await getPosts({
    page,
    pageSize: 10,
    category: category !== "all" ? category : undefined,
    search: search || undefined,
  });

  const totalPages = Math.ceil((count || 0) / 10);

  const categoryTabs = [
    { value: "info", label: "정보" },
    { value: "notice", label: "공지" },
    { value: "webinar", label: "웨비나" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">정보 공유</h1>
          <p className="text-muted-foreground text-sm mt-1">
            유용한 정보를 공유하고 의견을 나눠보세요.
          </p>
        </div>
        <Button asChild className="rounded-full">
          <Link href="/posts/new">
            <Plus className="mr-1.5 h-4 w-4" />
            글쓰기
          </Link>
        </Button>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        }
      >
        <PostsListClient
          posts={posts}
          categories={categoryTabs}
          currentCategory={category}
          currentSearch={search}
          currentPage={page}
          totalPages={totalPages}
          totalCount={count || 0}
        />
      </Suspense>
    </div>
  );
}
