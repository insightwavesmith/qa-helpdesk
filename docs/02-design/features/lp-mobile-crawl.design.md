# LP 모바일 크롤링 + 소재↔LP 일관성 점수 — Design

## 1. 데이터 모델

### 1.1 lp_structure_analysis (신규)
```sql
CREATE TABLE IF NOT EXISTS lp_structure_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_url TEXT NOT NULL,
  viewport TEXT DEFAULT 'mobile',
  hero_type TEXT,
  price_position TEXT,
  discount_highlight BOOLEAN,
  review_position_pct FLOAT,
  review_type TEXT,
  review_density TEXT,
  review_count INTEGER,
  cta_type TEXT,
  social_proof JSONB,
  page_length TEXT,
  trust_badges TEXT[],
  option_types TEXT[],
  cross_sell BOOLEAN,
  easy_pay TEXT[],
  urgency_stock BOOLEAN,
  urgency_timedeal BOOLEAN,
  touches_to_checkout INTEGER,
  raw_analysis JSONB,
  model_version TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lp_structure_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON lp_structure_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON lp_structure_analysis
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_lsa_lp_url ON lp_structure_analysis(lp_url);
```

### 1.2 creative_lp_consistency (신규)
```sql
CREATE TABLE IF NOT EXISTS creative_lp_consistency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL,
  lp_url TEXT,
  visual_score FLOAT,
  video_score FLOAT,
  semantic_score FLOAT,
  cross_vt_score FLOAT,
  cross_tv_score FLOAT,
  holistic_score FLOAT,
  total_score FLOAT,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE creative_lp_consistency ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_lp_consistency
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_lp_consistency
  FOR SELECT TO authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_clc_ad_id ON creative_lp_consistency(ad_id);
```

### 1.3 ad_creative_embeddings 기존 컬럼 활용
lp_url, lp_screenshot_url, lp_cta_screenshot_url, lp_headline, lp_price,
lp_embedding, lp_text_embedding, lp_cta_embedding, lp_crawled_at 모두 기존 컬럼.
추가 ALTER 없음.

## 2. 스크립트 설계

### 2.1 scripts/crawl-lps-mobile.mjs
로컬 Playwright 모바일 크롤러. Railway 사용 안 함.

**동작:**
1. ad_creative_embeddings에서 lp_url IS NOT NULL 조회
2. Playwright chromium 브라우저 (iPhone 14 Pro 에뮬레이션)
   - viewport: 390×844, deviceScaleFactor: 3, isMobile: true, hasTouch: true
   - User-Agent: iPhone 14 Pro Safari
3. 각 LP URL:
   a. 페이지 로드 (networkidle, 30s timeout)
   b. 풀스크롤 → fullPage screenshot (JPEG quality 80)
   c. "구매하기"/"장바구니" 버튼 탐지 → 클릭 → 옵션창 screenshot
   d. 텍스트 추출: H1, 가격, 설명, OG 메타
4. 스크린샷 → Supabase Storage (`creatives/lp-mobile/{adId}/main.jpg`, `option.jpg`)
5. DB UPDATE: lp_screenshot_url, lp_cta_screenshot_url, lp_headline, lp_price, lp_crawled_at

### 2.2 scripts/analyze-lps.mjs
Claude Vision + 임베딩 + 일관성 점수 통합 스크립트.

**동작:**
1. ad_creative_embeddings에서 lp_screenshot_url IS NOT NULL AND lp_embedding IS NULL 조회
2. Claude Vision (claude-haiku-4-5-20251001):
   - 입력: viewport.jpg (390×844, 8000px 제한 대응) + option.jpg (있으면)
   - URL 소스 방식 (type: "url")
   - 출력: LP 구조 JSON
   - lp_structure_analysis INSERT
3. Gemini Embedding 3072차원:
   - 스크린샷 이미지 → lp_embedding
   - H1+설명 텍스트 → lp_text_embedding
   - 옵션창 이미지 → lp_cta_embedding
4. 일관성 점수 계산 (코사인 유사도):
   - visual: embedding_3072 ↔ lp_embedding
   - semantic: text_embedding_3072 ↔ lp_text_embedding
   - cross_vt: embedding_3072 ↔ lp_text_embedding
   - cross_tv: text_embedding_3072 ↔ lp_embedding
   - holistic: embedding_3072 ↔ lp_embedding (스크린샷)
   - video: embedding_3072 ↔ lp_embedding (VIDEO 소재만)
   - 가중 평균 → total_score
5. creative_lp_consistency INSERT

## 3. API 설계

### 3.1 GET /api/admin/creative-lp-consistency?account_id=xxx
소재↔LP 일관성 점수 조회.

**응답:**
```json
{
  "account_id": "xxx",
  "results": [
    {
      "ad_id": "...",
      "lp_url": "...",
      "visual_score": 0.82,
      "semantic_score": 0.75,
      "total_score": 0.78,
      "analyzed_at": "..."
    }
  ]
}
```

## 4. 신규 파일
| 파일 | 역할 |
|------|------|
| `supabase/migrations/20260318_lp_analysis.sql` | 신규 테이블 2개 |
| `scripts/crawl-lps-mobile.mjs` | 로컬 Playwright 모바일 크롤러 |
| `scripts/analyze-lps.mjs` | Claude Vision + 임베딩 + 일관성 점수 |
| `src/lib/lp-consistency.ts` | 일관성 점수 계산 로직 |
| `src/app/api/admin/creative-lp-consistency/route.ts` | 일관성 점수 API |

## 5. 에러 처리
| 상황 | 처리 |
|------|------|
| LP 로드 실패 (timeout/403) | skip, 로그 기록 |
| 구매 버튼 미발견 | 옵션창 screenshot skip |
| Claude Vision 실패 | skip, lp_structure_analysis 미저장 |
| 임베딩 실패 | 부분 저장 (성공한 것만) |
| account_id 누락 | 400 반환 |

## 6. 구현 순서
1. [ ] SQL 마이그레이션 실행
2. [ ] crawl-lps-mobile.mjs 작성 + 테스트
3. [ ] analyze-lps.mjs (Claude Vision + 임베딩 + 점수)
4. [ ] lp-consistency.ts + API route
5. [ ] tsc + build 검증
