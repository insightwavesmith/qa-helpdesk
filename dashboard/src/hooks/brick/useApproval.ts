import { useMutation, useQueryClient } from '@tanstack/react-query';

export function useApproval(workflowId: string, blockId: string) {
  const queryClient = useQueryClient();

  const approve = useMutation({
    mutationFn: async () => {
      const res = await fetch(
        `/api/brick/workflows/${workflowId}/blocks/${blockId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
      );
      if (!res.ok) throw new Error('승인 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
    },
  });

  const reject = useMutation({
    mutationFn: async (reason: string) => {
      const res = await fetch(
        `/api/brick/workflows/${workflowId}/blocks/${blockId}/reject`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }),
        },
      );
      if (!res.ok) throw new Error('반려 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['brick', 'executions'] });
    },
  });

  return { approve, reject };
}
