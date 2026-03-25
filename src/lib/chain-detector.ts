import type { TeamId, ChainRule } from '@/types/agent-dashboard';

/** 체인 전달 규칙 */
export const CHAIN_RULES: ChainRule[] = [
  { fromTeam: 'pm', fromEvent: 'plan.completed', toTeam: 'cto', toAction: '구현 착수 필요' },
  { fromTeam: 'pm', fromEvent: 'plan.completed', toTeam: 'marketing', toAction: '검증 준비 필요' },
  { fromTeam: 'cto', fromEvent: 'implementation.completed', toTeam: 'marketing', toAction: '마케팅 검증 시작' },
  { fromTeam: 'marketing', fromEvent: 'review.completed', toTeam: 'pm', toAction: '결과 리뷰 필요' },
];

/** 팀 상태 변경 시 체인 전달 필요 여부 판단 */
export function detectChainHandoff(
  team: TeamId,
  event: string,
): ChainRule[] {
  return CHAIN_RULES.filter(r => r.fromTeam === team && r.fromEvent === event);
}
