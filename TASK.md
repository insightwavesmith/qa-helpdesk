# TASK: 답변 승인 10개마다 말투 자동 학습

## What
답변 승인(`approveAnswer`)할 때, 승인된 답변이 마지막 학습 이후 10개 이상 쌓이면 말투 순환학습을 자동 실행한다.

## Why
- Smith님이 답변을 승인/수정할수록 AI 말투가 자동으로 개선되어야 함
- 수동 API 호출 없이 자연스럽게 학습이 돌아가는 구조

## 구현
`src/actions/answers.ts`의 `approveAnswer()` 함수 끝에:

1. `style_profiles` 테이블에서 최신 레코드의 `created_at` 조회
2. `answers` 테이블에서 `is_approved=true AND updated_at > 최신학습시점` 카운트
3. 10개 이상이면 `runStyleLearning()` fire-and-forget 실행
4. 실패해도 승인 자체는 정상 처리 (try-catch + console.error)

## Files
- `src/actions/answers.ts` — `approveAnswer()` 함수에 자동 학습 트리거 추가
- `src/lib/style-learner.ts` — 기존 `runStyleLearning()` 재사용, 변경 불필요

## Validation
- [ ] 답변 승인이 정상 동작한다 (기존 기능 영향 없음)
- [ ] 10번째 승인 시 학습이 자동 실행된다
- [ ] 학습 실패해도 승인은 성공한다
- [ ] `tsc --noEmit` 통과

## 하지 말 것
- cron이나 별도 스케줄러 만들지 말 것
- 승인 응답 시간에 영향 주지 말 것 — fire-and-forget (Promise.resolve + catch)
- style-learner.ts 수정하지 말 것
