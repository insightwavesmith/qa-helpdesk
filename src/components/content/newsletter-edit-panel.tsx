"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Send,
  TestTube,
  FileDown,
  Sparkles,
  Save,
  Eye,
} from "lucide-react";
import { updateContent, updateContentEmailSentAt } from "@/actions/contents";
import { toast } from "sonner";
import { ensureMarkdown } from "@/lib/html-to-markdown";
import { newsletterTemplate } from "@/lib/email-templates";
import type { Content } from "@/types/content";

const MDXEditorComponent = dynamic(
  () => import("./mdx-editor-wrapper"),
  {
    ssr: false,
    loading: () => (
      <div className="h-[400px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        에디터 로딩 중...
      </div>
    ),
  }
);

const CTA_PRESETS = [
  { id: "read_more", label: "전체글 읽기", text: "전체 글 읽기 →", urlTemplate: "/posts/{id}" },
  { id: "webinar", label: "웨비나 신청", text: "웨비나 신청하기 →", urlTemplate: "" },
  { id: "notice", label: "공지사항", text: "공지사항 보기 →", urlTemplate: "/notices" },
  { id: "custom", label: "직접 입력", text: "", urlTemplate: "" },
] as const;

interface RecipientStats {
  leads: number;
  students: number;
  members: number;
  total: number;
}

interface NewsletterEditPanelProps {
  content: Content;
  onContentUpdate: () => void;
}

/** 간단한 마크다운 → HTML 변환 (미리보기용) */
function mdToPreviewHtml(md: string): string {
  return md
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return "<br/>";
      if (trimmed.startsWith("### "))
        return `<h3 style="font-size:16px;font-weight:bold;margin:12px 0 4px">${trimmed.slice(4)}</h3>`;
      if (trimmed.startsWith("## "))
        return `<h2 style="font-size:18px;font-weight:bold;margin:12px 0 4px">${trimmed.slice(3)}</h2>`;
      if (trimmed.startsWith("# "))
        return `<h1 style="font-size:20px;font-weight:bold;margin:12px 0 4px">${trimmed.slice(2)}</h1>`;
      if (/^[-*]\s/.test(trimmed))
        return `<li style="margin-left:16px;font-size:14px;line-height:1.6">${applyInline(trimmed.slice(2))}</li>`;
      return `<p style="font-size:14px;line-height:1.6;margin:4px 0">${applyInline(trimmed)}</p>`;
    })
    .join("\n");
}

function applyInline(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" style="color:#F75D5D;text-decoration:underline">$1</a>'
    );
}

