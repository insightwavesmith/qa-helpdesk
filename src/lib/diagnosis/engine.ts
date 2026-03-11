import { Verdict } from './types';
import type { MetricResult, PartResult, DiagnosisResult } from './types';
import { PART_METRICS } from './metrics';
import { generateOneLineDiagnosis } from './one-line';

type AdData = Record<string, unknown>;

// ── GCP 벤치마크 형식 (wide format, ranking_group=ABOVE_AVERAGE 기준) ───────
export interface AboveAvgMap {
  [metricKey: string]: number | null | undefined;
}

export interface RankingBenchmark {
  above_avg?: AboveAvgMap;
  sample_count?: number;
}

/** GCP 방식 벤치마크: creativeType → (engagement|conversion) → ABOVE_AVERAGE 값 */
export interface GCPBenchmarks {
  [creativeType: string]: {
    engagement?: RankingBenchmark;
    conversion?: RankingBenchmark;
  };
}

// ── T8: ABOVE_AVERAGE 기준 3단계 판정 ──────────────────────────────────────

/** T8 판정 로직: ABOVE_AVERAGE 평균 × 0.75 임계값 기반 */
export function judgeMetric(
  myValue: number | null,
  aboveAvg: number | null | undefined,
  isReverse = false,
): Verdict {
  if (myValue == null || aboveAvg == null || aboveAvg === 0) {
    return Verdict.UNKNOWN;
  }

  const threshold = aboveAvg * 0.75;

  if (isReverse) {
    // 역방향: 낮을수록 좋음
    if (myValue <= threshold) return Verdict.GOOD;
    if (myValue <= aboveAvg) return Verdict.NORMAL;
    return Verdict.POOR;
  } else {
    // 정방향: 높을수록 좋음
    if (myValue >= aboveAvg) return Verdict.GOOD;
    if (myValue >= threshold) return Verdict.NORMAL;
    return Verdict.POOR;
  }
}

/** 파트별 종합 판정 — 개별 지표의 실제값/기준값 비율 평균 기반 */
export function judgePart(metricResults: MetricResult[]): Verdict {
  if (metricResults.length === 0) return Verdict.UNKNOWN;

  // 비율 계산 가능한 지표만 추출 (myValue, aboveAvg 모두 존재)
  const ratios: number[] = [];
  for (const m of metricResults) {
    if (m.verdict === Verdict.UNKNOWN) continue;
    if (m.myValue != null && m.aboveAvg != null && m.aboveAvg > 0) {
      if (m.isReverse) {
        // 역방향 지표: 기준값/실제값 (낮을수록 좋으므로 반전)
        ratios.push(m.myValue > 0 ? m.aboveAvg / m.myValue : 1);
      } else {
        ratios.push(m.myValue / m.aboveAvg);
      }
    }
  }

  if (ratios.length === 0) return Verdict.UNKNOWN;

  const avgRatio = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  // 비율 ≥ 1.0 → 🟢, 0.75 ≤ 비율 < 1.0 → 🟡, 비율 < 0.75 → 🔴
  if (avgRatio >= 1.0) return Verdict.GOOD;
  if (avgRatio >= 0.75) return Verdict.NORMAL;
  return Verdict.POOR;
}

/** 메인 진단 함수 — GCP 벤치마크 기반 (T6 재작성) */
export function diagnoseAd(
  adData: AdData,
  benchmarks: GCPBenchmarks,
  creativeType?: string,
): DiagnosisResult {
  const effectiveCreativeType =
    creativeType ?? (adData.creative_type as string | undefined) ?? 'VIDEO';

  // creative_type별 engAbove/convAbove 추출 — ALL fallback 포함
  const ctBench =
    benchmarks[effectiveCreativeType] ?? benchmarks['ALL'] ?? benchmarks['VIDEO'] ?? {};
  const engAbove: AboveAvgMap = ctBench.engagement?.above_avg ?? {};
  const convAbove: AboveAvgMap = ctBench.conversion?.above_avg ?? {};

  const partsResults: PartResult[] = [];
  const partVerdicts: Record<number, Verdict> = {};

  for (const [partNumStr, partConfig] of Object.entries(PART_METRICS)) {
    const partNum = Number(partNumStr);
    const metricResults: MetricResult[] = [];

    for (const metricDef of partConfig.metrics) {
      const { key, label, reverse: isReverse, benchmarkSourceOverride } = metricDef;

      // benchmarkSourceOverride 우선, 없으면 partConfig.benchmarkSource
      const benchmarkSource = benchmarkSourceOverride ?? partConfig.benchmarkSource;
      const aboveAvgMap = benchmarkSource === 'conversion' ? convAbove : engAbove;
      const aboveAvg = (aboveAvgMap[key] as number | null | undefined) ?? null;

      const myValue: number | null = (adData[key] as number | null | undefined) ?? null;
      const verdict = judgeMetric(myValue, aboveAvg, isReverse);

      metricResults.push({
        metricName: label,
        myValue,
        aboveAvg,
        verdict,
        isReverse,
      });
    }

    const partVerdict = judgePart(metricResults);
    partVerdicts[partNum] = partVerdict;

    partsResults.push({
      partNum,
      partName: partConfig.name,
      metrics: metricResults,
      verdict: partVerdict,
    });
  }

  // 전체 판정
  const allVerdicts = Object.values(partVerdicts);
  let overallVerdict: Verdict;
  if (allVerdicts.includes(Verdict.POOR)) {
    overallVerdict = Verdict.POOR;
  } else if (
    allVerdicts.filter((v) => v !== Verdict.UNKNOWN).every((v) => v === Verdict.GOOD)
  ) {
    overallVerdict = Verdict.GOOD;
  } else {
    overallVerdict = Verdict.NORMAL;
  }

  const oneLineDiagnosis = generateOneLineDiagnosis(partVerdicts, effectiveCreativeType);

  return {
    adId: (adData.ad_id as string) ?? '',
    adName: (adData.ad_name as string) ?? '',
    parts: partsResults,
    overallVerdict,
    oneLineDiagnosis,
  };
}

/** 진단 결과를 포맷팅 */
export function formatDiagnosisReport(result: DiagnosisResult): string {
  const lines: string[] = [
    '📊 광고 진단 결과',
    `광고명: ${result.adName}`,
    `종합 판정: ${result.overallVerdict}`,
    '',
    `💡 한줄 진단: ${result.oneLineDiagnosis}`,
    '',
    '━'.repeat(40),
  ];

  for (const part of result.parts) {
    lines.push(`\n📌 파트 ${part.partNum}: ${part.partName} ${part.verdict}`);
    for (const m of part.metrics) {
      if (m.verdict !== Verdict.UNKNOWN) {
        const comparison =
          m.aboveAvg != null ? `(기준선: ${m.aboveAvg.toFixed(1)})` : '';
        const valueStr = m.myValue != null ? m.myValue.toFixed(2) : 'N/A';
        lines.push(`   ${m.verdict} ${m.metricName}: ${valueStr} ${comparison}`);
      }
    }
  }

  return lines.join('\n');
}
