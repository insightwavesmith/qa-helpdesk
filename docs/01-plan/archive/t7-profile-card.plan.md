# T7. 프로필 카드 적용 (이메일 + 정보공유) — Plan

## 1. 개요
- **기능**: 스미스 코치 프로필 카드를 이메일 템플릿과 정보공유 글 하단에 적용
- **해결하려는 문제**: 이메일 프로필 카드의 내용이 구버전이며, 정보공유 글 하단에는 프로필 카드가 없음
- **참고 목업**: `docs/mockups/profile-card.html`

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **이메일 프로필 카드 수정**
  - 사진(80px 원형) + "스미스 / 자사몰사관학교 코치"
  - 설명: "Meta가 인증한 비즈니스 파트너 / 수강생 자사몰매출 450억+"
  - 하단: Meta Business Partners 인라인 로고 (inline-positive.png, 높이 36px)
- FR-02: **정보공유 글 상세 하단에 프로필 카드 추가**
  - 이메일과 동일한 디자인
  - border-top 구분선 + padding

### 비기능적 요구사항
- 이메일 HTML 구조를 대폭 변경하지 말 것 — 프로필 영역만 수정
- 자격증 배지 넣지 말 것 — 인라인 로고만

## 3. 범위

### 포함
- `email-default-template.ts`의 SMITH_PROFILE_ROW HTML 수정
- 정보공유 글 상세 페이지(PostDetailClient.tsx)에 프로필 카드 컴포넌트 추가
- 프로필 카드 공용 컴포넌트 작성 (React)

### 제외
- 이메일 전체 HTML 구조 변경
- 자격증 배지 추가
- 이메일 레이아웃 시스템(Unlayer) 변경

## 4. 성공 기준
- [ ] 이메일 프로필 카드에 "Meta가 인증한 비즈니스 파트너 / 수강생 자사몰매출 450억+" 표시
- [ ] 이메일 프로필 카드 하단에 inline-positive.png 로고 표시 (36px)
- [ ] 정보공유 글 하단에 동일한 프로필 카드 표시
- [ ] 프로필 카드에 border-top 구분선이 있다
- [ ] 목업(profile-card.html)과 시각적으로 유사하다
- [ ] `npm run build` 성공

## 5. 실행 순서
1. 프로필 카드 React 컴포넌트 작성 (정보공유용)
2. `email-default-template.ts` SMITH_PROFILE_ROW HTML 수정 (설명 텍스트 + 인라인 로고)
3. `PostDetailClient.tsx` 하단에 프로필 카드 컴포넌트 삽입
4. 이미지 존재 확인 (`public/images/meta-partner/inline-positive.png`, `profile-smith.png`)
5. 빌드 확인
