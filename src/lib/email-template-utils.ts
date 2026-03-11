import { BS_CAMP_DEFAULT_TEMPLATE, BS_CAMP_TEMPLATE_A, BS_CAMP_TEMPLATE_B, BS_CAMP_TEMPLATE_C } from "@/lib/email-default-template";
import type { Content } from "@/types/content";
import { getSectionType, type SectionFields, type InsightFields, type NumberedCardsFields, type ChecklistFields, type BulletListFields, type ScheduleTableFields, type BATablesFields, type InterviewFields, type ImagePlaceholderFields } from "./newsletter-section-types";
import {
  ROW_LOGO, ROW_DIVIDER, ROW_PROFILE, ROW_FOOTER,
  createHeroRow, createHookQuestionRow, createTitleRow, createHookRow, createIntroRow, createClosingRow,
  createEmotionHookRow, createStudentQuoteRow, createStudentInfoRow,
  createCtaRow,
  createSectionContentRows,
} from "./newsletter-row-templates";

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

// ─── 템플릿별 배너키 순서 (Gmail 실제 발송 순서 기준) ───
// partial match: 섹션 key.includes(orderKey) 방향으로 매칭
// AI가 영문/한글 어느 쪽이든 생성 가능하므로 동의어를 같은 위치에 배치
const TEMPLATE_KEY_ORDER: Record<string, string[]> = {
  education: ["INSIGHT", "KEY POINT", "CHECKLIST"],
  // webinar: 강의 미리보기 → 핵심 주제 → 이런 분들을 위해 → 웨비나 일정
  webinar: ["강의 미리보기", "핵심 주제", "이런 분들을 위해", "웨비나 일정"],
  notice: ["강의 미리보기", "핵심 주제", "이런 분들을 위해", "웨비나 일정"],
  case_study: ["성과", "INTERVIEW", "핵심 변화"],
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

// ─── T2: parseSectionFields ───

/**
 * 배너키와 raw content 문자열을 받아서 구조화된 SectionFields를 반환.
 * 파싱 실패 또는 빈 content → null (graceful degradation).
 */
export function parseSectionFields(bannerKey: string, content: string): SectionFields | null {
  if (!content || !content.trim()) return null;

  const sectionType = getSectionType(bannerKey);
  if (!sectionType) return null;

  switch (sectionType) {
    case "insight":
      return parseInsight(content);
    case "numbered-cards":
      return parseNumberedCards(content);
    case "checklist":
      return parseChecklist(content);
    case "bullet-list":
      return parseBulletListFields(content);
    case "schedule-table":
      return parseScheduleTable(content);
    case "before-after-tables":
      return parseBATables(content);
    case "interview-quotes":
      return parseInterview(content);
    case "image-placeholder":
      return parseImagePlaceholder(content);
    default:
      return null;
  }
}

// ─── parseSectionFields 내부 파서 ───

function parseInsight(content: string): SectionFields | null {
  const lines = content.split("\n");
  let subtitle = "";
  const bodyLines: string[] = [];
  let tip: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();
    // ## 소제목
    if (trimmed.startsWith("## ")) {
      subtitle = trimmed.replace(/^## /, "").trim();
      continue;
    }
    // > 💡 ... 팁 블록 (> 제거, 💡 유지)
    if (trimmed.startsWith(">") && trimmed.includes("💡")) {
      tip = trimmed.replace(/^>\s*/, "").trim();
      continue;
    }
    // 일반 > 인용도 팁으로 처리 (💡 없어도)
    if (trimmed.startsWith(">") && !tip) {
      tip = trimmed.replace(/^>\s*/, "").trim();
      continue;
    }
    bodyLines.push(line);
  }

  const body = bodyLines.join("\n").trim();

  // ## 없으면 첫 줄을 subtitle, 나머지를 body로
  if (!subtitle && body) {
    const allLines = body.split("\n");
    subtitle = allLines[0].trim();
    const restBody = allLines.slice(1).join("\n").trim();
    const fields: InsightFields = { subtitle, body: restBody };
    if (tip) fields.tip = tip;
    return { type: "insight", fields };
  }

  if (!subtitle && !body) return null;

  const fields: InsightFields = { subtitle, body };
  if (tip) fields.tip = tip;
  return { type: "insight", fields };
}

function parseNumberedCards(content: string): SectionFields | null {
  const items: { title: string; desc: string }[] = [];
  const lines = content.split("\n");

  // 패턴1: `01. 제목 | 설명`
  const pattern1 = /^\d{1,2}\.\s+(.+?)\s*\|\s*(.+)/;
  // 패턴2: `✅ **제목** — 설명` (—, --, -) 구분
  const pattern2 = /^✅\s*\*\*(.+?)\*\*\s*[—–\-]+\s*(.*)/;
  // 패턴3 처리용: `**제목**` 단독 줄
  const pattern3Title = /^\*\*(.+?)\*\*\s*$/;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    // 패턴1
    const m1 = trimmed.match(pattern1);
    if (m1) {
      items.push({ title: m1[1].trim(), desc: m1[2].trim() });
      continue;
    }

    // 패턴2
    const m2 = trimmed.match(pattern2);
    if (m2) {
      items.push({ title: m2[1].trim(), desc: m2[2]?.trim() || "" });
      continue;
    }

    // 패턴3: **제목** 단독 줄 + 다음 줄이 설명
    const m3 = trimmed.match(pattern3Title);
    if (m3) {
      const nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : "";
      // 다음 줄이 비어있지 않고 패턴1/2/3이 아니면 설명으로 간주
      if (nextLine && !pattern1.test(nextLine) && !pattern2.test(nextLine) && !pattern3Title.test(nextLine)) {
        items.push({ title: m3[1].trim(), desc: nextLine });
        i++; // 다음 줄 스킵
      } else {
        items.push({ title: m3[1].trim(), desc: "" });
      }
      continue;
    }
  }

  if (items.length === 0) return null;

  const fields: NumberedCardsFields = { items };
  return { type: "numbered-cards", fields };
}

