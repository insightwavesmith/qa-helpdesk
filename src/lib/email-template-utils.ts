import { BS_CAMP_DEFAULT_TEMPLATE, BS_CAMP_TEMPLATE_A, BS_CAMP_TEMPLATE_B, BS_CAMP_TEMPLATE_C } from "@/lib/email-default-template";
import type { Content } from "@/types/content";

const BANNER_BASE_URL = "https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners";

const BANNER_MAP: Record<string, string> = {
  "INSIGHT": "banner-insight",
  "INSIGHT 01": "banner-insight-01",
  "INSIGHT 02": "banner-insight-02",
  "INSIGHT 03": "banner-insight-03",
  "KEY POINT": "banner-key-point",
  "CHECKLIST": "banner-checklist",
  "강의 미리보기": "banner-preview",
  "핵심 주제": "banner-topics",
  "이런 분들을 위해": "banner-target",
  "웨비나 일정": "banner-schedule",
  "INTERVIEW": "banner-interview",
  "핵심 변화": "banner-change",
  "성과": "banner-results",
};

// ─── T1: parseSummaryToSections ───

export interface SummarySection {
  key: string;
  content: string;
}

export interface ParsedSummary {
  hookLine: string;
  sections: SummarySection[];
}

/**
 * email_summary 마크다운을 ### 배너키 기준으로 분리.
 * 첫 번째 ### 이전 텍스트는 hookLine으로 반환.
 * ### 없으면 전체를 단일 섹션으로 반환 (graceful degradation).
 */