export default function NewsletterEditPanel({
  content,
  onContentUpdate,
}: NewsletterEditPanelProps) {
  const initialSummary = useMemo(
    () => ensureMarkdown(content.email_summary || ""),
    [content.email_summary]
  );
  const [emailSummary, setEmailSummary] = useState(initialSummary);
  const [emailSubject, setEmailSubject] = useState(
    content.email_subject || content.title
  );
  const [target, setTarget] = useState<string>("all_leads");
  const [recipientStats, setRecipientStats] = useState<RecipientStats | null>(
    null
  );
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const defaultCtaText = "전체 글 읽기 →";
  const defaultCtaUrl = `${siteUrl}/posts/${content.id}`;

  const [ctaText, setCtaText] = useState(content.email_cta_text || defaultCtaText);
  const [ctaUrl, setCtaUrl] = useState(content.email_cta_url || defaultCtaUrl);
  const [ctaPreset, setCtaPreset] = useState<string>(() => {
    const saved = content.email_cta_text;
    if (!saved) return "read_more";
    const found = CTA_PRESETS.find((p) => p.text === saved);
    return found ? found.id : "custom";
  });

  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [editorKey, setEditorKey] = useState(0);
  const mountedRef = useRef(false);
  const lastSavedSummaryRef = useRef(initialSummary);
  const lastSavedSubjectRef = useRef(content.email_subject || content.title);
  const lastSavedCtaTextRef = useRef(content.email_cta_text || defaultCtaText);
  const lastSavedCtaUrlRef = useRef(content.email_cta_url || defaultCtaUrl);

  useEffect(() => {
    fetch("/api/admin/email/recipients")
      .then((r) => r.json())
      .then((data) => {
        if (!data.error) setRecipientStats(data);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    mountedRef.current = true;
  }, []);

  const checkDirty = useCallback(
    (summary: string, subject: string, cText: string, cUrl: string) => {
      setDirty(
        summary !== lastSavedSummaryRef.current ||
        subject !== lastSavedSubjectRef.current ||
        cText !== lastSavedCtaTextRef.current ||
        cUrl !== lastSavedCtaUrlRef.current
      );
    },
    []
  );

  const handleEditorChange = useCallback(
    (md: string) => {
      setEmailSummary(md);
      if (!mountedRef.current) return;
      checkDirty(md, emailSubject, ctaText, ctaUrl);
    },
    [emailSubject, ctaText, ctaUrl, checkDirty]
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await updateContent(content.id, {
        email_summary: emailSummary,
        email_subject: emailSubject,
        email_cta_text: ctaText,
        email_cta_url: ctaUrl,
      });
      if (error) {
        toast.error("저장에 실패했습니다.");
      } else {
        lastSavedSummaryRef.current = emailSummary;
        lastSavedSubjectRef.current = emailSubject;
        lastSavedCtaTextRef.current = ctaText;
        lastSavedCtaUrlRef.current = ctaUrl;
        setDirty(false);
        toast.success("뉴스레터 내용이 저장되었습니다.");
        onContentUpdate();
      }
    } finally {
      setSaving(false);
    }
  };

  const [summarizing, setSummarizing] = useState(false);

  const handleImportFromPost = async () => {
    if (!content.body_md) {
      toast.error("정보공유 본문이 비어 있습니다.");
      return;
    }
    setSummarizing(true);
    try {
      const res = await fetch("/api/admin/content/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content_id: content.id }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setEmailSummary(data.summary);
        setEditorKey((k) => k + 1);
        setDirty(true);
        toast.success("AI 요약이 생성되었습니다.");
      }
    } catch {
      toast.error("AI 요약 생성에 실패했습니다.");
    } finally {
      setSummarizing(false);
    }
  };

  const getRecipientCount = (): number => {
    if (!recipientStats) return 0;
    switch (target) {
      case "all_leads":
        return recipientStats.leads;
      case "all_students":
        return recipientStats.students;
      case "all_members":
        return recipientStats.members;
      case "all":
        return recipientStats.total;
      default:
        return 0;
    }
  };

  const handleTestSend = async () => {
    if (dirty) {
      toast.error("먼저 저장해주세요.");
      return;
    }
    setTestSending(true);
    try {
      const previewHtml = mdToPreviewHtml(emailSummary);
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target: "custom",
          customEmails: ["smith.kim@inwv.co"],
          subject: `[테스트] ${emailSubject}`,
          template: "newsletter",
          templateProps: {
            bodyHtml: previewHtml,
            ctaText: ctaText || undefined,
            ctaUrl: ctaUrl || undefined,
          },
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success("테스트 이메일이 발송되었습니다.");
      }
    } catch {
      toast.error("테스트 발송에 실패했습니다.");
    } finally {
      setTestSending(false);
    }
  };

  const handleSend = async () => {
    if (dirty) {
      toast.error("먼저 저장해주세요.");
      return;
    }
    const count = getRecipientCount();
    if (count === 0) {
      toast.error("수신자가 없습니다.");
      return;
    }
    if (!confirm(`${count}명에게 뉴스레터를 발송하시겠습니까?`)) return;

    setSending(true);
    try {
      const previewHtml = mdToPreviewHtml(emailSummary);
      const res = await fetch("/api/admin/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          subject: emailSubject,
          template: "newsletter",
          templateProps: {
            bodyHtml: previewHtml,
            ctaText: ctaText || undefined,
            ctaUrl: ctaUrl || undefined,
          },
        }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        toast.success(`${data.sent}명에게 발송 완료 (실패: ${data.failed}건)`);
        await updateContentEmailSentAt(content.id);
        onContentUpdate();
      }
    } catch {
      toast.error("발송에 실패했습니다.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 메타 정보 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                수신 대상
              </label>
              <Select value={target} onValueChange={setTarget}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_leads">
                    리드 전체{recipientStats ? ` (${recipientStats.leads}명)` : ""}
                  </SelectItem>
                  <SelectItem value="all_students">
                    수강생{recipientStats ? ` (${recipientStats.students}명)` : ""}
                  </SelectItem>
                  <SelectItem value="all_members">
                    회원{recipientStats ? ` (${recipientStats.members}명)` : ""}
                  </SelectItem>
                  <SelectItem value="all">
                    전체{recipientStats ? ` (${recipientStats.total}명)` : ""}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                이메일 제목
              </label>
              <Input
                value={emailSubject}
                onChange={(e) => {
                  const val = e.target.value;
                  setEmailSubject(val);
                  checkDirty(emailSummary, val, ctaText, ctaUrl);
                }}
                className="h-9 text-sm"
                placeholder="이메일 제목"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* CTA 설정 */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-medium text-gray-500">CTA 버튼 설정</p>
          <div className="flex items-center gap-2">
            {CTA_PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant={ctaPreset === preset.id ? "default" : "outline"}
                size="sm"
                className={
                  ctaPreset === preset.id
                    ? "bg-[#F75D5D] hover:bg-[#E54949] text-xs"
                    : "text-xs"
                }
                onClick={() => {
                  setCtaPreset(preset.id);
                  if (preset.id !== "custom") {
                    setCtaText(preset.text);
                    const url =
                      preset.urlTemplate
                        ? `${siteUrl}${preset.urlTemplate.replace("{id}", content.id)}`
                        : "";
                    setCtaUrl(url);
                    checkDirty(emailSummary, emailSubject, preset.text, url);
                  }
                }}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                버튼 텍스트
              </label>
              <Input
                value={ctaText}
                onChange={(e) => {
                  const val = e.target.value;
                  setCtaText(val);
                  setCtaPreset("custom");
                  checkDirty(emailSummary, emailSubject, val, ctaUrl);
                }}
                className="h-9 text-sm"
                placeholder="버튼에 표시할 텍스트"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-500">
                링크 URL
              </label>
              <Input
                value={ctaUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setCtaUrl(val);
                  checkDirty(emailSummary, emailSubject, ctaText, val);
                }}
                className="h-9 text-sm"
                placeholder="https://..."
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 액션 바 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleImportFromPost}
            disabled={summarizing}
            className="text-xs gap-1"
          >
            {summarizing ? (
              <Sparkles className="size-3.5 animate-spin" />
            ) : (
              <FileDown className="size-3.5" />
            )}
            {summarizing ? "AI 요약 중..." : "정보공유에서 가져오기"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowPreview((p) => !p)}
            className="text-xs gap-1"
          >
            <Eye className="size-3.5" />
            {showPreview ? "미리보기 숨기기" : "미리보기 보기"}
          </Button>
          {dirty && (
            <span className="text-xs text-amber-600 font-medium">
              변경사항 있음
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestSend}
            disabled={testSending || !emailSummary}
            className="gap-1 text-xs"
          >
            {testSending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <TestTube className="size-3.5" />
            )}
            테스트 발송
          </Button>
          <Button
            size="sm"
            onClick={handleSend}
            disabled={sending || !emailSummary || dirty}
            className="bg-purple-600 hover:bg-purple-700 gap-1 text-xs"
          >
            {sending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Send className="size-3.5" />
            )}
            발송하기 ({getRecipientCount()}명)
          </Button>
        </div>
      </div>

      {/* 에디터 + 미리보기 */}
      <div className={`grid gap-4 ${showPreview ? "grid-cols-2" : "grid-cols-1"}`}>
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">
            뉴스레터 본문 (마크다운)
          </p>
          <MDXEditorComponent
            key={editorKey}
            markdown={editorKey === 0 ? initialSummary : emailSummary}
            onChange={handleEditorChange}
          />
        </div>
        {showPreview && (
          <div>
            <p className="text-xs font-medium text-gray-500 mb-2">
              이메일 미리보기
            </p>
            <iframe
              srcDoc={newsletterTemplate({
                subject: emailSubject,
                bodyHtml: mdToPreviewHtml(emailSummary),
                ctaText: ctaText || undefined,
                ctaUrl: ctaUrl || undefined,
              })}
              className="w-full h-[500px] border rounded-lg"
              title="이메일 미리보기"
            />
          </div>
        )}
      </div>
    </div>
  );
}
