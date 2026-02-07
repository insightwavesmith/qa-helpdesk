"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { PostCard } from "@/components/posts/post-card";
import { CategoryTabs } from "@/components/posts/category-tabs";
import { NewsletterCta } from "@/components/posts/newsletter-cta";
import { SearchBar } from "@/components/shared/SearchBar";
import { Pagination } from "@/components/shared/Pagination";

interface PostData {
  id: string;
  title: string;
  content: string;
  category: string;
  is_pinned: boolean;
  view_count: number;
  like_count: number;
  created_at: string;
  author?: { id: string; name: string; shop_name?: string } | null;
}

interface PostsRedesignClientProps {
  posts: PostData[];
  pinnedPost: PostData | null;
  currentSearch: string;
  currentCategory: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

export function PostsRedesignClient({
  posts,
  pinnedPost,
  currentSearch,
  currentCategory,
  currentPage,
  totalPages,
  totalCount,
}: PostsRedesignClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value && value !== "all") {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      if ("search" in updates || "category" in updates) {
        params.delete("page");
      }
      router.push(`/posts?${params.toString()}`);
    },
    [router, searchParams]
  );

  // Split posts for CTA insertion (after 6 cards)
  const firstBatch = posts.slice(0, 6);
  const secondBatch = posts.slice(6);

  return (
    <div className="space-y-8">
      {/* Category Tabs */}
      <CategoryTabs
        current={currentCategory}
        onChange={(cat) => updateParams({ category: cat })}
      />

      {/* Search */}
      <SearchBar
        placeholder="게시글 제목 또는 내용으로 검색"
        defaultValue={currentSearch}
        onSearch={(query) => updateParams({ search: query })}
      />

      {/* Best Content */}
      {pinnedPost && !currentSearch && currentPage === 1 && (
        <section>
          <h2 className="text-lg font-bold text-[#1a1a2e] mb-4">베스트 콘텐츠</h2>
          <PostCard post={pinnedPost} featured />
        </section>
      )}

      {/* Results count */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-[#999999]">
          {totalCount}개의 게시글
        </span>
      </div>

      {/* Post Grid */}
      {posts.length === 0 ? (
        <div className="text-center py-16 text-[#666666]">
          <p className="text-base">
            {currentSearch
              ? "검색 결과가 없습니다."
              : "아직 게시글이 없습니다."}
          </p>
          <p className="text-sm mt-1 text-[#999999]">
            {!currentSearch && "첫 번째 글을 작성해보세요!"}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {firstBatch.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>

          {/* Newsletter CTA after 6 cards */}
          {firstBatch.length >= 6 && <NewsletterCta />}

          {secondBatch.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {secondBatch.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Pagination */}
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => updateParams({ page: String(page) })}
      />
    </div>
  );
}
