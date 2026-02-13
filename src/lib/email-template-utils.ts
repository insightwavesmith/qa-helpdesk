import { BS_CAMP_DEFAULT_TEMPLATE, BS_CAMP_TEMPLATE_A, BS_CAMP_TEMPLATE_B, BS_CAMP_TEMPLATE_C } from "@/lib/email-default-template";
import type { Content } from "@/types/content";

/**
 * 마크다운 → 이메일 호환 HTML 변환
 * 지원: ##, ---, > 인용, > 💡 팁, ✅ 체크, - 불릿, | 테이블, **bold**, ![img], [link]
 * 모든 스타일은 inline (이메일 클라이언트 호환)
 */
function markdownToEmailHtml(md: string): string {
  // **bold** → <strong>
  let text = md.replace(/\*\*(.+?)\*\*/g, '<strong style="color:#F75D5D;">$1</strong>');

  // 이미지: ![alt](url) + 캡션
  text = text.replace(
    /!\[([^\]]*)\]\(([^)]+)\)/g,
    (_, alt, url) => {
      let html = `<img src="${url}" alt="${alt}" style="display:block;max-width:100%;height:auto;border-radius:8px;" />`;
      if (alt && alt !== "image" && alt !== "img") {
        html += `<p style="text-align:center;font-size:13px;color:#9ca3af;margin:8px 0 0;">${alt}</p>`;
      }
      return html;
    }
  );

  // 링크: [text](url)
  text = text.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" style="color:#F75D5D;text-decoration:underline;" target="_blank">$1</a>'
  );

  // 블록 분리 (빈 줄 기준)
  const rawBlocks = text.split(/\n\s*\n/);

  // BUG-1 fix: 빈 줄로 분리된 연속 ✅ 블록을 하나로 합침 (번호 카드 01 고정 방지)
  // ✅ 블록은 "✅ **bold**\n설명줄" 구조이므로 첫 줄만 ✅ 시작 여부로 판단
  const blocks: string[] = [];
  for (const raw of rawBlocks) {
    const t = raw.trim();
    if (!t) continue;
    const isCheck = t.split("\n")[0].trim().startsWith("✅");
    if (isCheck && blocks.length > 0) {
      const prevFirst = blocks[blocks.length - 1].split("\n")[0].trim();
      if (prevFirst.startsWith("✅")) {
        blocks[blocks.length - 1] += "\n\n" + t;
        continue;
      }
    }
    blocks.push(t);
  }

  const htmlParts: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    // --- 수평선
    if (/^-{3,}$/.test(trimmed)) {
      htmlParts.push('<hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;">');
      continue;
    }

    // ### 섹션 배너 (gradient — 빨간색 통일)
    const h3Match = trimmed.match(/^### (.+)/);
    if (h3Match) {
      htmlParts.push(`<div style="height:56px;line-height:56px;background:linear-gradient(135deg,#F75D5D 0%,#E54949 60%,transparent 60%);margin:24px 0 16px;border-radius:4px 0 0 4px;"><span style="padding-left:32px;color:#fff;font-size:14px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${h3Match[1]}</span></div>`);
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
      htmlParts.push(parseBlockquote(lines));
      continue;
    }

    // 불릿 리스트: 모든 줄이 - 또는 • 로 시작
    if (lines.every(l => /^\s*[\-•]\s/.test(l))) {
      htmlParts.push(parseBulletList(lines));
      continue;
    }

    // ✅ 핵심 포인트 → bold 있으면 번호 카드, 없으면 단순 체크
    if (lines.some(l => l.trim().startsWith("✅"))) {
      const hasBoldCard = lines.some(l => l.trim().startsWith("✅") && /<strong[^>]*>/.test(l));

      if (hasBoldCard) {
        // 번호 카드 블록
        const cardItems: { title: string; desc: string }[] = [];
        for (const l of lines) {
          if (l.trim().startsWith("✅")) {
            const raw = l.trim().replace(/^✅\s*/, "");
            const boldMatch = raw.match(/^<strong[^>]*>(.+?)<\/strong>\s*[—–\-]?\s*(.*)/);
            cardItems.push({
              title: boldMatch ? boldMatch[1] : raw,
              desc: boldMatch ? (boldMatch[2] || "") : "",
            });
          } else if (cardItems.length > 0) {
            cardItems[cardItems.length - 1].desc += (cardItems[cardItems.length - 1].desc ? " " : "") + l.trim();
          }
        }
        const cards = cardItems.map((item, i) => {
          const num = String(i + 1).padStart(2, "0");
          return `<tr><td style="background:#FEF2F2;border-radius:12px;padding:20px 24px;"><table cellpadding="0" cellspacing="0"><tr><td style="vertical-align:top;padding-right:16px;"><div style="width:44px;height:44px;border-radius:10px;background:#F75D5D;color:#fff;font-size:18px;font-weight:800;text-align:center;line-height:44px;">${num}</div></td><td style="vertical-align:top;"><div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:6px;">${item.title}</div>${item.desc ? `<div style="font-size:13px;color:#6b7280;line-height:1.6;">${item.desc}</div>` : ""}</td></tr></table></td></tr>`;
        });
        htmlParts.push(`<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 12px;margin:16px 0;">${cards.join("")}</table>`);
      } else {
        // BUG-4: 체크리스트 라인 카드 스타일
        const checkItems = lines.filter(l => l.trim().startsWith("✅"));
        const rows = checkItems.map((l, i) => {
          const text = l.trim().replace(/^✅\s*/, "");
          const borderBottom = i < checkItems.length - 1 ? "border-bottom:1px solid #FEE2E2;" : "";
          return `<tr><td style="padding:14px 20px;${borderBottom}"><table cellpadding="0" cellspacing="0" width="100%" style="table-layout:fixed;"><tr><td style="width:36px;vertical-align:middle;"><div style="width:20px;height:20px;border-radius:6px;background:#F75D5D;text-align:center;line-height:20px;color:#fff;font-size:12px;font-weight:700;">&#10003;</div></td><td style="vertical-align:middle;font-size:14px;color:#374151;line-height:1.5;">${text}</td></tr></table></td></tr>`;
        });
        htmlParts.push(`<table width="100%" cellpadding="0" cellspacing="0" style="table-layout:fixed;border:1px solid #FECACA;border-radius:12px;overflow:hidden;margin:16px 0;">${rows.join("")}</table>`);
      }
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
    `<th style="background:#FEF2F2;padding:12px;text-align:left;font-weight:600;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb;">${h}</th>`
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
function parseBlockquote(lines: string[]): string {
  const content = lines.map(l => l.trim().replace(/^>\s?/, "")).join("<br>");
  const isTip = content.startsWith("💡");
  const bgColor = isTip ? "#FFFBEB" : "#f8f9fc";
  const borderColor = isTip ? "#F59E0B" : "#F75D5D";

  return `<div style="background:${bgColor};border-left:3px solid ${borderColor};padding:16px 20px;margin:16px 0;border-radius:0 8px 8px 0;"><p style="font-size:14px;color:#374151;line-height:1.7;font-style:italic;margin:0;">${content}</p></div>`;
}

/** - 불릿 리스트 → table 레이아웃 (이메일 호환, ::before 대체) */
function parseBulletList(lines: string[]): string {
  const items = lines.map(l => {
    const content = l.trim().replace(/^\s*[\-•]\s*/, "");
    return `<tr><td style="width:20px;vertical-align:top;padding:4px 0;"><div style="width:6px;height:6px;background:#F75D5D;border-radius:50%;margin-top:8px;"></div></td><td style="padding:4px 0;font-size:14px;color:#374151;line-height:1.7;">${content}</td></tr>`;
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

/** auto-generated 콘텐츠에서 제거할 placeholder row ID 목록 (모든 템플릿 공통) */
const PLACEHOLDER_ROW_IDS = [
  "row-toc", "row-infographic", "row-quote", "row-bullet-list", "row-section-banner", "row-section-banner-2",
  // BUG-2: Template B 전용 (파서가 이미 렌더링하므로 중복 제거)
  "row-slide-preview", "row-program-list", "row-info-block", "row-cta-outline",
  // BUG-3: Template C 전용
  "row-profile", "row-ba-card",
];

/**
 * email_summary만 있고 email_design_json이 없는 기존 콘텐츠에 대해
 * 타입별 템플릿을 기반으로 Unlayer 디자인 JSON을 생성한다.
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

  // placeholder 행 제거 (auto-generated에서는 본문 블록에 전부 렌더링)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template.body.rows = template.body.rows.filter(
    (row: { id: string }) => !PLACEHOLDER_ROW_IDS.includes(row.id)
  );

  // Template B(notice): hero가 제목을 표시하므로 중복 title/hook-quote 행 제거
  // BUG-5: hero가 subtitle로 첫 줄을 이미 표시하므로 hook-quote 행도 제거
  if (content.type === "notice") {
    template.body.rows = template.body.rows.filter(
      (row: { id: string }) => row.id !== "row-title" && row.id !== "row-hook-quote"
    );
  }

  // BUG-2/3: row-closing은 Template B/C에서만 제거 (Default/A는 유지)
  if (content.type === "notice" || content.type === "case_study") {
    template.body.rows = template.body.rows.filter(
      (row: { id: string }) => row.id !== "row-closing"
    );
  }

  // BUG-6: 로고 아래 빨간 divider 제거 (모든 템플릿 공통)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of template.body.rows as any[]) {
    for (const col of row.columns || []) {
      col.contents = (col.contents || []).filter(
        (c: { id: string }) => c.id !== "content-divider-header"
      );
    }
  }

  const rows = template.body.rows;

  // 제목 블록
  const titleBlock = findContentById(rows, "content-title");
  if (titleBlock) {
    titleBlock.values.text = `<h1 style="font-size: 22px; line-height: 150%; text-align: center;"><strong><span style="color: #1a1a1a; font-size: 22px; line-height: 33px;">${escapeHtml(content.title)}</span></strong></h1>`;
  }

  // 훅 인용구 블록 — email_summary 첫 번째 줄 사용, 타입별 색상 적용
  const hookQuote = findContentById(rows, "content-hook-quote");
  if (hookQuote && content.email_summary) {
    const firstLine = content.email_summary.split("\n\n")[0].trim();
    hookQuote.values.text = `<p style="font-size: 16px; line-height: 160%; text-align: center;"><em><span style="color: #F75D5D; font-size: 16px; font-weight: 600;">${escapeHtml(firstLine)}</span></em></p>`;
  }

  // 본문 블록 — email_summary를 HTML로 변환 (훅인용구가 있으면 첫 줄 제외)
  const bodyText1 = findContentById(rows, "content-body-text-1");
  if (bodyText1 && content.email_summary) {
    let bodyMd = content.email_summary;
    if (hookQuote) {
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

  // 히어로 블록 — Template B 웨비나 제목/부제목 삽입
  const heroBlock = findContentById(rows, "content-hero");
  if (heroBlock) {
    const subtitle = content.email_summary ? escapeHtml(content.email_summary.split("\n\n")[0].trim()) : "";
    heroBlock.values.text = `<p style="text-align: center;"><span style="background-color:rgba(255,255,255,0.2);padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#ffffff;">LIVE 무료 웨비나</span></p>\n<p style="color: #ffffff; font-size: 24px; font-weight: 800; text-align: center; line-height: 140%; margin-top: 12px;">${escapeHtml(content.title)}</p>\n<p style="color: #94a3b8; font-size: 14px; text-align: center; margin-top: 4px;">${subtitle}</p>`;
  }

  // CTA 버튼 — URL + 타입별 텍스트 설정
  const ctaButton = findContentById(rows, "content-cta-button");
  if (ctaButton) {
    const articleUrl = `https://qa-helpdesk.vercel.app/posts/${content.id}`;
    ctaButton.values.href = {
      name: "web",
      values: { href: articleUrl, target: "_blank" },
    };
    const ctaTexts: Record<string, string> = {
      education: "전체 가이드 보기",
      notice: "지금 신청하기",
      case_study: "수강 후기 더보기",
    };
    const ctaLabel = ctaTexts[content.type ?? ""] ?? "전체 가이드 보기";
    ctaButton.values.text = `<span style="font-size: 16px; line-height: 22.4px;"><strong>${ctaLabel} &rarr;</strong></span>`;
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
