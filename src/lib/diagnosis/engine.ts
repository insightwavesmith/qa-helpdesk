import { Verdict } from './types';
import type { MetricResult, PartResult, DiagnosisResult } from './types';
import { PART_METRICS } from './metrics';
import { generateOneLineDiagnosis } from './one-line';

type AdData = Record<string, unknown>;
type Benchmarks = Record<string, Record<string, number | null>>;
type LpData = Record<string, unknown> | null;

/** 개별 지표 판정 (V3: 3그룹 비교) */
export function judgeMetric(
  myValue: number | null,
  aboveAvg: number | null,
  averageAvg: number | null,
  _belowAvg?: number | null,
  isReverse = false,
): Verdict {
  if (myValue == null || aboveAvg == null || averageAvg == null) {
    return Verdict.UNKNOWN;
  }

  if (isReverse) {
    // 역방향: 낮을수록 좋음 (예: LCP, 이탈률)
    if (myValue <= aboveAvg) return Verdict.GOOD;
    if (myValue <= averageAvg) return Verdict.NORMAL;
    return Verdict.POOR;
  } else {
    // 정방향: 높을수록 좋음
    if (myValue >= aboveAvg) return Verdict.GOOD;
    if (myValue >= averageAvg) return Verdict.NORMAL;
    return Verdict.POOR;
  }
}

/** V3 자체 판정: 3그룹 거리 비교로 가장 가까운 그룹 분류 */
export function classifyByDistance(
  myValue: number | null,
  aboveAvg: number | null,
  averageAvg: number | null,
  belowAvg: number | null,
): string {
  if (myValue == null || aboveAvg == null || averageAvg == null || belowAvg == null) {
    return 'UNKNOWN';
  }

  const distAbove = Math.abs(myValue - aboveAvg);
  const distAverage = Math.abs(myValue - averageAvg);
  const distBelow = Math.abs(myValue - belowAvg);

  const minDist = Math.min(distAbove, distAverage, distBelow);

  if (minDist === distAbove) return 'ABOVE_AVERAGE';
  if (minDist === distAverage) return 'AVERAGE';
  return 'BELOW_AVERAGE';
}

/** V3 자체 판정: Meta 랭킹 UNKNOWN 시 대표 지표들로 그룹 분류 */
export function selfJudgeRanking(
  adData: AdData,
  benchmarks: Benchmarks,
  rankingType: string,
): string {
  const aboveKey = `${rankingType}_above`;
  const averageKey = `${rankingType}_average`;
  const belowKey = `${rankingType}_below`;

  const representativeMetrics: Record<string, string[]> = {
    quality: ['ctr', 'click_to_purchase_rate'],
    engagement: ['engagement_per_10k', 'reactions_per_10k'],
    conversion: ['click_to_purchase_rate', 'ctr'],
  };

  const metrics = representativeMetrics[rankingType] ?? ['ctr'];
  const classifications: string[] = [];

  for (const metricKey of metrics) {
    const myValue = adData[metricKey] as number | null | undefined;
    const aboveAvg = (benchmarks[aboveKey] ?? {})[`avg_${metricKey}`] ?? null;
    const averageAvg = (benchmarks[averageKey] ?? {})[`avg_${metricKey}`] ?? null;
    const belowAvg = (benchmarks[belowKey] ?? {})[`avg_${metricKey}`] ?? null;

    if (myValue != null && aboveAvg != null) {
      const classification = classifyByDistance(myValue, aboveAvg, averageAvg, belowAvg);
      classifications.push(classification);
    }
  }

  if (classifications.length === 0) return 'UNKNOWN';

  // 다수결로 최종 분류
  const counter: Record<string, number> = {};
  for (const c of classifications) {
    counter[c] = (counter[c] ?? 0) + 1;
  }
  let maxCount = 0;
  let maxKey = 'UNKNOWN';
  for (const [k, v] of Object.entries(counter)) {
    if (v > maxCount) {
      maxCount = v;
      maxKey = k;
    }
  }
  return maxKey;
}

