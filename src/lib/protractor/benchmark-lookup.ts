/**
 * 축3: Motion 글로벌 벤치마크 조회
 * 설계서 STEP 7: prescription_benchmarks 테이블에서 백분위 데이터 조회
 */

import type { DbClient } from '@/lib/db';
import type { PrescriptionBenchmark } from '@/types/prescription';

/**
 * 대상 소재 지표의 글로벌 백분위 산정
 * 설계서 1.2 calculateGlobalPercentile 함수
 */
export function calculateGlobalPercentile(
  actualValue: number,
  benchmark: { p10: number | null; p25: number | null; p50: number | null; p75: number | null; p90: number | null }
): number {
  const p10 = benchmark.p10 ?? 0;
  const p25 = benchmark.p25 ?? 0;
  const p50 = benchmark.p50 ?? 0;
  const p75 = benchmark.p75 ?? 0;
  const p90 = benchmark.p90 ?? 0;

  if (actualValue <= p10) return 5;
  if (actualValue <= p25) {
    const range = p25 - p10;
    if (range === 0) return 10;
    return 10 + ((actualValue - p10) / range) * 15;
  }
  if (actualValue <= p50) {
    const range = p50 - p25;
    if (range === 0) return 25;
    return 25 + ((actualValue - p25) / range) * 25;
  }
  if (actualValue <= p75) {
    const range = p75 - p50;
    if (range === 0) return 50;
    return 50 + ((actualValue - p50) / range) * 25;
  }
  if (actualValue <= p90) {
    const range = p90 - p75;
    if (range === 0) return 75;
    return 75 + ((actualValue - p75) / range) * 15;
  }
  return 95;
}

/**
 * STEP 7: prescription_benchmarks 테이블에서 글로벌 벤치마크 조회
 * 카테고리별 조회 → 없으면 전체(NULL) fallback
 */
export async function fetchGlobalBenchmarks(
  svc: DbClient,
  mediaType: string,
  category: string | null
): Promise<{ benchmarks: PrescriptionBenchmark[]; source: string }> {
  if (category) {
    const { data: catBench } = await svc
      .from('prescription_benchmarks')
      .select('metric, p10, p25, p50, p75, p90, sample_count')
      .eq('source', 'motion_global')
      .eq('media_type', mediaType)
      .eq('category', category)
      .order('updated_at', { ascending: false });

    if (catBench && catBench.length > 0) {
      return { benchmarks: catBench as PrescriptionBenchmark[], source: 'category' };
    }
  }

  // fallback: 전체(NULL) 벤치마크
  const { data: globalBench } = await svc
    .from('prescription_benchmarks')
    .select('metric, p10, p25, p50, p75, p90, sample_count')
    .eq('source', 'motion_global')
    .eq('media_type', mediaType)
    .is('category', null);

  return {
    benchmarks: (globalBench ?? []) as PrescriptionBenchmark[],
    source: 'global_fallback',
  };
}

/**
 * 지표별 백분위 계산 맵 생성
 */
export function buildPercentileMap(
  scores: Record<string, number>,
  benchmarks: PrescriptionBenchmark[]
): Record<string, number> {
  const benchmarkMap = new Map(benchmarks.map(b => [b.metric, b]));
  const percentiles: Record<string, number> = {};

  for (const [metric, value] of Object.entries(scores)) {
    const bench = benchmarkMap.get(metric);
    if (bench) {
      percentiles[metric] = Math.round(calculateGlobalPercentile(value, bench));
    }
  }

  return percentiles;
}
