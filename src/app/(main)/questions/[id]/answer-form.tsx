"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send, ImagePlus, X, Loader2 } from "lucide-react";
import { createAnswer } from "@/actions/answers";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface ImagePreview {
  file: File;
  preview: string;
}

interface AnswerFormProps {
  questionId: string;
}

export function AnswerForm({ questionId }: AnswerFormProps) {
  const [content, setContent] = useState("");
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const remaining = MAX_IMAGES - images.length;
      if (remaining <= 0) {
        toast.error(`이미지는 최대 ${MAX_IMAGES}개까지 첨부할 수 있습니다.`);
        return;
      }

      const validFiles = files.slice(0, remaining).filter((file) => {
        if (file.size > MAX_FILE_SIZE) {
          toast.error(`${file.name}: 10MB 이하의 이미지만 첨부 가능합니다.`);
          return false;
        }
        if (!ALLOWED_TYPES.includes(file.type)) {
          toast.error(`${file.name}: PNG/JPG/WebP 이미지만 첨부 가능합니다.`);
          return false;
        }
        return true;
      });

      const newPreviews = validFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));

      setImages((prev) => [...prev, ...newPreviews]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [images.length]
  );

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const uploadImages = async (): Promise<string[]> => {
    if (images.length === 0) return [];

    const supabase = createClient();
    const urls: string[] = [];

    for (const img of images) {
      const ext = img.file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `answers/${fileName}`;

      const { error } = await supabase.storage
        .from("qa-images")
        .upload(filePath, img.file);

      if (error) {
        console.error("Image upload error:", error);
        toast.error(`이미지 업로드 실패: ${img.file.name}`);
        continue;
      }

      const { data: urlData } = supabase.storage
        .from("qa-images")
        .getPublicUrl(filePath);

      urls.push(urlData.publicUrl);
    }

    return urls;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("답변 내용을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      // 이미지 업로드
      const imageUrls = await uploadImages();

      const { error } = await createAnswer({
        questionId,
        content: content.trim(),
        imageUrls: imageUrls.length > 0 ? imageUrls : undefined,
      });

      if (error) {
        toast.error(`답변 등록 실패: ${error}`);
      } else {
        toast.success("답변이 등록되었습니다.");
        setContent("");
        setImages([]);
        router.refresh();
      }
    } catch {
      toast.error("답변 등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border p-5">
      <h3 className="text-base font-semibold mb-3">답변 작성</h3>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          placeholder="답변 내용을 입력하세요..."
          rows={5}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="resize-none text-[15px] leading-relaxed"
          required
        />

        {/* 이미지 미리보기 */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div key={i} className="relative group">
                <Image
                  src={img.preview}
                  alt={`첨부 ${i + 1}`}
                  width={80}
                  height={80}
                  className="rounded-lg object-cover w-20 h-20 border"
                />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* 이미지 첨부 버튼 */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              multiple
              onChange={handleImageSelect}
              className="hidden"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={images.length >= MAX_IMAGES}
              className="text-gray-500 text-[13px]"
            >
              <ImagePlus className="h-4 w-4 mr-1.5" />
              이미지 첨부 ({images.length}/{MAX_IMAGES})
            </Button>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="rounded-full gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {loading ? "등록 중..." : "답변 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
