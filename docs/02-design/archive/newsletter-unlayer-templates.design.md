# 뉴스레터 섹션별 고정 Unlayer 템플릿 — Design

**작성일**: 2026-02-17

## 1. 데이터 모델

### 섹션 필드 스키마 (`newsletter-section-types.ts`)
| 배너키 | 타입 | 필드 |
|--------|------|------|
| INSIGHT | insight | subtitle, body, tip? |
| KEY POINT / 핵심 주제 / 핵심 변화 | numbered-cards | items[{title, desc}] |
| CHECKLIST | checklist | items[string] |
| 이런 분들을 위해 | bullet-list | items[string] |
| 웨비나 일정 | schedule-table | rows[{label, value}] |
| 성과 | before-after-tables | tables[{title, rows[{metric,before,after}]}] |
| INTERVIEW | interview-quotes | quotes[{text, source}] |
| 강의 미리보기 | image-placeholder | caption, tags? |

## 2. Row 템플릿 구조 (`newsletter-row-templates.ts`)
- `makeTextRow(id, html, padding)` — Unlayer boilerplate 헬퍼
- 배너키별 factory: `createInsightRows(fields)`, `createNumberedCardsRow(fields)` 등
- 공통 row: logo, hero, title, hook, intro, greeting, closing, profile, cta, farewell, footer

## 3. 파서 개선 (`email-template-utils.ts`)
- `parseSectionFields(key, content)` → SectionFields 반환
- 패턴: ## subtitle, > 💡 tip, 01. title | desc, ✅ item, - bullet, | table |, > "quote"

## 4. 빌더 (`buildDesignFromSummary`)
- parseSummaryToSections → parseSectionFields → createXxxRow → 조립
- header rows → 동적 section rows → footer rows

## 5. 구현 순서
1. T0: newsletter-section-types.ts (신규)
2. T1+T5: newsletter-row-templates.ts (신규)
3. T2: parseSummaryToSections + parseSectionFields (수정)
4. T3: buildDesignFromSummary 재구현 (수정)
5. T4: contents.ts AI 프롬프트 (수정)
6. T6: newsletter-edit-panel.tsx 에러 핸들링 (수정)
