"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface AiWriteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGenerated: (result: {
    subject: string;
    content: string;
    sources: string[];
  }) => void;
}

const CATEGORIES = [
  { value: "meta-ads", label: "메타 광고" },
  { value: "ad-performance", label: "광고 성과" },
  { value: "store-ops", label: "자사몰 운영" },
  { value: "creative", label: "크리에이티브" },
  { value: "webinar", label: "웨비나" },
  { value: "custom", label: "직접 입력" },
];

const TONES = [
  { value: "educational", label: "교육적" },
  { value: "casual", label: "캐주얼" },
  { value: "urgent", label: "긴급" },
];

export default function AiWriteDialog({
  open,
  onOpenChange,
  onGenerated,
}: AiWriteDialogProps) {
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("educational");
  const [loading, setLoading] = useState(false);

  const handleGenerate = async () => {
    if (!category) {
      toast.error("카테고리를 선택해주세요.");
      return;
    }
    if (category === "custom" && !topic.trim()) {
      toast.error("주제를 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/admin/email/ai-write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          ...(topic.trim() && { topic: topic.trim() }),
          tone,
          template: "newsletter",
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        toast.error(result.error || "AI 생성에 실패했습니다.");
        return;
      }

      onGenerated(result);
    } catch {
      toast.error("AI 생성 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#F75D5D]" />
            AI 뉴스레터 작성
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* 카테고리 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">카테고리</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="카테고리를 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((cat) => (
                  <SelectItem key={cat.value} value={cat.value}>
                    {cat.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 주제 (선택) */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">
              주제 {category !== "custom" && <span className="text-gray-400">(선택)</span>}
            </label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={
                category === "custom"
                  ? "작성할 주제를 입력하세요"
                  : "세부 주제를 입력하세요 (선택)"
              }
            />
          </div>

          {/* 톤 */}
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium">톤</label>
            <Select value={tone} onValueChange={setTone}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TONES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* 생성 버튼 */}
          <Button
            onClick={handleGenerate}
            disabled={loading || !category}
            className="w-full bg-[#F75D5D] hover:bg-[#E54949]"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            {loading ? "생성 중..." : "생성하기"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
