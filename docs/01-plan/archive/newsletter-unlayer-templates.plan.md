# 뉴스레터 섹션별 고정 Unlayer 템플릿 구현 — Plan

**작성일**: 2026-02-17
**상태**: implementing

## 목표
email_summary 텍스트가 무엇이든, 3종 템플릿(Education/Webinar/Case Study)의 디자인/레이아웃은 100% 고정.
AI는 텍스트만 채우고, 레이아웃(배너+카드+체크리스트+테이블 등)은 변경 불가.

## 범위
- T0: 섹션 필드 스키마 정의 (TypeScript types)
- T1+T5 합병: 전체 Row JSON 정의 (배너 8종 + 공통 13종)
- T2: parseSummaryToSections 개선 (구조화된 필드 파싱)
- T3: buildDesignFromSummary 재구현 (고정 row 템플릿 기반)
- T4: AI email_summary 프롬프트 개선
- T6: 에러 핸들링 + 하위 호환

## 성공 기준
- [ ] npm run build 성공
- [ ] 3종 모두 email-samples-v7.html 골드 스탠다드와 동일 디자인
- [ ] 기존 email_design_json 하위 호환
- [ ] Unlayer 에디터에서 row 단위 편집 가능

## 의존성
T0 → T1+T5 (병렬 가능) + T2 (병렬 가능) → T3 + T4 → T6

## 레퍼런스
- newsletter-reference/email-samples-v7.html (골드 스탠다드)
- newsletter-reference/review-newsletter-v2.md (리뷰 보고서)
