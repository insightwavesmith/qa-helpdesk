"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { MessageCircle, Send } from "lucide-react";
import { createComment } from "@/actions/posts";
import { toast } from "sonner";

interface Comment {
  id: string;
  content: string;
  created_at: string;
  author?: { id: string; name: string; shop_name?: string } | null;
}

interface CommentSectionProps {
  postId: string;
  initialComments: Comment[];
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

export function CommentSection({
  postId,
  initialComments,
}: CommentSectionProps) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error("댓글 내용을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await createComment({
        postId,
        content: content.trim(),
      });

      if (error) {
        toast.error(`댓글 등록 실패: ${error}`);
      } else {
        toast.success("댓글이 등록되었습니다.");
        setContent("");
        router.refresh();
      }
    } catch {
      toast.error("댓글 등록 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <MessageCircle className="h-5 w-5" />
        <h2 className="text-lg font-bold">
          댓글 {initialComments.length}개
        </h2>
      </div>

      {/* Comment List */}
      {initialComments.length > 0 && (
        <div className="space-y-1 mb-6">
          {initialComments.map((comment) => (
            <div
              key={comment.id}
              className="py-4 border-b last:border-b-0"
            >
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center h-7 w-7 rounded-full bg-muted text-xs font-medium">
                  {(comment.author?.name || "익")[0]}
                </div>
                <span className="text-sm font-medium">
                  {comment.author?.name || "익명"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {timeAgo(comment.created_at)}
                </span>
              </div>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap pl-9">
                {comment.content}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Comment Form */}
      <div className="rounded-xl border p-5">
        <h3 className="text-base font-semibold mb-3">댓글 작성</h3>
        <form onSubmit={handleSubmit} className="space-y-3">
          <Textarea
            placeholder="댓글을 입력하세요..."
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="resize-none text-[15px] leading-relaxed"
            required
          />
          <div className="flex justify-end">
            <Button
              type="submit"
              size="sm"
              disabled={loading}
              className="rounded-full gap-2"
            >
              <Send className="h-3.5 w-3.5" />
              {loading ? "등록 중..." : "댓글 등록"}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}
