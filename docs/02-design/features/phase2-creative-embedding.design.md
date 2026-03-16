# Phase 2: 소재·LP 분석 시스템 — Design

## 1. 데이터 모델

### ad_creative_embeddings 테이블 (이미 migration 존재)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID PK | |
| source | TEXT NOT NULL | 'own' \| 'competitor' |
| brand_id | UUID | |
| brand_name | TEXT | |
| account_id | TEXT | Meta ad account ID |
| category | TEXT | 업종 카테고리 |
| ad_id | TEXT UNIQUE | Meta 광고 ID |
| media_url | TEXT | 소재 이미지/동영상 URL |
| media_type | TEXT | IMAGE/VIDEO/CAROUSEL |
| ad_copy | TEXT | 광고 카피 텍스트 |
| creative_type | TEXT | |
| embedding | VECTOR(3072) | 소재 이미지 임베딩 |
| text_embedding | VECTOR(3072) | 카피 텍스트 임베딩 |
| lp_url | TEXT | 랜딩페이지 URL |
| lp_headline | TEXT | LP 헤드라인 |
| lp_price | TEXT | LP 가격 정보 |
| lp_embedding | VECTOR(3072) | LP OG 이미지 임베딩 |
| lp_text_embedding | VECTOR(3072) | LP 텍스트 임베딩 |
| lp_cta_embedding | VECTOR(3072) | LP CTA 임베딩 |
| roas | FLOAT | 성과 지표 |
| ctr | FLOAT | |
| media_hash | TEXT | 이미지 SHA256 중복 체크 |
| embedding_model | TEXT | |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |
| lp_crawled_at | TIMESTAMPTZ | |

### 인덱스
- HNSW: embedding, lp_embedding (핵심 2개만)
- B-tree: source, brand_id, category, ad_id

## 2. API 설계

### T2: Meta Graph API 소재 이미지 URL 수집
`src/lib/protractor/creative-image-fetcher.ts`
```
fetchCreativeImageUrls(accountId, imageHashes[]) → { hash → url }
  - GET /{account_id}/adimages?hashes={hashes}&fields=url_128,url
  - 재시도: fetchMetaWithRetry 패턴 활용
```

`fetchCreativeDetails(adIds[]) → { adId → { imageUrl, adCopy, lpUrl } }`
```
  - GET /{ad_id}?fields=creative{image_url,thumbnail_url,object_story_spec,effective_object_story_spec}
  - body text: object_story_spec.link_data.message
  - LP URL: effective_object_story_spec.link_data.link
```

### T3: ad-creative-embedder.ts
`src/lib/ad-creative-embedder.ts`
```
embedCreative(params) → { embeddingDone, textEmbeddingDone }
  - 이미지 URL → generateEmbedding({ imageUrl }, { taskType: 'RETRIEVAL_DOCUMENT' })
  - 카피 텍스트 → generateEmbedding(text, { taskType: 'RETRIEVAL_DOCUMENT' })
  - upsert to ad_creative_embeddings (ad_id 기준)
```

### T4: Cron API
`GET /api/cron/embed-creatives`
```
1. ad_accounts에서 active 계정 조회
2. 각 계정 ACTIVE 광고 조회 (fetchAccountAds)
3. 광고별 이미지 URL + 카피 + LP URL 수집 (fetchCreativeDetails)
4. ad_creative_embeddings upsert
5. embedding IS NULL인 row만 임베딩 실행 (배치 50개, 500ms 딜레이)
```

### T5: 경쟁사 소재 임베딩
`src/lib/competitor/competitor-creative-embedder.ts`
```
embedCompetitorAds(ads: CompetitorAd[], brandName, pageId) → void
  - transformSearchApiAd 결과에서 imageUrl + body + linkUrl 추출
  - source='competitor'로 ad_creative_embeddings 저장
```

### T6: 유사도 검색 RPC
```sql
search_similar_creatives(query_embedding, match_count, filter_source, filter_category)
  → { id, ad_id, brand_name, source, media_url, ad_copy, similarity }
```

### T7: LP 크롤러
`src/lib/lp-crawler.ts`
```
crawlLandingPage(url) → { headline, description, price, ogImageUrl, text }
  - fetch + cheerio
  - OG meta tags: og:title, og:description, og:image
  - 가격: 정규식 ₩/원/,000 패턴
  - 에러 시 null 반환 (크롤링 실패 허용)
```

## 3. 컴포넌트 구조
이 Phase는 백엔드/파이프라인 위주. UI 없음.

## 4. 에러 처리
| 상황 | 처리 |
|------|------|
| Meta API 429 | fetchMetaWithRetry (최대 2회, 지수 백오프) |
| 이미지 fetch 실패 | 해당 소재 건너뛰기, 로그 기록 |
| 임베딩 API 실패 | 해당 row 스킵, 다음 크론에서 재시도 |
| LP 크롤링 실패 | lp_crawled_at NULL 유지, 다음에 재시도 |
| cheerio 파싱 실패 | 빈 결과 반환 |

## 5. 구현 순서
- [x] T1: migration SQL 확인
- [ ] T2: creative-image-fetcher.ts 생성
- [ ] T3: ad-creative-embedder.ts 생성
- [ ] T6: 유사도 검색 RPC migration 추가
- [ ] T7: lp-crawler.ts 생성
- [ ] T4: cron embed-creatives route 생성
- [ ] T5: competitor-creative-embedder.ts 생성
