# TASK.md — 에디터 테이블 스타일 미리보기와 일치

## 문제
MDXEditor에서 표(table)가 Tailwind `prose` 기본 스타일로 렌더링됨.
실제 미리보기 페이지(`/posts/[id]`)에서는 `post-body.css`로 테이블이 `width: 100%`, 좌측정렬, 테두리 있게 표시됨.
에디터에서 보이는 것과 실제 게시물이 달라서 WYSIWYG 원칙에 위배.

## 해결
`src/components/content/mdx-editor-wrapper.tsx`에서 `post-body.css`의 테이블 스타일을 에디터에도 적용.

### 방법
1. `mdx-editor-wrapper.tsx`의 `contentEditableClassName`에 `post-body` 클래스를 추가:
   - `"prose prose-sm max-w-4xl mx-auto px-4 py-3 focus:outline-none post-body"` 로 변경
2. `post-body.css` import를 `mdx-editor-wrapper.tsx` 상단에 추가:
   - `import "@/components/posts/post-body.css";`

이렇게 하면 에디터 내부에 post-body CSS가 적용되어 테이블/블록인용/코드 등 모든 스타일이 미리보기와 동일해짐.

### 주의
- `prose` 클래스와 `post-body` CSS가 충돌하는 부분이 있을 수 있음. 테이블/인용/코드에서 post-body가 더 구체적이므로 우선 적용될 것.
- prose의 font-size/line-height와 post-body의 font-size(16px)/line-height(1.8)이 다를 수 있음. prose-sm이 더 작으므로 `prose-sm` → `prose`로 변경 검토.

### 파일
- `src/components/content/mdx-editor-wrapper.tsx`

### 완료 기준
- 에디터에서 테이블이 width 100%, 좌측정렬, 테두리 있게 표시
- 미리보기 페이지와 에디터의 테이블 모양이 동일
- `npm run build` 성공

## 실행 순서
수정 → 빌드 확인 → git add -A && git commit -m "fix: 에디터 테이블 스타일 미리보기와 일치 (post-body.css 적용)" && git push
