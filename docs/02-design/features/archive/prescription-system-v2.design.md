# 처방 시스템 v2 설계서

> 작성일: 2026-03-26
> 작성자: PM팀 (Leader)
> 상태: Design 완료
> 기반 문서: `docs/01-plan/features/prescription-system-v2.plan.md`
> 선행 문서: `docs/02-design/features/prescription-system-mvp.design.md` (MVP 2축 → v2 3축 확장)
> 모찌 리포트: `2026-03-25-prescription-system-v2` (Plan 검증 완료)

---

## Executive Summary

| 항목 | 내용 |
|------|------|
| **기능** | 3축 통합 처방 엔진 (레퍼런스 원론 + 내부 데이터 패턴 + Motion 글로벌 벤치마크) |
| **핵심 변경** | MVP 2회 Gemini 호출 → v2 **1회 통합** (5축 분석 + 처방 동시 생성) |
| **신규 기능** | 성과역추적, Andromeda 다양성 경고, GEM/EAR 영향 분석, Motion 글로벌 백분위 |
| **최종 목적함수** | `reach_to_purchase_rate` (노출당구매확률) |
| **예상 비용** | ~$1.3~2.0/월 (on-demand + 주간 신규) |
| **Phase** | 5단계: 파이프라인 완성 → 기반 인프라(1주) → 처방 엔진(1.5주) → UI(1주) → 검증(0.5주) |

### Value Delivered

| 관점 | 내용 |
|------|------|
| **Problem** | 기존 5축 분석은 "이런 속성이다"만 알려주고 "어떻게 고쳐라"는 없음. 수강생이 실행 불가. |
| **Solution** | 성과 데이터에서 약점을 역추적 → 3축 근거 기반 구체적 처방 Top3 자동 생성 |
| **Function UX Effect** | 소재 상세 → 처방 탭 클릭 → 15초 내 "CTA를 혜택 명시형으로 변경" 같은 실행 가능 처방 |
| **Core Value** | 노출당구매확률을 올리는 가장 임팩트 큰 변경을 과학적 근거로 제시 |

---

## 1. 데이터 모델

### 1.1 prescription_patterns 테이블 (축2: 내부 데이터 패턴)

MVP 대비 변경: `confidence` 기준 강화 (CLT 기반), `lift_ci_lower` 컬럼 추가.

```sql
CREATE TABLE prescription_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 속성 식별 (ATTRIBUTE_AXIS_MAP 기준 14개 속성)
  attribute TEXT NOT NULL,         -- 'hook.hook_type', 'text.cta_text' 등
  value TEXT NOT NULL,             -- 'problem', 'curiosity', 'timer' 등
  axis TEXT NOT NULL,              -- 'visual'|'text'|'psychology'|'quality'|'hook'

  -- 성과 지표 (METRIC_GROUPS 기준)
  metric TEXT NOT NULL,            -- 'ctr', 'video_p3s_rate', 'reach_to_purchase_rate' 등
  avg_value NUMERIC,               -- 속성값의 지표 평균
  median_value NUMERIC,            -- 속성값의 지표 중위값
  sample_count INTEGER NOT NULL DEFAULT 0,
  confidence TEXT NOT NULL DEFAULT 'low',
    -- ★v2 CLT 기반: 'high'(N≥100, 작은 효과크기 감지) / 'medium'(N≥30, 정규 근사) / 'low'(N<30)
  lift_vs_average NUMERIC,         -- = (속성평균 - 전체평균) / 전체평균 × 100
  lift_ci_lower NUMERIC,           -- ★v2 신규: lift의 95% 신뢰구간 하한값 (≥0이면 통계적 유의)

  -- 메타
  category TEXT,                   -- 'beauty', 'fashion' 등 (NULL = 전체)
  source TEXT NOT NULL DEFAULT 'internal',  -- 'internal' / 'motion' / 'benchmark'
  calculated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(attribute, value, metric, category, source)
);

-- 인덱스
CREATE INDEX idx_pp_attr_value ON prescription_patterns(attribute, value);
CREATE INDEX idx_pp_metric ON prescription_patterns(metric);
CREATE INDEX idx_pp_category ON prescription_patterns(category);
CREATE INDEX idx_pp_lookup ON prescription_patterns(attribute, category, confidence);

-- RLS (읽기 전용 집계 테이블)
ALTER TABLE prescription_patterns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescription_patterns_select" ON prescription_patterns
  FOR SELECT TO authenticated USING (true);
```

#### confidence 결정 로직 (CLT 기반)

```typescript
function determineConfidence(sampleCount: number): 'high' | 'medium' | 'low' {
  if (sampleCount >= 100) return 'high';   // 작은 효과크기(d=0.2) 감지 가능
  if (sampleCount >= 30) return 'medium';   // CLT 정규 근사 적용 가능
  return 'low';                              // → 축3(Motion 글로벌)로 보정 필수
}
```

#### 카테고리 fallback 로직 (v2 확장)

```
1. 소재의 category 확인 (creative.category)
2. prescription_patterns에서 해당 category + confidence IN ('high','medium') 조회
3. 결과 없거나 N<30 → category IS NULL (전체 ALL 패턴) fallback
4. ALL 패턴도 N<30 → ★축3(Motion 글로벌 벤치마크)로 보정 필수
5. 축3도 없으면 → 축1(레퍼런스 원론)만으로 처방 생성
```

### 1.2 prescription_benchmarks 테이블 (★v2 신규: 축3 글로벌 벤치마크)

Motion $1.3B 광고 비용 기반 글로벌 벤치마크 데이터 저장.

```sql
CREATE TABLE prescription_benchmarks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 식별
  source TEXT NOT NULL,            -- 'motion_global' / 'internal_top10' / 'motion_category'
  media_type TEXT,                 -- 'IMAGE' / 'VIDEO' / NULL(전체)
  category TEXT,                   -- 'beauty', 'fashion' 등 (NULL = 전체)

  -- 지표 백분위 분포
  metric TEXT NOT NULL,            -- METRIC_GROUPS 기준 키
  p10 NUMERIC,                     -- 하위 10% 값
  p25 NUMERIC,                     -- 하위 25% 값
  p50 NUMERIC,                     -- 중위값
  p75 NUMERIC,                     -- 상위 25% 값
  p90 NUMERIC,                     -- 상위 10% 값
  sample_count INTEGER,

  -- 메타
  period TEXT,                     -- '2026-Q1', '2025-Q4' 등
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(source, media_type, category, metric, period)
);

-- 인덱스
CREATE INDEX idx_pb_lookup ON prescription_benchmarks(source, media_type, category, metric);
CREATE INDEX idx_pb_period ON prescription_benchmarks(period);

-- RLS
ALTER TABLE prescription_benchmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "prescription_benchmarks_select" ON prescription_benchmarks
  FOR SELECT TO authenticated USING (true);
```

#### 백분위 산정 함수

```typescript
// 대상 소재 지표의 글로벌 백분위 산정
function calculateGlobalPercentile(
  actualValue: number,
  benchmark: { p10: number; p25: number; p50: number; p75: number; p90: number }
): number {
  if (actualValue <= benchmark.p10) return 5;
  if (actualValue <= benchmark.p25) return 10 + ((actualValue - benchmark.p10) / (benchmark.p25 - benchmark.p10)) * 15;
  if (actualValue <= benchmark.p50) return 25 + ((actualValue - benchmark.p25) / (benchmark.p50 - benchmark.p25)) * 25;
  if (actualValue <= benchmark.p75) return 50 + ((actualValue - benchmark.p50) / (benchmark.p75 - benchmark.p50)) * 25;
  if (actualValue <= benchmark.p90) return 75 + ((actualValue - benchmark.p75) / (benchmark.p90 - benchmark.p75)) * 15;
  return 95;
}
```

### 1.3 기존 테이블 활용 (수정 없음)

| 테이블 | 처방에서의 용도 | 접근 방식 |
|--------|---------------|----------|
| `creative_media` | analysis_json(5축), embedding(3072D), saliency_url, video_analysis | `svc.from("creative_media")` |
| `creative_saliency` | cta_attention_score, cognitive_load, top_fixations, attention_map_url | `svc.from("creative_saliency")` |
| `daily_ad_insights` | CTR, ROAS, 3초시청률, 참여율 등 성과 지표 | `svc.from("daily_ad_insights")` |
| `ad_creative_embeddings` | 768차원 임베딩 (HNSW 인덱스, 유사소재 검색) | `svc.rpc("search_similar_creatives")` |
| `creatives` | ad_id, account_id, category, lp_url | `svc.from("creatives")` |
| `benchmarks` | creative_type별 ABOVE_AVERAGE 벤치마크 | `svc.from("benchmarks")` |

### 1.4 analysis_json v3 스키마 (creative_media.analysis_json)

Gemini 1회 통합 호출의 출력이자 `creative_media.analysis_json`에 저장되는 구조.

