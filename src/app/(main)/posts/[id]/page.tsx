import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getPostById, getPosts } from "@/actions/posts";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import PostDetailClient from "./PostDetailClient";

async function checkIsAdmin(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const svc = createServiceClient();
    const { data: profile } = await svc
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    return profile?.role === "admin";
  } catch {
    return false;
  }
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [postResult, isAdmin] = await Promise.all([
    getPostById(id),
    checkIsAdmin(),
  ]);

  if (postResult.error || !postResult.data) {
    notFound();
  }

  const post = postResult.data;

  // 관련 글: 같은 카테고리 글 3개
  const { data: relatedRaw } = await getPosts({
    page: 1,
    pageSize: 4,
    category: post.category,
  });
  const relatedPosts = relatedRaw
    .filter((p: { id: string }) => p.id !== post.id)
    .slice(0, 3);

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Back */}
      <Link
        href="/posts"
        className="inline-flex items-center gap-1.5 text-sm text-[#666666] hover:text-[#F75D5D] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        목록으로 돌아가기
      </Link>

      <Suspense fallback={null}>
        <PostDetailClient
          post={{
            id: post.id,
            title: post.title,
            content: post.content,
            body_md: post.body_md,
            category: post.category,
            thumbnail_url: post.thumbnail_url,
            is_pinned: post.is_pinned ?? false,
            view_count: post.view_count ?? 0,
            status: post.status,
            created_at: post.created_at ?? "",
            author: post.author,
          }}
          relatedPosts={relatedPosts.map((p) => ({
            id: p.id,
            title: p.title,
            content: p.content,
            body_md: p.body_md,
            category: p.category,
            is_pinned: p.is_pinned ?? false,
            view_count: p.view_count ?? 0,
            like_count: 0,
            created_at: p.created_at ?? "",
            author: p.author,
          }))}
          isAdmin={isAdmin}
        />
      </Suspense>
    </div>
  );
}
