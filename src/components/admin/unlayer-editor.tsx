/**
 * === 배경색 문제 조사 결과 (2026-02-11) ===
 *
 * 1. features 제한: 현재 options.features에는 preview: true만 설정되어 있음.
 *    textEditor.spellChecker 등 불필요한 제한 없음. ✅
 *
 * 2. displayMode "email": Unlayer "email" 모드는 600px 고정폭 + 회색 배경(에디터 캔버스)을
 *    자동으로 적용함. 이는 이메일 미리보기를 위한 정상 동작이며, 실제 이메일 본문의
 *    backgroundColor과는 별개. 에디터 바깥(캔버스) 배경은 Unlayer가 관리하므로
 *    displayMode "email"이 본문 배경색 변경을 막지 않음. ✅
 *
 * 3. body.values.backgroundColor #ffffff: 기본 템플릿에서 하드코딩된 값이지만,
 *    에디터의 "Body" 설정 → "Background Color"에서 사용자가 변경 가능함.
 *    Unlayer에서 body 배경색은 항상 편집 가능한 속성. ✅
 *
 * 4. editor.autoSelectOnDrop: 드래그&드롭 시 요소 자동 선택하는 편의 옵션.
 *    배경색 문제와 무관하므로 추가하지 않음. 필요시 options에 추가 가능.
 *
 * 결론: 배경색 관련 blocking issue 없음. 에디터 캔버스의 회색 배경은
 * displayMode "email"의 정상 동작이며, 실제 이메일 배경색은 편집 가능.
 */
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
