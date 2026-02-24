# TASK.md — 파트 1: 메타 배지 + 정보공유 렌더링 + 버그 수정 (2026-02-24)

> 작성: 모찌 | 승인: Smith님 ("그래 해라")
> 목업: https://mozzi-reports.vercel.app/reports/architecture/2026-02-24-meta-badge-mockup.html

---

## Part A — 메타 배지 + 자격증 적용 (5곳)

### T1. MetaBadge 공통 컴포넌트 생성

**신규 파일:** `src/components/meta-badge.tsx`

배지 SVG + 자격증 PNG을 재사용 가능한 컴포넌트로.
- Meta Business Partner 배지: `/public/images/meta-badge-light.svg` (원본 SVG 복사)
- Meta Certified 자격증 3종: `/public/images/meta-cert-*.png`
- 배지 클릭 → 메타 파트너 디렉토리 링크 (https://www.facebook.com/business/partner-directory/)
- 최소 높이 55px, clearspace 확보
- size prop: "sm" | "md" | "lg"
- variant prop: "badge-only" | "badge-with-certs" | "full" (배지+자격증+문구)

### T2. 로그인/회원가입 페이지 배지 추가

**파일:** `src/app/(auth)/login/page.tsx`, `src/app/(auth)/signup/page.tsx`

카드 하단에 MetaBadge 컴포넌트 (variant="badge-with-certs", size="sm")
문구: "자사몰사관학교는 Meta Business Partner입니다"

### T3. 사이트 푸터 신규 생성

**신규 파일:** `src/components/layout/site-footer.tsx`
**수정:** `src/app/(main)/layout.tsx` — 3개 레이아웃 분기에 SiteFooter 추가

- Meta Business Partner 배지 + 자격증 3종
- "대표 김성현 · Meta Certified Specialist 3종"
- © 2026 자사몰사관학교 All rights reserved.
- 배지 클릭 → 파트너 디렉토리 링크

### T4. 뉴스레터 이메일 시그니처

**파일:** `src/components/email/email-templates.ts` — `footerHtml()` 함수 수정

- 대표 프로필 블록: "김성현 | 자사몰사관학교 대표"
- Meta Business Partner 배지 (PNG, Supabase Storage 또는 public URL)
- "Meta Business Partner · Meta Certified Specialist 3종"
- 이메일 호환 table 레이아웃 (SVG 미지원 → PNG 사용)

### T5. 정보공유 글 하단 저자 프로필 카드

**파일:** `src/app/(main)/posts/[id]/page.tsx` 또는 `src/components/posts/post-body.tsx`

- 글 본문 아래에 저자 카드
- "김성현 · 자사몰사관학교 대표"
- Meta Business Partner 배지 + Certified 3종
- CTA: "자사몰사관학교 더 알아보기 →"

---

## Part B — 정보공유 렌더링 버그 수정

### T6. 마크다운 blockquote 파서 수정

**파일:** `src/components/posts/post-body.tsx` — `markdownToHtml()` 함수

현재: `> 인용문` → `<p>&gt; 인용문</p>` (변환 안 됨)
수정: `> 인용문` → `<blockquote>인용문</blockquote>`
CSS는 이미 `post-body.css`에 완성됨 (#F75D5D 좌측 바, #FFF5F5 배경)

### T7. CTA 링크 버튼 변환

**파일:** `src/components/posts/post-body.tsx` — `markdownToHtml()` 함수

현재: "→" 포함 링크가 일반 `<p>` 태그로 렌더링
수정: `[텍스트 →](URL)` → `<a class="cta-link" href="URL">텍스트 →</a>`
CSS는 이미 `post-body.css`에 완성됨 (배경 #F75D5D, 흰 텍스트)

### T8. 정보공유 이미지 플레이스홀더 처리 개선

**파일:** `src/components/posts/post-body.tsx`

현재: placehold.co 한글 텍스트 깨짐 (mojibake)
수정: 한글 → encodeURIComponent 처리, 또는 Unsplash API 연동 (UNSPLASH_ACCESS_KEY 등록 완료)

---

## Part C — 버그 수정 3건

### B1. 뉴스레터 발송완료 → 성과 탭 미표시

발송 완료했는데 뉴스레터 탭에 성과가 안 나옴.
관련 파일 확인 후 수정.

### B2. 조교 역할 → 관리자 탭 미노출

조교(assistant)가 되면 관리자 탭이 보여야 하는데 안 보임.
`src/app/(main)/layout.tsx` 또는 미들웨어에서 역할 분기 확인.

### B3. 조교 계정 → 좌측 관리 메뉴 미노출

조교로 로그인해도 왼쪽 사이드바에 관리 탭이 안 뜸.
`src/components/dashboard/Sidebar.tsx` 역할 체크 로직 확인.

---

## 검증

1. `npm run build` 성공
2. 로그인 페이지에 배지 표시
3. 푸터 모든 페이지에 표시
4. 정보공유 글에서 blockquote 빨간 바 렌더링
5. 조교 계정으로 관리 메뉴 접근 가능
6. 커밋 + 푸시

---

## 리뷰 결과

> 리뷰어: 에이전트팀 | 날짜: 2026-02-24 19:57 KST | Plan file: crystalline-wishing-pinwheel.md

### 즉시 수정 가능 (의존성 없음)
- **B1** `analytics/route.ts:29` — role 체크 1줄 수정 (`assistant` 추가)
- **B2** `layout.tsx:52` — `usesSidebarLayout` 조건 1줄 수정
- **B3** `Sidebar.tsx:166` — admin 메뉴 role 체크 1줄 수정
- **T6** `post-body.tsx` — blockquote 변환을 이스케이프 **전**으로 이동 (Option A)

### 이미지 파일 필요 (T1~T5 블로킹)
- `meta-badge-light.svg` — public/images/ 필요
- `meta-cert-ai-performance.png`, `meta-cert-measurement.png`, `meta-cert-technical.png` — 3종
- **이미지 없으면 T1~T5 전체 블로킹**

### 검증 필요
- **T7** — regex 자체 정상, 실제 동작 여부 테스트 후 결정 (아마 이미 동작 중)
- **T8** — Unsplash API 이미 연동됨, fallback 빈도 낮음 → 큰 문제 아닐 수 있음

## 리뷰 보고서
Plan file: `~/.claude/plans/crystalline-wishing-pinwheel.md`
