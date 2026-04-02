import { useQuery } from '@tanstack/react-query';

export interface Invariant {
  id: string;
  name: string;
  description: string;
  status: 'ok' | 'violated';
}

// ── 시스템 불변식 조회 ──
export function useInvariants() {
  return useQuery<Invariant[]>({
    queryKey: ['brick', 'system', 'invariants'],
    queryFn: async () => {
      const res = await fetch('/api/brick/system/invariants');
      if (!res.ok) throw new Error('불변식 조회 실패');
      return res.json();
    },
  });
}
