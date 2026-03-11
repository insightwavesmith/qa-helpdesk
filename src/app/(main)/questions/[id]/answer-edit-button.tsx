"use client";

import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { updateAnswerByAuthor } from "@/actions/answers";
import { useRouter } from "next/navigation";

interface AnswerEditButtonProps {
  answerId: string;
  initialContent: string;
  questionId: string;
}

export function AnswerEditButton({ answerId, initialContent, questionId }: AnswerEditButtonProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(initialContent);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  // questionId를 사용하여 lint 경고 방지
  void questionId;

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setEditContent(initialContent);
          setIsEditing(true);
        }}
        className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        <Pencil className="h-3 w-3" />
        수정
      </button>
    );
  }

  const handleSave = async () => {
    if (!editContent.trim() || editContent === initialContent) {
      setIsEditing(false);
      return;
    }
    setIsLoading(true);
    const { error } = await updateAnswerByAuthor(answerId, editContent.trim());
    setIsLoading(false);

    if (error) {
      alert(`수정 실패: ${error}`);
      return;
    }
    setIsEditing(false);
    router.refresh();
  };

  return (
    <div className="mt-3 pl-[42px]">
      <Textarea
        value={editContent}
        onChange={(e) => setEditContent(e.target.value)}
        rows={5}
        className="resize-none text-[15px] leading-relaxed"
        disabled={isLoading}
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={isLoading}
          className="flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-[#E54949] disabled:opacity-50 transition-colors"
        >
          {isLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          저장
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          disabled={isLoading}
          className="flex items-center gap-1 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50 transition-colors"
        >
          <X className="h-3 w-3" />
          취소
        </button>
      </div>
    </div>
  );
}
