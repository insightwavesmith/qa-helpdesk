"use client";

import { useRouter } from "next/navigation";
import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ImagePlus, X, Loader2, Star } from "lucide-react";
import { createReview } from "@/actions/reviews";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";
import Link from "next/link";
import Image from "next/image";

const MAX_IMAGES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const COHORT_OPTIONS = ["선택 안함", "1기", "2기", "3기", "4기", "5기"];
const CATEGORY_OPTIONS = [
  { value: "general", label: "일반후기" },
  { value: "graduation", label: "졸업후기" },
  { value: "weekly", label: "주차별 후기" },
] as const;

interface ImagePreview {
  file: File;
  url: string;
}

export function NewReviewForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [uploading, setUploading] = useState(false);
  const [cohort, setCohort] = useState("");
  const [category, setCategory] = useState("general");
  const [rating, setRating] = useState<number | null>(null);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_IMAGES - images.length;
    const selected = files.slice(0, remaining);

    for (const file of selected) {
      if (file.size > MAX_FILE_SIZE) {
        toast.error(`${file.name}: 5MB 이하의 파일만 업로드 가능합니다.`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: 이미지 파일만 업로드 가능합니다.`);
        continue;
      }
      setImages((prev) => [
        ...prev,
        { file, url: URL.createObjectURL(file) },
      ]);
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.url);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadImages = async (): Promise<string[]> => {
    const supabase = createClient();
    const urls: string[] = [];

    for (const img of images) {
      const ext = img.file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `reviews/${fileName}`;

      const { error } = await supabase.storage
        .from("review-images")
        .upload(filePath, img.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("Image upload error:", error);
        throw new Error(`이미지 업로드 실패: ${img.file.name}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("review-images").getPublicUrl(filePath);

      urls.push(publicUrl);
    }

    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !content.trim()) {
      toast.error("제목과 내용을 입력해주세요.");
      return;
    }

    try {
      setUploading(true);

      let imageUrls: string[] = [];
      if (images.length > 0) {
        imageUrls = await uploadImages();
      }

      const result = await createReview({
        title: title.trim(),
        content: content.trim(),
        imageUrls,
        cohort: cohort || null,
        category,
        rating,
      });

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success("후기가 작성되었습니다.");
      router.push("/reviews");
      router.refresh();
    } catch (err) {
      console.error("Submit error:", err);
      toast.error("후기 작성 중 오류가 발생했습니다.");
    } finally {
      setUploading(false);
    }
  };

  const displayRating = hoverRating ?? rating ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
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
        <h1 className="text-xl font-bold text-gray-900">수강후기 작성</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <label
            htmlFor="review-title"
            className="block text-sm font-medium text-gray-700"
          >
            제목
          </label>
          <Input
            id="review-title"
            placeholder="후기 제목을 입력하세요"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
            required
          />
        </div>

        {/* 기수 선택 */}
        <div className="space-y-2">
          <label
            htmlFor="review-cohort"
            className="block text-sm font-medium text-gray-700"
          >
            기수
          </label>
          <select
            id="review-cohort"
            value={cohort}
            onChange={(e) => setCohort(e.target.value)}
            className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#F75D5D]/30 focus:border-[#F75D5D]"
          >
            <option value="">선택 안함</option>
            {COHORT_OPTIONS.filter((o) => o !== "선택 안함").map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>

        {/* 카테고리 선택 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            카테고리
          </label>
          <div className="flex gap-3">
            {CATEGORY_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 cursor-pointer rounded-lg border px-4 py-2.5 text-sm transition-colors ${
                  category === opt.value
                    ? "border-[#F75D5D] bg-red-50 text-[#F75D5D]"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="category"
                  value={opt.value}
                  checked={category === opt.value}
                  onChange={(e) => setCategory(e.target.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {/* 별점 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            별점 <span className="text-gray-400 font-normal">(선택사항)</span>
          </label>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star === rating ? null : star)}
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(null)}
                className="p-0.5 transition-transform hover:scale-110"
              >
                <Star
                  className={`h-6 w-6 ${
                    star <= displayRating
                      ? "fill-yellow-400 text-yellow-400"
                      : "text-gray-300"
                  }`}
                />
              </button>
            ))}
            {rating && (
              <span className="ml-2 text-sm text-gray-500">{rating}점</span>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="review-content"
            className="block text-sm font-medium text-gray-700"
          >
            내용
          </label>
          <Textarea
            id="review-content"
            placeholder="수강 경험을 자유롭게 작성해주세요"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            rows={10}
            maxLength={5000}
            required
          />
        </div>

        {/* 이미지 업로드 */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-gray-700">
            이미지 (최대 {MAX_IMAGES}장)
          </label>
          <div className="flex flex-wrap gap-3">
            {images.map((img, index) => (
              <div
                key={img.url}
                className="relative w-24 h-24 rounded-lg overflow-hidden border border-gray-200"
              >
                <Image
                  src={img.url}
                  alt={`이미지 ${index + 1}`}
                  fill
                  className="object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeImage(index)}
                  className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {images.length < MAX_IMAGES && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-[#F75D5D] hover:text-[#F75D5D] transition-colors"
              >
                <ImagePlus className="h-6 w-6 mb-1" />
                <span className="text-xs">추가</span>
              </button>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageSelect}
            className="hidden"
          />
        </div>

        <Button
          type="submit"
          disabled={uploading || !title.trim() || !content.trim()}
          className="w-full bg-[#F75D5D] hover:bg-[#E54949] text-white"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              작성 중...
            </>
          ) : (
            "후기 등록"
          )}
        </Button>
      </form>
    </div>
  );
}
