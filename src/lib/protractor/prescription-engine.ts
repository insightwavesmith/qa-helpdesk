/**
 * 처방 엔진 메인 (13단계)
 * 설계서: docs/02-design/features/prescription-system-v2.design.md 섹션 3
 */

import type { DbClient } from '@/lib/db';
import { ATTRIBUTE_AXIS_MAP } from './metric-groups';
import { fetchGlobalBenchmarks, buildPercentileMap } from './benchmark-lookup';
import { analyzeEarImpact } from './ear-analyzer';
import {
  analyzeAccountDiversity,
  generateAndromedaMessage,
} from './andromeda-analyzer';
import {
  aggregateInsights,
  calculateBenchmarkDeviation,
  buildPerformanceBacktrack,
  getMetricLabel,
  getMetricGroup,
} from './performance-backtracker';
import { buildPrescriptionPrompt, PRESCRIPTION_OUTPUT_SCHEMA } from './prescription-prompt';
import type {
  AnalysisJsonV3,
  PrescriptionResponse,
  PrescriptionError as PrescriptionErrorType,
  PerformanceMetrics,
  BenchmarkComparison,
  PrescriptionPattern,
  AndromedaResult,
  EarAnalysis,
  SimilarBenchmark,
  GeminiPrescriptionOutput,
} from '@/types/prescription';
import { PrescriptionError } from '@/types/prescription';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-pro-preview';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TIMEOUT_MS = 15_000;
const MAX_RETRIES = 1;

// ── STEP 1: 소재 원본 + 메타데이터 조회 ─────────────────────────────

async function step1_fetchCreativeMedia(svc: DbClient, creativeMediaId: string) {
  const { data, error } = await (svc as DbClient)
    .from('creative_media')
    .select('id, creative_id, media_url, storage_url, ad_copy, media_type, analysis_json, saliency_url, video_analysis, embedding, account_id')
    .eq('id', creativeMediaId)
    .single();

  if (error || !data) throw new PrescriptionError('소재를 찾을 수 없습니다', 404, 'CREATIVE_NOT_FOUND');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const media = data as any;

  if (!media.analysis_json) {
    throw new PrescriptionError(
      '이 소재는 아직 분석되지 않았습니다. 분석 완료 후 처방을 받을 수 있습니다.',
      422,
      'NO_ANALYSIS'
    );
  }

  // creative → account_id, category 조회
  const { data: creative } = await svc
    .from('creatives')
    .select('account_id, category, ad_id')
    .eq('id', media.creative_id)
    .single();

  return { media, creative: creative as { account_id: string; category: string | null; ad_id: string } | null };
}

// ── STEP 2: 시선 데이터 조회 (DeepGaze) ─────────────────────────────

async function step2_fetchSaliencyData(svc: DbClient, creativeMediaId: string, mediaType: string) {
  const { data: saliency } = await svc
    .from('creative_saliency')
    .select('cta_attention_score, cognitive_load, top_fixations, attention_map_url, saliency_data')
    .eq('creative_media_id', creativeMediaId)
    .single();

  let videoSaliency = null;
  let sceneAnalysis = null;

  if (mediaType === 'VIDEO') {
    const { data: videoData } = await svc
      .from('creative_media')
      .select('video_analysis')
      .eq('id', creativeMediaId)
      .single();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sceneAnalysis = (videoData as any)?.video_analysis?.scene_analysis ?? null;

    const { data: frames } = await svc
      .from('video_saliency_frames')
      .select('second, cta_attention_score, cognitive_load, top_fixations')
      .eq('creative_media_id', creativeMediaId)
      .order('second', { ascending: true });

    videoSaliency = frames;
  }

  return { saliency: saliency ?? null, videoSaliency, sceneAnalysis };
}

// ── STEP 3: 성과 데이터 + 벤치마크 조회 ─────────────────────────────

