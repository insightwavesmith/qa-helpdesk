/**
 * 공통 지표 그룹 정의 (14개)
 * t3-engine, content-ranking, benchmark-compare 3곳에서 공유.
 *
 * 영상(3) + 참여(5) + 전환(6) = 14
 */

export type MetricUnit = "pct" | "per10k" | "decimal";

export interface CommonMetricDef {
  key: string;
  label: string;
  ascending: boolean;
  unit: MetricUnit;
  benchKey: string;
  benchGroup: "engagement" | "conversion";
}

export interface MetricGroupDef {
  groupKey: string;
  label: string;
  metrics: CommonMetricDef[];
  summaryMetric?: CommonMetricDef;
}

export const METRIC_GROUPS: MetricGroupDef[] = [
  {
    groupKey: "foundation",
    label: "기반점수",
    metrics: [
      { key: "video_p3s_rate", label: "3초시청률", ascending: true, unit: "pct", benchKey: "avg_video_p3s_rate", benchGroup: "engagement" },
      { key: "thruplay_rate", label: "ThruPlay율", ascending: true, unit: "pct", benchKey: "avg_thruplay_rate", benchGroup: "engagement" },
      { key: "retention_rate", label: "지속비율", ascending: true, unit: "pct", benchKey: "avg_retention_rate", benchGroup: "engagement" },
    ],
  },
  {
    groupKey: "engagement",
    label: "참여율",
    metrics: [
      { key: "reactions_per_10k", label: "좋아요/만노출", ascending: true, unit: "per10k", benchKey: "avg_reactions_per_10k", benchGroup: "engagement" },
      { key: "comments_per_10k", label: "댓글/만노출", ascending: true, unit: "per10k", benchKey: "avg_comments_per_10k", benchGroup: "engagement" },
      { key: "shares_per_10k", label: "공유/만노출", ascending: true, unit: "per10k", benchKey: "avg_shares_per_10k", benchGroup: "engagement" },
      { key: "saves_per_10k", label: "저장/만노출", ascending: true, unit: "per10k", benchKey: "avg_saves_per_10k", benchGroup: "engagement" },
    ],
    summaryMetric: {
      key: "engagement_per_10k", label: "참여합계/만노출", ascending: true, unit: "per10k", benchKey: "avg_engagement_per_10k", benchGroup: "engagement",
    },
  },
  {
    groupKey: "conversion",
    label: "전환율",
    metrics: [
      { key: "ctr", label: "CTR", ascending: true, unit: "pct", benchKey: "avg_ctr", benchGroup: "conversion" },
      { key: "click_to_checkout_rate", label: "결제시작율", ascending: true, unit: "pct", benchKey: "avg_click_to_checkout_rate", benchGroup: "conversion" },
      { key: "click_to_purchase_rate", label: "구매전환율", ascending: true, unit: "pct", benchKey: "avg_click_to_purchase_rate", benchGroup: "conversion" },
      { key: "checkout_to_purchase_rate", label: "결제→구매율", ascending: true, unit: "pct", benchKey: "avg_checkout_to_purchase_rate", benchGroup: "conversion" },
      { key: "reach_to_purchase_rate", label: "노출당구매확률", ascending: true, unit: "pct", benchKey: "avg_reach_to_purchase_rate", benchGroup: "conversion" },
      { key: "roas", label: "ROAS", ascending: true, unit: "decimal", benchKey: "avg_roas", benchGroup: "conversion" },
    ],
  },
];
