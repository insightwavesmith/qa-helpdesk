# QA Helpdesk 성능 코드리뷰

> 2026-02-11 | qa-helpdesk.vercel.app 느림 피드백 대응
> 분석 범위: 컴포넌트, API, Supabase 쿼리, 이미지, 번들, SSR/CSR 분리

---

## 요약: 우선순위별 이슈

| 우선순위 | 이슈 | 예상 효과 |
|---------|------|----------|
| 🔴 P0 | 이메일 발송 API — limit 없는 대량 로드 | 메모리 50%↓, 타임아웃 방지 |
| 🔴 P0 | `embedAllContents()` N+1 순차 쿼리 | 처리시간 10배↓ |
| 🔴 P0 | 이미지 — next/image 미사용, 원본 로딩 | LCP 50-100ms↓ |
| 🔴 P1 | `getQuestions()` 답변 집계를 클라이언트에서 수행 | 데이터 전송 99%↓ |
| 🔴 P1 | MDXEditor 정적 import (dynamic 미사용) | 초기 번들 ~200KB↓ |
| 🔴 P1 | StudentAdSummary — waterfall API fetch | 200-500ms↓ |
| 🟡 P2 | Admin 3개 페이지 Client fetch → Server 전환 가능 | 100-300ms↓ |
| 🟡 P2 | Recharts dynamic import 미사용 | 번들 ~100KB↓ |
| 🟡 P2 | `getWeeklyQuestionStats()` 클라이언트 그룹화 | DB 부하↓ |
| 🟡 P2 | `motion` + `framer-motion` 중복 설치 의심 | 번들 ~100KB↓ |
| 🟢 P3 | `select("*")` 과다 사용 | 대역폭↓ |
| 🟢 P3 | TipTap 인라인 CSS 95줄 | 캐싱 가능 |
| 🟢 P3 | StatCards/ChannelBreakdown 불필요한 "use client" | JS 번들↓ |

---

## 1. 불필요한 re-render / 무거운 컴포넌트

### 1-1. Unlayer 에디터 — 이중 dynamic import

**파일**: `src/components/content/newsletter-edit-panel.tsx:27-37`

```
newsletter-edit-panel.tsx (298줄, "use client")
  └─ dynamic import → unlayer-editor.tsx (96줄)
       └─ dynamic import → react-email-editor
```

- **문제**: 이미 lazy-loaded된 컴포넌트를 다시 dynamic import (이중 지연)
- **개선**: newsletter-edit-panel에서 직접 import하거나, 한쪽 dynamic만 유지

### 1-2. TipTap 에디터 — 동일한 이중 dynamic import

**파일**: `src/components/email/email-split-editor.tsx:7-14`

```
email-split-editor.tsx ("use client")
  └─ dynamic import → tiptap-editor.tsx (499줄)
```

그런데 `src/app/(main)/admin/email/page.tsx:47-53`에서도 동일한 tiptap-editor를 dynamic import.

- **문제**: 같은 컴포넌트를 두 곳에서 각각 dynamic import
- **개선**: 페이지 레벨에서만 dynamic import, 하위에서는 일반 import

### 1-3. StudentAdSummary — Client Waterfall Fetch

**파일**: `src/app/(main)/dashboard/student-ad-summary.tsx`

```tsx
useEffect(() => {
  fetch("/api/protractor/accounts")     // 1차 호출
    .then(res => res.json())
    .then(accounts => {
      fetch(`/api/protractor/insights?account_id=${accounts[0].id}`)  // 2차 호출 (직렬)
    });
}, []);
```

- **문제**: 2개의 API를 직렬(waterfall)로 호출. 부모가 Server Component인데 Client에서 fetch
- **개선**: 부모 Server Component에서 `Promise.all()`로 병렬 fetch 후 props 전달

### 1-4. PostDetailClient — useCallback 의존성 누락

**파일**: `src/app/(main)/posts/[id]/PostDetailClient.tsx`

```tsx
const scheduleAutoSave = useCallback(
  (title: string, content: string) => { /* ... */ },
  [post.id]  // ← editTitle, editContent 누락
);
```

- **문제**: 의존성 불완전 → stale closure로 이전 값 사용 가능
- **개선**: 의존성 배열 수정 또는 useRef로 최신값 참조

### 1-5. 이미지 미리보기 메모리 누수

**파일**: `src/app/(main)/questions/new/new-question-form.tsx`

- **문제**: `URL.createObjectURL()` 사용 후 `URL.revokeObjectURL()` cleanup 없음
- **개선**: 컴포넌트 언마운트 시 cleanup 추가

---

## 2. API 호출 최적화

### 2-1. embedAllContents() — N+1 순차 쿼리 🔴

**파일**: `src/actions/contents.ts:389-417`

```tsx
for (const c of contents || []) {
  const embedding = await generateEmbedding(c.title + " " + c.body_md);  // API 호출
  await supabase.from("contents").update({ embedding }).eq("id", c.id);  // DB 호출
}
// 100개 콘텐츠 = 200번의 순차 호출 → 100초+
```

