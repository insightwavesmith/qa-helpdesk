# T1. 정보공유 글 TOC 카드 스타일 미적용 — Plan

## 기능 ID
`t1-toc-card-style`

## 요구사항 요약
정보공유 글의 "이 글에서 다룰 내용:" 목차(TOC) 섹션이 카드 스타일 없이 plain 텍스트로 렌더링되는 버그 수정.

## 현재 상태 (AS-IS)
1. AI가 TOC를 넘버링 리스트로 생성 (`1. 주제\n2. 주제\n3. 주제`)
2. `post-body.tsx`의 `markdownToHtml()` 에서 ordered list (`^\d+\. (.+)$`) → `<li>` 변환은 수행하지만, `<ol>` 래핑 로직이 **no-op** (양쪽 분기 모두 `match` 그대로 반환)
3. 결과: bare `<li>` 요소들이 `<ol>` 없이 직접 `.post-body`에 삽입됨
4. CSS `.post-body > ul:first-of-type` / `ol:first-of-type` 규칙이 TOC가 아닌 본문의 다른 `<ul>`에 적용됨

## 기대 상태 (TO-BE)
1. TOC 섹션이 카드 스타일(배경 #f8fafc, 좌측 파란 보더, 패딩)로 표시
2. TOC 각 항목이 정렬된 리스트로 렌더링
3. 다른 본문 리스트에는 TOC 카드 스타일이 적용되지 않음

## 범위
- `src/components/posts/post-body.tsx` — `markdownToHtml()` ordered list 래핑 로직 수정
- `src/components/posts/post-body.css` — 필요 시 TOC 선택자 보강

## 범위 밖 (하지 말 것)
- 정보공유 글 본문 내용/구조 변경
- AI 생성 프롬프트 변경 (`curation/generate/route.ts`)
- `PostToc` 컴포넌트 변경 (별도 네비게이션용, 이 이슈와 무관)
- 다른 CSS 규칙 변경

## 성공 기준
- [ ] TOC 넘버링 리스트가 `<ol>` 태그로 올바르게 래핑됨
- [ ] `.post-body > ol:first-of-type` CSS 규칙이 TOC에 정확히 적용됨
- [ ] 본문 내 다른 리스트에 TOC 카드 스타일이 누출되지 않음
- [ ] `npm run build` 성공
- [ ] 기존 unordered list 렌더링 영향 없음

## 리스크
- **낮음**: 수정 범위가 `markdownToHtml()` 함수 내 1개 로직 블록으로 한정
- ordered list 래핑 로직 변경 시 다른 numbered list에도 `<ol>` 래핑이 적용되나, 이는 올바른 동작임

## 예상 작업량
- 구현: 30분 이내
- QA: 15분 (기존 글 렌더링 확인)
