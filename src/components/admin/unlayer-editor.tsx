"use client";

import React, { useRef, useCallback } from "react";
import dynamic from "next/dynamic";
import type { EditorRef } from "react-email-editor";

const EmailEditor = dynamic(
  () => import("react-email-editor").then((mod) => mod.default || mod),
  {
    ssr: false,
    loading: () => (
      <div className="h-[700px] rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-sm text-gray-400">
        에디터 로딩 중...
      </div>
    ),
  }
);

interface UnlayerEditorProps {
  designJson?: object | null;
  onReady?: () => void;
}

export interface UnlayerEditorHandle {
  exportHtml: () => Promise<{ design: object; html: string }>;
  loadDesign: (design: object) => void;
}

const UnlayerEditor = React.forwardRef<UnlayerEditorHandle, UnlayerEditorProps>(
  ({ designJson, onReady }, ref) => {
    const emailEditorRef = useRef<EditorRef>(null);

    const handleReady = useCallback(() => {
      if (designJson && emailEditorRef.current?.editor) {
        emailEditorRef.current.editor.loadDesign(designJson as Parameters<typeof emailEditorRef.current.editor.loadDesign>[0]);
      }
      onReady?.();
    }, [designJson, onReady]);

    React.useImperativeHandle(ref, () => ({
      exportHtml: () => {
        return new Promise((resolve) => {
          emailEditorRef.current?.editor?.exportHtml((data: { design: object; html: string }) => {
            resolve(data);
          });
        });
      },
      loadDesign: (design: object) => {
        emailEditorRef.current?.editor?.loadDesign(design as Parameters<NonNullable<typeof emailEditorRef.current>["editor"]["loadDesign"]>[0]);
      },
    }));

    return (
      <EmailEditor
        ref={emailEditorRef}
        onReady={handleReady}
        projectId={284274}
        options={{
          displayMode: "email",
          locale: "ko-KR",
          appearance: {
            theme: "light",
          },
          features: {
            preview: true,
          },
        }}
        style={{ minHeight: "700px" }}
      />
    );
  }
);

UnlayerEditor.displayName = "UnlayerEditor";
export default UnlayerEditor;
