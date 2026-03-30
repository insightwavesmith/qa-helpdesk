export const queryKeys = {
  dashboard: {
    summary: ['dashboard', 'summary'] as const,
  },
  tickets: (filters?: { status?: string; team?: string }) =>
    ['tickets', filters] as const,
  agents: ['agents'] as const,
  notifications: {
    list: (limit: number) => ['notifications', limit] as const,
    unreadCount: ['notifications', 'unread-count'] as const,
  },
  costs: {
    summary: ['costs', 'summary'] as const,
    byModel: ['costs', 'by-model'] as const,
    byAgent: ['costs', 'by-agent'] as const,
  },
  budgets: {
    policies: ['budgets', 'policies'] as const,
    incidents: (resolved?: boolean) => ['budgets', 'incidents', resolved] as const,
  },
  chains: ['chains'] as const,
  chainSteps: (chainId: string) => ['chains', chainId, 'steps'] as const,
  routines: ['routines'] as const,
};
