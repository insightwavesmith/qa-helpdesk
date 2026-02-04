import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, ThumbsUp, MessageCircle, Sparkles, CheckCircle } from "lucide-react";
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

  // 답변 분류: AI 답변, 공식 답변, 일반 답변
  const aiAnswers = answers.filter((a) => a.is_ai);
  const officialAnswers = answers.filter(
    (a) =>
      !a.is_ai &&
      (a.author?.name?.toLowerCase().includes("smith") ||
        a.author?.name?.includes("관리자") ||
        a.author?.name?.toLowerCase().includes("admin"))
  );
  const otherAnswers = answers.filter(
    (a) =>
      !a.is_ai &&
      !(
        a.author?.name?.toLowerCase().includes("smith") ||
        a.author?.name?.includes("관리자") ||
        a.author?.name?.toLowerCase().includes("admin")
      )
  );

  return (
    <div className="space-y-8">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/questions">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Q&A 목록
        </Link>
      </Button>

      {/* Question Article */}
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

        {/* Content body */}
        <div className="mt-6 text-base leading-[1.8] whitespace-pre-wrap text-foreground/90">
          {question.content}
        </div>

        {/* Attached images */}
        {Array.isArray(question.image_urls) &&
          (question.image_urls as string[]).length > 0 && (
            <div className="mt-6 space-y-3">
              {(question.image_urls as string[]).map(
                (url: string, idx: number) => (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`첨부 이미지 ${idx + 1}`}
                      className="max-w-full sm:max-w-lg rounded-lg border shadow-sm"
                    />
                  </a>
                )
              )}
            </div>
          )}
      </article>

      {/* Answers Section — Thread style */}
      <section className="pt-2">
        <div className="flex items-center gap-2 mb-6">
          <MessageCircle className="h-5 w-5" />
          <h2 className="text-lg font-bold">답변 {answers.length}개</h2>
          {aiAnswers.length > 0 && (
            <Badge className="gap-1 text-[10px] px-2 py-0.5 h-5 bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800">
              <Sparkles className="h-2.5 w-2.5" />
              AI {aiAnswers.length}
            </Badge>
          )}
          {officialAnswers.length > 0 && (
            <Badge className="gap-1 text-[10px] px-2 py-0.5 h-5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800">
              <CheckCircle className="h-2.5 w-2.5" />
              공식 {officialAnswers.length}
            </Badge>
          )}
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
            {/* 공식 답변 먼저, 그 다음 AI 답변, 마지막 일반 답변 */}
            {officialAnswers.map((answer) => (
              <AnswerCard key={answer.id} answer={answer} />
            ))}
            {aiAnswers.map((answer) => (
              <AnswerCard key={answer.id} answer={answer} />
            ))}
            {otherAnswers.map((answer) => (
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
