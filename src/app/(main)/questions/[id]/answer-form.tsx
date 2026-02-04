"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createAnswer } from "@/actions/answers";
import { toast } from "sonner";

interface AnswerFormProps {
  questionId: string;
}

export function AnswerForm({ questionId }: AnswerFormProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("답변 내용을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await createAnswer({
        questionId,
        content: content.trim(),
      });

      if (error) {
        toast.error(`답변 등록 실패: ${error}`);
      } else {
        toast.success("답변이 등록되었습니다.");
        setContent("");
        router.refresh();
      }
    } catch {
      toast.error("답변 등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">답변 작성</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Textarea
            placeholder="답변 내용을 입력하세요..."
            rows={6}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>
              {loading ? "등록 중..." : "답변 등록"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
