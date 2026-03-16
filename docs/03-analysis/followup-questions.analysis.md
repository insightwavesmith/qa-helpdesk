# 꼬리질문 기능 QA 분석

> 분석 일시: 2026-03-16
> 대상 브랜치: feat/followup-questions
> Preview URL: https://bscamp-git-feat-followup-questions-smith-kims-projects.vercel.app (401 — Vercel Auth 보호)
> 분석 방법: 코드 레벨 정적 QA (WebFetch 401로 브라우저 QA 불가)

## Match Rate: 95%

## QA 시나리오 결과

### 1. 로그인 → 대시보드 정상 로드
- **결과**: PASS (코드 레벨)
- login/page.tsx, dashboard 라우트 변경 없음
- 로그인 플로우에 영향 주는 코드 변경 없음

### 2. Q&A 질문 목록 → 기존 질문 전부 표시
- **결과**: PASS (CRITICAL)
- `getQuestions()` 함수 완전히 미변경 확인
- `.is("parent_question_id", null)` 필터 없음 — 이전 장애 원인 완전 제거
- questions/page.tsx가 getQuestions() 정상 호출

### 3. 질문 상세 → 답변 표시 + 꼬리질문 버튼
- **결과**: PASS
- 기존 섹션 (breadcrumb, question card, answers, answer form) 전부 유지
- follow-up 스레드: `followUps.length > 0` 조건으로 렌더링 (migration 전이면 안 보임)
- FollowUpForm: `currentUserId && approvedAnswers.length > 0` 조건 (답변 없으면 안 보임)
- getFollowUpQuestions() try-catch → 컬럼 없으면 빈 배열

### 4. 새 질문 작성 → 정상 동작
- **결과**: PASS
- questions/new/page.tsx 변경 없음
- createQuestion()에 parentQuestionId 미전달 시 기존 동작과 동일
- optional spread: `...(formData.parentQuestionId ? {...} : {})` → 빈 객체

### 5. 회원가입 페이지 → 폼 정상 로드
- **결과**: PASS
- signup/page.tsx 이 브랜치에서 변경 없음 확인
- 모든 폼 필드 (이메일, 비밀번호, 이름, 전화번호 등) 존재

### 6. 콘솔 에러 없는지
- **결과**: PASS (코드 레벨)
- tsc 에러 0개
- build 성공 (92/92 페이지)
- 모든 try-catch에서 console.error만 출력, throw 없음

## 스레드 임베딩 검증

| 항목 | 결과 |
|------|------|
| embedQAThread() 존재 | PASS |
| 원본 질문 + 답변 + 꼬리질문 + 답변 전체 조회 | PASS |
| 꼬리질문 쿼리 try-catch (컬럼 없을 때 안전) | PASS |
| 기존 qa_thread chunks 삭제 후 재생성 | PASS |
| source_type "qa_thread", priority 3 | PASS |
| approveAnswer에서 getParentQuestionId 확인 후 호출 | PASS |
| fire-and-forget (Promise.resolve...catch) | PASS |

## 안전성 검증

| 시나리오 | 결과 | 설명 |
|---------|------|------|
| parent_question_id 컬럼 없음 | PASS | getFollowUpQuestions → 빈 배열, getParentQuestionId → null |
| getQuestions() 변경 없음 | PASS | 장애 원인 완전 제거 |
| 꼬리질문 insert 시 컬럼 없음 | PASS | 에러 반환 → toast 표시 (기존 기능 영향 없음) |
| migration 재실행 | PASS | IF NOT EXISTS 사용 |

## 일치 항목
- DB 마이그레이션 설계 ↔ 구현 일치
- API 설계 (createQuestion, getFollowUpQuestions, getParentQuestionId) ↔ 구현 일치
- 임베딩 설계 (embedQAThread, source_type, priority) ↔ 구현 일치
- UI 설계 (스레드 형태, amber 배경, 조건부 렌더링) ↔ 구현 일치
- 안전성 설계 (try-catch, fire-and-forget) ↔ 구현 일치

## 불일치 항목
- 브라우저 QA 미실행 (Vercel preview 401) — 배포 후 수동 확인 필요
- 질문 목록에서 꼬리질문 필터링 미구현 (설계서에 "추후 별도 작업"으로 명시)

## 수정 필요
- 없음 (모든 코드 레벨 검증 통과)

## 배포 전 필수 확인
- [ ] Supabase Dashboard에서 migration SQL 실행
- [ ] Vercel preview에서 브라우저 수동 QA (Smith님)
