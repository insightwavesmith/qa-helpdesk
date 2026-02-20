"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Pagination } from "@/components/shared/Pagination";
import { MessageSquare, Eye } from "lucide-react";

interface Review {
  id: string;
  title: string;
  content: string;
  image_urls: string[];
  view_count: number;
  created_at: string;
  author: { name: string } | null;
}

interface ReviewListClientProps {
  reviews: Review[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function truncate(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + "...";
}

export function ReviewListClient({
  reviews,
  currentPage,
  totalPages,
  totalCount,
}: ReviewListClientProps) {
  const router = useRouter();

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    router.push(`/reviews${params.toString() ? `?${params.toString()}` : ""}`);
  };

  if (reviews.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-4">
          <MessageSquare className="h-8 w-8 text-gray-300" />
        </div>
        <p className="text-gray-500">아직 작성된 후기가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500">총 {totalCount}개의 후기</p>

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
              <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-[#F75D5D] transition-colors">
                {truncate(review.title, 40)}
              </h3>
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
    </div>
  );
}
