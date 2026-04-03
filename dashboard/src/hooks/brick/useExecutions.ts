import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = '/api/brick';

interface Execution {
  id: number;
  presetId: number;
  feature: string;
  status: string;
  blocksState: string;
  startedAt: string;
  engineWorkflowId?: string;
}

interface ExecutionsResponse {
  data: Execution[];
  total: number;
  limit: number;
  offset: number;
}

// ── 실행 목록 조회 ──
export function useExecutions(options?: { status?: string; limit?: number }) {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));
  const qs = params.toString();

  return useQuery<ExecutionsResponse>({
    queryKey: ['brick', 'executions', options],
    queryFn: async () => {
      const res = await fetch(`${BASE}/executions${qs ? `?${qs}` : ''}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
  });
}

// ── 실행 시작 ──
export function useStartExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (presetId: string) => {
      const res = await fetch('/api/brick/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presetId }),
      });
      if (!res.ok) throw new Error('실행 시작 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
    },
  });
}

// ── 일시정지 ──
export function usePauseExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (executionId: string) => {
      const res = await fetch(`/api/brick/executions/${executionId}/pause`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('일시정지 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
    },
  });
}

// ── 재개 ──
export function useResumeExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workflowId: string) => {
      const res = await fetch(`/api/brick/workflows/${workflowId}/resume`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('재개 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
    },
  });
}

// ── 중지 ──
export function useCancelExecution() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (workflowId: string) => {
      const res = await fetch(`/api/brick/workflows/${workflowId}/cancel`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('중지 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
    },
  });
}

// ── 실행 상태 조회 ──
export function useExecutionStatus(executionId: string | null) {
  return useQuery({
    queryKey: ['brick', 'executions', executionId],
    queryFn: async () => {
      const res = await fetch(`/api/brick/executions/${executionId}`);
      if (!res.ok) throw new Error('실행 상태 조회 실패');
      return res.json();
    },
    enabled: !!executionId,
    refetchInterval: 3000,
  });
}

// ── 실행 로그 조회 ──
export function useExecutionLogs(executionId: string | null) {
  return useQuery({
    queryKey: ['brick', 'executions', executionId, 'logs'],
    queryFn: async () => {
      const res = await fetch(`/api/brick/executions/${executionId}/logs`);
      if (!res.ok) throw new Error('실행 로그 조회 실패');
      return res.json();
    },
    enabled: !!executionId,
    refetchInterval: 5000,
  });
}
