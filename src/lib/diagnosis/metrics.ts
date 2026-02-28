import type { PartConfig } from './types';

export const PART_METRICS: Record<number, PartConfig> = {
  0: {
    name: '기반점수',
    benchmarkSource: 'engagement',
    metrics: [
      { key: 'video_p3s_rate', label: '3초 시청률', reverse: false },
      { key: 'thruplay_rate', label: 'ThruPlay율', reverse: false },
      { key: 'retention_rate', label: '지속비율', reverse: false },
    ],
  },
  1: {
    name: '참여율',
    benchmarkSource: 'engagement',
    metrics: [
      { key: 'reactions_per_10k', label: '좋아요/만노출', reverse: false },
      { key: 'comments_per_10k', label: '댓글/만노출', reverse: false },
      { key: 'shares_per_10k', label: '공유/만노출', reverse: false },
      { key: 'saves_per_10k', label: '저장/만노출', reverse: false },
      { key: 'engagement_per_10k', label: '참여합계/만노출', reverse: false },
    ],
  },
  2: {
    name: '전환율',
    benchmarkSource: 'conversion',
    metrics: [
      { key: 'ctr', label: 'CTR', reverse: false },
      { key: 'click_to_checkout_rate', label: '결제시작율', reverse: false },
      { key: 'click_to_purchase_rate', label: '구매전환율', reverse: false },
      { key: 'checkout_to_purchase_rate', label: '결제→구매율', reverse: false },
      // reach_to_purchase_rate: 이름과 달리 분모는 impressions (= purchases / impressions × 100)
      { key: 'reach_to_purchase_rate', label: '노출당구매확률', reverse: false },
      { key: 'roas', label: 'ROAS', reverse: false },
    ],
  },
};
