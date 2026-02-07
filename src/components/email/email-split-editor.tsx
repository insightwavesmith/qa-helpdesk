"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";

const TipTapEditor = dynamic(() => import("@/components/email/tiptap-editor"), {
  ssr: false,
  loading: () => (
    <div className="h-[460px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
      에디터 로딩 중...
    </div>
  ),
});

interface EmailSplitEditorProps {
  content: string;
  onChange: (html: string) => void;
  subject: string;
  onAiWrite?: () => void;
}

export default function EmailSplitEditor({
  content,
  onChange,
  subject,
  onAiWrite,
}: EmailSplitEditorProps) {
  const [previewHtml, setPreviewHtml] = useState<string>("");
  const [previewLoading, setPreviewLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchPreview = useCallback(
    async (bodyHtml: string, subj: string) => {
      setPreviewLoading(true);
      try {
        const res = await fetch("/api/admin/email/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: "newsletter",
            subject: subj,
            templateProps: { bodyHtml },
          }),
        });
        const data = await res.json();
        if (data.html) {
          setPreviewHtml(data.html);
        } else {
          setPreviewHtml(
            '<p style="padding:20px;color:#999;">미리보기를 불러올 수 없습니다.</p>'
          );
        }
      } catch {
        setPreviewHtml(
          '<p style="padding:20px;color:#999;">미리보기 오류가 발생했습니다.</p>'
        );
      } finally {
        setPreviewLoading(false);
      }
    },
    []
  );

  // 디바운스 500ms로 미리보기 업데이트
  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      fetchPreview(content, subject);
    }, 500);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [content, subject, fetchPreview]);

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 min-h-[600px] border border-gray-200 rounded-lg overflow-hidden bg-white">
      {/* 좌측: 편집 영역 */}
      <div className="flex flex-col border-b md:border-b-0 md:border-r border-gray-200">
        <div className="flex items-center px-4 py-2.5 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-medium text-gray-700">편집</span>
        </div>
        <div className="flex-1">
          <TipTapEditor
            content={content}
            onChange={onChange}
            placeholder="이메일 내용을 작성하세요..."
            onAiWrite={onAiWrite}
          />
        </div>
      </div>

      {/* 우측: 미리보기 영역 */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50">
          <span className="text-sm font-medium text-gray-700">미리보기</span>
          {previewLoading && (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-400" />
          )}
        </div>
        <div className="flex-1 relative">
          {previewHtml ? (
            <iframe
              srcDoc={previewHtml}
              className="w-full h-full min-h-[550px]"
              title="이메일 미리보기"
            />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-gray-400">
              {previewLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  미리보기 렌더링 중...
                </>
              ) : (
                "내용을 입력하면 미리보기가 표시됩니다."
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
