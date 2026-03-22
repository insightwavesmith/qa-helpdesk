# TASK: Creative Intelligence — 광고 소재 + LP 통합 분석 시스템

CLAUDE.md 읽고 delegate 모드로 팀원 만들어서 진행해라.

## 배경
레퍼런스: Alison.ai (Creative Genome), AdCreative.ai (340 데이터포인트), Madgicx (Creative Intelligence)
우리 차별점: 소재+LP+실제성과(ROAS/CTR) 3자 연결 — 경쟁사는 소재만 분석.

## 목표
수강생 광고 소재와 LP를 5레이어로 분석하고, 실제 성과 데이터 기반 제안을 자동 생성한다.

## 아키텍처 — 5 Layer Creative Intelligence

### Layer 1: Element Tagging (요소 분해)
모델: Gemini 2.0 Pro
입력: 소재 이미지/영상 + LP 스크린샷
출력: 구조화 JSON

**광고 소재 태깅:**
```json
{
  "format": "image|video|carousel|gif",
  "duration_sec": 15,
  "hook": { "type": "question|shock|benefit|problem", "text": "피부 트러블 고민?", "position_sec": 0 },
  "product_visibility": { "position": "center|side|background", "size_pct": 30 },
  "human_presence": { "face": true, "body": "upper|full|none", "expression": "smile|neutral|surprise" },
  "text_overlay": { "ratio_pct": 20, "headline": "50% 할인", "cta_text": "지금 구매" },
  "color": { "dominant": "#FF6B6B", "palette": ["#FF6B6B", "#4ECDC4", "#FFF"], "tone": "warm|cool|neutral", "contrast": "high|medium|low" },
  "style": "ugc|professional|minimal|bold|lifestyle",
  "social_proof": { "review_shown": true, "before_after": true, "testimonial": false },
  "cta": { "type": "button|text|overlay", "position": "bottom|center|end_frame", "color": "#FF6B6B" },
  "video_structure": {
    "scenes": [
      { "sec": "0-3", "type": "hook", "desc": "문제 제기" },
      { "sec": "3-8", "type": "demo", "desc": "제품 사용" },
      { "sec": "8-12", "type": "result", "desc": "비포/애프터" },
      { "sec": "12-15", "type": "cta", "desc": "구매 유도" }
    ],
    "pacing": "fast|medium|slow",
    "bgm": true,
    "narration": false
  }
}
```

**LP 확장 분석 (기존 구조 분석 + 신규 항목):**
```json
{
  "hero": { "type": "image|video|gif|slide", "count": 1, "autoplay": true },
  "color": { "dominant": "#FF6B6B", "palette": [], "tone": "warm", "bg_color": "#FFF" },
  "gif_usage": { "count": 3, "positions": ["hero", "mid", "review"], "purpose": ["before_after", "demo", "result"] },
  "video_usage": { "count": 1, "autoplay": true, "position": "hero" },
  "text_density": { "ratio_pct": 40, "headline_size": "large|medium|small", "readability": "high|medium|low" },
  "price": { "position": "top|mid", "discount_highlight": true, "strikethrough": true, "color": "#FF0000" },
  "reviews": {
    "position_pct": 30,
    "type": "photo_card|text|video|alpha_review",
    "density": "high|medium|low|none",
    "count_visible": 47,
    "photo_review_ratio_pct": 60,
    "video_review_count": 3
  },
  "cta": { "type": "sticky|floating|inline", "color": "#FF6B6B", "text": "구매하기" },
  "social_proof": { "rating": 4.8, "review_count": 1247, "badges": ["best_seller", "free_shipping"] },
  "trust_signals": ["free_return", "authentic_guarantee", "secure_payment"],
  "option_modal": {
    "options": ["색상", "사이즈"],
    "cross_sell": false,
    "easy_pay": ["kakaopay", "naverpay"],
    "urgency": { "stock_display": true, "time_deal": false },
    "touches_to_checkout": 3
  },
  "page_speed": "fast|medium|slow",
  "mobile_ux": { "font_readable": true, "tap_target_ok": true, "scroll_depth": "long" }
}
```

