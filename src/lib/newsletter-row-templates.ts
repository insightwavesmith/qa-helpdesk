/**
 * T1+T5: 뉴스레터 섹션별 고정 Unlayer Row JSON 정의
 *
 * 배너키별 구조화된 필드(SectionFields)를 받아서 Unlayer row 배열을 반환한다.
 * 모든 HTML은 인라인 스타일만 사용 (이메일 클라이언트 호환).
 * flexbox 대신 <table> 레이아웃 사용.
 */

import type {
  InsightFields, NumberedCardsFields, ChecklistFields,
  BulletListFields, ScheduleTableFields, BATablesFields,
  InterviewFields, ImagePlaceholderFields, SectionFields,
} from "./newsletter-section-types";

// ─── 상수 ───

const BANNER_BASE_URL = "https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners";

/** 배너키 → 파일명 매핑 (기존 BANNER_MAP과 동일) */
const BANNER_MAP: Record<string, string> = {
  "INSIGHT": "banner-insight",
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

// ─── 헬퍼 함수 ───

/**
 * Unlayer text row 보일러플레이트 생성.
 * @param id - row 고유 식별자 (row-{id}, col-{id}, content-{id} 접두사 자동 생성)
 * @param html - row 내 표시할 HTML 문자열
 * @param padding - containerPadding (기본: "16px 32px")
 */
function makeTextRow(id: string, html: string, padding = "16px 32px"): object {
  return {
    id: `row-${id}`,
    cells: [1],
    columns: [{
      id: `col-${id}`,
      contents: [{
        id: `content-${id}`,
        type: "text",
        values: {
          containerPadding: padding,
          anchor: "",
          textAlign: "left",
          lineHeight: "180%",
          linkStyle: { inherit: true, linkColor: "#F75D5D", linkHoverColor: "#E54949", linkUnderline: true, linkHoverUnderline: true },
          hideDesktop: false,
          displayCondition: null,
          _meta: { htmlID: `u_content_${id}`, htmlClassNames: "u_content_text" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: html,
        },
      }],
      values: {
        backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
        _meta: { htmlID: `u_column_${id}`, htmlClassNames: "u_column" },
      },
    }],
    values: {
      displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
      padding: "0px", anchor: "", hideDesktop: false,
      _meta: { htmlID: `u_row_${id}`, htmlClassNames: "u_row" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

/**
 * Unlayer image row 보일러플레이트 생성.
 * @param id - row 고유 식별자
 * @param src - 이미지 URL
 * @param alt - 대체 텍스트
 */
function makeImageRow(id: string, src: string, alt: string): object {
  return {
    id: `row-${id}`,
    cells: [1],
    columns: [{
      id: `col-${id}`,
      contents: [{
        id: `content-${id}`,
        type: "image",
        values: {
          containerPadding: "24px 24px 0px",
          anchor: "",
          src: { url: src, width: 600, height: 120 },
          textAlign: "center",
          altText: alt,
          action: { name: "web", values: { href: "", target: "_blank" } },
          hideDesktop: false,
          displayCondition: null,
          _meta: { htmlID: `u_content_${id}`, htmlClassNames: "u_content_image" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          fullWidth: false,
        },
      }],
      values: {
        backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
        _meta: { htmlID: `u_column_${id}`, htmlClassNames: "u_column" },
      },
    }],
    values: {
      displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
      padding: "0px", anchor: "", hideDesktop: false,
      _meta: { htmlID: `u_row_${id}`, htmlClassNames: "u_row" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

/**
 * 마크다운 볼드(`**text**`)를 빨간 <strong>으로 변환.
 * @param text - 변환할 텍스트
 */
function markdownBold(text: string): string {
  // [\s\S]+? — 줄바꿈 포함 매칭 (AI가 ** 안에 줄바꿈 넣는 경우 대응)
  return text.replace(/\*\*([\s\S]+?)\*\*/g, '<strong style="color:#F75D5D;">$1</strong>');
}

/** 줄바꿈을 <br>로 변환 (이메일 HTML에서 \n은 무시되므로 필수) */
function nlToBr(text: string): string {
  return text.replace(/\n/g, "<br>");
}

/**
 * HTML 특수문자 이스케이프.
 * @param str - 이스케이프할 문자열
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ─── 4) 배너 섹션 Row Factory 함수 (8종) ───

/**
 * 인사이트(INSIGHT) 섹션 rows 생성.
 * - row 1: 소제목(17px bold) + 본문 (markdownBold 적용)
 * - row 2 (optional): 팁박스 (fields.tip이 있을 때만)
 */
export function createInsightRows(fields: InsightFields): object[] {
  const subtitleHtml = `<div style="font-size:17px;font-weight:700;margin-bottom:8px">${markdownBold(escapeHtml(fields.subtitle))}</div>`;
  const bodyHtml = nlToBr(markdownBold(escapeHtml(fields.body)));
  const rows: object[] = [
    makeTextRow("insight-body", `${subtitleHtml}${bodyHtml}`, "12px 24px"),
  ];

  if (fields.tip) {
    const tipHtml = markdownBold(escapeHtml(fields.tip));
    rows.push(
      makeTextRow(
        "insight-tip",
        `<div style="background:#FFF5F5;border-left:3px solid #F75D5D;border-radius:0 6px 6px 0;padding:14px 18px;font-size:13.5px;line-height:1.6;color:#555">\n  ${tipHtml}\n</div>`,
        "12px 24px",
      ),
    );
  }

  return rows;
}

/**
 * 번호 카드(KEY POINT / 핵심 주제 / 핵심 변화) 섹션 rows 생성.
 * fields.items 배열을 순회하며 01, 02, 03 카드 생성.
 * 마지막 카드는 border-bottom 없음.
 */
export function createNumberedCardsRow(fields: NumberedCardsFields): object[] {
  const cards = fields.items.map((item, i) => {
    const num = String(i + 1).padStart(2, "0");
    const spacer = i < fields.items.length - 1
      ? `<tr><td style="height:8px;font-size:0;line-height:0;">&nbsp;</td></tr>`
      : "";
    return `<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5F5;border-left:3px solid #F75D5D;border-radius:0 8px 8px 0;">
    <tr>
      <td style="width:38px;padding:14px 0 14px 16px;vertical-align:top;">
        <div style="width:28px;height:28px;border-radius:50%;background:#F75D5D;color:#fff;font-size:13px;font-weight:700;text-align:center;line-height:28px;">${num}</div>
      </td>
      <td style="padding:14px 16px 14px 10px;vertical-align:top;">
        <div style="font-weight:700;font-size:15px;margin-bottom:2px;">${markdownBold(escapeHtml(item.title))}</div>
        <div style="font-size:13px;color:#666;line-height:1.5;">${nlToBr(markdownBold(escapeHtml(item.desc)))}</div>
      </td>
    </tr>
  </table>
</td></tr>${spacer}`;
  }).join("");

  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 0 8px;">${cards}</table>`;
  return [makeTextRow("numbered-cards", html, "4px 24px 0px")];
}

/**
 * 체크리스트(CHECKLIST) 섹션 rows 생성.
 * fields.items 배열 순회, 마지막 항목은 border-bottom 없음.
 */
export function createChecklistRow(fields: ChecklistFields): object[] {
  const cards = fields.items.map((item, i) => {
    const spacer = i < fields.items.length - 1
      ? `<tr><td style="height:6px;font-size:0;line-height:0;">&nbsp;</td></tr>`
      : "";
    return `<tr><td>
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF5F5;border-left:3px solid #F75D5D;border-radius:0 8px 8px 0;">
    <tr>
      <td style="width:38px;padding:10px 0 10px 16px;vertical-align:middle;">
        <div style="width:20px;height:20px;border-radius:50%;background:#F75D5D;text-align:center;line-height:20px;color:#fff;font-size:11px;font-weight:700;">&#10003;</div>
      </td>
      <td style="padding:10px 16px 10px 10px;vertical-align:middle;font-size:14px;">
        ${markdownBold(escapeHtml(item))}
      </td>
    </tr>
  </table>
</td></tr>${spacer}`;
  }).join("");

  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 0 8px;">${cards}</table>`;
  return [makeTextRow("checklist", html, "4px 24px 0px")];
}

/**
 * 불릿 리스트(이런 분들을 위해) 섹션 rows 생성.
 * markdownBold 적용하여 **키워드**를 빨간 볼드로 변환.
 */
export function createBulletListRow(fields: BulletListFields): object[] {
  const bulletRows = fields.items.map((item, i) => {
    const isLast = i === fields.items.length - 1;
    const borderBottom = isLast ? "" : "border-bottom:1px solid #f0f0f0;";
    return `<tr>
    <td style="padding:8px 0;${borderBottom}font-size:14px;line-height:1.6">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="width:20px;vertical-align:top;color:#F75D5D;font-weight:700">&bull;</td>
          <td>${markdownBold(escapeHtml(item))}</td>
        </tr>
      </table>
    </td>
  </tr>`;
  }).join("");

  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="padding:0 0 8px">${bulletRows}</table>`;
  return [makeTextRow("bullet-list", html, "4px 24px")];
}

/**
 * 일정 테이블(웨비나 일정) 섹션 rows 생성.
 * 핑크 헤더(bg:#FFF0F0) + fields.rows 순회, markdownBold 적용.
 */
export function createScheduleTableRow(fields: ScheduleTableFields): object[] {
  const SCHEDULE_EMOJIS: Record<string, string> = {
    "일시": "\u{1F4C5}",
    "형식": "\u{1F534}",
    "참가비": "\u{1F44D}",
    "참여": "\u{1F517}",
  };

  const tableRows = fields.rows.map((row) => {
    // 라벨에 이모지가 아직 없으면 자동 삽입
    const rawLabel = escapeHtml(row.label);
    const emojiPrefix = Object.entries(SCHEDULE_EMOJIS).find(([keyword]) => row.label.includes(keyword));
    const labelHtml = emojiPrefix && !row.label.match(/[\u{1F000}-\u{1FFFF}]/u)
      ? `${emojiPrefix[1]} ${markdownBold(rawLabel)}`
      : markdownBold(rawLabel);
    return `<tr>
    <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;font-weight:600;white-space:nowrap;width:80px">${labelHtml}</td>
    <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0">${markdownBold(escapeHtml(row.value))}</td>
  </tr>`;
  }).join("");

  const html = `<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0 16px">
  <tr>
    <th style="background:#FFF0F0;padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#666">항목</th>
    <th style="background:#FFF0F0;padding:8px 12px;text-align:left;font-size:13px;font-weight:600;color:#666">내용</th>
  </tr>
  ${tableRows}
</table>`;
  return [makeTextRow("schedule-table", html)];
}

/**
 * Before/After 테이블(성과) 섹션 rows 생성.
 * fields.tables 배열 (보통 2개: 자사몰매출 + 광고효율).
 * 다크 헤더(bg:#1a1a2e) + After 컬럼은 빨간 볼드.
 */
export function createBATablesRow(fields: BATablesFields): object[] {
  const tablesHtml = fields.tables.map((table) => {
    const dataRows = table.rows.map((row) => {
      return `<tr>
    <td style="padding:8px 12px;text-align:left;border-bottom:1px solid #eee;">${escapeHtml(row.metric)}</td>
    <td style="padding:8px 12px;text-align:left;border-bottom:1px solid #eee;">${escapeHtml(row.before)}</td>
    <td style="padding:8px 12px;text-align:left;border-bottom:1px solid #eee;color:#F75D5D;font-weight:700;">${markdownBold(escapeHtml(row.after))}</td>
  </tr>`;
    }).join("");

    return `<table cellpadding="0" cellspacing="0" style="margin-top:12px;background:#FFF5F5;border-left:3px solid #F75D5D;border-radius:0 4px 4px 0;">
  <tr><td style="padding:10px 16px;color:#F75D5D;font-weight:700;font-size:14px;">${escapeHtml(table.title)}</td></tr>
</table>
<table width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;margin:8px 0;">
  <tr>
    <th style="background:#FFF0F0;color:#333;padding:8px 12px;text-align:left;font-size:13px;font-weight:700;">지표</th>
    <th style="background:#FFF0F0;color:#333;padding:8px 12px;text-align:left;font-size:13px;font-weight:700;">Before</th>
    <th style="background:#FFF0F0;color:#333;padding:8px 12px;text-align:left;font-size:13px;font-weight:700;">After</th>
  </tr>
  ${dataRows}
</table>`;
  }).join("\n");

  return [makeTextRow("ba-tables", tablesHtml)];
}

/**
 * 인터뷰 인용(INTERVIEW) 섹션 rows 생성.
 * fields.quotes 배열 순회, markdownBold 적용.
 * 하나의 text row에 모든 인용문 포함.
 */
export function createInterviewQuotesRow(fields: InterviewFields): object[] {
  const quotesHtml = fields.quotes.map((quote) => {
    const textHtml = nlToBr(markdownBold(escapeHtml(quote.text)));
    return `<div style="border-left:3px solid #F75D5D;background:#f5f5f5;border-radius:0 8px 8px 0;padding:16px 20px;font-style:italic;font-size:14px;color:#555;line-height:1.6;margin-bottom:10px">
  "${textHtml}"
  <div style="font-style:normal;font-size:12px;color:#999;margin-top:6px">&mdash; ${escapeHtml(quote.source)}</div>
</div>`;
  }).join("\n");

  return [makeTextRow("interview-quotes", quotesHtml, "4px 24px")];
}

/**
 * 이미지 플레이스홀더(강의 미리보기) 섹션 rows 생성.
 * 재생 아이콘 + 캡션 + 태그.
 */
export function createImagePlaceholderRow(fields: ImagePlaceholderFields): object[] {
  let html = `<div style="background:#f9f6f2;border-radius:8px;padding:32px 20px;text-align:center">
  <div style="width:60px;height:60px;border-radius:50%;background:rgba(247,93,93,.15);display:inline-block;text-align:center;line-height:60px;font-size:28px;color:#F75D5D;margin:0 auto">&#9654;</div>
  <div style="color:#F75D5D;font-size:13px;font-weight:600;margin-top:10px">${markdownBold(escapeHtml(fields.caption))}</div>
  <div style="font-size:11px;color:#999;margin-top:2px">밑줄 친 이미지를 교체해주세요</div>
</div>`;

  if (fields.tags) {
    html += `\n<div style="text-align:center;padding:4px 0 12px;font-size:12px;color:#999">${escapeHtml(fields.tags)}</div>`;
  }

  return [makeTextRow("image-placeholder", html, "8px 24px")];
}

// ─── 5) 공통 Row 팩토리 ───

/**
 * 배너 이미지 row 생성. BANNER_MAP에서 매칭되는 파일명이 없으면 CSS gradient fallback.
 * @param bannerKey - 배너키 (예: "INSIGHT", "KEY POINT")
 */
export function createBannerRow(bannerKey: string): object {
  // partial match: 긴 키부터 매칭 (slug 생성용)
  const matchedKey = Object.keys(BANNER_MAP)
    .filter(k => bannerKey.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  const slug = matchedKey
    ? BANNER_MAP[matchedKey].replace("banner-", "")
    : bannerKey.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";

  // T1: CSS-only table 배너 (Gmail 호환, PNG 제거)
  return makeTextRow(
    `banner-${slug}`,
    `<table cellpadding="0" cellspacing="0" style="max-width:400px;" width="400"><tr><td style="background-color:#F75D5D;height:60px;padding:0 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:1px;line-height:60px;border-radius:4px 0 0 4px;">${escapeHtml(bannerKey)}</td></tr></table>`,
    "24px 24px 0px",
  );
}

/** 로고 이미지 row (자사몰사관학교 로고, 중앙 정렬, height:48px) */
export const ROW_LOGO: object = makeTextRow(
  "logo",
  '<p style="text-align:center;"><img src="https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/logo-email-v5-wide.png" alt="자사몰사관학교" style="display:block;margin:0 auto;height:48px;width:auto;" /></p>',
  "24px 24px 16px",
);

/**
 * 웨비나 전용 히어로 row (빨간 배경, 흰색 텍스트, pill badge).
 * @param title - 웨비나 제목
 * @param subtitle - 부제목
 */
/**
 * 웨비나 전용 hookLine을 히어로 밖에 배치하는 질문 row.
 * 중앙정렬, 18px bold, max-width:420px.
 * @param text - 훅 질문 텍스트
 */
export function createHookQuestionRow(text: string): object {
  return makeTextRow(
    "hook-question",
    `<table align="center" cellpadding="0" cellspacing="0" style="max-width:420px;" width="420"><tr><td style="text-align:center;font-size:18px;font-weight:700;color:#1a1a1a;line-height:160%;">${nlToBr(markdownBold(escapeHtml(text)))}</td></tr></table>`,
    "24px 32px 8px",
  );
}

export function createHeroRow(title: string, subtitle: string): object {
  const subtitleHtml = subtitle
    ? `\n<p style="color:rgba(255,255,255,0.8);font-size:14px;text-align:center;margin-top:4px;">${escapeHtml(subtitle)}</p>`
    : "";
  const heroHtml = `<p style="text-align:center;"><span style="background-color:rgba(255,255,255,0.2);padding:6px 14px;border-radius:20px;font-size:13px;font-weight:600;color:#ffffff;">LIVE 무료 웨비나</span></p>\n<p style="color:#ffffff;font-size:22px;font-weight:800;text-align:center;line-height:140%;margin-top:12px;">${escapeHtml(title)}</p>${subtitleHtml}`;

  return {
    id: "row-hero",
    cells: [1],
    columns: [{
      id: "col-hero",
      contents: [{
        id: "content-hero",
        type: "text",
        values: {
          containerPadding: "40px 32px",
          anchor: "",
          textAlign: "center",
          lineHeight: "150%",
          linkStyle: { inherit: true, linkColor: "#ffffff", linkHoverColor: "#ffffff", linkUnderline: false, linkHoverUnderline: false },
          hideDesktop: false,
          displayCondition: null,
          _meta: { htmlID: "u_content_text_hero", htmlClassNames: "u_content_text" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: heroHtml,
        },
      }],
      values: {
        backgroundColor: "#F75D5D", padding: "0px", border: {}, borderRadius: "0px",
        _meta: { htmlID: "u_column_hero", htmlClassNames: "u_column" },
      },
    }],
    values: {
      displayCondition: null, columns: false, backgroundColor: "", columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
      padding: "0px", anchor: "", hideDesktop: false,
      _meta: { htmlID: "u_row_hero", htmlClassNames: "u_row" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

/**
 * 제목 row (22px bold 중앙 정렬).
 * @param title - 제목 텍스트
 */
export function createTitleRow(title: string): object {
  return makeTextRow(
    "title",
    `<h1 style="font-size:20px;line-height:140%;text-align:center;margin:0;"><strong><span style="color:#1a1a1a;font-size:20px;">${escapeHtml(title)}</span></strong></h1>`,
    "24px 24px 8px",
  );
}

/**
 * 훅(인용구) row (빨간 italic 중앙, 14px).
 * @param text - 훅 텍스트
 */
export function createHookRow(text: string): object {
  return makeTextRow(
    "hook-quote",
    `<table align="center" cellpadding="0" cellspacing="0" style="max-width:420px;" width="420"><tr><td style="text-align:center;font-size:14px;line-height:160%;"><em><span style="color:#F75D5D;font-weight:600;">${markdownBold(escapeHtml(text))}</span></em></td></tr></table>`,
    "8px 24px 16px",
  );
}

/**
 * 도입 텍스트 row (15px, markdownBold 적용).
 * @param html - 도입 텍스트 (마크다운 볼드 포함 가능)
 */
export function createIntroRow(html: string): object {
  return makeTextRow(
    "intro",
    `<p style="font-size:15px;line-height:170%;margin:0;"><span style="color:#333;font-size:15px;">${markdownBold(escapeHtml(html))}</span></p>`,
    "8px 24px",
  );
}

/**
 * 성공사례 인사말 row ("안녕하세요 대표님").
 */
export function createGreetingRow(): object {
  return makeTextRow(
    "greeting",
    '<p style="font-size:15px;line-height:180%;"><span style="color:#333;font-size:15px;line-height:27px;">안녕하세요 <strong style="color:#F75D5D;">대표님</strong>,<br><strong style="color:#F75D5D;">자사몰사관학교</strong>의 스미스코치입니다.</span></p>',
    "24px 24px 8px",
  );
}

/**
 * 감정 후킹 row (15px, bold italic, 중앙 정렬).
 * @param text - 후킹 텍스트
 */
export function createEmotionHookRow(text: string): object {
  return makeTextRow(
    "emotion-hook",
    `<table align="center" cellpadding="0" cellspacing="0" style="max-width:420px;" width="420"><tr><td style="text-align:center;font-size:15px;line-height:180%;"><strong><em><span style="color:#333;font-size:15px;">${nlToBr(markdownBold(escapeHtml(text)))}</span></em></strong></td></tr></table>`,
    "8px 24px 16px",
  );
}

/**
 * 수강생 인용박스 row (회색 배경).
 * @param text - 인용 텍스트
 * @param source - 출처 (예: "수강생 A님")
 */
export function createStudentQuoteRow(text: string, source: string): object {
  return makeTextRow(
    "student-quote",
    `<div style="background:#f5f5f5;border-radius:6px;padding:16px 20px;font-style:italic;font-size:14px;color:#555;line-height:1.6">
  "${markdownBold(escapeHtml(text))}"
  <div style="font-style:normal;font-size:12px;color:#999;margin-top:6px">&mdash; ${escapeHtml(source)}</div>
</div>`,
    "16px 24px",
  );
}

/**
 * 마무리 row (중앙 정렬).
 * @param html - 마무리 HTML 텍스트 (markdownBold 적용)
 */
export function createClosingRow(html: string): object {
  return makeTextRow(
    "closing",
    `<p style="font-size:14px;line-height:180%;text-align:center;max-width:400px;margin:0 auto;"><span style="color:#64748b;">${nlToBr(markdownBold(escapeHtml(html)))}</span></p>`,
    "16px 24px",
  );
}

/** 구분선 row (1px #eee) */
export const ROW_DIVIDER: object = {
  id: "row-divider",
  cells: [1],
  columns: [{
    id: "col-divider",
    contents: [{
      id: "content-divider",
      type: "divider",
      values: {
        width: "100%",
        border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#eeeeee" },
        textAlign: "center",
        containerPadding: "8px 24px",
        anchor: "",
        hideDesktop: false,
        displayCondition: null,
        _meta: { htmlID: "u_content_divider", htmlClassNames: "u_content_divider" },
        selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
      },
    }],
    values: {
      backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
      _meta: { htmlID: "u_column_divider", htmlClassNames: "u_column" },
    },
  }],
  values: {
    displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
    backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
    padding: "0px", anchor: "", hideDesktop: false,
    _meta: { htmlID: "u_row_divider", htmlClassNames: "u_row" },
    selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
  },
};

/** 스미스 코치 프로필 카드 row (기존 SMITH_PROFILE_ROW 패턴 재현) */
export const ROW_PROFILE: object = {
  id: "row-profile",
  cells: [1],
  columns: [{
    id: "col-profile-coach",
    contents: [{
      id: "content-profile-coach",
      type: "text",
      values: {
        containerPadding: "0px 24px",
        anchor: "",
        textAlign: "left",
        lineHeight: "160%",
        linkStyle: { inherit: true, linkColor: "#0000ee", linkHoverColor: "#0000ee", linkUnderline: true, linkHoverUnderline: true },
        hideDesktop: false,
        displayCondition: null,
        _meta: { htmlID: "u_content_text_profile_coach", htmlClassNames: "u_content_text" },
        selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
        text: '<table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;"><tr><td style="padding:24px 0;border-top:1px solid #e2e8f0;border-bottom:1px solid #e2e8f0;"><table cellpadding="0" cellspacing="0"><tr><td width="80" style="vertical-align:top;"><img src="https://symvlrsmkjlztoopbnht.supabase.co/storage/v1/object/public/content-images/newsletter-banners/profile-smith.png" alt="스미스" style="width:60px;height:60px;border-radius:50%;display:block;" /></td><td style="vertical-align:top;"><p style="margin:0;font-weight:800;font-size:16px;color:#1a1a1a;">스미스 <span style="font-weight:600;font-size:13px;color:#F75D5D;">자사몰사관학교 코치</span></p><p style="margin:6px 0 0;font-size:13px;color:#64748b;line-height:160%;">메타파트너 / 메타공식 프로페셔널<br>스킨스쿨 / 재미어트 Co-founder<br>수강생 자사몰매출 450억+</p></td></tr></table></td></tr></table>',
      },
    }],
    values: {
      backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
      _meta: { htmlID: "u_column_profile_coach", htmlClassNames: "u_column" },
    },
  }],
  values: {
    displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
    backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
    padding: "0px", anchor: "", hideDesktop: false,
    _meta: { htmlID: "u_row_profile_coach", htmlClassNames: "u_row" },
    selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
  },
};

/**
 * CTA 버튼 row (빨간 풀너비 버튼).
 * @param text - 버튼 텍스트
 * @param url - 클릭 시 이동할 URL
 */
export function createCtaRow(text: string, url: string, bgColor = "#F75D5D"): object {
  return {
    id: "row-cta",
    cells: [1],
    columns: [{
      id: "col-cta",
      contents: [{
        id: "content-cta-button",
        type: "button",
        values: {
          containerPadding: "16px 24px 32px",
          anchor: "",
          href: { name: "web", values: { href: url, target: "_blank" } },
          buttonColors: {
            color: "#ffffff",
            backgroundColor: bgColor,
            hoverColor: "#ffffff",
            hoverBackgroundColor: bgColor === "#F75D5D" ? "#E54949" : bgColor,
          },
          size: { autoWidth: false, width: "100%" },
          textAlign: "center",
          lineHeight: "140%",
          padding: "14px",
          border: {},
          borderRadius: "8px",
          fullWidth: true,
          hideDesktop: false,
          displayCondition: null,
          _meta: { htmlID: "u_content_button_cta", htmlClassNames: "u_content_button" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: `<span style="font-size:16px;line-height:22.4px;"><strong>${escapeHtml(text)} &rarr;</strong></span>`,
          calculatedWidth: 552,
          calculatedHeight: 50,
        },
      }],
      values: {
        backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
        _meta: { htmlID: "u_column_cta", htmlClassNames: "u_column" },
      },
    }],
    values: {
      displayCondition: null, columns: false, backgroundColor: "#ffffff", columnsBackgroundColor: "",
      backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
      padding: "0px", anchor: "", hideDesktop: false,
      _meta: { htmlID: "u_row_cta", htmlClassNames: "u_row" },
      selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
    },
  };
}

/**
 * 하단 인사말 row (클로징 텍스트 + 자사몰사관학교 드림).
 */
export function createFarewellRow(): object {
  return makeTextRow(
    "farewell",
    '<p style="font-size:14px;line-height:180%;"><span style="color:#64748b;">더 깊은 실전 노하우가 궁금하시다면, 자사몰사관학교에서 직접 배워보세요.</span></p>\n<p style="font-size:14px;line-height:180%;margin-top:12px;"><span style="color:#1a1a1a;">감사합니다.</span><br><a href="https://bscamp.co.kr" style="color:#F75D5D;font-weight:600;text-decoration:none;">자사몰사관학교</a> <span style="color:#1a1a1a;">드림</span></p>',
    "16px 24px",
  );
}

/** 푸터 row (자사몰사관학교 정보 + 수신거부 링크) */
export const ROW_FOOTER: object = {
  id: "row-footer",
  cells: [1],
  columns: [{
    id: "col-footer",
    contents: [
      {
        id: "content-footer-divider",
        type: "divider",
        values: {
          width: "100%",
          border: { borderTopWidth: "1px", borderTopStyle: "solid", borderTopColor: "#eeeeee" },
          textAlign: "center",
          containerPadding: "0px 24px",
          anchor: "",
          hideDesktop: false,
          displayCondition: null,
          _meta: { htmlID: "u_content_divider_footer", htmlClassNames: "u_content_divider" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
        },
      },
      {
        id: "content-footer-text",
        type: "text",
        values: {
          containerPadding: "24px 24px 8px",
          anchor: "",
          textAlign: "center",
          lineHeight: "170%",
          linkStyle: { inherit: false, linkColor: "#999999", linkHoverColor: "#666666", linkUnderline: true, linkHoverUnderline: true },
          hideDesktop: false,
          displayCondition: null,
          _meta: { htmlID: "u_content_text_footer", htmlClassNames: "u_content_text" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: '<p style="font-size: 12px; line-height: 170%;"><span style="color: #a4a4a4; font-size: 12px; line-height: 20.4px;">자사몰 사관학교</span></p>\n<p style="font-size: 12px; line-height: 170%;"><span style="color: #999999; font-size: 12px; line-height: 20.4px;">본 메일은 자사몰사관학교에서 발송한 뉴스레터입니다.</span></p>\n<p style="font-size: 12px; line-height: 170%;"><span style="color: #999999; font-size: 12px; line-height: 20.4px;">수신을 원하지 않으시면 <a href="{{UNSUBSCRIBE_URL}}" target="_blank" style="color: #999999; text-decoration: underline;">수신거부</a>를 클릭해주세요.</span></p>',
        },
      },
      {
        id: "content-footer-copyright",
        type: "text",
        values: {
          containerPadding: "0px 24px 24px",
          anchor: "",
          textAlign: "center",
          lineHeight: "140%",
          linkStyle: { inherit: true, linkColor: "#0000ee", linkHoverColor: "#0000ee", linkUnderline: true, linkHoverUnderline: true },
          hideDesktop: false,
          displayCondition: null,
          _meta: { htmlID: "u_content_text_copyright", htmlClassNames: "u_content_text" },
          selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
          text: '<p style="font-size: 11px; line-height: 140%;"><span style="color: #aaaaaa; font-size: 11px; line-height: 15.4px;">&copy; 2026 자사몰사관학교. All rights reserved.</span></p>',
        },
      },
    ],
    values: {
      backgroundColor: "", padding: "0px", border: {}, borderRadius: "0px",
      _meta: { htmlID: "u_column_footer", htmlClassNames: "u_column" },
    },
  }],
  values: {
    displayCondition: null, columns: false, backgroundColor: "#f5f5f5", columnsBackgroundColor: "",
    backgroundImage: { url: "", fullWidth: true, repeat: "no-repeat", size: "custom", position: "center" },
    padding: "0px", anchor: "", hideDesktop: false,
    _meta: { htmlID: "u_row_footer", htmlClassNames: "u_row" },
    selectable: true, draggable: true, duplicatable: true, deletable: true, hideable: true,
  },
};

// ─── 6) 통합 팩토리 ───

/**
 * 배너키 + 파싱된 필드를 받아서 [배너이미지row, ...콘텐츠rows] 반환.
 * @param bannerKey - 배너키 (예: "INSIGHT", "KEY POINT")
 * @param sf - 파싱된 섹션 필드 (SectionFields 유니온)
 */
export function createSectionContentRows(bannerKey: string, sf: SectionFields): object[] {
  const rows: object[] = [createBannerRow(bannerKey)];

  switch (sf.type) {
    case "insight":
      rows.push(...createInsightRows(sf.fields));
      break;
    case "numbered-cards":
      rows.push(...createNumberedCardsRow(sf.fields));
      break;
    case "checklist":
      rows.push(...createChecklistRow(sf.fields));
      break;
    case "bullet-list":
      rows.push(...createBulletListRow(sf.fields));
      break;
    case "schedule-table":
      rows.push(...createScheduleTableRow(sf.fields));
      break;
    case "before-after-tables":
      rows.push(...createBATablesRow(sf.fields));
      break;
    case "interview-quotes":
      rows.push(...createInterviewQuotesRow(sf.fields));
      break;
    case "image-placeholder":
      rows.push(...createImagePlaceholderRow(sf.fields));
      break;
  }

  return rows;
}
