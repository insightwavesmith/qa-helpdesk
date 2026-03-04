"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  X,
  Send,
  ImagePlus,
  Loader2,
  Trash2,
  List,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { createQaReport } from "@/actions/qa-reports";
import { QaReportList } from "./QaReportList";

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  imageUrls?: string[];
  timestamp: Date;
}

interface PendingQaReport {
  title: string;
  description: string;
  severity: string;
  rawMessage: string;
  imageUrls: string[];
}

interface QaChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

const SEVERITY_CONFIG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  critical: { label: "심각", color: "text-red-700", bg: "bg-red-100" },
  high: { label: "높음", color: "text-orange-700", bg: "bg-orange-100" },
  medium: { label: "보통", color: "text-yellow-700", bg: "bg-yellow-100" },
  low: { label: "낮음", color: "text-green-700", bg: "bg-green-100" },
};

const MAX_IMAGES = 3;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function QaChatPanel({ isOpen, onClose }: QaChatPanelProps) {
  const [activeTab, setActiveTab] = useState<"chat" | "list">("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [pendingReport, setPendingReport] = useState<PendingQaReport | null>(
    null
  );
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState("");
  const [pendingImages, setPendingImages] = useState<
    { file: File; preview: string }[]
  >([]);
  const [isSaving, setIsSaving] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, pendingReport, scrollToBottom]);

  // 이미지 업로드 (Supabase Storage)
  const uploadImages = async (files: { file: File }[]): Promise<string[]> => {
    if (files.length === 0) return [];

    const supabase = createClient();
    const urls: string[] = [];

    for (const img of files) {
      const ext = img.file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const filePath = `qa-screenshots/${fileName}`;

      const { error } = await supabase.storage
        .from("question-images")
        .upload(filePath, img.file, {
          cacheControl: "3600",
          upsert: false,
        });

      if (error) {
        console.error("이미지 업로드 실패:", error);
        throw new Error(`이미지 업로드 실패: ${img.file.name}`);
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from("question-images").getPublicUrl(filePath);

      urls.push(publicUrl);
    }

    return urls;
  };

  // 이미지 선택
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((f) => {
      if (f.size > MAX_FILE_SIZE) {
        alert(`${f.name}: 5MB 이하만 가능합니다.`);
        return false;
      }
      if (!f.type.startsWith("image/")) {
        alert(`${f.name}: 이미지 파일만 가능합니다.`);
        return false;
      }
      return true;
    });

    const remaining = MAX_IMAGES - pendingImages.length;
    const toAdd = validFiles.slice(0, remaining);

    const newImages = toAdd.map((file) => ({
      file,
      preview: URL.createObjectURL(file),
    }));

    setPendingImages((prev) => [...prev, ...newImages]);

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // 이미지 제거
  const removeImage = (index: number) => {
    setPendingImages((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].preview);
      updated.splice(index, 1);
      return updated;
    });
  };

  // 메시지 전송
  const handleSend = async () => {
    const text = inputText.trim();
    if (!text && pendingImages.length === 0) return;
    if (isLoading) return;

    setIsLoading(true);
    const msgId = `msg-${Date.now()}`;

    // 이미지 업로드
    let imageUrls: string[] = [];
    try {
      if (pendingImages.length > 0) {
        imageUrls = await uploadImages(pendingImages);
      }
    } catch {
      alert("이미지 업로드에 실패했습니다. 텍스트만 전송합니다.");
      imageUrls = [];
    }

    // 사용자 메시지 추가
    const userMessage: ChatMessage = {
      id: msgId,
      role: "user",
      content: text,
      imageUrls,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputText("");
    setPendingImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.preview));
      return [];
    });

    try {
      // AI 분석 요청
      const res = await fetch("/api/qa-chatbot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          imageUrls,
          pageUrl: typeof window !== "undefined" ? window.location.href : undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg =
          (errData as { error?: string }).error ||
          "AI 분석에 실패했습니다. 다시 시도해주세요.";
        setMessages((prev) => [
          ...prev,
          {
            id: `ai-err-${Date.now()}`,
            role: "ai",
            content: errMsg,
            timestamp: new Date(),
          },
        ]);
        setIsLoading(false);
        return;
      }

      const result = (await res.json()) as {
        title: string;
        description: string;
        severity: string;
      };

      // AI 응답 메시지 추가
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-${Date.now()}`,
          role: "ai",
          content: `QA 항목이 정리되었습니다.`,
          timestamp: new Date(),
        },
      ]);

      // 대기 중 리포트 설정
      setPendingReport({
        title: result.title,
        description: result.description,
        severity: result.severity,
        rawMessage: text,
        imageUrls,
      });
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai-err-${Date.now()}`,
          role: "ai",
          content: "AI 분석에 실패했습니다. 다시 시도해주세요.",
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  // QA 리포트 제출
  const handleSubmitReport = async () => {
    if (!pendingReport || isSaving) return;

    setIsSaving(true);
    try {
      const result = await createQaReport({
        rawMessage: pendingReport.rawMessage,
        title: pendingReport.title,
        description: isEditing ? editDescription : pendingReport.description,
        severity: pendingReport.severity,
        imageUrls: pendingReport.imageUrls,
      });

      if ("error" in result) {
        alert(result.error);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          role: "ai",
          content: "QA 리포트가 저장되었습니다.",
          timestamp: new Date(),
        },
      ]);
      setPendingReport(null);
      setIsEditing(false);
      setEditDescription("");
    } catch {
      alert("저장에 실패했습니다. 다시 시도해주세요.");
    } finally {
      setIsSaving(false);
    }
  };

  // 리포트 취소
  const handleCancelReport = () => {
    setPendingReport(null);
    setIsEditing(false);
    setEditDescription("");
  };

  // 편집 모드 진입
  const handleEditReport = () => {
    if (!pendingReport) return;
    setEditDescription(pendingReport.description);
    setIsEditing(true);
  };

  // 키보드 전송
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-20 right-6 z-50 flex w-[380px] flex-col rounded-2xl border border-gray-200 bg-white shadow-2xl max-md:bottom-0 max-md:right-0 max-md:left-0 max-md:w-full max-md:rounded-b-none max-md:h-[70vh] md:h-[520px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h3 className="text-sm font-semibold text-gray-900">QA 리포팅</h3>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab("chat")}
            className={`rounded-md p-1.5 transition-colors ${activeTab === "chat" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
            aria-label="채팅"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            onClick={() => setActiveTab("list")}
            className={`rounded-md p-1.5 transition-colors ${activeTab === "list" ? "bg-gray-100 text-gray-900" : "text-gray-400 hover:text-gray-600"}`}
            aria-label="목록"
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-gray-400 transition-colors hover:text-gray-600"
            aria-label="닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {activeTab === "list" ? (
        <QaReportList />
      ) : (
        <>
          {/* 채팅 영역 */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            {messages.length === 0 && !pendingReport && (
              <div className="flex h-full items-center justify-center">
                <p className="text-center text-sm text-gray-400">
                  QA 이슈를 입력하세요.
                  <br />
                  AI가 구조화된 리포트로 정리합니다.
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-[#F75D5D] text-white"
                      : "bg-gray-100 text-gray-800"
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  {msg.imageUrls && msg.imageUrls.length > 0 && (
                    <div className="mt-2 flex gap-1">
                      {msg.imageUrls.map((url, i) => (
                        <img
                          key={i}
                          src={url}
                          alt={`첨부 ${i + 1}`}
                          className="h-16 w-16 rounded-md object-cover"
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* 로딩 */}
            {isLoading && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-2 text-sm text-gray-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  AI 분석 중...
                </div>
              </div>
            )}

            {/* QA 리포트 카드 (대기 중) */}
            {pendingReport && (
              <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    className={`${SEVERITY_CONFIG[pendingReport.severity]?.bg || "bg-gray-100"} ${SEVERITY_CONFIG[pendingReport.severity]?.color || "text-gray-700"} border-0 text-xs`}
                  >
                    {SEVERITY_CONFIG[pendingReport.severity]?.label ||
                      pendingReport.severity}
                  </Badge>
                  <span className="text-sm font-medium text-gray-900">
                    {pendingReport.title}
                  </span>
                </div>

                {isEditing ? (
                  <textarea
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    className="mb-2 w-full rounded-md border border-gray-200 p-2 text-sm focus:border-[#F75D5D] focus:outline-none focus:ring-1 focus:ring-[#F75D5D]"
                    rows={4}
                  />
                ) : (
                  <p className="mb-2 text-xs text-gray-600 whitespace-pre-wrap">
                    {pendingReport.description}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSubmitReport}
                    disabled={isSaving}
                    className="h-7 bg-[#F75D5D] text-xs hover:bg-[#E54949]"
                  >
                    {isSaving ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      "제출"
                    )}
                  </Button>
                  {!isEditing && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleEditReport}
                      className="h-7 text-xs"
                    >
                      수정
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleCancelReport}
                    className="h-7 text-xs text-gray-400"
                  >
                    취소
                  </Button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* 이미지 미리보기 */}
          {pendingImages.length > 0 && (
            <div className="flex gap-2 border-t px-4 py-2">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={img.preview}
                    alt={`미리보기 ${i + 1}`}
                    className="h-12 w-12 rounded-md object-cover"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-white"
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* 입력 영역 */}
          <div className="border-t px-3 py-2">
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleImageSelect}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={pendingImages.length >= MAX_IMAGES || isLoading}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-30"
                aria-label="이미지 첨부"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <textarea
                ref={textareaRef}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="QA 이슈를 입력하세요..."
                disabled={isLoading}
                rows={1}
                className="max-h-24 min-h-[36px] flex-1 resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#F75D5D] focus:outline-none focus:ring-1 focus:ring-[#F75D5D] disabled:opacity-50"
              />
              <button
                onClick={handleSend}
                disabled={
                  isLoading ||
                  (!inputText.trim() && pendingImages.length === 0)
                }
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F75D5D] text-white transition-colors hover:bg-[#E54949] disabled:opacity-30"
                aria-label="전송"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
