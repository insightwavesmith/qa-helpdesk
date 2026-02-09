"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import ImageExt from "@tiptap/extension-image";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { Save, Send, X, Loader2, Pencil, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { FloatingToolbar } from "@/components/post/FloatingToolbar";
import { markdownToHtml } from "@/components/posts/post-body";
import { updateContent } from "@/actions/contents";
import SendConfirmModal from "./SendConfirmModal";
import "@/components/posts/post-body.css";

function isHtmlContent(str: string): boolean {
  return /<[a-z][\s\S]*>/i.test(str);
}

interface ContentData {
  id: string;
  title: string;
  body_md: string;
  email_subject: string | null;
  email_summary: string | null;
  email_sent_at: string | null;
  status: string;
}

interface NewsletterInlineEditorProps {
  content: ContentData;
}

export default function NewsletterInlineEditor({
  content,
}: NewsletterInlineEditorProps) {
  const router = useRouter();
  const siteUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://bscamp.kr";

  // State
  const [editSubject, setEditSubject] = useState(
    content.email_subject || content.title
  );
  const [editBody, setEditBody] = useState("");
  const [ctaText, setCtaText] = useState("자세히 보기");
  const [ctaUrl, setCtaUrl] = useState(`${siteUrl}/posts/${content.id}`);
  const [isSaving, setIsSaving] = useState(false);
  const [sendModalOpen, setSendModalOpen] = useState(false);
  const [ctaEditing, setCtaEditing] = useState(false);

  // Refs
  const subjectRef = useRef<HTMLHeadingElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef({ subject: editSubject, body: "" });

  // Convert body_md to HTML for TipTap
  const htmlContent = isHtmlContent(content.body_md)
    ? content.body_md
    : markdownToHtml(content.body_md);

  // Initialize editBody
  useEffect(() => {
    setEditBody(htmlContent);
    lastSavedRef.current.body = htmlContent;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      ImageExt.configure({
        HTMLAttributes: { class: "post-body-img" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content: htmlContent,
    editable: true,
    onUpdate: ({ editor: e }) => {
      const html = e.getHTML();
      setEditBody(html);
      scheduleAutoSave(editSubject, html);
    },
    editorProps: {
      attributes: {
        class: "post-body outline-none min-h-[200px]",
      },
    },
  });

  // Auto-save (5s debounce)
  const scheduleAutoSave = useCallback(
    (subject: string, body: string) => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      autoSaveTimerRef.current = setTimeout(async () => {
        if (
          subject === lastSavedRef.current.subject &&
          body === lastSavedRef.current.body
        ) {
          return;
        }
        setIsSaving(true);
        try {
          const { error } = await updateContent(content.id, {
            email_subject: subject,
            body_md: body,
          });
          if (error) {
            console.error("자동저장 실패:", error);
          } else {
            lastSavedRef.current = { subject, body };
          }
        } finally {
          setIsSaving(false);
        }
      }, 5000);
    },
    [content.id]
  );

  // Subject editing handlers
  function handleSubjectInput() {
    if (subjectRef.current) {
      const newSubject = subjectRef.current.textContent || "";
      setEditSubject(newSubject);
      scheduleAutoSave(newSubject, editBody);
    }
  }

  function handleSubjectKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      editor?.commands.focus("start");
    }
  }

  // Manual save
  async function handleSaveDraft() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsSaving(true);
    try {
      const { error } = await updateContent(content.id, {
        email_subject: editSubject,
        body_md: editBody,
      });
      if (error) {
        toast.error("저장에 실패했습니다. 다시 시도해주세요.");
      } else {
        lastSavedRef.current = { subject: editSubject, body: editBody };
        toast.success("임시저장되었습니다.");
      }
    } finally {
      setIsSaving(false);
    }
  }

  // Cancel
  function handleCancel() {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (window.confirm("편집을 취소하시겠습니까?")) {
      router.push("/admin/email");
    }
  }

  // Send complete
  function handleSendComplete() {
    setSendModalOpen(false);
    toast.success("이메일이 발송되었습니다.");
    router.push("/admin/email");
  }

  if (!editor) return null;

  const isLoading = isSaving;

  return (
    <div className="space-y-6">
      {/* Top bar */}
      <div className="sticky top-0 z-50 flex items-center justify-between bg-white border-b border-gray-200 shadow-sm px-4 py-3 -mx-4 sm:-mx-0 sm:rounded-lg">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-500">
            뉴스레터 편집
          </span>
          {isSaving && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              자동저장 중...
            </span>
          )}
          {content.email_sent_at && (
            <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">
              발송 완료
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <X className="size-4" />
            취소
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Save className="size-4" />
            )}
            임시저장
          </button>
          <button
            type="button"
            onClick={() => setSendModalOpen(true)}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#F75D5D] rounded-lg hover:bg-[#E54949] transition-colors disabled:opacity-50"
          >
            <Send className="size-4" />
            이메일 발송
          </button>
        </div>
      </div>

      {/* Email card preview */}
      <div className="max-w-[600px] mx-auto">
        <div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
          {/* Brand header */}
          <div
            style={{
              background: "linear-gradient(135deg, #F75D5D, #E54949)",
            }}
            className="py-5 px-6"
          >
            <p className="text-white text-center text-lg font-bold tracking-wide">
              BS CAMP
            </p>
          </div>

          {/* Subject (inline editable) */}
          <div className="px-6 pt-6 pb-2">
            <h2
              ref={subjectRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleSubjectInput}
              onKeyDown={handleSubjectKeyDown}
              className="text-xl font-bold text-[#1a1a2e] leading-tight outline-none border-b-2 border-dashed border-transparent focus:border-[#F75D5D]/30 pb-2"
              data-placeholder="이메일 제목을 입력하세요"
            >
              {content.email_subject || content.title}
            </h2>
          </div>

          {/* Divider */}
          <div className="mx-6">
            <div className="border-b border-gray-100" />
          </div>

          {/* Body (TipTap editor) */}
          <div className="px-6 py-4">
            <div className="rounded-lg border border-gray-100 p-4">
              <FloatingToolbar editor={editor} />
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* CTA button */}
          <div className="text-center px-6 pb-6">
            {ctaEditing ? (
              <div className="space-y-3 rounded-lg border border-[#F75D5D]/20 bg-red-50/30 p-4 text-left">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-gray-500">
                    버튼 텍스트
                  </label>
                  <input
                    type="text"
                    value={ctaText}
                    onChange={(e) => setCtaText(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-[#F75D5D] focus:ring-1 focus:ring-[#F75D5D]/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-medium text-gray-500">
                    링크 URL
                  </label>
                  <input
                    type="text"
                    value={ctaUrl}
                    onChange={(e) => setCtaUrl(e.target.value)}
                    className="w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-[#F75D5D] focus:ring-1 focus:ring-[#F75D5D]/30"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setCtaEditing(false)}
                  className="text-xs text-[#F75D5D] hover:underline font-medium"
                >
                  완료
                </button>
              </div>
            ) : (
              <div className="group relative inline-block">
                <a
                  href={ctaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.preventDefault()}
                  className="inline-flex items-center gap-2 rounded-lg px-8 py-3 text-base font-bold text-white transition-colors"
                  style={{ backgroundColor: "#F75D5D" }}
                >
                  {ctaText} <ExternalLink className="size-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setCtaEditing(true)}
                  className="absolute -top-2 -right-2 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-gray-200 shadow-sm text-gray-500 hover:text-[#F75D5D] opacity-0 group-hover:opacity-100 transition-opacity"
                  title="CTA 수정"
                >
                  <Pencil className="size-3" />
                </button>
              </div>
            )}
          </div>

          {/* Footer (unsubscribe preview) */}
          <div className="bg-gray-50 border-t border-gray-100 px-6 py-4 text-center">
            <p className="text-[11px] text-gray-400 leading-relaxed">
              자사몰 사관학교
            </p>
            <p className="text-[11px] text-gray-400 leading-relaxed mt-1">
              본 메일은 BS CAMP에서 발송한 뉴스레터입니다.
              <br />
              수신을 원하지 않으시면{" "}
              <span className="underline text-gray-500 cursor-default">
                수신거부
              </span>
              를 클릭해주세요.
            </p>
            <p className="text-[10px] text-gray-300 mt-2">
              &copy; {new Date().getFullYear()} BS CAMP. All rights reserved.
            </p>
          </div>
        </div>
      </div>

      {/* Send confirm modal */}
      <SendConfirmModal
        open={sendModalOpen}
        onOpenChange={setSendModalOpen}
        contentId={content.id}
        subject={editSubject}
        bodyHtml={editBody}
        ctaText={ctaText}
        ctaUrl={ctaUrl}
        onSendComplete={handleSendComplete}
      />
    </div>
  );
}
