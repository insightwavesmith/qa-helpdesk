# 꼬리질문 + 일반회원가입 수정 계획서

> 작성: 2026-03-16

## T1: 꼬리질문 (B안 — parent_question_id)
- questions 테이블에 `parent_question_id` 컬럼 추가
- createQuestion에 parentQuestionId 옵션 추가 → AI 자동답변 재사용
- 질문 상세 페이지에서 follow-up 질문+답변을 시간순 대화로 표시
- 수강생용 "추가 질문" 버튼 추가

## T2: 일반회원가입 버그
- 원인: signUp 후 이메일 인증 필요 시 세션 없음 → /pending에서 /login으로 강제 리다이렉트
- 수정: signUp 후 세션 유무 확인 → 세션 없으면 "이메일 인증 안내" 표시
- 이미 가입된 이메일(identities 빈 배열) 체크 추가

## 성공 기준
- tsc/lint/build 통과
- 꼬리질문: 답변 아래 추가 질문 가능, AI 자동답변 동작
- 일반가입: 이메일 인증 안내 표시, 중복 이메일 처리
