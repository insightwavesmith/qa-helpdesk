import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { getPosts } from "@/actions/posts";
import { PostsListClient } from "./posts-list-client";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const category = "notice"; // 공지만 표시
  const search = params.search || "";

  // 관리자 여부 확인
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let isAdmin = false;
  if (user) {
    const svc = createServiceClient();
    const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single();
    isAdmin = profile?.role === "admin";
  }

  const { data: posts, count } = await getPosts({
    page,
    pageSize: 10,
    category: "notice", // 공지만 표시
    search: search || undefined,
  });

  const totalPages = Math.ceil((count || 0) / 10);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[32px] font-bold tracking-tight">정보 공유</h1>
        {isAdmin && (
          <Button asChild size="sm" variant="ghost" className="text-primary hover:text-primary">
            <Link href="/posts/new">
              <Plus className="mr-1 h-4 w-4" />
              글쓰기
            </Link>
          </Button>
        )}
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
          currentSearch={search}
          currentPage={page}
          totalPages={totalPages}
          totalCount={count || 0}
        />
      </Suspense>
    </div>
  );
}
