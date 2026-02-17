# TASK: 뉴스레터 Unlayer Custom Tool + 자동 생성 파이프라인

## 목표

레이어0(knowledge base)에서 정보를 뽑아 3종 템플릿에 **형식에 맞게 자동 생성**.
Unlayer Custom Tool로 목업 100% 재현. AI 출력이 틀리면 자동 재시도(최대 3번).

## 핵심 원칙

1. **"템플릿 자체는 변경 없이 그대로 나와야 한다"** — 목업 = 결과물
2. **Custom Tool** — text+HTML 대신 Unlayer 네이티브 편집 가능 도구
3. **자동 재시도** — 파서 검증 실패 시 Opus 4.6 최대 3번 호출해서 자동 수정

## 레퍼런스 (반드시 참조)

1. **골드 스탠다드 목업**: `newsletter-reference/email-samples-v7.html`
2. **디자인 스펙 + 목업 PDF**: `newsletter-reference/newsletter-design-spec-v5.pdf`
3. **Gmail 레퍼런스 원본**: `newsletter-reference/template-a-education.png`, `template-b-webinar.png`, `template-c-casestudy.pdf`
4. **현재 코드**: `src/lib/email-template-utils.ts`, `src/actions/contents.ts`
5. **Unlayer Custom Tool 문서**: https://examples.unlayer.com/custom_tools/react-custom-tool/
6. **기존 아키텍처 TASK**: https://mozzi-reports.vercel.app/reports/task/2026-02-17-newsletter-pipeline-redesign.html

## 아키텍처

```
[레이어0: Knowledge Base]
        ↓ body_md
[AI 생성 (Opus 4.6)]
   프롬프트: 템플릿별 구조화된 JSON 형식 강제
   few-shot 예시 포함
        ↓ 구조화된 JSON (email_summary)
[파서 검증]
   필수 필드 체크 + 형식 검증
   FAIL → 에러 메시지 포함해서 AI 재호출 (최대 3번)
   3번 다 실패 → 텍스트 블록 fallback + 경고
        ↓ validated SectionData
[Custom Tool 매핑]
   templateType별 고정 Custom Tool 순서
   SectionData → Custom Tool values로 바인딩
        ↓ Unlayer Design JSON
[Unlayer 에디터]
   Custom Tool 드래그앤드롭 편집 가능
   각 필드 개별 수정 가능 (HTML 안 만져도 됨)
        ↓ exportHtml()
[이메일 발송]
```

### 데이터 흐름 (templateType별)

```
education:  body_md → AI → { hook, intro, insight:{subtitle,body,tip}, keypoint:[{title,desc}×3], checklist:[string×5], closing }
webinar:    body_md → AI → { hero_subtitle, intro, preview:{image,caption}, topics:[{title,desc}×3], targets:[string×4], schedule:[{label,value}×4], nudge }
case_study: body_md → AI → { greeting, title_keyword, emotion_hook, background, student_quote, results:{tables×2}, interview:[{quote,method}×2], changes:[{title,before,after}×3] }
```

## 현재 코드

### email-template-utils.ts (624줄)
주요 함수:
- `parseSummaryToSections(md)` → `{ hookLine, sections[] }` (L50)
- `sortSectionsByTemplate(sections, type)` → 배너키 순서 정렬 (L84)
- `createBannerImageRow(bannerKey, slug)` → 배너 이미지 row (L128)
- `createContentTextRow(section, slug)` → **단일 텍스트 블록** (L206) ← 교체 대상
- `createSectionRows(section)` → 배너+텍스트 2개 row (L241)
- `buildDesignFromSummary(content)` → 전체 빌드 (L507)
- `markdownToEmailHtml(md)` → 마크다운→HTML 변환 (L282)

### contents.ts — generateEmailSummary (L700)
```ts
// 현재: 자유 형식 마크다운으로 email_summary 생성
// AI에게 "### 배너키" 형식으로 쓰라고 하지만, 본문 구조는 자유형
const result = await ksGenerate({
  query: `다음 본문을 기반으로 뉴스레터 이메일 요약을 작성해주세요...`,
  systemPromptOverride: `당신은 자사몰사관학교의 뉴스레터 전문 작성자입니다...`,
});
// 배너키 검증 후 저장, email_design_json = null로 초기화
```

