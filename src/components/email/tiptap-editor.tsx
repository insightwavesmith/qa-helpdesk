"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  ImageIcon,
  Minus,
  Palette,
  FolderOpen,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TipTapEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  onAiWrite?: () => void;
}

const PRESET_COLORS = [
  { label: "기본", value: "#000000" },
  { label: "프라이머리", value: "#F75D5D" },
  { label: "빨강", value: "#DC2626" },
  { label: "파랑", value: "#2563EB" },
  { label: "초록", value: "#16A34A" },
  { label: "보라", value: "#9333EA" },
  { label: "주황", value: "#EA580C" },
  { label: "회색", value: "#6B7280" },
];

function ToolbarButton({
  onClick,
  isActive = false,
  disabled = false,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
        isActive
          ? "bg-gray-100 text-[#F75D5D]"
          : "text-gray-600 hover:bg-gray-100",
        disabled && "cursor-not-allowed opacity-40 hover:bg-transparent"
      )}
    >
      {children}
    </button>
  );
}

function ToolbarSeparator() {
  return <div className="mx-1 h-6 w-px bg-gray-200" />;
}

export default function TipTapEditor({
  content,
  onChange,
  placeholder = "이메일 내용을 작성하세요...",
  onAiWrite,
}: TipTapEditorProps) {
  const [showColors, setShowColors] = useState(false);
  const colorRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
      }),
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image.configure({
        HTMLAttributes: { class: "tiptap-image" },
      }),
      Placeholder.configure({ placeholder }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
    ],
    content,
    onUpdate: ({ editor: e }) => {
      onChange(e.getHTML());
    },
    editorProps: {
      attributes: {
        class: "tiptap-content outline-none",
      },
    },
  });

  // Sync editor content when parent resets html (e.g. after send)
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (content !== currentHtml) {
      editor.commands.setContent(content || "");
    }
  }, [content, editor]);

  // Click-outside to close color picker
  useEffect(() => {
    if (!showColors) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (colorRef.current && !colorRef.current.contains(e.target as Node)) {
        setShowColors(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColors]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("링크 URL을 입력하세요", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url })
      .run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt("이미지 URL을 입력하세요", "https://");
    if (url === null || url === "") return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  const setColor = useCallback(
    (color: string) => {
      if (!editor) return;
      editor.chain().focus().setColor(color).run();
      setShowColors(false);
    },
    [editor]
  );

  if (!editor) return null;

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <style>{`
        .tiptap-content {
          min-height: 400px;
          padding: 1rem;
          font-family: Pretendard, -apple-system, BlinkMacSystemFont, sans-serif;
          font-size: 0.9375rem;
          line-height: 1.7;
          color: #1f2937;
        }
        .tiptap-content > * + * {
          margin-top: 0.75em;
        }
        .tiptap-content p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        .tiptap-content h1 {
          font-size: 1.75rem;
          font-weight: 700;
          line-height: 1.3;
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }
        .tiptap-content h2 {
          font-size: 1.375rem;
          font-weight: 600;
          line-height: 1.3;
          margin-top: 1.25em;
          margin-bottom: 0.5em;
        }
        .tiptap-content h3 {
          font-size: 1.125rem;
          font-weight: 600;
          line-height: 1.4;
          margin-top: 1em;
          margin-bottom: 0.5em;
        }
        .tiptap-content ul {
          list-style-type: disc;
          padding-left: 1.5em;
        }
        .tiptap-content ol {
          list-style-type: decimal;
          padding-left: 1.5em;
        }
        .tiptap-content li {
          margin-top: 0.25em;
        }
        .tiptap-content a {
          color: #2563eb;
          text-decoration: underline;
          cursor: pointer;
        }
        .tiptap-content a:hover {
          color: #1d4ed8;
        }
        .tiptap-content img.tiptap-image {
          max-width: 100%;
          height: auto;
          border-radius: 0.375rem;
          margin: 0.5em 0;
        }
        .tiptap-content hr {
          border: none;
          border-top: 1px solid #e5e7eb;
          margin: 1.5em 0;
        }
        .tiptap-content blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1em;
          color: #6b7280;
          font-style: italic;
        }
        .tiptap-content code {
          background: #f3f4f6;
          border-radius: 0.25rem;
          padding: 0.15em 0.3em;
          font-size: 0.875em;
        }
        .tiptap-content pre {
          background: #1f2937;
          color: #f9fafb;
          border-radius: 0.5rem;
          padding: 1em;
          overflow-x: auto;
        }
        .tiptap-content pre code {
          background: none;
          padding: 0;
          color: inherit;
        }
      `}</style>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 bg-gray-50/50 px-2 py-1.5">
        {/* Text formatting */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBold().run()}
          isActive={editor.isActive("bold")}
          title="굵게"
        >
          <Bold className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleItalic().run()}
          isActive={editor.isActive("italic")}
          title="기울임"
        >
          <Italic className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          isActive={editor.isActive("underline")}
          title="밑줄"
        >
          <UnderlineIcon className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleStrike().run()}
          isActive={editor.isActive("strike")}
          title="취소선"
        >
          <Strikethrough className="size-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Headings */}
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 1 }).run()
          }
          isActive={editor.isActive("heading", { level: 1 })}
          title="제목 1"
        >
          <Heading1 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 2 }).run()
          }
          isActive={editor.isActive("heading", { level: 2 })}
          title="제목 2"
        >
          <Heading2 className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() =>
            editor.chain().focus().toggleHeading({ level: 3 }).run()
          }
          isActive={editor.isActive("heading", { level: 3 })}
          title="제목 3"
        >
          <Heading3 className="size-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Lists */}
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          isActive={editor.isActive("bulletList")}
          title="글머리 기호 목록"
        >
          <List className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          isActive={editor.isActive("orderedList")}
          title="번호 목록"
        >
          <ListOrdered className="size-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Alignment */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("left").run()}
          isActive={editor.isActive({ textAlign: "left" })}
          title="왼쪽 정렬"
        >
          <AlignLeft className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("center").run()}
          isActive={editor.isActive({ textAlign: "center" })}
          title="가운데 정렬"
        >
          <AlignCenter className="size-4" />
        </ToolbarButton>
        <ToolbarButton
          onClick={() => editor.chain().focus().setTextAlign("right").run()}
          isActive={editor.isActive({ textAlign: "right" })}
          title="오른쪽 정렬"
        >
          <AlignRight className="size-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Link */}
        <ToolbarButton
          onClick={setLink}
          isActive={editor.isActive("link")}
          title="링크"
        >
          <LinkIcon className="size-4" />
        </ToolbarButton>

        {/* Image */}
        <ToolbarButton onClick={addImage} title="이미지">
          <ImageIcon className="size-4" />
        </ToolbarButton>

        {/* Horizontal Rule */}
        <ToolbarButton
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          title="구분선"
        >
          <Minus className="size-4" />
        </ToolbarButton>

        <ToolbarSeparator />

        {/* Color picker */}
        <div className="relative" ref={colorRef}>
          <ToolbarButton
            onClick={() => setShowColors((prev) => !prev)}
            isActive={showColors}
            title="텍스트 색상"
          >
            <Palette className="size-4" />
          </ToolbarButton>
          {showColors && (
            <div className="absolute left-0 top-full z-50 mt-1 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
              <p className="mb-1.5 text-xs font-medium text-gray-500">
                텍스트 색상
              </p>
              <div className="grid grid-cols-4 gap-1.5">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setColor(c.value)}
                    title={c.label}
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 transition-transform hover:scale-110"
                    style={{ backgroundColor: c.value }}
                  >
                    {c.value === "#000000" && (
                      <span className="text-[10px] font-bold text-white">
                        A
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  editor.chain().focus().unsetColor().run();
                  setShowColors(false);
                }}
                className="mt-1.5 w-full rounded-md px-2 py-1 text-xs text-gray-500 hover:bg-gray-100"
              >
                색상 초기화
              </button>
            </div>
          )}
        </div>

        <ToolbarSeparator />

        {/* AI 작성 */}
        {onAiWrite && (
          <>
            <ToolbarButton onClick={onAiWrite} title="AI 작성">
              <Sparkles className="size-4" />
            </ToolbarButton>
            <span className="text-xs text-[#F75D5D] font-medium cursor-pointer" onClick={onAiWrite}>
              AI 작성
            </span>
            <ToolbarSeparator />
          </>
        )}

        {/* Load button (disabled, for future use) */}
        <ToolbarButton onClick={() => {}} disabled title="콘텐츠 불러오기">
          <FolderOpen className="size-4" />
        </ToolbarButton>
        <span className="text-xs text-gray-400">불러오기</span>
      </div>

      {/* Editor */}
      <div className="focus-within:ring-2 focus-within:ring-[#F75D5D]/20">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
