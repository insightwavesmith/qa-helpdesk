/**
 * T0: 섹션 필드 스키마 정의
 * 배너키별 구조화된 필드 타입 — T1(row 템플릿), T2(파서), T3(빌더), T4(프롬프트)의 계약
 */

// ─── 필드 타입 ───

export interface InsightFields {
  subtitle: string;
  body: string;
  tip?: string;
}

export interface NumberedCardItem {
  title: string;
  desc: string;
}

export interface NumberedCardsFields {
  items: NumberedCardItem[];
}

export interface ChecklistFields {
  items: string[];
}

export interface BulletListFields {
  items: string[];
}

export interface ScheduleRow {
  label: string;
  value: string;
}

export interface ScheduleTableFields {
  rows: ScheduleRow[];
}

export interface BATableRow {
  metric: string;
  before: string;
  after: string;
}

export interface BATable {
  title: string;
  rows: BATableRow[];
}

export interface BATablesFields {
  tables: BATable[];
}

export interface InterviewQuote {
  text: string;
  source: string;
}

export interface InterviewFields {
  quotes: InterviewQuote[];
}

export interface ImagePlaceholderFields {
  caption: string;
  tags?: string;
}

// ─── 유니온 타입 ───

export type SectionFields =
  | { type: "insight"; fields: InsightFields }
  | { type: "numbered-cards"; fields: NumberedCardsFields }
  | { type: "checklist"; fields: ChecklistFields }
  | { type: "bullet-list"; fields: BulletListFields }
  | { type: "schedule-table"; fields: ScheduleTableFields }
  | { type: "before-after-tables"; fields: BATablesFields }
  | { type: "interview-quotes"; fields: InterviewFields }
  | { type: "image-placeholder"; fields: ImagePlaceholderFields };

// ─── 배너키 → 섹션 타입 매핑 ───

export const BANNER_KEY_TO_SECTION_TYPE: Record<string, SectionFields["type"]> = {
  "INSIGHT": "insight",
  "KEY POINT": "numbered-cards",
  "CHECKLIST": "checklist",
  "강의 미리보기": "image-placeholder",
  "핵심 주제": "numbered-cards",
  "이런 분들을 위해": "bullet-list",
  "웨비나 일정": "schedule-table",
  "INTERVIEW": "interview-quotes",
  "핵심 변화": "numbered-cards",
  "성과": "before-after-tables",
};

/** 배너키로부터 섹션 타입을 추론 (partial match 지원) */
export function getSectionType(bannerKey: string): SectionFields["type"] | null {
  // 정확히 일치하는 키 먼저
  if (BANNER_KEY_TO_SECTION_TYPE[bannerKey]) {
    return BANNER_KEY_TO_SECTION_TYPE[bannerKey];
  }
  // partial match (긴 키부터)
  const matchedKey = Object.keys(BANNER_KEY_TO_SECTION_TYPE)
    .filter(k => bannerKey.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return matchedKey ? BANNER_KEY_TO_SECTION_TYPE[matchedKey] : null;
}