### BANNER_MAP (L6)
```ts
const BANNER_MAP: Record<string, string> = {
  "INSIGHT": "banner-insight", "KEY POINT": "banner-key-point",
  "CHECKLIST": "banner-checklist", "강의 미리보기": "banner-preview",
  "핵심 주제": "banner-topics", "이런 분들을 위해": "banner-target",
  "웨비나 일정": "banner-schedule", "INTERVIEW": "banner-interview",
  "핵심 변화": "banner-change", "성과": "banner-results",
};
```

## 태스크 (7건)

### T0. 섹션 필드 스키마 정의

→ backend-dev · 의존: 없음

파일: `src/lib/newsletter-section-types.ts` (신규)

- 템플릿별 구조화된 데이터 타입 정의 (AI 출력 = 이 형식)
```ts
// education
interface InsightSection { subtitle: string; body: string; tip?: string; }
interface KeyPointSection { items: { title: string; desc: string }[]; }  // 3개
interface ChecklistSection { items: string[]; }  // 5개

// webinar
interface PreviewSection { image_url?: string; caption: string; tags: string; }
interface TopicsSection { items: { title: string; desc: string }[]; }  // 3개
interface TargetsSection { items: string[]; }  // 4개
interface ScheduleSection { rows: { emoji: string; label: string; value: string }[]; }  // 4개

// case_study
interface ResultsSection { tables: { title: string; rows: { metric: string; before: string; after: string }[] }[]; }  // 2 테이블
interface InterviewSection { quotes: { text: string; method_keyword: string }[]; }  // 2개
interface ChangesSection { items: { title: string; before: string; after: string }[]; }  // 3개

// 공통 wrapper
interface NewsletterData {
  templateType: 'education' | 'webinar' | 'case_study';
  sections: Record<string, SectionData>;
}
```
- 각 타입에 Zod 스키마 추가 (런타임 검증용)

### T1. Unlayer Custom Tool 8종 구현

→ frontend-dev · 의존: T0

파일: `src/lib/newsletter-custom-tools.ts` (신규), `public/newsletter-tools.js` (번들)

8종 Custom Tool 등록:
1. **insight-section**: 소제목(input) + 본문(textarea, `**볼드**`→빨간볼드) + 팁박스(textarea)
2. **numbered-cards**: 카드 3개 (각: 제목 input + 설명 textarea). 빨간 원형 번호배지 01/02/03
3. **checklist-section**: 체크아이템 5개 (각: input). ✅ 빨간체크 + 구분선
4. **bullet-list**: 불릿 4개 (각: textarea, `**키워드**`→빨간볼드). 빨간 dot
5. **schedule-table**: 행 4개 (각: 이모지 input + 라벨 input + 값 input). 핑크헤더
6. **ba-tables**: 테이블 2개 (각: 제목 + 행 3개 {지표,before,after}). After=빨간볼드
7. **interview-quotes**: 인용 2개 (각: 인용문 textarea + 방법론키워드 input). 회색배경
8. **image-placeholder**: 이미지 URL input + 캡션 input + 재생버튼 오버레이

각 Tool 구현:
- `renderer.Viewer`: React 컴포넌트 (email-samples-v7.html 디자인 100% 재현)
- `renderer.exporters.email`: `ReactDOMServer.renderToStaticMarkup()` (inline style, table 기반)
- `options`: 각 필드를 Unlayer 속성 에디터에서 편집 가능하게 등록
- `values`: 기본값 (placeholder 텍스트)

번들: Webpack → `public/newsletter-tools.js` → EmailEditor `customJS` 옵션으로 로드

### T2. parseSummaryToSections → JSON 파서로 교체

→ backend-dev · 의존: T0

파일: `src/lib/email-template-utils.ts`

