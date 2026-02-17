# TASK.md — 뉴스레터 골드 스탠다드 100% 재현

## 목표
골드 스탠다드 이메일 3종(Template A/B/C)과 100% 동일한 출력.
**두 문제 동시 해결**: (1) AI 프롬프트 → 톤/구조/문장 품질, (2) 렌더링 → 세부 디자인.
100% 완료될 때까지 수정. Custom Tool(registerTool) 필요하면 재작성.

## 제약
- Custom Tool이 필요하면 `unlayer.registerTool()` 사용
- `npm run build` 반드시 성공
- 마크다운(`**`, `##` 등)이 최종 HTML에 그대로 노출되면 실패
- email-samples-v7.html 목업과 시각적 일치 필수
- 기존 파일 구조(parseSectionFields → createSectionContentRows 파이프라인) 유지
- TEMPLATE_KEY_ORDER 순서 변경 금지 (이미 올바름)

## 태스크

### T1. AI 프롬프트 전면 재작성 → frontend-dev
**파일:** `src/actions/contents.ts` (BANNER_KEYS_BY_TYPE + generateEmailSummary 프롬프트)

**현재 문제:**
- systemPromptOverride가 너무 짧아 톤/구조 지정 부족
- 각 섹션의 **구체적 문장 스타일** 미지정 (후킹 문구, 코치 톤, 숫자 기반 설득)
- Template B에서 잘못된 배너키 생성

**수정 내용:**
systemPromptOverride를 template별로 분리하고, 골드 스탠다드의 톤/구조를 few-shot으로 포함:

**Template A (education) 프롬프트 규칙:**
```
- 후킹: 빨간색 감정 자극 인용문 1줄 (예: "전환 추적이 안 되면, 메타 AI는 눈을 감고 광고하는 거예요.")
- 본문 서두: 문제 제기 → 수치("광고비 100만 원을 쓰는데 전환이 3건밖에") → "~때문이에요" 코치 톤
- INSIGHT: 소제목(질문형 "왜 X가 필요한가요?") + 핵심 개념 설명 + **키워드** 빨간볼드 + > 💡 실제 사례(수치 "42% 증가")
- KEY POINT: 정확히 3개, "= 등호" 패턴 제목 ("Pixel 베이스 코드 = 모든 페이지에 설치") + 1-2줄 실전 설명
- CHECKLIST: 5개 질문형 ("~있나요?", "~하나요?")
- 마무리: 긴급성 수치("하나라도 빠졌다면, 지금 광고비의 30%가 허공에 사라지고 있는 거예요.")
- 톤: 해요체, 코치, 짧은 문장, 구체적 수치, 비유 사용
```

**Template B (webinar) 프롬프트 규칙:**
```
- 후킹: 고객 통점 질문 ("열심히 하는데 왜 성과가 안 나올까?")
- 본문: 2-3줄 공감 → **"정확하게"**가 핵심 → 누적 매출 수치로 권위
- 핵심 주제: 정확히 3개, 구체적 방법론 제목 + 실전 설명
- 이런 분들: 4개, "~하신 대표님", "~없는 분" 페르소나 형식
- 웨비나 일정: 일시(**빨간볼드**), 형식(온라인+분수), 참가비(**무료** 빨간볼드), 참여방법
- 마무리: "정원이 마감되기 전에 신청하세요" + "실전 인사이트를 가져가실 수 있어요"
```

**Template C (case_study) 프롬프트 규칙:**
```
- 인사말: "안녕하세요 대표님, 자사몰사관학교입니다."
- 성과 텍스트: Before→After 수치 강조 ("**월매출 1억 → 10억**", "**2천만 원 → 2억 원**으로 10배")
- 성과 테이블: 지표/Before/After (4-6행)
- INTERVIEW: 수강생 직접 인용 2-3개, 구체적 방법 + 감정
- 핵심 변화: 3개, 제목 + Before→After 비교
- 마무리: "현장에서 바로 적용할 수 있는" 실전 강조
```

