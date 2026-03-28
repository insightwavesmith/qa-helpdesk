# T1. 정보공유 글 TOC 카드 스타일 미적용 — 설계서

## 1. 데이터 모델
변경 없음. 기존 `contents` 테이블의 `body_md` 필드에 저장된 마크다운을 클라이언트에서 렌더링하는 로직만 수정.

## 2. API 설계
변경 없음. 클라이언트 사이드 마크다운→HTML 변환 로직만 수정.

## 3. 컴포넌트 구조

### 3.1 버그 원인 분석

**파일**: `src/components/posts/post-body.tsx` — `markdownToHtml()` 함수

**문제 코드 (lines 104-111)**:
```typescript
// Ordered list
html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
// Wrap remaining orphan <li> in <ol>
html = html.replace(/(?<!<\/li>\s*)(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, (match) => {
  // If already wrapped in ul, skip
  if (html.indexOf(`<ul>${match}`) !== -1) return match;
  return match;  // ← BUG: 양쪽 분기 모두 match 반환. <ol> 래핑 안 됨.
});
```

**근본 원인**:
1. ordered list의 `<li>` → `<ol>` 래핑 로직이 **dead code** (양쪽 분기 모두 원본 반환)
2. AI가 TOC를 `1. 주제\n2. 주제\n3. 주제` 형식으로 생성
3. `<li>` 요소가 `<ol>` 없이 `.post-body` 직속 자식으로 삽입됨
4. CSS `.post-body > ol:first-of-type` 규칙이 매칭할 `<ol>`이 없음

### 3.2 수정 설계

**수정 파일**: `src/components/posts/post-body.tsx`

**수정 로직**: Ordered list 처리 부분(lines 104-111)을 unordered list와 동일한 패턴으로 교체.

**수정 전**:
```typescript
// Ordered list
html = html.replace(/^\d+\. (.+)$/gm, "<li>$1</li>");
// Wrap remaining orphan <li> in <ol>
html = html.replace(/(?<!<\/li>\s*)(<li>[\s\S]*?<\/li>)(?!\s*<li>)/g, (match) => {
  if (html.indexOf(`<ul>${match}`) !== -1) return match;
  return match;
});
```

**수정 후**:
```typescript
// Ordered list — <ul> 안에 포함되지 않은 numbered list를 <ol>로 래핑
html = html.replace(/^\d+\. (.+)$/gm, (match, content) => {
  // 이미 <ul> 안의 <li>로 변환된 것은 스킵
  return `<oli>${content}</oli>`;
});
// <oli> 태그를 <ol>로 래핑 (unordered list와 독립적으로 처리)
html = html.replace(/(<oli>[\s\S]*?<\/oli>)/g, (match) => {
  if (!match.startsWith("<ol>")) {
    return `<ol>${match}</ol>`;
  }
  return match;
});
// Merge consecutive ols
html = html.replace(/<\/ol>\s*<ol>/g, "");
// <oli> → <li> 최종 변환
html = html.replace(/<oli>/g, "<li>");
html = html.replace(/<\/oli>/g, "</li>");
```

**핵심 설계 결정**:
- **임시 태그 `<oli>`**: ordered list `<li>`와 unordered list `<li>`를 구분하기 위해 임시 태그 사용. unordered list 처리(lines 93-102)가 먼저 실행되므로, 이미 `<ul>` 안에 있는 `<li>`와 충돌 방지.
- unordered list 처리 로직(lines 93-102)은 변경하지 않음.
- `sanitizeHtml()`이 `<ol>`, `<li>` 태그를 허용하는지 확인 필요 (기존 `<ul>` 허용 중이므로 문제 없을 것).

### 3.3 CSS 확인

**파일**: `src/components/posts/post-body.css` (lines 206-222)

기존 CSS 규칙이 이미 올바름:
```css
.post-body > ul:first-of-type,
.post-body > ol:first-of-type {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 4px solid #3b82f6;
  border-radius: 0 8px 8px 0;
  padding: 20px 24px 20px 28px;
  margin: 24px 0 32px;
}
```

`<ol>` 래핑이 정상 동작하면 이 규칙이 TOC에 자동 적용됨. **CSS 변경 불필요**.

### 3.4 Paragraph 래핑 로직 확인

`markdownToHtml()` 하단의 paragraph 래핑 로직(lines 127-147)에서 `<ol>` 태그가 skip 대상에 포함되어 있는지 확인:

```typescript
if (/^<(h[23]|p|ul|ol|li|blockquote|pre|table|hr|img|div|figure)/.test(trimmed)) {
```

`ol`이 이미 포함되어 있으므로 `<ol>` 블록이 `<p>`로 재래핑되지 않음. **변경 불필요**.

## 4. 에러 처리
- 마크다운에 ordered list가 없는 경우: 아무 변환도 일어나지 않음 (기존 동작 유지)
- `sanitizeHtml()`에서 `<ol>` 태그가 제거되는 경우: sanitize 설정에 `ol` 추가 필요 → 확인 후 대응

## 5. 구현 순서

- [ ] 1. `src/components/posts/post-body.tsx` — ordered list 래핑 로직 수정
- [ ] 2. `sanitizeHtml()` 설정에서 `<ol>` 허용 확인
- [ ] 3. 로컬 빌드 확인 (`npm run build`)
- [ ] 4. 기존 정보공유 글 렌더링 검증 (TOC 카드 스타일 + 본문 리스트)
- [ ] 5. 스크린샷 QA (데스크탑 + 모바일)
