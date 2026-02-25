"use client";

import { useRef, useEffect } from "react";
import "./post-body.css";

interface PostBodyProps {
  content: string;
}

function markdownToHtml(md: string): string {
  let html = md;

  // Blockquote (before HTML escape to preserve > character)
  html = html.replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>");
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, "");

  // Escape HTML (but preserve existing tags if content has HTML)
  // Only escape if content looks like plain markdown
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    html = html
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  // Code blocks (```...```)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_match, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Images with IMAGE_PLACEHOLDER (including backslash-escaped IMAGE\_PLACEHOLDER) → figure with data-unsplash-query
  const placeholderDataUri = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  html = html.replace(/!\[([^\]]*)\]\(IMAGE\\?_PLACEHOLDER\)/g,
    `<figure class="post-image-figure"><img data-unsplash-query="$1" src="${placeholderDataUri}" loading="lazy" alt="$1" /><figcaption>$1</figcaption></figure>`);

  // Regular images (with IMAGE_PLACEHOLDER guard for any remaining variants)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    if (/IMAGE.*PLACEHOLDER/i.test(src)) {
      return `<figure class="post-image-figure"><img data-unsplash-query="${alt}" src="${placeholderDataUri}" loading="lazy" alt="${alt}" /><figcaption>${alt}</figcaption></figure>`;
    }
    return `<img src="${src}" alt="${alt}" />`;
  });

  // CTA links (text contains →)
  html = html.replace(/\[([^\]]*→[^\]]*)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener noreferrer" class="cta-link">$1</a>');

  // Regular links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Standalone CTA text (line ending with → but not already a link)
  html = html.replace(/^(?!.*<a\b)(.+→)\s*$/gm,
    '<p class="cta-standalone"><a href="https://bscamp.co.kr" target="_blank" rel="noopener noreferrer" class="cta-link">$1</a></p>');

  // Headings (h2, h3 only — h1 is the title)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  let h2Index = 0;
  html = html.replace(/^## (.+)$/gm, (_match, title) => {
    h2Index++;
    return `<h2 id="heading-${h2Index}">${title}</h2>`;
  });

  // Image placeholders [이미지: 설명]
  html = html.replace(/\[이미지:\s*([^\]]+)\]/g,
    '<div class="image-placeholder"><span>$1</span></div>');

  // Horizontal rules (*** and --- patterns, before bold/italic to avoid conflict)
  html = html.replace(/^\*\*\*\s*$/gm, "<hr />");
  html = html.replace(/^---$/gm, "<hr />");
  // Merge consecutive <hr /> tags
  html = html.replace(/(<hr\s*\/?>[\s\n]*){2,}/g, "<hr />");

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Backslash escapes (remove trailing backslashes used as line breaks)
  html = html.replace(/\\$/gm, "");

  // Unordered list
  html = html.replace(/^[\-\*] (.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, (match) => {
    if (!match.startsWith("<ul>")) {
      return `<ul>${match}</ul>`;
    }
    return match;
  });
  // Merge consecutive uls
  html = html.replace(/<\/ul>\s*<ul>/g, "");

  // Ordered list
  html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
  // Wrap remaining orphan <li> in <ol>
  html = html.replace(/(?<!<\/li>\s*)(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, (match) => {
    // If already wrapped in ul, skip
    if (html.indexOf(`<ul>${match}`) !== -1) return match;
    return match;
  });

  // Tables
  html = html.replace(/^\|(.+)\|\s*\n\|[-\s|:]+\|\s*\n((?:\|.+\|\s*\n?)*)/gm, (_match, header, body) => {
    const headers = header.split("|").map((h: string) => h.trim()).filter(Boolean);
    const rows = body.trim().split("\n").map((row: string) =>
      row.split("|").map((c: string) => c.trim()).filter(Boolean)
    );
    const thRow = headers.map((h: string) => `<th>${h}</th>`).join("");
    const bodyRows = rows.map((cols: string[]) =>
      `<tr>${cols.map((c: string) => `<td>${c}</td>`).join("")}</tr>`
    ).join("");
    return `<div class="table-wrapper"><table><thead><tr>${thRow}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
  });

  // Paragraphs — wrap remaining lines
  html = html
    .split("\n\n")
    .map((block: string) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Skip blocks already wrapped in HTML tags
      if (/^<(h[23]|p|ul|ol|li|blockquote|pre|table|hr|img|div|figure)/.test(trimmed)) {
        return trimmed;
      }
      // Wrap plain text lines in <p>
      return trimmed
        .split("\n")
        .map((line: string) => {
          const l = line.trim();
          if (!l) return "";
          if (/^<(h[23]|p|ul|ol|li|blockquote|pre|table|hr|img|div|figure)/.test(l)) return l;
          return `<p>${l}</p>`;
        })
        .join("\n");
    })
    .join("\n");

  return html;
}

export function PostBody({ content }: PostBodyProps) {
  const ref = useRef<HTMLDivElement>(null);
  const html = markdownToHtml(content);

  useEffect(() => {
    if (!ref.current) return;
    const imgs = ref.current.querySelectorAll<HTMLImageElement>("[data-unsplash-query]");
    if (imgs.length === 0) return;

    imgs.forEach(async (img) => {
      const query = img.dataset.unsplashQuery;
      if (!query) return;
      try {
        const res = await fetch(`/api/unsplash/search?query=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (data.url) {
          img.src = data.url;
        } else {
          img.src = `https://placehold.co/800x400/F5F5F5/999999?text=Image`;
        }
      } catch {
        img.src = `https://placehold.co/800x400/F5F5F5/999999?text=Image`;
      }
    });
  }, [html]);

  return (
    <div
      ref={ref}
      className="post-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { markdownToHtml };
