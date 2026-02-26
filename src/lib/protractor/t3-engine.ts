/**
 * T3 점수 엔진 — 순수 계산 로직
 * total-value/route.ts에서 추출. HTTP/인증 무관.
 */

// ─── 타입 ───────────────────────────────────────────────

export interface T3MetricDef {
  name: string;
  key: string;
  ascending: boolean; // true = 높을수록 좋음
  unit: string;
}

export interface BenchEntry {
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
}

export interface MetricResult {
  name: string;
  key: string;
  value: number | null;
  score: number | null;
  p25: number | null;
  p50: number | null;
  p75: number | null;
  p90: number | null;
  status: string;
  unit: string;
}

export interface T3PartResult {
  label: string;
  score: number;
  metrics: MetricResult[];
}

export interface T3Result {
  score: number;
  grade: { grade: string; label: string };
  diagnostics: Record<string, T3PartResult>;
  metrics: MetricResult[];
}

// ─── 상수 ───────────────────────────────────────────────

export const T3_PARTS: Record<string, { label: string; metrics: T3MetricDef[] }> = {
  foundation: {
    label: "기반점수",
    metrics: [
      { name: "3초시청률", key: "video_p3s_rate", ascending: true, unit: "%" },
      { name: "ThruPlay율", key: "thruplay_rate", ascending: true, unit: "%" },
      { name: "지속비율", key: "retention_rate", ascending: true, unit: "%" },
    ],
  },
  engagement: {
    label: "참여율",
    metrics: [
      { name: "참여합계/만노출", key: "engagement_per_10k", ascending: true, unit: "" },
    ],
  },
  conversion: {
    label: "전환율",
    metrics: [
      { name: "CTR", key: "ctr", ascending: true, unit: "%" },
      { name: "결제시작율", key: "click_to_checkout_rate", ascending: true, unit: "%" },
      { name: "구매전환율", key: "click_to_purchase_rate", ascending: true, unit: "%" },
      { name: "노출대비구매", key: "reach_to_purchase_rate", ascending: true, unit: "%" },
      { name: "결제→구매율", key: "checkout_to_purchase_rate", ascending: true, unit: "%" },
    ],
  },
};

export const ALL_METRIC_DEFS = Object.values(T3_PARTS).flatMap((p) => p.metrics);

// ─── 점수 계산 ──────────────────────────────────────────

export function calculateMetricScore(
  value: number,
  bench: BenchEntry,
  ascending: boolean,
): number {
  const { p25, p50, p75, p90 } = bench;
  if (p25 == null || p50 == null || p75 == null || p90 == null) return 50;

  if (ascending) {
    if (value >= p90) return 100;
    if (value >= p75 && p90 > p75) return 75 + ((value - p75) / (p90 - p75)) * 25;
    if (value >= p50 && p75 > p50) return 50 + ((value - p50) / (p75 - p50)) * 25;
    if (value >= p25 && p50 > p25) return 25 + ((value - p25) / (p50 - p25)) * 25;
    if (p25 > 0) return Math.max(0, (value / p25) * 25);
    return 0;
  } else {
    if (value <= p25) return 100;
    if (value <= p50 && p50 > p25) return 75 + ((p50 - value) / (p50 - p25)) * 25;
    if (value <= p75 && p75 > p50) return 50 + ((p75 - value) / (p75 - p50)) * 25;
    if (value <= p90 && p90 > p75) return 25 + ((p90 - value) / (p90 - p75)) * 25;
    if (p90 > 0) return Math.max(0, 25 - ((value - p90) / p90) * 25);
    return 0;
  }
}

export function scoreToStatus(score: number): string {
  if (score >= 75) return "🟢";
  if (score >= 50) return "🟡";
  return "🔴";
}

export function scoreToGrade(score: number): { grade: string; label: string } {
  if (score >= 80) return { grade: "A", label: "우수" };
  if (score >= 60) return { grade: "B", label: "양호" };
  if (score >= 40) return { grade: "C", label: "보통" };
  if (score >= 20) return { grade: "D", label: "주의 필요" };
  return { grade: "F", label: "위험" };
}

export function periodToDateRange(period: number): { start: string; end: string } {
  const end = new Date();
  end.setDate(end.getDate() - 1); // 어제까지
  const endStr = end.toISOString().split("T")[0];
  const start = new Date(end);
  start.setDate(start.getDate() - (period - 1));
  const startStr = start.toISOString().split("T")[0];
  return { start: startStr, end: endStr };
}

// ─── 지표값 계산 (row 배열 → 9개 지표) ─────────────────