function parseChecklist(content: string): SectionFields | null {
  const items: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("✅")) {
      const text = trimmed.replace(/^✅\s*/, "").trim();
      if (text) items.push(text);
    }
  }

  if (items.length === 0) return null;
  const fields: ChecklistFields = { items };
  return { type: "checklist", fields };
}

function parseBulletListFields(content: string): SectionFields | null {
  const items: string[] = [];
  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(/^[\-•]\s+(.*)/);
    if (match) {
      const text = match[1].trim();
      if (text) items.push(text);
    }
  }

  if (items.length === 0) return null;
  const fields: BulletListFields = { items };
  return { type: "bullet-list", fields };
}

function parseScheduleTable(content: string): SectionFields | null {
  const rows: { label: string; value: string }[] = [];
  const lines = content.split("\n");

  // 마크다운 테이블 형식: | 라벨 | 내용 |
  const hasTable = lines.some(l => /^\|.+\|/.test(l.trim()));

  if (hasTable) {
    for (const line of lines) {
      const trimmed = line.trim();
      // 구분선 스킵
      if (/^\|[-:\s|]+\|$/.test(trimmed)) continue;
      // 헤더 행 스킵 (항목 | 내용 형태)
      if (/^\|\s*항목\s*\|/.test(trimmed)) continue;

      const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
      if (cells.length >= 2) {
        rows.push({ label: cells[0], value: cells[1] });
      }
    }
  } else {
    // non-table fallback: 이모지 라벨: 내용
    const emojiLinePattern = /^(.+?)[:：]\s*(.+)/;
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const match = trimmed.match(emojiLinePattern);
      if (match) {
        rows.push({ label: match[1].trim(), value: match[2].trim() });
      }
    }
  }

  if (rows.length === 0) return null;
  const fields: ScheduleTableFields = { rows };
  return { type: "schedule-table", fields };
}

