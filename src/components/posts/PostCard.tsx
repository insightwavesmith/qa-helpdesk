import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eye, ThumbsUp, Pin } from "lucide-react";

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
}

const categoryLabels: Record<string, string> = {
  info: "정보",
  notice: "공지",
  webinar: "웨비나",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function PostCard({ post }: PostCardProps) {
  return (
    <Link href={`/posts/${post.id}`}>
      <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2 mb-1">
            {post.is_pinned && (
              <Badge variant="destructive" className="gap-1">
                <Pin className="h-3 w-3" />
                고정
              </Badge>
            )}
            <Badge variant="outline">
              {categoryLabels[post.category] || post.category}
            </Badge>
          </div>
          <CardTitle className="text-lg line-clamp-1">{post.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground line-clamp-2 mb-3">
            {post.content}
          </p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>{post.author?.name || "모찌"}</span>
            <span>{formatDate(post.created_at)}</span>
            <span className="flex items-center gap-1">
              <Eye className="h-3 w-3" />
              {post.view_count}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsUp className="h-3 w-3" />
              {post.like_count}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
