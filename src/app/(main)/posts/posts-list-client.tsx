"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { PostCard } from "@/components/posts/PostCard";
import { SearchBar } from "@/components/shared/SearchBar";
import { CategoryFilter } from "@/components/shared/CategoryFilter";
import { Pagination } from "@/components/shared/Pagination";

interface PostsListClientProps {
  posts: Array<{
    id: string;
    title: string;
    content: string;
    category: string;
    is_pinned: boolean;
    view_count: number;
    like_count: number;
    created_at: string;
    author?: { id: string; name: string; shop_name?: string } | null;
  }>;
  categories: { value: string; label: string }[];
  currentCategory: string;
  currentSearch: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

export function PostsListClient({
  posts,
  categories,
  currentCategory,
  currentSearch,
  currentPage,
  totalPages,
  totalCount,
}: PostsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(updates).forEach(([key, value]) => {
        if (value) {
          params.set(key, value);
        } else {
          params.delete(key);
        }
      });
      if ("category" in updates || "search" in updates) {
        params.delete("page");
      }
      router.push(`/posts?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="space-y-4">
      {/* Search */}
      <SearchBar
        placeholder="게시글 제목 또는 내용으로 검색"
        defaultValue={currentSearch}
        onSearch={(query) => updateParams({ search: query })}
      />

      {/* Category filter */}
      <CategoryFilter
        categories={categories}
        currentValue={currentCategory}
        onChange={(value) =>
          updateParams({ category: value === "all" ? "" : value })
        }
      />

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {totalCount}개의 게시글
        </span>
      </div>

      {/* Post List */}
      {posts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-base">
            {currentSearch
              ? "검색 결과가 없습니다."
              : "아직 게시글이 없습니다."}
          </p>
          <p className="text-sm mt-1 opacity-70">
            {!currentSearch && "첫 번째 글을 작성해보세요!"}
          </p>
        </div>
      ) : (
        <div>
          {posts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
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
