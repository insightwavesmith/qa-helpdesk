"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Save, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { updateContent, deleteContent } from "@/actions/contents";
import { toast } from "sonner";
import type { Content } from "@/types/content";

interface ContentSettingsPanelProps {
  content: Content;
  onContentUpdate: () => void;
}

export default function ContentSettingsPanel({
  content,
  onContentUpdate,
}: ContentSettingsPanelProps) {
  const router = useRouter();
  const [status, setStatus] = useState(content.status);
  const [type, setType] = useState(content.type);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await updateContent(content.id, {
        status,
        type,
      });
      if (error) {
        toast.error("저장에 실패했습니다.");
      } else {
        setDirty(false);
        toast.success("설정이 저장되었습니다.");
        onContentUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const { error } = await deleteContent(content.id);
      if (error) {
        toast.error("삭제에 실패했습니다.");
      } else {
        toast.success("콘텐츠가 삭제되었습니다.");
        router.push("/admin/content");
      }
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      {/* 기본 설정 */}
      <Card>
        <CardContent className="p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900">기본 설정</h3>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">상태</label>
              <Select
                value={status}
                onValueChange={(v) => {
                  setStatus(v as Content["status"]);
                  setDirty(true);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">초안</SelectItem>
                  <SelectItem value="review">검수대기</SelectItem>
                  <SelectItem value="ready">발행가능</SelectItem>
                  <SelectItem value="published">게시완료</SelectItem>
                  <SelectItem value="archived">보관</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">유형</label>
              <Select
                value={type}
                onValueChange={(v) => {
                  setType(v as Content["type"]);
                  setDirty(true);
                }}
              >
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="education">교육</SelectItem>
                  <SelectItem value="case_study">고객사례</SelectItem>
                  <SelectItem value="webinar">웨비나</SelectItem>
                  <SelectItem value="notice">공지</SelectItem>
                  <SelectItem value="promo">홍보</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving || !dirty}
              className="bg-[#F75D5D] hover:bg-[#E54949] gap-1 text-xs"
            >
              {saving ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Save className="size-3.5" />
              )}
              저장
            </Button>
            {dirty && (
              <span className="text-xs text-amber-600 font-medium">
                변경사항 있음
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 소스 정보 (읽기 전용) */}
      {(content.source_type || content.source_ref) && (
        <Card>
          <CardContent className="p-5 space-y-3">
            <h3 className="text-sm font-semibold text-gray-900">소스 정보</h3>
            <div className="space-y-2 text-sm">
              {content.source_type && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">소스 유형</span>
                  <span className="text-xs text-gray-700">
                    {content.source_type}
                  </span>
                </div>
              )}
              {content.source_ref && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">소스 참조</span>
                  <span className="text-xs text-gray-700 max-w-[200px] truncate">
                    {content.source_ref}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 위험 영역 */}
      <Card className="border-red-200">
        <CardContent className="p-5 space-y-3">
          <h3 className="text-sm font-semibold text-red-600 flex items-center gap-1">
            <AlertTriangle className="size-4" />
            위험 영역
          </h3>
          <p className="text-xs text-gray-500">
            콘텐츠를 삭제하면 복구할 수 없습니다. 관련 배포 기록도 함께
            삭제됩니다.
          </p>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="border-red-300 text-red-600 hover:bg-red-50 gap-1 text-xs"
              >
                <Trash2 className="size-3.5" />
                콘텐츠 삭제
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>콘텐츠를 삭제하시겠습니까?</DialogTitle>
                <DialogDescription>
                  &ldquo;{content.title}&rdquo; 콘텐츠가 영구적으로
                  삭제됩니다. 이 작업은 되돌릴 수 없습니다.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeleteOpen(false)}
                >
                  취소
                </Button>
                <Button
                  size="sm"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 gap-1"
                >
                  {deleting ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="size-3.5" />
                  )}
                  삭제
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
