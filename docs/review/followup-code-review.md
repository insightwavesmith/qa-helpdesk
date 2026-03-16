# 꼬리질문 코드리뷰 (이전 구현 분석)

> 리뷰 대상: `git diff ef039b0..a9df6e9` (7파일, +388/-3)
> 리뷰 일시: 2026-03-16

## 장애 원인 (Critical)

### `getQuestions()`에 `.is("parent_question_id", null)` 추가
- **위치**: `src/actions/questions.ts` — 질문 목록 쿼리
- **문제**: DB에 `parent_question_id` 컬럼이 없는 상태에서 이 필터를 걸면 Supabase가 500 에러 반환
- **영향 범위**: QA 게시판 전체 (목록 페이지 렌더링 불가)
- **교훈**: migration 미실행 상태에서도 동작해야 하는 코드에 컬럼 의존 필터를 추가하면 안 됨

## 개선 필요 사항

### 1. 임베딩 누락 (Medium)
- 꼬리질문에 답변이 달리면 `embedQAPair()`가 개별 QA만 임베딩
- 원본 질문 → 답변 → 꼬리질문1 → 답변1 전체 스레드를 하나의 맥락으로 임베딩해야 RAG 검색 품질 향상
- **수정 방향**: `embedQAThread()` 함수 추가, 꼬리질문 답변 승인 시 전체 스레드 임베딩

### 2. 회원가입 혼재 (Low)
- 별개 기능인 signup 버그 수정이 같은 커밋에 포함
- feature 브랜치 분리 필요

### 3. `getFollowUpQuestions()` 에러 처리 (Good)
- try-catch로 컬럼 없을 때 빈 배열 반환 → 올바른 접근
- error를 null로 반환하여 상위 호출자가 에러로 오해하지 않음

### 4. 질문 목록 필터링 전략
- `.is("parent_question_id", null)` 대신 JS 사후 필터링이 안전
- 또는: 컬럼 존재 여부를 먼저 체크한 후 조건부 필터
- **채택 방안**: getQuestions()는 수정하지 않음. 목록에 꼬리질문 노출은 무해 (제목이 "RE: ..."로 구분됨)

## 이번 재구현 방침
1. `getQuestions()` 수정 금지
2. 모든 DB 쿼리에서 `parent_question_id` 참조는 try-catch 필수
3. 꼬리질문 답변 승인 시 스레드 전체 임베딩 (`embedQAThread`)
4. 회원가입 수정은 별도 브랜치로 분리
