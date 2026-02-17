# TASK: 뉴스레터 AI 출력 구조화 — Structured JSON Output

## 목표
AI에게 배너키 선택권을 제거하고, 코드가 content_type별 고정 JSON 구조를 정의 → AI는 각 슬롯의 텍스트만 채움 → Zod 스키마로 검증 → 실패 시 자동 재시도 3회 → JSON→마크다운 변환 → 기존 row template 렌더링.

## 제약
- newsletter-row-templates.ts는 수정 최소화 (기존 렌더링 유지)
- parseSummaryToSections(), createSectionContentRows() 기존 인터페이스 유지
- email_summary DB 컬럼에는 변환된 마크다운 저장 (하위 호환)
- AI 1회 호출로 전체 JSON 생성 (섹션별 분리 호출 금지 — 비용)
- webinar/case_study 프롬프트에 education 용어(INSIGHT, KEY POINT, CHECKLIST) 절대 미포함

## 현재 코드

### src/actions/contents.ts — generateEmailSummary (L707-900)
```typescript
export async function generateEmailSummary(contentId: string) {
  // L731: bannerGuide = BANNER_KEYS_BY_TYPE[contentType]
  // L733-797: systemPrompts = { education: "...", webinar: "...", case_study: "..." }
  // L798: systemPromptOverride = systemPrompts[contentType]
  // L830-848: ksGenerate({ query: "...", consumerType: "newsletter", systemPromptOverride })
  // L857-880: validateBannerKeys → 실패 시 재시도 (MAX_RETRIES=3)
  // 문제: AI가 자유 마크다운 생성 → education 배너키 bias로 webinar/case_study 키 생성 실패
}
```

### src/lib/email-template-utils.ts — validateBannerKeys (L624-648)
```typescript
export function validateBannerKeys(summary: string, contentType: string) {
  const keyMatches = summary.match(/^### (.+)/gm) || [];
  const foundKeys = keyMatches.map(m => m.replace(/^### /, "").trim());
  const expectedByType = {
    education: ["INSIGHT", "KEY POINT", "CHECKLIST"],
    webinar: ["강의 미리보기", "핵심 주제", "이런 분들을 위해", "웨비나 일정"],
    case_study: ["성과", "INTERVIEW", "핵심 변화"],
  };
  // missing = expected에 있지만 found에 없는 키
  // forbidden = found에 있지만 BANNER_MAP에 없는 키
}
```

### src/lib/email-template-utils.ts — parseSummaryToSections (주요 로직)
```typescript
// ### 헤딩으로 split → { bannerKey: string, content: string }[] 반환
// createSectionContentRows가 이 배열을 받아 Unlayer row JSON 생성
```

## 태스크

### T1. Zod 스키마 정의 → frontend-dev
파일: `src/lib/newsletter-schemas.ts` (신규)

**Education 스키마:**
```typescript
const EducationOutputSchema = z.object({
  hook: z.string(), // 감정 후킹 한 줄
  intro: z.string(), // 도입부 2-3문장
  insight: z.object({
    subtitle: z.string(), // 질문형 소제목
    body: z.string(), // **강조키워드** 포함
    tipBox: z.string(), // 💡 실제 사례 수치
  }),
  keyPoint: z.object({
    items: z.array(z.object({ title: z.string(), desc: z.string() })).min(2).max(4),
  }),
  checklist: z.object({
    items: z.array(z.string()).min(3).max(7),
  }),
  closing: z.string(), // 마감 텍스트
});
```

**Webinar 스키마:**
```typescript
const WebinarOutputSchema = z.object({
  hook: z.string(),
  intro: z.string(),
  lecturePreview: z.object({ tags: z.array(z.string()).min(2) }),
  coreTopics: z.object({
    items: z.array(z.object({ title: z.string(), desc: z.string() })).min(2).max(4),
  }),
  targetAudience: z.object({
    items: z.array(z.string()).min(3).max(5),
  }),
  schedule: z.object({
    date: z.string(), format: z.string(), fee: z.string(), participation: z.string(),
  }),
  closing: z.string(),
});
```

**Case Study 스키마:**
```typescript
const CaseStudyOutputSchema = z.object({
  greeting: z.string().optional().default("안녕하세요 대표님, 자사몰사관학교입니다."),
  emotionHook: z.string(),
  background: z.string(),
  studentQuote: z.string(),
  performance: z.object({
    tables: z.array(z.object({
      title: z.string(),
      rows: z.array(z.object({ metric: z.string(), before: z.string(), after: z.string() })),
    })),
  }),
  interview: z.object({
    quotes: z.array(z.object({ text: z.string(), author: z.string() })).min(2).max(4),
  }),
  coreChanges: z.object({
    items: z.array(z.object({ title: z.string(), desc: z.string() })).min(2).max(4),
  }),
});
```

