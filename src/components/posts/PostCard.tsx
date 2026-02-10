import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Eye, ThumbsUp, Pin } from "lucide-react";
import { decodeHtmlEntities } from "@/lib/utils/decode-entities";

interface PostCardProps {
  post: {
    id: string;
    title: string;
    content: string;
    category: string;
    is_pinned: boolean;
    view_count: number;
    like_count: number;
    created_at: string;
    author?: { id: string; name: string; shop_name?: string } | null;
  };
  layout?: "list" | "grid";
}

const categoryLabels: Record<string, string> = {
  education: "교육",
  notice: "공지",
  case_study: "고객사례",
  newsletter: "최신정보",
};

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

export function PostCard({ post, layout = "list" }: PostCardProps) {
  if (layout === "grid") {
    return (
      <Link href={`/posts/${post.id}`} className="group">
        <article className="bg-white rounded-xl border border-gray-200 p-4 h-full transition-all hover:shadow-md hover:border-[#F75D5D]/20">
          <div className="flex items-center gap-2 mb-2">
            {post.is_pinned && (
              <Badge
                variant="destructive"
                className="gap-1 text-[10px] px-1.5 py-0 h-5 rounded-full"
              >
                <Pin className="h-2.5 w-2.5" />
                고정
              </Badge>
            )}
            <Badge
              variant="outline"
              className="text-[11px] rounded-full"
            >
              {categoryLabels[post.category] || post.category}
            </Badge>
          </div>
          <h3 className="font-semibold text-sm text-gray-900 line-clamp-2 group-hover:text-[#F75D5D] transition-colors leading-snug">
            {decodeHtmlEntities(post.title)}
          </h3>
          <p className="text-xs text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
            {post.content}
          </p>
          <div className="flex items-center gap-2 mt-3 text-[11px] text-gray-500">
            <span>{post.author?.name || "관리자"}</span>
            <span>·</span>
            <span>{timeAgo(post.created_at)}</span>
            <span className="flex items-center gap-0.5 ml-auto">
              <Eye className="h-3 w-3" />
              {post.view_count}
            </span>
          </div>
        </article>
      </Link>
    );
  }

  // List layout (Substack-style)
  return (
    <Link href={`/posts/${post.id}`} className="block group">
      <article className="py-5 border-b last:border-b-0 transition-colors group-hover:bg-gray-50/50 -mx-2 px-2 rounded-lg">
        <div className="flex items-center gap-2 mb-1.5">
          {post.is_pinned && (
            <Badge
              variant="destructive"
              className="gap-1 text-[10px] px-1.5 py-0 h-5 rounded-full"
            >
              <Pin className="h-2.5 w-2.5" />
              고정
            </Badge>
          )}
          <span className="text-xs font-medium text-[#F75D5D]">
            {categoryLabels[post.category] || post.category}
          </span>
        </div>

        <h3 className="font-semibold text-[16px] leading-snug text-gray-900 group-hover:text-[#F75D5D] transition-colors line-clamp-2">
          {decodeHtmlEntities(post.title)}
        </h3>

        <p className="text-sm text-gray-500 mt-1.5 line-clamp-2 leading-relaxed">
          {post.content}
        </p>

        <div className="flex items-center gap-3 mt-3 text-xs text-gray-500">
          <span className="font-medium text-gray-900/70">
            {post.author?.name || "관리자"}
          </span>
          <span>{timeAgo(post.created_at)}</span>
          <div className="flex items-center gap-3 ml-auto">
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {post.view_count}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {post.like_count}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
