"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Loader2, Sparkles, Check, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { reviseContentWithAI, updateContent } from "@/actions/contents";
import { toast } from "sonner";

interface AiEditPanelProps {
  contentId: string;
  bodyMd: string;
  emailSummary: string | null;
  onApplied: () => void;
}

export default function AiEditPanel({
  contentId,
  bodyMd,
  emailSummary,
  onApplied,
}: AiEditPanelProps) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<"body_md" | "email_summary">("body_md");
  const [instruction, setInstruction] = useState("");
  const [loading, setLoading] = useState(false);
  const [revised, setRevised] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const handleRequest = async () => {
    if (!instruction.trim()) {
      toast.error("수정 지시를 입력해주세요.");
      return;
    }

    setLoading(true);
    setRevised(null);

    const result = await reviseContentWithAI(contentId, target, instruction);

    if ("error" in result) {
      toast.error(result.error);
    } else {
      setRevised(result.revised);
    }

    setLoading(false);
  };

  const handleApply = async () => {
    if (!revised) return;

    setApplying(true);

    const field = target === "body_md" ? { body_md: revised } : { email_summary: revised };
    const { error } = await updateContent(contentId, field);

    if (error) {
      toast.error("적용에 실패했습니다.");
    } else {
      toast.success("수정본이 적용되었습니다.");
      setRevised(null);
      setInstruction("");
      onApplied();
    }

    setApplying(false);
  };

  const handleRetry = () => {
    setRevised(null);
    handleRequest();
  };

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* 토글 버튼 */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        {open ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
        <Sparkles className="size-4 text-amber-500" />
        AI 수정 요청
      </button>

      {open && (
        <div className="p-4 space-y-4 border-t border-gray-200">
          {/* 대상 선택 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">대상</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="ai-edit-target"
                  checked={target === "body_md"}
                  onChange={() => setTarget("body_md")}
                  className="accent-[#F75D5D]"
                />
                본문
              </label>
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input
                  type="radio"
                  name="ai-edit-target"
                  checked={target === "email_summary"}
                  onChange={() => setTarget("email_summary")}
                  className="accent-[#F75D5D]"
                />
                이메일 요약
              </label>
            </div>
          </div>

          {/* 경고: email_summary가 없을 때 */}
          {target === "email_summary" && !emailSummary && (
            <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-md">
              이메일 요약이 없습니다. 먼저 생성해주세요.
            </p>
          )}

          {/* 수정 지시 입력 */}
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">
              수정 지시
            </Label>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder={'예: "도입부 더 강하게 써줘"\n예: "배너키 INSIGHT, KEY POINT 넣어"'}
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {/* 요청 버튼 */}
          <Button
            size="sm"
            onClick={handleRequest}
            disabled={loading || !instruction.trim() || (target === "email_summary" && !emailSummary)}
            className="bg-[#F75D5D] hover:bg-[#E54949] gap-1.5"
          >
            {loading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {loading ? "수정 중..." : "수정 요청하기"}
          </Button>

          {/* 수정 결과 미리보기 */}
          {revised && (
            <div className="space-y-3">
              <div className="text-xs font-medium text-gray-500 border-t pt-3">
                수정 결과
              </div>
              <div className="max-h-[400px] overflow-y-auto rounded-md border border-gray-200 bg-white p-4 text-sm leading-relaxed whitespace-pre-wrap">
                {revised}
              </div>

              {/* 적용 / 다시 요청 버튼 */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={handleApply}
                  disabled={applying}
                  className="bg-[#F75D5D] hover:bg-[#E54949] gap-1.5"
                >
                  {applying ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}
                  적용하기
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRetry}
                  disabled={loading}
                  className="gap-1.5"
                >
                  <RotateCcw className="size-3.5" />
                  다시 요청
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
