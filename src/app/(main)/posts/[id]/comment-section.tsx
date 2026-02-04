"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { User } from "lucide-react";
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

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CommentSection({ postId, initialComments }: CommentSectionProps) {
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
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">댓글 {initialComments.length}개</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Comment List */}
        {initialComments.length === 0 ? (
          <p className="text-sm text-muted-foreground">아직 댓글이 없습니다.</p>
        ) : (
          <div className="space-y-3">
            {initialComments.map((comment) => (
              <div
                key={comment.id}
                className="flex gap-3 p-3 rounded-lg bg-muted/30"
              >
                <div className="flex items-center justify-center h-8 w-8 rounded-full bg-muted shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">
                      {comment.author?.name || "익명"}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(comment.created_at)}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{comment.content}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Comment Form */}
        <form onSubmit={handleSubmit} className="space-y-3 pt-3 border-t">
          <Textarea
            placeholder="댓글을 입력하세요..."
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            required
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={loading}>
              {loading ? "등록 중..." : "댓글 등록"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
