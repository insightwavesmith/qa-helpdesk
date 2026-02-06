import { Bot, User, CheckCircle, ThumbsUp, Shield, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SourceReferences } from "@/components/questions/SourceReferences";

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

// Smith(관리자) 답변인지 확인
function isOfficialAnswer(answer: AnswerCardProps["answer"]): boolean {
  const name = answer.author?.name?.toLowerCase() || "";
  return (
    name.includes("smith") ||
    name.includes("관리자") ||
    name.includes("admin")
  );
}

export function AnswerCard({ answer }: AnswerCardProps) {
  const isAI = answer.is_ai;
  const isOfficial = !isAI && isOfficialAnswer(answer);

  return (
    <div
      className={`rounded-xl border p-5 transition-all ${
        isAI
          ? "border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/30"
          : isOfficial
            ? "border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/30"
            : ""
      }`}
    >
      {/* Author row */}
      <div className="flex items-center gap-2.5 mb-3">
        <div
          className={`flex items-center justify-center h-9 w-9 rounded-full ${
            isAI
              ? "bg-blue-100 dark:bg-blue-900"
              : isOfficial
                ? "bg-emerald-100 dark:bg-emerald-900"
                : "bg-muted"
          }`}
        >
          {isAI ? (
            <Bot className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          ) : isOfficial ? (
            <Shield className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <User className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold">
              {isAI ? "AI 어시스턴트" : answer.author?.name || "익명"}
            </span>

            {/* AI 답변 뱃지 — 파란색 */}
            {isAI && (
              <Badge className="gap-1 text-[10px] px-2 py-0.5 h-5 bg-blue-100 text-blue-700 hover:bg-blue-100 border-blue-200 dark:bg-blue-900 dark:text-blue-300 dark:border-blue-800">
                <Sparkles className="h-2.5 w-2.5" />
                AI 답변
              </Badge>
            )}

            {/* 공식 답변 뱃지 — 초록색 + 체크 */}
            {isOfficial && (
              <Badge className="gap-1 text-[10px] px-2 py-0.5 h-5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-emerald-200 dark:bg-emerald-900 dark:text-emerald-300 dark:border-emerald-800">
                <CheckCircle className="h-2.5 w-2.5" />
                공식 답변
              </Badge>
            )}

            {/* 승인 뱃지 */}
            {answer.is_approved && (
              <Badge className="gap-1 text-[10px] px-2 py-0.5 h-5 bg-green-100 text-green-700 hover:bg-green-100 border-green-200 dark:bg-green-900 dark:text-green-300 dark:border-green-800">
                <CheckCircle className="h-2.5 w-2.5" />
                승인됨
              </Badge>
            )}

            {/* AI 검토 대기 */}
            {isAI && !answer.is_approved && (
              <Badge
                variant="secondary"
                className="text-[10px] px-2 py-0.5 h-5"
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

      {/* Content — thread style with left accent */}
      <div
        className={`text-[15px] leading-[1.75] whitespace-pre-wrap text-foreground/90 pl-[46px] ${
          isAI || isOfficial ? "" : ""
        }`}
      >
        {answer.content}
      </div>

      {/* Source references for AI answers */}
      {isAI && !!answer.source_refs && (
        <div className="pl-[46px]">
          <SourceReferences rawSourceRefs={answer.source_refs} />
        </div>
      )}

      {/* Likes */}
      {answer.like_count > 0 && (
        <div className="mt-3 flex items-center gap-1 text-xs text-muted-foreground pl-[46px]">
          <ThumbsUp className="h-3 w-3" />
          {answer.like_count}
        </div>
      )}
    </div>
  );
}
