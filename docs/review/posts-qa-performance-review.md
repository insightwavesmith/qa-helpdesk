# 정보공유(/posts) + Q&A(/questions) 성능 코드리뷰

> 리뷰 일시: 2026-03-16
> 대상: 페이지 로딩 속도 + 이미지 로딩 개선
> 방법: 코드 정적 분석 (수정 없음)

---

## 요약

| 영역 | 심각도 | 이슈 |
|------|--------|------|
| **posts — OG 이미지 폴백** | **CRITICAL** | 썸네일 없는 글마다 `/api/og` 호출 → 카드 12개면 최대 12번 서버사이드 이미지 생성 |
| **posts — 쿼리 과다 select** | HIGH | `select("*")` → contents 테이블 30개+ 컬럼 전체 전송 (email_html, body_md 포함) |
| **posts — 관련 글 직렬 쿼리** | HIGH | 상세 페이지에서 `getPosts()` 추가 호출 (관련 글 3개) |
| **posts — body_md 전달** | MEDIUM | 목록 페이지에서 body_md(마크다운 원문 수천자) 전체를 클라이언트에 전달 |
| **questions — 직렬 waterfall** | HIGH | profile → categories → getQuestions 3단 waterfall |
| **questions — Suspense 미작동** | MEDIUM | 데이터 fetch 완료 후 Suspense 내부 렌더링 → fallback 미표시 |

---

## 1. Posts (/posts) 분석

### 1-1. OG 이미지 폴백 (CRITICAL)

**파일**: `src/components/posts/post-card.tsx:67`

```tsx
// Thumbnail 컴포넌트
src={thumbnailUrl || `/api/og?title=${encodeURIComponent(title)}&category=${encodeURIComponent(category)}`}
```

**문제**:
- `thumbnail_url`이 null인 게시글은 `/api/og?title=...` URL로 폴백
- `/api/og`는 Edge Runtime에서 **매 요청마다 1200×630 이미지를 실시간 생성** (`ImageResponse`)
- 목록 페이지에 카드 12개 → thumbnail_url이 없는 글이 N개면 **N번의 OG 이미지 생성 API 호출**
- `unoptimized={isOgFallback}` 설정 → Next.js Image Optimization도 건너뜀
- 결과: 이미지가 "따로따로 로드"되는 현상의 핵심 원인

**개선 방안**:
1. **contents 테이블에 thumbnail_url 일괄 채우기** — OG API를 한 번 호출해서 결과를 Supabase Storage에 저장, thumbnail_url 업데이트
2. **CSS gradient 폴백** — 썸네일 없으면 카테고리별 gradient + 제목 텍스트 오버레이 (API 호출 없이)
3. **OG 응답에 Cache-Control 추가** — 현재 캐시 헤더 없음. 최소 `Cache-Control: public, max-age=86400, s-maxage=604800` 추가

### 1-2. select("*") 과다 데이터 (HIGH)

**파일**: `src/actions/posts.ts:35-36`

```tsx
.select("*, author:profiles(id, name, shop_name)", { count: "exact" })
```

**문제**:
- contents 테이블은 **30개+ 컬럼** (database.ts 577~611행)
- 목록에서 필요 없는 컬럼: `email_html`, `email_design_json`, `email_summary`, `ai_summary`, `ai_source`, `key_topics`, `source_hash`, `source_ref`, `source_url`, `embedding_status`, `embedded_at`, `chunks_count`, `priority`, `images`, `tags`, `curation_status`, `importance_score`, `email_cta_text`, `email_cta_url`, `email_sent_at`, `email_subject`
- **email_html은 수천~만 자** → 12개 글 × 만 자 = 전송량 폭증
- `body_md`도 목록에서는 excerpt(100자)만 필요한데 전문(수천자) 전체 전송

**개선 방안**:
```tsx
// Before (30+ 컬럼)
.select("*, author:profiles(id, name, shop_name)", { count: "exact" })

// After (필요한 10개만)
.select(
  "id, title, body_md, category, thumbnail_url, type, is_pinned, view_count, like_count, created_at, published_at, author:profiles(id, name, shop_name)",
  { count: "exact" }
)
```
- `body_md`도 이상적으로는 서버에서 excerpt 처리 후 전달해야 하지만, Supabase에서 substring은 어려우니 클라이언트에 전달은 허용. 단 나머지 20개 컬럼 제거만으로도 전송량 **60~70% 감소** 예상

### 1-3. body_md 클라이언트 전달 (MEDIUM)

**파일**: `src/app/(main)/posts/page.tsx:56-69`

