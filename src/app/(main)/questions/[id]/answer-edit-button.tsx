"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { Pencil, Check, X, Loader2, ImagePlus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { updateAnswerByAuthor } from "@/actions/answers";
import { uploadFile } from "@/lib/upload-client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

interface NewImagePreview {
  file: File;
  preview: string;
}

interface AnswerEditButtonProps {
  answerId: string;
  initialContent: string;
  initialImageUrls?: string[];
}

export function AnswerEditButton({
  answerId,
  initialContent,
  initialImageUrls,
}: AnswerEditButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(initialContent);
  const [existingUrls, setExistingUrls] = useState<string[]>(initialImageUrls ?? []);
  const [newImages, setNewImages] = useState<NewImagePreview[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      newImages.forEach((img) => URL.revokeObjectURL(img.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancel = () => {
    // revoke any object URLs created for new images
    newImages.forEach((img) => URL.revokeObjectURL(img.preview));
    setEditContent(initialContent);
    setExistingUrls(initialImageUrls ?? []);
    setNewImages([]);
    setIsEditing(false);
  };

  const totalImages = existingUrls.length + newImages.length;

  const handleImageSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      const remaining = MAX_IMAGES - totalImages;
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

      setNewImages((prev) => [...prev, ...newPreviews]);
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [totalImages]
  );

  const removeExistingImage = useCallback((index: number) => {
    setExistingUrls((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const removeNewImage = useCallback((index: number) => {
    setNewImages((prev) => {
      const removed = prev[index];
      URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const uploadNewImages = async (): Promise<string[]> => {
    if (newImages.length === 0) return [];

    const urls: string[] = [];

    for (const img of newImages) {
      const ext = img.file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `answers/${fileName}`;

      try {
        const publicUrl = await uploadFile(img.file, "qa-images", filePath);
        urls.push(publicUrl);
      } catch (err) {
        console.error("Image upload error:", err);
        toast.error(`이미지 업로드 실패: ${img.file.name}. ${err instanceof Error ? err.message : ""}`);
      }
    }

    return urls;
  };

  const handleSave = async () => {
    if (!editContent.trim()) {
      toast.error("답변 내용을 입력해주세요.");
      return;
    }

    setIsLoading(true);
    try {
      const uploadedUrls = await uploadNewImages();
      const allImageUrls = [...existingUrls, ...uploadedUrls];

      const { error } = await updateAnswerByAuthor(
        answerId,
        editContent.trim(),
        allImageUrls
      );

      if (error) {
        toast.error(`수정 실패: ${error}`);
        return;
      }

      toast.success("답변이 수정되었습니다.");
      // revoke previews
      newImages.forEach((img) => URL.revokeObjectURL(img.preview));
      setNewImages([]);
      setIsEditing(false);
      router.refresh();
    } catch {
      toast.error("답변 수정 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditContent(initialContent);
          setExistingUrls(initialImageUrls ?? []);
          setNewImages([]);
          setIsEditing(true);
        }}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        <Pencil className="h-3 w-3" />
        수정
      </button>
    );
  }

  return (
    <div className="mt-3 pl-[42px]">
      <Textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        rows={5}
        className="resize-none text-[15px] leading-relaxed"
        disabled={isLoading}
        placeholder="답변 내용을 입력하세요..."
      />

      {/* 기존 이미지 */}
      {existingUrls.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {existingUrls.map((url, i) => (
            <div key={url} className="relative group">
              <Image
                src={url}
                alt={`기존 이미지 ${i + 1}`}
                width={80}
                height={80}
                className="rounded-lg object-cover w-20 h-20 border"
              />
              <button
                type="button"
                onClick={() => removeExistingImage(i)}
                disabled={isLoading}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 새로 추가한 이미지 */}
      {newImages.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {newImages.map((img, i) => (
            <div key={img.preview} className="relative group">
              <Image
                src={img.preview}
                alt={`새 이미지 ${i + 1}`}
                width={80}
                height={80}
                className="rounded-lg object-cover w-20 h-20 border"
              />
              <button
                type="button"
                onClick={() => removeNewImage(i)}
                disabled={isLoading}
                className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mt-2">
        {/* 이미지 첨부 */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            onChange={handleImageSelect}
            className="hidden"
            disabled={isLoading}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || totalImages >= MAX_IMAGES}
            className="text-gray-500 text-[13px]"
          >
            <ImagePlus className="h-4 w-4 mr-1.5" />
            이미지 첨부 ({totalImages}/{MAX_IMAGES})
          </Button>
        </div>

        {/* 저장 / 취소 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={isLoading}
            className="flex items-center gap-1 rounded-md bg-[#F75D5D] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#E54949] disabled:opacity-50 transition-colors"
          >
            {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            저장
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
          >
            <X className="h-3 w-3" />
            취소
          </button>
        </div>
      </div>
    </div>
  );
}
