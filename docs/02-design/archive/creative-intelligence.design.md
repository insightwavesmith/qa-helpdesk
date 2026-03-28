# Creative Intelligence — Design

## 1. 데이터 모델

### 1.1 creative_element_analysis (신규)
```sql
CREATE TABLE IF NOT EXISTS creative_element_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL UNIQUE,
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

ALTER TABLE creative_element_analysis ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_element_analysis
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_element_analysis
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cea_ad_id ON creative_element_analysis(ad_id);
CREATE INDEX IF NOT EXISTS idx_cea_account_id ON creative_element_analysis(account_id);
```

### 1.2 creative_element_performance (신규)
```sql
CREATE TABLE IF NOT EXISTS creative_element_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  element_type TEXT NOT NULL,
  element_value TEXT NOT NULL,
  sample_count INTEGER,
  avg_roas FLOAT,
  avg_ctr FLOAT,
  avg_conversion_rate FLOAT,
  p75_roas FLOAT,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(element_type, element_value)
);

ALTER TABLE creative_element_performance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_element_performance
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_element_performance
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cep_type ON creative_element_performance(element_type);
```

### 1.3 creative_intelligence_scores (신규)
```sql
CREATE TABLE IF NOT EXISTS creative_intelligence_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ad_id TEXT NOT NULL UNIQUE,
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

ALTER TABLE creative_intelligence_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON creative_intelligence_scores
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "authenticated_read" ON creative_intelligence_scores
  FOR SELECT TO authenticated USING (true);
CREATE INDEX IF NOT EXISTS idx_cis_ad_id ON creative_intelligence_scores(ad_id);
CREATE INDEX IF NOT EXISTS idx_cis_account_id ON creative_intelligence_scores(account_id);
```

### 1.4 lp_structure_analysis 확장 (ALTER)
```sql
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
```

## 2. API 설계

### 2.1 POST /api/admin/creative-analysis/run
소재 요소 분석 배치 실행 (Gemini 2.0 Pro).
- 요청: `{ batchSize?: number, accountId?: string }`
- 응답: `{ processed, analyzed, errors }`
- 동작: creative_element_analysis에 없는 소재 → Gemini 2.0 Pro → INSERT

### 2.2 GET /api/admin/creative-benchmark?element=hook_type
요소별 성과 벤치마크 조회.
- 응답: `{ element_type, values: [{ value, sample_count, avg_roas, avg_ctr, p75_roas }] }`

### 2.3 POST /api/admin/creative-intelligence/score
종합 점수 + 제안 생성.
- 요청: `{ batchSize?: number, accountId?: string }`
- 응답: `{ processed, scored, errors }`
- 동작: 태깅 + 벤치마크 + 성과 데이터 → Gemini 2.0 Pro → 점수 + 제안

### 2.4 GET /api/admin/creative-intelligence?account_id=xxx
소재별 점수/제안 조회.
- 응답: `{ account_id, total, results: [{ ad_id, overall_score, scores, suggestions }] }`

## 3. 스크립트

### 3.1 scripts/analyze-creatives.mjs
Gemini 2.0 Pro 기반 소재 요소 태깅 배치 스크립트.
- ad_creative_embeddings에서 media_url 있는 소재 조회
- Gemini 2.0 Pro에 이미지/영상 + 프롬프트 전달
- 결과 → creative_element_analysis INSERT

### 3.2 scripts/compute-benchmarks.mjs
요소별 성과 통계 계산.
- creative_element_analysis JOIN daily_ad_insights
- 요소별 (hook_type, style, cta_type 등) 평균 ROAS/CTR/전환율 계산
- creative_element_performance UPSERT

### 3.3 scripts/score-creatives.mjs
종합 점수 + 제안 생성.
- creative_element_analysis + creative_element_performance + daily_ad_insights
- Gemini 2.0 Pro에 데이터 전달 → 점수 + 제안 JSON
- creative_intelligence_scores INSERT

## 4. 신규 파일
| 파일 | 역할 |
|------|------|
| `scripts/analyze-creatives.mjs` | 소재 요소 태깅 배치 |
| `scripts/compute-benchmarks.mjs` | 벤치마크 통계 |
| `scripts/score-creatives.mjs` | 종합 점수 + 제안 |
| `src/app/api/admin/creative-analysis/run/route.ts` | 소재 분석 실행 API |
| `src/app/api/admin/creative-benchmark/route.ts` | 벤치마크 조회 API |
| `src/app/api/admin/creative-intelligence/route.ts` | 점수/제안 조회 API |
| `src/app/api/admin/creative-intelligence/score/route.ts` | 점수 생성 API |

## 5. 에러 처리
| 상황 | 처리 |
|------|------|
| Gemini 실패 | skip, 로그 기록 |
| 이미지 다운로드 실패 | skip |
| 성과 데이터 없음 | 벤치마크 기반으로만 점수 산출 |
| 미인증/비관리자 | 401/403 |

## 6. 구현 순서
1. [ ] SQL 마이그레이션 작성
2. [ ] scripts/analyze-creatives.mjs (Layer 1)
3. [ ] POST /api/admin/creative-analysis/run (Layer 1 API)
4. [ ] scripts/compute-benchmarks.mjs (Layer 3)
5. [ ] GET /api/admin/creative-benchmark (Layer 3 API)
6. [ ] scripts/score-creatives.mjs (Layer 4)
7. [ ] POST /api/admin/creative-intelligence/score (Layer 4 API)
8. [ ] GET /api/admin/creative-intelligence (Layer 4 API)
9. [ ] tsc + build 검증
