# TASK.md — Phase B-3 UX 개선 2건

## T1: 게시 전에도 미리보기 활성화

### 현상
draft 상태의 콘텐츠에서 미리보기 버튼이 disabled 처리됨. Smith님 요청: 게시 전에도 미리보기가 가능해야 함.

### 해결
`src/components/content/post-edit-panel.tsx`에서 미리보기 버튼의 조건부 렌더링 제거:
- `status === "published"` 조건을 없애고, 항상 활성화된 미리보기 링크를 표시
- draft/published 모두 `/posts/${contentId}` 링크 (posts 페이지는 status 필터 없이 조회하므로 draft도 보임)

### 파일
- `src/components/content/post-edit-panel.tsx`

### 완료 기준
- draft 콘텐츠에서도 미리보기 클릭 → 새 탭에서 해당 글 정상 표시
- published 콘텐츠 미리보기도 기존과 동일하게 동작
- `npm run build` 성공

---

## T2: 에디터 좌우폭을 실제 표시 화면과 일치시키기

### 현상
MDXEditor의 좌우폭이 화면 전체를 차지함. 실제 정보공유 페이지(`/posts/[id]`)는 `max-w-4xl`로 제한됨. 에디터에서 보이는 모습과 실제 표시가 다름.

### 해결
`src/components/content/mdx-editor-wrapper.tsx`의 `contentEditableClassName`에서:
- `prose prose-sm max-w-none` → `prose prose-sm max-w-4xl mx-auto`로 변경
- 실제 포스트 페이지와 동일한 최대 폭 적용

### 파일
- `src/components/content/mdx-editor-wrapper.tsx`

### 완료 기준
- 에디터 내부 콘텐츠 폭이 `/posts/[id]` 페이지와 동일 (max-w-4xl)
- 에디터 테두리/배경은 그대로, 내부 텍스트 영역만 폭 제한
- `npm run build` 성공

---

## 실행 순서
T1 → T2 → 빌드 확인 → git add -A && git commit -m "fix: 미리보기 항상 활성화 + 에디터 폭 실제 화면 일치" && git push

## 금지사항
- 다른 파일 건드리지 않기
