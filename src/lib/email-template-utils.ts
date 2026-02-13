import { BS_CAMP_DEFAULT_TEMPLATE, BS_CAMP_TEMPLATE_A, BS_CAMP_TEMPLATE_B, BS_CAMP_TEMPLATE_C } from "@/lib/email-default-template";
import type { Content } from "@/types/content";

/**
 * 마크다운 → 이메일 호환 HTML 변환
 * 지원: ##, ---, > 인용, > 💡 팁, ✅ 체크, - 불릿, | 테이블, **bold**, ![img], [link]
 * 모든 스타일은 inline (이메일 클라이언트 호환)
 */
function markdownToEmailHtml(md: string, themeColor: string = "#F75D5D"): string {
  // **bold** → <strong>
  let text = md.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 이미지: ![alt](url)
  text = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;" />'
  );

  // 링크: [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    `<a href="$2" style="color:${themeColor};text-decoration:underline;" target="_blank">$1</a>`
  );

  // 블록 분리 (빈 줄 기준)
  const blocks = text.split(/\n\s*\n/);
  const htmlParts: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // --- 수평선
    if (/^-{3,}$/.test(trimmed)) {
      htmlParts.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">');
      continue;
    }

    // ## 제목
    const headingMatch = trimmed.match(/^## (.+)/);
    if (headingMatch) {
      htmlParts.push(`<h2 style="font-size:18px;font-weight:700;color:#1a1a1a;margin:16px 0;line-height:1.5;">${headingMatch[1]}</h2>`);
      continue;
    }

    // 테이블: | ... | 형태 + 구분선 행 포함
    if (/^\|.+\|/.test(trimmed) && /\|[-:\s]+\|/.test(trimmed)) {
      htmlParts.push(parseTable(trimmed));
      continue;
    }

    // 인용 블록: 모든 줄이 > 로 시작
    const lines = trimmed.split("\n");
    if (lines.every(l => l.trim().startsWith(">"))) {
      htmlParts.push(parseBlockquote(lines, themeColor));
      continue;
    }

    // 불릿 리스트: 모든 줄이 - 또는 • 로 시작
    if (lines.every(l => /^\s*[\-•]\s/.test(l))) {
      htmlParts.push(parseBulletList(lines, themeColor));
      continue;
    }

    // ✅ 체크 리스트
    if (lines.every(l => l.trim().startsWith("✅"))) {
      const items = lines.map(l => {
        const content = l.trim().replace(/^✅\s*/, "");
        return `<p style="font-size:15px;line-height:180%;margin:4px 0;"><span style="color:#333;">✅ ${content}</span></p>`;
      });
      htmlParts.push(items.join("\n"));
      continue;
    }

    // 기본 문단
    const inner = trimmed.replace(/\n/g, "<br>");
    htmlParts.push(`<p style="font-size:15px;line-height:180%;"><span style="color:#333;font-size:15px;line-height:27px;">${inner}</span></p>`);
  }

  return htmlParts.join("\n");
}

