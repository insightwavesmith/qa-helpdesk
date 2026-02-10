# TASK.md — Phase B-3 버그 수정 (2건)

## 컨텍스트
콘텐츠 허브 Phase B-2 QA 후 Smith님 피드백으로 발견된 버그 2건.

---

## T1: 정보공유 미리보기 링크 수정 (P0)

### 현상
정보공유 탭의 "미리보기" 링크가 `/posts?content_id=xxx`로 되어 있음.
`/posts` 페이지는 `content_id` 파라미터를 처리하지 않아 목록만 보임.

### 원인
`post-edit-panel.tsx` 라인 141: `href={/posts?content_id=${contentId}}`
개별 글 상세는 `/posts/[id]` 라우트인데, 여기서 `[id]`는 contents 테이블의 id가 아닌 posts 테이블의 id임.

### 해결 방향
1. contents 테이블의 id로 해당 글의 posts 테이블 slug/id를 조회해서 `/posts/[slug]`로 링크
2. 또는 `/posts?content_id=xxx` 라우트에서 리다이렉트 처리
3. **가장 간단**: `[id]/page.tsx`에서 content 조회 시 posts 정보도 함께 가져와서 PostEditPanel에 `postSlug` prop 전달

### 파일
- `src/components/content/post-edit-panel.tsx` — 미리보기 링크 수정
- `src/app/(main)/admin/content/[id]/page.tsx` — postSlug 전달 (필요시)

### 완료 기준
- 미리보기 클릭 → 해당 글의 상세 페이지 (/posts/[id]) 정상 이동
- 게시되지 않은 글(draft)이면 미리보기 버튼 비활성화 또는 안내 표시
- `npm run build` 성공

---

## T2: 게시취소 후 편집 → 저장 불가 버그 (P0)

### 현상
게시완료 상태의 글에서:
1. "게시 취소" 클릭 → status가 draft로 변경됨
2. 에디터에서 글 내용 수정
3. "저장" 버튼이 활성화되지 않음 (disabled 상태 유지)

### 원인
`post-edit-panel.tsx`의 dirty 판단 로직:
- `handleChange`에서 `setDirty(md !== lastSavedRef.current)` 비교
- 게시취소 후 `onStatusChange` → `refreshContent` → 부모 컴포넌트가 content 재로드
- content 재로드 시 `initialBodyMd` prop이 변경되지만, `lastSavedRef`는 이전 값 유지
- 또는 MDXEditor가 `mdContent` useMemo 변경으로 리마운트 → `handleChange` 초기 호출이 dirty를 false로 설정

### 해결 방향
- `useEffect`로 `initialBodyMd` 변경 시 `lastSavedRef.current`를 업데이트
- 또는 MDXEditor의 `key` prop에 `initialBodyMd` 해시 사용하여 리마운트 시 정확한 기준값 사용
- 핵심: 외부에서 content가 새로고침될 때 dirty 기준값(lastSavedRef)도 함께 리셋

### 파일
- `src/components/content/post-edit-panel.tsx` — lastSavedRef 동기화 + dirty 로직

### 완료 기준
- 게시취소 → 글 수정 → 저장 버튼 활성화 → 저장 성공
- 게시 → 글 수정 → 저장 버튼 활성화 → 저장 성공
- 페이지 새로고침 없이 연속 동작 정상
- `npm run build` 성공

---

## T3: 뉴스레터 이메일 템플릿에서 썸네일 이미지 제거 (P1)

### 현상
뉴스레터 이메일 미리보기에 정보공유 헤더 이미지(thumbnailUrl)가 그대로 표시됨.
이 이미지는 이메일에 쓰이면 안 됨 — BS CAMP 텍스트 로고 헤더만 있으면 됨.

### 해결
1. `newsletter-edit-panel.tsx`에서 `newsletterTemplate()` 호출 시 `thumbnailUrl` 제거
2. `email-templates.ts`의 `newsletterTemplate()`에서 `bannerHtml` 관련 코드 제거

### 파일
- `src/components/content/newsletter-edit-panel.tsx` — thumbnailUrl prop 제거
- `src/lib/email-templates.ts` — bannerHtml 코드 제거

### 완료 기준
- 뉴스레터 미리보기에 BS CAMP 텍스트 헤더만 표시 (이미지 없음)
- `npm run build` 성공

---

## T4: AI 요약 프롬프트 개선 — 텍스트 CTA 제거 (P1)

### 현상
AI 요약 결과에 `**[전체 글에서 자세히 확인하세요 →]**` 텍스트 CTA가 포함됨.
이메일 템플릿에 이미 CTA 버튼이 있으므로 중복.

### 해결
`src/app/api/admin/content/summarize/route.ts`의 프롬프트에서:
- "마지막에 **[전체 글에서 자세히 확인하세요 →]** CTA 문구" 제거
- 대신: "CTA 문구는 포함하지 않기 (이메일 템플릿에 별도 버튼 있음)"

### 파일
- `src/app/api/admin/content/summarize/route.ts` — 프롬프트 수정

### 완료 기준
- AI 요약 결과에 텍스트 CTA 없음
- `npm run build` 성공

---

## 실행 순서
T1 → T2 → T3 → T4 (각 태스크 후 빌드 확인)

## 금지사항
- main 브랜치 직접 작업 (경고 무시 OK — 현재 워크플로우)
- 다른 파일 건드리지 않기
- 테스트 데이터 남기지 않기
