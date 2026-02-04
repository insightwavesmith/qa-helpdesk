"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
import { ArrowLeft, Send } from "lucide-react";
import { createQuestion } from "@/actions/questions";
import { toast } from "sonner";

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

interface NewQuestionFormProps {
  categories: { id: number; name: string; slug: string }[];
}

export function NewQuestionForm({ categories }: NewQuestionFormProps) {
  const router = useRouter();

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(questionSchema),
    defaultValues: {
      title: "",
      content: "",
      categoryId: "",
    },
  });

  const onSubmit = async (values: QuestionFormValues) => {
    try {
      const { data, error } = await createQuestion({
        title: values.title,
        content: values.content,
        categoryId: parseInt(values.categoryId, 10),
      });

      if (error) {
        toast.error(`질문 등록 실패: ${error}`);
        return;
      }

      toast.success("질문이 등록되었습니다.");
      router.push(`/questions/${data?.id || ""}`);
    } catch {
      toast.error("질문 등록 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/questions">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Q&A 목록
        </Link>
      </Button>

      <div>
        <h1 className="text-2xl font-bold">새 질문 작성</h1>
        <p className="text-sm text-muted-foreground mt-1">
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
                    <SelectTrigger className="rounded-lg">
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
                    className="text-base rounded-lg"
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
                    className="text-[15px] leading-relaxed resize-none rounded-lg"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="rounded-full"
              onClick={() => router.back()}
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={form.formState.isSubmitting}
              className="rounded-full gap-2"
            >
              <Send className="h-4 w-4" />
              {form.formState.isSubmitting ? "등록 중..." : "질문 등록"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