/** 마크다운 테이블 → HTML table (inline style) */
function parseTable(block: string): string {
  const lines = block.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return "";

  const headers = lines[0].split("|").map(h => h.trim()).filter(Boolean);
  // lines[1]은 구분선 (---|---), 건너뜀
  const bodyRows = lines.slice(2).map(line =>
    line.split("|").map(c => c.trim()).filter(Boolean)
  );

  const thRow = headers.map(h =>
    `<th style="background:#f8f9fa;padding:12px;text-align:left;font-weight:600;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${h}</th>`
  ).join("");

  const bodyHtml = bodyRows.map(cols => {
    const cells = cols.map((c, i) =>
      `<td style="padding:12px;font-size:14px;color:#374151;border-bottom:1px solid #e5e7eb;${i === 0 ? "font-weight:600;" : ""}">${c}</td>`
    ).join("");
    return `<tr>${cells}</tr>`;
  }).join("");

  return `<table style="border-collapse:collapse;width:100%;border:1px solid #e5e7eb;margin:16px 0;border-radius:8px;overflow:hidden;"><thead><tr>${thRow}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
}

/** > 인용 블록 → styled div (💡이면 팁 스타일) */
function parseBlockquote(lines: string[], themeColor: string): string {
  const content = lines.map(l => l.trim().replace(/^>\s?/, "")).join("<br>");
  const isTip = content.startsWith("💡");
  const bgColor = isTip ? "#FFFBEB" : "#f8f9fc";
  const borderColor = isTip ? "#F59E0B" : themeColor;

  return `<div style="background:${bgColor};border-left:3px solid ${borderColor};padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;"><p style="font-size:14px;color:#374151;line-height:1.7;font-style:italic;margin:0;">${content}</p></div>`;
}

/** - 불릿 리스트 → table 레이아웃 (이메일 호환, ::before 대체) */
function parseBulletList(lines: string[], themeColor: string): string {
  const items = lines.map(l => {
    const content = l.trim().replace(/^\s*[\-•]\s*/, "");
    return `<tr><td style="width:20px;vertical-align:top;padding:4px 0;"><div style="width:6px;height:6px;background:${themeColor};border-radius:50%;margin-top:8px;"></div></td><td style="padding:4px 0;font-size:14px;color:#374151;line-height:1.7;">${content}</td></tr>`;
  });

  return `<table style="margin:16px 0;" cellpadding="0" cellspacing="0"><tbody>${items.join("")}</tbody></table>`;
}

/**
 * content의 id로 템플릿 내 블록을 찾아 교체하는 헬퍼.
 * rows → columns → contents 순회하며 id 매칭.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function findContentById(rows: any[], id: string): any | null {
  for (const row of rows) {
    for (const col of row.columns || []) {
      for (const content of col.contents || []) {
        if (content.id === id) return content;
      }
    }
  }
  return null;
}

/** auto-generated 콘텐츠에서 제거할 placeholder row ID 목록 */
const PLACEHOLDER_ROW_IDS = ["row-toc", "row-infographic", "row-quote", "row-bullet-list"];

/**
 * email_summary만 있고 email_design_json이 없는 기존 콘텐츠에 대해
 * 타입별 템플릿을 기반으로 Unlayer 디자인 JSON을 생성한다.
 */
export function buildDesignFromSummary(content: Content): object {
  // 타입별 테마 색상
  const themeColors: Record<string, { primary: string }> = {
    education: { primary: "#F75D5D" },
    notice: { primary: "#059669" },
    case_study: { primary: "#F97316" },
  };
  const colors = themeColors[content.type ?? ""] ?? { primary: "#F75D5D" };

  // 타입별 템플릿 선택
  const baseTemplate =
    content.type === "notice"
      ? BS_CAMP_TEMPLATE_B
      : content.type === "case_study"
        ? BS_CAMP_TEMPLATE_C
        : content.type === "education"
          ? BS_CAMP_TEMPLATE_A
          : BS_CAMP_DEFAULT_TEMPLATE;

  // deep copy
  const template = JSON.parse(JSON.stringify(baseTemplate));

  // placeholder 행 제거 (auto-generated에서는 본문 블록에 전부 렌더링)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template.body.rows = template.body.rows.filter(
    (row: { id: string }) => !PLACEHOLDER_ROW_IDS.includes(row.id)
  );

  const rows = template.body.rows;

  // 제목 블록
  const titleBlock = findContentById(rows, "content-title");
  if (titleBlock) {
    titleBlock.values.text = `<h1 style="font-size: 22px; line-height: 150%;"><strong><span style="color: #1a1a1a; font-size: 22px; line-height: 33px;">${escapeHtml(content.title)}</span></strong></h1>`;
  }

  // 훅 인용구 블록 — email_summary 첫 번째 줄 사용, 타입별 색상 적용
  const hookQuote = findContentById(rows, "content-hook-quote");
  if (hookQuote && content.email_summary) {
    const firstLine = content.email_summary.split("\n\n")[0].trim();
    hookQuote.values.text = `<p style="font-size: 16px; line-height: 160%; text-align: center;"><em><span style="color: ${colors.primary}; font-size: 16px; font-weight: 600;">${escapeHtml(firstLine)}</span></em></p>`;
  }

  // 본문 블록 — email_summary를 HTML로 변환 (훅인용구가 있으면 첫 줄 제외)
  const bodyText1 = findContentById(rows, "content-body-text-1");
  if (bodyText1 && content.email_summary) {
    let bodyMd = content.email_summary;
    if (hookQuote) {
      const idx = bodyMd.indexOf("\n\n");
      bodyMd = idx !== -1 ? bodyMd.slice(idx + 2) : "";
    }
    bodyText1.values.text = bodyMd ? markdownToEmailHtml(bodyMd, colors.primary) : "";
  }

  // 본문 하단 블록 — 빈 문자열 (default 템플릿에만 존재)
  const bodyText2 = findContentById(rows, "content-body-text-2");
  if (bodyText2) {
    bodyText2.values.text = "";
  }

  // CTA 버튼 — 기사 URL 설정
  const ctaButton = findContentById(rows, "content-cta-button");
  if (ctaButton) {
    const articleUrl = `https://qa-helpdesk.vercel.app/posts/${content.id}`;
    ctaButton.values.href = {
      name: "web",
      values: { href: articleUrl, target: "_blank" },
    };
  }

  return template;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