- **문제**: 루프 안에서 순차 API + DB 호출
- **개선**: `Promise.all()` 또는 배치 처리 (5-10개씩 병렬)

### 2-2. getQuestions() — 답변 집계를 메모리에서 수행 🔴

**파일**: `src/actions/questions.ts:62-84`

```tsx
const { data: answerCounts } = await supabase
  .from("answers")
  .select("question_id")        // limit 없음
  .in("question_id", questionIds);

// 클라이언트에서 forEach 집계
answerCounts?.forEach((a) => {
  countMap[a.question_id] = (countMap[a.question_id] || 0) + 1;
});
```

- **문제**: 답변 전체를 메모리에 로드 후 JS에서 COUNT → 답변 10만개면 10만 레코드 전송
- **개선**: DB RPC 함수로 `GROUP BY question_id` 집계 또는 Supabase `.select("question_id.count()")`

### 2-3. getWeeklyQuestionStats() — 클라이언트 그룹화

**파일**: `src/actions/admin.ts:135-174`

```tsx
const { data } = await supabase
  .from("questions")
  .select("created_at")         // limit 없음
  .gte("created_at", fourWeeksAgo.toISOString());
// → 4주치 모든 질문의 created_at 로드 후 JS에서 일별 카운팅
```

- **문제**: DB에서 GROUP BY 하면 28행만 반환될 것을 전체 로드
- **개선**: RPC 함수 또는 `DATE(created_at) GROUP BY` SQL 사용

### 2-4. Admin 페이지 Client fetch 패턴

| 파일 | 현재 | 개선 |
|------|------|------|
| `src/app/(main)/admin/accounts/accounts-client.tsx` | useEffect + fetch | Server Component에서 props |
| `src/app/(main)/admin/content/page.tsx` | useEffect + fetch | Server Component에서 props |
| `src/app/(main)/admin/email/page.tsx` | useEffect + fetch | Server Component에서 props |

- **문제**: Server Component로 충분한데 Client에서 불필요하게 fetch → 초기 빈 화면 + 지연
- **개선**: 페이지를 Server Component로 변환, 데이터를 props로 전달

---

## 3. Supabase 쿼리 .limit() 누락

### 3-1. 이메일 발송 API — 전체 수신자 무제한 로드 🔴

**파일**: `src/app/api/admin/email/send/route.ts`

| 라인 | 대상 | 테이블 | limit |
|------|------|--------|-------|
| 99-102 | `all_leads` | leads | ❌ 없음 |
| 105-108 | `all_students` | student_registry | ❌ 없음 |
| 110-114 | `all_members` | profiles | ❌ 없음 |
| 118-120 | `all` (합산) | 3개 테이블 | ❌ 없음 |

- **문제**: 수만 명의 이메일을 한 번에 메모리 로드 → Vercel 타임아웃/메모리 초과
- **참고**: `src/actions/recipients.ts`에서는 `.limit(5000)` 올바르게 사용 중
- **개선**: `.limit(50000)` 명시 + 페이지네이션 처리

### 3-2. 기타 limit 없는 쿼리

| 파일 | 함수 | 테이블 |
|------|------|--------|
| `src/actions/questions.ts:62-84` | `getQuestions()` 답변 조회 | answers |
| `src/actions/admin.ts:135-174` | `getWeeklyQuestionStats()` | questions |
| `src/app/api/admin/accounts/route.ts:64-68` | 드롭다운용 학생 목록 | profiles |

---

## 4. 이미지 최적화

### 4-1. ImageGallery — `<img>` 직접 사용 🔴

**파일**: `src/components/questions/ImageGallery.tsx:25-30`

```tsx
{/* eslint-disable-next-line @next/next/no-img-element */}
<img
  src={url}                                    // Supabase Storage 원본 URL
  alt={`첨부 이미지 ${idx + 1}`}
  className="w-full h-32 sm:h-40 object-cover"  // width/height 미지정
/>
```

- **문제**: next/image 미사용, 원본 크기 이미지 전송, lazy loading 없음, eslint 강제 무시
- **개선**: `<Image>` 컴포넌트 + Supabase loader 또는 URL transform (`?width=400&quality=80`)

### 4-2. ImageLightbox — 전체 크기 이미지 무제한 로딩

**파일**: `src/components/questions/ImageLightbox.tsx:76-82`

```tsx
<img
  src={imageUrls[currentIndex]}               // 원본 크기 그대로
  className="max-h-[90vh] max-w-[90vw]"       // CSS로만 크기 제한
/>
```

- **문제**: 5MB짜리 원본 이미지도 그대로 다운로드
- **개선**: Lightbox용 중간 크기 이미지 + 원본은 별도 링크

---

## 5. 번들 사이즈

### 5-1. 무거운 라이브러리 현황