### Layer 2: Saliency Prediction (시선 예측)
오픈소스 모델 사용 (DeepGaze III 또는 TranSalNet)
입력: 소재 이미지 / LP 스크린샷
출력: 히트맵 이미지 + 시선 순서 + CTA 주목도 점수

```json
{
  "attention_map_url": "storage://saliency/xxx.jpg",
  "top_fixations": [
    { "x": 195, "y": 120, "rank": 1, "element": "headline" },
    { "x": 195, "y": 400, "rank": 2, "element": "product" },
    { "x": 195, "y": 700, "rank": 3, "element": "cta" }
  ],
  "cta_attention_score": 0.72,
  "cognitive_load": "medium"
}
```

구현: Python 스크립트로 추론 → JSON + 히트맵 이미지 저장
비용: $0 (로컬 추론)

### Layer 3: Performance Correlation (성과 매핑)
daily_ad_insights의 실제 성과 데이터 연결
입력: 요소 태깅 결과 + daily_ad_insights (ROAS, CTR, 전환율 등)
출력: 요소별 성과 상관관계

```sql
-- 예: hook 타입별 평균 ROAS
SELECT 
  creative_analysis->>'hook_type' as hook_type,
  AVG(roas) as avg_roas,
  AVG(ctr) as avg_ctr,
  COUNT(*) as sample_count
FROM ad_creative_embeddings ace
JOIN daily_ad_insights dai ON ace.ad_id = dai.ad_id
WHERE dai.spend > 0
GROUP BY hook_type
ORDER BY avg_roas DESC;
```

결과 저장: creative_element_performance 테이블

### Layer 4: Benchmark & Suggestion (비교 + 제안)
모델: Gemini 2.0 Pro
입력: 요소 태깅 + 성과 데이터 + 벤치마크 통계
출력: 구체적 개선 제안

```json
{
  "ad_id": "120235668217660327",
  "overall_score": 72,
  "scores": {
    "visual_impact": 80,
    "message_clarity": 65,
    "cta_effectiveness": 70,
    "social_proof": 85,
    "lp_consistency": 56
  },
  "suggestions": [
    {
      "priority": "high",
      "category": "hook",
      "current": "정적 제품 이미지, 후킹 없음",
      "benchmark": "ROAS 상위 소재 83%가 첫 3초 문제 제기형 후킹 사용",
      "suggestion": "첫 프레임에 '피부 트러블 고민?' 텍스트 오버레이 추가",
      "expected_impact": "CTR +15~25% (동일 카테고리 데이터 기반)"
    },
    {
      "priority": "medium",
      "category": "lp_consistency",
      "current": "소재는 밝은 톤, LP는 어두운 톤 → 일관성 34%",
      "suggestion": "LP 히어로 이미지를 소재와 동일한 밝은 톤으로 교체",
      "expected_impact": "전환율 +10~15%"
    }
  ]
}
```

### Layer 5: Creative-LP Consistency (소재↔LP 연결)
기존 creative_lp_consistency 확장
추가: 요소 레벨 일관성 (색상 일치, 메시지 일치, 톤 일치)

```json
{
  "color_match": 0.85,
  "message_match": 0.62,
  "tone_match": 0.78,
  "product_match": 0.91,
  "offer_match": 0.95,
  "total": 0.82
}
```

## DB 스키마

