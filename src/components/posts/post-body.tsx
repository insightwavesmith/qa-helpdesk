import "./post-body.css";

interface PostBodyProps {
  content: string;
}

function markdownToHtml(md: string): string {
  let html = md;

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

  // Images
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

  // Headings (h2, h3 only — h1 is the title)
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  let h2Index = 0;
  html = html.replace(/^## (.+)$/gm, (_match, title) => {
    h2Index++;
    return `<h2 id="heading-${h2Index}">${title}</h2>`;
  });

  // Blockquote
  html = html.replace(/^> (.+)$/gm, "<blockquote><p>$1</p></blockquote>");
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, "");

  // Bold + Italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Horizontal rule
  html = html.replace(/^---$/gm, "<hr />");

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
    return `<table><thead><tr>${thRow}</tr></thead><tbody>${bodyRows}</tbody></table>`;
  });

  // Paragraphs — wrap remaining lines
  html = html
    .split("\n\n")
    .map((block: string) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      // Skip blocks already wrapped in HTML tags
      if (/^<(h[23]|ul|ol|li|blockquote|pre|table|hr|img|div)/.test(trimmed)) {
        return trimmed;
      }
      // Wrap plain text lines in <p>
      return trimmed
        .split("\n")
        .map((line: string) => {
          const l = line.trim();
          if (!l) return "";
          if (/^<(h[23]|ul|ol|li|blockquote|pre|table|hr|img|div)/.test(l)) return l;
          return `<p>${l}</p>`;
        })
        .join("\n");
    })
    .join("\n");

  return html;
}

export function PostBody({ content }: PostBodyProps) {
  const html = markdownToHtml(content);

  return (
    <div
      className="post-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export { markdownToHtml };