```typescript
interface AnalysisJsonV3 {
  // ── 5축 분석 ──
  visual: {
    color_scheme: 'warm' | 'cool' | 'neutral' | 'vibrant' | 'muted';
    product_visibility: 'high' | 'medium' | 'low' | 'none';
    color: { contrast: 'high' | 'medium' | 'low' };
  };
  text: {
    headline: string;
    headline_type: 'benefit' | 'curiosity' | 'question' | 'shock' | 'problem' | 'none';
    cta_text: string;
    key_message: string;
    readability: 'high' | 'medium' | 'low';
    social_proof: {
      review_shown: boolean;
      before_after: boolean;
      testimonial: boolean;
      numbers: boolean;
    };
  };
  psychology: {
    emotion: 'fear' | 'joy' | 'surprise' | 'trust' | 'anticipation' | 'sadness' | 'anger' | 'neutral';
    social_proof_type: 'testimonial' | 'numbers' | 'celebrity' | 'expert' | 'none';
    urgency: 'timer' | 'limited' | 'seasonal' | 'fomo' | 'none';
    authority: 'expert' | 'celebrity' | 'brand' | 'data' | 'none';
  };
  quality: {
    production_quality: 'professional' | 'semi' | 'ugc' | 'low';
    brand_consistency: 'high' | 'medium' | 'low';
    readability: 'high' | 'medium' | 'low';
  };
  hook: {
    hook_type: 'problem' | 'curiosity' | 'benefit' | 'shock' | 'question' | 'confession' | 'contrast' | 'relatability' | 'none';
    visual_style: 'ugc' | 'professional' | 'minimal' | 'bold' | 'lifestyle' | 'before_after';
    composition: 'center' | 'rule_of_thirds' | 'split' | 'layered' | 'full_bleed';
  };

  // ── v2 확장 ──
  attention: {
    cta_attention_score: number;  // 0.0~1.0
    primary_focus: string;
    gaze_pattern: string;
  };
  audio?: {  // 영상 전용
    has_narration: boolean;
    narration_tone: 'professional' | 'casual' | 'energetic' | 'calm';
    bgm_genre: 'upbeat' | 'calm' | 'dramatic' | 'trendy' | 'none';
    sound_effects: boolean;
  };
  structure?: {  // 영상 전용
    scene_count: number;
    avg_scene_duration: number;
    pacing: 'fast' | 'medium' | 'slow';
    transition_pattern: string;
    loop_structure: boolean;
  };
  deepgaze_context: {
    cta_attention_score: number;
    dominant_region: string;
    top_fixation: { x: number; y: number; ratio: number };
  };
  andromeda_signals: {
    visual_fingerprint: string;
    text_fingerprint: string;
    audio_fingerprint?: string;
    structure_fingerprint?: string;
    similar_creatives: Array<{
      creative_id: string;
      similarity: number;
      overlap_axes: string[];
    }>;
  };

  // ── 점수 ──
  scores: {
    visual_impact: number;      // 0~100
    message_clarity: number;
    cta_effectiveness: number;
    social_proof_score: number;
    overall: number;
  };

  // ── v2 처방 결과 (Gemini 1회 통합 출력) ──
  performance_backtrack?: {
    worst_metrics: Array<{
      metric: string;
      actual: number;
      benchmark: number;
      deviation: number;  // %
      group: 'foundation' | 'engagement' | 'conversion';
    }>;
    affected_attributes: string[];
    focus_stage: string;
    journey_breakdown: Record<string, { status: string; deviation: string }>;
  };
  top3_prescriptions?: Array<{
    rank: number;
    title: string;
    action: string;
    journey_stage: string;
    expected_impact: string;
    evidence_axis1: string;
    evidence_axis2: string;
    evidence_axis3: string;
    difficulty: '쉬움' | '보통' | '어려움';
    difficulty_reason: string;
    performance_driven: boolean;
  }>;
  andromeda_warning?: {
    level: 'low' | 'medium' | 'high';
    message: string;
    similar_pairs: Array<{ creative_id: string; similarity: number; overlap_axes: string[] }>;
    diversification_suggestion: {
      persona: string;
      desire: string;
      awareness: string;
    };
    diversity_score: number;
  };
  ear_analysis?: {
    primary_bottleneck: 'foundation' | 'engagement' | 'conversion';
    bottleneck_detail: string;
    improvement_priority: string;
  };
  meta?: {
    model: string;
    latency_ms: number;
    axis2_used: boolean;
    axis3_used: boolean;
    patterns_count: number;
    benchmarks_count: number;
    category_fallback: boolean;
    similar_count: number;
    andromeda_analyzed: boolean;
  };
}
```

---

## 2. API 설계

### 2.1 처방 생성 API

**`POST /api/protractor/prescription`**

신규 파일: `src/app/api/protractor/prescription/route.ts`

#### 요청

```typescript
interface PrescriptionRequest {
  creative_media_id: string;   // creative_media.id (UUID)
  account_id: string;          // 계정 소유권 검증용
  force_refresh?: boolean;     // true면 캐시 무시하고 재생성
}
```

#### 응답 (성공: 200)

```typescript
interface PrescriptionResponse {
  // 5축 분석
  five_axis: AnalysisJsonV3;

  // 점수 + 백분위
  scores: {
    visual_impact: number;
    message_clarity: number;
    cta_effectiveness: number;
    social_proof_score: number;
    overall: number;
  };
  percentiles: Record<string, number>;  // 카테고리 내 백분위

  // ★ 처방 Top3
  top3_prescriptions: Array<{
    rank: number;
    title: string;
    action: string;
    journey_stage: '감각' | '사고' | '행동(클릭)' | '행동(구매)';
    expected_impact: string;
    evidence_axis1: string;
    evidence_axis2: string;
    evidence_axis3: string;
    difficulty: '쉬움' | '보통' | '어려움';
    difficulty_reason: string;
    performance_driven: boolean;
  }>;

  // ★ 성과역추적
  performance_backtrack: {
    worst_metrics: Array<{
      metric: string;
      label: string;
      actual: number;
      benchmark: number;
      deviation: number;
      group: string;
    }>;
    affected_attributes: string[];
    focus_stage: string;
    journey_breakdown: {
      감각: { status: string; deviation: string };
      사고: { status: string; deviation: string };
      행동_클릭: { status: string; deviation: string };
      행동_구매: { status: string; deviation: string };
    };
  };

  // ★ Andromeda 다양성 경고
  andromeda_warning: {
    level: 'low' | 'medium' | 'high';
    message: string;
    similar_pairs: Array<{
      creative_id: string;
      similarity: number;
      overlap_axes: string[];
    }>;
    diversification_suggestion: {
      persona: string;
      desire: string;
      awareness: string;
    };
    diversity_score: number;
  } | null;

  // ★ EAR 분석
  ear_analysis: {
    primary_bottleneck: string;
    bottleneck_detail: string;
    improvement_priority: string;
  };

  // 고객 여정 요약
  customer_journey_summary: {
    sensation: string;
    thinking: string;
    action_click: string;
    action_purchase: string;
  };

  // 약점 분석
  weakness_analysis: Array<{
    axis: string;
    attribute: string;
    attribute_label: string;
    current_percentile: number;
    global_percentile: number;
    issue: string;
    benchmark_comparison: string;
    affects_groups: string[];
    ear_impact: string;
  }>;

  // 메타
  meta: {
    model: string;
    latency_ms: number;
    axis2_used: boolean;
    axis3_used: boolean;
    patterns_count: number;
    benchmarks_count: number;
    category_fallback: boolean;
    similar_count: number;
    andromeda_analyzed: boolean;
    has_performance_data: boolean;
  };
}
```

#### 에러 응답

| 상태 코드 | 에러 | 설명 |
|:---------:|------|------|
| 400 | `creative_media_id 필수` | 요청 body에 creative_media_id 없음 |
| 401 | `인증이 필요합니다` | 미인증 |
| 403 | `접근 권한이 없습니다` | 역할 미달 (student/member/admin만 허용) |
| 403 | `계정 접근 권한이 없습니다` | account_id 소유권 불일치 |
| 404 | `소재를 찾을 수 없습니다` | creative_media_id 미존재 |
| 500 | `처방 생성 중 오류` | Gemini API 실패 등 |
| 504 | `처방 생성 시간 초과` | 15초 timeout 초과 |

#### 인증/권한 패턴 (기존 _shared.ts 활용)

```typescript
// src/app/api/protractor/prescription/route.ts
import { requireProtractorAccess, verifyAccountOwnership } from "../_shared";

export async function POST(req: NextRequest) {
  // 1. 인증 + 역할 확인
  const auth = await requireProtractorAccess();
  if ("response" in auth) return auth.response;
  const { user, profile, svc } = auth;

  // 2. 요청 파싱
  const { creative_media_id, account_id, force_refresh } = await req.json();
  if (!creative_media_id) {
    return NextResponse.json({ error: "creative_media_id 필수" }, { status: 400 });
  }

  // 3. 계정 소유권 확인
  const hasAccess = await verifyAccountOwnership(svc, user.uid, profile.role, account_id);
  if (!hasAccess) {
    return NextResponse.json({ error: "계정 접근 권한이 없습니다" }, { status: 403 });
  }

  // 4. 처방 생성 (13단계)
  const result = await generatePrescription(svc, creative_media_id, account_id, force_refresh);
  return NextResponse.json(result);
}
```

