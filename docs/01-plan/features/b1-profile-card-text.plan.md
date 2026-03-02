# B1. 프로필 카드 문구 수정 — Plan

> 작성: 2026-03-02
> 선행 작업: T7(프로필 카드), A1(프로필 카드 최종), T10(이메일 Meta 로고) — 모두 completed

## 1. 개요
- **기능**: Meta 가이드라인 위반 문구를 수정
- **해결하려는 문제**: 현재 "Meta가 인증한 비즈니스 파트너" 표현은 Meta가 주어로 쓰여 Meta 브랜드 가이드라인 위반
- **수정 문구**: "Meta Business Partner로서 광고 성과를 높입니다"

## 2. 핵심 요구사항

### 기능적 요구사항
- FR-01: **정보공유 글 하단 프로필 카드** 문구 변경
  - Before: "Meta가 인증한 비즈니스 파트너"
  - After: "Meta Business Partner로서 광고 성과를 높입니다"
- FR-02: **이메일 프로필 카드** 문구 동일 적용
  - `email-default-template.ts` SMITH_PROFILE_ROW
  - `newsletter-row-templates.ts` ROW_PROFILE
- FR-03: 두 군데 모두 동일한 문구 적용

### 비기능적 요구사항
- 프로필 카드 레이아웃/로고 변경 없음
- 다른 페이지 수정 없음

## 3. 범위

### 포함
- `src/components/posts/author-profile-card.tsx` — 문구 1줄 변경
- `src/lib/email-default-template.ts` — SMITH_PROFILE_ROW 텍스트 내 문구 변경
- `src/lib/newsletter-row-templates.ts` — ROW_PROFILE 텍스트 내 문구 변경

### 제외
- 프로필 카드 레이아웃 변경
- 로고 변경
- 다른 페이지/컴포넌트 수정

## 4. 성공 기준
- [ ] 정보공유 프로필 카드에 "Meta Business Partner로서 광고 성과를 높입니다" 표시
- [ ] 이메일 기본 템플릿(SMITH_PROFILE_ROW)에 동일 문구 적용
- [ ] 뉴스레터 템플릿(ROW_PROFILE)에 동일 문구 적용
- [ ] "Meta가 인증한 비즈니스 파트너" 문구가 3개 파일 모두에서 제거됨
- [ ] 프로필 카드 레이아웃/로고 변경 없음
- [ ] `npm run build` 성공

## 5. 실행 순서
1. `author-profile-card.tsx` 텍스트 변경 (1줄)
2. `email-default-template.ts` SMITH_PROFILE_ROW HTML text 내 문구 변경
3. `newsletter-row-templates.ts` ROW_PROFILE HTML text 내 문구 변경
4. 빌드 확인
