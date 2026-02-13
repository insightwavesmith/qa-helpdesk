import { BS_CAMP_DEFAULT_TEMPLATE, BS_CAMP_TEMPLATE_A, BS_CAMP_TEMPLATE_B, BS_CAMP_TEMPLATE_C } from "@/lib/email-default-template";
import type { Content } from "@/types/content";

/**
 * 간단한 마크다운 → HTML 변환 (이메일 본문용)
 * - 줄바꿈 → <br>
 * - 빈 줄 → 새 <p>
 * - **bold** → <strong>
 * - ![alt](url) → <img>
 */
function markdownToEmailHtml(md: string): string {
  // 이미지 변환: ![alt](url) → <img>
  let text = md.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    '<img src="$2" alt="$1" style="max-width:100%;height:auto;" />'
  );

  // **bold** → <strong>
  text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // 문단 분리: 빈 줄 기준
  const paragraphs = text.split(/\n\s*\n/);

  const htmlParts = paragraphs.map((para) => {
    const trimmed = para.trim();
    if (!trimmed) return "";
    // 문단 내 줄바꿈 → <br>
    const inner = trimmed.replace(/\n/g, "<br>");
    return `<p style="font-size: 15px; line-height: 180%;"><span style="color: #333333; font-size: 15px; line-height: 27px;">${inner}</span></p>`;
  });

  return htmlParts.filter(Boolean).join("\n");
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

/**
 * email_summary만 있고 email_design_json이 없는 기존 콘텐츠에 대해
 * BS_CAMP_DEFAULT_TEMPLATE을 기반으로 Unlayer 디자인 JSON을 생성한다.
 */
export function buildDesignFromSummary(content: Content): object {
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

  const rows = template.body.rows;

  // 제목 블록
  const titleBlock = findContentById(rows, "content-title");
  if (titleBlock) {
    titleBlock.values.text = `<h1 style="font-size: 22px; line-height: 150%;"><strong><span style="color: #1a1a1a; font-size: 22px; line-height: 33px;">${escapeHtml(content.title)}</span></strong></h1>`;
  }

  // 훅 인용구 블록 — email_summary 첫 번째 줄 사용
  const hookQuote = findContentById(rows, "content-hook-quote");
  if (hookQuote && content.email_summary) {
    const firstLine = content.email_summary.split("\n\n")[0].trim();
    hookQuote.values.text = `<p style="font-size: 16px; line-height: 160%; text-align: center;"><em><span style="color: #F75D5D; font-size: 16px;">${escapeHtml(firstLine)}</span></em></p>`;
  }

  // 본문 상단 블록 — email_summary를 HTML로 변환 (education이면 첫 줄 제외)
  const bodyText1 = findContentById(rows, "content-body-text-1");
  if (bodyText1 && content.email_summary) {
    let bodyMd = content.email_summary;
    if (content.type === "education") {
      const idx = bodyMd.indexOf("\n\n");
      bodyMd = idx !== -1 ? bodyMd.slice(idx + 2) : "";
    }
    bodyText1.values.text = bodyMd ? markdownToEmailHtml(bodyMd) : "";
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