### 2.2 벤치마크 시드 API (관리자 전용)

**`POST /api/protractor/benchmarks/collect`** (기존 파일 확장)

Motion 글로벌 벤치마크 수동 입력용. `prescription_benchmarks` 테이블에 upsert.

```typescript
interface BenchmarkSeedRequest {
  source: 'motion_global' | 'motion_category' | 'internal_top10';
  media_type: 'IMAGE' | 'VIDEO' | null;
  category: string | null;
  period: string;                    // '2026-Q1'
  metrics: Record<string, {          // metric key → 백분위 분포
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    sample_count: number;
  }>;
}
```

### 2.3 패턴 재계산 트리거 API (관리자/크론 전용)

**`POST /api/protractor/prescription/recalculate-patterns`**

```typescript
// 주 1회 화요일 크론 또는 관리자 수동 트리거
// prescription_patterns 테이블 재계산
interface RecalculateResponse {
  total_patterns: number;
  by_confidence: { high: number; medium: number; low: number };
  categories_covered: string[];
  duration_ms: number;
}
```

---

## 3. 처방 생성 13단계 상세 설계

### 핵심 모듈 파일 구조

```
src/lib/protractor/
├── metric-groups.ts          ← 기존 (ATTRIBUTE_AXIS_MAP, METRIC_GROUPS)
├── t3-engine.ts              ← 기존 (ratio 기반 점수 계산)
├── prescription-engine.ts    ← ★신규: 13단계 처방 엔진 메인
├── performance-backtracker.ts← ★신규: 성과역추적 (STEP 9)
├── andromeda-analyzer.ts     ← ★신규: 계정 다양성 분석 (STEP 5)
├── ear-analyzer.ts           ← ★신규: GEM/EAR 영향 분석 (STEP 8)
├── prescription-prompt.ts    ← ★신규: Gemini 프롬프트 구성 (STEP 10)
└── benchmark-lookup.ts       ← ★신규: 축3 벤치마크 조회 (STEP 7)

src/types/
└── prescription.ts           ← ★신규: 처방 관련 TypeScript 타입
```

### STEP 1: 소재 원본 + 메타데이터 조회

```typescript
// prescription-engine.ts
async function step1_fetchCreativeMedia(svc: DbClient, creativeMediaId: string) {
  const { data, error } = await svc
    .from("creative_media")
    .select("id, creative_id, media_url, storage_url, ad_copy, media_type, analysis_json, saliency_url, video_analysis, embedding")
    .eq("id", creativeMediaId)
    .single();

  if (error || !data) throw new PrescriptionError("소재를 찾을 수 없습니다", 404);

  // creative → account_id, category 조회
  const { data: creative } = await svc
    .from("creatives")
    .select("account_id, category, ad_id")
    .eq("id", data.creative_id)
    .single();

  return { media: data, creative };
}
```

### STEP 2: 시선 데이터 조회 (DeepGaze)

```typescript
async function step2_fetchSaliencyData(svc: DbClient, creativeMediaId: string, mediaType: string) {
  // creative_saliency 조회
  const { data: saliency } = await svc
    .from("creative_saliency")
    .select("cta_attention_score, cognitive_load, top_fixations, attention_map_url, saliency_data")
    .eq("creative_media_id", creativeMediaId)
    .single();

  // 영상: video_saliency_frames 조회 (1초별 시선)
  let videoSaliency = null;
  let sceneAnalysis = null;
  if (mediaType === 'VIDEO') {
    // video_analysis에 scene_analysis 포함 (video-scene-analysis 크론 사전 배치)
    const { data: videoData } = await svc
      .from("creative_media")
      .select("video_analysis")
      .eq("id", creativeMediaId)
      .single();
    sceneAnalysis = videoData?.video_analysis?.scene_analysis ?? null;

    // 1초별 시선 데이터
    const { data: frames } = await svc
      .from("video_saliency_frames")
      .select("second, cta_attention_score, cognitive_load, top_fixations")
      .eq("creative_media_id", creativeMediaId)
      .order("second", { ascending: true });
    videoSaliency = frames;
  }

  // graceful fallback: 시선 데이터 없어도 진행
  return { saliency: saliency ?? null, videoSaliency, sceneAnalysis };
}
```

### STEP 3: 성과 데이터 + 벤치마크 대비 조회

```typescript
async function step3_fetchPerformanceData(
  svc: DbClient,
  creativeId: string,
  mediaType: string,
  category: string | null
) {
  // daily_ad_insights에서 해당 소재 성과 집계
  const { data: insights } = await svc
    .from("daily_ad_insights")
    .select("*")
    .eq("creative_id", creativeId);

  if (!insights || insights.length === 0) {
    return { hasPerformanceData: false, metrics: null, benchmarkComparison: null };
  }

  // 지표 집계 (평균)
  const aggregated = aggregateInsights(insights);

  // 벤치마크 대비 편차 계산
  const { data: benchmarks } = await svc
    .from("benchmarks")
    .select("*")
    .eq("creative_type", mediaType)
    .eq("ranking_group", "ABOVE_AVERAGE");

  const comparison = calculateBenchmarkDeviation(aggregated, benchmarks);

  // 영상: 재생 이탈 곡선 (p3s/p25/p50/p75/p100 → 초수 환산)
  let retentionCurve = null;
  if (mediaType === 'VIDEO') {
    retentionCurve = {
      p3s: aggregated.video_p3s_rate,
      p25: aggregated.video_p25,
      p50: aggregated.video_p50,
      p75: aggregated.video_p75,
      p100: aggregated.video_p100,
      avg_time_sec: aggregated.video_avg_time,
    };
  }

  return {
    hasPerformanceData: true,
    metrics: aggregated,
    benchmarkComparison: comparison,
    retentionCurve,
  };
}
```

### STEP 4: prescription_patterns 조회 (축2)

```typescript
// prescription-engine.ts
async function step4_fetchPatterns(
  svc: DbClient,
  analysisJson: AnalysisJsonV3,
  category: string | null
) {
  // analysis_json에서 현재 소재의 속성값 추출
  const currentAttributes = extractAttributes(analysisJson);
  // → [{ attribute: 'hook.hook_type', value: 'curiosity' }, ...]

  let categoryFallback = false;

  // 해당 카테고리 패턴 조회
  const { data: patterns } = await svc
    .from("prescription_patterns")
    .select("*")
    .in("attribute", currentAttributes.map(a => a.attribute))
    .eq("category", category)
    .in("confidence", ["high", "medium"]);

  // fallback: 카테고리 패턴 부족 시 전체(ALL)
  if (!patterns || patterns.length < 5) {
    categoryFallback = true;
    const { data: allPatterns } = await svc
      .from("prescription_patterns")
      .select("*")
      .in("attribute", currentAttributes.map(a => a.attribute))
      .is("category", null);
    return { patterns: allPatterns ?? [], categoryFallback };
  }

  return { patterns, categoryFallback };
}
```

### STEP 5: 계정 전체 소재 다양성 분석 (★v2 Andromeda)

```typescript
// andromeda-analyzer.ts
interface AndromedaResult {
  diversityScore: number;             // 0~100 (클러스터 수 / 총 소재 수 × 100)
  warningLevel: 'low' | 'medium' | 'high';
  similarPairs: Array<{ creative_id: string; similarity: number; overlap_axes: string[] }>;
  diversificationSuggestion: {
    persona: string;
    desire: string;
    awareness: string;
  } | null;
}

async function step5_analyzeAccountDiversity(
  svc: DbClient,
  accountId: string,
  currentMediaId: string,
  currentAnalysis: AnalysisJsonV3
): Promise<AndromedaResult> {
  // 같은 account_id 내 활성 소재 전체 조회
  const { data: accountCreatives } = await svc
    .from("creative_media")
    .select("id, analysis_json")
    .eq("account_id", accountId)
    .not("analysis_json", "is", null);

  if (!accountCreatives || accountCreatives.length < 2) {
    return { diversityScore: 100, warningLevel: 'low', similarPairs: [], diversificationSuggestion: null };
  }

  // 4축 가중 Jaccard 유사도 계산
  const similarities = accountCreatives
    .filter(c => c.id !== currentMediaId)
    .map(c => ({
      creative_id: c.id,
      similarity: computeWeightedJaccard(currentAnalysis, c.analysis_json),
      overlap_axes: findOverlapAxes(currentAnalysis, c.analysis_json),
    }))
    .filter(s => s.similarity >= 0.40)
    .sort((a, b) => b.similarity - a.similarity);

  // 다양성 점수 = 고유 클러스터 수 / 총 소재 수
  const clusters = clusterCreatives(accountCreatives);
  const diversityScore = Math.round((clusters.length / accountCreatives.length) * 100);

  // 4계층 패널티 감지 (리포트 정합)
  // 0.40~0.59: 부분 유사 (모니터링)
  // 0.60~0.79: 1단계 도달감소 → "다양성 경고"
  // 0.80~0.91: 2단계 노출제한 → "강력 경고"
  // ≥0.92: 3단계 경매차단 → "즉시 교체 권장"
  const warningLevel = similarities.some(s => s.similarity >= 0.92) ? 'critical'
    : similarities.some(s => s.similarity >= 0.80) ? 'high'
    : similarities.some(s => s.similarity >= 0.60) ? 'medium'
    : 'low';

  // PDA 프레임 기반 차별화 방향
  const suggestion = warningLevel !== 'low'
    ? generatePDASuggestion(currentAnalysis, accountCreatives)
    : null;

  return { diversityScore, warningLevel, similarPairs: similarities.slice(0, 5), diversificationSuggestion: suggestion };
}
```

