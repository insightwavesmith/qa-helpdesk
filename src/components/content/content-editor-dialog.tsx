"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { Content, ContentType, ContentCategory } from "@/types/content";

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
  const [summary, setSummary] = useState("");
  const [contentType, setContentType] = useState<ContentType>("info");
  const [category, setCategory] = useState<ContentCategory>("education");
  const [tagsInput, setTagsInput] = useState("");
  const [status, setStatus] = useState<string>("draft");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (content) {
      setTitle(content.title);
      setBodyMd(content.body_md);
      setSummary(content.summary || "");
      setContentType(content.type || "info");
      setCategory(content.category || "education");
      setTagsInput(content.tags.join(", "));
      setStatus(content.status);
    }
  }, [content?.id]);

  const handleStatusChange = (newStatus: string) => {
    if (newStatus === "ready") {
      if (!bodyMd.trim() || !summary.trim() || !contentType) {
        toast.error("본문, 요약, 타입을 모두 입력해주세요.");
        return;
      }
    }
    setStatus(newStatus);
  };

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
        summary: summary || null,
        type: contentType,
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

          {/* 타입 + 카테고리 */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">타입</label>
              <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">정보</SelectItem>
                  <SelectItem value="result">성과</SelectItem>
                  <SelectItem value="promo">홍보</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-medium">카테고리</label>
              <Select value={category} onValueChange={(v) => setCategory(v as ContentCategory)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="education">교육</SelectItem>
                  <SelectItem value="news">소식</SelectItem>
                  <SelectItem value="case-study">수강생 사례</SelectItem>
                  <SelectItem value="webinar">웨비나</SelectItem>
                  <SelectItem value="recruitment">모집</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 태그 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">태그 (콤마로 구분)</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="태그1, 태그2, 태그3"
            />
          </div>

          {/* 탭: 정보공유용 본문 / 뉴스레터용 요약 */}
          <Tabs defaultValue="body" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="body">정보공유용</TabsTrigger>
              <TabsTrigger value="summary">뉴스레터용</TabsTrigger>
            </TabsList>
            <TabsContent value="body" className="mt-3">
              <Textarea
                value={bodyMd}
                onChange={(e) => setBodyMd(e.target.value)}
                placeholder="정보공유 게시판에 올라가는 긴 버전을 작성하세요..."
                rows={14}
                className="min-h-[280px]"
              />
            </TabsContent>
            <TabsContent value="summary" className="mt-3">
              <Textarea
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="뉴스레터에 들어가는 짧은 버전을 작성하세요..."
                rows={8}
                className="min-h-[160px]"
              />
            </TabsContent>
          </Tabs>

          {/* 상태 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">상태</label>
            <Select value={status} onValueChange={handleStatusChange}>
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
            {status !== "ready" && (
              <p className="text-[11px] text-gray-400">
                &ldquo;발행가능&rdquo;으로 변경하려면 본문 + 요약 + 타입 모두 필요
              </p>
            )}
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
