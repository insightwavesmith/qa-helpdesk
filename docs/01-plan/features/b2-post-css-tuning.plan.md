# B2. 정보공유 CSS 미세 조정 — Plan

> 작성: 2026-03-02
> 선행 작업: T4(content-css-readability) — completed (Match Rate 80%)

## 1. 개요
- **기능**: 정보공유 글 상세 페이지 가독성 미세 조정
- **해결하려는 문제**: T4에서 대규모 CSS 개선을 했으나, 단락 간격·자간·이미지 여백·프로필 카드 구분선이 아직 최적이 아님
- **수정 대상 파일**: `src/components/posts/post-body.css`

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **p 단락 간격 확대** — `margin-bottom: 16px` → `24px`
- FR-02: **본문 자간 조정** — `letter-spacing: -0.01em` (post-body 전체)
- FR-03: **이미지 상하 여백** — `img` 상하 `margin: 24px`
- FR-04: **프로필 카드 구분선 강화** — `border-top: 2px solid #e5e7eb` + `margin-top: 40px`

### 비기능적 요구사항
- font-size (16px), line-height (1.8) 변경 금지 — 현재 적절
- h2 margin-top (48px) 변경 금지 — 현재 적절
- 다른 페이지 CSS에 영향 없어야 함 (`.post-body` 스코프)

## 3. 범위

### 포함
- `src/components/posts/post-body.css` — CSS 속성 4개 수정/추가

### 제외
- font-size, line-height 변경
- h2 margin-top 변경
- post-body.tsx (마크다운 변환 로직) 변경
- 다른 페이지 CSS

## 4. 성공 기준
- [ ] `.post-body p`의 margin-bottom이 24px
- [ ] `.post-body`의 letter-spacing이 -0.01em
- [ ] `.post-body img`의 상하 margin이 24px
- [ ] 프로필 카드(AuthorProfileCard) 상단 구분선이 2px solid #e5e7eb + margin-top 40px
- [ ] font-size, line-height, h2 margin-top 변경 없음
- [ ] 다른 페이지에 CSS 영향 없음
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `post-body.css`에서 `.post-body p` margin-bottom 변경
2. `.post-body`에 letter-spacing 추가
3. `.post-body img` (또는 `.post-body figure img`) margin 추가
4. 프로필 카드 구분선은 `author-profile-card.tsx`의 border-top 강화 (CSS 또는 Tailwind)
5. 빌드 확인
