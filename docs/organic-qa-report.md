# 오가닉 채널 추가 영향도 QA 리포트

- **작성일**: 2026-03-13
- **검증 대상**: 오가닉 채널 기능 추가 (`/admin/organic`)
- **프로젝트**: `/Users/smith/projects/qa-helpdesk` (실체: bscamp)

---

## 전체 요약

| 항목 | 결과 | 비고 |
|------|------|------|
| 1. 사이드바 | ⚠️ WARN | app-sidebar.tsx는 정상이나 실제 미사용 (주의 참고) |
| 2. 콘텐츠 관리 탭 | ✅ PASS | 기존 4개 탭 + curation 9개 컴포넌트 변경 없음 |
| 3. 라우팅 | ✅ PASS | 충돌 없음, layout 영향 없음 |
| 4. 타입 | ✅ PASS | 이름 충돌 없음, 기존 content.ts 변경 없음 |
| 5. Server Actions | ✅ PASS | 기존 함수 override 없음, 기존 파일 변경 없음 |
| 6. DB 마이그레이션 | ✅ PASS | 신규 CREATE만, 기존 테이블 ALTER/DROP 없음 |
| 7. 빌드 검증 | ✅ PASS | tsc 에러 0, build 성공 (lint 경고는 기존 이슈) |

---

## 1. 사이드바 (`src/components/layout/app-sidebar.tsx`)

**결과: ⚠️ WARN (코드 자체는 정상 / 실제 사용 여부 주의)**

### 체크 결과

- ✅ **기존 메뉴 항목 그대로**: mainNavItems 6개(대시보드, Q&A, 정보 공유, 공지사항, 총가치각도기, 설정), adminNavItems 기존 항목 전부 유지됨
- ✅ **isActive 충돌 없음**: `pathname === item.href || pathname.startsWith(item.href + "/")` 로직에서 `/admin/organic`은 다른 경로와 prefix 충돌 없음
- ✅ **Share2 import 정상**: lucide-react에서 정상 import됨

### ⚠️ 주의 사항

`app-sidebar.tsx`는 현재 **실제 앱에서 사용되지 않음**.

- 실제 `(main)/layout.tsx`는 `DashboardSidebar` (`src/components/dashboard/Sidebar.tsx`) 사용
- `DashboardSidebar`에는 "오가닉 채널" 메뉴 항목이 **없음**
- 따라서 사이드바 UI에서는 오가닉 채널로 진입 불가 → **URL 직접 입력으로만 접근 가능**
- 기능 자체는 정상 동작하나, 사용자 접근성 문제

```
실제 실행 사이드바: src/components/dashboard/Sidebar.tsx
  → adminNavItems에 "오가닉 채널" 없음

tasks에서 참조한 사이드바: src/components/layout/app-sidebar.tsx
  → adminNavItems에 "오가닉 채널" 추가됨 (사용 안 됨)
```

---

## 2. 콘텐츠 관리 탭 (`src/app/(main)/admin/content/page.tsx`)

**결과: ✅ PASS**

### 체크 결과

- ✅ **기존 4개 탭 코드 변경 없음**
  - `큐레이션` (value="curation") ✅
  - `콘텐츠` (value="contents") ✅
  - `정보공유` (value="posts") ✅
  - `이메일` (value="email") ✅

- ✅ **curation 컴포넌트 9개 수정 없음**
  - `curation-card.tsx`
  - `curation-tab.tsx`
  - `curation-view.tsx`
  - `curriculum-view.tsx`
  - `deleted-section.tsx`
  - `generate-preview-modal.tsx`
  - `info-share-tab.tsx`
  - `pipeline-sidebar.tsx`
  - `topic-map-view.tsx`

---

## 3. 라우팅

**결과: ✅ PASS**

### 체크 결과

- ✅ **기존 `/admin/*` 경로와 충돌 없음**
  - `/admin/organic`은 신규 디렉토리로 추가됨
  - 기존 경로들(`/admin/members`, `/admin/content`, `/admin/answers`, etc.)과 prefix 중복 없음

- ✅ **`(main)` layout 영향 없음**
  - `src/app/(main)/layout.tsx` 내 organic 관련 코드 전무
  - layout 구조/컴포넌트 변경 없음

- ✅ **`/admin/layout.tsx` 영향 없음**
  - 권한 체크(admin/assistant)만 처리 → 기존 로직 그대로

- ✅ **빌드 시 라우트 정상 생성**
  ```
  ├ ƒ /admin/organic
  └ ├ ƒ /admin/organic/[id]
  ```

---

## 4. 타입 (`src/types/`)

**결과: ✅ PASS**

### 체크 결과

