/**
 * 성과역추적 모듈 (STEP 9)
 * 역할: 데이터 수집 + worst 3 추출 + raw 패키징
 * Gemini가 하는 것: 이탈 지점 판단, 씬 매칭, 속성 역매핑
 */

import { METRIC_GROUPS } from './metric-groups';
import type {
  PerformanceMetrics,
  BenchmarkComparison,
  PerformanceBacktrackInput,
} from '@/types/prescription';

// ── 지표 메타 조회 헬퍼 ───────────────────────────────────────────────

const METRIC_LABEL_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of METRIC_GROUPS) {
    for (const m of group.metrics) {
      map[m.key] = m.label;
    }
    if (group.summaryMetric) {
      map[group.summaryMetric.key] = group.summaryMetric.label;
    }
  }
  return map;
})();

const METRIC_GROUP_MAP: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const group of METRIC_GROUPS) {
    for (const m of group.metrics) {
      map[m.key] = group.groupKey;
    }
    if (group.summaryMetric) {
      map[group.summaryMetric.key] = group.groupKey;
    }
  }
  return map;
})();

export function getMetricLabel(metric: string): string {
  return METRIC_LABEL_MAP[metric] ?? metric;
}

export function getMetricGroup(metric: string): string {
  return METRIC_GROUP_MAP[metric] ?? 'conversion';
}

// ── 성과 집계 헬퍼 ────────────────────────────────────────────────────

/**
 * daily_ad_insights 로우들을 지표별로 평균 집계
 */
export function aggregateInsights(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insights: any[]
): PerformanceMetrics {
  if (!insights || insights.length === 0) return {};

  const metricKeys: (keyof PerformanceMetrics)[] = [
    'video_p3s_rate', 'thruplay_rate', 'retention_rate',
    'reactions_per_10k', 'comments_per_10k', 'shares_per_10k',
    'saves_per_10k', 'engagement_per_10k',
    'ctr', 'click_to_checkout_rate', 'click_to_purchase_rate',
    'checkout_to_purchase_rate', 'reach_to_purchase_rate', 'roas',
    'video_p25', 'video_p50', 'video_p75', 'video_p100', 'video_avg_time',
  ];

  const result: Record<string, number> = {};

  for (const key of metricKeys) {
    const values = insights
      .map(row => Number(row[key]))
      .filter(v => !isNaN(v) && v !== null);

    if (values.length > 0) {
      result[key] = values.reduce((sum, v) => sum + v, 0) / values.length;
    }
  }

  // ranking은 최신 레코드 기준
  const latest = insights[insights.length - 1];
  if (latest.quality_ranking) result['quality_ranking'] = latest.quality_ranking;
  if (latest.engagement_ranking) result['engagement_ranking'] = latest.engagement_ranking;
  if (latest.conversion_ranking) result['conversion_ranking'] = latest.conversion_ranking;

  return result as unknown as PerformanceMetrics;
}

/**
 * 벤치마크 대비 편차 계산
 */
export function calculateBenchmarkDeviation(
  aggregated: PerformanceMetrics,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  benchmarks: any[] | null
): BenchmarkComparison {
  const comparison: BenchmarkComparison = {};

  if (!benchmarks || benchmarks.length === 0) return comparison;

  for (const bench of benchmarks) {
    const metric = bench.metric_key ?? bench.metric;
    const benchValue = Number(bench.avg_value ?? bench.value ?? 0);

    const actual = Number((aggregated as Record<string, unknown>)[metric] ?? 0);
    if (actual === 0 || benchValue === 0) continue;

    const deviation = benchValue > 0
      ? ((actual - benchValue) / benchValue) * 100
      : 0;

    comparison[metric] = {
      actual,
      benchmark: benchValue,
      deviation: Math.round(deviation * 10) / 10,
      group: getMetricGroup(metric) as 'foundation' | 'engagement' | 'conversion',
    };
  }

  return comparison;
}

/**
 * 영상 재생 이탈 raw 데이터 추출
 */
function extractVideoRaw(metrics: PerformanceMetrics): PerformanceBacktrackInput['videoRaw'] {
  return {
    p3s: metrics.video_p3s_rate ?? 0,
    p25: metrics.video_p25 ?? 0,
    p50: metrics.video_p50 ?? 0,
    p75: metrics.video_p75 ?? 0,
    p100: metrics.video_p100 ?? 0,
    avg_time_sec: metrics.video_avg_time ?? 0,
  };
}

// ── STEP 9 메인 함수 ──────────────────────────────────────────────────

/**
 * STEP 9: 성과역추적 — 벤치마크 대비 약점 포인트 식별
 * 코드가 하는 것: 편차율 계산 + worst 3 추출 + raw 데이터 패키징
 * Gemini가 하는 것: 이탈 지점 판단, 씬 매칭, 속성 역매핑
 */
export function buildPerformanceBacktrack(
  performanceData: PerformanceMetrics,
  benchmarkComparison: BenchmarkComparison,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  videoSaliency: any[] | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sceneAnalysis: any | null,
  mediaType: string
): PerformanceBacktrackInput {
  // 9-1. 전체 지표 편차율 계산
  const allDeviations = Object.entries(benchmarkComparison).map(([metric, comp]) => ({
    metric,
    label: getMetricLabel(metric),
    actual: comp.actual,
    benchmark: comp.benchmark,
    deviation: comp.deviation,
    group: comp.group,
  }));

  // 9-2. worst 3 추출 (편차율 음수 기준)
  const worstMetrics = allDeviations
    .filter(d => d.deviation < 0)
    .sort((a, b) => a.deviation - b.deviation)
    .slice(0, 3);

  // 9-3. Meta 랭킹 3종
  const metaRankings = {
    quality: (performanceData as Record<string, unknown>)['quality_ranking'] as string ?? null,
    engagement: (performanceData as Record<string, unknown>)['engagement_ranking'] as string ?? null,
    conversion: (performanceData as Record<string, unknown>)['conversion_ranking'] as string ?? null,
  };

  // 영상 전용 raw 데이터
  const isVideo = mediaType === 'VIDEO';

  return {
    worstMetrics,
    videoRaw: isVideo ? extractVideoRaw(performanceData) : undefined,
    deepgazePerSec: isVideo && videoSaliency ? videoSaliency : undefined,
    sceneAnalysis: isVideo && sceneAnalysis ? sceneAnalysis : undefined,
    metaRankings,
    allMetricsWithDeviation: allDeviations,
  };
}
