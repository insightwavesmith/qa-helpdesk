import { Suspense } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus } from "lucide-react";
import { getPosts } from "@/actions/posts";
import { PostsRedesignClient } from "./posts-redesign-client";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const PAGE_SIZE = 12;

export default async function PostsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; category?: string; search?: string }>;
}) {
  const params = await searchParams;
  const page = parseInt(params.page || "1", 10);
  const category = params.category || "all";
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

  const isTypeFilter = category === "promo";
  const { data: posts, count } = await getPosts({
    page,
    pageSize: PAGE_SIZE,
    category: !isTypeFilter && category !== "all" ? category : undefined,
    type: isTypeFilter ? "promo" : undefined,
    search: search || undefined,
  });

  const totalPages = Math.ceil((count || 0) / PAGE_SIZE);

  // 베스트 콘텐츠: is_pinned 첫 번째 글
  const pinnedPost = posts.find((p: { is_pinned: boolean }) => p.is_pinned) || null;
  const regularPosts = posts.filter((p: { id: string }) => p.id !== pinnedPost?.id);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-8">
      {/* Header */}
      <div>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#1a1a2e]">BS CAMP 정보공유</h1>
          {isAdmin && (
            <Button asChild size="sm" variant="ghost" className="text-[#F75D5D] hover:bg-red-50 hover:text-[#F75D5D]">
              <Link href="/posts/new">
                <Plus className="mr-1 h-4 w-4" />
                글쓰기
              </Link>
            </Button>
          )}
        </div>
        <p className="mt-1 text-sm text-[#666666]">
          자사몰 마케팅에 필요한 인사이트를 공유합니다
        </p>
      </div>

      <Suspense
        fallback={
          <div className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full rounded-lg" />
              ))}
            </div>
          </div>
        }
      >
        <PostsRedesignClient
          posts={regularPosts}
          pinnedPost={pinnedPost}
          currentSearch={search}
          currentCategory={category}
          currentPage={page}
          totalPages={totalPages}
          totalCount={count || 0}
        />
      </Suspense>
    </div>
  );
}