- 기존 `parseSummaryToSections` (마크다운 파싱) → 구조화된 JSON 파싱으로 교체
- AI가 JSON으로 출력 → `JSON.parse` + Zod 스키마 검증
- 검증 실패 시 구체적 에러 메시지 반환 (어느 필드가 틀렸는지)
- **관대한 파싱 fallback**: JSON 파싱 실패 시 기존 마크다운 파싱으로 fallback
- 마크다운 파싱도 실패 시 전체를 단일 텍스트 블록으로

### T3. AI 프롬프트 개선 + 자동 재시도

→ backend-dev · 의존: T0, T2

파일: `src/actions/contents.ts`, `src/lib/newsletter-prompts.ts` (신규)

- 프롬프트를 별도 파일로 분리 (`newsletter-prompts.ts`)
- **템플릿별 프롬프트 + few-shot 예시** (정확한 JSON 형식):
```
당신은 자사몰사관학교의 뉴스레터 작성자입니다.
반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이 JSON만.

[education 예시]
{
  "hook": "디지털 마케팅의 핵심, 데이터를 읽는 눈을 키워보세요",
  "intro": "오늘은 Pixel과 CAPI에 대해...",
  "insight": {
    "subtitle": "Pixel + CAPI, 왜 둘 다 필요한가요?",
    "body": "Pixel만으로는 **전환 데이터의 40~60%**가 누락됩니다...",
    "tip": "실제로 CAPI를 도입한 자사몰사관학교 6기 수강생은 전환 추적 정확도를 92%까지 끌어올렸어요."
  },
  "keypoint": [
    {"title": "Pixel + CAPI 동시 설치", "desc": "서버 + 브라우저 양쪽에서..."},
    ...
  ],
  ...
}
```
- **자동 재시도 로직 (최대 3번)**:
```ts
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = await ksGenerate({ ... });
  const parsed = parseAndValidate(result.content, contentType);
  if (parsed.success) return parsed.data;
  // 실패 시: 에러 메시지를 포함해서 재호출
  retryPrompt = `이전 응답이 형식 오류입니다: ${parsed.errors.join(', ')}. 다시 작성해주세요.`;
}
// 3번 다 실패 → fallback (텍스트 블록) + 경고
```

### T4. buildDesignFromSummary → Custom Tool 기반 재구현

→ backend-dev · 의존: T0, T1, T2

파일: `src/lib/email-template-utils.ts`

- 파싱된 JSON → 템플릿별 Custom Tool row 순서로 Unlayer Design JSON 생성
- 각 Custom Tool의 values에 파싱된 데이터 바인딩
- 최종 구조:
```
education:  logo → title → hook → intro → banner-insight + insight-section → banner-keypoint + numbered-cards → banner-checklist + checklist-section → closing → profile → cta → footer
webinar:    logo → hero → intro → banner-preview + image-placeholder → banner-topics + numbered-cards → banner-targets + bullet-list → banner-schedule + schedule-table → nudge → profile → cta → footer
case_study: logo → greeting → title → emotion-hook → background → student-quote → banner-results + ba-tables → banner-interview + interview-quotes → banner-changes + numbered-cards → cta → footer
```
- 기존 email_design_json 있는 콘텐츠 → 그대로 로드 (하위 호환)

### T5. 공통 row + EmailEditor 설정

→ frontend-dev · 의존: T1

파일: `src/components/content/newsletter-edit-panel.tsx`, `src/lib/newsletter-row-templates.ts` (신규)

- 공통 row JSON 정의 (logo, hero, title, hook, profile, cta, footer 등 13종)
- EmailEditor에 `customJS` 옵션 추가 (Custom Tool 로드)
- 에디터 설정: Custom Tool이 도구 패널에 표시되도록 등록
- 탬플릿별 도구 필터링: education은 insight/keypoint/checklist만, webinar는 preview/topics/targets/schedule만 등

### T6. 에러 핸들링 UI + 재시도 표시

→ frontend-dev · 의존: T3, T4

파일: `src/components/content/newsletter-edit-panel.tsx`

