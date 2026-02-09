"use client";

import { useState } from "react";
import { Save, Globe, X, Loader2 } from "lucide-react";

interface PublishBarProps {
  onSaveDraft: () => Promise<void>;
  onPublish: () => Promise<void>;
  onCancel: () => void;
  isSaving?: boolean;
}

export function PublishBar({ onSaveDraft, onPublish, onCancel, isSaving }: PublishBarProps) {
  const [publishing, setPublishing] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSaveDraft() {
    setSaving(true);
    try {
      await onSaveDraft();
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await onPublish();
    } finally {
      setPublishing(false);
    }
  }

  function handleCancel() {
    if (window.confirm("변경사항을 취소하시겠습니까?")) {
      onCancel();
    }
  }

  const isLoading = publishing || saving || isSaving;

  return (
    <div className="sticky top-0 z-50 flex items-center justify-between bg-white border-b border-gray-200 shadow-sm px-4 py-3 -mx-4 sm:-mx-0 sm:rounded-lg">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-gray-500">편집 중</span>
        {isSaving && (
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Loader2 className="size-3 animate-spin" />
            자동저장 중...
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
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          임시저장
        </button>
        <button
          type="button"
          onClick={handlePublish}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-[#F75D5D] rounded-lg hover:bg-[#E54949] transition-colors disabled:opacity-50"
        >
          {publishing ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
          발행
        </button>
      </div>
    </div>
  );
}
