# T2: 답변 수정 기능 추가 — 설계서

## 1. 데이터 모델
변경 없음. `answers` 테이블에 이미 `updated_at` 컬럼 있음.

## 2. API 설계

### `updateAnswerByAuthor(answerId: string, content: string)`
- **인증**: `createClient()` → `auth.getUser()` → user.id 확인
- **권한 확인**: service client로 답변 조회 → `author_id === user.id` OR staff role
- **업데이트**: `{ content, updated_at: new Date().toISOString() }`
- **리밸리데이트**: `/questions/{question_id}`, `/admin/answers`, `/questions`
- **반환**: `{ error: string | null }`

## 3. 컴포넌트 구조

### `answer-edit-button.tsx` (신규 클라이언트 컴포넌트)
```
Props: { answerId: string, initialContent: string, questionId: string }

State:
  - isEditing: boolean
  - editContent: string
  - isLoading: boolean

UI:
  - 기본: "수정" 버튼 (Pencil 아이콘)
  - 편집 모드: textarea + 저장/취소 버튼
```

### `questions/[id]/page.tsx` 수정
- 답변 렌더 영역에 AnswerEditButton 추가
- 조건: `(currentUserId === answer.author?.id) || isAdmin`
- `currentUserId`와 `isAdmin`은 이미 계산됨

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| 미인증 | "로그인이 필요합니다" 반환 |
| 권한 없음 (본인 아님 + staff 아님) | "수정 권한이 없습니다" 반환 |
| DB 에러 | error.message 반환 |

## 5. 구현 순서
- [x] Plan 작성
- [x] Design 작성
- [ ] `updateAnswerByAuthor()` server action 추가
- [ ] `answer-edit-button.tsx` 클라이언트 컴포넌트 생성
- [ ] `page.tsx` 답변 영역에 수정 버튼 삽입
- [ ] 빌드 검증
