"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getReviewsAdmin,
  deleteReview,
  togglePinReview,
  createAdminReview,
} from "@/actions/reviews";
import { toast } from "sonner";
import { Pin, Trash2, Loader2, Plus, X, Star, Film } from "lucide-react";

interface Review {
  id: string;
  title: string;
  content: string;
  created_at: string | null;
  cohort: string | null;
  category: string;
  rating: number | null;
  youtube_url: string | null;
  is_pinned: boolean;
  author: { name: string } | null;
}

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

export default function AdminReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchReviews = async () => {
    const result = await getReviewsAdmin();
    if (!result.error) {
      setReviews(result.data as Review[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchReviews();
  }, []);

  const handleTogglePin = async (id: string) => {
    setActionId(id);
    const result = await togglePinReview(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("고정 상태가 변경되었습니다.");
      await fetchReviews();
    }
    setActionId(null);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 후기를 삭제하시겠습니까?")) return;
    setActionId(id);
    const result = await deleteReview(id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success("후기가 삭제되었습니다.");
      await fetchReviews();
    }
    setActionId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#1a1a2e]">수강후기 관리</h1>
        <Button
          size="sm"
          className="bg-[#F75D5D] hover:bg-[#E54949] text-white"
          onClick={() => setShowModal(true)}
        >
          <Plus className="h-4 w-4 mr-1" />
          유튜브 후기 등록
        </Button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="text-left px-4 py-3 font-medium text-gray-500">제목</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">작성자</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">기수</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">카테고리</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">별점</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">날짜</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">고정</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">액션</th>
              </tr>
            </thead>
            <tbody>
              {reviews.map((review) => (
                <tr key={review.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      {!!review.youtube_url && (
                        <Film className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      )}
                      <span className="truncate max-w-[200px]">{review.title}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {review.author?.name || "알 수 없음"}
                  </td>
                  <td className="px-4 py-3">
                    {review.cohort ? (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                        {review.cohort}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {CATEGORY_LABELS[review.category] || review.category}
                  </td>
                  <td className="px-4 py-3">
                    {review.rating ? (
                      <span className="flex items-center gap-0.5">
                        {[1, 2, 3, 4, 5].map((s) => (
                          <Star
                            key={s}
                            className={`h-3 w-3 ${
                              s <= review.rating!
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-200"
                            }`}
                          />
                        ))}
                      </span>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {formatDate(review.created_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTogglePin(review.id)}
                      disabled={actionId === review.id}
                      className={review.is_pinned ? "text-[#F75D5D]" : "text-gray-400"}
                    >
                      {actionId === review.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Pin className={`h-4 w-4 ${review.is_pinned ? "fill-current" : ""}`} />
                      )}
                    </Button>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(review.id)}
                      disabled={actionId === review.id}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      {actionId === review.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </td>
                </tr>
              ))}
              {reviews.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-gray-400">
                    등록된 후기가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <YouTubeReviewModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            fetchReviews();
          }}
        />
      )}
    </div>
  );
}

function YouTubeReviewModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [cohort, setCohort] = useState("");
  const [category, setCategory] = useState("general");
  const [submitting, setSubmitting] = useState(false);

  const isValidYouTubeUrl = (url: string) =>
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/.test(url);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !youtubeUrl.trim()) {
      toast.error("제목과 유튜브 URL을 입력해주세요.");
      return;
    }
    if (!isValidYouTubeUrl(youtubeUrl)) {
      toast.error("유효한 유튜브 URL을 입력해주세요.");
      return;
    }

    setSubmitting(true);
    const result = await createAdminReview({
      title: title.trim(),
      youtubeUrl: youtubeUrl.trim(),
      cohort: cohort || null,
      category,
    });

    if (result.error) {
      toast.error(result.error);
      setSubmitting(false);
      return;
    }

    toast.success("유튜브 후기가 등록되었습니다.");
    onCreated();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">유튜브 후기 등록</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">제목</label>
            <Input
              placeholder="후기 제목"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">유튜브 URL</label>
            <Input
              placeholder="https://www.youtube.com/watch?v=..."
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">기수</label>
            <select
              value={cohort}
              onChange={(e) => setCohort(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
            >
              <option value="">선택 안함</option>
              {["1기", "2기", "3기", "4기", "5기"].map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-gray-700">카테고리</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
            >
              <option value="general">일반후기</option>
              <option value="graduation">졸업후기</option>
              <option value="weekly">주차별 후기</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={onClose}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={submitting}
              className="flex-1 bg-[#F75D5D] hover:bg-[#E54949] text-white"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "등록"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
