import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, ThumbsUp, MessageCircle } from "lucide-react";
import { getQuestionById } from "@/actions/questions";
import { getAnswersByQuestionId } from "@/actions/answers";
import { AnswerCard } from "@/components/questions/AnswerCard";
import { AnswerForm } from "./answer-form";

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  open: {
    label: "답변 대기",
    className:
      "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-400",
  },
  answered: {
    label: "답변 완료",
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400",
  },
  closed: {
    label: "마감",
    className:
      "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export default async function QuestionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: question, error } = await getQuestionById(id);
  if (error || !question) {
    notFound();
  }

  const { data: answers } = await getAnswersByQuestionId(id);
  const st = statusConfig[question.status] || statusConfig.open;

  return (
    <div className="space-y-8">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/questions">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Q&A 목록
        </Link>
      </Button>

      {/* Question Article — Substack reading style */}
      <article>
        {/* Meta badges */}
        <div className="flex items-center gap-2 mb-3">
          {question.category && (
            <span className="text-sm font-medium text-primary">
              {(question.category as { name: string }).name}
            </span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.className}`}
          >
            {st.label}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight tracking-tight">
          {question.title}
        </h1>

        {/* Author & date row */}
        <div className="flex items-center gap-3 mt-4 pb-6 border-b">
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary font-semibold text-sm">
            {((question.author as { name: string } | null)?.name || "익")[0]}
          </div>
          <div>
            <p className="text-sm font-medium">
              {(question.author as { name: string } | null)?.name || "익명"}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{formatDate(question.created_at)}</span>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Eye className="h-3 w-3" />
                {question.view_count}
              </span>
              <span className="flex items-center gap-0.5">
                <ThumbsUp className="h-3 w-3" />
                {question.like_count}
              </span>
            </div>
          </div>
        </div>

        {/* Content body — generous line-height, readable */}
        <div className="mt-6 text-base leading-[1.8] whitespace-pre-wrap text-foreground/90">
          {question.content}
        </div>
      </article>

      {/* Answers */}
      <section className="pt-2">
        <div className="flex items-center gap-2 mb-4">
          <MessageCircle className="h-5 w-5" />
          <h2 className="text-lg font-bold">답변 {answers.length}개</h2>
        </div>

        {answers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground border border-dashed rounded-xl">
            <p className="text-sm">아직 답변이 없습니다.</p>
            <p className="text-xs mt-1 opacity-70">
              첫 번째 답변을 남겨보세요!
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {answers.map((answer) => (
              <AnswerCard key={answer.id} answer={answer} />
            ))}
          </div>
        )}
      </section>

      {/* Answer Form */}
      <AnswerForm questionId={id} />
    </div>
  );
}
