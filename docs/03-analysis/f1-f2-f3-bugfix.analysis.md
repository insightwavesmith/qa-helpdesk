# F1/F2/F3 Gap 분석 — 500에러 수정 + AI 답변 humanize + placeholder 이미지 제거

> 작성: 2026-03-04
> QA Engineer

## 전체 Match Rate: 100%

---

## F1. /questions/{id} 500 에러 수정 — Match Rate: 100%

### 일치 항목

- **sanitizeHtml import 제거 (questions/[id]/page.tsx)**: `sanitizeHtml` import가 완전히 제거됨. L12에 `import { mdToHtml } from "@/lib/markdown"` 만 존재. `@/lib/sanitize` import 없음. (설계서 3-3 일치)
- **sanitizeHtml 래핑 제거 (questions/[id]/page.tsx)**: L238에서 `dangerouslySetInnerHTML={{ __html: mdToHtml(answer.content) }}`로 변경됨. `sanitizeHtml()` 래핑 없음. (설계서 3-3 일치)
- **sanitizeHtml import 제거 (notices/[id]/page.tsx)**: `sanitizeHtml` import가 완전히 제거됨. L5에 `import { mdToHtml } from "@/lib/markdown"` 만 존재. (설계서 3-3 일치)
- **sanitizeHtml 래핑 제거 (notices/[id]/page.tsx)**: L28에서 `const bodyHtml = mdToHtml(notice.body_md || "")` 로 변경됨. `sanitizeHtml()` 래핑 없음. (설계서 3-3 일치)
- **post-body.tsx 클라이언트 sanitize 유지**: L4에 `import { sanitizeHtml } from "@/lib/sanitize"`, L154에서 `const html = sanitizeHtml(markdownToHtml(content))` 정상 유지. 클라이언트 컴포넌트(`"use client"`)에서 정상 동작. (설계서 3-4 일치)
- **sanitize.ts 파일 존재**: `src/lib/sanitize.ts` 파일이 삭제되지 않고 존재. post-body.tsx에서 참조 중. (설계서 3-4 일치)

### 불일치 항목

- 없음

### 수정 필요

- 없음

---

## F2. AI 답변 프롬프트 humanize — Match Rate: 100%

### 일치 항목

