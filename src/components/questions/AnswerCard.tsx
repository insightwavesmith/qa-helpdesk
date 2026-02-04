import { Bot, User, CheckCircle, ThumbsUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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

function timeAgo(dateStr: string) {
  const now = new Date();
  const d = new Date(dateStr);
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "방금";
  if (diffMin < 60) return `${diffMin}분 전`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}시간 전`;
  const diffDay = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}일 전`;
  return d.toLocaleDateString("ko-KR");
}

export function AnswerCard({ answer }: AnswerCardProps) {
  const isAI = answer.is_ai;

  return (
    <div
      className={`rounded-xl border p-5 ${
        isAI
          ? "border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-950/30"
          : ""
      }`}
    >
      {/* Author row */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={`flex items-center justify-center h-8 w-8 rounded-full ${
            isAI
              ? "bg-blue-100 dark:bg-blue-900"
              : "bg-muted"
          }`}
        >
          {isAI ? (
            <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          ) : (
            <User className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">
              {isAI ? "AI 답변" : answer.author?.name || "익명"}
            </span>
            {answer.is_approved && (
              <Badge
                variant="default"
                className="gap-1 text-[10px] px-1.5 py-0 h-5"
              >
                <CheckCircle className="h-2.5 w-2.5" />
                승인
              </Badge>
            )}
            {isAI && !answer.is_approved && (
              <Badge
                variant="secondary"
                className="text-[10px] px-1.5 py-0 h-5"
              >
                검토 대기
              </Badge>
            )}
          </div>
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {timeAgo(answer.created_at)}
        </span>
      </div>

      {/* Content */}
      <div className="text-[15px] leading-[1.75] whitespace-pre-wrap text-foreground/90">
        {answer.content}
      </div>

      {/* Likes */}
      {answer.like_count > 0 && (
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
          <ThumbsUp className="h-3 w-3" />
          {answer.like_count}
        </div>
      )}
    </div>
  );
}
