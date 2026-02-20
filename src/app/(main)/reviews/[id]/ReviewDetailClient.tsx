"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Trash2, Loader2, Eye } from "lucide-react";
import { deleteReview } from "@/actions/reviews";
import { toast } from "sonner";

interface Review {
  id: string;
  title: string;
  content: string;
  image_urls: string[];
  view_count: number;
  created_at: string;
  author: { name: string } | null;
}

interface ReviewDetailClientProps {
  review: Review;
  isAdmin: boolean;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function ReviewDetailClient({ review, isAdmin }: ReviewDetailClientProps) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const handleDelete = async () => {
    if (!confirm("이 후기를 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const result = await deleteReview(review.id);
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success("후기가 삭제되었습니다.");
        router.push("/reviews");
        router.refresh();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-gray-500 hover:text-gray-900"
        >
          <Link href="/reviews">
            <ArrowLeft className="h-4 w-4 mr-1" />
            목록
          </Link>
        </Button>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-600 hover:bg-red-50"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Trash2 className="h-4 w-4 mr-1" />
            )}
            삭제
          </Button>
        )}
      </div>

      {/* Content */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">
          {review.title}
        </h1>
        <div className="flex items-center gap-3 text-sm text-gray-500 mb-6">
          <span>{review.author?.name || "알 수 없음"}</span>
          <span>·</span>
          <span>{formatDate(review.created_at)}</span>
          <span>·</span>
          <span className="flex items-center gap-1">
            <Eye className="h-3.5 w-3.5" />
            {review.view_count}
          </span>
        </div>

        {/* 이미지 */}
        {review.image_urls.length > 0 && (
          <div className="flex flex-wrap gap-3 mb-6">
            {review.image_urls.map((url, idx) => (
              <button
                key={url}
                onClick={() => setLightboxIdx(idx)}
                className="relative w-40 h-40 rounded-lg overflow-hidden border border-gray-200 hover:opacity-90 transition-opacity"
              >
                <Image
                  src={url}
                  alt={`이미지 ${idx + 1}`}
                  fill
                  className="object-cover"
                />
              </button>
            ))}
          </div>
        )}

        {/* 본문 */}
        <div className="prose prose-gray max-w-none whitespace-pre-wrap text-gray-800 leading-relaxed">
          {review.content}
        </div>
      </div>

      {/* Lightbox */}
      {lightboxIdx !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightboxIdx(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full h-full">
            <Image
              src={review.image_urls[lightboxIdx]}
              alt={`이미지 ${lightboxIdx + 1}`}
              fill
              className="object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
