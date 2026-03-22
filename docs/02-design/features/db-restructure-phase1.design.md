# 데이터 아키텍처 재설계 Phase 1 — Design

## 1. 데이터 모델

### 1-1. landing_pages (신규)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | gen_random_uuid() |
| account_id | text NOT NULL | 광고계정 ID |
| canonical_url | text UNIQUE NOT NULL | 정규화된 URL |
| original_urls | text[] DEFAULT '{}' | 원본 URL 목록 |
| domain | text | 도메인 |
| product_id | text | 상품번호 |
| product_name | text | 상품명 |
| page_type | text DEFAULT 'product' | product/event/article/homepage/external |
| platform | text | cafe24/smartstore/custom/oliveyoung |
| is_active | boolean DEFAULT true | 활성 여부 |
| ad_count | int DEFAULT 0 | 연결 광고 수 |
| created_at | timestamptz | |
| updated_at | timestamptz | |

인덱스: account_id, domain, page_type

### 1-2. lp_snapshots (신규)
| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | uuid PK | gen_random_uuid() |
| lp_id | uuid FK→landing_pages | ON DELETE CASCADE |
| viewport | text NOT NULL | 'mobile' (375x812) / 'desktop' (1280x800) |
| screenshot_url | text | Storage URL |
| cta_screenshot_url | text | 옵션창 스크린샷 |
| screenshot_hash | text | 변경 감지 |
| cta_screenshot_hash | text | |
| crawled_at | timestamptz | |
| crawler_version | text | |

인덱스: lp_id, UNIQUE(lp_id, viewport)

## 2. 정규화 로직 (normalize-lps.mjs)

1. `?` 이후 파라미터 제거 (UTM, fbclid 등)
2. `/utm_source=` 경로 파라미터 제거
3. `surl/P/XX` → HTTP HEAD 리다이렉트 추적 → 최종 URL
4. 같은 도메인+상품ID → 병합 (cafe24: `/XX/category/`)
5. `www.도메인` = `도메인`, `m.도메인` = `도메인` 통합
6. fb.com/facebook.com/instagram.com/naver.com → page_type='external'
7. `/article/` 포함 → page_type='article'
8. 플랫폼 감지: cafe24(surl, product/detail.html), smartstore, oliveyoung

## 3. 크롤러 수정 (bscamp-crawler/server.js)

### 변경 사항
- `viewport` 파라미터 추가: 'mobile' | 'desktop'
- mobile: `{ width: 375, height: 812 }` + 모바일 UA
- desktop: `{ width: 1280, height: 800 }` (기존)
- 모바일 구매버튼: `position:fixed; bottom:0` 영역 우선 탐색
- 추가 셀렉터: `[class*="buy"], [class*="purchase"], .btn_buy, #btn_buy`
- CTA 대기 2초 → 3초

### API 변경
- POST /crawl: `{ url, clickCta, viewport }` — viewport 추가
- POST /crawl/batch: `{ urls, clickCta, viewport }` — viewport 추가

## 4. 에러 처리
- 리다이렉트 실패 → original URL 유지, page_type='unknown'
- HEAD 요청 타임아웃 → is_active=false
- 크롤링 실패 → retry 2회 → 실패 시 로그

## 5. 구현 순서
- [x] STEP 1: SQL 마이그레이션 파일 생성
- [ ] STEP 2: normalize-lps.mjs (dry-run → 실행)
- [ ] STEP 3: Railway 크롤러 viewport 수정
- [ ] STEP 4: validate-lp-crawl.mjs
- [ ] STEP 5: crawl-all-lps.mjs
