# T2: 답변 수정 기능 추가

## 이게 뭔지
답변 작성자(관리자/조교/수강생)가 이미 게시된 답변을 수정할 수 있는 기능

## 왜 필요한지
현재 답변 수정 기능이 관리자 리뷰 페이지(`/admin/answers`)에만 있고, `requireStaff()` 인증이 필요. 질문 상세 페이지에서는 수정 불가하여 오타나 내용 보완 시 삭제 후 재작성해야 함.

## 현재 상태
- `updateAnswer()` (answers.ts:203): `requireStaff()` 필수, content만 업데이트, `/admin/answers` 리밸리데이트
- RLS: `auth.uid() = author_id` UPDATE 정책 있음 → 본인 답변 수정 DB 레벨에서 허용
- 질문 상세 페이지: 수정 버튼 없음, 삭제 버튼도 없음 (질문 삭제만 있음)

## 구현 내용

### 1. Server Action 추가 (answers.ts)
- `updateAnswerByAuthor(answerId, content)` 신규 함수
- 인증: `auth.getUser()` → 답변의 `author_id`와 본인 일치 확인 OR staff
- 업데이트: content + updated_at
- 리밸리데이트: `/questions/{question_id}`, `/admin/answers`

### 2. 프론트엔드 — 질문 상세 페이지 수정 UI
- 답변 렌더링 영역에 "수정" 버튼 추가 (본인 답변 또는 관리자일 때만)
- 클릭 시 인라인 편집 모드 (textarea) → 저장/취소 버튼
- 클라이언트 컴포넌트 분리 필요 (현재 서버 컴포넌트이므로)
- 새 파일: `src/app/(main)/questions/[id]/answer-edit-button.tsx`

### 3. 수정 가능 조건
- `currentUserId === answer.author_id` (본인 답변)
- OR `isAdmin === true` (관리자/조교)

## 변경 파일
- `src/actions/answers.ts` — `updateAnswerByAuthor()` 추가
- `src/app/(main)/questions/[id]/page.tsx` — 수정 버튼 영역 + currentUserId/isAdmin 전달
- `src/app/(main)/questions/[id]/answer-edit-button.tsx` — 신규 클라이언트 컴포넌트

## 성공 기준
- 본인 답변에 "수정" 버튼 표시
- 관리자는 모든 답변에 "수정" 버튼 표시
- 수정 → 저장 → 내용 반영 확인
- 빌드 성공
