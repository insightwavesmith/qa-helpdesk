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
    name: 'LP품질',
    benchmarkSource: 'quality',
    metrics: [
      { key: 'lcp', label: 'LCP', reverse: true },
      { key: 'fcp', label: 'FCP', reverse: true },
      { key: 'bounce_1s_rate', label: '1초 이탈률', reverse: true },
      { key: 'bounce_10s_rate', label: '10초 이탈률', reverse: true },
      { key: 'avg_time_on_page', label: '평균 체류시간', reverse: false },
      { key: 'scroll_25_rate', label: '스크롤 25%', reverse: false },
      { key: 'scroll_50_rate', label: '스크롤 50%', reverse: false },
      { key: 'scroll_75_rate', label: '스크롤 75%', reverse: false },
      { key: 'review_click_rate', label: '리뷰 클릭', reverse: false },
      { key: 'total_button_clicks', label: '전체 버튼 클릭', reverse: false },
    ],
  },
  2: {
    name: '참여율',
    benchmarkSource: 'engagement',
    metrics: [
      { key: 'reactions_per_10k', label: '좋아요/만노출', reverse: false },
      { key: 'comments_per_10k', label: '댓글/만노출', reverse: false },
      { key: 'shares_per_10k', label: '공유/만노출', reverse: false },
      { key: 'engagement_per_10k', label: '참여합계/만노출', reverse: false },
    ],
  },
  3: {
    name: '전환율',
    benchmarkSource: 'conversion',
    metrics: [
      { key: 'ctr', label: 'CTR', reverse: false },
      { key: 'click_to_cart_rate', label: '클릭→장바구니', reverse: false },
      { key: 'click_to_checkout_rate', label: '클릭→결제시작', reverse: false },
      { key: 'click_to_purchase_rate', label: '클릭→구매', reverse: false },
      { key: 'cart_to_purchase_rate', label: '장바구니→구매', reverse: false },
      { key: 'checkout_to_purchase_rate', label: '결제시작→구매', reverse: false },
      { key: 'lp_session_to_cart', label: 'LP 세션→장바구니', reverse: false, source: 'lp' },
      { key: 'lp_session_to_checkout', label: 'LP 세션→결제시작', reverse: false, source: 'lp' },
      { key: 'lp_session_to_purchase', label: 'LP 세션→구매', reverse: false, source: 'lp' },
      { key: 'lp_checkout_to_purchase', label: 'LP 결제시작→구매', reverse: false, source: 'lp' },
    ],
  },
};
