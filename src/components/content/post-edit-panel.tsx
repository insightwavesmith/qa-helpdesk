"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Save, Loader2, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { updateContent } from "@/actions/contents";
import { toast } from "sonner";
import { ensureMarkdown } from "@/lib/html-to-markdown";

const MDXEditorComponent = dynamic(() => import("./mdx-editor-wrapper"), {
  ssr: false,
  loading: () => (
    <div className="h-[500px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
      에디터 로딩 중...
    </div>
  ),
});

interface PostEditPanelProps {
  contentId: string;
  initialBodyMd: string;
  onSaved?: () => void;
}

export default function PostEditPanel({
  contentId,
  initialBodyMd,
  onSaved,
}: PostEditPanelProps) {
  const mdContent = useMemo(() => ensureMarkdown(initialBodyMd), [initialBodyMd]);
  const [bodyMd, setBodyMd] = useState(mdContent);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const autoSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedRef = useRef(mdContent);

  const handleChange = useCallback(
    (md: string) => {
      setBodyMd(md);
      setDirty(md !== lastSavedRef.current);

      // Auto-save after 5s
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
      autoSaveRef.current = setTimeout(async () => {
        if (md === lastSavedRef.current) return;
        try {
          const { error } = await updateContent(contentId, { body_md: md });
          if (!error) {
            lastSavedRef.current = md;
            setDirty(false);
          }
        } catch {
          // silent auto-save failure
        }
      }, 5000);
    },
    [contentId]
  );

  // Cleanup auto-save timer
  useEffect(() => {
    return () => {
      if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    };
  }, []);

  const handleSave = async () => {
    if (autoSaveRef.current) clearTimeout(autoSaveRef.current);
    setSaving(true);
    try {
      const { error } = await updateContent(contentId, { body_md: bodyMd });
      if (error) {
        toast.error("저장에 실패했습니다.");
      } else {
        lastSavedRef.current = bodyMd;
        setDirty(false);
        toast.success("저장되었습니다.");
        onSaved?.();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 font-medium">
              변경사항 있음
            </span>
          )}
          {saving && (
            <span className="text-xs text-gray-400 flex items-center gap-1">
              <Loader2 className="size-3 animate-spin" />
              저장 중...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a
              href={`/posts?content_id=${contentId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="gap-1.5"
            >
              <Eye className="size-3.5" />
              미리보기
            </a>
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="bg-[#F75D5D] hover:bg-[#E54949] gap-1.5"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Save className="size-3.5" />
            )}
            저장
          </Button>
        </div>
      </div>

      {/* MDXEditor */}
      <MDXEditorComponent markdown={mdContent} onChange={handleChange} />
    </div>
  );
}
