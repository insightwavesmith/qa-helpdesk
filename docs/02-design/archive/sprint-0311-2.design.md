# Sprint 0311-2 설계서

## T1: 답변 수정 UI 개선

### 데이터 모델
- `answers.image_urls` (jsonb) — 기존 필드 활용

### API 설계
- `updateAnswerByAuthor(answerId, content, imageUrls?)` — image_urls 파라미터 추가

### 컴포넌트 구조
- `answer-edit-button.tsx` → 수정 모드에서 answer-form과 동일한 UI 렌더링
  - Textarea (rows=5)
  - 이미지 첨부 (최대 5개, 10MB, PNG/JPG/WebP)
  - 기존 이미지 프리뷰 (URL 기반) + 새 이미지 프리뷰 (blob 기반)
  - 저장/취소 버튼
- 기존 이미지: string[] (URL), 새 이미지: File[] (업로드 필요)

### 구현 순서
1. `updateAnswerByAuthor` 액션에 `imageUrls` 파라미터 추가
2. `answer-edit-button.tsx` 리팩토링 — 이미지 업로드 UI 추가

---

## T2: 수강생 관리 탭에 광고관리자 바로가기

### 데이터 모델
- `ad_accounts.account_id` (text) — Meta 광고계정 ID

### API 설계
- `getMembers()` 수정: profiles LEFT JOIN ad_accounts → account_id 포함

### 컴포넌트 구조
- `members-client.tsx` 테이블에 "광고관리자" 열 추가
- 링크: `https://adsmanager.facebook.com/adsmanager/manage/campaigns?act={account_id}`
- `account_id`에서 `act_` prefix 제거하여 URL 생성

### 구현 순서
1. `getMembers()` 쿼리에 ad_accounts JOIN 추가
2. Member 인터페이스에 ad_account_ids 추가
3. 테이블 UI에 버튼/링크 렌더링

---

## T3: 믹스패널 Phase 2 이벤트

### 구현 패턴
- 기존 `mp.track()` 패턴 그대로 사용
- 각 페이지/컴포넌트의 적절한 위치에 호출 추가

### 이벤트 목록 & 파일 매핑
| 이벤트 | 파일 |
|--------|------|
| logout | 로그아웃 핸들러 |
| question_list_viewed | questions/page.tsx |
| answer_edited | answer-edit-button.tsx |
| answer_helpful_clicked | 답변 UI |
| protractor_date_changed | 각도기 날짜 컴포넌트 |
| protractor_benchmark_viewed | 벤치마크 컴포넌트 |
| protractor_collect_triggered | 수집 버튼 |
| protractor_top5_viewed | TOP5 탭 |
| competitor_pinned | 경쟁사 핀 |
| competitor_monitor_created | 모니터 생성 |
| competitor_load_more_clicked | 더보기 |
| content_list_viewed | content 목록 |
| curriculum_viewed | 커리큘럼 |
| post_viewed/created | posts |
| comment_created, like_toggled | 댓글/좋아요 |
| ad_account_disconnected | 설정 |
| admin_* | admin 페이지들 |
