# 꼬리질문 + 일반회원가입 수정 설계서

> 작성: 2026-03-16 (v2 — 장애 원인 반영)

## 장애 원인 (v1에서 발생)
- `getQuestions()`에 `.is("parent_question_id", null)` 필터 추가
- DB에 `parent_question_id` 컬럼이 없는 상태에서 배포 → 500 에러 → QA 게시판 전체 다운
- **수정**: `getQuestions()`는 변경하지 않음. 컬럼 유무와 무관하게 기존 기능 동작 보장.

## 1. 데이터 모델

### questions 테이블 변경
| 필드 | 타입 | 설명 |
|------|------|------|
| parent_question_id | UUID (nullable) | 부모 질문 FK → questions(id) |

## 2. API 변경

### createQuestion 확장
- 기존 파라미터 + `parentQuestionId?: string`
- parent_question_id 세팅 후 INSERT → 기존 AI 자동답변 파이프라인 동작
- `as any` 캐스트로 타입 체크 우회 (DB 스키마와 TS 타입 불일치 허용)

### getFollowUpQuestions(questionId)
- questions에서 parent_question_id = questionId인 질문 조회
- **try-catch로 감싸서 컬럼 없으면 빈 배열 반환** (에러 전파 안 함)
- created_at ASC 정렬

### getQuestions() — 변경 없음
- `.is("parent_question_id", null)` 필터 추가하지 않음
- migration 실행 전까지 꼬리질문도 목록에 표시됨 (무해)
- migration 실행 후에도 목록 필터링은 추후 별도 작업

## 3. UI 변경

### 질문 상세 페이지
- 기존 답변 섹션 아래에 follow-up 질문+답변 스레드 표시
- 수강생/관리자 모두 "추가 질문" 버튼 사용 가능
- FollowUpForm: 기존 질문 작성 폼의 경량 버전 (제목 없이 본문만)

### 일반 가입 페이지
- signUp 후 세션 없으면 성공 메시지 화면 (이메일 인증 안내)
- 이미 가입된 이메일: identities 빈 배열 체크

## 4. 신규 파일
| 파일 | 역할 |
|------|------|
| `src/app/(main)/questions/[id]/follow-up-form.tsx` | 추가 질문 폼 |
| `supabase/migrations/20260316_followup_questions.sql` | parent_question_id 추가 |

## 5. 수정 파일
| 파일 | 변경 |
|------|------|
| `src/actions/questions.ts` | createQuestion에 parentQuestionId 추가, getFollowUpQuestions 신규 |
| `src/app/(main)/questions/[id]/page.tsx` | follow-up 스레드 + 추가 질문 버튼 |
| `src/app/(auth)/signup/page.tsx` | 세션 체크 + 이메일 인증 안내 + 중복 이메일 체크 |