- email_summary NULL → "AI 뉴스레터를 먼저 생성해주세요"
- 재시도 진행 표시: "AI 형식 검증 중... (시도 2/3)"
- 3번 실패 fallback → "형식 자동 수정 실패. 텍스트 블록으로 표시됩니다." 경고
- "뉴스레터 재생성" → design_json 초기화 확인 다이얼로그
- 배너키 검증 경고 → 에디터 상단 경고 배너

### T7. Webpack 번들 + 배포 설정

→ frontend-dev · 의존: T1

파일: `webpack.newsletter-tools.config.js` (신규), `package.json`

- Custom Tool 코드 번들 설정 (Webpack)
- `unlayer.React` 외부 참조 (번들 크기 최소화)
- `npm run build:newsletter-tools` 스크립트 추가
- `public/newsletter-tools.js` 출력
- Next.js 빌드와 통합 (빌드 시 자동 번들)

## 엣지 케이스

| 상황 | 기대 동작 |
|------|-----------|
| AI가 JSON 대신 마크다운 출력 | 마크다운 파서 fallback → 텍스트 블록 |
| AI가 필수 필드 누락 (예: keypoint 2개만) | Zod 검증 실패 → 재시도. 3번 실패 → fallback |
| AI가 금지 배너키 생성 | validateBannerKeys 경고 + 해당 섹션 스킵 |
| email_summary NULL | "AI 뉴스레터를 먼저 생성해주세요" + 에디터 비활성 |
| 기존 email_design_json 있음 | 그대로 로드 (하위 호환) |
| AI 재생성 후 | email_design_json = null → 새 빌드 |
| Custom Tool JS 로드 실패 | 기존 text 블록 fallback + 콘솔 경고 |
| 같은 배너키 중복 | 첫 번째만 사용, 나머지 무시 |
| 빈 필드 값 | placeholder 기본값 표시 |

## 제약

- **레이아웃 = email-samples-v7.html 100%**: Custom Tool viewer/exporter가 이 디자인 그대로
- 기존 email_design_json 하위 호환 필수
- BANNER_MAP 키 매핑 유지, 배너 이미지 URL 동일
- Custom Tool은 `unlayer.React` 재사용 (별도 React 번들 X)
- markdownToEmailHtml() 유지 (fallback용)

## 검증

- [ ] npm run build 성공
- [ ] npm run build:newsletter-tools 성공 (Custom Tool 번들)
- [ ] education → INSIGHT(소제목+본문+팁박스) + KEY POINT(카드3) + CHECKLIST(✅5) 목업과 동일
- [ ] webinar → 히어로 + 강의미리보기 + 핵심주제(카드3) + 이런분들(불릿4) + 일정(테이블4행) 목업과 동일
- [ ] case_study → 인사말 + 감정후킹 + 성과(B/A 테이블2) + INTERVIEW(인용2) + 핵심변화(카드3) + CTA 목업과 동일
- [ ] Unlayer 에디터에서 Custom Tool 필드 개별 편집 가능 (HTML 안 만져도 됨)
- [ ] AI 형식 오류 시 자동 재시도 3번 동작 확인
- [ ] 3번 실패 → 텍스트 블록 fallback + 경고 UI 표시
- [ ] 기존 email_design_json 있는 콘텐츠 정상 로드
- [ ] 테스트 발송 → Gmail에서 email-samples-v7.html과 동일 렌더링
- [ ] 완료 보고서 HTML 작성 → `~/projects/mozzi-reports/public/reports/release/`에 저장
- [ ] `node scripts/build-index.js` → `git add -A && git commit && git push origin main` (Vercel 자동배포)

## 리뷰 보고서

보고서 파일: mozzi-reports/public/reports/review/2026-02-17-newsletter-unlayer-template-v2.html
리뷰 일시: 2026-02-17 17:15

- HIGH 리스크 2건: T1(Unlayer Custom Tool 8종), T4(buildDesign 재구현)
- MEDIUM 리스크 3건: T2(파서), T3(AI프롬프트+재시도), T5(에디터설정)
- 핵심 결정: text+HTML 대신 Custom Tool 방향으로 전환 (Smith님 결정)
- 자동 재시도 3번 추가 (Smith님 결정)
- 프롬프트 JSON 형식 강제 + few-shot 예시 필수
