# TASK — Phase 1: 통합 콘텐츠 파이프라인 기반 정비

> 설계서: `projects/active/unified-content-pipeline.md` 참고
> 현재 상태: posts 테이블(정보공유)과 contents 테이블(소스)이 분리됨 → contents 하나로 통합

---

## T1: DB 마이그레이션 SQL 작성 (@backend-dev)

`supabase/migrations/00007_unified_content.sql` 생성:

```sql
-- 1) contents 테이블 확장
ALTER TABLE contents ADD COLUMN IF NOT EXISTS email_summary TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS email_subject TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE contents ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS view_count INT DEFAULT 0;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS like_count INT DEFAULT 0;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;
ALTER TABLE contents ADD COLUMN IF NOT EXISTS ai_source TEXT;

-- 2) 카테고리 업데이트 (education, news, case_study)
-- 기존 contents의 education → 유지, news → 유지
-- posts의 info → education, notice → news, webinar → case_study

-- 3) posts 데이터를 contents로 이관
-- posts에 있는 10개 published 글을 contents에 복사
-- title, content(→body_md), category(매핑), view_count, is_pinned, created_at
INSERT INTO contents (title, body_md, summary, category, status, is_pinned, view_count, like_count, published_at, created_at, updated_at)
SELECT 
  p.title,
  p.content,
  LEFT(p.content, 200),
  CASE p.category 
    WHEN 'info' THEN 'education'
    WHEN 'notice' THEN 'news'
    WHEN 'webinar' THEN 'case_study'
    ELSE 'education'
  END,
  'published',
  p.is_pinned,
  p.view_count,
  p.like_count,
  p.published_at,
  p.created_at,
  p.updated_at
FROM posts p
WHERE p.is_published = true
ON CONFLICT DO NOTHING;

-- 4) 기존 contents의 published 상태 확인
-- status='published'인 것만 정보공유에 노출

-- 5) 인덱스
CREATE INDEX IF NOT EXISTS idx_contents_published_at ON contents(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_contents_is_pinned ON contents(is_pinned);
```

**주의:** 이건 SQL 파일 작성만. 실제 실행은 모찌가 Supabase에서 직접.
**완료 기준:** 마이그레이션 SQL 파일 생성, 문법 오류 없음

---

## T2: 백엔드 — 정보공유 데이터 소스 변경 (@backend-dev)
**dependsOn: T1**

현재 `src/actions/posts.ts`의 `getPosts()`가 posts 테이블 읽음 → contents 테이블로 변경

### 변경 파일:
1. **`src/actions/posts.ts`** — `getPosts()` 수정:
   - `from("posts")` → `from("contents")`
   - `eq("is_published", true)` → `eq("status", "published")`
   - `content` 컬럼 → `body_md` 컬럼
   - category 매핑: education, news, case_study
   - select에 새 컬럼 추가 (email_summary, images 등)

2. **`src/actions/posts.ts`** — `getPostById()` 수정:
   - 같은 패턴으로 contents 테이블에서 읽기

3. **`src/types/index.ts`** — PostCategory 타입 변경:
   - `"info" | "notice" | "webinar"` → `"education" | "news" | "case_study"`

4. **`src/app/(main)/dashboard/student-home.tsx`** — latestPosts 쿼리도 contents로

**완료 기준:** 정보공유 페이지가 contents 테이블에서 데이터를 읽고, 기존과 동일하게 표시

---

## T3: 프론트엔드 — 카테고리 + 레이아웃 (@frontend-dev)

### 3-a: 카테고리 변경
**파일:** `src/components/posts/post-card.tsx`
```typescript
// Before
export const categoryConfig = {
  info: { label: "교육", bg: "#FFF5F5", text: "#F75D5D" },
  notice: { label: "소식", bg: "#EFF6FF", text: "#3B82F6" },
  webinar: { label: "웨비나", bg: "#FFF7ED", text: "#F97316" },
};

// After
export const categoryConfig = {
  education: { label: "교육", bg: "#FFF5F5", text: "#F75D5D" },
  news: { label: "소식", bg: "#EFF6FF", text: "#3B82F6" },
  case_study: { label: "고객사례", bg: "#FFF7ED", text: "#F97316" },
};
```

