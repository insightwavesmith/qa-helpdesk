import Link from "next/link";
import { MessageCircle, Eye, ThumbsUp } from "lucide-react";

interface QuestionCardProps {
  question: {
    id: string;
    title: string;
    content: string;
    status: string;
    view_count: number;
    like_count: number;
    created_at: string;
    answers_count?: number;
    author?: { id: string; name: string; shop_name?: string | null } | null;
    category?: { id: number; name: string; slug: string } | null;
  };
}

const statusConfig: Record<
  string,
  { label: string; className: string }
> = {
  open: {
    label: "미답변",
    className:
      "bg-orange-100 text-orange-700",
  },
  answered: {
    label: "답변완료",
    className:
      "bg-emerald-100 text-emerald-700",
  },
  closed: {
    label: "마감",
    className:
      "bg-gray-100 text-gray-600",
  },
};

function timeAgo(dateStr: string | null) {
  if (!dateStr) return "";
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

export function QuestionCard({ question }: QuestionCardProps) {
  const st = statusConfig[question.status] || statusConfig.open;

  return (
    <Link href={`/questions/${question.id}`} className="block group">
      <article className="py-5 border-b last:border-b-0 transition-colors group-hover:bg-muted/30 -mx-2 px-2 rounded-lg">
        {/* Category + Status row */}
        <div className="flex items-center gap-2 mb-1.5">
          {question.category && (
            <span className="text-xs font-medium text-primary">
              {question.category.name}
            </span>
          )}
          <span
            className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${st.className}`}
          >
            {st.label}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-semibold text-[16px] leading-snug group-hover:text-primary transition-colors line-clamp-2">
          {question.title}
        </h3>

        {/* Preview */}
        <p className="text-sm text-muted-foreground mt-1.5 line-clamp-2 leading-relaxed">
          {question.content}
        </p>

        {/* Meta row */}
        <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/70">
            {question.author?.name || "익명"}
          </span>
          <span>{timeAgo(question.created_at)}</span>
          <div className="flex items-center gap-3 ml-auto">
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
      </article>
    </Link>
  );
}