- ✅ **기존 `content.ts` 변경 없음**
  - ContentType, ContentCategory, Content, Distribution, EmailLog, ContentSource 등 모두 유지

- ✅ **새로운 `organic.ts` 타입 이름 충돌 없음**
  - 신규 타입: `OrganicChannel`, `OrganicStatus`, `OrganicLevel`, `OrganicPost`, `CreateOrganicPostInput`, `UpdateOrganicPostInput`, `OrganicStats`, `KeywordStat`
  - 기존 `index.ts`, `content.ts`, `competitor.ts`와 이름 충돌 없음 (모두 "Organic" prefix 또는 고유 이름)

---

## 5. Server Actions

**결과: ✅ PASS**

### 체크 결과

- ✅ **`src/actions/curation.ts` 변경 없음** (기존 함수 16개 그대로)
- ✅ **`src/actions/contents.ts` 변경 없음** (기존 함수 14개 그대로)
- ✅ **새로운 `src/actions/organic.ts`가 기존 함수 override 하지 않음**
  - organic.ts export: `getOrganicPosts`, `getOrganicPost`, `createOrganicPost`, `updateOrganicPost`, `publishOrganicPost`, `deleteOrganicPost`, `getOrganicStats`, `getKeywordStats`
  - 기존 actions 파일들의 함수 이름과 전혀 겹치지 않음

- ⚠️ **참고**: `organic.ts`에서 Supabase 클라이언트를 `as any`로 우회 처리 중
  - 이유: `organic_posts` 테이블이 아직 `database.ts`에 미등록 (마이그레이션 실행 전)
  - 기능적 문제는 아니나 migration 실행 후 타입 등록 필요 (주석으로 명시됨)

---

## 6. DB 마이그레이션 (`supabase/migrations/organic-channel.sql`)

**결과: ✅ PASS**

### 체크 결과

- ✅ **기존 테이블 ALTER/DROP 없음**
  - 파일 내 모든 DDL은 신규 테이블 CREATE만:
    - `organic_posts`
    - `organic_analytics`
    - `keyword_stats`
    - `keyword_rankings`
    - `seo_benchmarks`
    - `organic_conversions`
  - `ALTER TABLE` 명령은 신규 생성 테이블에 대한 RLS 활성화(`ENABLE ROW LEVEL SECURITY`)만

- ✅ **RLS 정책 이름 기존과 충돌 없음**
  - organic 마이그레이션 정책 이름: `"admin_only"` (6개 테이블)
  - 기존 마이그레이션에서 `"admin_only"` 정책명 사용 없음 (grep 확인)
  - PostgreSQL에서 RLS 정책 이름은 테이블 스코프이므로 동일 이름 다중 테이블 적용 허용

---

## 7. 빌드 검증

**결과: ✅ PASS**

### `npx tsc --noEmit`

```
결과: 출력 없음 (에러 0)
```
✅ TypeScript 타입 에러 없음

### `npm run lint` (eslint)

```
결과: ✖ 85 problems (24 errors, 61 warnings)
```
⚠️ **에러가 있으나 모두 기존 파일의 기존 이슈**

- organic 관련 파일에서 발생한 에러: **0개**
- `npx eslint src/actions/organic.ts src/types/organic.ts "src/app/(main)/admin/organic/"` → 출력 없음 (에러 0)
- 기존 에러 위치: `scripts/`, `src/actions/contents.ts`, `src/actions/curation.ts`, `src/app/(auth)/onboarding/page.tsx` 등
- 에러 종류: `@typescript-eslint/no-require-imports` (require 스타일 import), `@typescript-eslint/no-explicit-any`, React setState 경고

> 기존 코드베이스에 이미 존재하던 이슈. organic 추가로 인해 새로 발생한 에러 없음.

### `npx next build`

```
✓ Compiled successfully in 3.4s
✓ Generating static pages using 13 workers (76/76) in 402.3ms
```
✅ 빌드 성공. 신규 라우트 정상 컴파일됨:
```
├ ƒ /admin/organic
└ ├ ƒ /admin/organic/[id]
```

---

## 전체 결론

오가닉 채널 추가로 인한 **기존 기능 영향 없음**. 빌드 성공.

### Action Required (기능 개선)

1. **사이드바 접근성** (WARN): `DashboardSidebar` (`Sidebar.tsx`)에 "오가닉 채널" 메뉴 항목 추가 필요. 현재는 URL 직접 접근만 가능.
2. **DB 마이그레이션 실행 후**: `src/types/database.ts`에 `organic_posts`, `organic_analytics`, `keyword_stats` 등 신규 테이블 타입 등록 → `organic.ts`의 `as any` 제거.