**BANNER_KEYS_BY_TYPE 수정:**
- webinar에서 INSIGHT/KEY POINT/CHECKLIST 제거 → 강의 미리보기/핵심 주제/이런 분들을 위해/웨비나 일정만

**validateBannerKeys 수정:**
- webinar의 expected를 `["강의 미리보기", "핵심 주제", "이런 분들을 위해", "웨비나 일정"]`으로 변경

### T2. Row 템플릿 렌더링 개선 → frontend-dev
**파일:** `src/lib/newsletter-row-templates.ts`

**현재 문제 (createSectionContentRows):**
- KEY POINT 번호 배지가 사각형(border-radius:10px) → 원형(border-radius:50%) 필요
- CHECKLIST 체크 아이콘이 작음/네모 → 빨간 원형 배경 + 흰 체크마크 필요
- 💡 팁 박스(INSIGHT 내부)가 없음
- 이런 분들: 불릿 텍스트 색상이 일반(#374151) → 빨간 강조 필요
- 웨비나 일정: 이모지 칼럼이 없음 (📅 🔴 👍 🔗)
- INTERVIEW: 인용 스타일 미비
- 핵심 변화: Before/After 카드 레이아웃 미비
- 성과 테이블: After 열 빨간 강조 없음

**수정 상세:**

1. **KEY POINT / 핵심 주제 번호 배지:**
   - 현재: `border-radius:10px` (사각 라운드)
   - 수정: `width:36px; height:36px; border-radius:50%; background:#F75D5D; color:#fff; font-weight:700; text-align:center; line-height:36px; font-size:16px`

2. **INSIGHT 팁 박스:**
   - 기존 insight 섹션 row에 tip 필드가 있으면 노란 배경 박스 추가
   - `background:#FFFBEB; border-left:4px solid #F59E0B; padding:14px 18px; border-radius:0 8px 8px 0; margin-top:12px`
   - 💡 이모지 접두사

3. **CHECKLIST:**
   - 빨간 원형 배경(20x20) + 흰색 체크마크(✓)
   - 항목 간 `border-bottom:1px solid #f0f0f0` 구분선
   - 질문형 텍스트 (#374151)

4. **이런 분들을 위해:**
   - 빨간 불릿(6x6 원형 #F75D5D)
   - 텍스트에 `**키워드**` 있으면 빨간 볼드 변환

5. **웨비나 일정:**
   - 3열 테이블: 이모지(📅/🔴/👍/🔗) | 라벨(일시/형식/참가비/참여) | 값
   - 값에 `**텍스트**` 있으면 빨간 볼드 변환
   - 행 간 `border-bottom:1px solid #f0f0f0`

6. **성과 테이블:**
   - 헤더 행: `background:#FEF2F2`
   - After 열: `color:#F75D5D; font-weight:700`

7. **INTERVIEW 인용:**
   - `border-left:3px solid #F75D5D; padding:16px 20px; background:#f8f9fc; border-radius:0 8px 8px 0`
   - 인용 텍스트 이탤릭
   - 화자: `— 출처` 작은 회색 텍스트

8. **핵심 변화:**
   - 번호 배지 + 제목(볼드) + Before(회색)→After(빨간 볼드) 레이아웃

### T3. 마크다운→HTML 변환기 보강 → frontend-dev
**파일:** `src/lib/newsletter-row-templates.ts` 또는 유틸 함수

모든 섹션의 body/desc 텍스트에서:
- `**텍스트**` → `<b style="color:#F75D5D">텍스트</b>` 변환
- 마크다운이 그대로 노출되면 안 됨 (현재 일부 섹션에서 미변환)

### T4. Template B 배너키 매핑 수정 → frontend-dev
**파일:** `src/lib/email-template-utils.ts`

- `validateBannerKeys` webinar expected: `["강의 미리보기", "핵심 주제", "이런 분들을 위해", "웨비나 일정"]`
- TEMPLATE_KEY_ORDER webinar에서 "INSIGHT", "KEY POINT", "CHECKLIST" 제거 (이미 webinar 전용 키만 남기기)

### T5. Case Study CTA 색상 수정 → frontend-dev
**파일:** `src/lib/email-template-utils.ts` (createCtaRow 또는 buildDesignFromSummary)

- case_study의 CTA 버튼: `background:#22C55E` (초록), 텍스트 "성공사례 보러가기 →"
- education/webinar는 기존 `#F75D5D` (빨간) 유지

## 현재 코드

### src/lib/newsletter-section-types.ts (전체 107줄)
```ts
export interface InsightFields { subtitle: string; body: string; tip?: string; }
export interface NumberedCardsFields { items: NumberedCardItem[]; } // [{title, desc}]
export interface ChecklistFields { items: string[]; }
export interface BulletListFields { items: string[]; }
export interface ScheduleTableFields { rows: ScheduleRow[]; } // [{label, value}]
export interface BATablesFields { tables: BATable[]; } // [{title, rows:[{metric,before,after}]}]
export interface InterviewFields { quotes: InterviewQuote[]; } // [{text, source}]
export interface ImagePlaceholderFields { caption: string; tags?: string; }

export const BANNER_KEY_TO_SECTION_TYPE: Record<string, SectionFields["type"]> = {
  "INSIGHT": "insight", "KEY POINT": "numbered-cards", "CHECKLIST": "checklist",
  "강의 미리보기": "image-placeholder", "핵심 주제": "numbered-cards",
  "이런 분들을 위해": "bullet-list", "웨비나 일정": "schedule-table",
  "INTERVIEW": "interview-quotes", "핵심 변화": "numbered-cards", "성과": "before-after-tables",
};
```

### src/actions/contents.ts generateEmailSummary (L725-820)
```ts
export async function generateEmailSummary(contentId: string) {
  // 1. requireAdmin() → content.body_md, content.type 조회
  // 2. BANNER_KEYS_BY_TYPE[contentType] 포맷 가이드 가져오기
  // 3. ksGenerate({ query: 본문+작성규칙+bannerGuide, systemPromptOverride: ... })
  // 4. DB update: email_summary=result, email_design_json=null
  // 5. validateBannerKeys() → warnings 반환
}
```

### validateBannerKeys (L625-647)
```ts
// webinar expected가 잘못됨 (INSIGHT/KEY POINT/CHECKLIST 포함):
const expectedByType = {
  education: ["INSIGHT", "KEY POINT", "CHECKLIST"],
  webinar: ["웨비나 일정", "INSIGHT", "KEY POINT", "CHECKLIST", "이런 분들을 위해"], // ← 수정 필요
  case_study: ["성과", "INTERVIEW", "핵심 변화"],
};
```

### email-template-utils.ts 핵심 함수 체인
```ts
// 1. parseSummaryToSections(md) → {hookLine, sections[{key, content}]}
// 2. sortSectionsByTemplate(sections, type) → TEMPLATE_KEY_ORDER 순서 정렬
// 3. parseSectionFields(key, content) → SectionFields | null
// 4. createSectionContentRows(key, sf) → Unlayer row[] (row-templates에서 import)
// 5. fallback: createSectionRows(section) → 배너이미지 + markdownToEmailHtml
// 6. buildDesignFromSummary(content) → 로고→히어로→섹션→프로필→CTA→푸터

// markdownToEmailHtml: **bold** → <strong style="color:#F75D5D"> (구현됨)
// 문제: createSectionContentRows 경로에서는 markdownToEmailHtml 안 타는 섹션 있음 → T3
```

## 엣지 케이스

| # | 시나리오 | 입력 | 기대 결과 |
|---|---------|------|----------|
| E1 | AI가 배너키 잘못 생성 | webinar인데 "INSIGHT" 생성 | validateBannerKeys 경고, fallback 텍스트 블록 |
| E2 | INTERVIEW 섹션 AI 미생성 | case_study인데 INTERVIEW 누락 | 프롬프트 필수 지시로 해결, 배너키 존재 확인 |
| E3 | email_summary 빈 문자열 | body_md 짧거나 AI 실패 | hookLine="", sections=[], 로고+CTA만 표시 |
| E4 | 중첩 볼드 마크다운 | `**A**와 **B**가 중요` | 두 키워드 모두 빨간 볼드 변환 |
| E5 | 테이블 셀 특수문자 | `ROAS 1.8→3.1` (→ 포함) | 파서 정상, 렌더링 OK |

## 검증 기준

### Template A 체크리스트
- [ ] 제목 아래 빨간 후킹 인용문
- [ ] INSIGHT: 소제목 + 본문 + 노란 💡 팁 박스(사례+수치)
- [ ] KEY POINT: 빨간 원형 번호(01/02/03) + 볼드 제목 + 설명
- [ ] CHECKLIST: 빨간 원형 체크 아이콘 + 질문형 항목 + 구분선
- [ ] `**키워드**` → 빨간 볼드 렌더링 (마크다운 노출 X)
- [ ] 마무리 긴급성 수치 문구
- [ ] 프로필 카드 + CTA(빨간) + 푸터

### Template B 체크리스트
- [ ] 히어로 배너: "LIVE 무료 웨비나" 뱃지 + 제목 + 부제목
- [ ] 강의 미리보기: 플레이 버튼 이미지
- [ ] 핵심 주제: 빨간 원형 번호(01/02/03) + 제목 + 설명 (INSIGHT 배너 아님!)
- [ ] 이런 분들: 빨간 불릿 + 페르소나
- [ ] 웨비나 일정: 이모지 + 구조화 테이블 + 빨간 볼드(일시/참가비)
- [ ] CTA: "지금 신청하기 →" (빨간)

### Template C 체크리스트
- [ ] 히어로 배너 없이 "안녕하세요 대표님" 인사말
- [ ] 성과: Before/After 테이블 (After=빨간볼드)
- [ ] INTERVIEW: 인용 박스 스타일 (좌측 빨간 보더)
- [ ] 핵심 변화: 3개 Before→After (번호+제목+비교)
- [ ] CTA: 초록 "성공사례 보러가기 →" (#22C55E)

### 공통
- [ ] `npm run build` 성공
- [ ] 마크다운 그대로 노출 없음
- [ ] 모바일 뷰 깨지지 않음
- [ ] email-samples-v7.html 목업과 시각적 일치

## 레퍼런스
- `newsletter-reference/email-samples-v7.html` — 3종 목업 (필수)
- `newsletter-reference/newsletter-design-spec-v5.pdf` — 디자인 스펙
- `newsletter-reference/template-a-education.png` — Gmail 실제 렌더링 (교육)
- `newsletter-reference/template-b-webinar.png` — Gmail 실제 렌더링 (웨비나)
- `newsletter-reference/template-c-casestudy.pdf` — 고객사례 참고

## 완료 보고
- mozzi-reports에 릴리즈 보고서 HTML 작성 + git push
- 체크리스트 전항목 PASS 확인

## 리뷰 결과
Smith님 직접 QA 후 피드백: "기존의 템플릿처럼 쓰지 않았다. 문장구사, 정리 자체가 안되어 있다."
→ 골드 스탠다드 3종(Gmail 스크린샷)과 비교 → AI 프롬프트 + 렌더링 동시 수정 지시.
"100프로 완료될때까지 수정하고 커스텀 툴이 필요하면 재작하라고 해" — Smith님 승인 완료.

## 리뷰 보고서
Smith님 직접 검수로 리뷰 대체 (Gmail 실제 렌더링 확인 + 골드 스탠다드 3종 비교).
보고서 파일: mozzi-reports/public/reports/review/2026-02-17-newsletter-unlayer-template-v2.html (이전 라운드)
이전 릴리즈 보고서: mozzi-reports/public/reports/release/2026-02-17-newsletter-custom-tool.html
