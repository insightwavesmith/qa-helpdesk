"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownContentProps {
  content: string;
}

/** HTML 주석(<!-- ... -->) 제거 */
function stripHtmlComments(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, "");
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  const cleaned = stripHtmlComments(content);

  return (
    <div className="mt-6 prose prose-neutral max-w-none text-foreground/90 prose-headings:text-foreground prose-p:leading-[1.8] prose-a:text-primary prose-strong:text-foreground prose-th:text-left prose-img:rounded-lg">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{cleaned}</ReactMarkdown>
    </div>
  );
}
