"use client";

import {
  MDXEditor,
  headingsPlugin,
  listsPlugin,
  quotePlugin,
  thematicBreakPlugin,
  linkPlugin,
  linkDialogPlugin,
  imagePlugin,
  tablePlugin,
  codeBlockPlugin,
  markdownShortcutPlugin,
  toolbarPlugin,
  BoldItalicUnderlineToggles,
  BlockTypeSelect,
  CreateLink,
  InsertImage,
  InsertTable,
  InsertThematicBreak,
  ListsToggle,
  type MDXEditorMethods,
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";
import "@/components/posts/post-body.css";
import { useRef, useCallback } from "react";
import { uploadFile } from "@/lib/upload-client";
import { toast } from "sonner";

interface MDXEditorWrapperProps {
  markdown: string;
  onChange: (md: string) => void;
}

export default function MDXEditorWrapper({
  markdown,
  onChange,
}: MDXEditorWrapperProps) {
  const editorRef = useRef<MDXEditorMethods>(null);

  const imageUploadHandler = useCallback(async (image: File): Promise<string> => {
    const ext = image.name.split(".").pop() || "jpg";
    const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filePath = `contents/${fileName}`;

    try {
      const publicUrl = await uploadFile(image, "content-images", filePath);
      toast.success("이미지가 삽입되었습니다.");
      return publicUrl;
    } catch (err) {
      const message = err instanceof Error ? err.message : "업로드 실패";
      toast.error(`이미지 업로드 실패: ${message}`);
      throw new Error(`이미지 업로드 실패: ${image.name}`);
    }
  }, []);

  return (
    <div className="mdx-editor-container [&_.mdxeditor]:min-h-[500px] [&_.mdxeditor]:border [&_.mdxeditor]:border-gray-200 [&_.mdxeditor]:rounded-md">
      <MDXEditor
        ref={editorRef}
        markdown={markdown}
        onChange={onChange}
        contentEditableClassName="prose prose-sm max-w-4xl mx-auto px-4 py-3 focus:outline-none post-body"
        plugins={[
          headingsPlugin(),
          listsPlugin(),
          quotePlugin(),
          thematicBreakPlugin(),
          linkPlugin(),
          linkDialogPlugin(),
          imagePlugin({ imageUploadHandler }),
          tablePlugin(),
          codeBlockPlugin({
            defaultCodeBlockLanguage: "js",
          }),
          markdownShortcutPlugin(),
          toolbarPlugin({
            toolbarContents: () => (
              <>
                <BlockTypeSelect />
                <BoldItalicUnderlineToggles />
                <ListsToggle />
                <CreateLink />
                <InsertImage />
                <InsertTable />
                <InsertThematicBreak />
              </>
            ),
          }),
        ]}
      />
    </div>
  );
}