function parseBATables(content: string): SectionFields | null {
  const tables: { title: string; rows: { metric: string; before: string; after: string }[] }[] = [];
  let currentTitle = "";
  let currentRows: { metric: string; before: string; after: string }[] = [];
  let inTable = false;

  const lines = content.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // #### 소제목 → 새 테이블 시작
    const titleMatch = trimmed.match(/^####\s+(.+)/);
    if (titleMatch) {
      // 이전 테이블 저장
      if (currentTitle && currentRows.length > 0) {
        tables.push({ title: currentTitle, rows: [...currentRows] });
      }
      currentTitle = titleMatch[1].trim();
      currentRows = [];
      inTable = false;
      continue;
    }

    // 구분선 행 → 테이블 시작 마커
    if (/^\|[-:\s|]+\|$/.test(trimmed)) {
      inTable = true;
      continue;
    }

    // 헤더 행 스킵 (지표 | Before | After)
    if (/^\|\s*지표\s*\|/.test(trimmed)) {
      continue;
    }

    // 테이블 데이터 행
    if (inTable && /^\|.+\|/.test(trimmed)) {
      const cells = trimmed.split("|").map(c => c.trim()).filter(Boolean);
      if (cells.length >= 3) {
        currentRows.push({
          metric: cells[0],
          before: cells[1],
          after: cells[2],
        });
      }
      continue;
    }

    // 테이블이 아닌 행이 나오면 테이블 종료
    if (inTable && !trimmed.startsWith("|")) {
      inTable = false;
    }
  }

  // 마지막 테이블 저장
  if (currentTitle && currentRows.length > 0) {
    tables.push({ title: currentTitle, rows: currentRows });
  }

  // 제목 없이 테이블만 있는 경우 (fallback)
  if (tables.length === 0 && currentRows.length > 0) {
    tables.push({ title: "", rows: currentRows });
  }

  if (tables.length === 0) return null;
  const fields: BATablesFields = { tables };
  return { type: "before-after-tables", fields };
}

function parseInterview(content: string): SectionFields | null {
  const quotes: { text: string; source: string }[] = [];
  const lines = content.split("\n");

  let currentQuoteLines: string[] = [];
  let currentSource = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith(">")) {
      const raw = trimmed.replace(/^>\s*/, "").trim();

      // > — 출처 (소스 줄)
      if (raw.match(/^[—–\-]+\s+/)) {
        currentSource = raw.replace(/^[—–\-]+\s+/, "").trim();
        // 현재 인용문이 있으면 저장
        if (currentQuoteLines.length > 0) {
          const text = currentQuoteLines.join(" ").replace(/^[""]|[""]$/g, "").trim();
          quotes.push({ text, source: currentSource });
          currentQuoteLines = [];
          currentSource = "";
        }
        continue;
      }

      // > "인용문" — 출처 (한 줄에 모두)
      const inlineMatch = raw.match(/^[""](.+?)[""][  ]*[—–\-]+\s*(.+)/);
      if (inlineMatch) {
        quotes.push({ text: inlineMatch[1].trim(), source: inlineMatch[2].trim() });
        currentQuoteLines = [];
        continue;
      }

      // 일반 인용 줄
      currentQuoteLines.push(raw);
    } else {
      // > 블록 밖 — 이전 인용문 저장 (소스 없이)
      if (currentQuoteLines.length > 0) {
        const text = currentQuoteLines.join(" ").replace(/^[""]|[""]$/g, "").trim();
        if (text) {
          quotes.push({ text, source: currentSource });
        }
        currentQuoteLines = [];
        currentSource = "";
      }
    }
  }

  // 마지막 인용문 저장
  if (currentQuoteLines.length > 0) {
    const text = currentQuoteLines.join(" ").replace(/^[""]|[""]$/g, "").trim();
    if (text) {
      quotes.push({ text, source: currentSource });
    }
  }

  if (quotes.length === 0) return null;
  const fields: InterviewFields = { quotes };
  return { type: "interview-quotes", fields };
}

function parseImagePlaceholder(content: string): SectionFields | null {
  const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  let caption = "";
  let tags: string | undefined;

  for (const line of lines) {
    // 태그 라인: · 구분자 포함
    if (line.includes("·")) {
      tags = line;
      continue;
    }
    // 첫 번째 의미 있는 텍스트를 caption으로
    if (!caption) {
      caption = line;
    }
  }

  // caption이 없으면 첫 줄 사용
  if (!caption && lines.length > 0) {
    caption = lines[0];
  }

  if (!caption) return null;
  const fields: ImagePlaceholderFields = { caption };
  if (tags) fields.tags = tags;
  return { type: "image-placeholder", fields };
}