| 라이브러리 | 예상 크기 | 사용 페이지 | dynamic import | 조치 |
|-----------|----------|-----------|---------------|------|
| `react-email-editor` (Unlayer) | ~200KB+ | Admin 뉴스레터 | ✅ 적용됨 | 이중 import 정리 |
| `@tiptap/*` (13개 패키지) | ~150KB+ | Admin 이메일 | ✅ 적용됨 | 이중 import 정리 |
| `@mdxeditor/editor` | ~200KB+ | 콘텐츠 편집 | ❌ 정적 import | 🔴 dynamic 필요 |
| `recharts` | ~100KB+ | Dashboard 3개 | ❌ 정적 import | 🟡 dynamic 권장 |
| `framer-motion` + `motion` | ~100KB (중복?) | 애니메이션 | - | 🟡 중복 확인 필요 |
| `lucide-react` | ~80-120KB | 90개 파일 | tree-shaking | ✅ 정상 |

### 5-2. MDXEditor 정적 import 🔴

**파일**: `src/components/content/mdx-editor-wrapper.tsx`

```tsx
import {
  MDXEditor,
  headingsPlugin, listsPlugin, quotePlugin,
  thematicBreakPlugin, linkPlugin, linkDialogPlugin,
  imagePlugin, tablePlugin, markdownShortcutPlugin,
  toolbarPlugin,
  // ... 많은 UI 컴포넌트
} from "@mdxeditor/editor";
import "@mdxeditor/editor/style.css";    // 대규모 CSS
```

- **문제**: ~200KB 라이브러리가 콘텐츠 편집 페이지 진입 시 무조건 로드
- **개선**: `next/dynamic`으로 lazy load

### 5-3. framer-motion / motion 중복

**파일**: `package.json`

```json
"framer-motion": "^12.31.0",
"motion": "^12.31.0"
```

- **문제**: 두 패키지가 동일하거나 중복일 가능성 (motion은 framer-motion의 리브랜드)
- **개선**: 하나로 통합, 미사용 패키지 제거

---

## 6. Server Component vs Client Component 분리

### 6-1. 페이지별 평가

| 페이지 | 타입 | 평가 | 이슈 |
|--------|------|------|------|
| `/dashboard` | Server | 🟡 B+ | StudentAdSummary가 Client waterfall |
| `/questions` | Server | ✅ A | 서버 fetch + props 패턴 우수 |
| `/questions/[id]` | Server | ✅ A | 서버 fetch 우수 |
| `/questions/new` | Client | 🟡 B | 이미지 메모리 누수 |
| `/posts` | Server | ✅ A | useMemo 적절 |
| `/posts/[id]` | Mixed | 🟡 B | useCallback 의존성 문제 |
| `/admin/members` | Server | ✅ A | 서버 fetch 우수 |
| `/admin/answers` | Server | ✅ A | 서버 fetch 우수 |
| `/admin/accounts` | Client | 🟡 B | Client fetch → Server 전환 가능 |
| `/admin/content` | Client | 🟡 B | Client fetch → Server 전환 가능 |
| `/admin/email` | Client | 🟡 B | Client fetch → Server 전환 가능 |
| `/protractor` | Client | 🟡 B | 대규모 Client, 복잡한 상태 |

### 6-2. 불필요한 "use client"

| 파일 | 이유 | 조치 |
|------|------|------|
| `src/components/dashboard/StatCards.tsx` | 상태 없음, 순수 렌더링 | "use client" 제거 |
| `src/components/dashboard/ChannelBreakdown.tsx` | 상태 없음, 단순 데이터 표시 | "use client" 제거 |
| `src/components/layout/theme-toggle.tsx` | 라이트 모드만 사용 (CLAUDE.md 규칙) | 파일 자체 불필요 |

### 6-3. 메모이제이션 현황

- **useMemo**: 4개 파일, 적절하게 사용 ✅
- **useCallback**: 10개+ 파일, 대부분 적절 ✅ (PostDetailClient 제외)
- **React.memo**: 미사용 — 현재 구조에서는 불필요 ✅

---

## 개선 로드맵

### Phase 1: 즉시 (빌드 깨지지 않는 수정)

- [ ] 이메일 발송 API `.limit()` 추가 (`send/route.ts`)
- [ ] `embedAllContents()` 병렬화 (`Promise.all`)
- [ ] ImageGallery/ImageLightbox → `next/image` 또는 URL transform
- [ ] `new-question-form.tsx` 이미지 메모리 누수 cleanup 추가
- [ ] `PostDetailClient.tsx` useCallback 의존성 수정

### Phase 2: 번들 최적화

- [ ] MDXEditor → `next/dynamic` lazy load
- [ ] Recharts 차트 컴포넌트 → `next/dynamic` lazy load
- [ ] `motion` / `framer-motion` 중복 정리
- [ ] 이중 dynamic import 정리 (newsletter-edit-panel, email-split-editor)

### Phase 3: 아키텍처 개선

- [ ] Admin accounts/content/email 페이지 → Server Component 전환
- [ ] StudentAdSummary → 부모 Server에서 병렬 fetch
- [ ] `getQuestions()` 답변 집계 → DB GROUP BY
- [ ] `getWeeklyQuestionStats()` → DB RPC 함수
- [ ] `select("*")` → 필요 컬럼만 select

### Phase 4: 모니터링

- [ ] `next/bundle-analyzer` 도입
- [ ] Vercel Analytics로 LCP/CLS 추적
- [ ] StatCards/ChannelBreakdown "use client" 제거
