"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Pagination } from "@/components/shared/Pagination";
import { approveAnswer, deleteAnswer, updateAnswer } from "@/actions/answers";
import { toast } from "sonner";
import { mp } from "@/lib/mixpanel";
import {
  Bot,
  User,
  CheckCircle,
  Trash2,
  Pencil,
  Loader2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  MessageSquareText,
} from "lucide-react";
import { SourceReferences } from "@/components/questions/SourceReferences";

interface Answer {
  id: string;
  content: string;
  is_ai: boolean | null;
  is_approved: boolean | null;
  created_at: string | null;
  source_refs?: unknown;
  author?: { id: string; name: string } | null;
  question?: { id: string; title: string; content?: string | null; image_urls?: unknown } | null;
}

interface AnswersReviewClientProps {
  answers: Answer[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return "";
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
  const [expandedQuestions, setExpandedQuestions] = useState<Set<string>>(new Set());

  const handleApprove = async (answerId: string) => {
    setLoadingId(answerId);
    try {
      const { error } = await approveAnswer(answerId);
      if (error) {
        toast.error(`승인 실패: ${error}`);
      } else {
        mp.track("admin_answer_reviewed", { action: "approve" });
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
              <Card key={answer.id} className="bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {answer.is_ai ? (
                        <div className="bg-blue-50 p-1.5 rounded-lg">
                          <Bot className="h-4 w-4 text-blue-500" />
                        </div>
                      ) : (
                        <div className="bg-gray-50 p-1.5 rounded-lg">
                          <User className="h-4 w-4 text-gray-500" />
                        </div>
                      )}
                      <span className="text-sm font-medium text-gray-900">
                        {answer.is_ai
                          ? "AI 답변"
                          : answer.author?.name || "익명"}
                      </span>
                      <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-50">
                        검토 대기
                      </Badge>
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatDate(answer.created_at)}
                    </span>
                  </div>
                  {answer.question && (
                    <div className="mt-1 space-y-1">
                      <Link
                        href={`/questions/${answer.question.id}`}
                        className="flex items-center gap-1 text-sm text-[#F75D5D] hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        {answer.question.title}
                      </Link>
                      {answer.question.content && (
                        <div className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                          <button
                            type="button"
                            className="flex items-center gap-1 text-xs text-gray-500 mb-1 hover:text-gray-700"
                            onClick={() => {
                              setExpandedQuestions((prev) => {
                                const next = new Set(prev);
                                if (next.has(answer.id)) {
                                  next.delete(answer.id);
                                } else {
                                  next.add(answer.id);
                                }
                                return next;
                              });
                            }}
                          >
                            <MessageSquareText className="h-3 w-3" />
                            질문 본문
                            {expandedQuestions.has(answer.id) ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                          <div
                            className={`text-sm text-gray-600 whitespace-pre-wrap ${
                              expandedQuestions.has(answer.id) ? "" : "line-clamp-3"
                            }`}
                          >
                            {answer.question.content}
                          </div>
                          {Array.isArray(answer.question.image_urls) && answer.question.image_urls.length > 0 && (
                            <div className="flex gap-2 mt-2 flex-wrap">
                              {(answer.question.image_urls as string[]).map((url, idx) => (
                                <Image
                                  key={idx}
                                  src={url}
                                  alt={`질문 이미지 ${idx + 1}`}
                                  width={80}
                                  height={80}
                                  className="h-20 w-20 object-cover rounded-lg border border-gray-200"
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
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
                          className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
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
                          className="rounded-lg"
                          onClick={() => setEditingId(null)}
                        >
                          취소
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="prose prose-sm max-w-none whitespace-pre-wrap mb-4 text-gray-700">
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
                          className="bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg"
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
                          className="rounded-lg"
                          onClick={() => handleEdit(answer)}
                          disabled={isLoading}
                        >
                          <Pencil className="h-4 w-4 mr-1" />
                          수정
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="rounded-lg"
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
