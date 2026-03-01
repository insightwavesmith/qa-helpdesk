"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Pagination } from "@/components/shared/Pagination";
import { MessageSquare, Eye, Pin, Star, Film } from "lucide-react";

interface Review {
  id: string;
  title: string;
  content: string;
  image_urls: string[];
  view_count: number;
  created_at: string;
  author: { name: string } | null;
  cohort?: string | null;
  category?: string;
  rating?: number | null;
  youtube_url?: string | null;
  is_pinned?: boolean;
}

interface ReviewListClientProps {
  reviews: Review[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

const COHORT_FILTER_OPTIONS = ["전체", "1기", "2기", "3기", "4기", "5기"];
const CATEGORY_FILTER_OPTIONS = [
  { value: "", label: "전체" },
  { value: "general", label: "일반후기" },
  { value: "graduation", label: "졸업후기" },
  { value: "weekly", label: "주차별 후기" },
];
const SORT_OPTIONS = [
  { value: "latest", label: "최신순" },
  { value: "rating", label: "별점 높은순" },
];

const CATEGORY_LABELS: Record<string, string> = {
  general: "일반",
  graduation: "졸업",
  weekly: "주차별",
};

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          className={`h-3 w-3 ${
            star <= rating
              ? "fill-yellow-400 text-yellow-400"
              : "text-gray-200"
          }`}
        />
      ))}
    </span>
  );
}

export function ReviewListClient({
  reviews,
  currentPage,
  totalPages,
  totalCount,
}: ReviewListClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const currentCohort = searchParams.get("cohort") || "";
  const currentCategory = searchParams.get("category") || "";
  const currentSort = searchParams.get("sortBy") || "latest";

  const updateFilter = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.delete("page");
    router.push(`/reviews${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page > 1) {
      params.set("page", String(page));
    } else {
      params.delete("page");
    }
    router.push(`/reviews${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <div className="space-y-6">
      {/* 필터 바 */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={currentCohort}
          onChange={(e) => updateFilter("cohort", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
        >
          {COHORT_FILTER_OPTIONS.map((opt) => (
            <option key={opt} value={opt === "전체" ? "" : opt}>
              {opt === "전체" ? "기수 전체" : opt}
            </option>
          ))}
        </select>

        <select
          value={currentCategory}
          onChange={(e) => updateFilter("category", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
        >
          {CATEGORY_FILTER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.value === "" ? "카테고리 전체" : opt.label}
            </option>
          ))}
        </select>

        <select
          value={currentSort}
          onChange={(e) => updateFilter("sortBy", e.target.value)}
          className="rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <span className="text-sm text-gray-500 ml-auto">
          총 {totalCount}개의 후기
        </span>
      </div>

      {reviews.length === 0 ? (
        <div className="text-center py-16">
          <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
            <MessageSquare className="h-8 w-8 text-gray-300" />
          </div>
          <p className="text-gray-500">해당 조건의 후기가 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {reviews.map((review) => (
              <Link
                key={review.id}
                href={`/reviews/${review.id}`}
                className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow"
              >
                {review.image_urls.length > 0 && (
                  <div className="relative w-full h-48 bg-gray-100">
                    <Image
                      src={review.image_urls[0]}
                      alt={review.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform"
                    />
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {review.is_pinned && (
                      <span className="inline-flex items-center gap-0.5 rounded bg-[#F75D5D]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#F75D5D]">
                        <Pin className="h-2.5 w-2.5" />
                        고정
                      </span>
                    )}
                    {review.cohort && (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600">
                        {review.cohort}
                      </span>
                    )}
                    {review.category && review.category !== "general" && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                        {CATEGORY_LABELS[review.category] || review.category}
                      </span>
                    )}
                    {!!review.youtube_url && (
                      <Film className="h-3.5 w-3.5 text-red-500" />
                    )}
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-[#F75D5D] transition-colors">
                    {truncate(review.title, 40)}
                  </h3>
                  {!!review.rating && (
                    <div className="mb-1.5">
                      <StarRating rating={review.rating} />
                    </div>
                  )}
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {truncate(review.content, 80)}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <span>{review.author?.name || "알 수 없음"}</span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {review.view_count}
                      </span>
                      <span>{formatDate(review.created_at)}</span>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={handlePageChange}
          />
        </>
      )}
    </div>
  );
}
