"use client";

import { useCallback } from "react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FloatingToolbarProps {
  editor: Editor;
}

function ToolbarBtn({
  onClick,
  isActive = false,
  title,
  children,
}: {
  onClick: () => void;
  isActive?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "flex h-8 w-8 items-center justify-center rounded transition-colors",
        isActive
          ? "bg-[#F75D5D]/10 text-[#F75D5D]"
          : "text-gray-600 hover:bg-gray-100"
      )}
    >
      {children}
    </button>
  );
}

function Separator() {
  return <div className="mx-0.5 h-5 w-px bg-gray-200" />;
}

export function FloatingToolbar({ editor }: FloatingToolbarProps) {
  const setLink = useCallback(() => {
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
    const url = window.prompt("이미지 URL을 입력하세요", "https://");
    if (!url) return;
    editor.chain().focus().setImage({ src: url }).run();
  }, [editor]);

  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-lg border border-gray-200 bg-white px-1 py-1 shadow-lg"
    >
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBold().run()}
        isActive={editor.isActive("bold")}
        title="굵게"
      >
        <Bold className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleItalic().run()}
        isActive={editor.isActive("italic")}
        title="기울임"
      >
        <Italic className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        isActive={editor.isActive("underline")}
        title="밑줄"
      >
        <UnderlineIcon className="size-4" />
      </ToolbarBtn>

      <Separator />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        isActive={editor.isActive("heading", { level: 2 })}
        title="제목 2"
      >
        <Heading2 className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        isActive={editor.isActive("heading", { level: 3 })}
        title="제목 3"
      >
        <Heading3 className="size-4" />
      </ToolbarBtn>

      <Separator />

      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        isActive={editor.isActive("bulletList")}
        title="글머리 기호"
      >
        <List className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        isActive={editor.isActive("orderedList")}
        title="번호 목록"
      >
        <ListOrdered className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        isActive={editor.isActive("blockquote")}
        title="인용"
      >
        <Quote className="size-4" />
      </ToolbarBtn>

      <Separator />

      <ToolbarBtn
        onClick={setLink}
        isActive={editor.isActive("link")}
        title="링크"
      >
        <LinkIcon className="size-4" />
      </ToolbarBtn>
      <ToolbarBtn onClick={addImage} title="이미지 삽입">
        <ImageIcon className="size-4" />
      </ToolbarBtn>
    </BubbleMenu>
  );
}
