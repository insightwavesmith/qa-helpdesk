import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Eye, ThumbsUp } from "lucide-react";
import type { Question } from "@/types";

// 질문 카드 컴포넌트
interface QuestionCardProps {
  question: Question;
}

const statusLabels: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
  open: { label: "답변 대기", variant: "secondary" },
  answered: { label: "답변 완료", variant: "default" },
  closed: { label: "마감", variant: "outline" },
};

export function QuestionCard({ question }: QuestionCardProps) {
  const status = statusLabels[question.status] || statusLabels.open;

  return (
    <Link href={`/questions/${question.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 mb-1">
            {question.category && (
              <Badge variant="outline">{question.category.name}</Badge>
            )}
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <CardTitle className="text-lg line-clamp-1">
            {question.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {question.content}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{question.author?.name || "익명"}</span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {question.view_count}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {question.like_count}
            </span>
            <span className="flex items-center gap-1">
              <MessageCircle className="h-3 w-3" />
              {question.answers_count || 0}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
