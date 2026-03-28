# 꼬리질문 기능 설계서

> 작성: 2026-03-16 (v3 — 장애 원인 반영 + 스레드 임베딩)

## 1. 데이터 모델

### questions 테이블 변경
| 필드 | 타입 | 설명 |
|------|------|------|
| parent_question_id | UUID (nullable) | 부모 질문 FK → questions(id) ON DELETE CASCADE |

## 2. API 설계

### createQuestion 확장
- 기존 파라미터 + `parentQuestionId?: string`
- `as any` 캐스트로 insert (DB 스키마와 TS 타입 불일치 허용)
- parentQuestionId가 없으면 기존 동작과 동일 (spread 빈 객체)

### getFollowUpQuestions(parentQuestionId)
- questions에서 parent_question_id = parentQuestionId 조회
- **try-catch로 감싸서 컬럼 미존재 시 빈 배열 반환**
- error를 null로 반환 (상위 호출자가 에러로 오해하지 않게)

### getParentQuestionId(questionId)
- 질문의 parent_question_id 조회 (스레드 임베딩 판별용)
- 컬럼 없으면 null 반환

### getQuestions() — 변경 없음
- `.is("parent_question_id", null)` 필터 추가하지 않음 (장애 원인)
- 꼬리질문이 목록에 노출되는 것은 허용 (제목이 "RE: ..."로 구분)

## 3. 임베딩 설계 (핵심)

### embedQAThread(rootQuestionId)
- **호출 시점**: 꼬리질문의 답변이 승인될 때 (`approveAnswer` 내에서)
- **스레드 구성**:
  ```
  [질문] 원본 질문 제목 + 내용
  ---
  [AI 답변] 원본 답변 내용
  ---
  [추가 질문] 꼬리질문1 내용
  ---
  [AI 답변] 꼬리질문1 답변 내용
  ...
  ```
- **source_type**: `"qa_thread"` (개별 QA와 구분)
- **priority**: 3 (개별 QA의 2보다 높음 — 스레드 맥락이 더 풍부)
- **기존 thread chunks 삭제 후 재생성** (스레드 갱신 시 최신 상태 반영)
- **metadata**: `{ question_id, category, followup_count }`

### approveAnswer 변경
- 기존 `embedQAPair()` 호출은 유지
- 추가: 질문이 꼬리질문인지 확인 → 맞으면 `embedQAThread(parentId)` 호출

## 4. 컴포넌트 구조

### FollowUpForm (신규)
| 파일 | `src/app/(main)/questions/[id]/follow-up-form.tsx` |
|------|---|
| 타입 | Client Component |
| props | `parentQuestionId, parentTitle, categoryId` |
| 동작 | "추가 질문" 버튼 → 인라인 폼 열기 → `createQuestion(parentQuestionId)` |

### 질문 상세 페이지 변경
- 답변 섹션 아래에 follow-up 스레드 표시 (왼쪽 세로 바 스타일)
- 꼬리질문: amber 배경 카드
- 꼬리질문 답변: 일반 카드 + AI 답변은 좌측 primary 보더
- 로그인 사용자 + 답변 있는 경우에만 "추가 질문" 버튼 표시

## 5. 안전성 설계
| 시나리오 | 동작 |
|---------|------|
| migration 미실행 | getFollowUpQuestions → 빈 배열, createQuestion(parentId) → 에러 toast |
| migration 실행 후 | 전체 기능 정상 동작 |
| getQuestions() | 변경 없음 — 꼬리질문도 목록에 표시 (무해) |

## 6. 파일 목록
| 파일 | 변경 유형 |
|------|---------|
| `src/actions/questions.ts` | 수정 — createQuestion, getFollowUpQuestions, getParentQuestionId |
| `src/actions/answers.ts` | 수정 — approveAnswer에 스레드 임베딩 추가 |
| `src/lib/qa-embedder.ts` | 수정 — embedQAThread 함수 추가 |
| `src/app/(main)/questions/[id]/page.tsx` | 수정 — follow-up 스레드 UI |
| `src/app/(main)/questions/[id]/follow-up-form.tsx` | 신규 |
| `supabase/migrations/20260316_followup_questions.sql` | 신규 |
