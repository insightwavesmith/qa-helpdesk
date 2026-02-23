"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { deleteQuestion } from "@/actions/questions";
import { toast } from "sonner";

export function DeleteQuestionButton({ questionId }: { questionId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    if (!confirm("이 질문과 모든 답변을 삭제하시겠습니까?\n삭제된 데이터는 복구할 수 없습니다.")) return;
    setLoading(true);
    try {
      const { error } = await deleteQuestion(questionId);
      if (error) {
        toast.error(`삭제 실패: ${error}`);
      } else {
        toast.success("질문이 삭제되었습니다.");
        router.push("/questions");
      }
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleDelete}
      disabled={loading}
      className="border-red-300 text-red-600 hover:bg-red-50 gap-1 text-xs"
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
      삭제
    </Button>
  );
}