### STEP 6: 유사 벤치마크 소재 Top3 검색

```typescript
async function step6_searchSimilarBenchmarks(svc: DbClient, embedding: number[]) {
  // 기존 search_similar_creatives RPC 활용
  const { data } = await svc.rpc("search_similar_creatives", {
    query_embedding: embedding,
    match_count: 3,
    filter_source: "benchmark",
    filter_category: null,
  });

  return (data ?? []).map((row: any) => ({
    creative_id: row.id,
    similarity: row.similarity,
    analysis_json: row.analysis_json,
    performance: row.performance_summary,
  }));
}
```

### STEP 7: Motion 글로벌 벤치마크 조회 (★v2 축3)

```typescript
// benchmark-lookup.ts
async function step7_fetchGlobalBenchmarks(
  svc: DbClient,
  mediaType: string,
  category: string | null
) {
  // 1차: 카테고리별 벤치마크
  const { data: catBench } = await svc
    .from("prescription_benchmarks")
    .select("metric, p10, p25, p50, p75, p90, sample_count")
    .eq("source", "motion_global")
    .eq("media_type", mediaType)
    .eq("category", category)
    .order("updated_at", { ascending: false });

  // 2차 fallback: 전체(NULL) 벤치마크
  if (!catBench || catBench.length === 0) {
    const { data: globalBench } = await svc
      .from("prescription_benchmarks")
      .select("metric, p10, p25, p50, p75, p90, sample_count")
      .eq("source", "motion_global")
      .eq("media_type", mediaType)
      .is("category", null);
    return { benchmarks: globalBench ?? [], source: 'global_fallback' };
  }

  return { benchmarks: catBench, source: 'category' };
}
```

### STEP 8: GEM/EAR 영향 인자 분석 (★v2)

```typescript
// ear-analyzer.ts
interface EarAnalysis {
  primaryBottleneck: 'foundation' | 'engagement' | 'conversion';
  bottleneckDetail: string;
  improvementPriority: string;
}

function step8_analyzeEarImpact(
  benchmarkComparison: BenchmarkComparison,
  weakAttributes: WeakAttribute[]
): EarAnalysis {
  // 성과 그룹별 평균 편차 계산
  const groupDeviations = {
    foundation: avgDeviation(benchmarkComparison, ['video_p3s_rate', 'thruplay_rate', 'retention_rate']),
    engagement: avgDeviation(benchmarkComparison, ['reactions_per_10k', 'comments_per_10k', 'shares_per_10k', 'saves_per_10k']),
    conversion: avgDeviation(benchmarkComparison, ['ctr', 'reach_to_purchase_rate']),
  };

  // 가장 큰 음의 편차 그룹 = primary bottleneck
  const sorted = Object.entries(groupDeviations).sort((a, b) => a[1] - b[1]);
  const [primaryBottleneck, deviation] = sorted[0];

  // ATTRIBUTE_AXIS_MAP에서 해당 그룹에 weight 높은 속성 추출
  const impactAttributes = ATTRIBUTE_AXIS_MAP
    .filter(a => a.affectsGroups.includes(primaryBottleneck as any))
    .sort((a, b) => b.weight - a.weight);

  return {
    primaryBottleneck: primaryBottleneck as any,
    bottleneckDetail: generateBottleneckDetail(primaryBottleneck, deviation),
    improvementPriority: `${impactAttributes[0]?.label} 개선이 EAR에 가장 큰 양의 영향`,
  };
}
```

### STEP 9: 성과역추적 — 벤치마크 대비 약점 포인트 식별 (★v2 핵심)

```typescript
// performance-backtracker.ts

// ★ 역할 분담: 코드 = 데이터 수집, Gemini = 판단
// 코드가 하는 것: 편차율 계산 + worst 3 추출 + raw 데이터 패키징
// Gemini가 하는 것: 이탈 지점 판단, 씬 매칭, 속성 역매핑

interface PerformanceBacktrackInput {
  worstMetrics: Array<{
    metric: string;
    label: string;
    actual: number;
    benchmark: number;
    deviation: number;  // (actual - benchmark) / benchmark × 100
    group: string;
  }>;
  videoRaw?: {  // 영상 전용
    p3s: number;
    p25: number;
    p50: number;
    p75: number;
    p100: number;
    avg_time_sec: number;
  };
  deepgazePerSec?: Array<{  // 영상 전용: 1초별 시선 데이터
    second: number;
    cta_attention_score: number;
    cognitive_load: number;
    top_fixations: any[];
  }>;
  sceneAnalysis?: any;  // ffmpeg 씬 경계 + per_second[] + scenes[]
  metaRankings: {
    quality: 'ABOVE_AVERAGE' | 'AVERAGE' | 'BELOW_AVERAGE_35' | 'BELOW_AVERAGE_20' | 'BELOW_AVERAGE_10' | null;
    engagement: string | null;
    conversion: string | null;
  };
  allMetricsWithDeviation: Array<{ metric: string; actual: number; benchmark: number; deviation: number }>;
}

async function step9_performanceBacktrack(
  performanceData: PerformanceMetrics,
  benchmarkComparison: BenchmarkComparison,
  videoSaliency: any,
  sceneAnalysis: any,
): PerformanceBacktrackInput {
  // 9-1. 전체 지표 편차율 계산
  const allDeviations = Object.entries(benchmarkComparison).map(([metric, comp]) => ({
    metric,
    label: getMetricLabel(metric),
    actual: comp.actual,
    benchmark: comp.benchmark,
    deviation: comp.benchmark > 0 ? ((comp.actual - comp.benchmark) / comp.benchmark) * 100 : 0,
    group: getMetricGroup(metric),
  }));

  // 9-2. worst 3 추출 (편차율 기준)
  const worstMetrics = allDeviations
    .filter(d => d.deviation < 0)
    .sort((a, b) => a.deviation - b.deviation)
    .slice(0, 3);

  // 9-3. Meta 랭킹 3종 → 문제 범위 사전 축소
  const metaRankings = {
    quality: performanceData.quality_ranking ?? null,
    engagement: performanceData.engagement_ranking ?? null,
    conversion: performanceData.conversion_ranking ?? null,
  };

  // ★ Gemini에 넘길 raw 데이터 패키징
  // 이탈 판단, 씬 매칭, 속성 역매핑은 포함하지 않음 — Gemini 위임
  return {
    worstMetrics,
    videoRaw: videoSaliency ? extractVideoRaw(performanceData) : undefined,
    deepgazePerSec: videoSaliency ?? undefined,
    sceneAnalysis: sceneAnalysis ?? undefined,
    metaRankings,
    allMetricsWithDeviation: allDeviations,
  };
}
```

### STEP 10: Gemini 프롬프트 구성

```typescript
// prescription-prompt.ts

function step10_buildPrompt(input: {
  media: CreativeMedia;
  saliency: SaliencyData | null;
  performanceBacktrack: PerformanceBacktrackInput | null;
  patterns: PrescriptionPattern[];
  globalBenchmarks: Benchmark[];
  andromedaResult: AndromedaResult;
  similarBenchmarks: SimilarBenchmark[];
  earAnalysis: EarAnalysis;
  hasPerformanceData: boolean;
}): GeminiPromptParts {
  const sections: string[] = [];

  // ── SECTION 1: 문제 정의 (Gemini가 가장 먼저 읽는 영역) ──
  if (input.hasPerformanceData && input.performanceBacktrack) {
    sections.push(buildSection1_ProblemDefinition(input.performanceBacktrack));
    // "이 광고의 CTR은 벤치마크 대비 -65%다. 가장 심각한 문제는 클릭→구매 단계다."
    // 여정별 이탈 지도 포함
    // 지시: "아래 소재를 분석할 때, 위 문제의 원인을 우선적으로 찾아라"
  }
  // 성과 데이터 없는 신규 소재: SECTION 1 생략 → 기존 5축 순방향 분석

  // ── SECTION 2: 증거 자료 ──
  // 소재 원본 (멀티모달), DeepGaze, 성과, 광고 카피
  // 영상: ffmpeg 씬 경계 + 씬 분할 결과 + 재생 이탈 곡선
  sections.push(buildSection2_Evidence(input));

  // ── SECTION 3: 처방 근거 — 3축 데이터 ──
  sections.push(buildSection3_PrescriptionBasis({
    axis1Guide: PRESCRIPTION_GUIDE_TEXT,       // 고정: 여정 4단계, 세이프티존, 금지 규칙
    axis2Patterns: input.patterns,              // 동적: 해당 소재 속성 패턴
    axis3Benchmarks: input.globalBenchmarks,    // 동적: Motion 글로벌 백분위
    earAnalysis: input.earAnalysis,
  }));

  // ── SECTION 4: 참조 — 경쟁 소재 + 다양성 ──
  sections.push(buildSection4_References({
    andromeda: input.andromedaResult,
    similarBenchmarks: input.similarBenchmarks,
  }));

  return {
    systemPrompt: PRESCRIPTION_SYSTEM_PROMPT,  // 톤/금지 규칙
    textParts: sections,
    mediaPart: buildMediaPart(input.media),    // 이미지 base64 또는 영상 멀티모달
  };
}
```

