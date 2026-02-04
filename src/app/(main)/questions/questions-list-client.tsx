"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { SearchBar } from "@/components/shared/SearchBar";
import { CategoryFilter } from "@/components/shared/CategoryFilter";
import { Pagination } from "@/components/shared/Pagination";
import { Badge } from "@/components/ui/badge";

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
}

const statusFilters = [
  { value: "all", label: "전체" },
  { value: "open", label: "미답변" },
  { value: "answered", label: "답변완료" },
];

export function QuestionsListClient({
  questions,
  categories,
  currentCategory,
  currentSearch,
  currentStatus,
  currentPage,
  totalPages,
  totalCount,
}: QuestionsListClientProps) {
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
      // Reset page when category/search/status changes
      if (
        "category" in updates ||
        "search" in updates ||
        "status" in updates
      ) {
        params.delete("page");
      }
      router.push(`/questions?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <SearchBar
        placeholder="질문 제목 또는 내용으로 검색"
        defaultValue={currentSearch}
        onSearch={(query) => updateParams({ search: query })}
      />

      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        currentValue={currentCategory}
        onChange={(value) =>
          updateParams({ category: value === "all" ? "" : value })
        }
      />

      {/* Status filter pills */}
      <div className="flex items-center gap-2">
        {statusFilters.map((sf) => (
          <button
            key={sf.value}
            onClick={() =>
              updateParams({ status: sf.value === "all" ? "" : sf.value })
            }
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              currentStatus === sf.value ||
              (sf.value === "all" && !currentStatus) ||
              (sf.value === "all" && currentStatus === "all")
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:bg-accent"
            }`}
          >
            {sf.label}
          </button>
        ))}
        <span className="text-xs text-muted-foreground ml-auto">
          {totalCount}개
        </span>
      </div>

      {/* Question List */}
      {questions.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-base">
            {currentSearch
              ? "검색 결과가 없습니다."
              : "아직 질문이 없습니다."}
          </p>
          <p className="text-sm mt-1 opacity-70">
            {!currentSearch && "첫 번째 질문을 올려보세요!"}
          </p>
        </div>
      ) : (
        <div>
          {questions.map((question) => (
            <QuestionCard key={question.id} question={question} />
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
