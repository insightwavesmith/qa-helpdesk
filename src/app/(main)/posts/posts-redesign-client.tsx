"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
import { PostCard, categoryConfig } from "@/components/posts/post-card";
import { CategoryTabs } from "@/components/posts/category-tabs";
import { NewsletterCta } from "@/components/posts/newsletter-cta";
import { SearchBar } from "@/components/shared/SearchBar";
import { Pagination } from "@/components/shared/Pagination";
import { ChevronRight } from "lucide-react";

interface PostData {
  id: string;
  title: string;
  content: string;
  body_md?: string;
  category: string;
  thumbnail_url?: string | null;
  type?: string;
  is_pinned: boolean;
  view_count: number;
  like_count: number;
  created_at: string;
  author?: { id: string; name: string; shop_name?: string | null } | null;
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

// 카테고리 섹션 표시 순서: 고객사례 → 교육
const categoryOrder = ["case_study", "education"];

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

  // Group posts by category for section layout
  const postsByCategory = useMemo(() => {
    const grouped: Record<string, PostData[]> = {};
    for (const post of posts) {
      const cat = post.category || "education";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(post);
    }
    return grouped;
  }, [posts]);

  // 최신 3개 (pinned 제외)
  const latestPosts = useMemo(() => {
    return posts
      .filter((p) => !pinnedPost || p.id !== pinnedPost.id)
      .slice(0, 3);
  }, [posts, pinnedPost]);

  // Collect IDs of posts already shown in pinned + latest + category sections
  const shownPostIds = useMemo(() => {
    const ids = new Set<string>();
    if (pinnedPost) ids.add(pinnedPost.id);
    latestPosts.forEach((p) => ids.add(p.id));
    for (const catKey of categoryOrder) {
      const catPosts = postsByCategory[catKey];
      if (catPosts) {
        catPosts.slice(0, 3).forEach((p) => ids.add(p.id));
      }
    }
    return ids;
  }, [pinnedPost, latestPosts, postsByCategory]);

  const remainingPosts = useMemo(
    () => posts.filter((p) => !shownPostIds.has(p.id)),
    [posts, shownPostIds]
  );

  const isSearchMode = !!currentSearch;
  const isCategoryFiltered = currentCategory !== "all";

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

      {/* Search mode: flat grid layout */}
      {isSearchMode ? (
        <>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-400">
              검색 결과 {totalCount}개
            </span>
          </div>
          {posts.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p className="text-base">검색 결과가 없습니다.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          )}
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={(page) => updateParams({ page: String(page) })}
          />
        </>
      ) : (
        <>
          {/* Hero: pinned post (베스트 콘텐츠) */}
          {pinnedPost && currentPage === 1 && !isCategoryFiltered && (
            <section className="py-4">
              <h2 className="text-lg font-bold text-[#1a1a2e] mb-4">베스트 콘텐츠</h2>
              <PostCard post={pinnedPost} featured />
            </section>
          )}

          {/* Category-filtered mode: simple grid */}
          {isCategoryFiltered ? (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">
                  {totalCount}개의 게시글
                </span>
              </div>
              {posts.length === 0 ? (
                <div className="text-center py-16 text-gray-500">
                  <p className="text-base">아직 게시글이 없습니다.</p>
                  <p className="text-sm mt-1 text-gray-400">새로운 콘텐츠가 곧 업데이트됩니다.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                  {posts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              )}
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => updateParams({ page: String(page) })}
              />
            </>
          ) : (
            <>
              {/* 최신 콘텐츠 3개 */}
              {latestPosts.length > 0 && currentPage === 1 && (
                <section className="py-4">
                  <h2 className="text-lg font-bold text-[#1a1a2e] mb-4">최신 콘텐츠</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {latestPosts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                </section>
              )}

              {/* 카테고리별 섹션: 고객사례 → 교육 → 소식 */}
              {categoryOrder.map((catKey) => {
                const catPosts = postsByCategory[catKey];
                if (!catPosts || catPosts.length === 0) return null;
                const catLabel = categoryConfig[catKey]?.label || catKey;
                const displayPosts = catPosts.slice(0, 3);
                return (
                  <section key={catKey} className="py-8">
                    <div className="flex items-center justify-between mb-5">
                      <h2 className="text-lg font-bold text-[#1a1a2e]">{catLabel}</h2>
                      <button
                        onClick={() => updateParams({ category: catKey })}
                        className="flex items-center gap-0.5 text-sm text-gray-500 hover:text-[#F75D5D] transition-colors"
                      >
                        더 살펴보기
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                      {displayPosts.map((post) => (
                        <PostCard key={post.id} post={post} />
                      ))}
                    </div>
                  </section>
                );
              })}

              {/* 최신정보 CTA */}
              <NewsletterCta />

              {/* 나머지 게시글 */}
              {remainingPosts.length > 0 && (
                <section className="py-8">
                  <h2 className="text-lg font-bold text-[#1a1a2e] mb-5">더 많은 콘텐츠</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                    {remainingPosts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                  <div className="mt-6">
                    <Pagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      onPageChange={(page) => updateParams({ page: String(page) })}
                    />
                  </div>
                </section>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
