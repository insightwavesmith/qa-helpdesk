# AI 답변 수정 시 이미지 추가 기능 — 설계서

## 1. 데이터 모델
- `answers.image_urls` (jsonb, 이미 존재) — `string[]` 형태로 사용
- 스키마 변경 없음

## 2. API 설계
### updateAnswer (서버 액션 수정)
- 기존: `updateAnswer(answerId: string, content: string)`
- 변경: `updateAnswer(answerId: string, content: string, imageUrls?: string[])`
- `imageUrls`가 전달되면 `image_urls` 컬럼도 함께 업데이트

## 3. 컴포넌트 구조

### answers-review-client.tsx 변경
- **상태 추가**: `editImageUrls: string[]` — 수정 중인 이미지 URL 배열
- **handleEdit**: 기존 답변의 `image_urls`를 `editImageUrls`에 로드
- **이미지 업로드**: QaChatPanel.tsx 패턴 그대로 사용
  - 버킷: `question-images`
  - 경로: `answer-images/{timestamp}-{random}.{ext}`
  - `getPublicUrl()`로 URL 획득 → `editImageUrls`에 추가
- **이미지 삭제**: 배열에서 해당 URL 제거 (Storage 파일 삭제는 하지 않음)
- **저장**: `handleSaveEdit`에서 `updateAnswer(id, content, imageUrls)` 호출

### UI 레이아웃 (수정 모드)
```
[Textarea - 기존]
[이미지 미리보기 영역]
  - 각 이미지: 썸네일 + X 삭제 버튼
[파일 선택 버튼] "이미지 추가"
[저장] [취소]
```

### Answer 인터페이스 수정
- `image_urls?: string[]` 필드 추가 (서버에서 이미 내려옴)

## 4. 에러 처리
- 업로드 실패: toast.error("이미지 업로드에 실패했습니다.")
- 파일 크기/형식 제한 없음 (원본 그대로)

## 5. 구현 순서
1. `answers.ts` — `updateAnswer()` 시그니처에 `imageUrls?` 추가, DB 업데이트 포함
2. `answers-review-client.tsx` — Answer 인터페이스에 `image_urls` 추가
3. `answers-review-client.tsx` — `editImageUrls` 상태 + handleEdit 수정
4. `answers-review-client.tsx` — 이미지 업로드 함수 추가
5. `answers-review-client.tsx` — 수정 모드 UI에 이미지 영역 추가
6. `answers-review-client.tsx` — handleSaveEdit에서 imageUrls 전달
7. `answers-review-client.tsx` — 비수정 모드에서 기존 이미지 표시
8. tsc + lint + build 검증