export function parseSummaryToSections(md: string): ParsedSummary {
  if (!md || !md.trim()) {
    return { hookLine: "", sections: [] };
  }

  const parts = md.split(/^### /m);
  const hookLine = parts[0].trim();

  if (parts.length <= 1) {
    return {
      hookLine: "",
      sections: [{ key: "", content: md.trim() }],
    };
  }

  const sections: SummarySection[] = [];
  for (let i = 1; i < parts.length; i++) {
    const lines = parts[i].split("\n");
    const key = lines[0].trim();
    const content = lines.slice(1).join("\n").trim();
    if (key) {
      sections.push({ key, content });
    }
  }

  return { hookLine, sections };
}

// ─── T2: createSectionRows ───

/** 배너키 → slug 변환 (BANNER_MAP 값 기반, 없으면 lowercase 변환) */
function slugify(key: string): string {
  const matchedKey = Object.keys(BANNER_MAP)
    .filter(k => key.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  if (matchedKey) {
    return BANNER_MAP[matchedKey].replace("banner-", "");
  }
  return key.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
}

/** 배너 이미지 row (Unlayer image type) 또는 CSS gradient fallback (text type) */
function createBannerImageRow(bannerKey: string, slug: string): object {
  const matchedKey = Object.keys(BANNER_MAP)
    .filter(key => bannerKey.includes(key))
    .sort((a, b) => b.length - a.length)[0];
  const bannerFile = matchedKey ? BANNER_MAP[matchedKey] : undefined;

  if (bannerFile) {
    return {
      id: `row-banner-${slug}`,
      cells: [1],
      columns: [{
        id: `col-banner-${slug}`,
        contents: [{
          id: `content-banner-${slug}`,
          type: "image",
          values: {
            containerPadding: "24px 24px 0px",
            anchor: "",
            src: { url: `${BANNER_BASE_URL}/${bannerFile}.png`, width: 600, height: 120 },
            textAlign: "center",
            altText: bannerKey,
            action: { name: "web", values: { href: "", target: "_blank" } },
            hideDesktop: false,
            displayCondition: null,
            _meta: { htmlID: `u_content_banner_${slug}`, htmlClassNames: "u_content_image" },
            selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
            fullWidth: false,
          },
        }],
        values: {
          backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
          _meta: { htmlID: `u_column_banner_${slug}`, htmlClassNames: "u_column" },
        },
      }],
      values: {
        displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
        backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
        padding: "0px", anchor: "", hideDesktop: false,
        _meta: { htmlID: `u_row_banner_${slug}`, htmlClassNames: "u_row" },
        selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      },
    };
  }

  // CSS gradient fallback
  return {
    id: `row-banner-${slug}`,
    cells: [1],
    columns: [{
      id: `col-banner-${slug}`,
      contents: [{
        id: `content-banner-${slug}`,
        type: "text",
        values: {
          containerPadding: "24px 24px 0px", anchor: "", textAlign: "left", lineHeight: "140%",
          linkStyle: { inherit: true, linkColor: "#0000ee", linkHoverColor: "#0000ee", linkUnderline: true, linkHoverUnderline: true },
          hideDesktop: false, displayCondition: null,
          _meta: { htmlID: `u_content_banner_${slug}`, htmlClassNames: "u_content_text" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: `<div style="max-width:600px;height:80px;line-height:80px;background:linear-gradient(135deg,#F75D5D 0%,#E54949 60%,transparent 60%);border-radius:4px 0 0 4px;"><span style="padding-left:32px;color:#fff;font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${bannerKey}</span></div>`,
        },
      }],
      values: {
        backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
        _meta: { htmlID: `u_column_banner_${slug}`, htmlClassNames: "u_column" },
      },
    }],
    values: {
      displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
      padding: "0px", anchor: "", hideDesktop: false,
      _meta: { htmlID: `u_row_banner_${slug}`, htmlClassNames: "u_row" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

/** 콘텐츠 텍스트 row (Unlayer text type) */
function createContentTextRow(section: SummarySection, slug: string): object {
  const html = section.content ? markdownToEmailHtml(section.content) : "";
  return {
    id: `row-content-${slug}`,
    cells: [1],
    columns: [{
      id: `col-content-${slug}`,
      contents: [{
        id: `content-text-${slug}`,
        type: "text",
        values: {
          containerPadding: "16px 24px", anchor: "", textAlign: "left", lineHeight: "180%",
          linkStyle: { inherit: true, linkColor: "#F75D5D", linkHoverColor: "#E54949", linkUnderline: true, linkHoverUnderline: true },
          hideDesktop: false, displayCondition: null,
          _meta: { htmlID: `u_content_text_${slug}`, htmlClassNames: "u_content_text" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: html,
        },
      }],
      values: {
        backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
        _meta: { htmlID: `u_column_content_${slug}`, htmlClassNames: "u_column" },
      },
    }],
    values: {
      displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
      padding: "0px", anchor: "", hideDesktop: false,
      _meta: { htmlID: `u_row_content_${slug}`, htmlClassNames: "u_row" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

/** 하나의 섹션 → 배너 row + 콘텐츠 row (2개 독립 row) 반환 */
function createSectionRows(section: SummarySection): object[] {
  const slug = slugify(section.key);
  const rows: object[] = [];
  if (section.key) {
    rows.push(createBannerImageRow(section.key, slug));
  }
  rows.push(createContentTextRow(section, slug));
  return rows;
}

// ─── T4: validateBannerKeys ───

/** email_summary의 배너키를 타입별 기대값과 비교 검증 */
export function validateBannerKeys(
  summary: string,
  contentType: string
): { valid: boolean; missing: string[]; forbidden: string[] } {
  const keyMatches = summary.match(/^### (.+)/gm) || [];
  const foundKeys = keyMatches.map(m => m.replace(/^### /, "").trim());

  const expectedByType: Record<string, string[]> = {
    education: ["INSIGHT", "KEY POINT", "CHECKLIST"],
    webinar: ["웨비나 일정", "INSIGHT", "KEY POINT", "CHECKLIST", "이런 분들을 위해"],
    notice: ["웨비나 일정", "INSIGHT", "KEY POINT", "CHECKLIST", "이런 분들을 위해"],
    case_study: ["성과", "INTERVIEW", "핵심 변화"],
  };

  const expected = expectedByType[contentType] || expectedByType.education;
  const bannerMapKeys = Object.keys(BANNER_MAP);

  const missing = expected.filter(k => !foundKeys.some(f => f.includes(k)));
  const forbidden = foundKeys.filter(k => !bannerMapKeys.some(mapKey => k.includes(mapKey)));

  return { valid: missing.length === 0 && forbidden.length === 0, missing, forbidden };
}

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

    // ### 섹션 배너 (이미지 or CSS gradient fallback)
    const h3Match = trimmed.match(/^### (.+)/);
    if (h3Match) {
      const bannerKey = h3Match[1].trim();
      const matchedKey = Object.keys(BANNER_MAP)
        .filter(key => bannerKey.includes(key))
        .sort((a, b) => b.length - a.length)[0];
      const bannerFile = matchedKey ? BANNER_MAP[matchedKey] : undefined;
      if (bannerFile) {
        htmlParts.push(`<img src="${BANNER_BASE_URL}/${bannerFile}.png" alt="${bannerKey}" style="display:block;width:100%;max-width:600px;height:auto;border-radius:6px 6px 0 0;margin:24px 0 0;" />`);
      } else {
        // fallback: CSS gradient (매핑에 없는 경우)
        htmlParts.push(`<div style="max-width:600px;height:80px;line-height:80px;background:linear-gradient(135deg,#F75D5D 0%,#E54949 60%,transparent 60%);margin:24px 0 16px;border-radius:4px 0 0 4px;"><span style="padding-left:32px;color:#fff;font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${bannerKey}</span></div>`);
      }
      continue;
    }

    // #### 서브타이틀 (성과 섹션 등)
    const h4Match = trimmed.match(/^#### (.+)/);
    if (h4Match) {
      htmlParts.push(`<div style="margin:16px 0 8px;padding:12px 16px;background:#FFF5F5;border-left:4px solid #F75D5D;"><span style="font-size:15px;font-weight:800;color:#F75D5D;">${h4Match[1]}</span></div>`);
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
          return `<tr><td style="background:#FEF2F2;border-radius:12px;padding:20px 24px;"><table cellpadding="0" cellspacing="0"><tr><td style="vertical-align:top;padding-right:16px;"><div style="min-width:44px;height:44px;border-radius:10px;background:#F75D5D;color:#fff;font-size:18px;font-weight:800;text-align:center;line-height:44px;">${num}</div></td><td style="vertical-align:top;"><div style="font-size:15px;font-weight:700;color:#1a1a1a;margin-bottom:6px;">${item.title}</div>${item.desc ? `<div style="font-size:13px;color:#6b7280;line-height:1.6;">${item.desc}</div>` : ""}</td></tr></table></td></tr>`;
        });
        htmlParts.push(`<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border-spacing:0 12px;margin:16px 0;">${cards.join("")}</table>`);
      } else {
        // BUG-4: 체크리스트 라인 카드 스타일 (모바일 반응형)
        const checkItems = lines.filter(l => l.trim().startsWith("✅"));
        const rows = checkItems.map((l, i) => {
          const text = l.trim().replace(/^✅\s*/, "");
          const borderBottom = i < checkItems.length - 1 ? "border-bottom:1px solid #FEE2E2;" : "";
          return `<tr><td style="padding:14px 20px;${borderBottom}"><div style="font-size:14px;color:#374151;line-height:1.5;"><span style="display:inline-block;width:16px;border-radius:4px;background:#F75D5D;text-align:center;padding:3px 0;line-height:1;color:#fff;font-size:10px;font-weight:700;vertical-align:middle;margin-right:8px;">&#10003;</span>${text}</div></td></tr>`;
        });
        htmlParts.push(`<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #FECACA;border-radius:12px;overflow:hidden;margin:16px 0;">${rows.join("")}</table>`);
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
  // 동적 row로 대체되는 본문 블록
  "row-body-text-1", "row-body-text-2",
  // BUG-2: Template B 전용 (파서가 이미 렌더링하므로 중복 제거)
  "row-slide-preview", "row-program-list", "row-info-block", "row-cta-outline",
  // BUG-3: Template C 전용
  "row-student-profile", "row-ba-card",
];

/**
 * email_summary만 있고 email_design_json이 없는 기존 콘텐츠에 대해
 * 타입별 템플릿을 기반으로 Unlayer 디자인 JSON을 생성한다.
 */
export function buildDesignFromSummary(content: Content): object {
  // 타입별 템플릿 선택
  const baseTemplate =
    content.type === "notice" || content.type === "webinar"
      ? BS_CAMP_TEMPLATE_B
      : content.type === "case_study"
        ? BS_CAMP_TEMPLATE_C
        : content.type === "education"
          ? BS_CAMP_TEMPLATE_A
          : BS_CAMP_DEFAULT_TEMPLATE;

  // deep copy
  const template = JSON.parse(JSON.stringify(baseTemplate));

  // placeholder 행 제거 (auto-generated에서는 본문 블록에 전부 렌더링)
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

  // 히어로 블록 — Template B 웨비나 제목/부제목 삽입
  const heroBlock = findContentById(rows, "content-hero");
  if (heroBlock) {
    const subtitle = content.email_summary ? escapeHtml(content.email_summary.split("\n\n")[0].trim()) : "";
    heroBlock.values.text = `<p style="text-align: center;"><span style="background-color:rgba(255,255,255,0.2);padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#ffffff;">LIVE 무료 웨비나</span></p>\n<p style="color: #ffffff; font-size: 24px; font-weight: 800; text-align: center; line-height: 140%; margin-top: 12px;">${escapeHtml(content.title)}</p>\n<p style="color: rgba(255,255,255,0.8); font-size: 14px; text-align: center; margin-top: 4px;">${subtitle}</p>`;
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

  // ─── T3: 동적 섹션 row 생성 (배너키별 독립 row) ───
  if (content.email_summary) {
    const parsed = parseSummaryToSections(content.email_summary);
    const dynamicRows: object[] = [];
    for (const section of parsed.sections) {
      dynamicRows.push(...createSectionRows(section));
    }

    const HEADER_IDS = new Set(["row-header", "row-hero", "row-title", "row-hook-quote"]);
    const FOOTER_IDS = new Set(["row-profile", "row-cta", "row-closing", "row-cta-outline", "row-footer"]);

    const headerRows: object[] = [];
    const footerRows: object[] = [];
    for (const row of template.body.rows as { id: string }[]) {
      if (HEADER_IDS.has(row.id)) {
        headerRows.push(row);
      } else if (FOOTER_IDS.has(row.id)) {
        footerRows.push(row);
      }
    }

    template.body.rows = [...headerRows, ...dynamicRows, ...footerRows];
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
