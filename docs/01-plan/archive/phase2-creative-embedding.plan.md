# Phase 2: 소재·LP 분석 시스템 — Plan

## 목표
수강생/경쟁사의 광고 소재 이미지+카피를 임베딩하고, LP 크롤링 기초 구현.

## 배경
- Phase 1(임베딩 엔진 교체)에서 gemini-embedding-2-preview + 3072차원 전환 완료
- `ad_creative_embeddings` 테이블 migration SQL 이미 준비됨 (20260316)
- Meta Graph API에서 `image_hash`만 수집 중 → 실제 이미지 URL 미수집
- 경쟁사 분석은 SearchAPI.io로 이미지/카피 URL 수집 가능

## 범위
| 태스크 | 설명 | 의존성 |
|--------|------|--------|
| T1 | ad_creative_embeddings 테이블 migration 확인 | 없음 |
| T2 | 소재 이미지 URL 수집 파이프라인 (Meta Graph API) | T1 |
| T3 | ad-creative-embedder.ts 신규 생성 | T1 |
| T4 | 크론 API `/api/cron/embed-creatives` | T2, T3 |
| T5 | 경쟁사 소재 임베딩 | T3 |
| T6 | 소재 유사도 검색 RPC | T1 |
| T7 | LP 크롤러 기초 (fetch + cheerio) | T3 |

## 성공 기준
1. `npm run build` 성공
2. 소재 이미지 → 벡터 임베딩 파이프라인 동작
3. 경쟁사/자사 소재 같은 벡터 공간 저장
4. LP 기초 크롤링 (fetch + cheerio) 동작
5. 유사도 검색 RPC 존재

## 제약
- Playwright 미사용 (fetch + cheerio만)
- HNSW 인덱스 2개만 (embedding + lp_embedding)
- Meta API Rate Limit 고려: 배치 50개 + 500ms 딜레이
- feature 브랜치 작업, 서비스 무중단
