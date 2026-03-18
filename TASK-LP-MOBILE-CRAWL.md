# TASK: Phase 2 — LP 모바일 크롤링 + 소재↔LP 멀티모달 일관성 점수

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
기획서: https://mozzi-reports.vercel.app/reports/plan/2026-03-18-meta-embedding-architecture.html
기존 LP 크롤링(데스크톱)은 폐기. 모바일 뷰포트로 전면 재구축.

## 목표
1. LP를 모바일 뷰포트(iPhone 14 Pro)로 크롤링 — 상세페이지 + 구매 옵션창
2. Claude Vision으로 LP 구조 분석 (리뷰 위치/방식, 옵션 구조, CTA 등)
3. LP 요소별 Gemini Embedding 2 멀티모달 임베딩 (3072차원)
4. 소재↔LP 크로스모달 일관성 점수 계산

## 작업 내용

### 1. Playwright 모바일 크롤러
- iPhone 14 Pro 에뮬레이션 (390×844, touch, 모바일 UA)
- 캡처 대상 2종:
  - ① 상세페이지 풀스크롤 스크린샷 (JPEG, quality 80)
  - ② 구매하기 버튼 클릭 → 옵션창 스크린샷
- 추가 추출: 주요 이미지, 영상 URL, GIF, 텍스트(H1/설명/가격/후기), OG 메타
- 대상: ad_creative_embeddings에서 lp_url IS NOT NULL인 것 전부
- 스크린샷 저장: Supabase Storage

### 2. Claude Vision LP 구조 분석
- 모델: claude-haiku-4 (비용 효율)
- 입력: 상세페이지 스크린샷 + 옵션창 스크린샷
- 출력: 구조화 JSON
```json
{
  "hero": { "type": "image|video|slide|gif", "count": 1 },
  "price": { "position": "top|mid", "discount_highlight": true },
  "reviews": {
    "position_pct": 60,
    "type": "alpha_review|text|photo_card|video",
    "density": "high|medium|low|none",
    "count_visible": 47,
    "avg_length": "short|medium|long"
  },
  "cta": { "type": "sticky|floating|inline" },
  "social_proof": { "rating": 4.8, "review_count": "1,247", "hero_area": true },
  "page_length": "short|medium|long",
  "trust_badges": [],
  "option_modal": {
    "options": ["색상", "사이즈"],
    "cross_sell": false,
    "easy_pay": ["kakaopay", "naverpay"],
    "urgency": { "stock_display": false, "time_deal": false },
    "touches_to_checkout": 3
  }
}
```
- 결과 저장: lp_structure_analysis 테이블

### 3. LP 멀티모달 임베딩
- Gemini Embedding 2, 3072차원
- LP 요소별 임베딩:
  - 히어로 이미지 → embed(image)
  - LP 영상 → embed(video)  
  - LP 텍스트(H1+설명) → embed(text)
  - 전체 스크린샷 → embed(image)
- ad_creative_embeddings에 lp 관련 컬럼 업데이트

### 4. 소재↔LP 일관성 점수
- 6개 크로스모달 비교:
  - visual: 소재 이미지 ↔ LP 히어로 이미지
  - video: 소재 영상 ↔ LP 영상
  - semantic: 소재 카피 ↔ LP 텍스트
  - cross_vt: 소재 이미지 ↔ LP 텍스트
  - cross_tv: 소재 카피 ↔ LP 히어로 이미지
  - holistic: 소재 이미지 ↔ LP 전체 스크린샷
- 가중 평균 → 최종 일관성 점수
- 결과 저장: creative_lp_consistency 테이블
- API: GET /api/admin/creative-lp-consistency?account_id=xxx

### DB 스키마

```sql
-- LP 구조 분석
CREATE TABLE IF NOT EXISTS lp_structure_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lp_url TEXT,
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

-- 소재-LP 일관성 점수
CREATE TABLE IF NOT EXISTS creative_lp_consistency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT,
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
```

### 환경변수
- GEMINI_API_KEY: .env.local에 있음
- ANTHROPIC_API_KEY: .env.local에 있음 (Claude Vision용)
- SUPABASE_SERVICE_ROLE_KEY: .env.local에 있음

### 검증
- [ ] 모바일 스크린샷 Supabase Storage 저장 확인
- [ ] lp_structure_analysis에 구조 분석 결과 저장 확인
- [ ] LP 임베딩 3072차원 저장 확인
- [ ] creative_lp_consistency에 6개 점수 + total 저장 확인
- [ ] tsc --noEmit + next build 통과
- [ ] 기존 기능 영향 없음

### 금지사항
- 기존 데스크톱 크롤링 코드 삭제하지 마 (별도 스크립트로 작성)
- main 브랜치 직접 push 금지, feature 브랜치에서 작업
- .env.local 수정 금지
