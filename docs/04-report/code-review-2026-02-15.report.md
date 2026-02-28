# 전체 코드 리뷰 보고서

**날짜:** 2026-02-15
**대상:** qa-helpdesk 전체 코드베이스 (219 파일, ~33,700줄)
**리뷰어:** AI Code Reviewer

---

## 1. 수정 요약

### 검증 결과

| 항목 | Before | After |
|------|--------|-------|
| ESLint 에러 | 3건 | **0건** |
| ESLint 경고 | 19건 | **0건** |
| TypeScript 에러 | 0건 | **0건** |
| `npm run build` | 성공 | **성공** |
| 수정 파일 수 | — | **21개** |

### T1. lint 에러 수정 (3건 → 0건)

| # | 파일 | 규칙 | 수정 내용 |
|---|------|------|----------|
| 1 | `admin/content/[id]/page.tsx:77-79` | `set-state-in-effect` | `setLoading(true)` 제거 (초기값이 이미 `true`). `setLoading(false)`를 `loadContent` 내부 `finally` 블록으로 이동하여 effect 내 동기적 setState 호출 제거. |
| 2-3 | `api/admin/email/ai-write/route.ts:121-153` | `prefer-const` | `let contentHtml`, `let sources`, `let firstSectionTitle` 3개 변수 선언부 제거. 값 할당 시점에 `const`로 선언. |

### T2. lint 경고 정리 (19건 → 0건)

#### A. 미사용 변수/import 제거 (8건)

| # | 파일 | 제거 대상 | 비고 |
|---|------|----------|------|
| 1 | `AnswerCard.tsx:1` | `Sparkles` import | lucide 아이콘. JSX에서 미참조. |
| 2 | `engine.ts:15` | `_belowAvg` 파라미터 | `= null` → `?` (optional)로 변경. 함수 내부에서 미사용이나, 호출부(`line 199`)에서 5번째 인자로 전달 중이므로 시그니처 유지. |
| 3 | `questions.ts:12` | `status` 구조분해 | 함수 body에서 미사용. 타입 정의에는 유지 (외부 호출 호환성). |
| 4 | `admin/email/page.tsx:46-53` | `TipTapEditor` dynamic import | 8줄 블록 삭제. `EmailSplitEditor`가 대체. |
| 5 | `student-home.tsx:36` | `_userName` | props에서 구조분해 제거. 컴포넌트 내 미사용. |
| 6 | `Sidebar.tsx:58` | `_userEmail` | props에서 구조분해 제거. 컴포넌트 내 미사용. |
| 7-8 | `Header.tsx:12` | `_userName`, `_userRole` | 2개 props 구조분해 제거. 컴포넌트 내 미사용. |

#### B. 불필요 eslint-disable 제거 (1건)

| # | 파일 | 수정 |
|---|------|------|
| 9 | `email-template-utils.ts:230` | `// eslint-disable-next-line @typescript-eslint/no-explicit-any` 주석 제거. 다음 줄 `(row: { id: string })` 타입 명시로 `any` 미사용. |

#### C. `<img>` → `next/image` 전환 (9건)

| # | 파일 | 이미지 src | width×height | 참고 |
|---|------|-----------|-------------|------|
| 10 | `login/page.tsx:48` | `/logo.png` | 40×40 | static asset |
| 11 | `pending/page.tsx:11` | `/logo.png` | 40×40 | static asset |
| 12 | `signup/page.tsx:116` | `/logo.png` | 40×40 | static asset |
| 13 | `admin-dashboard.tsx:163` | `thumbnail_url` (supabase) | 48×48 | `remotePatterns`에 supabase.co 등록됨 |
| 14 | `detail-sidebar.tsx:93` | `content.thumbnail_url` (supabase) | 240×135 | `NextImage`로 alias (lucide `Image` 충돌) |
| 15 | `app-sidebar.tsx:138` | `/logo.png` | 22×22 | static asset |
| 16 | `student-header.tsx:49` | `/logo.png` | 32×32 | static asset |
| 17 | `post-card.tsx:61` | `thumbnailUrl \|\| /api/og?...` | 640×360 | 16:9 비율. /api/og는 로컬 라우트 |
| 18 | `post-hero.tsx:9` | `thumbnailUrl \|\| /api/og?...` | 1200×630 | OG 이미지 표준 비율 |

