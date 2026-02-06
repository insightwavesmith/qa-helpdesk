"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";

interface QuestionsListClientProps {
  questions: Array<{
    id: string;
    title: string;
    content: string;
    status: string;
    view_count: number;
    like_count: number;
    created_at: string;
    answers_count?: number;
    author?: { id: string; name: string; shop_name?: string } | null;
    category?: { id: number; name: string; slug: string } | null;
  }>;
  categories: { value: string; label: string }[];
  currentCategory: string;
  currentSearch: string;
  currentStatus: string;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  currentTab: string;
  currentUserId?: string;
}

function timeAgo(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString("ko-KR");
}

function getAvatarColor(name?: string): string {
  const colors = ["bg-blue-500", "bg-green-500", "bg-purple-500", "bg-indigo-500", "bg-pink-500"];
  if (!name) return "bg-gray-500";
  const index = name.charCodeAt(0) % colors.length;
  return colors[index];
}

export function QuestionsListClient({
  questions,
  categories,
  currentCategory,
  currentSearch,
  currentStatus,
  currentPage,
  totalPages,
  totalCount,
  currentTab,
}: QuestionsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentSearch);

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
      if ("category" in updates || "search" in updates || "tab" in updates) {
        params.delete("page");
      }
      router.push(`/questions?${params.toString()}`);
    },
    [router, searchParams]
  );

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    updateParams({ search: searchInput });
  };

  return (
    <div className="space-y-8">
      {/* 검색바 */}
      <form onSubmit={handleSearch} className="max-w-2xl">
        <div className="relative search-focus rounded-xl">
          <input
            type="text"
            placeholder="질문 검색하기..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full px-6 py-3 text-lg border border-border-color rounded-xl focus:outline-none transition-shadow bg-card-bg text-text-main"
          />
          <button type="submit" className="absolute right-4 top-1/2 transform -translate-y-1/2 text-primary">
            <Search className="w-6 h-6" />
          </button>
        </div>
      </form>

      {/* 탭 네비게이션 */}
      <div className="border-b border-border-color">
        <nav className="flex space-x-8">
          <button
            onClick={() => updateParams({ tab: "all" })}
            className={`py-3 px-1 border-b-2 font-medium transition-colors ${
              currentTab === "all" || !currentTab
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-primary hover:border-border-color"
            }`}
          >
            전체 질문
          </button>
          <button
            onClick={() => updateParams({ tab: "mine" })}
            className={`py-3 px-1 border-b-2 font-medium transition-colors ${
              currentTab === "mine"
                ? "border-primary text-primary"
                : "border-transparent text-text-secondary hover:text-primary hover:border-border-color"
            }`}
          >
            내 질문
          </button>
        </nav>
      </div>

      {/* 카테고리 필터 */}
      <div>
        <p className="text-sm font-medium text-text-secondary mb-3">카테고리</p>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => updateParams({ category: "all" })}
            className={`tag-chip px-4 py-2 text-sm font-medium rounded-full transition-colors ${
              currentCategory === "all" || !currentCategory
                ? "bg-primary text-white"
                : "bg-muted text-muted-foreground hover:bg-primary hover:text-white"
            }`}
          >
            전체
          </button>
          {categories.map((cat) => (
            <button
              key={cat.value}
              onClick={() => updateParams({ category: cat.value })}
              className={`tag-chip px-4 py-2 text-sm font-medium rounded-full transition-colors ${
                currentCategory === cat.value
                  ? "bg-primary text-white"
                  : "bg-primary/10 text-primary hover:bg-primary hover:text-white"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </div>

      {/* 결과 카운트 */}
      <p className="text-sm text-text-secondary">
        총 {totalCount}개의 질문
      </p>

      {/* Q&A 카드 그리드 */}
      {questions.length === 0 ? (
        <div className="bg-card-bg rounded-xl border border-border-color p-12 text-center">
          <p className="text-text-secondary">검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {questions.map((question) => (
            <Link key={question.id} href={`/questions/${question.id}`}>
              <article className="bg-card-bg rounded-xl border border-border-color p-6 card-hover fade-in h-full">
                <h3 className="font-bold text-lg mb-3 line-clamp-2 text-text-main">
                  {question.title}
                </h3>
                <p className="text-text-secondary text-sm mb-4 line-clamp-3">
                  {question.content}
                </p>
                
                {question.category && (
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-3 py-1 bg-primary/10 text-primary text-xs font-medium rounded-full">
                      {question.category.name}
                    </span>
                  </div>
                )}
                
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center space-x-2">
                    <div className={`w-6 h-6 ${getAvatarColor(question.author?.name)} rounded-full flex items-center justify-center`}>
                      <span className="text-white text-xs font-medium">
                        {question.author?.name?.charAt(0) || "?"}
                      </span>
                    </div>
                    <span className="text-text-secondary">{question.author?.name || "익명"}</span>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                      question.status === "answered" 
                        ? "bg-success text-white" 
                        : "bg-warning text-white"
                    }`}>
                      {question.status === "answered" ? "답변완료" : "답변대기"}
                    </span>
                    <span className="text-text-muted">{timeAgo(question.created_at)}</span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}

      {/* 페이지네이션 */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <nav className="flex space-x-2">
            <button
              onClick={() => updateParams({ page: String(Math.max(1, currentPage - 1)) })}
              disabled={currentPage <= 1}
              className="px-3 py-2 text-text-secondary hover:text-primary disabled:opacity-50"
            >
              ←
            </button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pageNum = i + 1;
              return (
                <button
                  key={pageNum}
                  onClick={() => updateParams({ page: String(pageNum) })}
                  className={`px-3 py-2 rounded-lg ${
                    currentPage === pageNum
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:text-primary hover:bg-bg-soft"
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            {totalPages > 5 && (
              <>
                <span className="px-3 py-2 text-text-muted">...</span>
                <button
                  onClick={() => updateParams({ page: String(totalPages) })}
                  className={`px-3 py-2 rounded-lg ${
                    currentPage === totalPages
                      ? "bg-primary text-white"
                      : "text-text-secondary hover:text-primary hover:bg-bg-soft"
                  }`}
                >
                  {totalPages}
                </button>
              </>
            )}
            <button
              onClick={() => updateParams({ page: String(Math.min(totalPages, currentPage + 1)) })}
              disabled={currentPage >= totalPages}
              className="px-3 py-2 text-text-secondary hover:text-primary disabled:opacity-50"
            >
              →
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}
