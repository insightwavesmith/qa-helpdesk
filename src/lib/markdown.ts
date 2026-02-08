function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function applyInlineFormatting(html: string): string {
  return html
    .replace(
      /`([^`]+)`/g,
      '<code style="background:#f3f4f6;padding:2px 6px;border-radius:3px;font-size:0.9em">$1</code>'
    )
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>");
}

export function mdToHtml(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let inList = false;
  let listTag = "ul";

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        result.push(`</${listTag}>`);
        inList = false;
      }
      continue;
    }
    if (trimmed.startsWith("### ")) {
      if (inList) {
        result.push(`</${listTag}>`);
        inList = false;
      }
      result.push(
        `<h3>${applyInlineFormatting(escapeHtml(trimmed.slice(4)))}</h3>`
      );
    } else if (trimmed.startsWith("## ")) {
      if (inList) {
        result.push(`</${listTag}>`);
        inList = false;
      }
      result.push(
        `<h2>${applyInlineFormatting(escapeHtml(trimmed.slice(3)))}</h2>`
      );
    } else if (trimmed.startsWith("# ")) {
      if (inList) {
        result.push(`</${listTag}>`);
        inList = false;
      }
      result.push(
        `<h1>${applyInlineFormatting(escapeHtml(trimmed.slice(2)))}</h1>`
      );
    } else if (/^[-*]\s/.test(trimmed)) {
      if (!inList) {
        listTag = "ul";
        result.push("<ul>");
        inList = true;
      }
      result.push(
        `<li>${applyInlineFormatting(escapeHtml(trimmed.slice(2)))}</li>`
      );
    } else if (/^\d+\.\s/.test(trimmed)) {
      if (!inList) {
        listTag = "ol";
        result.push("<ol>");
        inList = true;
      }
      result.push(
        `<li>${applyInlineFormatting(escapeHtml(trimmed.replace(/^\d+\.\s/, "")))}</li>`
      );
    } else {
      if (inList) {
        result.push(`</${listTag}>`);
        inList = false;
      }
      result.push(`<p>${applyInlineFormatting(escapeHtml(trimmed))}</p>`);
    }
  }
  if (inList) result.push(`</${listTag}>`);
  return result.join("\n");
}
