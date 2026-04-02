import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface LearningProposal {
  id: string;
  title: string;
  confidence: number;
  before: string;
  after: string;
  reasoning: string;
  status: 'pending' | 'approved' | 'rejected';
}

// ── 제안 목록 조회 ──
export function useLearningProposals() {
  return useQuery<LearningProposal[]>({
    queryKey: ['brick', 'learning', 'proposals'],
    queryFn: async () => {
      const res = await fetch('/api/brick/learning/proposals');
      if (!res.ok) throw new Error('제안 목록 조회 실패');
      return res.json();
    },
  });
}

// ── 제안 승인 ──
export function useApproveProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, comment }: { id: string; comment?: string }) => {
      const res = await fetch(`/api/brick/learning/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ comment }),
      });
      if (!res.ok) throw new Error('승인 실패');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brick', 'learning'] });
    },
  });
}

// ── 제안 거부 ──
export function useRejectProposal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const res = await fetch(`/api/brick/learning/${id}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('거부 실패');
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brick', 'learning'] });
    },
  });
}