/** 파트별 종합 판정 */
export function judgePart(metricResults: MetricResult[]): Verdict {
  if (metricResults.length === 0) return Verdict.UNKNOWN;

  const verdicts = metricResults
    .filter((m) => m.verdict !== Verdict.UNKNOWN)
    .map((m) => m.verdict);

  if (verdicts.length === 0) return Verdict.UNKNOWN;

  // 🔴 하나라도 있으면 → 파트 🔴
  if (verdicts.includes(Verdict.POOR)) return Verdict.POOR;

  // 전부 🟢이면 → 파트 🟢
  if (verdicts.every((v) => v === Verdict.GOOD)) return Verdict.GOOD;

  // 그 외 → 파트 🟡
  return Verdict.NORMAL;
}

/** 메인 진단 함수 (V3.4) */
export function diagnoseAd(
  adData: AdData,
  benchmarks: Benchmarks,
  lpData: LpData = null,
  creativeType?: string,
): DiagnosisResult {
  // V3.4: creativeType이 없으면 adData에서 추출
  const effectiveCreativeType =
    creativeType ?? (adData.creative_type as string | undefined) ?? 'VIDEO';

  // V3: Meta 랭킹이 UNKNOWN이면 자체 판정
  for (const rankingType of ['quality', 'engagement', 'conversion']) {
    const rankingKey = `${rankingType}_ranking`;
    const metaRanking = adData[rankingKey] as string | null | undefined;

    if (metaRanking === 'UNKNOWN' || metaRanking == null) {
      selfJudgeRanking(adData, benchmarks, rankingType);
    }
  }

  const partsResults: PartResult[] = [];
  const partVerdicts: Record<number, Verdict> = {};

  for (const [partNumStr, partConfig] of Object.entries(PART_METRICS)) {
    const partNum = Number(partNumStr);

    // V3.4: SHARE 타입은 파트0(기반점수) 스킵
    if (partNum === 0 && effectiveCreativeType === 'SHARE') {
      partVerdicts[0] = Verdict.UNKNOWN;
      partsResults.push({
        partNum: 0,
        partName: '기반점수',
        metrics: [],
        verdict: Verdict.UNKNOWN,
      });
      continue;
    }

    const metricResults: MetricResult[] = [];
    const benchmarkSource = partConfig.benchmarkSource;
    const aboveKey = `${benchmarkSource}_above`;
    const averageKey = `${benchmarkSource}_average`;
    const belowKey = `${benchmarkSource}_below`;

    for (const metricDef of partConfig.metrics) {
      const { key, label, reverse: isReverse, source } = metricDef;
      const effectiveSource = source ?? 'ad';

      // 값 추출
      let myValue: number | null;
      if (partNum === 1 || effectiveSource === 'lp') {
        myValue = lpData ? (lpData[key] as number | null | undefined) ?? null : null;
      } else {
        myValue = (adData[key] as number | null | undefined) ?? null;
      }

      // 벤치마크 값 (V3: avg_ prefix 추가)
      let aboveAvg = (benchmarks[aboveKey] ?? {})[`avg_${key}`] ?? null;
      let averageAvg = (benchmarks[averageKey] ?? {})[`avg_${key}`] ?? null;
      let belowAvg = (benchmarks[belowKey] ?? {})[`avg_${key}`] ?? null;

      // prefix 없는 버전도 시도 (호환성)
      if (aboveAvg == null) {
        aboveAvg = (benchmarks[aboveKey] ?? {})[key] ?? null;
      }
      if (averageAvg == null) {
        averageAvg = (benchmarks[averageKey] ?? {})[key] ?? null;
      }
      if (belowAvg == null) {
        belowAvg = (benchmarks[belowKey] ?? {})[key] ?? null;
      }

      const verdict = judgeMetric(myValue, aboveAvg, averageAvg, belowAvg, isReverse);

      metricResults.push({
        metricName: label,
        myValue,
        aboveAvg,
        averageAvg,
        belowAvg,
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

  // 한줄 진단 (V3.4: creativeType 전달)
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
          m.aboveAvg != null ? `(Above: ${m.aboveAvg.toFixed(1)})` : '';
        const valueStr = m.myValue != null ? m.myValue.toFixed(2) : 'N/A';
        lines.push(`   ${m.verdict} ${m.metricName}: ${valueStr} ${comparison}`);
      }
    }
  }

  return lines.join('\n');
}
