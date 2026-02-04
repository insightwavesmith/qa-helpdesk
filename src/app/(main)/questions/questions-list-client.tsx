"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { QuestionCard } from "@/components/questions/QuestionCard";
import { SearchBar } from "@/components/shared/SearchBar";
import { CategoryFilter } from "@/components/shared/CategoryFilter";
import { Pagination } from "@/components/shared/Pagination";

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
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

export function QuestionsListClient({
  questions,
  categories,
  currentCategory,
  currentSearch,
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
      // Reset page when category or search changes
      if ("category" in updates || "search" in updates) {
        params.delete("page");
      }
      router.push(`/questions?${params.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="space-y-4">
      {/* Category Filter */}
      <CategoryFilter
        categories={categories}
        currentValue={currentCategory}
        onChange={(value) => updateParams({ category: value === "all" ? "" : value })}
      />

      {/* Search Bar */}
      <SearchBar
        placeholder="질문 제목 또는 내용으로 검색"
        defaultValue={currentSearch}
        onSearch={(query) => updateParams({ search: query })}
      />

      {/* Results count */}
      <p className="text-sm text-muted-foreground">
        총 {totalCount}개의 질문
      </p>

      {/* Question List */}
      {questions.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          {currentSearch
            ? "검색 결과가 없습니다."
            : "아직 질문이 없습니다. 첫 번째 질문을 올려보세요!"}
        </div>
      ) : (
        <div className="space-y-3">
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
