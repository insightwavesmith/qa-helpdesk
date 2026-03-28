# B2. 정보공유 CSS 미세 조정 — 설계서

> 작성: 2026-03-02
> 참조: T4(t4-content-css-readability.design.md), 목업(docs/mockups/readability-ab.html)

## 1. 데이터 모델
- 해당 없음 (DB 변경 없음)

## 2. API 설계
- 해당 없음 (API 변경 없음)

## 3. 컴포넌트 구조

### 3-1. post-body.css 변경

**파일**: `src/components/posts/post-body.css`

#### 변경 1: 본문 자간 (letter-spacing)

```css
/* Before */
.post-body {
  font-size: 16px;
  line-height: 1.8;
  color: #333333;
  word-break: keep-all;
  overflow-wrap: break-word;
}

/* After — letter-spacing 추가 */
.post-body {
  font-size: 16px;
  line-height: 1.8;
  color: #333333;
  word-break: keep-all;
  overflow-wrap: break-word;
  letter-spacing: -0.01em;
}
```

#### 변경 2: p 단락 간격

```css
/* Before */
.post-body p {
  margin-bottom: 16px;
}

/* After */
.post-body p {
  margin-bottom: 24px;
}
```

#### 변경 3: 이미지 상하 여백

```css
/* Before — 이미지 기본 여백 없거나 최소 */
.post-body img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

/* After — 상하 margin 추가 */
.post-body img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin-top: 24px;
  margin-bottom: 24px;
}
```

> 주의: `.post-image-figure img`에도 같은 규칙 적용 확인. figure 내 img는 figure의 margin에 의해 이미 여백이 있을 수 있으므로, 중복 적용 시 `.post-image-figure img { margin-top: 0; margin-bottom: 0; }` 으로 figure 내부는 예외 처리.

```css
/* figure 내부 이미지는 figure 자체 margin으로 처리 */
.post-body .post-image-figure {
  margin-top: 24px;
  margin-bottom: 24px;
}
.post-body .post-image-figure img {
  margin-top: 0;
  margin-bottom: 0;
}
```

### 3-2. 프로필 카드 구분선 강화

**파일**: `src/components/posts/author-profile-card.tsx`

**현재 상태**:
```tsx
<div className="border-t border-b border-slate-200 py-6 mt-8">
```

**수정 후**:
```tsx
<div className="border-t-2 border-b border-gray-200 py-6 mt-10">
```

**변경 상세**:
| 속성 | Before | After | 이유 |
|------|--------|-------|------|
| border-top 두께 | `border-t` (1px) | `border-t-2` (2px) | 구분선 강조 |
| border-top 색상 | `border-slate-200` | `border-gray-200` (#e5e7eb) | TASK.md 지정 색상 |
| margin-top | `mt-8` (32px) | `mt-10` (40px) | TASK.md 지정 간격 |

> border-bottom은 기존 1px 유지 (TASK.md에 하단 구분선 변경 요구 없음)

## 4. 에러 처리
- CSS 변경은 에러 발생 가능성 없음
- 다른 페이지 영향: `.post-body` 셀렉터로 스코핑되어 정보공유 상세 페이지에만 적용

## 5. 구현 순서
- [ ] `post-body.css` — `.post-body`에 `letter-spacing: -0.01em` 추가
- [ ] `post-body.css` — `.post-body p` margin-bottom `16px` → `24px`
- [ ] `post-body.css` — `.post-body img` margin-top/bottom `24px` 추가 (figure 내 예외 처리 포함)
- [ ] `author-profile-card.tsx` — border-t-2 + border-gray-200 + mt-10 변경
- [ ] `npm run build` 성공 확인

## 6. 변경 요약

| CSS 속성 | Before | After | 파일 |
|----------|--------|-------|------|
| `.post-body` letter-spacing | (없음) | `-0.01em` | post-body.css |
| `.post-body p` margin-bottom | `16px` | `24px` | post-body.css |
| `.post-body img` margin | (없음/최소) | `24px 0` | post-body.css |
| 프로필 카드 border-top | `1px` | `2px solid #e5e7eb` | author-profile-card.tsx |
| 프로필 카드 margin-top | `32px` (mt-8) | `40px` (mt-10) | author-profile-card.tsx |

## 7. 영향 범위

| 파일 | 변경 유형 | 위험도 |
|------|----------|--------|
| `src/components/posts/post-body.css` | CSS 속성 3개 수정/추가 | 낮음 |
| `src/components/posts/author-profile-card.tsx` | Tailwind 클래스 변경 | 매우 낮음 |

## 8. 변경하지 않는 값 (명시)

| 속성 | 현재값 | 변경 |
|------|--------|------|
| font-size | 16px | 유지 |
| line-height | 1.8 | 유지 |
| h2 margin-top | 48px | 유지 |
| blockquote 스타일 | T4에서 설정 완료 | 유지 |
