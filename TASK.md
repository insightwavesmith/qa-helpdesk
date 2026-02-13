# TASK: 뉴스레터 템플릿 A/B/C Unlayer JSON 적용

> 2026-02-13 | email-mockup-all.html 디자인을 Unlayer JSON으로 변환

## 목표
content.type에 따라 다른 뉴스레터 템플릿이 적용되도록 한다.
- education → Template A (정보공유형)
- notice → Template B (공지/홍보형)
- case_study → Template C (고객사례형, 코드만 준비)

## 현재 코드 구조 (코드 리뷰 결과)

### email-default-template.ts (622줄)
- `BS_CAMP_DEFAULT_TEMPLATE`: 고정 7-Row Unlayer JSON
- Row 구조: header → title → body-text-1 → image → body-text-2 → cta → footer
- 모든 row가 `cells: [1]` (단일 컬럼)
- content type: text, image, button, divider 4종만 사용
- ID 체계: `content-*` 접두사 (findContentById의 키)

### email-template-utils.ts (100줄)
- `buildDesignFromSummary(content)`: deep copy 후 4개 블록만 교체
  - content-title ← content.title
  - content-body-text-1 ← email_summary → markdownToEmailHtml()
  - content-body-text-2 ← "" (빈 문자열)
  - content-cta-button ← /posts/{id} URL
- `markdownToEmailHtml()`: **bold**, ![img], \n\n→p, \n→br 만 지원
- `findContentById()`: rows→columns→contents 3중 순회, 참조 반환

### newsletter-edit-panel.tsx
- initialDesign 결정 로직:
  - email_design_json 있으면 → 그거 사용
  - email_summary만 있으면 → buildDesignFromSummary() 호출
  - 둘 다 없으면 → BS_CAMP_DEFAULT_TEMPLATE

## 구현 전략 (코드 리뷰 기반)

### 방법: 3벌 Base Template + 같은 교체 패턴

복잡한 블록(섹션 배너, 히어로 등)은 **Row 배경색 + text content**로 단순화.
프로필 카드, BA 카드 등은 **text content에 HTML 테이블** 삽입.
그라데이션/도트패턴은 이메일에서 불안정 → 단색 배경으로 대체.

### Template A 핵심 블록 (education)
1. 로고 헤더 (현재와 동일)
2. 제목 (content-title)
3. 훅 인용구 — 빨간 이탤릭 센터 text
4. 본문 (content-body-text-1) ← email_summary
5. CTA 버튼 (content-cta-button)
6. 구분선
7. 클로징 + 서명
8. 셀프 프로모 (자사몰사관학교 6기 안내)
9. 푸터

### Template B 핵심 블록 (notice)
1. 로고 헤더
2. 제목
3. 히어로 섹션 — Row 배경 #1a1a2e + 흰색 text
4. 본문 (content-body-text-1)
5. 정보 블록 — text content에 HTML 테이블
6. 대형 CTA
7. 보조 CTA (아웃라인)
8. 클로징 + 서명
9. 푸터

### Template C 핵심 블록 (case_study)
1. 로고 헤더
2. 제목
3. 프로필 카드 — text content에 HTML 테이블 (아바타+이름+메타)
4. BA 카드 — 2컬럼 Row (before/after)
5. 본문 (content-body-text-1)
6. CTA (주황 #F97316)
7. 클로징 + 서명
8. 푸터

## 수정 대상 파일 (2개만)

### T1. email-default-template.ts
- BS_CAMP_DEFAULT_TEMPLATE 유지 (하위 호환)
- `BS_CAMP_TEMPLATE_A` export 추가 (~200줄)
- `BS_CAMP_TEMPLATE_B` export 추가 (~200줄)
- `BS_CAMP_TEMPLATE_C` export 추가 (~200줄)
- 각 템플릿의 content ID는 기존과 동일한 패턴 유지:
  - content-title, content-body-text-1, content-cta-button (필수)
  - 추가 블록은 content-hook-quote, content-hero, content-info-block 등

### T2. email-template-utils.ts
- `buildDesignFromSummary(content)` 수정:
  - content.type으로 분기: education→A, notice→B, case_study→C, 기타→기존 DEFAULT
  - 공통 교체 로직은 동일 (title, body-text-1, cta-button)
  - 타입별 추가 교체: hook-quote, hero 텍스트 등

## 참고 파일 (읽기만)
- public/email-mockup-all.html — HTML 디자인 레퍼런스
- src/components/content/newsletter-edit-panel.tsx — Unlayer 연동

## 디자인 토큰
- 폭: 600px
- 폰트: Pretendard
- 브랜드 컬러: #F75D5D (A/B), #F97316 (C)
- 텍스트: #333333, 제목: #1a1a1a
- 푸터 배경: #f7f7f7

## 완료 기준
- [ ] TEMPLATE_A/B/C export 존재
- [ ] buildDesignFromSummary가 type별 분기
- [ ] npx tsc --noEmit 통과
- [ ] 기존 DEFAULT 템플릿 하위 호환 유지