- **## 헤딩 금지 규칙**: L96 `## 헤딩 쓰지 마라. h2/h3 소제목 금지. 답변은 평문으로.` 존재. (설계서 3-2 일치)
- **굵기 강조만 허용 규칙**: L97 `**굵기 강조**만 허용. 핵심 키워드나 숫자에만 사용.` 존재. (설계서 3-2 일치)
- **불릿 리스트 3개 이내, 중첩 금지 규칙**: L98 `불릿 리스트는 3개 이내로 짧게. 불릿 안에 불릿(중첩) 금지.` 존재. (설계서 3-2 일치)
- **번호 리스트 규칙**: L99 `번호 리스트는 순서가 중요할 때만. 5개 이내.` 존재. (설계서 3-2 일치)
- **이모지/체크마크 명시 금지 규칙**: L100 `✅, ❌, 📌, 💡 같은 이모지 절대 금지. 체크마크도 금지.` 존재. (설계서 3-2 일치)
- **코드블록 금지 규칙**: L101 ``코드블록(```) 금지. 인라인 코드(``)는 기술 용어에만.`` 존재. (설계서 3-2 일치)
- **수평선 금지 규칙**: L102 `수평선(---) 금지.` 존재. (설계서 3-2 일치)
- **답변 길이 가이드**: L103 `답변 길이: 짧은 질문은 3-5문장, 긴 질문은 최대 15문장. 쓸데없이 늘리지 마라.` 존재. (설계서 3-2 일치)
- **기존 humanize 규칙 보존**: 말투 규칙(L86-93), 어미 다양화 규칙(L109-112), 문장 리듬(L114-117), AI 상투어 금지(L119-128), 경험담 톤(L130-133), 톤 레퍼런스(L141-146), 셀프 검수(L148-152), 숫자/범위 표기 규칙(L135-139) — 모두 그대로 유지. (설계서 3-4 일치)
- **마크다운 포맷팅 규칙 삽입 위치**: L92(`이모지 쓰지 마라.`) 뒤, L93(`핵심만 짧게.`) 뒤의 빈 줄 이후 L95-103에 `마크다운 포맷팅 규칙:` 블록 삽입됨. 설계서에서 지정한 "말투 규칙 섹션 뒤, 어미 다양화 규칙 앞" 위치와 일치. (설계서 3-2 일치)
- **CONSUMER_CONFIGS 변경 없음**: qa config — limit: 5, threshold: 0.4, tokenBudget: 3000, temperature: 0.3 등 모든 값 동일. 다른 consumer(newsletter, education, webinar, chatbot, promo)도 변경 없음. (설계서 3-4 일치)
- **RAG 로직 변경 없음**: `searchChunks`, `searchChunksByEmbedding`, `buildSearchResults`, `buildContext`, `generate` 함수 — 로직 변경 없음. (설계서 3-4 일치)

### 불일치 항목

- 없음

### 수정 필요

- 없음

---

## F3. placeholder 이미지 제거 — Match Rate: 100%

### 일치 항목

- **route.ts IMAGE_PLACEHOLDER 지시 → 이미지 금지 (본론 섹션)**: L108 `이미지 태그(![...](URL)) 삽입 금지. 텍스트만으로 작성.` — 기존 `![이미지 설명](IMAGE_PLACEHOLDER) 1개` 지시가 이미지 금지로 변경됨. (설계서 3-1 파일1 일치)
- **route.ts IMAGE_PLACEHOLDER 지시 → 이미지 금지 (작성 규칙 섹션)**: L134 `이미지 마크다운 태그 사용 금지. placehold.co, IMAGE_PLACEHOLDER URL 절대 금지.` — 기존 `각 h2 섹션마다 IMAGE_PLACEHOLDER 최소 1개 필수` 지시가 금지로 변경됨. (설계서 3-1 파일1 일치)
- **route.ts [이미지: 설명] 형식 금지**: L191 `이미지 관련 마크다운(![...](...), [이미지: ...]) 사용 금지. 이미지 없이 텍스트만 작성.` — 기존 `이미지 위치는 [이미지: 설명] 형식으로 표시`가 금지로 변경됨. (설계서 3-1 파일1 추가 수정 일치)
- **unsplash/search/route.ts — 4개 placehold.co 모두 null 반환**: UNSPLASH_ACCESS_KEY 없을 때(L15-17) `{ url: null }`, API 응답 실패(L30-32) `{ url: null }`, 검색 결과 0건(L38-41) `{ url: null }`, catch 블록(L50-53) `{ url: null }`. 4개 지점 모두 placehold.co URL 대신 null 반환. (설계서 3-1 파일2 일치)
- **post-body.tsx placehold.co 폴백 → figure.remove()**: L169-171 `img.closest("figure")?.remove()` (data.url이 없을 때), L173-175 `img.closest("figure")?.remove()` (catch 블록). placehold.co 폴백이 figure 제거로 변경됨. (설계서 3-1 파일3 일치)
- **post-body.tsx IMAGE_PLACEHOLDER → figure 변환 로직 유지**: L36-47 markdownToHtml 함수 내 IMAGE_PLACEHOLDER → `<figure class="post-image-figure">` 변환 로직 그대로 유지. 기존 글 호환성 보장. (설계서 3-2 일치)
- **thumbnailUrl 로직 변경 없음**: route.ts L311-335 커버 이미지 Unsplash 검색 로직 그대로 유지. placehold.co 폴백 없이 null 반환 방식도 기존과 동일. (설계서 3-2 일치)

### 불일치 항목

- 없음

### 수정 필요

- 없음

---

## 빌드 검증

- **tsc (`npx tsc --noEmit`)**: 통과 (에러 0건)
- **lint (`npm run lint`)**: 기존 에러만 (5 errors, 24 warnings — 모두 F1/F2/F3 무관 파일: `.claude/scripts/agent-sdk-run.js`의 require 에러 4건, `onboarding/page.tsx`의 setState 에러 1건)
- **npm run build**: 통과 (전체 빌드 성공, `/questions/[id]`, `/notices/[id]` 페이지 정상 빌드)
