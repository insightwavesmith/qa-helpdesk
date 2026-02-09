"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getContents, generateNewsletterFromContents } from "@/actions/contents";
import type { Content } from "@/types/content";

interface ContentPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (result: { html: string; subject: string }) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  all: "전체",
  education: "교육",
  notice: "공지",
  case_study: "고객사례",
  newsletter: "뉴스레터",
};

export default function ContentPickerDialog({
  open,
  onOpenChange,
  onImport,
}: ContentPickerDialogProps) {
  const [contents, setContents] = useState<Content[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [category, setCategory] = useState("all");

  useEffect(() => {
    if (!open) return;
    setSelectedIds(new Set());
    setCategory("all");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const load = async () => {
      setLoading(true);
      const params: { status?: string; category?: string } = { status: "ready,published" };
      if (category !== "all") params.category = category;
      const { data, error } = await getContents(params);
      if (error) {
        toast.error("콘텐츠 목록을 불러올 수 없습니다.");
        setLoading(false);
        return;
      }
      setContents((data as Content[]) || []);
      setLoading(false);
    };
    load();
  }, [open, category]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;

    setGenerating(true);
    try {
      const html = await generateNewsletterFromContents(
        Array.from(selectedIds)
      );
      onImport({
        html,
        subject: "[BS CAMP] 이번 주 콘텐츠 모음",
      });
    } catch {
      toast.error("뉴스레터 생성에 실패했습니다.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-[16px]">
            콘텐츠에서 가져오기
          </DialogTitle>
        </DialogHeader>

        {/* Category Filter */}
        <div className="flex items-center gap-3">
          <span className="text-[13px] font-medium text-gray-600 shrink-0">
            카테고리
          </span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Content List */}
        <div className="flex-1 overflow-y-auto min-h-0 border border-gray-200 rounded-md">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              불러오는 중...
            </div>
          ) : contents.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-[14px] text-gray-400">
              사용 가능한 콘텐츠가 없습니다.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {contents.map((item) => (
                <label
                  key={item.id}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer"
                >
                  <Checkbox
                    checked={selectedIds.has(item.id)}
                    onCheckedChange={() => toggleId(item.id)}
                  />
                  <span className="flex-1 text-[14px] text-gray-900 truncate">
                    {item.title}
                  </span>
                  <Badge variant="secondary" className="text-[11px] shrink-0">
                    {CATEGORY_LABELS[item.category] || item.category}
                  </Badge>
                  <span className="text-[12px] text-gray-400 shrink-0">
                    {new Date(item.created_at).toLocaleDateString("ko-KR", {
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-[13px] text-gray-500">
            {selectedIds.size > 0
              ? `${selectedIds.size}개 선택됨`
              : "콘텐츠를 선택해주세요"}
          </span>
          <Button
            onClick={handleImport}
            disabled={selectedIds.size === 0 || generating}
            className="bg-[#F75D5D] hover:bg-[#E54949]"
          >
            {generating && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            선택된 {selectedIds.size}개 가져오기
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
