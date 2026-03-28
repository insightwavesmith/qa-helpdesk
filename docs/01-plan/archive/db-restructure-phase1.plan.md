# 데이터 아키텍처 재설계 Phase 1 — Plan

## 배경
- `ad_creative_embeddings` 테이블 40컬럼 몰빵, LP URL 1,626개 중 실제 상품 LP ~35개
- 데스크톱(1280×800)만 크롤링, 모바일 스크린샷 없음, 옵션창 캡처 성공률 4%
- 설계서: `~/.openclaw/workspace/memory/2026-03-20-data-architecture.md`

## 목표
1. LP URL 정규화 → `landing_pages` 테이블로 중복 제거 (~35개 상품 LP)
2. LP별 모바일+PC 스크린샷 → `lp_snapshots` 테이블
3. Railway 크롤러에 모바일 뷰포트 지원 추가
4. 기존 서비스 영향 없음 (기존 테이블 유지)

## 범위
- STEP 1: 신규 테이블 생성 SQL (landing_pages, lp_snapshots)
- STEP 2: LP URL 정규화 스크립트 (normalize-lps.mjs)
- STEP 3: Railway 크롤러 모바일 뷰포트 추가 (bscamp-crawler/server.js)
- STEP 4: LP 사전 검증 스크립트 (validate-lp-crawl.mjs)
- STEP 5: LP 재크롤링 스크립트 (crawl-all-lps.mjs)

## 제약
- ad_creative_embeddings 삭제 금지
- 기존 크론/API 코드 변경 금지
- dry-run 먼저, 실제 실행은 확인 후

## 성공 기준
- landing_pages ~35개 상품 LP 정규화
- external/article 올바르게 분류
- lp_snapshots에 모바일+PC 스크린샷 저장
- 옵션창 캡처 성공률 50% 이상
- 기존 서비스 정상 동작
