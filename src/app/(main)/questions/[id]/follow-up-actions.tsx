"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { deleteFollowUpQuestion } from "@/actions/questions";
import { toast } from "sonner";

interface FollowUpActionsProps {
  questionId: string;
  parentQuestionId: string;
}

export function FollowUpActions({ questionId, parentQuestionId }: FollowUpActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm("이 추가 질문과 답변을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.")) return;
    setLoading(true);
    try {
      const { error } = await deleteFollowUpQuestion(questionId, parentQuestionId);
      if (error) {
        toast.error(`삭제 실패: ${error}`);
      } else {
        toast.success("추가 질문이 삭제되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={`/questions/${questionId}/edit`}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-700 rounded hover:bg-gray-100 transition-colors"
      >
        <Pencil className="h-3 w-3" />
        수정
      </Link>
      <button
        type="button"
        onClick={handleDelete}
        disabled={loading}
        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-500 hover:text-red-700 rounded hover:bg-red-50 transition-colors disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
        삭제
      </button>
    </div>
  );
}
