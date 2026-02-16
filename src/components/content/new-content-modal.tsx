"use client";

import { useState, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Globe,
  Sparkles,
  Upload,
  Edit3,
  ArrowLeft,
  Loader2,
} from "lucide-react";
import { createContent, crawlUrl, generateContentWithAI } from "@/actions/contents";
import type { ContentType } from "@/types/content";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface NewContentModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}

type FlowStep = "select" | "url" | "ai" | "upload";

const CARDS = [
  {
    id: "url" as const,
    icon: Globe,
    title: "URL에서 가져오기",
    description: "웹 페이지 URL을 입력하면 내용을 자동으로 가져옵니다",
  },
  {
    id: "ai" as const,
    icon: Sparkles,
    title: "AI로 작성",
    description: "주제를 입력하면 AI가 콘텐츠를 자동 생성합니다",
  },
  {
    id: "upload" as const,
    icon: Upload,
    title: "파일 업로드",
    description: ".md 또는 .txt 파일을 업로드하여 콘텐츠를 생성합니다",
  },
  {
    id: "direct" as const,
    icon: Edit3,
    title: "직접 작성",
    description: "빈 에디터에서 콘텐츠를 직접 작성합니다",
  },
] as const;

export default function NewContentModal({
  open,
  onOpenChange,
  onCreated,
}: NewContentModalProps) {
  const [step, setStep] = useState<FlowStep>("select");
  const [loading, setLoading] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [contentType, setContentType] = useState<ContentType>("education");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const resetState = useCallback(() => {
    setStep("select");
    setLoading(false);
    setUrlInput("");
    setTopicInput("");
    setContentType("education");
  }, []);

  const handleOpenChange = useCallback(
    (v: boolean) => {
      if (!v) resetState();
      onOpenChange(v);
    },
    [onOpenChange, resetState]
  );

  const handleCreate = useCallback(
    async (title: string, bodyMd: string, sourceType?: string, sourceRef?: string, emailSummary?: string) => {
      setLoading(true);
      try {
        const { data, error } = await createContent({
          title,
          body_md: bodyMd,
          type: contentType,
          source_type: sourceType || null,
          source_ref: sourceRef || null,
          email_summary: emailSummary || null,
        });
        if (error || !data) {
          toast.error(error || "콘텐츠 생성에 실패했습니다.");
          return;
        }
        toast.success("콘텐츠가 생성되었습니다.");
        handleOpenChange(false);
        onCreated(data.id);
      } catch {
        toast.error("콘텐츠 생성에 실패했습니다.");
      } finally {
        setLoading(false);
      }
    },
    [handleOpenChange, onCreated, contentType]
  );

  const handleCardClick = useCallback(
    async (cardId: string) => {
      if (cardId === "direct") {
        await handleCreate("새 콘텐츠", "");
      } else {
        setStep(cardId as FlowStep);
      }
    },
    [handleCreate]
  );

  const handleCrawl = useCallback(async () => {
    if (!urlInput.trim()) {
      toast.error("URL을 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const result = await crawlUrl(urlInput.trim());
      if ("error" in result) {
        toast.error(result.error);
        setLoading(false);
        return;
      }
      await handleCreate(result.title, result.bodyMd, "url", urlInput.trim());
    } catch {
      toast.error("URL 크롤링에 실패했습니다.");
      setLoading(false);
    }
  }, [urlInput, handleCreate]);

  const handleGenerate = useCallback(async () => {
    if (!topicInput.trim()) {
      toast.error("주제를 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const result = await generateContentWithAI(topicInput.trim(), contentType);
      if ("error" in result) {
        toast.error(result.error);
        setLoading(false);
        return;
      }
      await handleCreate(result.title, result.bodyMd, "ai", topicInput.trim());
    } catch {
      toast.error("AI 생성에 실패했습니다.");
      setLoading(false);
    }
  }, [topicInput, contentType, handleCreate]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      if (!file.name.endsWith(".md") && !file.name.endsWith(".txt")) {
        toast.error(".md 또는 .txt 파일만 업로드 가능합니다.");
        return;
      }
      setLoading(true);
      try {
        const text = await file.text();
        const title = file.name.replace(/\.(md|txt)$/, "");
        await handleCreate(title, text, "file", file.name);
      } catch {
        toast.error("파일 읽기에 실패했습니다.");
        setLoading(false);
      }
    },
    [handleCreate]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(file);
    },
    [handleFileUpload]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step !== "select" && (
              <Button
                variant="ghost"
                size="sm"
                className="size-8 p-0"
                onClick={() => setStep("select")}
                disabled={loading}
              >
                <ArrowLeft className="size-4" />
              </Button>
            )}
            {step === "select" && "새 콘텐츠 만들기"}
            {step === "url" && "URL에서 가져오기"}
            {step === "ai" && "AI로 작성"}
            {step === "upload" && "파일 업로드"}
          </DialogTitle>
          <DialogDescription className="sr-only">
            콘텐츠 생성 방법을 선택하세요
          </DialogDescription>
        </DialogHeader>

        {step === "select" && (
          <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-[13px] font-medium text-gray-700">콘텐츠 유형</label>
            <Select value={contentType} onValueChange={(v) => setContentType(v as ContentType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="education">📚 교육</SelectItem>
                <SelectItem value="case_study">📊 고객사례</SelectItem>
                <SelectItem value="webinar">🎓 웨비나</SelectItem>
                <SelectItem value="notice">📢 공지</SelectItem>
                <SelectItem value="promo">🎯 홍보</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {CARDS.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  type="button"
                  className="flex flex-col items-start gap-2 rounded-lg border border-gray-200 p-5 text-left transition hover:border-[#F75D5D] hover:shadow-sm cursor-pointer disabled:opacity-50"
                  onClick={() => handleCardClick(card.id)}
                  disabled={loading}
                >
                  <div className="flex size-10 items-center justify-center rounded-lg bg-gray-50">
                    <Icon className="size-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {card.title}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
          </div>
        )}

        {step === "url" && (
          <div className="space-y-4 pt-2">
            <Input
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/article"
              disabled={loading}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCrawl();
              }}
            />
            <Button
              onClick={handleCrawl}
              disabled={loading || !urlInput.trim()}
              className="w-full bg-[#F75D5D] hover:bg-[#E54949]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  가져오는 중...
                </>
              ) : (
                "가져오기"
              )}
            </Button>
          </div>
        )}

        {step === "ai" && (
          <div className="space-y-4 pt-2">
            <Textarea
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              placeholder={"예: 메타 광고 리타겟팅 전략\n\n상세한 지시사항이나 참고 자료를 자유롭게 입력하세요."}
              disabled={loading}
              rows={6}
              className="min-h-[160px] resize-y"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate();
              }}
            />
            <p className="text-xs text-gray-400">Cmd+Enter로 생성</p>
            <Button
              onClick={handleGenerate}
              disabled={loading || !topicInput.trim()}
              className="w-full bg-[#F75D5D] hover:bg-[#E54949]"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  생성 중...
                </>
              ) : (
                "생성하기"
              )}
            </Button>
          </div>
        )}

        {step === "upload" && (
          <div className="space-y-4 pt-2">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 transition hover:border-[#F75D5D] hover:bg-gray-100"
            >
              {loading ? (
                <Loader2 className="size-8 animate-spin text-gray-400" />
              ) : (
                <>
                  <Upload className="mb-2 size-8 text-gray-400" />
                  <p className="text-sm font-medium text-gray-600">
                    파일을 드래그하거나 클릭하세요
                  </p>
                  <p className="mt-1 text-xs text-gray-400">
                    .md, .txt 파일 지원
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md,.txt"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileUpload(file);
              }}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
