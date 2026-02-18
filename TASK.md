# TASK: 뉴스레터 목업 일치도 개선 (v8 → Gmail 렌더링)

## 목표
목업 v8과 Gmail 실제 렌더링의 유사도를 60% → 90%+로 개선.
핵심: 배너를 PNG→CSS-only로, row 여백 축소, 텍스트 폭 제어.

## 제약
- Gmail 호환: `linear-gradient`, `border-radius`, `max-width on div` 사용 금지. `<table>` 기반만.
- Unlayer JSON 구조 유지: type="text" row의 values 구조 변경 없음.
- 기존 로직(parseSummaryToSections, validateBannerKeys, structured JSON) 변경 없음.
- npm run build 통과 필수.

## 수정 대상 파일
- `src/lib/newsletter-row-templates.ts` — T1, T2, T3, T4, T5, T6
- `src/lib/email-template-utils.ts` — T1 (buildDesignFromSummary 배너 관련 확인)

## 현재 코드

### `src/lib/newsletter-row-templates.ts` — createBannerRow (L363-382)
```ts
export function createBannerRow(bannerKey: string): object {
  const matchedKey = Object.keys(BANNER_MAP)
    .filter(k => bannerKey.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  const bannerFile = matchedKey ? BANNER_MAP[matchedKey] : undefined;
  if (bannerFile) {
    const slug = bannerFile.replace("banner-", "");
    return makeImageRow(`banner-${slug}`, `${BANNER_BASE_URL}/${bannerFile}.png`, bannerKey);
  }
  // CSS gradient fallback
  const slug = bannerKey.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "unknown";
  return makeTextRow(`banner-${slug}`,
    `<div style="max-width:600px;height:80px;line-height:80px;background:linear-gradient(135deg,#F75D5D 0%,#E54949 60%,transparent 60%);border-radius:4px 0 0 4px;"><span style="padding-left:32px;color:#fff;font-size:18px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">${escapeHtml(bannerKey)}</span></div>`,
    "24px 24px 0px");
}
```

### `src/lib/newsletter-row-templates.ts` — makeTextRow (L41)
```ts
function makeTextRow(id: string, html: string, padding = "16px 32px"): object {
```