#### 프롬프트 금지 규칙 (PRESCRIPTION_SYSTEM_PROMPT)

```typescript
const PRESCRIPTION_SYSTEM_PROMPT = `
당신은 메타 광고 소재 전문 컨설턴트입니다.
수강생에게 1:1 코칭하듯 실전적이고 구체적으로 답변하세요.

절대 금지:
1. CTA 버튼 추가 처방 금지 (메타가 제공하는 것)
2. 세이프티존 밖 배치 처방 금지
3. 타겟팅 변경 처방 금지 (소재 관련만)
4. "더 좋게 하세요" 같은 추상적 처방 금지
5. 입력 데이터에 없는 수치 인용 금지
6. 광고비/예산 관련 처방 금지

출력은 반드시 지정된 JSON 스키마를 따르세요.
`;
```

### STEP 11: Gemini 1회 통합 호출

```typescript
// prescription-engine.ts

async function step11_callGemini(prompt: GeminiPromptParts): Promise<GeminiPrescriptionOutput> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  const MODEL = "gemini-3-pro-preview";
  const TIMEOUT_MS = 15_000;
  const MAX_RETRIES = 1;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const parts: any[] = [];

      // 텍스트 파트
      parts.push({ text: prompt.systemPrompt + '\n\n' + prompt.textParts.join('\n\n') });

      // 미디어 파트 (이미지 base64 또는 영상)
      if (prompt.mediaPart) {
        parts.push(prompt.mediaPart);
      }

      // JSON 스키마 강제
      parts.push({ text: `\n\n출력 JSON 스키마:\n${JSON.stringify(PRESCRIPTION_OUTPUT_SCHEMA)}` });

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              responseMimeType: "application/json",
            },
          }),
          signal: controller.signal,
        }
      );

      if (res.status === 429 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!res.ok) throw new PrescriptionError(`Gemini API 오류: ${res.status}`, 500);

      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      return JSON.parse(text) as GeminiPrescriptionOutput;
    } catch (err: any) {
      if (err.name === 'AbortError') throw new PrescriptionError('처방 생성 시간 초과', 504);
      if (attempt >= MAX_RETRIES) throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new PrescriptionError('Gemini 호출 실패', 500);
}
```

### STEP 12: 후처리 — 백분위 계산 + 약점 식별

```typescript
function step12_postProcess(
  geminiOutput: GeminiPrescriptionOutput,
  globalBenchmarks: Benchmark[],
  performanceBacktrack: PerformanceBacktrackInput | null,
) {
  // 5축 scores → 카테고리별 백분위 산정
  const percentiles = calculatePercentiles(geminiOutput.scores, globalBenchmarks);

  // 백분위 하위 30% 이하 축/속성 감지
  const weakAxes = Object.entries(percentiles)
    .filter(([, p]) => p <= 30)
    .map(([axis]) => axis);

  // ATTRIBUTE_AXIS_MAP으로 약점 → affectsGroups 매핑
  const weakAttributes = ATTRIBUTE_AXIS_MAP
    .filter(a => weakAxes.includes(a.axis))
    .map(a => ({ ...a, percentile: percentiles[a.axis] }));

  // ★ 성과역추적 약점과 5축 약점 교차 검증
  if (performanceBacktrack) {
    for (const prescription of geminiOutput.top3_prescriptions) {
      const isPerformanceDriven = performanceBacktrack.worstMetrics.some(wm =>
        weakAttributes.some(wa =>
          wa.affectsGroups.includes(wm.group as any) && wa.attribute === prescription.attribute
        )
      );
      prescription.performance_driven = isPerformanceDriven;
    }
  }

  // weight 기반 impact 순 정렬
  weakAttributes.sort((a, b) => b.weight - a.weight);

  return { percentiles, weakAttributes };
}
```

### STEP 13: 최종 정렬 + Andromeda 경고 첨부

```typescript
function step13_finalAssembly(
  geminiOutput: GeminiPrescriptionOutput,
  andromedaResult: AndromedaResult,
  earAnalysis: EarAnalysis,
  postProcess: PostProcessResult,
  meta: PrescriptionMeta,
): PrescriptionResponse {
  // expected_impact 기준 Top3 정렬
  const sortedPrescriptions = geminiOutput.top3_prescriptions
    .sort((a, b) => {
      // performance_driven 우선
      if (a.performance_driven && !b.performance_driven) return -1;
      if (!a.performance_driven && b.performance_driven) return 1;
      return a.rank - b.rank;
    });

  // andromeda_warning 첨부 (유사도 ≥ 0.60인 경우)
  const andromedaWarning = andromedaResult.warningLevel !== 'low'
    ? {
        level: andromedaResult.warningLevel,
        message: generateAndromedaMessage(andromedaResult),
        similar_pairs: andromedaResult.similarPairs,
        diversification_suggestion: andromedaResult.diversificationSuggestion!,
        diversity_score: andromedaResult.diversityScore,
      }
    : null;

  // creative_media.analysis_json 업데이트 (5축 + 처방 통합 저장)
  // → 별도 upsert 함수에서 처리

  return {
    five_axis: geminiOutput.five_axis,
    scores: geminiOutput.scores,
    percentiles: postProcess.percentiles,
    top3_prescriptions: sortedPrescriptions,
    performance_backtrack: geminiOutput.performance_backtrack,
    andromeda_warning: andromedaWarning,
    ear_analysis: earAnalysis,
    customer_journey_summary: geminiOutput.customer_journey_summary,
    weakness_analysis: postProcess.weakAttributes.map(wa => ({
      axis: wa.axis,
      attribute: wa.attribute,
      attribute_label: wa.label,
      current_percentile: wa.percentile,
      global_percentile: postProcess.percentiles[wa.axis] ?? 0,
      issue: geminiOutput.weakness_analysis?.find(w => w.attribute === wa.attribute)?.issue ?? '',
      benchmark_comparison: geminiOutput.weakness_analysis?.find(w => w.attribute === wa.attribute)?.benchmark_comparison ?? '',
      affects_groups: wa.affectsGroups,
      ear_impact: generateEarImpactText(wa, earAnalysis),
    })),
    meta,
  };
}
```

---

## 4. 컴포넌트 구조

### 4.1 페이지 구성

```
src/app/(main)/protractor/creative/[id]/
├── page.tsx                     ← 기존 소재 상세 페이지
└── prescription-tab.tsx         ← ★신규: 처방 탭 (lazy load)

src/components/protractor/
├── PrescriptionPanel.tsx        ← ★신규: 처방 결과 전체 패널
├── CustomerJourneyBreakdown.tsx ← ★신규: 고객 여정 4단계 시각화
├── PrescriptionList.tsx         ← ★신규: Top3 처방 목록
├── AndromedaAlert.tsx           ← ★신규: 다양성 경고 배너
├── FiveAxisScorecard.tsx        ← ★신규: 5축 점수 + 백분위 표시
├── PerformanceBacktrack.tsx     ← ★신규: 성과역추적 시각화
├── WeaknessAnalysis.tsx         ← ★신규: 약점 분석 카드
└── BenchmarkComparison.tsx      ← ★신규: 글로벌 백분위 차트
```

### 4.2 PrescriptionPanel (메인 컴포넌트)

```typescript
// src/components/protractor/PrescriptionPanel.tsx
interface PrescriptionPanelProps {
  creativeMediaId: string;
  accountId: string;
}

export function PrescriptionPanel({ creativeMediaId, accountId }: PrescriptionPanelProps) {
  // API 호출 상태 관리
  const [data, setData] = useState<PrescriptionResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generatePrescription() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/protractor/prescription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creative_media_id: creativeMediaId, account_id: accountId }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error);
      }
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* 생성 버튼 */}
      {!data && !loading && (
        <button onClick={generatePrescription}
          className="w-full py-3 bg-[#F75D5D] hover:bg-[#E54949] text-white rounded-lg font-semibold">
          처방 생성하기
        </button>
      )}

      {/* 로딩 */}
      {loading && <PrescriptionSkeleton />}

      {/* 에러 */}
      {error && <ErrorBanner message={error} onRetry={generatePrescription} />}

      {/* 결과 */}
      {data && (
        <>
          {/* Andromeda 경고 (있으면 최상단) */}
          {data.andromeda_warning && <AndromedaAlert warning={data.andromeda_warning} />}

          {/* 5축 점수 + 백분위 */}
          <FiveAxisScorecard scores={data.scores} percentiles={data.percentiles} />

          {/* 성과역추적 시각화 */}
          {data.meta.has_performance_data && (
            <PerformanceBacktrack backtrack={data.performance_backtrack} />
          )}

          {/* 고객 여정 4단계 */}
          <CustomerJourneyBreakdown
            journey={data.customer_journey_summary}
            backtrack={data.performance_backtrack?.journey_breakdown}
          />

          {/* ★ 처방 Top3 */}
          <PrescriptionList prescriptions={data.top3_prescriptions} />

          {/* 약점 분석 */}
          <WeaknessAnalysis weaknesses={data.weakness_analysis} />

          {/* 글로벌 백분위 차트 */}
          <BenchmarkComparison
            scores={data.scores}
            percentiles={data.percentiles}
            earAnalysis={data.ear_analysis}
          />
        </>
      )}
    </div>
  );
}
```

