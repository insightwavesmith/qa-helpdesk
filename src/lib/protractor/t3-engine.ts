/**
 * T3 점수 엔진 — ratio 기반 점수 계산 (T8 재작성)
 * BenchEntry: 단일 ABOVE_AVERAGE 값
 * calculateMetricScore: ratio 기반 (GCP 방식)
 */

// ─── 타입 ───────────────────────────────────────────────

export interface T3MetricDef {
  name: string;
  key: string;
  ascending: boolean; // true = 높을수록 좋음
  unit: string;
}

/** ABOVE_AVERAGE 단일 값 (Phase 3: p25/p50/p75/p90 제거) */
export type BenchEntry = number | null;

export interface MetricResult {
  name: string;
  key: string;
  value: number | null;
  score: number | null;
  aboveAvg: number | null; // 기존 p25/p50/p75/p90 → 단일 ABOVE_AVERAGE 값
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
      { name: "좋아요/만노출", key: "reactions_per_10k", ascending: true, unit: "" },
      { name: "댓글/만노출", key: "comments_per_10k", ascending: true, unit: "" },
      { name: "공유/만노출", key: "shares_per_10k", ascending: true, unit: "" },
      { name: "저장/만노출", key: "saves_per_10k", ascending: true, unit: "" },
      { name: "참여합계/만노출", key: "engagement_per_10k", ascending: true, unit: "" },
    ],
  },
  conversion: {
    label: "전환율",
    metrics: [
      { name: "CTR", key: "ctr", ascending: true, unit: "%" },
      { name: "결제시작율", key: "click_to_checkout_rate", ascending: true, unit: "%" },
      { name: "구매전환율", key: "click_to_purchase_rate", ascending: true, unit: "%" },
      { name: "결제→구매율", key: "checkout_to_purchase_rate", ascending: true, unit: "%" },
      { name: "도달당구매율", key: "reach_to_purchase_rate", ascending: true, unit: "%" },
    ],
  },
};

export const ALL_METRIC_DEFS = Object.values(T3_PARTS).flatMap((p) => p.metrics);

// ─── 점수 계산 ──────────────────────────────────────────

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * ratio → 0~100 점수 매핑
 * ratio >= 1.33 → 100
 * ratio >= 1.0  → 75~100
 * ratio >= 0.75 → 50~75
 * ratio >= 0.5  → 25~50
 * ratio < 0.5   → 0~25
 */
function mapRatioToScore(ratio: number): number {
  if (ratio >= 1.33) return 100;
  if (ratio >= 1.0) return 75 + ((ratio - 1.0) / 0.33) * 25;
  if (ratio >= 0.75) return 50 + ((ratio - 0.75) / 0.25) * 25;
  if (ratio >= 0.5) return 25 + ((ratio - 0.5) / 0.25) * 25;
  return Math.max(0, (ratio / 0.5) * 25);
}

/**
 * ratio 기반 지표 점수 계산 (GCP 방식)
 * ascending=true: ratio = value / aboveAvg (높을수록 좋음)
 * ascending=false: ratio = aboveAvg / value (낮을수록 좋음)
 */
export function calculateMetricScore(
  value: number,
  aboveAvg: number, // 단일 ABOVE_AVERAGE 값
  ascending = true,
): number {
  if (!aboveAvg || aboveAvg === 0) return 50;
  const ratio = ascending ? value / aboveAvg : aboveAvg / value;
  return clamp(mapRatioToScore(ratio), 0, 100);
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

// ─── 지표값 계산 (row 배열 → 지표 값 맵) ────────────────

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
    totalVideoP3s += (p3sRate / 100) * imp;

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
    video_p3s_rate: totalImpressions > 0 ? (totalVideoP3s / totalImpressions) * 100 : null,
    thruplay_rate: totalImpressions > 0 ? (totalThruplay / totalImpressions) * 100 : null,
    retention_rate: totalVideoP3s > 0 ? (totalThruplay / totalVideoP3s) * 100 : null,
    reactions_per_10k: totalImpressions > 0 ? (totalReactions / totalImpressions) * 10000 : null,
    comments_per_10k: totalImpressions > 0 ? (totalComments / totalImpressions) * 10000 : null,
    shares_per_10k: totalImpressions > 0 ? (totalShares / totalImpressions) * 10000 : null,
    saves_per_10k: totalImpressions > 0 ? (totalSaves / totalImpressions) * 10000 : null,
    engagement_per_10k:
      totalImpressions > 0
        ? ((totalReactions + totalComments + totalShares + totalSaves) / totalImpressions) * 10000
        : null,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : null,
    click_to_checkout_rate: totalClicks > 0 ? (totalInitiateCheckout / totalClicks) * 100 : null,
    click_to_purchase_rate: totalClicks > 0 ? (totalPurchases / totalClicks) * 100 : null,
    checkout_to_purchase_rate: totalInitiateCheckout > 0 ? (totalPurchases / totalInitiateCheckout) * 100 : null,
    reach_to_purchase_rate: totalReach > 0 ? (totalPurchases / totalReach) * 100 : null,
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
      const aboveAvg = benchMap[def.key] ?? null;
      let metricScore: number | null = null;
      let status = "⚪";

      if (value != null && aboveAvg != null) {
        metricScore = Math.round(calculateMetricScore(value, aboveAvg, def.ascending) * 100) / 100;
        status = scoreToStatus(metricScore);
        scores.push(metricScore);
      }

      const result: MetricResult = {
        name: def.name,
        key: def.key,
        value: value != null ? Math.round(value * 100) / 100 : null,
        score: metricScore != null ? Math.round(metricScore) : null,
        aboveAvg: aboveAvg != null ? Math.round(aboveAvg * 100) / 100 : null,
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
