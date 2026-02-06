"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/shared/Pagination";
import { approveAnswer, deleteAnswer, updateAnswer } from "@/actions/answers";
import { toast } from "sonner";
import {
  Bot,
  User,
  CheckCircle,
  Trash2,
  Pencil,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { SourceReferences } from "@/components/questions/SourceReferences";

interface Answer {
  id: string;
  content: string;
  is_ai: boolean;
  is_approved: boolean;
  created_at: string;
  source_refs?: unknown;
  author?: { id: string; name: string } | null;
  question?: { id: string; title: string } | null;
}

interface AnswersReviewClientProps {
  answers: Answer[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AnswersReviewClient({
  answers,
  currentPage,
  totalPages,
  totalCount,
}: AnswersReviewClientProps) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");

  const handleApprove = async (answerId: string) => {
    setLoadingId(answerId);
    try {
      const { error } = await approveAnswer(answerId);
      if (error) {
        toast.error(`승인 실패: ${error}`);
      } else {
        toast.success("답변이 승인되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleDelete = async (answerId: string) => {
    if (!confirm("정말 이 답변을 삭제하시겠습니까?")) return;

    setLoadingId(answerId);
    try {
      const { error } = await deleteAnswer(answerId);
      if (error) {
        toast.error(`삭제 실패: ${error}`);
      } else {
        toast.success("답변이 삭제되었습니다.");
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  };

  const handleEdit = (answer: Answer) => {
    setEditingId(answer.id);
    setEditContent(answer.content);
  };

  const handleSaveEdit = async (answerId: string) => {
    setLoadingId(answerId);
    try {
      const { error } = await updateAnswer(answerId, editContent);
      if (error) {
        toast.error(`수정 실패: ${error}`);
      } else {
        toast.success("답변이 수정되었습니다.");
        setEditingId(null);
        router.refresh();
      }
    } catch {
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        승인 대기 답변 {totalCount}개
      </p>

      {answers.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          대기 중인 답변이 없습니다.
        </div>
      ) : (
        <div className="space-y-4">
          {answers.map((answer) => {
            const isLoading = loadingId === answer.id;
            const isEditing = editingId === answer.id;

            return (
              <Card key={answer.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {answer.is_ai ? (
                        <Bot className="h-4 w-4 text-blue-500" />
                      ) : (
                        <User className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="text-sm font-medium">
                        {answer.is_ai
                          ? "AI 답변"
                          : answer.author?.name || "익명"}
                      </span>
                      <Badge variant="secondary" className="text-xs">
                        검토 대기
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(answer.created_at)}
                    </span>
                  </div>
                  {answer.question && (
                    <Link
                      href={`/questions/${answer.question.id}`}
                      className="flex items-center gap-1 text-sm text-primary hover:underline mt-1"
                    >
                      <ExternalLink className="h-3 w-3" />
                      {answer.question.title}
                    </Link>
                  )}
                </CardHeader>
                <CardContent>
                  {isEditing ? (
                    <div className="space-y-3">
                      <Textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={6}
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleSaveEdit(answer.id)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : null}
                          저장
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap mb-4">
                        {answer.content}
                      </div>
                      {answer.is_ai && !!answer.source_refs && (
                        <div className="mb-4">
                          <SourceReferences rawSourceRefs={answer.source_refs} />
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleApprove(answer.id)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          ) : (
                            <CheckCircle className="h-4 w-4 mr-1" />
                          )}
                          승인
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(answer)}
                          disabled={isLoading}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDelete(answer.id)}
                          disabled={isLoading}
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          삭제
                        </Button>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) =>
          router.push(`/admin/answers?page=${page}`)
        }
      />
    </div>
  );
}