### 4.3 CustomerJourneyBreakdown

```typescript
// 고객 여정 4단계 퍼널 시각화
// 감각 → 사고 → 행동(클릭) → 행동(구매)
// 각 단계에 status 배지 (양호/보통/심각) + deviation 표시

interface CustomerJourneyBreakdownProps {
  journey: {
    sensation: string;
    thinking: string;
    action_click: string;
    action_purchase: string;
  };
  backtrack?: Record<string, { status: string; deviation: string }>;
}

// 레이아웃: 가로 4단계 퍼널 (데스크탑) / 세로 스택 (모바일 375px)
// 각 단계 카드: 아이콘 + 단계명 + status 배지 + 편차% + 설명 텍스트
// 단계 간 화살표: → (데스크탑) / ↓ (모바일)
// status 색상: 양호=#22C55E, 보통=#F59E0B, 심각=#EF4444
```

### 4.4 PrescriptionList

```typescript
// Top3 처방 카드 목록
interface PrescriptionListProps {
  prescriptions: PrescriptionResponse['top3_prescriptions'];
}

// 레이아웃: 세로 카드 3개
// 각 카드:
//   - rank 배지 (1/2/3)
//   - ★ performance_driven=true면 "성과 기반" 태그 (Primary 색상)
//   - title (볼드)
//   - action (실행 내용)
//   - journey_stage 칩
//   - expected_impact (초록색)
//   - evidence 아코디언 (축1/축2/축3 근거)
//   - difficulty 배지 (쉬움=초록, 보통=노랑, 어려움=빨강)
```

### 4.5 AndromedaAlert

```typescript
// Andromeda 다양성 경고 배너
// level에 따라 색상 변경:
//   low: 표시 안 함
//   medium: 노란 경고 배너
//   high: 빨간 경고 배너

// 내용:
//   - diversity_score 표시 (0~100)
//   - similar_pairs 목록 (유사 소재 ID + 유사도%)
//   - diversification_suggestion: PDA 프레임 (Persona, Desire, Awareness)
```

### 4.6 PerformanceBacktrack

```typescript
// 성과역추적 시각화
// 레이아웃: worst 3 지표 카드 + 여정별 이탈 지도

// worst 카드:
//   - 지표명 + 실제값 vs 벤치마크
//   - deviation% (빨간색 바)
//   - 소속 그룹 (foundation/engagement/conversion)

// 여정 이탈 지도: 가로 바 차트
//   감각 [████████████ +12%]  양호
//   사고  [████████    -43%]  보통
//   클릭  [████        -65%]  심각
//   구매  [███         -75%]  심각
```

---

## 5. 에러 처리

### 5.1 에러 코드 체계

| 코드 | 에러 | 사용자 메시지 | 대응 |
|:----:|------|-------------|------|
| `AUTH_REQUIRED` | 미인증 | "로그인이 필요합니다" | 로그인 페이지 리다이렉트 |
| `ACCESS_DENIED` | 역할 미달 | "접근 권한이 없습니다" | — |
| `ACCOUNT_MISMATCH` | 계정 소유권 불일치 | "계정 접근 권한이 없습니다" | — |
| `CREATIVE_NOT_FOUND` | 소재 미존재 | "소재를 찾을 수 없습니다" | — |
| `GEMINI_TIMEOUT` | 15초 초과 | "처방 생성이 지연되고 있습니다. 잠시 후 다시 시도해주세요." | 재시도 버튼 표시 |
| `GEMINI_ERROR` | Gemini API 오류 | "AI 분석 중 오류가 발생했습니다." | 1회 자동 재시도 후 실패 시 표시 |
| `GEMINI_PARSE_ERROR` | JSON 파싱 실패 | "분석 결과 처리 중 오류가 발생했습니다." | — |
| `NO_ANALYSIS` | analysis_json 없음 | "이 소재는 아직 분석되지 않았습니다. 분석 완료 후 처방을 받을 수 있습니다." | — |

### 5.2 Graceful Fallback 전략

```
시선 데이터 없음 → DeepGaze 섹션 생략, 나머지로 처방 (품질 저하 경고)
성과 데이터 없음 → 성과역추적 생략, 5축 순방향 분석 (SECTION 1 생략)
축2 패턴 부족 → 카테고리 fallback → 전체(ALL) → 축1만
축3 벤치마크 없음 → 축2 + 축1만으로 처방
Andromeda 분석 실패 → 경고 없이 진행 (선택적 기능)
영상 씬 분할 없음 → retention_curve만으로 진행
```

### 5.3 PrescriptionError 클래스

```typescript
// src/types/prescription.ts
export class PrescriptionError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'PrescriptionError';
  }
}
```

---

## 6. 구현 순서 (팀원별 파일 경계 포함)

### Phase 2: 기반 인프라 (1주)

| # | 작업 | 파일 | 담당 | 의존 |
|:-:|------|------|:----:|:----:|
| 2-1 | `prescription_patterns` 테이블 생성 | Cloud SQL DDL | backend-dev | — |
| 2-2 | `prescription_benchmarks` 테이블 생성 | Cloud SQL DDL | backend-dev | — |
| 2-3 | 패턴 추출 스크립트 | `scripts/extract-prescription-patterns.mjs` | backend-dev | 2-1 |
| 2-4 | 축1 처방 가이드 정리 | `src/lib/protractor/prescription-guide.ts` | backend-dev | — |
| 2-5 | Motion 초기 벤치마크 seed | `scripts/seed-prescription-benchmarks.mjs` | backend-dev | 2-2 |
| 2-6 | TypeScript 타입 정의 | `src/types/prescription.ts` | backend-dev | — |

### Phase 3: 처방 엔진 (1.5주)

| # | 작업 | 파일 | 담당 | 의존 |
|:-:|------|------|:----:|:----:|
| 3-1 | 성과역추적 모듈 | `src/lib/protractor/performance-backtracker.ts` | backend-dev | 2-6 |
| 3-2 | EAR 분석 모듈 | `src/lib/protractor/ear-analyzer.ts` | backend-dev | 2-6 |
| 3-3 | Andromeda 분석 모듈 | `src/lib/protractor/andromeda-analyzer.ts` | backend-dev | 2-6 |
| 3-4 | 벤치마크 조회 모듈 | `src/lib/protractor/benchmark-lookup.ts` | backend-dev | 2-2, 2-5 |
| 3-5 | Gemini 프롬프트 구성 | `src/lib/protractor/prescription-prompt.ts` | backend-dev | 2-4, 3-1~3-4 |
| 3-6 | 처방 엔진 메인 (13단계) | `src/lib/protractor/prescription-engine.ts` | backend-dev | 3-1~3-5 |
| 3-7 | 처방 API 라우트 | `src/app/api/protractor/prescription/route.ts` | backend-dev | 3-6 |
| 3-8 | 벤치마크 시드 API | `src/app/api/protractor/benchmarks/collect/route.ts` 확장 | backend-dev | 2-2 |

### Phase 4: UI + 통합 (1주)

| # | 작업 | 파일 | 담당 | 의존 |
|:-:|------|------|:----:|:----:|
| 4-1 | PrescriptionPanel | `src/components/protractor/PrescriptionPanel.tsx` | frontend-dev | 3-7 |
| 4-2 | CustomerJourneyBreakdown | `src/components/protractor/CustomerJourneyBreakdown.tsx` | frontend-dev | — |
| 4-3 | PrescriptionList | `src/components/protractor/PrescriptionList.tsx` | frontend-dev | — |
| 4-4 | AndromedaAlert | `src/components/protractor/AndromedaAlert.tsx` | frontend-dev | — |
| 4-5 | FiveAxisScorecard | `src/components/protractor/FiveAxisScorecard.tsx` | frontend-dev | — |
| 4-6 | PerformanceBacktrack | `src/components/protractor/PerformanceBacktrack.tsx` | frontend-dev | — |
| 4-7 | BenchmarkComparison | `src/components/protractor/BenchmarkComparison.tsx` | frontend-dev | — |
| 4-8 | 소재 상세 처방 탭 통합 | `src/app/(main)/protractor/creative/[id]/prescription-tab.tsx` | frontend-dev | 4-1~4-7 |

