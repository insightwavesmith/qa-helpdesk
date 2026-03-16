"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquarePlus, Send, Loader2, X } from "lucide-react";
import { createQuestion } from "@/actions/questions";
import { toast } from "sonner";

interface FollowUpFormProps {
  parentQuestionId: string;
  parentTitle: string;
  categoryId: number | null;
}

export function FollowUpForm({
  parentQuestionId,
  parentTitle,
  categoryId,
}: FollowUpFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("질문 내용을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await createQuestion({
        title: `RE: ${parentTitle}`,
        content: content.trim(),
        categoryId,
        parentQuestionId,
      });

      if (error) {
        toast.error(`추가 질문 등록 실패: ${error}`);
      } else {
        toast.success("추가 질문이 등록되었습니다. AI가 답변을 생성 중입니다.");
        setContent("");
        setIsOpen(false);
        router.refresh();
      }
    } catch {
      toast.error("추가 질문 등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="gap-2"
      >
        <MessageSquarePlus className="h-4 w-4" />
        추가 질문
      </Button>
    );
  }

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">추가 질문 작성</h3>
        <button
          type="button"
          onClick={() => setIsOpen(false)}
          className="text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-3">
        <Textarea
          placeholder="답변에 대해 추가 질문을 작성하세요..."
          rows={3}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="resize-none text-[15px] leading-relaxed"
          required
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={loading}
            size="sm"
            className="rounded-full gap-2"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {loading ? "등록 중..." : "질문 등록"}
          </Button>
        </div>
      </form>
    </div>
  );
}
