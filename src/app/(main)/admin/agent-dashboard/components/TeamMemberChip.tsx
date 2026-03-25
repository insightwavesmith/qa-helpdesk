'use client';

import type { AgentMember, AgentModel } from '@/types/agent-dashboard';

interface TeamMemberChipProps {
  member: AgentMember;
}

const MODEL_COLORS: Record<AgentModel, string> = {
  opus: '#F75D5D',
  sonnet: '#6366F1',
  haiku: '#10B981',
};

const MODEL_LABELS: Record<AgentModel, string> = {
  opus: 'opus',
  sonnet: 'sonnet',
  haiku: 'haiku',
};

export function TeamMemberChip({ member }: TeamMemberChipProps) {
  const color = MODEL_COLORS[member.model];
  const label = MODEL_LABELS[member.model];

  return (
    <div
      className="flex items-center gap-1.5 rounded-full px-3 py-1 text-white text-sm font-medium w-fit"
      style={{
        backgroundColor: color,
        fontFamily: 'Pretendard, system-ui, sans-serif',
      }}
    >
      <span>{member.name}</span>
      <span className="opacity-75 text-xs">({label})</span>
    </div>
  );
}
