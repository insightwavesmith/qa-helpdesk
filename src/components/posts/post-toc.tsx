"use client";

import { useMemo } from "react";

interface PostTocProps {
  content: string;
}

interface TocItem {
  id: string;
  text: string;
  index: number;
}

function extractHeadings(content: string): TocItem[] {
  const headings: TocItem[] = [];
  const regex = /^## (.+)$/gm;
  let match;
  let index = 1;

  while ((match = regex.exec(content)) !== null) {
    const text = match[1].replace(/[#*_~`]/g, "").trim();
    const id = `heading-${index}`;
    headings.push({ id, text, index });
    index++;
  }

  return headings;
}

function handleClick(id: string) {
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function PostToc({ content }: PostTocProps) {
  const headings = useMemo(() => extractHeadings(content), [content]);

  if (headings.length === 0) return null;

  return (
    <nav className="bg-[#f9fafb] rounded-lg p-6 mb-8">
      <h4 className="text-sm font-bold text-[#1a1a2e] mb-3">목차</h4>
      <ol className="space-y-2">
        {headings.map((h) => (
          <li key={h.id}>
            <button
              onClick={() => handleClick(h.id)}
              className="text-sm text-[#666666] hover:text-[#F75D5D] transition-colors text-left"
            >
              {h.index}. {h.text}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export { extractHeadings };
