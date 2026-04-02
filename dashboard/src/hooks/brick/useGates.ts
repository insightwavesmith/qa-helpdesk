import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface GateResult {
  id: string;
  name: string;
  passed: boolean;
  details?: string;
}

// ── 게이트 결과 조회 ──
export function useGateResult(gateId: string) {
  return useQuery<GateResult>({
    queryKey: ['brick', 'gates', gateId],
    queryFn: async () => {
      const res = await fetch(`/api/brick/gates/${gateId}/result`);
      if (!res.ok) throw new Error('게이트 결과 조회 실패');
      return res.json();
    },
    enabled: !!gateId,
  });
}

// ── 게이트 오버라이드 ──
export function useOverrideGate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ gateId, override }: { gateId: string; override: boolean }) => {
      const res = await fetch(`/api/brick/gates/${gateId}/override`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ override }),
      });
      if (!res.ok) throw new Error('게이트 오버라이드 실패');
      return res.json();
    },
    onSuccess: (_, { gateId }) => {
      qc.invalidateQueries({ queryKey: ['brick', 'gates', gateId] });
    },
  });
}
