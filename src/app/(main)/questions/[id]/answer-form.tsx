"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Send } from "lucide-react";
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
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={loading}
            className="rounded-full gap-2"
          >
            <Send className="h-4 w-4" />
            {loading ? "등록 중..." : "답변 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
