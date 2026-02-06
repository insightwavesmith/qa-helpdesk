import { notFound } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Eye, ThumbsUp, Pin } from "lucide-react";
import { getPostById, getCommentsByPostId } from "@/actions/posts";
import { CommentSection } from "./comment-section";

const categoryLabels: Record<string, string> = {
  info: "정보",
  notice: "공지",
  webinar: "웨비나",
};

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
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
    <div className="space-y-8">
      {/* Back */}
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/posts">
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          정보공유 목록
        </Link>
      </Button>

      {/* Article — Substack reading style */}
      <article>
        {/* Category + pin */}
        <div className="flex items-center gap-2 mb-3">
          {post.is_pinned && (
            <Badge
              variant="destructive"
              className="gap-1 text-[10px] px-1.5 py-0 h-5 rounded-full"
            >
              <Pin className="h-2.5 w-2.5" />
              고정
            </Badge>
          )}
          <span className="text-sm font-medium text-[#F75D5D]">
            {categoryLabels[post.category] || post.category}
          </span>
        </div>

        {/* Title */}
        <h1 className="text-2xl sm:text-3xl font-bold leading-tight text-gray-900">
          {post.title}
        </h1>

        {/* Author & date */}
        <div className="flex items-center gap-3 mt-4 pb-6 border-b border-gray-200">
          <div className="flex items-center justify-center h-9 w-9 rounded-full bg-[#FEF2F2] text-[#F75D5D] font-semibold text-sm">
            {((post.author as { name: string } | null)?.name || "관")[0]}
          </div>
          <div>
            <p className="text-sm font-medium">
              {(post.author as { name: string } | null)?.name || "관리자"}
            </p>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span>{formatDate(post.created_at)}</span>
              <span>·</span>
              <span className="flex items-center gap-0.5">
                <Eye className="h-3 w-3" />
                {post.view_count}
              </span>
              <span className="flex items-center gap-0.5">
                <ThumbsUp className="h-3 w-3" />
                {post.like_count}
              </span>
            </div>
          </div>
        </div>

        {/* Content body */}
        <div className="mt-6 text-base leading-[1.8] whitespace-pre-wrap text-gray-900/90">
          {post.content}
        </div>
      </article>

      {/* Comments */}
      <CommentSection postId={id} initialComments={comments} />
    </div>
  );
}
