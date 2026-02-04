import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Eye, ThumbsUp, Pin } from "lucide-react";
import type { Post } from "@/types";

// 게시글 카드 — Notion-style flat list item
interface PostCardProps {
  post: Post;
}

const categoryLabels: Record<string, string> = {
  info: "정보",
  notice: "공지",
  webinar: "웨비나",
};

export function PostCard({ post }: PostCardProps) {
  return (
    <Link href={`/posts/${post.id}`} className="block group">
      <div className="px-2 py-3 -mx-2 rounded-[6px] transition-colors duration-150 hover:bg-accent cursor-pointer border-b border-border last:border-b-0">
        <div className="flex items-center gap-2 mb-1.5">
          {post.is_pinned && (
            <Badge variant="destructive" className="gap-1 text-[11px] h-5 font-normal">
              <Pin className="h-3 w-3" />
              고정
            </Badge>
          )}
          <Badge variant="outline" className="text-[11px] h-5 font-normal">
            {categoryLabels[post.category] || post.category}
          </Badge>
        </div>
        <h3 className="text-[15px] font-medium text-foreground line-clamp-1 mb-1 group-hover:text-primary transition-colors duration-150">
          {post.title}
        </h3>
        <p className="text-[13px] text-muted-foreground line-clamp-2 mb-3 leading-relaxed">
          {post.content}
        </p>
        <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
          <span className="font-medium text-foreground/70">{post.author?.name || "모찌"}</span>
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
    </Link>
  );
}