export function computeMetricValues(rows: Record<string, unknown>[]): Record<string, number | null> {
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalPurchases = 0;
  let totalVideoP3s = 0;
  let totalThruplay = 0;
  let totalReactions = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalSaves = 0;
  let totalInitiateCheckout = 0;
  let totalReach = 0;

  for (const row of rows) {
    const imp = Number(row.impressions) || 0;
    const clk = Number(row.clicks) || 0;
    const rowReach = Number(row.reach) || 0;

    totalImpressions += imp;
    totalClicks += clk;
    totalPurchases += Number(row.purchases) || 0;
    totalReach += rowReach;
    totalInitiateCheckout += Number(row.initiate_checkout) || 0;

    const p3sRate = Number(row.video_p3s_rate) || 0;
    totalVideoP3s += (p3sRate / 100) * rowReach;

    const thruplayRate = Number(row.thruplay_rate) || 0;
    totalThruplay += (thruplayRate / 100) * imp;

    const reactPer10k = Number(row.reactions_per_10k) || 0;
    const commentPer10k = Number(row.comments_per_10k) || 0;
    const sharePer10k = Number(row.shares_per_10k) || 0;
    const savesPer10k = Number(row.saves_per_10k) || 0;
    totalReactions += (reactPer10k / 10000) * imp;
    totalComments += (commentPer10k / 10000) * imp;
    totalShares += (sharePer10k / 10000) * imp;
    totalSaves += (savesPer10k / 10000) * imp;
  }

  return {
    video_p3s_rate: totalReach > 0 ? (totalVideoP3s / totalReach) * 100 : null,
    thruplay_rate: totalImpressions > 0 ? (totalThruplay / totalImpressions) * 100 : null,
    retention_rate: totalVideoP3s > 0 ? (totalThruplay / totalVideoP3s) * 100 : null,
    engagement_per_10k:
      totalImpressions > 0
        ? ((totalReactions + totalComments + totalShares + totalSaves) / totalImpressions) * 10000
        : null,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
    click_to_checkout_rate: totalClicks > 0 ? (totalInitiateCheckout / totalClicks) * 100 : null,
    click_to_purchase_rate: totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : null,
    reach_to_purchase_rate: totalImpressions > 0 ? (totalPurchases / totalImpressions) * 100 : null,
    checkout_to_purchase_rate: totalInitiateCheckout > 0 ? (totalPurchases / totalInitiateCheckout) * 100 : null,
  };
}

// ─── dominant creative_type 결정 ────────────────────────

export function getDominantCreativeType(rows: Record<string, unknown>[]): string {
  const ctCounts = new Map<string, number>();
  for (const row of rows) {
    const ct = ((row.creative_type as string) ?? "ALL").toUpperCase();
    ctCounts.set(ct, (ctCounts.get(ct) ?? 0) + 1);
  }
  let dominantCT = "ALL";
  let maxCount = 0;
  for (const [ct, count] of ctCounts) {
    if (ct !== "ALL" && count > maxCount) {
      dominantCT = ct;
      maxCount = count;
    }
  }
  return dominantCT;
}

// ─── T3 총점 계산 (지표값 + 벤치마크 → 점수) ───────────

export function calculateT3Score(
  metricValues: Record<string, number | null>,
  benchMap: Record<string, BenchEntry>,
): T3Result {
  const diagnostics: Record<string, T3PartResult> = {};
  const allMetrics: MetricResult[] = [];
  const partScores: number[] = [];

  for (const [partKey, partDef] of Object.entries(T3_PARTS)) {
    const partMetrics: MetricResult[] = [];
    const scores: number[] = [];

    for (const def of partDef.metrics) {
      const value = metricValues[def.key];
      const bench = benchMap[def.key];
      let metricScore: number | null = null;
      let status = "⚪";

      if (value != null && bench) {
        metricScore = Math.round(calculateMetricScore(value, bench, def.ascending) * 100) / 100;
        status = scoreToStatus(metricScore);
        scores.push(metricScore);
      }

      const result: MetricResult = {
        name: def.name,
        key: def.key,
        value: value != null ? Math.round(value * 100) / 100 : null,
        score: metricScore != null ? Math.round(metricScore) : null,
        p25: bench?.p25 != null ? Math.round(bench.p25 * 100) / 100 : null,
        p50: bench?.p50 != null ? Math.round(bench.p50 * 100) / 100 : null,
        p75: bench?.p75 != null ? Math.round(bench.p75 * 100) / 100 : null,
        p90: bench?.p90 != null ? Math.round(bench.p90 * 100) / 100 : null,
        status,
        unit: def.unit,
      };

      partMetrics.push(result);
      allMetrics.push(result);
    }

    const partScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;

    diagnostics[partKey] = {
      label: partDef.label,
      score: partScore,
      metrics: partMetrics,
    };

    partScores.push(partScore);
  }

  const t3Score = partScores.length > 0
    ? Math.round(partScores.reduce((a, b) => a + b, 0) / partScores.length)
    : 0;

  return {
    score: t3Score,
    grade: scoreToGrade(t3Score),
    diagnostics,
    metrics: allMetrics,
  };
}
