"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { createPost } from "@/actions/posts";
import { toast } from "sonner";

const postSchema = z.object({
  title: z
    .string()
    .min(2, "제목은 2자 이상 입력해주세요.")
    .max(200, "제목은 200자 이내로 입력해주세요."),
  content: z
    .string()
    .min(10, "내용은 10자 이상 입력해주세요.")
    .max(50000, "내용은 50000자 이내로 입력해주세요."),
  category: z.enum(["education", "news", "case_study"], {
    error: "카테고리를 선택해주세요.",
  }),
});

type PostFormValues = z.infer<typeof postSchema>;

export default function NewPostPage() {
  const router = useRouter();

  const form = useForm<PostFormValues>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: "",
      content: "",
      category: "education",
    },
  });

  const onSubmit = async (values: PostFormValues) => {
    try {
      const { data, error } = await createPost({
        title: values.title,
        content: values.content,
        category: values.category,
      });

      if (error) {
        toast.error(`게시글 등록 실패: ${error}`);
        return;
      }

      toast.success("게시글이 등록되었습니다. 관리자 승인 후 공개됩니다.");
      router.push(`/posts/${data?.id || ""}`);
    } catch {
      toast.error("게시글 등록 중 오류가 발생했습니다.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <Card className="bg-white rounded-xl shadow-sm border border-gray-200">
        <CardHeader>
          <CardTitle className="text-gray-900">새 글 작성</CardTitle>
          <CardDescription>
            메타 광고 관련 유용한 정보를 공유해주세요.
            <br />
            관리자 승인 후 공개됩니다.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>카테고리 *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="카테고리 선택" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="education">교육</SelectItem>
                        <SelectItem value="news">소식</SelectItem>
                        <SelectItem value="case_study">고객사례</SelectItem>
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
                    <FormLabel>제목 *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="게시글 제목을 입력하세요"
                        className="border-gray-200 rounded-lg focus:ring-[#F75D5D]"
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
                    <FormLabel>내용 *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="내용을 입력하세요"
                        rows={15}
                        className="border-gray-200 rounded-lg focus:ring-[#F75D5D]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="flex gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.back()}
              >
                취소
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting} className="bg-[#F75D5D] hover:bg-[#E54949]">
                {form.formState.isSubmitting ? "등록 중..." : "글 등록"}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}
