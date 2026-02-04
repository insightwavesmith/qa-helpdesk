import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Eye, ThumbsUp } from "lucide-react";
import type { Question } from "@/types";

// 질문 카드 — Notion-style flat list item
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
    <Link href={`/questions/${question.id}`} className="block group">
      <div className="px-2 py-3 -mx-2 rounded-[6px] transition-colors duration-150 hover:bg-accent cursor-pointer border-b border-border last:border-b-0">
        <div className="flex items-center gap-2 mb-1.5">
          {question.category && (
            <Badge variant="outline" className="text-[11px] h-5 font-normal">{question.category.name}</Badge>
          )}
          <Badge variant={status.variant} className="text-[11px] h-5 font-normal">{status.label}</Badge>
        </div>
        <h3 className="text-[15px] font-medium text-foreground line-clamp-1 mb-1 group-hover:text-primary transition-colors duration-150">
          {question.title}
        </h3>
        <p className="text-[13px] text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {question.content}
        </p>
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{question.author?.name || "익명"}</span>
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
      </div>
    </Link>
  );
}