/**
 * 섹션을 TEMPLATE_KEY_ORDER에 정의된 순서로 정렬.
 * - partial match: section.key.includes(orderKey) 방향
 * - 매칭된 섹션은 정의된 순서, 매칭 안 된 섹션은 끝에 원래 순서대로 배치
 * - contentType이 null/undefined이면 education 기본값 사용
 */
export function sortSectionsByTemplate(
  sections: SummarySection[],
  contentType: string
): SummarySection[] {
  if (sections.length === 0) return [];

  const order = TEMPLATE_KEY_ORDER[contentType] ?? TEMPLATE_KEY_ORDER.education;

  const matched: (SummarySection | null)[] = new Array(order.length).fill(null);
  const unmatched: SummarySection[] = [];

  for (const section of sections) {
    // 순서 배열에서 첫 번째 매칭 위치를 찾되, 이미 점유된 슬롯은 건너뜀
    let placed = false;
    for (let i = 0; i < order.length; i++) {
      if (matched[i] === null && section.key.includes(order[i])) {
        matched[i] = section;
        placed = true;
        break;
      }
    }
    if (!placed) {
      unmatched.push(section);
    }
  }

  const sorted = matched.filter((s): s is SummarySection => s !== null);
  return [...sorted, ...unmatched];
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

/** T1: CSS-only table 배너 row (Gmail 호환, PNG 제거) */
function createBannerImageRow(bannerKey: string, slug: string): object {
  return {
    id: `row-banner-${slug}`,
    cells: [1],
    columns: [{
      id: `col-banner-${slug}`,
      contents: [{
        id: `content-banner-${slug}`,
        type: "text",
        values: {
          containerPadding: "16px 24px 0px", anchor: "", textAlign: "left", lineHeight: "140%",
          linkStyle: { inherit: true, linkColor: "#0000ee", linkHoverColor: "#0000ee", linkUnderline: true, linkHoverUnderline: true },
          hideDesktop: false, displayCondition: null,
          _meta: { htmlID: `u_content_banner_${slug}`, htmlClassNames: "u_content_text" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: `<table cellpadding="0" cellspacing="0" style="width:66%;"><tr><td style="background-color:#F75D5D;padding:16px 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:1px;">${bannerKey}</td></tr></table>`,
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
    webinar: ["강의 미리보기", "핵심 주제", "이런 분들을 위해", "웨비나 일정"],
    notice: ["강의 미리보기", "핵심 주제", "이런 분들을 위해", "웨비나 일정"],
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
  // **bold** → <strong> ([\s\S]+? — 줄바꿈 포함 매칭)
  let text = md.replace(/\*\*([\s\S]+?)\*\*/g, '<strong style="color:#F75D5D;">$1</strong>');

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

    // T1: ### 섹션 배너 — CSS-only table (Gmail 호환, PNG 제거)
    const h3Match = trimmed.match(/^### (.+)/);
    if (h3Match) {
      const bannerKey = h3Match[1].trim();
      htmlParts.push(`<table cellpadding="0" cellspacing="0" style="width:66%;margin:24px 0 0;"><tr><td style="background-color:#F75D5D;padding:16px 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:1px;">${bannerKey}</td></tr></table>`);
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

// ─── hookLine 분리 헬퍼 (G1, G2, G5, G6) ───

/**
 * hookLine을 hook/intro/studentQuote로 분리.
 * - 일반: 첫 번째 단락 = hook, 나머지 = intro
 * - case_study: 첫 번째 단락 = hook, 중간 = intro(배경), > 인용 = studentQuote
 */
function splitHookAndIntro(hookLine: string, contentType: string): {
  hook: string;
  intro: string;
  studentQuote?: { text: string; source: string };
  studentInfo?: { name: string; brand?: string; industry?: string; period?: string };
} {
  const paragraphs = hookLine.split(/\n\n+/).map(p => p.trim()).filter(Boolean);

  if (contentType === "case_study") {
    const quoteIdx = paragraphs.findIndex(p => p.startsWith(">"));
    const hook = paragraphs[0] || "";
    let studentQuote: { text: string; source: string } | undefined;
    let studentInfo: { name: string; brand?: string; industry?: string; period?: string } | undefined;

    // 📋 수강생 정보 파싱
    const infoIdx = paragraphs.findIndex(p => p.startsWith("📋"));
    if (infoIdx >= 0) {
      const infoParts = paragraphs[infoIdx].replace(/^📋\s*/, "").split("|").map(s => s.trim());
      const info: Record<string, string> = {};
      for (const part of infoParts) {
        const [key, ...vals] = part.split(":");
        if (key && vals.length) info[key.trim()] = vals.join(":").trim();
      }
      if (info["수강생"]) {
        studentInfo = {
          name: info["수강생"],
          brand: info["브랜드"],
          industry: info["업종"],
          period: info["수강"],
        };
      }
    }

    const endIdx = quoteIdx > 0 ? quoteIdx : paragraphs.length;

    if (quoteIdx > 0) {
      const quoteBlock = paragraphs[quoteIdx];
      const quoteLines = quoteBlock.split("\n").map(l => l.replace(/^>\s*/, "").trim());
      const sourceLine = quoteLines.find(l => /^[—–\-]+\s/.test(l));
      const textLines = quoteLines.filter(l => !/^[—–\-]+\s/.test(l));
      studentQuote = {
        text: textLines.join(" ").replace(/^[""\u201C]|[""\u201D]$/g, ""),
        source: sourceLine?.replace(/^[—–\-]+\s*/, "") || "수강생",
      };
    }

    // intro에서 📋 라인 제외
    const introParas = paragraphs.slice(1, endIdx).filter((_, i) => i + 1 !== infoIdx);
    return { hook, intro: introParas.join("\n\n"), studentQuote, studentInfo };
  }

  return { hook: paragraphs[0] || "", intro: paragraphs.slice(1).join("\n\n") };
}

// ─── 마감 텍스트 추출 헬퍼 (G9) ───

/**
 * 마지막 섹션의 trailing 텍스트를 closing으로 추출.
 * 섹션 패턴(✅, >, |, ##, 01., **, -, •) 뒤에 남은 일반 텍스트를 분리.
 */
function extractClosingText(sections: SummarySection[]): string {
  if (sections.length === 0) return "";
  const last = sections[sections.length - 1];
  const lines = last.content.split("\n");

  let lastPatternIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (!t) continue;
    if (/^[✅>|#]|^\d{1,2}\.\s|^\*\*|^[-•]\s/.test(t)) {
      lastPatternIdx = i;
      break;
    }
  }

  if (lastPatternIdx >= 0 && lastPatternIdx < lines.length - 1) {
    const closing = lines.slice(lastPatternIdx + 1).join("\n").trim();
    if (closing) {
      last.content = lines.slice(0, lastPatternIdx + 1).join("\n").trim();
      return closing;
    }
  }
  return "";
}

/**
 * email_summary만 있고 email_design_json이 없는 기존 콘텐츠에 대해
 * 타입별 템플릿을 기반으로 Unlayer 디자인 JSON을 생성한다.
 * T3: 고정 Row 템플릿 기반 재구현 (parseSectionFields → createSectionContentRows 파이프라인)
 */
export function buildDesignFromSummary(content: Content): object {
  const contentType = content.type ?? "education";
  const articleUrl = `https://bscamp.vercel.app/posts/${content.id}`;

  // Base template shell (counters, body.values, schemaVersion 등)
  const baseTemplate =
    contentType === "notice" || contentType === "webinar"
      ? BS_CAMP_TEMPLATE_B
      : contentType === "case_study"
        ? BS_CAMP_TEMPLATE_C
        : contentType === "education"
          ? BS_CAMP_TEMPLATE_A
          : BS_CAMP_DEFAULT_TEMPLATE;
  const template = JSON.parse(JSON.stringify(baseTemplate));

  // ─── 1. 파싱: email_summary → 섹션 분리 → 구조화된 필드 ───
  const parsed = parseSummaryToSections(content.email_summary ?? "");
  const sorted = sortSectionsByTemplate(parsed.sections, contentType);

  // ─── 2. 마감 텍스트 추출 (G9: 마지막 섹션의 trailing text) ───
  const closingText = extractClosingText(sorted);

  // ─── 3. 동적 섹션 row 생성 (새 파이프라인) ───
  const sectionRows: object[] = [];
  for (const section of sorted) {
    const sf = parseSectionFields(section.key, section.content);
    if (sf) {
      sectionRows.push(...createSectionContentRows(section.key, sf));
    } else if (section.key) {
      // fallback: 기존 방식 (배너 이미지 + 마크다운→HTML 텍스트 블록)
      sectionRows.push(...createSectionRows(section));
    }
  }

  // ─── 4. 템플릿별 레이아웃 조립 ───
  const rows: object[] = [];  // 로고는 히어로에 통합 (R13)

  const ctaTexts: Record<string, string> = {
    education: "전체 가이드 보기",
    notice: "지금 신청하기",
    webinar: "지금 신청하기",
    case_study: "성공사례 보러가기",
  };
  const ctaText = ctaTexts[contentType] ?? "전체 가이드 보기";
  const ctaColor = "#F75D5D";

  if (contentType === "notice" || contentType === "webinar") {
    // Webinar/Notice: Hero(title) → HookQuestion → IntroBody → Divider → Sections → Closing → Divider → Profile → CTA → Footer
    const { hook: wHook, intro: wIntro } = splitHookAndIntro(parsed.hookLine, contentType);
    rows.push(createHeroRow(content.title, ""));
    if (wHook) rows.push(createHookQuestionRow(wHook));
    if (wIntro) rows.push(createIntroRow(wIntro));
    rows.push(ROW_DIVIDER);
    rows.push(...sectionRows);
    if (closingText) rows.push(createClosingRow(closingText));
    rows.push(ROW_DIVIDER);
    rows.push(ROW_PROFILE);
    rows.push(createCtaRow(ctaText, articleUrl, ctaColor));
    // G8: farewell 제거 (골드 스탠다드에 없음)
    rows.push(ROW_FOOTER);
  } else if (contentType === "case_study") {
    // Case Study: Hero(수강생 사례) → EmotionHook → StudentInfo → Background → StudentQuote → Divider → Sections → CTA → Footer
    rows.push(createHeroRow(content.title, "", "수강생 사례"));
    const { hook: csHook, intro: csIntro, studentQuote, studentInfo } = splitHookAndIntro(parsed.hookLine, contentType);
    if (csHook) rows.push(createEmotionHookRow(csHook));
    if (studentInfo) rows.push(createStudentInfoRow(studentInfo.name, studentInfo.brand, studentInfo.industry, studentInfo.period));
    if (csIntro) rows.push(createIntroRow(csIntro));
    // studentQuote 삭제 — INTERVIEW 섹션과 겹침 (R12)
    rows.push(ROW_DIVIDER);
    rows.push(...sectionRows);
    rows.push(ROW_DIVIDER);
    rows.push(ROW_PROFILE);
    rows.push(createCtaRow(ctaText, articleUrl, ctaColor));
    rows.push(ROW_FOOTER);
  } else {
    // Education (default): Hero(정보공유) → Hook → IntroBody → Divider → Sections → Closing → Divider → Profile → CTA → Footer
    rows.push(createHeroRow(content.title, "", "정보공유"));
    const { hook, intro } = splitHookAndIntro(parsed.hookLine, contentType);
    if (hook) rows.push(createHookRow(hook));
    if (intro) rows.push(createIntroRow(intro));
    rows.push(ROW_DIVIDER);
    rows.push(...sectionRows);
    if (closingText) rows.push(createClosingRow(closingText));
    rows.push(ROW_DIVIDER);
    rows.push(ROW_PROFILE);
    rows.push(createCtaRow(ctaText, articleUrl, ctaColor));
    rows.push(ROW_FOOTER);
  }

  template.body.rows = rows;
  return template;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