**파일:** `src/components/posts/category-tabs.tsx` — 탭 라벨 변경
**파일:** `src/app/api/og/route.tsx` — OG 이미지 카테고리 매핑 변경

### 3-b: 레이아웃 조정
**파일:** `src/app/(main)/posts/posts-redesign-client.tsx`

현재: 교육 섹션 3개 → 뉴스레터 → 최신 콘텐츠 (나머지)
변경:
1. 맨 위: **베스트 콘텐츠 1개** (is_pinned, 좌우로 길게) — 이미 `PostCard featured` 있음
2. 그 아래: **최신 3개 카드**
3. 카테고리 섹션: **고객사례 / 교육 / 소식** 순서
4. 뉴스레터 CTA (하단)

### 3-c: PostCard 데이터 인터페이스 변경
`content` → `body_md`, category 타입 변경

**완료 기준:** 정보공유 페이지에 교육/소식/고객사례 탭 + 베스트 hero + 3카드 + 카테고리 섹션

---

## T4: 경쟁 가설 — 통합 에디터 초기 설계 (@frontend-dev vs @backend-dev)

> **경쟁 가설 패턴 적용.** 같은 문제를 두 접근법으로 설계. 코드가 아니라 설계 문서(md)로 비교.

### 문제: 정보공유 글쓰기 + 이메일 작성을 하나의 에디터로 통합하는 최선의 방법은?

### Hypothesis A (@frontend-dev): 기존 에디터 확장
- 현재 `email-split-editor.tsx` (TipTap + 미리보기 분할) 을 확장
- 상단에 [정보공유] [이메일] 탭 추가
- 정보공유 탭: 마크다운 미리보기
- 이메일 탭: react-email 미리보기
- 장점: 기존 코드 재사용, 빠른 구현
- 단점: 이메일 에디터에 종속된 구조
- **산출물:** `docs/02-design/unified-editor-hypothesis-a.md` (구조도 + 컴포넌트 트리 + 장단점)

### Hypothesis B (@backend-dev): 새 통합 에디터
- `/admin/editor/[id]` 새 라우트
- 콘텐츠 중심 설계 (contents 테이블 직접 CRUD)
- 채널은 "배포 옵션"으로 분리 (체크박스: 정보공유 / 이메일)
- 각 채널별 미리보기 패널
- 장점: 확장성 (카카오, SNS 등 추가 용이)
- 단점: 기존 코드 재사용 적음, 구현 시간 김
- **산출물:** `docs/02-design/unified-editor-hypothesis-b.md` (구조도 + 컴포넌트 트리 + 장단점)

**완료 기준:** 두 설계 문서 모두 작성. 모찌가 비교 후 Smith님에게 보고.

---

## T5: 코드 리뷰 + 빌드 (@code-reviewer)
**dependsOn: T1, T2, T3**

- TypeScript 타입 에러 없는지 확인
- category 타입 일관성 (education/news/case_study 전체)
- `npm run build` 성공
- 미사용 import 정리

**완료 기준:** build 성공, Critical 이슈 0건

---

## T6: Git 커밋 + 푸시 (@code-reviewer)
**dependsOn: T5**

- `git add -A`
- `git commit -m "feat: 통합 콘텐츠 파이프라인 Phase 1 — DB통합, 카테고리변경, 레이아웃"`
- `git push origin main`

---

## 작업 규칙
- 기존 파일 최소 변경, 새 파일 선호
- SQL 마이그레이션은 파일 작성만 (실행은 모찌가)
- 경쟁 가설은 코드가 아니라 설계 문서(md)로 비교
- posts 테이블 관련 코드는 삭제하지 말고, contents로 리다이렉트만
- `body_md` 컬럼을 사용하되, 기존 `content` 필드명은 인터페이스에서 매핑