```sql
-- 소재 요소 태깅 결과
CREATE TABLE IF NOT EXISTS creative_element_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL,
  account_id TEXT,
  format TEXT,
  hook_type TEXT,
  hook_text TEXT,
  product_position TEXT,
  product_size_pct FLOAT,
  human_presence BOOLEAN,
  text_overlay_ratio FLOAT,
  dominant_color TEXT,
  color_tone TEXT,
  color_contrast TEXT,
  style TEXT,
  social_proof_types TEXT[],
  cta_type TEXT,
  cta_position TEXT,
  cta_color TEXT,
  video_scenes JSONB,
  video_pacing TEXT,
  has_bgm BOOLEAN,
  has_narration BOOLEAN,
  raw_analysis JSONB,
  model_version TEXT DEFAULT 'gemini-2.0-pro',
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

-- LP 확장 분석 (기존 lp_structure_analysis에 컬럼 추가)
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS dominant_color TEXT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS color_palette TEXT[];
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS color_tone TEXT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS gif_count INTEGER DEFAULT 0;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS gif_positions TEXT[];
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS video_count INTEGER DEFAULT 0;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS video_autoplay BOOLEAN;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS text_density_pct FLOAT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS photo_review_ratio FLOAT;
ALTER TABLE lp_structure_analysis ADD COLUMN IF NOT EXISTS video_review_count INTEGER DEFAULT 0;

-- 요소별 성과 통계 (벤치마크)
CREATE TABLE IF NOT EXISTS creative_element_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_type TEXT NOT NULL,
  element_value TEXT NOT NULL,
  sample_count INTEGER,
  avg_roas FLOAT,
  avg_ctr FLOAT,
  avg_conversion_rate FLOAT,
  p75_roas FLOAT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 소재 종합 점수 + 제안
CREATE TABLE IF NOT EXISTS creative_intelligence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL,
  account_id TEXT,
  overall_score FLOAT,
  visual_impact_score FLOAT,
  message_clarity_score FLOAT,
  cta_effectiveness_score FLOAT,
  social_proof_score FLOAT,
  lp_consistency_score FLOAT,
  suggestions JSONB,
  benchmark_comparison JSONB,
  model_version TEXT DEFAULT 'gemini-2.0-pro',
  scored_at TIMESTAMPTZ DEFAULT now()
);

-- 시선 예측 (Layer 2)
CREATE TABLE IF NOT EXISTS creative_saliency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT,
  lp_url TEXT,
  target_type TEXT DEFAULT 'creative',
  attention_map_url TEXT,
  top_fixations JSONB,
  cta_attention_score FLOAT,
  cognitive_load TEXT,
  model_version TEXT,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);
```

## API 엔드포인트

```
POST /api/admin/creative-analysis/run      — 소재 요소 분석 실행 (배치)
POST /api/admin/lp-analysis/run            — LP 확장 분석 실행 (배치)
POST /api/admin/creative-intelligence/score — 종합 점수 + 제안 생성
GET  /api/admin/creative-intelligence?account_id=xxx — 소재별 점수/제안 조회
GET  /api/admin/creative-benchmark?element=hook_type  — 벤치마크 통계
GET  /api/admin/creative-saliency?ad_id=xxx — 시선 예측 결과
```

## 스크립트

```
scripts/analyze-creatives.mjs  — 소재 요소 태깅 배치 (Gemini 2.0 Pro)
scripts/analyze-lps.mjs        — LP 확장 분석 (기존 수정, 색상/GIF/텍스트밀도 추가)
scripts/compute-benchmarks.mjs — 요소별 성과 통계 계산
scripts/score-creatives.mjs    — 종합 점수 + 제안 생성
scripts/saliency-predict.py    — 시선 예측 (DeepGaze III, Python)
```

## 검증
- [ ] creative_element_analysis에 태깅 결과 저장 확인
- [ ] lp_structure_analysis 확장 컬럼 데이터 확인
- [ ] creative_element_performance 벤치마크 통계 확인
- [ ] creative_intelligence_scores에 점수 + 제안 확인
- [ ] 제안의 구체성 확인 (벤치마크 수치 + 구체적 액션)
- [ ] tsc --noEmit + next build 통과
- [ ] 기존 기능 영향 없음

## 우선순위
1. Layer 1 (요소 태깅) — 나머지 전부의 기반
2. Layer 3 (성과 매핑) — 벤치마크 데이터 구축
3. Layer 4 (점수 + 제안) — 수강생한테 보여줄 핵심
4. Layer 5 (LP 일관성 확장) — 기존 코드 확장
5. Layer 2 (시선 예측) — Python 별도, 나중에 가능

## 환경변수
- GEMINI_API_KEY: .env.local에 있음
- SUPABASE_SERVICE_ROLE_KEY: .env.local에 있음

## 금지사항
- main 브랜치 직접 push 금지, feature 브랜치에서 작업
- 기존 테이블 구조 파괴 금지 (ALTER ADD만)
- .env.local 수정 금지
