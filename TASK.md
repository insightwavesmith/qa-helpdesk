# TASK: AI 답변 검토 탭에 수강생 질문 본문 표시

## What
관리자의 "답변 검토" 페이지(`/admin/answers`)에서 현재 AI 답변만 보이고, 원래 수강생이 올린 질문 본문이 안 보인다. 답변을 검토하려면 질문 맥락이 필요하므로, 각 답변 카드에 원본 질문 내용도 함께 표시해야 한다.

## Why
- 관리자(Smith님)가 AI 답변을 승인/수정할 때, 질문을 보려면 매번 링크를 클릭해서 새 페이지로 이동해야 함
- 질문 맥락 없이 답변만 보면 적절한지 판단하기 어려움
- 한 화면에서 질문+답변을 보고 바로 승인/수정/삭제 판단 가능해야 함

## Files
- `src/actions/answers.ts` — `getPendingAnswers()` 함수: question select에 `content` 필드 추가
- `src/app/(main)/admin/answers/answers-review-client.tsx` — Answer 타입에 `question.content` 추가, UI에 질문 본문 표시
- `src/app/(main)/admin/answers/page.tsx` — 변경 불필요 (데이터 전달 구조 그대로)

## Validation
- [ ] `/admin/answers` 페이지에서 각 답변 카드에 원본 질문 본문이 보인다
- [ ] 질문 제목(기존 링크)은 그대로 유지
- [ ] 질문 본문이 길면 3~4줄로 truncate하고 "더보기" 또는 접기/펼치기
- [ ] 질문에 이미지가 있으면 이미지도 표시 (questions 테이블에 image_urls 컬럼 있으면)
- [ ] `tsc --noEmit` 통과
- [ ] 기존 승인/수정/삭제 기능 정상 동작

## 하지 말 것
- questions 테이블 스키마 변경 금지
- 기존 답변 카드 레이아웃 크게 변경하지 말 것 — 질문 영역만 추가
- 새로운 API 라우트 만들지 말 것 — 기존 select 확장으로 충분