### Phase 5: 검증 + 튜닝 (0.5주)

| # | 작업 | 담당 | 의존 |
|:-:|------|:----:|:----:|
| 5-1 | 초기 50건 처방 품질 수동 검토 | qa-engineer + Smith님 | Phase 3~4 |
| 5-2 | 프롬프트 튜닝 | backend-dev | 5-1 |
| 5-3 | 패턴 크론 등록 (주 1회 화요일) | backend-dev | 2-3 |
| 5-4 | E2E 브라우저 QA (1920px + 375px) | qa-engineer | Phase 4 |

### 파일 경계 (충돌 방지)

| 담당 | 소유 파일/디렉토리 |
|:----:|-----------------|
| **backend-dev** | `src/lib/protractor/prescription-*.ts`, `src/lib/protractor/ear-analyzer.ts`, `src/lib/protractor/andromeda-analyzer.ts`, `src/lib/protractor/benchmark-lookup.ts`, `src/app/api/protractor/prescription/`, `src/types/prescription.ts`, `scripts/extract-prescription-patterns.mjs`, `scripts/seed-prescription-benchmarks.mjs` |
| **frontend-dev** | `src/components/protractor/Prescription*.tsx`, `src/components/protractor/CustomerJourney*.tsx`, `src/components/protractor/Andromeda*.tsx`, `src/components/protractor/FiveAxis*.tsx`, `src/components/protractor/Performance*.tsx`, `src/components/protractor/Benchmark*.tsx`, `src/components/protractor/Weakness*.tsx`, `src/app/(main)/protractor/creative/[id]/prescription-tab.tsx` |
| **qa-engineer** | `docs/03-analysis/prescription-system-v2.analysis.md` |

---

## 7. 성공 기준

| # | 기준 | 목표 | 측정 방법 |
|:-:|------|:----:|----------|
| 1 | 처방 구체성 | 실행 가능 액션 100% | 초기 50건 수동 검토 |
| 2 | 3축 근거 포함 | evidence_axis1/2/3 존재 | JSON 출력 검증 |
| 3 | 응답 시간 | < 15초 | meta.latency_ms 로깅 |
| 4 | 약점 자동 감지 | 하위 30% 자동 식별 | percentiles 대비 검증 |
| 5 | 성과역추적 | worst 3 자동 식별 | performance_backtrack 출력 확인 |
| 6 | 성과×5축 교차 | priority boost 적용 | performance_driven=true 태그 확인 |
| 7 | Andromeda 다양성 | 유사도 0.60+ 탐지 | 기존 compute-andromeda-similarity 대비 검증 |
| 8 | 패턴 데이터 | 100+ 행 | prescription_patterns 카운트 |
| 9 | 벤치마크 데이터 | 50+ 행 | prescription_benchmarks 카운트 |
| 10 | UI | 데스크탑(1920px) + 모바일(375px) 정상 | 브라우저 QA |
| 11 | 수강생 체감 | "이 처방이 도움됐다" 70%+ | 추후 피드백 수집 (Phase 5 이후) |
| 12 | 빌드 | tsc + lint + build 에러 0 | npm run build |

---

## 8. 리포트 매칭 검증 (모찌 리포트 정합성)

> 기준: `2026-03-25-prescription-system-v2` 리포트

| 리포트 항목 | Plan 반영 | Design 반영 | 정합성 |
|------------|:---------:|:---------:|:------:|
| 3축 아키텍처 (고정 참조 + 동적 내부 + Motion 글로벌) | ✅ 섹션 3 | ✅ STEP 4, 7, 10 | ✅ |
| prescription_patterns DDL (axis, lift_ci_lower) | ✅ 섹션 11.1 | ✅ 1.1 | ✅ |
| prescription_benchmarks DDL (p10~p90) | ✅ 섹션 11.2 | ✅ 1.2 | ✅ |
| Gemini 1회 통합 (5축 + 처방) | ✅ 섹션 10 | ✅ STEP 11 | ✅ |
| 성과역추적 (worst 3 + 여정 이탈 지도) | ✅ 섹션 10.2 STEP 9 | ✅ STEP 9 상세 | ✅ |
| Andromeda 4축 가중 Jaccard | ✅ 섹션 4 | ✅ STEP 5 | ✅ |
| 3계층 패널티 (도달감소→노출제한→경매차단) | ✅ 섹션 4 | ✅ STEP 5 warningLevel | ✅ |
| GEM/EAR 영향 분석 | ✅ 섹션 5 | ✅ STEP 8 | ✅ |
| reach_to_purchase_rate 최종 목적함수 | ✅ 섹션 8 | ✅ 전체 일관 | ✅ |
| CLT 기반 confidence (N≥100 high, N≥30 medium) | ✅ 섹션 3.3 | ✅ 1.1 confidence 결정 | ✅ |
| 카테고리 fallback (카테고리 → ALL → 축3 → 축1) | ✅ 섹션 3.3 | ✅ STEP 4 fallback 로직 | ✅ |
| 프롬프트 4섹션 구조 (문제정의→증거→3축→참조) | ✅ 섹션 10.2 | ✅ STEP 10 buildPrompt | ✅ |
| 프롬프트 금지 규칙 6개 | ✅ 섹션 16.3 | ✅ PRESCRIPTION_SYSTEM_PROMPT | ✅ |
| analysis_json v3 전체 스키마 | ✅ 섹션 6.1 | ✅ 1.4 TypeScript interface | ✅ |
| API POST /api/protractor/prescription | ✅ 섹션 10.2 | ✅ 2.1 상세 | ✅ |
| 5개 UI 컴포넌트 | ✅ 섹션 13 Phase 4 | ✅ 4.1~4.6 상세 | ✅ |
| Phase 1~5 로드맵 | ✅ 섹션 13 | ✅ 6. 구현 순서 | ✅ |
| 비용 ~$1.3~2.0/월 | ✅ 섹션 12 | ✅ Executive Summary | ✅ |
| ATTRIBUTE_AXIS_MAP 14속성 × 3성과 그룹 | ✅ 섹션 7 | ✅ metric-groups.ts 참조 | ✅ |
| 고객 여정 4단계 (감각→사고→클릭→구매) | ✅ 섹션 8 | ✅ CustomerJourneyBreakdown | ✅ |

**정합률: 20/20 = 100%**

---

## 부록: 기존 코드베이스 활용 맵

| 기존 파일 | 처방 v2 활용 | 수정 필요 |
|----------|-------------|:--------:|
| `src/lib/protractor/metric-groups.ts` | ATTRIBUTE_AXIS_MAP, METRIC_GROUPS 참조 | 없음 |
| `src/lib/protractor/t3-engine.ts` | ratio 기반 점수 계산 참조 | 없음 |
| `src/app/api/protractor/_shared.ts` | requireProtractorAccess, verifyAccountOwnership | 없음 |
| `src/lib/gemini.ts` | generateFlashText, generateVisionText 패턴 참조 | 없음 |
| `src/app/api/creative/search/route.ts` | search_similar_creatives RPC 패턴 참조 | 없음 |
| `src/lib/db/index.ts` | createServiceClient, createDbClient 패턴 | 없음 |
| `scripts/compute-andromeda-similarity.mjs` | 유사도 계산 로직 참조 | 없음 |
| `src/app/api/protractor/benchmarks/collect/route.ts` | 벤치마크 시드 API 확장 | 확장 |

---

## TDD 보완 (테스트 주도 개발 지원)

### T1. 단위 테스트 시나리오

| 함수 | 입력 | 기대 출력 | 검증 포인트 |
|------|------|----------|------------|
| `determineConfidence(sampleCount)` | `150` | `'high'` | N≥100일 때 high 반환 |
| `determineConfidence(sampleCount)` | `50` | `'medium'` | 30≤N<100일 때 medium 반환 |
| `determineConfidence(sampleCount)` | `10` | `'low'` | N<30일 때 low 반환 |
| `calculateGlobalPercentile(actual, benchmark)` | `actual=0.5, benchmark={p10:0.1, p25:0.3, p50:0.5, p75:0.8, p90:1.0}` | `50` | p50 정확 일치 시 50 반환 |
| `calculateGlobalPercentile(actual, benchmark)` | `actual=0.05, benchmark={p10:0.1, p25:0.3, p50:0.5, p75:0.8, p90:1.0}` | `5` | p10 이하일 때 5 반환 |
| `calculateGlobalPercentile(actual, benchmark)` | `actual=1.5, benchmark={p10:0.1, p25:0.3, p50:0.5, p75:0.8, p90:1.0}` | `95` | p90 초과 시 95 반환 |
| `step1_fetchCreativeMedia(svc, id)` | 존재하는 creative_media_id | `{ media: {...}, creative: {...} }` | creative_media + creatives JOIN 성공 |
| `step1_fetchCreativeMedia(svc, id)` | 존재하지 않는 UUID | `PrescriptionError(404)` | 소재 미존재 시 에러 |
| `step3_fetchPerformanceData(svc, cid, type, cat)` | daily_ad_insights 0건인 소재 | `{ hasPerformanceData: false, metrics: null }` | 성과 데이터 없는 소재 처리 |
| `generatePrescription(svc, cmId, accountId, false)` | analysis_json이 null인 소재 | 에러 응답 (422) | 5축 분석 미완료 소재 거부 |
| `generatePrescription(svc, cmId, accountId, true)` | force_refresh=true | 캐시 무시하고 새 결과 | 강제 갱신 동작 확인 |