```tsx
const safePosts = posts.map((p) => ({
  ...
  body_md: p.body_md,  // 수천자 마크다운 원문 전체
  content: p.content,   // body_md의 별칭 (mapContentToPost에서 복사)
  ...
}));
```

**문제**:
- `body_md`와 `content`가 동일 데이터 → **2배 전송**
- PostCard에서 사용하는 건 `getExcerpt(post.body_md || post.content, 100)` — 100자 excerpt뿐

**개선 방안**:
```tsx
// page.tsx에서 서버사이드 excerpt 처리
const safePosts = posts.map((p) => ({
  ...
  excerpt: getExcerpt(p.body_md || "", 150),
  // body_md, content 제거 → 클라이언트에 전달하지 않음
}));
```
- PostCard에서 `post.excerpt` 직접 사용
- body_md 전송량 게시글당 ~3KB → ~150B로 **95% 감소**

### 1-4. 상세 페이지 관련 글 직렬 쿼리 (HIGH)

**파일**: `src/app/(main)/posts/[id]/page.tsx:39-58`

```tsx
// 1. getPostById + checkIsAdmin — 병렬 (좋음)
const [postResult, isAdmin] = await Promise.all([getPostById(id), checkIsAdmin()]);

// 2. getPosts — 직렬 (문제)
const { data: relatedRaw } = await getPosts({
  page: 1, pageSize: 4, category: post.category,
});
```

**문제**:
- `getPostById` 완료 후 `post.category`를 알아야 관련 글 쿼리 가능 → **직렬 waterfall**
- `getPosts`가 `select("*")` → 관련 글 4개에도 email_html 등 30컬럼 전체 fetch
- getPostById 내부에서 view_count UPDATE도 직렬 실행 (line 88-91)

**개선 방안**:
1. `getRelatedPosts(postId, category, limit)` 전용 함수 — 필요한 컬럼만 select
2. view_count UPDATE를 fire-and-forget으로 변경 (`void supabase.from(...)`)
3. 관련 글 쿼리를 Suspense 분리 → 메인 콘텐츠 먼저 표시

### 1-5. next/image 설정 (양호, 개선 여지 있음)

**파일**: `src/components/posts/post-card.tsx:63-77`

```tsx
<Image
  src={...}
  width={640} height={360}
  sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
  unoptimized={isOgFallback}
  priority={priority}
/>
```

**현재 상태**:
- `next/image` 사용: **O** (올바름)
- `sizes` 설정: **O** (반응형 3단계)
- `priority`: featured 카드만 true (올바름)
- `loading`: 명시 안 함 → 기본 `lazy` (올바름)
- `unoptimized={isOgFallback}`: OG 폴백 이미지는 최적화 건너뜀 → **문제** (avif/webp 변환 안 됨)

**개선 방안**:
- OG 폴백 제거가 근본 해결 (1-1 참조)
- `placeholder="blur"` + `blurDataURL` 추가하면 체감 속도 개선 (선택)

---

## 2. Questions (/questions) 분석

### 2-1. 직렬 Waterfall (HIGH)

**파일**: `src/app/(main)/questions/page.tsx:24-63`

```tsx
// Step 1: auth (직렬)
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();

// Step 2: profile + categories (user 있을 때만 병렬)
const [{ data: profile }, cats] = await Promise.all([...]);

// Step 3: getQuestions (Step 2 완료 후 — categoryId 필요)
const { data: questions, count } = await getQuestions({...});
```

**문제**:
- 3단 waterfall: `auth → profile+categories → getQuestions`
- getQuestions는 categoryId가 필요하지만, "전체" 탭일 때는 null → **불필요한 대기**
- 비로그인 유저도 auth 호출 후 대기

**개선 방안**:
```tsx
// 전체 탭(categoryId 불필요)이면 getQuestions를 auth와 병렬로
const questionsPromise = (categorySlug === "all" || !categorySlug)
  ? getQuestions({ page, pageSize: 12, tab, search })
  : null; // category 매핑 필요 시 지연

const [authResult, categories, earlyQuestions] = await Promise.all([
  createClient().then(s => s.auth.getUser()),
  getCategories(),
  questionsPromise,
]);

// category 필터가 있을 때만 추가 쿼리
const questions = earlyQuestions ?? await getQuestions({...categoryId});
```
- **예상 효과**: 전체 탭 기준 waterfall 3단 → 1단 (auth + categories + questions 병렬)

### 2-2. Suspense 미작동 (MEDIUM)

**파일**: `src/app/(main)/questions/page.tsx:73`