#### D. useEffect 의존성 경고 (1건)

| # | 파일 | 수정 |
|---|------|------|
| 19 | `content-editor-dialog.tsx:66` | `[content?.id]`에 `eslint-disable-next-line react-hooks/exhaustive-deps` 추가. `content` 객체를 deps에 넣으면 매 렌더마다 effect 재실행 → 무한루프 위험. ID 변경 시에만 폼 초기화하는 의도적 패턴. |

### T3. 데드코드 제거

| 항목 | 계획 | 실제 결과 |
|------|------|----------|
| `tiptap-editor.tsx` (499줄) | 삭제 예정 | **삭제 불가.** `email-split-editor.tsx:88-93`에서 `<TipTapEditor>` JSX 렌더링에 실제 사용 중. 계획의 "두 곳 모두 미사용" 분석이 오류. |
| `admin/email/page.tsx` TipTapEditor import | 제거 예정 | **제거 완료.** 이 파일에서는 `EmailSplitEditor`만 사용. |
| `escapeHtml()` 중복 (4곳) | 보고서 기록 | 기록 (아래 남은 이슈 참조) |
| `embedContent()`, `embedAllContents()` | 보고서 기록 | 기록 (배치 작업 가능성) |

### T4. 보안 점검

| 항목 | 상태 | 상세 |
|------|------|------|
| Admin API 인증 | ✅ 통과 | 모든 `admin/*` 라우트에 `user` + `role` 체크. `createClient()` → `auth.getUser()` → profile role 검증 패턴 일관. |
| Server Actions 인증 | ✅ 통과 | admin 전용 액션에 `requireAdmin()` 가드. 일반 사용자 액션은 `auth.getUser()` 체크. |
| SQL 인젝션 | ✅ 통과 | Supabase JS 클라이언트의 파라미터화 쿼리 일관 사용. raw SQL 직접 실행 없음. |
| XSS | ⚠️ 주의 | `email-split-editor`에서 admin이 입력한 HTML이 세니타이즈 없이 이메일 본문에 삽입됨. admin 전용이므로 위험도 낮으나, 계정 탈취 시 이메일을 통한 XSS 가능. |
| 환경변수 노출 | ✅ 통과 | `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY` 등 서버 전용. 클라이언트 번들 미포함 확인. |
| Service role 키 사용 | ✅ 통과 | `createServiceClient()` 호출 전 반드시 인증 가드 존재. RLS 우회는 인증된 admin/서버 액션에서만. |
| `/api/verify-business` | ⚠️ 미완성 | 국세청 API 미연동. 사업자번호 포맷 검증(정규식)만 수행. 실제 유효성 검증 불가. |

---

## 2. 남은 이슈

### 2-1. 유틸리티 함수 중복

#### `escapeHtml()` — 4곳 중복

| 파일 | 이스케이프 문자 | 비고 |
|------|---------------|------|
| `email-templates.ts` | `& < > " '` | 완전 버전 (`'` → `&#039;` 포함) |
| `email-template-utils.ts` | `& < > "` | `'` 누락 |
| `markdown.ts` | `& < > "` | `'` 누락 |
| `contents.ts` | `& < > "` | `'` 누락 |

**권장:** `src/lib/utils/escape-html.ts`로 통합. `'` 이스케이프 포함 버전으로 통일. 단, 이메일 HTML 렌더링 동작 변경 가능성이 있으므로 별도 태스크로 진행 + QA 필수.

#### `timeAgo()` — 7곳 중복

| 파일 |
|------|
| `student-home.tsx`, `member-dashboard.tsx`, `AnswerCard.tsx`, `questions/[id]/page.tsx`, `PostCard.tsx`, `QuestionCard.tsx`, `posts/[id]/comment-section.tsx` |

**권장:** `src/lib/utils/time-ago.ts`로 통합. 동일 로직이므로 안전하게 리팩토링 가능.

### 2-2. 미사용 서버 액션

| 함수 | 파일 | 상태 |
|------|------|------|
| `embedContent()` | `contents.ts` | import 없음. 배치 embedding 용도 추정. |
| `embedAllContents()` | `contents.ts` | import 없음. 전체 re-embedding 용도 추정. |

