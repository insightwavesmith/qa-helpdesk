"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Search, Plus, MessageSquare } from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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
  canCreateQuestion?: boolean;
  userRole?: string;
}

const categoryColorMap: Record<string, string> = {
  "메타 광고 기초": "bg-blue-50 text-blue-700 border-blue-200",
  "광고 성과 개선": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "광고 계정 문제": "bg-amber-50 text-amber-700 border-amber-200",
  "픽셀·CAPI": "bg-violet-50 text-violet-700 border-violet-200",
  "자사몰 운영": "bg-rose-50 text-rose-700 border-rose-200",
  "크리에이티브": "bg-cyan-50 text-cyan-700 border-cyan-200",
  "기타": "bg-slate-50 text-slate-600 border-slate-200",
};

function getCategoryColor(name: string): string {
  return categoryColorMap[name] || "bg-slate-50 text-slate-600 border-slate-200";
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, "-").replace(".", "");
}

export function QuestionsListClient({
  questions,
  currentSearch,
  currentPage,
  totalPages,
  totalCount,
  currentTab,
  canCreateQuestion,
  userRole,
}: QuestionsListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentSearch);
  const [memberDialogOpen, setMemberDialogOpen] = useState(false);

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

  const handleTabChange = (value: string) => {
    updateParams({ tab: value });
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-5 mb-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-foreground">질문 게시판</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Meta 광고에 대해 궁금한 점을 질문하고 답변을 받아보세요
            </p>
          </div>
          {canCreateQuestion ? (
            <Button asChild className="gap-1.5">
              <Link href="/questions/new">
                <Plus className="h-4 w-4" />
                새 질문
              </Link>
            </Button>
          ) : userRole === "member" ? (
            <>
              <Button className="gap-1.5" onClick={() => setMemberDialogOpen(true)}>
                <Plus className="h-4 w-4" />
                새 질문
              </Button>
              <Dialog open={memberDialogOpen} onOpenChange={setMemberDialogOpen}>
                <DialogContent className="sm:max-w-[400px]">
                  <DialogHeader>
                    <DialogTitle>수강생 전용 기능</DialogTitle>
                  </DialogHeader>
                  <p className="text-sm text-gray-600 mt-2">
                    수강생만 질문이 가능합니다.
                  </p>
                  <div className="mt-4 flex justify-end">
                    <Button asChild className="bg-[#F75D5D] hover:bg-[#E54949]">
                      <a href="https://bscamp.co.kr" target="_blank" rel="noopener noreferrer">
                        수강 안내 보기
                      </a>
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </>
          ) : null}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="질문 검색..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-9 h-10 bg-card border"
          />
        </form>

        {/* Tabs */}
        <Tabs
          value={currentTab || "all"}
          onValueChange={handleTabChange}
        >
          <TabsList className="bg-muted h-9">
            <TabsTrigger value="all" className="text-sm">전체</TabsTrigger>
            <TabsTrigger value="mine" className="text-sm">내 질문</TabsTrigger>
            <TabsTrigger value="answered" className="text-sm">답변완료</TabsTrigger>
            <TabsTrigger value="pending" className="text-sm">답변대기</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Question Cards */}
      {questions.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground">검색 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {questions.map((question) => (
            <Link
              key={question.id}
              href={`/questions/${question.id}`}
              className="block group"
            >
              <article className="rounded-lg border bg-card p-5 transition-all group-hover:border-primary/30 group-hover:shadow-sm">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Category + Status Badges */}
                    <div className="flex items-center gap-2 mb-2">
                      {question.category && (
                        <Badge
                          variant="outline"
                          className={`text-xs font-medium ${getCategoryColor(question.category.name)}`}
                        >
                          {question.category.name}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-xs font-medium ${
                          question.status === "answered"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}
                      >
                        {question.status === "answered" ? "답변완료" : "답변대기"}
                      </Badge>
                    </div>

                    {/* Title */}
                    <h3 className="text-base font-semibold text-card-foreground leading-snug mb-3 line-clamp-2 group-hover:text-primary transition-colors">
                      {question.title}
                    </h3>

                    {/* Author + Date */}
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <span className="relative flex shrink-0 overflow-hidden rounded-full h-6 w-6">
                          <span className="flex h-full w-full items-center justify-center rounded-full text-[10px] font-medium bg-muted text-muted-foreground">
                            {question.author?.name?.charAt(0) || "?"}
                          </span>
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {question.author?.name || "익명"}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground/60">
                        {formatDate(question.created_at)}
                      </span>
                    </div>
                  </div>

                  {/* Answer Count */}
                  <div className="flex flex-col items-center shrink-0 pt-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <MessageSquare className="h-4 w-4" />
                      <span className="text-sm font-medium">
                        {question.answers_count || 0}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 mt-0.5">
                      답변
                    </span>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}

      {/* Total Count */}
      <div className="mt-6 text-center">
        <p className="text-xs text-muted-foreground">총 {totalCount}개의 질문</p>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-4">
          <nav className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateParams({ page: String(Math.max(1, currentPage - 1)) })}
              disabled={currentPage <= 1}
            >
              &larr;
            </Button>
            {[...Array(Math.min(5, totalPages))].map((_, i) => {
              const pageNum = i + 1;
              return (
                <Button
                  key={pageNum}
                  variant={currentPage === pageNum ? "default" : "ghost"}
                  size="sm"
                  onClick={() => updateParams({ page: String(pageNum) })}
                >
                  {pageNum}
                </Button>
              );
            })}
            {totalPages > 5 && (
              <>
                <span className="px-2 text-muted-foreground">...</span>
                <Button
                  variant={currentPage === totalPages ? "default" : "ghost"}
                  size="sm"
                  onClick={() => updateParams({ page: String(totalPages) })}
                >
                  {totalPages}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => updateParams({ page: String(Math.min(totalPages, currentPage + 1)) })}
              disabled={currentPage >= totalPages}
            >
              &rarr;
            </Button>
          </nav>
        </div>
      )}
    </div>
  );
}