**export:** `getSchemaByType(contentType: string)` + `parseAIResponse(raw: string, contentType: string): SafeParseResult`

### T2. AI 프롬프트 재설계 → frontend-dev
파일: `src/actions/contents.ts` — generateEmailSummary 수정

1. BANNER_KEYS_BY_TYPE 마크다운 가이드 → JSON 스키마 설명 + few-shot 예시로 교체
2. systemPromptOverride에 JSON 출력 강제 + "응답 전체가 하나의 JSON 코드블록. JSON 앞뒤에 설명 텍스트 추가 금지."
3. 각 타입별 완전한 JSON few-shot 예시 1개씩 포함 (리뷰 HIGH 반영)
4. 프롬프트 구조:
```
시스템: 당신은 {type} 뉴스레터 JSON 생성기입니다.
응답은 반드시 ```json으로 시작하고 ```으로 끝나는 하나의 코드블록이어야 합니다.
JSON 앞뒤에 어떤 설명도 추가하지 마세요.
{타입별 JSON 스키마 설명}
예시: {완전한 JSON 예시}
유저: {body_md}
```
5. webinar 프롬프트에 INSIGHT/KEY POINT/CHECKLIST 단어 0회 등장
6. case_study 프롬프트에 INSIGHT/KEY POINT/CHECKLIST 단어 0회 등장

### T3. JSON 파서 + 재시도 로직 수정 → frontend-dev
파일: `src/actions/contents.ts` — generateEmailSummary 내부

1. AI 응답에서 JSON 코드블록 추출 — 정규식: `/```(?:json|JSON)?\s*\n?([\s\S]*?)```/` (대소문자 무시)
2. `parseAIResponse(raw, contentType)` 호출 → Zod 검증
3. 실패 시 Zod 에러 메시지를 재시도 프롬프트에 포함
4. 3회 실패 → 순서 기반 배너키 리매핑 폴백 (리뷰 HIGH 반영):
   - 기존 마크다운 파서로 섹션 추출
   - webinar: 순서대로 강의 미리보기/핵심 주제/이런 분들을 위해/웨비나 일정으로 키 강제 교체
   - case_study: 순서대로 성과/INTERVIEW/핵심 변화로 키 강제 교체
   - education: 순서대로 INSIGHT/KEY POINT/CHECKLIST로 키 강제 교체
5. 성공 시 → T4의 `convertJsonToEmailSummary()` 호출

### T4. JSON → 마크다운 변환 → frontend-dev
파일: `src/lib/newsletter-schemas.ts` — 신규 함수

```typescript
export function convertJsonToEmailSummary(data: any, contentType: string): string
```

변환 규칙 (기존 파서 정규식 호환 — 리뷰 HIGH 반영):

education 변환:
```
{hook}

{intro}

### INSIGHT
## {subtitle}
{body}
> 💡 {tipBox}

### KEY POINT
01. {items[0].title} | {items[0].desc}
02. {items[1].title} | {items[1].desc}
03. {items[2].title} | {items[2].desc}

### CHECKLIST
✅ {items[0]}
✅ {items[1]}
...

{closing}
```

webinar 변환:
```
{hook}

{intro}

### 강의 미리보기
{tags 쉼표 join} 슬라이드

### 핵심 주제
01. {items[0].title} | {items[0].desc}
02. {items[1].title} | {items[1].desc}
03. {items[2].title} | {items[2].desc}

### 이런 분들을 위해
- {items[0]}
- {items[1]}
...

### 웨비나 일정
| 항목 | 내용 |
| --- | --- |
| 📅 일시 | **{date}** |
| 🔴 형식 | {format} |
| 👍 참가비 | **{fee}** |
| 🔗 참여 | {participation} |

{closing}
```

case_study 변환:
```
{greeting}

{emotionHook}

{background}

> "{studentQuote}"

### 성과
#### {tables[0].title}
| 지표 | Before | After |
| --- | --- | --- |
| {rows[0].metric} | {rows[0].before} | **{rows[0].after}** |
...

### INTERVIEW
> "{quotes[0].text}"
> — {quotes[0].author}
...

### 핵심 변화
01. {items[0].title} | {items[0].desc}
...
```

파서 호환 핵심:
- `parseSummaryToSections()`: `md.split(/^### /m)` → hookLine + sections
- `parseInsight()`: `## ` 줄 = subtitle, `> 💡` = tipBox, 나머지 = body
- `parseNumberedCards()`: `/^(\d+)\.\s*(.+?)\s*\|\s*(.+)/` 패턴
- `parseChecklist()`: `/^[✅☑]\s*(.+)/` 패턴
- `parseInterview()`: `/^>\s*"(.+)"/ + /^>\s*—\s*(.+)/` 패턴
- `parseBulletListFields()`: `/^[-•]\s+(.+)/` 패턴
- `parseScheduleTable()`: `| key | value |` 테이블 파싱