**권장:** 사용 여부 확인 후 미사용 시 삭제. 배치용이라면 주석으로 용도 명시.

### 2-3. 보안 개선 사항

| 항목 | 위험도 | 권장 조치 |
|------|--------|----------|
| Email HTML 미세니타이즈 | 낮음 (admin only) | DOMPurify로 세니타이즈 추가. `email-split-editor.tsx`의 `onChange` 콜백에서 처리. |
| `/api/verify-business` 미완성 | 중간 | 국세청 사업자등록 상태조회 API 연동. 또는 기능 비활성화 표시. |

### 2-4. tiptap-editor.tsx 삭제 불가

- 계획에서는 `email-split-editor.tsx`의 import가 미사용이라 판단했으나, **line 88-93에서 `<TipTapEditor>` 컴포넌트로 렌더링 중**.
- 삭제 시 이메일 편집기가 동작하지 않음.
- `admin/email/page.tsx`의 미사용 import만 제거 완료.

---

## 3. 아키텍처 제안

### 3-1. 데이터 페칭 패턴 개선

**현재:** `content/[id]/page.tsx` 등 클라이언트 컴포넌트에서 `useEffect` + `useCallback` + `useState`로 데이터 로딩.

**문제:** React 19에서 이 패턴은 권장되지 않음. `set-state-in-effect` 린트 에러의 근본 원인.

**권장 방안:**
- **서버 컴포넌트 전환:** 데이터 로딩을 서버 컴포넌트로 이동. 클라이언트 컴포넌트는 인터랙션만 담당.
- **React 19 `use()` API:** 서버 컴포넌트에서 promise를 생성하고, 클라이언트에서 `use()`로 소비.
- **SWR/TanStack Query:** 클라이언트 데이터 페칭이 필요한 경우 전용 라이브러리 도입.

### 3-2. 이미지 최적화 전략

**이번 수정:** 9개 파일에서 `<img>` → `next/image` 전환. 자동 최적화(WebP 변환, 리사이즈, lazy loading) 활성화.

**추가 권장:**
- `/api/og` OG 이미지에 Cache-Control 헤더 추가 (현재 매 요청마다 생성 추정)
- `logo.png` 등 정적 이미지는 `import` 구문으로 빌드타임 최적화 활용 가능:
  ```tsx
  import logo from "@/public/logo.png";
  <Image src={logo} alt="..." />
  ```

### 3-3. 캐싱 전략 부재

**현재 상태:**
- `revalidatePath` 26회 사용 — 페이지 단위 전체 재검증
- `revalidateTag` 미사용
- `unstable_cache` / `next/cache` 미사용

**권장:**
- 자주 조회되는 데이터(카테고리 목록, 대시보드 통계)에 `unstable_cache` + 태그 기반 재검증 도입
- `revalidatePath`의 과도한 사용을 `revalidateTag`로 세분화

### 3-4. `select("*")` 과다 사용

**현재:** 17곳에서 `select("*")` 사용. 모든 컬럼을 가져옴.

**영향:** 불필요한 데이터 전송. 특히 `body_md` 같은 대용량 텍스트 컬럼이 목록 쿼리에 포함.

**권장:** 목록 조회 시 필요한 컬럼만 명시. 예:
```ts
// Before
.select("*", { count: "exact" })
// After
.select("id, title, status, created_at, category_id", { count: "exact" })
```

---

## 4. 성능 우려

### 4-1. N+1 쿼리 — `getQuestions()` (심각도: 높음)

**위치:** `src/actions/questions.ts:64-77`

```ts
const questionIds = data.map((q) => q.id);
const countResults = await Promise.all(
  questionIds.map((qid) =>
    supabase.from("answers").select("*", { count: "exact", head: true }).eq("question_id", qid)
  )
);
```

**문제:** 질문 N개당 N번의 추가 쿼리 발생. 페이지당 10개 질문이면 **11번의 DB 호출** (1 + 10).

