import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, ThumbsUp } from "lucide-react";
import { getQuestionById } from "@/actions/questions";
import { getAnswersByQuestionId } from "@/actions/answers";
import { AnswerCard } from "@/components/questions/AnswerCard";
import { AnswerForm } from "./answer-form";

const statusLabels: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  open: { label: "답변 대기", variant: "secondary" },
  answered: { label: "답변 완료", variant: "default" },
  closed: { label: "마감", variant: "outline" },
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
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

  const status = statusLabels[question.status] || statusLabels.open;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Back button */}
      <Button variant="ghost" size="sm" asChild>
        <Link href="/questions">
          <ArrowLeft className="mr-2 h-4 w-4" />
          목록으로
        </Link>
      </Button>

      {/* Question */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            {question.category && (
              <Badge variant="outline">{(question.category as { name: string }).name}</Badge>
            )}
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <CardTitle className="text-2xl">{question.title}</CardTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>{(question.author as { name: string } | null)?.name || "익명"}</span>
            <span>{formatDate(question.created_at)}</span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {question.view_count}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {question.like_count}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
            {question.content}
          </div>
        </CardContent>
      </Card>

      {/* Answers */}
      <div className="space-y-4">
        <h2 className="text-xl font-bold">답변 {answers.length}개</h2>
        {answers.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 답변이 없습니다.</p>
        ) : (
          answers.map((answer) => (
            <AnswerCard key={answer.id} answer={answer} />
          ))
        )}
      </div>

      {/* Answer Form */}
      <AnswerForm questionId={id} />
    </div>
  );
}
