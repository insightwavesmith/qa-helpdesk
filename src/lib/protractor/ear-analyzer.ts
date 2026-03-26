/**
 * GEM/EAR 영향 분석 모듈
 * 설계서 STEP 8: 기반(3초시청률) → 참여(CTR) → 전환(ROAS) 흐름 분석
 */

import { ATTRIBUTE_AXIS_MAP } from './metric-groups';
import type { BenchmarkComparison, EarAnalysis } from '@/types/prescription';

// 성과 그룹 지표 매핑
const GROUP_METRICS: Record<string, string[]> = {
  foundation: ['video_p3s_rate', 'thruplay_rate', 'retention_rate'],
  engagement: ['reactions_per_10k', 'comments_per_10k', 'shares_per_10k', 'saves_per_10k', 'engagement_per_10k'],
  conversion: ['ctr', 'click_to_checkout_rate', 'click_to_purchase_rate', 'reach_to_purchase_rate', 'roas'],
};

/**
 * 특정 성과 그룹의 평균 편차율 계산 (음수 = 벤치마크 미달)
 */
function avgDeviation(comparison: BenchmarkComparison, metrics: string[]): number {
  const values = metrics
    .map(m => comparison[m]?.deviation ?? 0)
    .filter(v => !isNaN(v));

  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * 병목 설명 텍스트 생성
 */
function generateBottleneckDetail(
  bottleneck: string,
  deviation: number
): string {
  const deviationText = `벤치마크 대비 ${Math.abs(Math.round(deviation))}% ${deviation < 0 ? '미달' : '초과'}`;

  switch (bottleneck) {
    case 'foundation':
      return `기반점수(3초시청률/ThruPlay율)가 ${deviationText}. ` +
        '첫 인상 단계에서 시청자를 잃고 있어 훅/비주얼 개선이 최우선입니다.';
    case 'engagement':
      return `참여율(좋아요/댓글/공유)이 ${deviationText}. ` +
        '시청은 하지만 반응이 없어 감정/메시지 공감도 개선이 필요합니다.';
    case 'conversion':
      return `전환율(CTR/구매전환율)이 ${deviationText}. ` +
        '관심은 있지만 행동으로 이어지지 않아 CTA/사회적증거/긴급성 강화가 필요합니다.';
    default:
      return `${bottleneck} 그룹이 ${deviationText}.`;
  }
}

/**
 * STEP 8: GEM/EAR 영향 인자 분석
 * 성과 그룹별 평균 편차 → primary_bottleneck 식별
 * ATTRIBUTE_AXIS_MAP으로 해당 그룹에 weight 높은 속성 추출
 */
export function analyzeEarImpact(
  benchmarkComparison: BenchmarkComparison
): EarAnalysis {
  // 성과 데이터가 없는 경우 fallback
  if (Object.keys(benchmarkComparison).length === 0) {
    return {
      primaryBottleneck: 'foundation',
      bottleneckDetail: '성과 데이터가 없어 기반점수(훅/비주얼)를 우선 개선 대상으로 설정합니다.',
      improvementPriority: '훅 유형 및 비주얼 스타일 개선이 EAR에 가장 큰 양의 영향',
    };
  }

  // 성과 그룹별 평균 편차 계산
  const groupDeviations: Record<string, number> = {
    foundation: avgDeviation(benchmarkComparison, GROUP_METRICS.foundation),
    engagement: avgDeviation(benchmarkComparison, GROUP_METRICS.engagement),
    conversion: avgDeviation(benchmarkComparison, GROUP_METRICS.conversion),
  };

  // 가장 큰 음의 편차 그룹 = primary bottleneck
  const sorted = Object.entries(groupDeviations).sort((a, b) => a[1] - b[1]);
  const [primaryBottleneck, deviation] = sorted[0] as [string, number];

  // ATTRIBUTE_AXIS_MAP에서 해당 그룹에 weight 높은 속성 추출
  const impactAttributes = ATTRIBUTE_AXIS_MAP
    .filter(a => a.affectsGroups.includes(primaryBottleneck as 'foundation' | 'engagement' | 'conversion'))
    .sort((a, b) => b.weight - a.weight);

  const topAttr = impactAttributes[0];

  return {
    primaryBottleneck: primaryBottleneck as 'foundation' | 'engagement' | 'conversion',
    bottleneckDetail: generateBottleneckDetail(primaryBottleneck, deviation),
    improvementPriority: topAttr
      ? `${topAttr.label} 개선이 EAR에 가장 큰 양의 영향 (가중치: ${topAttr.weight})`
      : `${primaryBottleneck} 그룹 개선 필요`,
  };
}