**권장 수정:**
```sql
-- Supabase RPC 또는 뷰 활용
SELECT q.*, COUNT(a.id) as answers_count
FROM questions q
LEFT JOIN answers a ON a.question_id = q.id
GROUP BY q.id
```
또는 Supabase의 관계 쿼리 활용:
```ts
.select("*, answers(count)", { count: "exact" })
```

### 4-2. 대용량 컬럼 과다 전송 (심각도: 중간)

**위치:** `select("*")` 사용하는 17곳

**문제:**
- `contents` 테이블의 `body_md`, `email_summary`, `email_design_json`은 수천~수만 자 가능
- 목록 조회에서 본문 전체를 로딩하면 응답 크기 비대
- 특히 `admin/content` 목록, `questions` 목록에서 불필요

**영향:** 네트워크 전송량 증가, 서버 메모리 사용 증가, TTFB 지연

### 4-3. `revalidatePath` 중복 호출 (심각도: 낮음)

**위치:** `answers.ts`에서 단일 액션당 최대 4회 `revalidatePath` 호출

```ts
revalidatePath(`/questions/${answer.question_id}`);
revalidatePath("/admin/answers");
revalidatePath("/questions");
revalidatePath("/dashboard");
```

**문제:** 각 `revalidatePath`는 해당 경로의 캐시를 전부 무효화. 4개 경로를 한꺼번에 무효화하면 다음 요청들이 모두 캐시 미스.

**권장:** 태그 기반 재검증으로 전환하여 필요한 데이터만 무효화.

### 4-4. 클라이언트 번들 크기 (심각도: 낮음)

**현재:** `tiptap-editor.tsx` (499줄) + @tiptap 패키지가 `dynamic import`로 코드 스플릿됨. 이메일 관리 페이지 접근 시에만 로드되므로 초기 번들에는 미포함.

**양호한 점:**
- `dynamic(() => import(...))` 패턴으로 대형 컴포넌트 코드 스플릿 적용
- `ssr: false`로 서버사이드 번들 제외
- `PostEditPanel`, `DetailSidebar` 등도 동일 패턴 적용

---

## 5. 수정된 파일 목록 (21개)

| # | 파일 | 태스크 | 변경 유형 |
|---|------|--------|----------|
| 1 | `src/app/(main)/admin/content/[id]/page.tsx` | T1 | setLoading 리팩토링 |
| 2 | `src/app/api/admin/email/ai-write/route.ts` | T1 | let → const 3건 |
| 3 | `src/components/questions/AnswerCard.tsx` | T2-A | Sparkles import 제거 |
| 4 | `src/lib/diagnosis/engine.ts` | T2-A | _belowAvg optional 변경 |
| 5 | `src/actions/questions.ts` | T2-A | status 구조분해 제거 |
| 6 | `src/app/(main)/admin/email/page.tsx` | T2-A, T3 | TipTapEditor import 제거 |
| 7 | `src/app/(main)/dashboard/student-home.tsx` | T2-A | _userName 제거 |
| 8 | `src/components/dashboard/Sidebar.tsx` | T2-A | _userEmail 제거 |
| 9 | `src/components/layout/Header.tsx` | T2-A | _userName, _userRole 제거 |
| 10 | `src/lib/email-template-utils.ts` | T2-B | unused eslint-disable 제거 |
| 11 | `src/app/(auth)/login/page.tsx` | T2-C | img → Image |
| 12 | `src/app/(auth)/pending/page.tsx` | T2-C | img → Image |
| 13 | `src/app/(auth)/signup/page.tsx` | T2-C | img → Image |
| 14 | `src/app/(main)/dashboard/admin-dashboard.tsx` | T2-C | img → Image |
| 15 | `src/components/content/detail-sidebar.tsx` | T2-C | img → NextImage |
| 16 | `src/components/layout/app-sidebar.tsx` | T2-C | img → Image |
| 17 | `src/components/layout/student-header.tsx` | T2-C | img → Image |
| 18 | `src/components/posts/post-card.tsx` | T2-C | img → Image |
| 19 | `src/components/posts/post-hero.tsx` | T2-C | img → Image |
| 20 | `src/components/content/content-editor-dialog.tsx` | T2-D | eslint-disable 추가 |
| 21 | `docs/04-report/code-review-2026-02-15.report.md` | T5 | 보고서 생성 |
