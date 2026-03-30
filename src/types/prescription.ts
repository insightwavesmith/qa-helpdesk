/**
 * 처방 시스템 v2 TypeScript 타입 정의
 * 설계서: docs/02-design/features/prescription-system-v2.design.md
 */

// ── AnalysisJsonV3 (creative_media.analysis_json 스키마) ──────────────

export interface AnalysisJsonV3 {
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
  attention?: {
    cta_attention_score: number;
    primary_focus: string;
    gaze_pattern: string;
  };
  audio?: {
    has_narration: boolean;
    narration_tone: 'professional' | 'casual' | 'energetic' | 'calm';
    bgm_genre: 'upbeat' | 'calm' | 'dramatic' | 'trendy' | 'none';
    sound_effects: boolean;
  };
  structure?: {
    scene_count: number;
    avg_scene_duration: number;
    pacing: 'fast' | 'medium' | 'slow';
    transition_pattern: string;
    loop_structure: boolean;
  };
  deepgaze_context?: {
    cta_attention_score: number;
    dominant_region: string;
    top_fixation: { x: number; y: number; ratio: number };
  };
  scene_analysis?: {
    scenes: Array<{
      time: string;
      type: string;
      desc: string;
      deepgaze: {
        avg_fixation_x: number | null;
        avg_fixation_y: number | null;
        dominant_region: string;
        cta_visible: boolean;
        fixation_count: number;
        avg_intensity: number | null;
      };
      analysis: {
        hook_strength: number;
        attention_quality: 'high' | 'medium' | 'low';
        message_clarity: 'high' | 'medium' | 'low';
        viewer_action: string;
        improvement?: string;
      };
      element_attention?: Array<{
        type: string;
        attention_pct: number;
      }>;
    }>;
    overall: {
      total_scenes: number;
      hook_effective: boolean;
      cta_reached: boolean;
      analyzed_at: string;
      model: string;
    };
  };
  customer_journey_summary?: {
    sensation: string;
    thinking: string;
    action_click: string;
    action_purchase: string;
  };
  andromeda_signals?: {
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

  // ── v3 확장: 씬 여정 + 오디오 상세 + 고객여정 상세 ──
  scene_journey?: SceneJourneyItem[];
  audio_analysis_detail?: AudioAnalysisDetail;
  customer_journey_detail?: CustomerJourneyDetail;

  // ── 점수 ──
  scores?: {
    visual_impact: number;
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
      deviation: number;
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

// ── API 요청/응답 타입 ─────────────────────────────────────────────────

export interface PrescriptionRequest {
  creative_media_id: string;
  account_id: string;
  force_refresh?: boolean;
}

export interface PrescriptionResponse {
  five_axis: AnalysisJsonV3;
  scores: {
    visual_impact: number;
    message_clarity: number;
    cta_effectiveness: number;
    social_proof_score: number;
    overall: number;
  };
  percentiles: Record<string, number>;
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
  } | null;
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
  ear_analysis: {
    primary_bottleneck: string;
    bottleneck_detail: string;
    improvement_priority: string;
  };
  customer_journey_summary: {
    sensation: string;
    thinking: string;
    action_click: string;
    action_purchase: string;
  };
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
  // ── v3 확장: 씬 여정 + 오디오 + 고객여정 상세 ──
  scene_journey?: SceneJourneyItem[];
  audio_analysis?: AudioAnalysisDetail;
  customer_journey_detail?: CustomerJourneyDetail;
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

// ── 내부 처방 엔진 타입 ───────────────────────────────────────────────

export interface PrescriptionPattern {
  id: string;
  attribute: string;
  value: string;
  axis: string;
  metric: string;
  avg_value: number | null;
  median_value: number | null;
  sample_count: number;
  confidence: 'high' | 'medium' | 'low';
  lift_vs_average: number | null;
  lift_ci_lower: number | null;
  category: string | null;
  source: string;
  calculated_at: string;
}

export interface PrescriptionBenchmark {
  metric: string;
  p10: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  sample_count: number | null;
}

export interface BenchmarkSeedRequest {
  source: 'motion_global' | 'motion_category' | 'internal_top10';
  media_type: 'IMAGE' | 'VIDEO' | null;
  category: string | null;
  period: string;
  metrics: Record<string, {
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    sample_count: number;
  }>;
}

export interface PerformanceMetrics {
  video_p3s_rate?: number;
  thruplay_rate?: number;
  retention_rate?: number;
  reactions_per_10k?: number;
  comments_per_10k?: number;
  shares_per_10k?: number;
  saves_per_10k?: number;
  engagement_per_10k?: number;
  ctr?: number;
  click_to_checkout_rate?: number;
  click_to_purchase_rate?: number;
  checkout_to_purchase_rate?: number;
  reach_to_purchase_rate?: number;
  roas?: number;
  quality_ranking?: string | null;
  engagement_ranking?: string | null;
  conversion_ranking?: string | null;
  video_p25?: number;
  video_p50?: number;
  video_p75?: number;
  video_p100?: number;
  video_avg_time?: number;
}

export interface BenchmarkComparison {
  [metric: string]: {
    actual: number;
    benchmark: number;
    deviation: number;
    group: 'foundation' | 'engagement' | 'conversion';
  };
}

export interface PerformanceBacktrackInput {
  worstMetrics: Array<{
    metric: string;
    label: string;
    actual: number;
    benchmark: number;
    deviation: number;
    group: string;
  }>;
  videoRaw?: {
    p3s: number;
    p25: number;
    p50: number;
    p75: number;
    p100: number;
    avg_time_sec: number;
  };
  deepgazePerSec?: Array<{
    second: number;
    cta_attention_score: number;
    cognitive_load: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    top_fixations: any[];
  }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sceneAnalysis?: any;
  metaRankings: {
    quality: string | null;
    engagement: string | null;
    conversion: string | null;
  };
  allMetricsWithDeviation: Array<{
    metric: string;
    label: string;
    actual: number;
    benchmark: number;
    deviation: number;
    group: string;
  }>;
}

export interface AndromedaResult {
  diversityScore: number;
  warningLevel: 'low' | 'medium' | 'high';
  similarPairs: Array<{ creative_id: string; similarity: number; overlap_axes: string[] }>;
  diversificationSuggestion: {
    persona: string;
    desire: string;
    awareness: string;
  } | null;
}

export interface EarAnalysis {
  primaryBottleneck: 'foundation' | 'engagement' | 'conversion';
  bottleneckDetail: string;
  improvementPriority: string;
}

// ── 씬 여정 (scene_journey) ──────────────────────────────────────────

export interface SceneJourneyItem {
  time: string;                    // "0-3초"
  type: string;                    // "hook" | "demo" | "result" | "tip" | "cta"
  watched: string;                 // 👁 봤다 (구체적 시각 묘사)
  heard: string;                   // 👂 들었다 (나레이션/오디오)
  felt: string;                    // 🧠 느꼈다 (심리적 반응)
  gaze_point: string;              // 📍 시선 집중 포인트
  subtitle_text: string;           // 📝 자막 원문
  prescription: {                  // 💊 씬별 처방
    target: string;                // 👁감각/🧠사고/🖱행동
    action: string;                // 구체적 개선방법
    reasoning: string;             // 근거
  };
}

// ── 오디오 분석 (audio_analysis) ─────────────────────────────────────

export interface AudioAnalysisDetail {
  narration_tone: string;          // "친한 친구가 꿀팁 알려주듯..."
  bgm_genre: string;               // "밝고 경쾌한 팝"
  emotion_flow: string;            // "공감→신뢰→감탄"
}

// ── 고객 여정 상세 (customer_journey_detail) ─────────────────────────

export interface CustomerJourneyDetail {
  sensation: { summary: string; detail: string };
  thinking: { summary: string; detail: string };
  action_click: { summary: string; metric: string };
  action_purchase: { summary: string; metric: string };
  core_insight: string;
}

export interface GeminiPrescriptionOutput {
  five_axis: AnalysisJsonV3;
  scores: {
    visual_impact: number;
    message_clarity: number;
    cta_effectiveness: number;
    social_proof_score: number;
    overall: number;
  };
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
    attribute?: string;
  }>;
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
  } | null;
  customer_journey_summary: {
    sensation: string;
    thinking: string;
    action_click: string;
    action_purchase: string;
  };
  weakness_analysis?: Array<{
    attribute: string;
    issue: string;
    benchmark_comparison: string;
  }>;
  // ── v3 확장: 씬 여정 + 오디오 + 고객여정 상세 ──
  scene_journey?: SceneJourneyItem[];
  audio_analysis?: AudioAnalysisDetail;
  customer_journey_detail?: CustomerJourneyDetail;
}

export interface GeminiPromptParts {
  systemPrompt: string;
  textParts: string[];
  mediaPart: object | null;
}

export interface SimilarBenchmark {
  creative_id: string;
  similarity: number;
  analysis_json: AnalysisJsonV3 | null;
  performance: Record<string, number> | null;
}

// ── 에러 클래스 ───────────────────────────────────────────────────────

export class PrescriptionError extends Error {
  constructor(
    public override message: string,
    public statusCode: number,
    public code?: string,
  ) {
    super(message);
    this.name = 'PrescriptionError';
  }
}
