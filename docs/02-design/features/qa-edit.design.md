# Q&A 글 수정 기능 — Design

## 1. 데이터 모델
- 기존 `questions` 테이블 사용 (변경 없음)
- 수정 대상 필드: title, content, category_id, image_urls

## 2. API 설계

### updateQuestion (Server Action)
- **위치**: `src/actions/questions.ts`
- **입력**: `{ id: string, title: string, content: string, categoryId: number | null, imageUrls?: string[] }`
- **권한**: 본인(author_id === user.id) 또는 admin/assistant
- **동작**: questions 테이블 UPDATE → revalidatePath

## 3. 컴포넌트 구조

### NewQuestionForm 수정 (edit 모드 추가)
- **파일**: `src/app/(main)/questions/new/new-question-form.tsx`
- **추가 props**: `mode?: 'create' | 'edit'`, `initialData?: { id, title, content, categoryId, imageUrls }`
- **변경점**:
  - defaultValues를 initialData에서 가져옴
  - submit 시 mode에 따라 createQuestion/updateQuestion 호출
  - 기존 이미지 URL 미리보기 지원
  - 제목/버튼 텍스트 분기

### 수정 페이지 (신규)
- **파일**: `src/app/(main)/questions/[id]/edit/page.tsx`
- **동작**: question 로드 → 권한 체크 → NewQuestionForm(mode='edit') 렌더링

### 상세 페이지 수정 버튼
- **파일**: `src/app/(main)/questions/[id]/page.tsx`
- **동작**: 본인 글 또는 admin → "수정" 버튼 표시 → /questions/[id]/edit 링크

## 4. 에러 처리
- 미인증: 로그인 리다이렉트
- 권한 없음: questions 목록 리다이렉트
- 질문 미존재: notFound()
- 업데이트 실패: toast.error

## 5. 구현 순서
1. [x] updateQuestion 서버액션
2. [x] NewQuestionForm edit 모드 props 추가
3. [x] /questions/[id]/edit 페이지
4. [x] 상세 페이지 수정 버튼