### T2. 엣지 케이스 정의

| # | 엣지 케이스 | 입력 조건 | 기대 동작 | 우선순위 |
|---|-----------|---------|---------|---------|
| E1 | creative_media 0건 (소재 없는 계정) | creative_media_id가 삭제된 소재 | 404 + `CREATIVE_NOT_FOUND` 반환 | P0 |
| E2 | Gemini API 타임아웃 (15초 초과) | Gemini 응답 지연 | 504 + `처방 생성 시간 초과` 반환, 1회 retry 후 실패 | P0 |
| E3 | prescription_patterns 비어있음 | 패턴 테이블 0건 | axis2_used=false, 축1(레퍼런스 원론)만으로 처방 생성 | P0 |
| E4 | N<30 (통계적 유의성 부족) | 카테고리 패턴의 sample_count=5 | confidence='low' → ALL 패턴 fallback → 축3 보정 | P1 |
| E5 | account_id 없는 요청 (RLS 위반) | body에 account_id 미포함 | 403 + `계정 접근 권한이 없습니다` | P0 |
| E6 | prescription_benchmarks 0건 | 글로벌 벤치마크 미시딩 | axis3_used=false, 축1+축2만으로 처방 생성 | P1 |
| E7 | analysis_json 파싱 오류 | analysis_json이 잘못된 JSON 구조 | 500 + `PARSE_ERROR` 반환 | P1 |
| E8 | 동일 account_id 소재만 존재 (유사소재 0건) | 타 계정 소재 없음 | similar_count=0, 유사소재 비교 없이 처방 생성 | P2 |
| E9 | 카테고리 fallback 체인 전체 실패 | category 패턴 없음 + ALL 패턴 없음 + 축3 없음 | 축1(레퍼런스 원론)만으로 처방 생성 | P1 |
| E10 | Andromeda 유사도 100% (동일 소재 중복) | 동일 creative fingerprint | andromeda_warning.level='high' + 다양화 제안 | P2 |
| E11 | 영상 소재 시선 데이터 없음 | VIDEO인데 video_saliency_frames 0건 | graceful fallback — 시선 데이터 없이 진행 | P1 |

### T3. 모킹 데이터 (Fixture)

```json
// fixture: prescription_pattern_high_confidence — 높은 신뢰도 패턴
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "attribute": "hook.hook_type",
  "value": "benefit",
  "axis": "hook",
  "metric": "ctr",
  "avg_value": 2.8,
  "median_value": 2.5,
  "sample_count": 120,
  "confidence": "high",
  "lift_vs_average": 34.0,
  "lift_ci_lower": 12.5,
  "category": "beauty",
  "source": "internal",
  "calculated_at": "2026-03-25T04:00:00Z"
}
```

```json
// fixture: prescription_benchmark_motion — Motion 글로벌 벤치마크
{
  "id": "550e8400-e29b-41d4-a716-446655440002",
  "source": "motion_global",
  "media_type": "IMAGE",
  "category": null,
  "metric": "ctr",
  "p10": 0.5,
  "p25": 0.9,
  "p50": 1.5,
  "p75": 2.3,
  "p90": 3.5,
  "sample_count": 50000,
  "period": "2026-Q1",
  "updated_at": "2026-03-01T00:00:00Z"
}
```

```json
// fixture: creative_media_with_analysis — 5축 분석 완료된 소재
{
  "id": "660e8400-e29b-41d4-a716-446655440003",
  "creative_id": "770e8400-e29b-41d4-a716-446655440004",
  "media_type": "IMAGE",
  "analysis_json": {
    "visual": { "color_scheme": "warm", "product_visibility": "high", "color": { "contrast": "high" } },
    "text": { "headline": "50% 할인", "headline_type": "benefit", "cta_text": "자세히 보기", "key_message": "봄 세일", "readability": "high", "social_proof": { "review_shown": false, "before_after": false, "testimonial": false, "numbers": false } },
    "psychology": { "emotion": "joy", "social_proof_type": "none", "urgency": "none", "authority": "none" },
    "quality": { "production_quality": "professional", "brand_consistency": "medium", "readability": "high" },
    "hook": { "hook_type": "benefit", "visual_style": "professional", "composition": "center" },
    "scores": { "visual_impact": 72, "message_clarity": 80, "cta_effectiveness": 45, "social_proof_score": 10, "overall": 52 }
  },
  "embedding": [0.1, 0.2, 0.3]
}
```

```json
// fixture: daily_ad_insights_sample — 성과 데이터
{
  "id": "880e8400-e29b-41d4-a716-446655440005",
  "ad_id": "23841234567890",
  "account_id": "act_123456789",
  "date_start": "2026-03-20",
  "spend": 50000,
  "impressions": 25000,
  "clicks": 500,
  "ctr": 2.0,
  "cpc": 100,
  "purchases": 10,
  "website_purchase_value": 500000,
  "video_p3s": 0,
  "video_view": 0,
  "thruplay": 0,
  "reactions": 120,
  "comments": 15,
  "shares": 8,
  "saves": 22,
  "initiate_checkout": 25
}
```

### T4. 테스트 파일 경로 규약

| 테스트 대상 | 테스트 파일 경로 | 테스트 프레임워크 |
|-----------|---------------|----------------|
| `prescription-engine.ts` (13단계 처방 엔진) | `__tests__/prescription-v2/prescription-engine.test.ts` | vitest |
| `performance-backtracker.ts` (성과역추적) | `__tests__/prescription-v2/performance-backtracker.test.ts` | vitest |
| `andromeda-analyzer.ts` (다양성 분석) | `__tests__/prescription-v2/andromeda-analyzer.test.ts` | vitest |
| `ear-analyzer.ts` (GEM/EAR 분석) | `__tests__/prescription-v2/ear-analyzer.test.ts` | vitest |
| `benchmark-lookup.ts` (축3 벤치마크 조회) | `__tests__/prescription-v2/benchmark-lookup.test.ts` | vitest |
| `prescription-prompt.ts` (Gemini 프롬프트) | `__tests__/prescription-v2/prescription-prompt.test.ts` | vitest |
| `calculateGlobalPercentile` | `__tests__/prescription-v2/percentile.test.ts` | vitest |
| `determineConfidence` | `__tests__/prescription-v2/confidence.test.ts` | vitest |

### T5. 통합 테스트 시나리오

| 시나리오 | Method | Endpoint | 요청 Body | 기대 응답 | 상태 코드 |
|---------|--------|----------|----------|---------|---------|
| 정상 처방 생성 (이미지) | POST | `/api/protractor/prescription` | `{ "creative_media_id": "valid-uuid", "account_id": "act_123" }` | `{ top3_prescriptions: [...], performance_backtrack: {...}, meta: { axis2_used: true } }` | 200 |
| 정상 처방 생성 (영상) | POST | `/api/protractor/prescription` | `{ "creative_media_id": "video-uuid", "account_id": "act_123" }` | 응답에 `retention_curve`, `scene_analysis` 포함 | 200 |
| 인증 실패 | POST | `/api/protractor/prescription` | `{ "creative_media_id": "any" }` (토큰 없음) | `{ error: "인증이 필요합니다" }` | 401 |
| 권한 부족 (역할 미달) | POST | `/api/protractor/prescription` | `{ "creative_media_id": "any" }` (alumni 역할) | `{ error: "접근 권한이 없습니다" }` | 403 |
| 계정 소유권 불일치 | POST | `/api/protractor/prescription` | `{ "creative_media_id": "uuid", "account_id": "act_other" }` | `{ error: "계정 접근 권한이 없습니다" }` | 403 |
| 소재 미존재 | POST | `/api/protractor/prescription` | `{ "creative_media_id": "nonexistent-uuid" }` | `{ error: "소재를 찾을 수 없습니다" }` | 404 |
| 5축 분석 미완료 | POST | `/api/protractor/prescription` | `{ "creative_media_id": "no-analysis-uuid" }` | `{ error: "이 소재는 아직 AI 분석이 완료되지 않았습니다" }` | 422 |
| 벤치마크 시드 (관리자) | POST | `/api/protractor/benchmarks/collect` | `{ "source": "motion_global", "period": "2026-Q1", "metrics": { "ctr": { "p10": 0.5, "p25": 0.9, "p50": 1.5, "p75": 2.3, "p90": 3.5, "sample_count": 50000 } } }` | `{ success: true }` | 200 |
| 패턴 재계산 트리거 | POST | `/api/protractor/prescription/recalculate-patterns` | `{}` | `{ total_patterns: 168, by_confidence: { high: 42, medium: 78, low: 48 } }` | 200 |
