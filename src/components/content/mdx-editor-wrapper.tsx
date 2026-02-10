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
import { useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface MDXEditorWrapperProps {
  markdown: string;
  onChange: (md: string) => void;
}

async function imageUploadHandler(image: File): Promise<string> {
  const supabase = createClient();
  const ext = image.name.split(".").pop() || "jpg";
  const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const filePath = `contents/${fileName}`;

  const { error } = await supabase.storage
    .from("content-images")
    .upload(filePath, image, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    throw new Error(`이미지 업로드 실패: ${image.name}`);
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("content-images").getPublicUrl(filePath);

  return publicUrl;
}

export default function MDXEditorWrapper({
  markdown,
  onChange,
}: MDXEditorWrapperProps) {
  const editorRef = useRef<MDXEditorMethods>(null);

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
