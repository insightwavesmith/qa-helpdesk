"use client";

import { useEffect, useRef, useCallback } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Markdown } from "tiptap-markdown";
import { FloatingToolbar } from "./FloatingToolbar";
import "@/components/posts/post-body.css";

interface InlineEditorProps {
  title: string;
  bodyMd: string;
  isEditing: boolean;
  onTitleChange: (title: string) => void;
  onContentChange: (md: string) => void;
}

export function InlineEditor({
  title,
  bodyMd,
  isEditing,
  onTitleChange,
  onContentChange,
}: InlineEditorProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);

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
      Image.configure({
        HTMLAttributes: { class: "post-body-img" },
      }),
      Placeholder.configure({ placeholder: "본문을 작성하세요..." }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Table.configure({ resizable: true, HTMLAttributes: { class: "post-body-table" } }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({
        html: true,
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: bodyMd,
    editable: isEditing,
    onUpdate: ({ editor: e }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onContentChange((e.storage as any).markdown.getMarkdown() as string);
    },
    editorProps: {
      attributes: {
        class: "post-body outline-none min-h-[300px]",
      },
    },
  });

  // Sync editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(isEditing);
    if (isEditing) {
      setTimeout(() => editor.commands.focus("end"), 100);
    }
  }, [isEditing, editor]);

  // Sync title ref when entering edit mode
  useEffect(() => {
    if (titleRef.current && isEditing) {
      titleRef.current.textContent = title;
    }
  }, [isEditing]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTitleInput = useCallback(() => {
    if (titleRef.current) {
      onTitleChange(titleRef.current.textContent || "");
    }
  }, [onTitleChange]);

  // Prevent Enter in title creating newlines
  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        editor?.commands.focus("start");
      }
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <div>
      {/* Title */}
      {isEditing ? (
        <h1
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleTitleInput}
          onKeyDown={handleTitleKeyDown}
          className="text-2xl sm:text-[32px] font-bold text-[#1a1a2e] leading-tight mb-6 outline-none border-b-2 border-dashed border-transparent focus:border-[#F75D5D]/30 pb-2"
          data-placeholder="제목을 입력하세요"
        >
          {title}
        </h1>
      ) : (
        <h1 className="text-2xl sm:text-[32px] font-bold text-[#1a1a2e] leading-tight mb-6">
          {title}
        </h1>
      )}

      {/* Body editor */}
      <div className={isEditing ? "ring-1 ring-gray-200 rounded-lg p-4 min-h-[300px]" : ""}>
        {isEditing && <FloatingToolbar editor={editor} />}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