```tsx
<Suspense fallback={<QuestionsLoading />}>
  <QuestionsListClient questions={questions} ... />
</Suspense>
```

**문제**:
- `QuestionsListClient`는 **클라이언트 컴포넌트** — props로 이미 fetch 완료된 데이터를 받음
- Suspense는 **async 서버 컴포넌트 내부의 await**에 반응하는데, 여기서는 모든 await가 Suspense 바깥(page 함수 최상위)에서 완료됨
- 결과: `QuestionsLoading` fallback이 **절대 표시되지 않음** → 빈 화면 → 전체 렌더링

**개선 방안**:
- 데이터 fetching을 별도 async 서버 컴포넌트로 분리:
```tsx
// page.tsx
export default function QuestionsPage({ searchParams }) {
  return (
    <Suspense fallback={<QuestionsLoading />}>
      <QuestionsContent searchParams={searchParams} />
    </Suspense>
  );
}

// questions-content.tsx (async 서버 컴포넌트)
async function QuestionsContent({ searchParams }) {
  const questions = await getQuestions(...);
  return <QuestionsListClient questions={questions} ... />;
}
```
- 이렇게 하면 QuestionsContent의 await 동안 QuestionsLoading이 표시됨

### 2-3. getQuestions 쿼리 (양호)

**파일**: `src/actions/questions.ts:32-45`

```tsx
let query = (supabase.from("questions") as any)
  .select(selectStr, { count: "exact" })
  .is("parent_question_id", null)
  .order("created_at", { ascending: false })
  .range(from, to);
```

**현재 상태**:
- select에 `answers(count)` 포함 → Supabase가 한 번의 쿼리로 집계 (N+1 아님) ✅
- `range()` 페이지네이션 → 필요한 만큼만 fetch ✅
- `parent_question_id IS NULL` 필터 → 인덱스 있으면 빠름 (확인 필요)

**개선 여지**:
- `selectStr`에 `*` 포함 → questions 테이블은 컬럼이 적어(~13개) 영향 미미
- `embedding` 컬럼(vector 768차원)이 포함될 수 있음 → 확인 필요. 포함되면 **대량 데이터 전송**

---

## 3. Posts 상세 (/posts/[id]) 분석

### 3-1. 쿼리 구조

```
getPostById → select("*") → 30+ 컬럼 (body_md 전문 필요하니 OK)
  ↓ 직렬
getPosts(관련 글) → select("*") → 30+ 컬럼 × 4 (불필요)
  ↓ 직렬
view_count UPDATE
```

### 3-2. PostDetailClient에 전달하는 데이터

**파일**: `src/app/(main)/posts/[id]/page.tsx:80-107`
- `post` 객체에 `content`(=body_md 복사) 포함 → **마크다운 2배 전달**
- `relatedPosts`에도 `content`, `body_md` 포함 → 관련 글 3개의 본문 전체 전달 (불필요)

---

## 4. 공통 이슈

### 4-1. posts와 questions 모두 — SSR 직렬 fetch

두 페이지 모두 **page.tsx (서버 컴포넌트)에서 모든 데이터를 직렬 fetch 완료 후 클라이언트 컴포넌트에 전달**하는 구조.

- 장점: 단순, SEO 가능
- 단점: **TTFB(Time to First Byte) 지연** — 모든 쿼리 완료까지 빈 화면

### 4-2. staleTimes.dynamic: 30

`next.config.ts`에 `staleTimes.dynamic: 30` 설정됨 → 30초 캐시.
- 탭 전환 시 30초 내 재방문은 캐시 히트 (좋음)
- 첫 방문은 여전히 느림

---

## 5. 개선 우선순위

| # | 작업 | 대상 | 예상 효과 | 난이도 |
|---|------|------|-----------|--------|
| 1 | **getPosts select 축소** | posts.ts:35 | 전송량 60-70% 감소 | 쉬움 |
| 2 | **OG 폴백 → CSS gradient** | post-card.tsx:67 | 이미지 로딩 지연 제거 | 쉬움 |
| 3 | **서버사이드 excerpt** | posts/page.tsx | body_md 2배 전송 제거 | 쉬움 |
| 4 | **questions waterfall 병렬화** | questions/page.tsx | 쿼리 병렬 → TTFB 40% 감소 | 보통 |
| 5 | **Suspense 정상화** (posts+questions) | page.tsx | skeleton 즉시 표시 → 체감 속도 향상 | 보통 |
| 6 | **관련 글 select 축소** | posts/[id]/page.tsx:51 | 상세 페이지 전송량 감소 | 쉬움 |
| 7 | **view_count UPDATE 비동기화** | posts.ts:88, questions.ts:81 | 응답 시간 -50ms | 쉬움 |
| 8 | **OG 이미지 캐시 헤더** | api/og/route.tsx | 반복 방문 시 이미지 즉시 표시 | 쉬움 |
| 9 | **thumbnail_url 일괄 채우기** | DB 마이그레이션 | OG 폴백 근본 제거 | 보통 |
| 10 | **embedding 컬럼 select 제외 확인** | questions.ts | vector 데이터 전송 방지 | 쉬움 |

