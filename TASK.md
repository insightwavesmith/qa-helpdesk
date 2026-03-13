# TASK: AI 답변 수정 시 이미지 추가 기능

## What
관리자가 `/admin/answers` 페이지에서 AI 답변을 수정할 때, 텍스트 수정만 가능하다. 이미지도 추가/삭제할 수 있어야 한다.

## Why
- AI가 생성한 답변에 참고 이미지(스크린샷, 예시 등)를 직접 붙여서 품질을 높일 수 있어야 함
- 수강생 질문에 시각적 답변이 필요한 경우가 있음

## 기존 이미지 업로드 패턴 (참고)
- `src/components/qa-chatbot/QaChatPanel.tsx` (81~95행): Supabase Storage `question-images` 버킷에 직접 업로드
- 업로드 경로: `question-images/{userId}/{timestamp}_{fileName}`
- `getPublicUrl()`로 URL 획득 후 `image_urls` 배열에 저장
- answers 테이블에도 `image_urls` 컬럼 존재 (jsonb)

## Files
- `src/app/(main)/admin/answers/answers-review-client.tsx` — 수정 모드에 이미지 업로드 UI 추가
- `src/actions/answers.ts` — `updateAnswer()` 함수에 `imageUrls` 파라미터 추가 (image_urls 컬럼 업데이트)
- 새 컴포넌트 불필요 — 기존 Textarea 아래에 이미지 업로드 영역 추가

## 구현 방향
1. 수정 모드 진입 시 기존 답변의 image_urls를 불러옴
2. 파일 선택 → Supabase Storage 직접 업로드 → URL 획득
3. 이미지 미리보기 + 삭제(X) 버튼
4. 저장 시 updateAnswer에 imageUrls 배열 전달

## Validation
- [ ] 답변 수정 모드에서 이미지를 추가할 수 있다
- [ ] 추가한 이미지 미리보기가 보인다
- [ ] 이미지 삭제(X) 버튼이 동작한다
- [ ] 저장 후 답변에 이미지가 표시된다
- [ ] 기존 텍스트 수정 기능 정상 동작
- [ ] `tsc --noEmit` 통과

## 하지 말 것
- 새 API 라우트 만들지 말 것 — Supabase Storage 클라이언트 직접 업로드
- answers 테이블 스키마 변경 금지 — image_urls 컬럼 이미 존재
- 이미지 리사이징/압축 불필요 — 원본 그대로 업로드
