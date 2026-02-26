"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, FileText, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createInfoShareDraft } from "@/actions/curation";
import { useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";

interface GeneratePreviewModalProps {
  contentIds: string[];
  onClose: () => void;
}

export function GeneratePreviewModal({
  contentIds,
  onClose,
}: GeneratePreviewModalProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [category, setCategory] = useState("education");
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [error, setError] = useState("");

  // Sonnet 호출
  useEffect(() => {
    async function generate() {
      try {
        const res = await fetch("/api/admin/curation/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contentIds }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "생성 실패");
        setTitle(data.title);
        setBodyMd(data.body_md);
        if (data.thumbnail_url) setThumbnailUrl(data.thumbnail_url);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "정보공유 생성에 실패했습니다."
        );
      } finally {
        setLoading(false);
      }
    }
    generate();
  }, [contentIds]);

  const handleCreate = async () => {
    if (!title.trim() || !bodyMd.trim()) {
      toast.error("제목과 본문을 입력해주세요.");
      return;
    }
    setCreating(true);
    const { data, error: createError } = await createInfoShareDraft({
      title: title.trim(),
      bodyMd: bodyMd.trim(),
      category,
      sourceContentIds: contentIds,
      thumbnailUrl,
    });
    if (createError) {
      toast.error(createError);
      setCreating(false);
    } else {
      toast.success("정보공유 초안이 콘텐츠 탭에 생성되었습니다.");
      onClose();
      // 콘텐츠 상세 페이지로 이동
      if (data?.id) {
        router.push(`/admin/content/${data.id}?from=curation`);
      }
    }
  };

  return (
    <Dialog open onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>정보공유 미리보기</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-[#F75D5D] mb-3" />
            <p className="text-sm text-gray-500">
              Sonnet이 정보공유를 생성하고 있습니다...
            </p>
          </div>
        ) : error ? (
          <div className="py-8 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Button variant="outline" onClick={onClose}>
              닫기
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 제목 */}
            <div className="space-y-2">
              <Label>제목</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-lg font-semibold"
              />
            </div>

            {/* 카테고리 */}
            <div className="space-y-2">
              <Label>카테고리</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="education">교육</SelectItem>
                  <SelectItem value="case_study">고객사례</SelectItem>
                  <SelectItem value="notice">공지</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* 본문 — 미리보기/수정 토글 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>본문</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1"
                  onClick={() => setEditMode(!editMode)}
                >
                  {editMode ? (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      미리보기
                    </>
                  ) : (
                    <>
                      <Pencil className="h-3.5 w-3.5" />
                      수정하기
                    </>
                  )}
                </Button>
              </div>

              {editMode ? (
                <Textarea
                  value={bodyMd}
                  onChange={(e) => setBodyMd(e.target.value)}
                  className="min-h-[300px] font-mono text-sm"
                />
              ) : (
                <div className="prose prose-sm max-w-none border rounded-lg p-4 bg-gray-50 max-h-[400px] overflow-y-auto">
                  <ReactMarkdown>{bodyMd}</ReactMarkdown>
                </div>
              )}
            </div>

            {/* 안내 */}
            <p className="text-xs text-gray-400">
              초안으로 저장됩니다. 콘텐츠 탭에서 확인 후 게시할 수 있습니다.
            </p>

            {/* 액션 */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={onClose}>
                취소
              </Button>
              <Button
                onClick={handleCreate}
                disabled={creating}
                className="bg-[#F75D5D] hover:bg-[#E54949] gap-1.5"
              >
                {creating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {creating ? "생성 중..." : "생성"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
