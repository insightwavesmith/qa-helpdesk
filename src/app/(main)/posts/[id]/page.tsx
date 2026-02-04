import { notFound } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, ThumbsUp } from "lucide-react";
import { getPostById, getCommentsByPostId } from "@/actions/posts";
import { CommentSection } from "./comment-section";

const categoryLabels: Record<string, string> = {
  info: "정보",
  notice: "공지",
  webinar: "웨비나",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default async function PostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { data: post, error } = await getPostById(id);
  if (error || !post) {
    notFound();
  }

  const { data: comments } = await getCommentsByPostId(id);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" size="sm" asChild>
        <Link href="/posts">
          <ArrowLeft className="mr-2 h-4 w-4" />
          목록으로
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline">
              {categoryLabels[post.category] || post.category}
            </Badge>
          </div>
          <CardTitle className="text-2xl">{post.title}</CardTitle>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>
              {(post.author as { name: string } | null)?.name || "모찌"}
            </span>
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
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none whitespace-pre-wrap">
            {post.content}
          </div>
        </CardContent>
      </Card>

      {/* Comments */}
      <CommentSection postId={id} initialComments={comments} />
    </div>
  );
}