### `src/lib/newsletter-row-templates.ts` — createInterviewQuotesRow (L330)
```ts
return `<div style="border-left:3px solid #F75D5D;background:#f8f9fc;border-radius:0 8px 8px 0;padding:16px 20px;font-style:italic;font-size:14px;color:#555;line-height:1.6;margin-bottom:10px">
```

### `src/lib/newsletter-row-templates.ts` — hookLine row (L470)
```ts
`<p style="font-size:16px;line-height:160%;text-align:center;"><em><span style="color:#F75D5D;font-size:16px;font-weight:600;">${markdownBold(escapeHtml(text))}</span></em></p>`,
```

### `src/lib/newsletter-row-templates.ts` — createCtaRow (L614)
```ts
export function createCtaRow(text: string, url: string, bgColor = "#F75D5D"): object {
```

## 태스크

### T1. 배너 PNG → CSS-only 테이블 배너 전환 → frontend-dev (HIGH)
**파일**: `src/lib/newsletter-row-templates.ts` — `createBannerRow()`

**문제**: 현재 600x120px PNG 풀폭 배너. 목업은 max-width ~66%(400px), 좌정렬, 60px 높이.
**수정**: `makeImageRow` 호출 제거 → `makeTextRow`로 table 기반 CSS-only 배너 생성.

```html
<table cellpadding="0" cellspacing="0" style="width:66%;">
  <tr>
    <td style="background-color:#F75D5D;padding:16px 24px;color:#ffffff;font-size:16px;font-weight:700;letter-spacing:1px;">
      INSIGHT
    </td>
  </tr>
</table>
```

- BANNER_MAP은 slug 생성용으로 유지, PNG URL 참조 제거
- `makeImageRow` 대신 `makeTextRow`에 위 HTML 삽입
- containerPadding: `"16px 24px 0px"`
- 완료 기준:
  - [ ] 모든 13개 배너키가 CSS-only table 배너로 렌더됨
  - [ ] PNG `<img>` 태그 없음 (배너 한정)
  - [ ] Gmail에서 solid red 배경 + 흰 텍스트 정상 표시
  - [ ] 배너 폭이 전체의 약 66% (좌정렬)

### T2. row 간 여백 축소 → frontend-dev (MEDIUM)
**파일**: `src/lib/newsletter-row-templates.ts` — 각 함수의 `makeTextRow` 호출부

**문제**: 기본 padding `"16px 32px"`이 넉넉해서 목업 대비 늘어진 느낌.
**수정**: 콘텐츠 row들의 padding을 명시적으로 줄이기.

변경 목록:
- `createNumberedCardsRow()` 반환: padding `"4px 24px 0px"`
- `createChecklistCardsRow()` 반환: padding `"4px 24px 0px"`
- `createBulletListRow()` 반환: padding `"4px 24px"`
- `createInterviewQuotesRow()` 반환: padding `"4px 24px"`
- `createImagePlaceholderRow()` 반환: padding `"8px 24px"`
- 일반 본문 text row: `createSectionContentRows()` 내 subtitle/body makeTextRow 호출에 `"8px 24px"` 명시

- 완료 기준:
  - [ ] 카드/체크리스트/불릿/인용 row padding이 축소됨
  - [ ] 배너→본문 간격이 이전보다 타이트함
  - [ ] Unlayer 에디터에서 정상 렌더

### T3. 인용 블록 배경색 수정 → frontend-dev (LOW)
**파일**: `src/lib/newsletter-row-templates.ts` — `createInterviewQuotesRow()` (L330)

**수정**: `background:#f8f9fc` → `background:#f5f5f5`
- 완료 기준:
  - [ ] 인용 블록 배경이 `#f5f5f5`

### T4. hookLine/감정후킹 텍스트 폭 제어 → frontend-dev (MEDIUM)
**파일**: `src/lib/newsletter-row-templates.ts` — hookLine 생성부 (L470 부근)

**문제**: hookLine이 600px 풀폭으로 퍼짐. 목업은 max-width ~420px 중앙정렬.
**수정**: `<p>` 대신 `<table align="center" width="420">` 래핑.

```html
<table align="center" cellpadding="0" cellspacing="0" style="max-width:420px;" width="420">
  <tr><td style="text-align:center;font-size:16px;line-height:160%;">
    <em><span style="color:#F75D5D;font-weight:600;">텍스트</span></em>
  </td></tr>
</table>
```

- `createHookLineRow()` (교육/고객사례 hookLine italic)
- `createHookQuestionRow()` (웨비나 hookQuestion bold)
- `createEmotionHookRow()` 있다면 동일 적용

- 완료 기준:
  - [ ] hookLine 텍스트가 420px 중앙 정렬
  - [ ] Gmail에서 줄바꿈이 자연스러움

### T5. 본문 텍스트 좌우 패딩 통일 → frontend-dev (MEDIUM)
**파일**: `src/lib/newsletter-row-templates.ts` — 각 `makeTextRow` 호출부

**문제**: 기본 좌우 padding 32px. 목업은 24px.
**수정**: 본문 콘텐츠 row들의 padding 좌우를 24px로 통일.
- subtitle/body text row: `"12px 24px"`
- INSIGHT/핵심 주제 등 섹션 본문 row: `"12px 24px"`

- 완료 기준:
  - [ ] 본문 텍스트 좌우 여백이 24px로 통일

### T6. CTA 버튼 fullWidth + 스타일 확인 → frontend-dev (LOW)
**파일**: `src/lib/newsletter-row-templates.ts` — `createCtaRow()` (L614)

**확인/수정**:
- Unlayer button values에 `fullWidth: true` 확인 (없으면 추가)
- `borderRadius: "8px"` 확인
- `padding: "14px"` 확인
- 목업 기준: 풀폭, 라운드 8px, padding 14px

- 완료 기준:
  - [ ] CTA 버튼 fullWidth: true
  - [ ] borderRadius: "8px"

## 엣지 케이스
1. **배너키가 BANNER_MAP에 없는 경우**: CSS-only 배너의 fallback slug 생성이 정상 작동해야 함
2. **hookLine이 빈 문자열인 경우**: table 래핑이 빈 td를 만들지 않아야 함 (기존 null 체크 유지)
3. **매우 긴 배너 텍스트** (예: "웨비나 일정 안내"): 66% 폭에서 줄바꿈 없이 한 줄 표시 확인. 넘치면 font-size 14px로 축소 가능.
4. **Unlayer 에디터 호환**: CSS-only 배너가 Unlayer 에디터 프리뷰에서도 정상 보이는지 확인 (makeTextRow의 text HTML이 에디터에서 렌더됨)

## 레퍼런스
- 목업 v8: https://mozzi-reports.vercel.app/reports/task/2026-02-18-newsletter-mockup-v8.html
- 디자인 스펙 v7: https://mozzi-reports.vercel.app/reports/task/2026-02-18-newsletter-detail-fix.html
- 골드 스탠다드 목업: `newsletter-reference/email-samples-v7.html`

## 검증
- [ ] `npm run build` 성공
- [ ] Unlayer 에디터에서 교육/웨비나/고객사례 3종 뉴스레터 탭 정상 렌더
- [ ] Gmail 테스트 발송 → 목업 v8과 비교 유사도 90%+
- [ ] 배너가 CSS-only table로 렌더 (PNG img 태그 없음)
- [ ] 카드/체크리스트 row 간격이 이전보다 타이트

## 리뷰 보고서
보고서 파일: mozzi-reports/public/reports/review/2026-02-18-newsletter-mockup-alignment.html
에이전트팀 리뷰 예정 — 리뷰 완료 후 이 섹션에 피드백 기록.