async function step3_fetchPerformanceData(
  svc: DbClient,
  creativeId: string,
  mediaType: string,
) {
  const { data: insights } = await svc
    .from('daily_ad_insights')
    .select('*')
    .eq('creative_id', creativeId);

  if (!insights || insights.length === 0) {
    return { hasPerformanceData: false, metrics: null, benchmarkComparison: {} as BenchmarkComparison };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const aggregated = aggregateInsights(insights as any[]);

  const { data: benchmarks } = await svc
    .from('benchmarks')
    .select('*')
    .eq('creative_type', mediaType)
    .eq('ranking_group', 'ABOVE_AVERAGE');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comparison = calculateBenchmarkDeviation(aggregated, benchmarks as any[] | null);

  return {
    hasPerformanceData: true,
    metrics: aggregated,
    benchmarkComparison: comparison,
  };
}

// ── STEP 4: prescription_patterns 조회 (축2) ─────────────────────────

function extractAttributes(
  analysisJson: AnalysisJsonV3
): Array<{ attribute: string; value: string }> {
  const results: Array<{ attribute: string; value: string }> = [];

  for (const mapping of ATTRIBUTE_AXIS_MAP) {
    const parts = mapping.attribute.split('.');
    if (parts.length !== 2) continue;
    const [axis, field] = parts;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const axisData = (analysisJson as any)[axis];
    if (!axisData) continue;

    // psychology.social_proof → social_proof_type 매핑
    let value: string | null = null;
    if (axis === 'psychology' && field === 'social_proof') {
      value = axisData.social_proof_type ?? null;
    } else {
      value = axisData[field] ?? null;
    }

    if (value && typeof value === 'string') {
      results.push({ attribute: mapping.attribute, value });
    }
  }

  return results;
}

async function step4_fetchPatterns(
  svc: DbClient,
  analysisJson: AnalysisJsonV3,
  category: string | null
): Promise<{ patterns: PrescriptionPattern[]; categoryFallback: boolean }> {
  const currentAttributes = extractAttributes(analysisJson);
  const attributeNames = currentAttributes.map(a => a.attribute);

  if (attributeNames.length === 0) {
    return { patterns: [], categoryFallback: false };
  }

  let categoryFallback = false;

  if (category) {
    const { data: patterns } = await svc
      .from('prescription_patterns')
      .select('*')
      .in('attribute', attributeNames)
      .eq('category', category)
      .in('confidence', ['high', 'medium']);

    if (patterns && patterns.length >= 5) {
      return { patterns: patterns as PrescriptionPattern[], categoryFallback: false };
    }
  }

  // Fallback: 전체(ALL) 패턴
  categoryFallback = true;
  const { data: allPatterns } = await svc
    .from('prescription_patterns')
    .select('*')
    .in('attribute', attributeNames)
    .is('category', null);

  return { patterns: (allPatterns ?? []) as PrescriptionPattern[], categoryFallback };
}

// ── STEP 6: 유사 벤치마크 소재 Top3 검색 ─────────────────────────────

async function step6_searchSimilarBenchmarks(
  svc: DbClient,
  embedding: number[] | null
): Promise<SimilarBenchmark[]> {
  if (!embedding || embedding.length === 0) return [];

  try {
    const { data } = await svc.rpc('search_similar_creatives', {
      query_embedding: embedding,
      match_count: 3,
      filter_source: 'benchmark',
      filter_category: null,
    });

    return ((data ?? []) as Array<{
      id: string;
      similarity: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      analysis_json: any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      performance_summary: any;
    }>).map(row => ({
      creative_id: row.id,
      similarity: row.similarity,
      analysis_json: row.analysis_json ?? null,
      performance: row.performance_summary ?? null,
    }));
  } catch {
    return [];
  }
}

// ── STEP 11: Gemini 1회 통합 호출 ─────────────────────────────────────

async function step11_callGemini(prompt: {
  systemPrompt: string;
  textParts: string[];
  mediaPart: object | null;
}): Promise<GeminiPrescriptionOutput> {
  if (!GEMINI_API_KEY) {
    throw new PrescriptionError('AI 분석 중 오류가 발생했습니다.', 500, 'GEMINI_ERROR');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const parts: any[] = [];

      // 텍스트 파트 (시스템 프롬프트 + 4섹션)
      parts.push({ text: prompt.systemPrompt + '\n\n' + prompt.textParts.join('\n\n') });

      // 미디어 파트
      if (prompt.mediaPart) {
        parts.push(prompt.mediaPart);
      }

      // JSON 스키마 강제
      parts.push({ text: `\n\n출력 JSON 스키마:\n${JSON.stringify(PRESCRIPTION_OUTPUT_SCHEMA)}` });

      const res = await fetch(
        `${GEMINI_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts }],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 4096,
              responseMimeType: 'application/json',
            },
          }),
          signal: controller.signal,
        }
      );

      if (res.status === 429 && attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      if (!res.ok) {
        throw new PrescriptionError(`AI 분석 중 오류가 발생했습니다.`, 500, 'GEMINI_ERROR');
      }

      const responseData = await res.json();
      const text = responseData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

      try {
        return JSON.parse(text) as GeminiPrescriptionOutput;
      } catch {
        throw new PrescriptionError('분석 결과 처리 중 오류가 발생했습니다.', 500, 'GEMINI_PARSE_ERROR');
      }

    } catch (err: unknown) {
      const error = err as { name?: string } & PrescriptionErrorType;
      if (error.name === 'AbortError') {
        throw new PrescriptionError('처방 생성이 지연되고 있습니다. 잠시 후 다시 시도해주세요.', 504, 'GEMINI_TIMEOUT');
      }
      if (err instanceof PrescriptionError) throw err;
      if (attempt >= MAX_RETRIES) throw new PrescriptionError('AI 분석 중 오류가 발생했습니다.', 500, 'GEMINI_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new PrescriptionError('AI 분석 중 오류가 발생했습니다.', 500, 'GEMINI_ERROR');
}

// ── STEP 12: 후처리 ───────────────────────────────────────────────────

function generateEarImpactText(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  wa: any,
  earAnalysis: EarAnalysis
): string {
  if (wa.affectsGroups?.includes(earAnalysis.primaryBottleneck)) {
    return `${earAnalysis.primaryBottleneck} 병목 해소에 직접 기여 (가중치: ${wa.weight})`;
  }
  return `간접 영향 (가중치: ${wa.weight})`;
}

function step12_postProcess(
  geminiOutput: GeminiPrescriptionOutput,
  globalBenchmarks: import('@/types/prescription').PrescriptionBenchmark[],
  performanceBacktrack: import('@/types/prescription').PerformanceBacktrackInput | null,
  earAnalysis: EarAnalysis,
) {
  // 5축 scores → 백분위 산정
  const scoresRecord: Record<string, number> = geminiOutput.scores
    ? Object.fromEntries(Object.entries(geminiOutput.scores))
    : {};
  const percentiles = buildPercentileMap(scoresRecord, globalBenchmarks);

  // 백분위 하위 30% 이하 축/속성 감지
  const weakAxes = Object.entries(percentiles)
    .filter(([, p]) => p <= 30)
    .map(([axis]) => axis);

  // ATTRIBUTE_AXIS_MAP으로 약점 → affectsGroups 매핑
  const weakAttributes = ATTRIBUTE_AXIS_MAP
    .filter(a => weakAxes.includes(a.axis))
    .map(a => ({
      ...a,
      percentile: percentiles[a.axis] ?? 50,
    }));

  // 성과역추적 약점과 5축 약점 교차 검증
  if (performanceBacktrack && geminiOutput.top3_prescriptions) {
    for (const prescription of geminiOutput.top3_prescriptions) {
      const isPerformanceDriven = performanceBacktrack.worstMetrics.some(wm =>
        weakAttributes.some(wa =>
          wa.affectsGroups.includes(wm.group as 'foundation' | 'engagement' | 'conversion') &&
          wa.attribute === prescription.attribute
        )
      );
      prescription.performance_driven = isPerformanceDriven;
    }
  }

  // weight 기반 impact 순 정렬
  weakAttributes.sort((a, b) => b.weight - a.weight);

  const weaknessAnalysis = weakAttributes.map(wa => ({
    axis: wa.axis,
    attribute: wa.attribute,
    attribute_label: wa.label,
    current_percentile: wa.percentile,
    global_percentile: percentiles[wa.axis] ?? 0,
    issue: geminiOutput.weakness_analysis?.find(w => w.attribute === wa.attribute)?.issue ?? '',
    benchmark_comparison: geminiOutput.weakness_analysis?.find(w => w.attribute === wa.attribute)?.benchmark_comparison ?? '',
    affects_groups: wa.affectsGroups,
    ear_impact: generateEarImpactText(wa, earAnalysis),
  }));

  return { percentiles, weakAttributes, weaknessAnalysis };
}

// ── STEP 13: 최종 조립 ────────────────────────────────────────────────

function step13_finalAssembly(
  geminiOutput: GeminiPrescriptionOutput,
  andromedaResult: AndromedaResult,
  earAnalysis: EarAnalysis,
  postProcess: ReturnType<typeof step12_postProcess>,
  meta: PrescriptionResponse['meta'],
): PrescriptionResponse {
  // performance_driven 우선 정렬
  const sortedPrescriptions = [...(geminiOutput.top3_prescriptions ?? [])].sort((a, b) => {
    if (a.performance_driven && !b.performance_driven) return -1;
    if (!a.performance_driven && b.performance_driven) return 1;
    return a.rank - b.rank;
  });

  // Andromeda 경고 첨부 (medium/high인 경우)
  const andromedaWarning = andromedaResult.warningLevel !== 'low'
    ? {
      level: andromedaResult.warningLevel,
      message: generateAndromedaMessage(andromedaResult),
      similar_pairs: andromedaResult.similarPairs,
      diversification_suggestion: andromedaResult.diversificationSuggestion!,
      diversity_score: andromedaResult.diversityScore,
    }
    : null;

  return {
    five_axis: geminiOutput.five_axis,
    scores: geminiOutput.scores,
    percentiles: postProcess.percentiles,
    top3_prescriptions: sortedPrescriptions as PrescriptionResponse['top3_prescriptions'],
    performance_backtrack: geminiOutput.performance_backtrack ?? null,
    andromeda_warning: andromedaWarning,
    ear_analysis: {
      primary_bottleneck: earAnalysis.primaryBottleneck,
      bottleneck_detail: earAnalysis.bottleneckDetail,
      improvement_priority: earAnalysis.improvementPriority,
    },
    customer_journey_summary: geminiOutput.customer_journey_summary,
    weakness_analysis: postProcess.weaknessAnalysis,
    meta,
  };
}

// ── 메인 엔트리포인트: 13단계 처방 생성 ─────────────────────────────

export async function generatePrescription(
  svc: DbClient,
  creativeMediaId: string,
  accountId: string,
  forceRefresh = false
): Promise<PrescriptionResponse> {
  const startTime = Date.now();

  // STEP 1: 소재 원본 조회
  const { media, creative } = await step1_fetchCreativeMedia(svc, creativeMediaId);
  const category = creative?.category ?? null;
  const analysisJson = media.analysis_json as AnalysisJsonV3;

  // 캐시 체크 (force_refresh=false이고 top3_prescriptions가 이미 있으면 캐시 반환)
  if (!forceRefresh && analysisJson.top3_prescriptions && analysisJson.top3_prescriptions.length > 0 && analysisJson.meta) {
    const cachedMeta = analysisJson.meta;
    return {
      five_axis: analysisJson,
      scores: analysisJson.scores ?? { visual_impact: 0, message_clarity: 0, cta_effectiveness: 0, social_proof_score: 0, overall: 0 },
      percentiles: {},
      top3_prescriptions: analysisJson.top3_prescriptions as PrescriptionResponse['top3_prescriptions'],
      performance_backtrack: (analysisJson.performance_backtrack as PrescriptionResponse['performance_backtrack']) ?? null,
      andromeda_warning: analysisJson.andromeda_warning ?? null,
      ear_analysis: analysisJson.ear_analysis ?? { primary_bottleneck: 'foundation', bottleneck_detail: '', improvement_priority: '' },
      customer_journey_summary: { sensation: '', thinking: '', action_click: '', action_purchase: '' },
      weakness_analysis: [],
      meta: { ...cachedMeta, has_performance_data: false },
    };
  }

  // STEP 2: 시선 데이터 조회
  const { saliency, videoSaliency, sceneAnalysis } = await step2_fetchSaliencyData(
    svc, creativeMediaId, media.media_type
  );

  // STEP 3: 성과 데이터 조회
  const { hasPerformanceData, metrics, benchmarkComparison } = await step3_fetchPerformanceData(
    svc, media.creative_id, media.media_type
  );

  // STEP 4: prescription_patterns 조회 (축2)
  const { patterns, categoryFallback } = await step4_fetchPatterns(svc, analysisJson, category);

  // STEP 5: Andromeda 다양성 분석
  let andromedaResult: AndromedaResult = {
    diversityScore: 100,
    warningLevel: 'low',
    similarPairs: [],
    diversificationSuggestion: null,
  };
  try {
    andromedaResult = await analyzeAccountDiversity(
      svc, accountId, creativeMediaId, analysisJson
    );
  } catch {
    // Andromeda 실패 → 경고 없이 진행
  }

  // STEP 6: 유사 벤치마크 소재 검색
  const embedding = media.embedding ?? null;
  const similarBenchmarks = await step6_searchSimilarBenchmarks(svc, embedding);

  // STEP 7: Motion 글로벌 벤치마크 조회 (축3)
  const { benchmarks: globalBenchmarks } = await fetchGlobalBenchmarks(
    svc, media.media_type, category
  );

  // STEP 8: EAR 분석
  const earAnalysis: EarAnalysis = analyzeEarImpact(benchmarkComparison);

  // STEP 9: 성과역추적 패키징
  const performanceBacktrack = hasPerformanceData && metrics
    ? buildPerformanceBacktrack(
      metrics,
      benchmarkComparison,
      videoSaliency,
      sceneAnalysis,
      media.media_type
    )
    : null;

  // STEP 10: Gemini 프롬프트 구성
  const promptParts = await buildPrescriptionPrompt({
    media,
    saliency,
    performanceBacktrack,
    patterns,
    globalBenchmarks,
    andromedaResult,
    similarBenchmarks,
    earAnalysis,
    hasPerformanceData,
  });

  // STEP 11: Gemini 1회 통합 호출
  const geminiOutput = await step11_callGemini(promptParts);

  // STEP 12: 후처리 (백분위 + 약점 식별)
  const postProcess = step12_postProcess(geminiOutput, globalBenchmarks, performanceBacktrack, earAnalysis);

  // 메타 정보
  const meta: PrescriptionResponse['meta'] = {
    model: GEMINI_MODEL,
    latency_ms: Date.now() - startTime,
    axis2_used: patterns.length > 0,
    axis3_used: globalBenchmarks.length > 0,
    patterns_count: patterns.length,
    benchmarks_count: globalBenchmarks.length,
    category_fallback: categoryFallback,
    similar_count: similarBenchmarks.length,
    andromeda_analyzed: true,
    has_performance_data: hasPerformanceData,
  };

  // STEP 13: 최종 조립
  const result = step13_finalAssembly(geminiOutput, andromedaResult, earAnalysis, postProcess, meta);

  // 결과를 creative_media.analysis_json에 저장 (비동기, 실패 무시)
  try {
    const updatedAnalysis = {
      ...analysisJson,
      ...geminiOutput.five_axis,
      scores: geminiOutput.scores,
      top3_prescriptions: result.top3_prescriptions,
      performance_backtrack: result.performance_backtrack,
      andromeda_warning: result.andromeda_warning,
      ear_analysis: result.ear_analysis,
      meta,
    };
    await svc
      .from('creative_media')
      .update({ analysis_json: updatedAnalysis })
      .eq('id', creativeMediaId);
  } catch {
    // 저장 실패 무시
  }

  return result;
}
