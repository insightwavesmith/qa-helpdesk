# F1. /questions/{id} 500 에러 수정 — 설계서

> 작성: 2026-03-04
> 참조: TASK.md F1, 커밋 a20bf82

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음)

## 3. 컴포넌트 구조

### 3-1. 문제 원인 분석

**에러 체인:**
```
questions/[id]/page.tsx (서버 컴포넌트)
  → sanitizeHtml(mdToHtml(answer.content))
    → import DOMPurify from "isomorphic-dompurify"
      → 서버(Node.js)에서 browser 빌드 선택
        → DOMPurify.sanitize is not a function
          → 500 에러
```

**영향 파일:**
| 파일 | 유형 | sanitizeHtml 사용 | 에러 발생 |
|------|------|-------------------|-----------|
| `questions/[id]/page.tsx` | 서버 컴포넌트 | ✅ L239 | ✅ 500 에러 |
| `notices/[id]/page.tsx` | 서버 컴포넌트 | ✅ L29 | ✅ 500 에러 |
| `posts/post-body.tsx` | 클라이언트 (`"use client"`) | ✅ L154 | ❌ 정상 |

**핵심**: `isomorphic-dompurify`는 클라이언트에서만 정상 동작. 서버 컴포넌트에서는 `jsdom` 없이 사용 불가.

### 3-2. 수정 방안: 서버 컴포넌트에서 sanitizeHtml 제거

`mdToHtml()` (`src/lib/markdown.ts`)이 이미 모든 텍스트에 `escapeHtml()`을 적용:
- `&` → `&amp;`
- `<` → `&lt;`
- `>` → `&gt;`
- `"` → `&quot;`

따라서 서버 컴포넌트에서 DOMPurify로 이중 sanitize할 필요 없음.

### 3-3. 파일별 변경 상세

#### `src/app/(main)/questions/[id]/page.tsx`

**Before (L13, L239):**
```tsx
import { sanitizeHtml } from "@/lib/sanitize";
// ...
dangerouslySetInnerHTML={{ __html: sanitizeHtml(mdToHtml(answer.content)) }}
```

**After:**
```tsx
// sanitizeHtml import 제거
// ...
dangerouslySetInnerHTML={{ __html: mdToHtml(answer.content) }}
```

#### `src/app/(main)/notices/[id]/page.tsx`

**Before (L6, L29):**
```tsx
import { sanitizeHtml } from "@/lib/sanitize";
// ...
const bodyHtml = sanitizeHtml(mdToHtml(notice.body_md || ""));
```

**After:**
```tsx
// sanitizeHtml import 제거
// ...
const bodyHtml = mdToHtml(notice.body_md || "");
```

### 3-4. 변경하지 않는 파일

| 파일 | 이유 |
|------|------|
| `src/lib/sanitize.ts` | `post-body.tsx`에서 사용 중. 삭제 금지. |
| `src/components/posts/post-body.tsx` | 클라이언트 컴포넌트. 정상 동작 중. |
| `src/lib/markdown.ts` | 변경 불필요. escapeHtml 이미 적용됨. |
| `next.config.ts` | 대안 B 미채택. serverExternalPackages 추가 안 함. |

## 4. 에러 처리

| 시나리오 | 대응 |
|----------|------|
| answer.content가 null | mdToHtml에 빈 문자열 전달 (기존 로직 유지) |
| 악성 HTML 주입 | mdToHtml 내부 escapeHtml이 이스케이프 처리 |
| notice.body_md가 null | `notice.body_md \|\| ""` 폴백 (기존 로직 유지) |

### 보안 고려사항
- `mdToHtml()`은 사용자 입력을 `escapeHtml()`로 변환 후 마크다운 문법만 HTML 태그로 치환
- 허용되는 태그: `<h1>~<h3>`, `<p>`, `<ul>`, `<ol>`, `<li>`, `<strong>`, `<em>`, `<code>`
- `<script>`, `<iframe>` 등 위험 태그는 escapeHtml에 의해 무력화됨
- DB에 저장된 content는 마크다운 원본이므로 HTML injection 위험 낮음

## 5. 구현 순서

- [ ] `src/app/(main)/questions/[id]/page.tsx` — `sanitizeHtml` import 제거, L239 `sanitizeHtml()` 래핑 제거
- [ ] `src/app/(main)/notices/[id]/page.tsx` — `sanitizeHtml` import 제거, L29 `sanitizeHtml()` 래핑 제거
- [ ] `npm run build` 성공 확인
- [ ] 브라우저 QA: `/questions/{id}` 3개 질문 정상 렌더링 확인
- [ ] 브라우저 QA: `/notices/{id}` 정상 렌더링 확인
- [ ] 답변 마크다운 렌더링 정상 확인 (볼드, 리스트 등)

## 6. 변경 요약

| 항목 | Before | After |
|------|--------|-------|
| `questions/[id]/page.tsx` | `sanitizeHtml(mdToHtml(...))` | `mdToHtml(...)` |
| `notices/[id]/page.tsx` | `sanitizeHtml(mdToHtml(...))` | `mdToHtml(...)` |
| `sanitize.ts` | 유지 | 유지 (post-body.tsx용) |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/app/(main)/questions/[id]/page.tsx` | import 제거 + 함수 호출 제거 | 낮음 |
| `src/app/(main)/notices/[id]/page.tsx` | import 제거 + 함수 호출 제거 | 낮음 |

- 변경 파일: 2개
- DB 변경: 없음
- API 변경: 없음
- 기존 기능 영향: 없음 (서버 sanitize 제거, 클라이언트 sanitize 유지)
