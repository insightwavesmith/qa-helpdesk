import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bot, User, CheckCircle, ThumbsUp } from "lucide-react";

interface AnswerCardProps {
  answer: {
    id: string;
    content: string;
    is_ai: boolean;
    is_approved: boolean;
    like_count: number;
    created_at: string;
    source_refs?: unknown;
    author?: { id: string; name: string; shop_name?: string } | null;
  };
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function AnswerCard({ answer }: AnswerCardProps) {
  return (
    <Card className={answer.is_ai ? "border-blue-200 bg-blue-50/30" : ""}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {answer.is_ai ? (
              <Bot className="h-4 w-4 text-blue-500" />
            ) : (
              <User className="h-4 w-4 text-gray-500" />
            )}
            <span className="font-medium text-sm">
              {answer.is_ai ? "AI 답변" : answer.author?.name || "익명"}
            </span>
            {answer.is_approved && (
              <Badge variant="default" className="gap-1 text-xs">
                <CheckCircle className="h-3 w-3" />
                승인됨
              </Badge>
            )}
            {answer.is_ai && !answer.is_approved && (
              <Badge variant="secondary" className="text-xs">
                검토 대기
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground">
            {formatDate(answer.created_at)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="prose prose-sm max-w-none whitespace-pre-wrap">
          {answer.content}
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {answer.like_count}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
