"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useState, useRef, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ArrowLeft, Send, ImagePlus, X } from "lucide-react";
import { createQuestion } from "@/actions/questions";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

const MAX_IMAGES = 5;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

const questionSchema = z.object({
  title: z
    .string()
    .min(5, "제목은 5자 이상 입력해주세요.")
    .max(200, "제목은 200자 이내로 입력해주세요."),
  content: z
    .string()
    .min(10, "내용은 10자 이상 입력해주세요.")
    .max(10000, "내용은 10000자 이내로 입력해주세요."),
  categoryId: z.string().min(1, "카테고리를 선택해주세요."),
});

type QuestionFormValues = z.infer<typeof questionSchema>;

interface ImagePreview {
  file: File;
  preview: string;
}

interface NewQuestionFormProps {
  categories: { id: number; name: string; slug: string }[];
}

export function NewQuestionForm({ categories }: NewQuestionFormProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<ImagePreview[]>([]);
  const [uploading, setUploading] = useState(false);

  // 컴포넌트 언마운트 시 미리보기 blob URL 해제
  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.preview));
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      title: "",
      content: "",
      categoryId: "",
    },
  });

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
          toast.error(`${file.name}: 5MB 이하의 이미지만 첨부 가능합니다.`);
          return false;
        }
        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name}: 이미지 파일만 첨부 가능합니다.`);
          return false;
        }
        return true;
      });

      const newPreviews = validFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
      }));

      setImages((prev) => [...prev, ...newPreviews]);

      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
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
      const filePath = `questions/${fileName}`;

      const { error } = await supabase.storage
        .from("question-images")
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
      } = supabase.storage.from("question-images").getPublicUrl(filePath);

      urls.push(publicUrl);
    }

    return urls;
  };

  const onSubmit = async (values: QuestionFormValues) => {
    try {
      setUploading(true);

      // Upload images first
      let imageUrls: string[] = [];
      if (images.length > 0) {
        imageUrls = await uploadImages();
      }

      const { data, error } = await createQuestion({
        title: values.title,
        content: values.content,
        categoryId: parseInt(values.categoryId, 10),
        imageUrls,
      });

      if (error) {
        toast.error(`질문 등록 실패: ${error}`);
        return;
      }

      toast.success("질문이 등록되었습니다.");
      router.push(`/questions/${data?.id || ""}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "질문 등록 중 오류가 발생했습니다."
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-6">
        <Link href="/questions">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Q&A 목록
        </Link>
      </Button>

      <div className="bg-white rounded-xl border border-gray-200 p-8 fade-in">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">새 질문 작성</h1>
          <p className="text-sm text-gray-500 mt-1">
            메타 광고 관련 궁금한 점을 자유롭게 질문해주세요.
            <br />
            AI가 강의 자료를 기반으로 초안 답변을 드리고, Smith님이 검토 후
            승인합니다.
          </p>
        </div>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-5"
          >
          <FormField
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>카테고리</FormLabel>
                <Select
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger className="rounded-lg border-gray-200 focus:ring-[#F75D5D]">
                      <SelectValue placeholder="카테고리를 선택하세요" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={String(cat.id)}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem>
                <FormLabel>제목</FormLabel>
                <FormControl>
                  <Input
                    placeholder="질문 제목을 입력하세요"
                    className="text-base rounded-lg border-gray-200 focus:ring-[#F75D5D]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="content"
            render={({ field }) => (
              <FormItem>
                <FormLabel>내용</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="구체적으로 작성해주시면 더 정확한 답변을 받으실 수 있습니다."
                    rows={12}
                    className="text-[15px] leading-relaxed resize-none rounded-lg border-gray-200 focus:ring-[#F75D5D]"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Image Upload Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                이미지 첨부{" "}
                <span className="text-gray-500 font-normal">
                  (선택, 최대 {MAX_IMAGES}개)
                </span>
              </label>
              {images.length > 0 && (
                <span className="text-xs text-gray-500">
                  {images.length}/{MAX_IMAGES}
                </span>
              )}
            </div>

            {/* Image previews */}
            {images.length > 0 && (
              <div className="flex flex-wrap gap-3">
                {images.map((img, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-lg overflow-hidden border w-24 h-24"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={img.preview}
                      alt={`첨부 이미지 ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Upload button */}
            {images.length < MAX_IMAGES && (
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  multiple
                  onChange={handleImageSelect}
                  className="hidden"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-lg gap-2"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <ImagePlus className="h-4 w-4" />
                  이미지 추가
                </Button>
                <p className="text-[11px] text-gray-500 mt-1.5">
                  JPG, PNG, GIF, WebP / 파일당 5MB 이하
                </p>
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-lg"
              onClick={() => router.back()}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting || uploading}
              className="rounded-lg gap-2 bg-[#F75D5D] hover:bg-[#E54949]"
            >
              <Send className="h-4 w-4" />
              {uploading && images.length > 0
                ? "이미지 업로드 중..."
                : form.formState.isSubmitting || uploading
                  ? "등록 중..."
                  : "질문 등록"}
            </Button>
          </div>
          </form>
        </Form>
      </div>
    </div>
  );
}
