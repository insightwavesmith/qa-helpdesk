# T1: QA 답변 소스 참조 숨기기

## 이게 뭔지
AI 답변에 표시되는 "참고 강의 자료" 소스 정보를 수강생에게 숨기는 것

## 왜 필요한지
수강생이 QA 답변을 볼 때 내부 지식베이스/강의자료 소스(lecture_name, week, similarity 등)가 노출됨. 이는 내부 정보이므로 고객에게 보이면 안 됨. 관리자에게는 디버깅용으로 유지.

## 현재 상태
- `SourceReferences` 컴포넌트가 AI 답변에 "참고 강의 자료 (N)" 아코디언으로 렌더링
- `questions/[id]/page.tsx` 244줄: `{isAI && (` 조건으로 모든 사용자에게 표시
- `AnswerCard.tsx`는 현재 어디서도 import되지 않아 사용되지 않음
- `admin/answers/answers-review-client.tsx`는 관리자 전용 페이지 → 변경 불필요

## 구현 내용
- `src/app/(main)/questions/[id]/page.tsx` 244줄 수정
- `{isAI && (` → `{isAI && isAdmin && (` 로 변경
- isAdmin 변수는 이미 53줄에서 계산되어 있음 (admin 또는 assistant role)

## 변경 파일
- `src/app/(main)/questions/[id]/page.tsx` (1줄 수정)

## 성공 기준
- 수강생: AI 답변 내용만 보임, 소스 참조 없음
- 관리자/조교: 기존과 동일하게 소스 참조 표시
- 빌드 성공
