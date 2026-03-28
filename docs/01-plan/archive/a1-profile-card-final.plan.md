# A1. 프로필 카드 문구 + 로고 수정 — Plan

> 작성: 2026-03-02

## 1. 개요
- **기능**: 정보공유 글 하단 프로필 카드와 이메일 프로필 카드를 확정 목업(`docs/mockups/profile-card.html`)에 맞춰 수정
- **해결하려는 문제**: 기존 T7에서 주요 프로필 카드를 업데이트했으나, (1) 정보공유 프로필 카드가 목업 레이아웃과 미세 차이 존재, (2) 뉴스레터 템플릿(`newsletter-row-templates.ts`)의 ROW_PROFILE이 여전히 구버전 문구 사용
- **참고 목업**: `docs/mockups/profile-card.html`
- **선행 작업**: T7(프로필 카드), T10(이메일 로고 URL) — 둘 다 completed

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **정보공유 프로필 카드 목업 정합성**
  - 1줄: "Meta가 인증한 비즈니스 파트너" (줄바꿈)
  - 2줄: "수강생 자사몰매출 450억+"
  - "스킨스쿨 / 재미어트 Co-founder" 제거 (이미 제거됨)
  - "/"로 한 줄 연결 → `<br />` 줄바꿈 분리 (목업 일치)
  - Meta Business Partners 로고를 별도 badge-row에 배치 (border-top 구분선 포함)
  - 카드 영역에 border-bottom 추가 (목업: border-top + border-bottom)
- FR-02: **뉴스레터 ROW_PROFILE 문구 업데이트**
  - "메타파트너 / 메타공식 프로페셔널" → "Meta가 인증한 비즈니스 파트너"
  - "스킨스쿨 / 재미어트 Co-founder" 제거
  - Meta Business Partners 인라인 로고 추가
- FR-03: **이메일 기본 템플릿(SMITH_PROFILE_ROW)은 이미 완료** — 변경 불필요 확인만

### 비기능적 요구사항
- 프로필 카드 레이아웃 구조(table vs flex)는 변경하지 않음
- 이메일 HTML은 인라인 스타일만 사용 (이메일 클라이언트 호환)

## 3. 범위

### 포함
- `src/components/posts/author-profile-card.tsx` — 목업 레이아웃 일치 수정
- `src/lib/newsletter-row-templates.ts` — ROW_PROFILE 문구 + 로고 수정

### 제외
- `src/lib/email-default-template.ts` — T7+T10에서 완료. 확인만.
- 프로필 카드 레이아웃 구조 변경
- 다른 페이지 수정

## 4. 성공 기준
- [ ] 정보공유 프로필 카드가 목업(profile-card.html)과 시각적으로 일치
- [ ] 설명 텍스트가 줄바꿈으로 분리 (슬래시 연결 아님)
- [ ] Meta 로고가 별도 badge-row에 border-top 구분선과 함께 표시
- [ ] 카드에 border-top + border-bottom 둘 다 존재
- [ ] newsletter-row-templates.ts ROW_PROFILE에 "메타파트너" "스킨스쿨" 문구 없음
- [ ] newsletter-row-templates.ts ROW_PROFILE에 인라인 로고 추가됨
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `author-profile-card.tsx` 수정 (텍스트 줄바꿈, badge-row 분리, border-bottom 추가)
2. `newsletter-row-templates.ts` ROW_PROFILE HTML 수정 (문구 + 로고)
3. `email-default-template.ts` SMITH_PROFILE_ROW 현재 상태 확인 (변경 불필요 시 skip)
4. 빌드 확인
