# Phase 2: 소재·LP 분석 시스템 — Gap 분석

## Match Rate: 95%

## 일치 항목 (7/7 태스크)

| 태스크 | 설계 | 구현 | 상태 |
|--------|------|------|------|
| T1: migration | ad_creative_embeddings 테이블 + HNSW 2개 + RLS | 20260316_ad_creative_embeddings.sql 존재 | 일치 |
| T2: 이미지 URL 수집 | fetchImageUrlsByHash + fetchCreativeDetails | creative-image-fetcher.ts 생성 | 일치 |
| T3: ad-creative-embedder | embedCreative + embedMissingCreatives | ad-creative-embedder.ts 생성 | 일치 |
| T4: 크론 API | /api/cron/embed-creatives, 배치 50, 500ms | route.ts 생성 | 일치 |
| T5: 경쟁사 임베딩 | embedCompetitorAds, source=competitor | competitor-creative-embedder.ts 생성 | 일치 |
| T6: 유사도 검색 RPC | search_similar_creatives, SECURITY DEFINER | migration SQL 생성 | 일치 |
| T7: LP 크롤러 | fetch + cheerio, OG/가격/텍스트 추출 | lp-crawler.ts 생성 | 일치 |

## 불일치 항목

### 1. ad_accounts.category 미존재 (5% 감점)
- **설계**: 계정별 category를 ad_creative_embeddings에 전파
- **구현**: ad_accounts에 category 컬럼 없어서 undefined로 처리
- **영향**: 카테고리 필터 검색 시 빈 결과. 추후 ad_accounts에 category 추가 필요

## 수정 불필요 항목
- e2e 테스트 파일의 tsc 에러는 기존 이슈 (이번 변경 무관)
- 기존 51개 lint error는 이번 변경 이전부터 존재

## 빌드 검증
- [x] tsc --noEmit: 통과 (신규 파일 에러 0)
- [x] npm run build: 성공
- [x] lint: 신규 파일 에러 0

## 신규 파일 목록 (7파일)
1. `src/lib/protractor/creative-image-fetcher.ts` — T2
2. `src/lib/ad-creative-embedder.ts` — T3
3. `src/app/api/cron/embed-creatives/route.ts` — T4
4. `src/lib/competitor/competitor-creative-embedder.ts` — T5
5. `supabase/migrations/20260316_search_similar_creatives.sql` — T6
6. `src/lib/lp-crawler.ts` — T7
7. `docs/01-plan/features/phase2-creative-embedding.plan.md` — Plan
8. `docs/02-design/features/phase2-creative-embedding.design.md` — Design

## 기존 파일 수정 (0파일)
없음. 모두 신규 파일.
