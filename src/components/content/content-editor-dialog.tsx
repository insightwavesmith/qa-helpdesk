"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Save, Trash2, Send } from "lucide-react";
import { toast } from "sonner";
import { updateContent, deleteContent, publishToPost } from "@/actions/contents";
import type { Content } from "@/types/content";

interface ContentEditorDialogProps {
  content: Content | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

export default function ContentEditorDialog({
  content,
  open,
  onOpenChange,
  onSaved,
}: ContentEditorDialogProps) {
  const [title, setTitle] = useState("");
  const [bodyMd, setBodyMd] = useState("");
  const [category, setCategory] = useState("general");
  const [tagsInput, setTagsInput] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (content) {
      setTitle(content.title);
      setBodyMd(content.body_md);
      setCategory(content.category);
      setTagsInput(content.tags.join(", "));
      setStatus(content.status);
    }
  }, [content?.id]);

  const handleSave = async () => {
    if (!content) return;
    setSaving(true);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const { error } = await updateContent(content.id, {
        title,
        body_md: bodyMd,
        category,
        tags,
        status,
      });
      if (error) {
        toast.error(`저장 실패: ${error}`);
        return;
      }
      toast.success("저장되었습니다.");
      onSaved();
    } catch {
      toast.error("저장 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!content) return;
    setPublishing(true);
    try {
      const { error } = await publishToPost(content.id);
      if (error) {
        toast.error(`게시 실패: ${error}`);
        return;
      }
      toast.success("정보공유에 게시되었습니다.");
      onSaved();
    } catch {
      toast.error("게시 중 오류가 발생했습니다.");
    } finally {
      setPublishing(false);
    }
  };

  const handleDelete = async () => {
    if (!content) return;
    if (!confirm("정말 삭제하시겠습니까?")) return;
    setDeleting(true);
    try {
      const { error } = await deleteContent(content.id);
      if (error) {
        toast.error(`삭제 실패: ${error}`);
        return;
      }
      toast.success("삭제되었습니다.");
      onSaved();
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const isBusy = saving || publishing || deleting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>콘텐츠 편집</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 제목 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">제목</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="콘텐츠 제목"
            />
          </div>

          {/* 본문 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">본문 (Markdown)</label>
            <Textarea
              value={bodyMd}
              onChange={(e) => setBodyMd(e.target.value)}
              placeholder="본문 내용을 작성하세요..."
              rows={12}
            />
          </div>

          {/* 카테고리 + 상태 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">카테고리</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blueprint">블루프린트</SelectItem>
                  <SelectItem value="trend">트렌드</SelectItem>
                  <SelectItem value="insight">인사이트</SelectItem>
                  <SelectItem value="general">일반</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">상태</label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">초안</SelectItem>
                  <SelectItem value="review">검수대기</SelectItem>
                  <SelectItem value="ready">발행가능</SelectItem>
                  <SelectItem value="archived">보관</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 태그 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">
              태그 (콤마로 구분)
            </label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="태그1, 태그2, 태그3"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isBusy}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4 mr-2" />
            )}
            삭제
          </Button>
          <div className="flex-1" />
          <Button
            variant="outline"
            onClick={handlePublish}
            disabled={isBusy || status !== "ready"}
          >
            {publishing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            정보공유에 게시
          </Button>
          <Button
            onClick={handleSave}
            disabled={isBusy}
            className="bg-[#F75D5D] hover:bg-[#E54949]"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