---

## 6. 구체적 수정 포인트

### 6-1. `src/actions/posts.ts` — getPosts select 축소
```diff
- .select("*, author:profiles(id, name, shop_name)", { count: "exact" })
+ .select(
+   "id, title, body_md, category, thumbnail_url, type, is_pinned, view_count, like_count, created_at, published_at, status, author:profiles(id, name, shop_name)",
+   { count: "exact" }
+ )
```

### 6-2. `src/components/posts/post-card.tsx` — OG 폴백 제거
```diff
function Thumbnail({ title, category, thumbnailUrl, priority = false }) {
-  const isOgFallback = !thumbnailUrl;
-  return (
-    <Image
-      src={thumbnailUrl || `/api/og?title=...`}
-      ...
-      unoptimized={isOgFallback}
-    />
-  );
+  if (!thumbnailUrl) {
+    // CSS gradient 폴백 — API 호출 없음
+    const colors = gradientMap[category] || ["#1a1a2e", "#2d2d4e"];
+    return (
+      <div
+        className="w-full aspect-video flex items-center justify-center p-4"
+        style={{ background: `linear-gradient(135deg, ${colors[0]}, ${colors[1]})` }}
+      >
+        <span className="text-white font-semibold text-sm text-center line-clamp-2">
+          {title}
+        </span>
+      </div>
+    );
+  }
+  return (
+    <Image src={thumbnailUrl} alt={title} width={640} height={360}
+      sizes="(max-width: 640px) 100vw, (max-width: 768px) 50vw, 33vw"
+      priority={priority}
+    />
+  );
}
```

### 6-3. `src/app/(main)/posts/page.tsx` — 서버사이드 excerpt
```diff
+ import { getExcerpt } from "@/components/posts/post-card";

  const safePosts = posts.map((p) => ({
    id: p.id,
    title: p.title,
-   content: p.content,
-   body_md: p.body_md,
+   excerpt: getExcerpt(p.body_md || p.content || "", 150),
    category: p.category,
    ...
  }));
```

### 6-4. `src/app/(main)/questions/page.tsx` — 병렬 fetch
```diff
- const supabase = await createClient();
- const { data: { user } } = await supabase.auth.getUser();
- // ... 직렬 ...
- const { data: questions } = await getQuestions({...});

+ // auth, categories, questions(전체 탭) 병렬 실행
+ const [authResult, categories] = await Promise.all([
+   createClient().then(s => s.auth.getUser()),
+   getCategories(),
+ ]);
+ const user = authResult.data.user;
+ // categoryId 매핑 후 questions fetch
```

### 6-5. `src/app/api/og/route.tsx` — 캐시 헤더 추가
```diff
  return new ImageResponse(
    (...),
-   { width: 1200, height: 630 }
+   {
+     width: 1200,
+     height: 630,
+     headers: {
+       "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
+     },
+   }
  );
```

### 6-6. `src/actions/posts.ts` — view_count 비동기화
```diff
  // getPostById
- await supabase.from("contents").update({ view_count: ... }).eq("id", id);
+ void supabase.from("contents").update({ view_count: ... }).eq("id", id);
  // 응답 반환을 view_count UPDATE 완료까지 기다리지 않음
```

---

## 결론

**"이미지가 따로따로 로드됨"의 핵심 원인**: thumbnail_url이 null인 게시글이 `/api/og` 엔드포인트를 매번 호출하여 실시간 이미지 생성. 12개 카드면 최대 12번의 Edge Function 호출.

**"느리게 뜸"의 핵심 원인**: `select("*")`로 30+컬럼(email_html 등 수천자 포함) 전체 전송 + 직렬 waterfall(auth → profile → query).

**1~3번 작업만 하면 체감 속도 50%+ 개선 예상.** 5번(Suspense 정상화)까지 하면 skeleton이 즉시 표시되어 사용자 체감 TTFB가 거의 0에 가까워짐.
