# LP 모바일 크롤링 + 소재↔LP 멀티모달 일관성 점수 — Plan

## 1. 개요
meta-embedding-arch Phase 2. LP를 모바일 뷰포트(iPhone 14 Pro)로 재크롤링하고,
Claude Vision으로 LP 구조 분석 후, 소재↔LP 크로스모달 일관성 점수를 계산한다.

## 2. 배경
- 기존 LP 크롤링은 데스크톱 뷰포트 → 모바일(390×844)로 전면 재구축
- 메타 광고 소재와 LP 간 메시지 일관성이 전환율에 직결
- Claude Vision(Haiku)으로 LP 구조를 JSON으로 분석 (리뷰/CTA/옵션 등)
- Gemini Embedding 2 멀티모달 3072차원으로 요소별 임베딩

## 3. 범위
### In Scope
- T1: Railway Playwright 크롤러 모바일 뷰포트 엔드포인트 추가 (/crawl/mobile)
- T2: 모바일 LP 크롤링 스크립트 (scripts/crawl-lps-mobile.mjs)
- T3: Claude Vision LP 구조 분석 (claude-haiku-4)
- T4: lp_structure_analysis 테이블 + creative_lp_consistency 테이블 생성
- T5: LP 요소별 Gemini 멀티모달 임베딩
- T6: 소재↔LP 크로스모달 일관성 점수 계산
- T7: GET /api/admin/creative-lp-consistency API
- T8: tsc + build 검증

### Out of Scope
- UI 시각화 (Phase 4)
- Railway 크롤러 서버 자체 수정 (별도 배포)
- 기존 데스크톱 크롤링 코드 삭제

## 4. 성공 기준
- 모바일 스크린샷 Supabase Storage 저장 ≥80%
- lp_structure_analysis 구조 분석 결과 저장
- LP 임베딩 3072차원 저장
- creative_lp_consistency에 6개 점수 + total 저장
- tsc + build 통과
- 기존 기능 영향 없음

## 5. 비용
- Claude Haiku: ~$0.002/LP × 350건 ≈ $0.70
- Gemini Embedding: ~$0.0001/건 × 350×4 ≈ $0.14
- 합계: ~$1.00

## 6. 금지사항
- 기존 데스크톱 크롤링 코드 삭제 금지
- .env.local 수정 금지
- main 직접 push 금지
