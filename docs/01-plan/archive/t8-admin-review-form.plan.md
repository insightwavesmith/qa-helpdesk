# T8. 관리자 후기 등록 폼 필드 누락 — Plan

## 1. 개요
- **기능**: 관리자 후기 등록 폼(YouTubeReviewModal)에 별점(rating)과 내용(content) 필드 추가
- **해결하려는 문제**: 현재 관리자 후기 등록 폼에 제목 + 유튜브 URL + 기수 + 카테고리만 있고, 별점과 텍스트 내용을 입력할 수 없음
- **원인**: `YouTubeReviewModal`이 유튜브 영상 전용으로 설계되어 텍스트 후기 작성 기능이 빠짐. `createAdminReview` 서버 액션도 rating 파라미터를 받지 않음

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: 후기 등록 폼에 **별점(1~5)** 선택 UI를 추가한다 (별 아이콘 클릭 방식)
- FR-02: **내용(content)** 텍스트 영역을 추가한다 (textarea, 최소 3줄 높이)
- FR-03: 유튜브 URL은 **선택 입력**으로 변경한다 (현재: 필수 → 변경: 선택)
- FR-04: 내용(content)은 **필수 입력**으로 설정한다
- FR-05: `createAdminReview` 서버 액션에서 `rating` 필드를 DB에 저장한다
- FR-06: 모달 제목을 "유튜브 후기 등록" → "후기 등록"으로 변경한다 (범용화)

### 비기능적 요구사항
- 별점 UI는 수강생 후기 작성 폼(`new-review-form.tsx`)의 StarRating과 동일한 스타일 유지
- reviews 테이블 스키마 변경 금지 (이미 rating, content 컬럼 존재)
- 수강생 후기 작성 폼(`/reviews/new`) 변경 금지

## 3. 범위

### 포함
- `YouTubeReviewModal` 컴포넌트에 rating StarSelector 추가
- `YouTubeReviewModal`에 content textarea 추가
- 유튜브 URL 필드를 선택 입력으로 변경 (required 제거)
- 폼 검증 로직 수정: content 필수, youtubeUrl 선택
- `createAdminReview` 서버 액션에 `rating` 파라미터 추가
- 모달 제목 / 버튼 텍스트 변경 (범용화)
- 헤더 버튼 텍스트 "유튜브 후기 등록" → "후기 등록"

### 제외
- reviews 테이블 스키마 변경
- 수강생 후기 작성 폼 변경
- 이미지 업로드 기능 (관리자 후기는 텍스트 + 유튜브 URL 조합)
- 후기 수정 기능

## 4. 성공 기준
- [ ] 관리자가 별점(1~5)을 선택하여 후기를 등록할 수 있다
- [ ] 관리자가 내용(content) 텍스트를 작성할 수 있다
- [ ] 유튜브 URL 없이도 텍스트 후기만으로 등록이 가능하다
- [ ] 유튜브 URL이 있으면 기존과 동일하게 저장된다
- [ ] DB reviews 테이블에 rating, content가 정상 저장된다
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `createAdminReview` 서버 액션 — `rating` 파라미터 추가, `content` 필수 처리
2. `YouTubeReviewModal` — content textarea 추가
3. `YouTubeReviewModal` — rating StarSelector 추가
4. `YouTubeReviewModal` — youtubeUrl 선택 입력으로 변경 + 검증 수정
5. 모달 제목/버튼 텍스트 범용화
6. 빌드 확인