검증: 변환 결과가 기존 `parseSummaryToSections()` + `validateBannerKeys()` 통과

### T5. 통합 빌드 + QA → frontend-dev
1. npm run build 성공
2. git push origin main
3. Vercel 배포 완료 후 3종 뉴스레터 재생성
4. DB에서 email_summary ### 헤딩 확인
5. Gmail 렌더링 vs email-samples-v7.html 비교
6. mozzi-reports 릴리즈 보고서 발행

## 검증
- [T1] `npm run build` 실행 → 타입 에러 0개
- [T1] newsletter-schemas.ts에서 `EducationOutputSchema.parse({...유효JSON...})` → 에러 없이 통과
- [T1] newsletter-schemas.ts에서 `WebinarOutputSchema.parse({...필드누락...})` → ZodError throw
- [T2] contents.ts grep "INSIGHT" → education systemPrompt에만 존재, webinar/case_study에 0회
- [T3] AI 응답이 잘못된 JSON일 때 → console.warn에 attempt 2/3 로그 출력 + Zod 에러 메시지 포함
- [T3] 3회 실패 → 기존 마크다운 폴백으로 email_summary 저장
- [T4] `convertJsonToEmailSummary(validEducationJson, "education")` → `validateBannerKeys(result, "education").valid === true`
- [T4] `convertJsonToEmailSummary(validWebinarJson, "webinar")` → `validateBannerKeys(result, "webinar").valid === true`
- [T4] `convertJsonToEmailSummary(validCaseStudyJson, "case_study")` → `validateBannerKeys(result, "case_study").valid === true`
- [T5] 3종 뉴스레터 재생성 → DB email_summary의 ### 헤딩이 각 타입 expectedKeys와 100% 일치
- [T5] `npm run build` 최종 성공

## 엣지 케이스
- 시나리오1: AI가 JSON 대신 마크다운 출력 — json 블록 추출 실패하면 재시도 프롬프트에 json으로 시작하라고 추가, 3회 실패시 순서 기반 키 리매핑 폴백
- 시나리오2: AI JSON에 필수 필드 누락 — Zod safeParse 실패하면 에러 메시지를 재시도 프롬프트에 포함
- 시나리오3: AI JSON에 예상 외 추가 필드 — Zod strict 사용하지 않고 strip으로 무시
- 시나리오4: body_md가 비어있거나 너무 짧음 — 기존 early return 로직 유지
- 시나리오5: ksGenerate 타임아웃 — 기존 catch 로직 유지

## 변경 파일
- `src/lib/newsletter-schemas.ts` (신규) — T1, T4
- `src/actions/contents.ts` (수정) — T2, T3

## 변경하지 않는 파일
- `src/lib/newsletter-row-templates.ts` (기존 row template 유지)
- `src/lib/email-template-utils.ts`의 parseSummaryToSections, createSectionContentRows (기존 렌더링)

## 레퍼런스
- 골드 스탠다드 목업: `newsletter-reference/email-samples-v7.html`
- 디자인 스펙: `newsletter-reference/newsletter-design-spec-v5.pdf`
- 이전 리뷰 보고서: `https://mozzi-reports.vercel.app/reports/review/2026-02-17-newsletter-unlayer-template-v2.html`

## 리뷰 결과

보고서 파일: mozzi-reports/public/reports/review/2026-02-17-newsletter-structured-json.html
URL: https://mozzi-reports.vercel.app/reports/review/2026-02-17-newsletter-structured-json.html

HIGH 3건 반영:
1. T2 few-shot: 각 타입별 완전한 JSON 예시 1개씩 프롬프트에 포함 → 반영 완료
2. T3 폴백 키 리매핑: 3회 실패 시 순서 기반 배너키 강제 매핑 → T3에 추가
3. T4 변환 포맷: 기존 파서 정규식과 일치하는 마크다운 포맷 → T4에 명시

MEDIUM 3건:
- T1 lecturePreview caption: 기본값 "강의 슬라이드 미리보기" 자동 생성
- T3 JSON 추출: 대소문자 무시 정규식 사용
- 타임아웃: maxDuration은 현행 60초 유지 (1회 호출 기준, 재시도는 별도 API 호출)

## 리뷰 보고서
보고서 파일: mozzi-reports/public/reports/review/2026-02-17-newsletter-structured-json.html
리뷰 결론: 아키텍처 방향 승인. HIGH 3건(few-shot 예시, 폴백 리매핑, 변환 포맷 명시) 반영 완료.

## 완료 조건
- [ ] npm run build 성공
- [ ] 3종 배너키 100% 정확 (DB 검증)
- [ ] Gmail 렌더링 95%+ 골드 스탠다드 유사도
- [ ] 자동 재시도 로직 동작 확인
- [ ] mozzi-reports 릴리즈 보고서 발행 + git push
