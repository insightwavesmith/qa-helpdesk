# TASK.md — 간단한 동작 테스트
> 2026-02-11 | 에이전트팀 계정 변경 후 동작 확인용

## 목표
에이전트팀이 정상 작동하는지 확인하는 최소 태스크.
`src/lib/email-default-template.ts` 상단 주석에 날짜 업데이트.

## 제약
- 기능 변경 없음. 주석만 수정.
- npm run build 통과 필수.

## 태스크
### T1. 주석 날짜 업데이트 → frontend-dev
- 파일: `src/lib/email-default-template.ts`
- 의존: 없음
- 완료 기준:
  - [ ] 파일 상단 주석에 `// Last verified: 2026-02-11` 추가
  - [ ] npm run build 성공

## 검증 (셀프 체크)
☐ npm run build 성공
☐ 기존 기능 안 깨졌나
