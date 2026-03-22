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

/**
 * 소재 속성 → 성과 3축 매핑 정의
 * analysis_json의 5축 속성이 성과 3축(기반/참여/전환) 중 어디에 영향을 주는지 정의.
 * 가중치(weight)는 데이터 축적 후 회귀분석으로 확정 예정 (Phase 2).
 * 현재는 도메인 지식 기반 초기값.
 */
export interface AttributeAxisMapping {
  /** analysis_json 내 속성 경로 (dot notation) */
  attribute: string;
  /** 속성 한글명 */
  label: string;
  /** 5축 분류 */
  axis: "visual" | "text" | "psychology" | "quality" | "hook";
  /** 영향을 주는 성과 축 */
  affectsGroups: ("foundation" | "engagement" | "conversion")[];
  /** 초기 가중치 (0~1, Phase 2에서 데이터 기반 보정) */
  weight: number;
}

export const ATTRIBUTE_AXIS_MAP: AttributeAxisMapping[] = [
  // ── Hook 축 → 기반점수 (첫 인상, 3초 시청률에 직결) ──
  { attribute: "hook.hook_type", label: "훅 유형", axis: "hook", affectsGroups: ["foundation"], weight: 0.8 },
  { attribute: "hook.visual_style", label: "비주얼 스타일", axis: "hook", affectsGroups: ["foundation", "engagement"], weight: 0.6 },
  { attribute: "hook.composition", label: "구도", axis: "hook", affectsGroups: ["foundation"], weight: 0.5 },

  // ── Visual 축 → 기반점수 + 참여율 ──
  { attribute: "visual.color_scheme", label: "색상 구성", axis: "visual", affectsGroups: ["foundation"], weight: 0.4 },
  { attribute: "visual.product_visibility", label: "제품 노출", axis: "visual", affectsGroups: ["foundation", "conversion"], weight: 0.6 },

  // ── Text 축 → 참여율 + 전환율 ──
  { attribute: "text.headline", label: "헤드라인", axis: "text", affectsGroups: ["engagement"], weight: 0.5 },
  { attribute: "text.cta_text", label: "CTA 문구", axis: "text", affectsGroups: ["conversion"], weight: 0.9 },
  { attribute: "text.readability", label: "가독성", axis: "text", affectsGroups: ["foundation", "engagement"], weight: 0.5 },

  // ── Psychology 축 → 참여율 + 전환율 ──
  { attribute: "psychology.emotion", label: "감정 유발", axis: "psychology", affectsGroups: ["engagement"], weight: 0.7 },
  { attribute: "psychology.social_proof", label: "사회적 증거", axis: "psychology", affectsGroups: ["conversion"], weight: 0.6 },
  { attribute: "psychology.urgency", label: "긴급성", axis: "psychology", affectsGroups: ["conversion"], weight: 0.7 },
  { attribute: "psychology.authority", label: "권위", axis: "psychology", affectsGroups: ["engagement", "conversion"], weight: 0.4 },

  // ── Quality 축 → 기반점수 (전체 품질) ──
  { attribute: "quality.production_quality", label: "제작 품질", axis: "quality", affectsGroups: ["foundation"], weight: 0.6 },
  { attribute: "quality.brand_consistency", label: "브랜드 일관성", axis: "quality", affectsGroups: ["foundation", "conversion"], weight: 0.4 },
];

/**
 * 특정 성과 그룹에 영향을 주는 소재 속성 목록 조회
 */
export function getAttributesForGroup(
  groupKey: "foundation" | "engagement" | "conversion",
): AttributeAxisMapping[] {
  return ATTRIBUTE_AXIS_MAP.filter((m) => m.affectsGroups.includes(groupKey));
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
      { key: "roas", label: "ROAS", ascending: true, unit: "decimal", benchKey: "", benchGroup: "conversion" },
    ],
  },
];
