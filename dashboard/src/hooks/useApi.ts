import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const BASE = '/api';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

// ─── 타입 ─────────────────────────────────────

export interface DashboardSummary {
  tickets: { status: string; count: number }[];
  agents: { status: string; count: number }[];
  totalCostCents: number;
  openBudgetIncidents: number;
  pdcaFeatures: { phase: string; count: number }[];
}

export interface Ticket {
  id: string;
  feature: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  assigneeAgent: string | null;
  assigneeTeam: string | null;
  pdcaPhase: string | null;
  processLevel: string | null;
  commitHash: string | null;
  pushVerified: number;
  changedFiles: number;
  checklist: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Agent {
  id: string;
  name: string;
  displayName: string | null;
  role: string;
  team: string | null;
  status: string;
  model: string | null;
  icon: string | null;
  reportsTo: string | null;
  spentMonthlyCents: number;
  lastHeartbeatAt: string | null;
  createdAt: string;
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  message: string;
  read: number;
  createdAt: string;
}

// ─── 훅 ─────────────────────────────────────

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ['dashboard', 'summary'],
    queryFn: () => fetchJson('/dashboard/summary'),
    refetchInterval: 10000,
  });
}

export function useTickets(filters?: { status?: string; team?: string }) {
  const params = new URLSearchParams();
  if (filters?.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters?.team) params.set('team', filters.team);
  const qs = params.toString();
  return useQuery<Ticket[]>({
    queryKey: ['tickets', filters],
    queryFn: () => fetchJson(`/tickets${qs ? `?${qs}` : ''}`),
    refetchInterval: 10000,
  });
}

export function useAgents() {
  return useQuery<Agent[]>({
    queryKey: ['agents'],
    queryFn: () => fetchJson('/agents'),
    refetchInterval: 10000,
  });
}

export function useNotifications(limit = 50) {
  return useQuery<Notification[]>({
    queryKey: ['notifications', limit],
    queryFn: () => fetchJson(`/notifications?limit=${limit}`),
    refetchInterval: 10000,
  });
}

export function useUnreadCount() {
  return useQuery<{ count: number }>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => fetchJson('/notifications/unread-count'),
    refetchInterval: 5000,
  });
}

// ─── 비용 ─────────────────────────────────────

export interface CostSummary {
  totalCents: number;
  totalTokens: number;
  eventCount: number;
}

export interface CostByModel {
  model: string;
  totalCents: number;
  totalTokens: number;
  eventCount: number;
}

export interface CostByAgent {
  agentId: string;
  agentName: string | null;
  displayName: string | null;
  totalCents: number;
  totalTokens: number;
  eventCount: number;
}

export interface BudgetPolicy {
  id: string;
  scopeType: string;
  scopeId: string | null;
  amountCents: number;
  warnPercent: number;
  hardStop: number;
  windowKind: string;
  active: number;
  createdAt: string;
}

export interface BudgetIncident {
  id: string;
  policyId: string;
  agentId: string | null;
  kind: string;
  amountAtTrigger: number;
  thresholdAmount: number;
  resolved: number;
  resolvedAt: string | null;
  createdAt: string;
}

export function useCostsSummary() {
  return useQuery<CostSummary>({
    queryKey: ['costs', 'summary'],
    queryFn: () => fetchJson('/costs/summary'),
    refetchInterval: 10000,
  });
}

export function useCostsByModel() {
  return useQuery<CostByModel[]>({
    queryKey: ['costs', 'by-model'],
    queryFn: () => fetchJson('/costs/by-model'),
    refetchInterval: 10000,
  });
}

export function useCostsByAgent() {
  return useQuery<CostByAgent[]>({
    queryKey: ['costs', 'by-agent'],
    queryFn: () => fetchJson('/costs/by-agent'),
    refetchInterval: 10000,
  });
}

export function useBudgetPolicies() {
  return useQuery<BudgetPolicy[]>({
    queryKey: ['budgets', 'policies'],
    queryFn: () => fetchJson('/budgets/policies'),
    refetchInterval: 10000,
  });
}

export function useBudgetIncidents(resolved?: boolean) {
  const params = resolved !== undefined ? `?resolved=${resolved ? '1' : '0'}` : '';
  return useQuery<BudgetIncident[]>({
    queryKey: ['budgets', 'incidents', resolved],
    queryFn: () => fetchJson(`/budgets/incidents${params}`),
    refetchInterval: 10000,
  });
}

// ─── 체인 ─────────────────────────────────────

export interface Chain {
  id: string;
  name: string;
  description: string | null;
  active: number;
  createdAt: string;
}

export interface ChainStep {
  id: string;
  chainId: string;
  stepOrder: number;
  teamRole: string;
  phase: string;
  label: string;
  completionCondition: string;
  autoTriggerNext: number;
  assignee: string | null;
  deployConfig: string | null;
  createdAt: string;
}

export function useChains() {
  return useQuery<Chain[]>({
    queryKey: ['chains'],
    queryFn: () => fetchJson('/chains'),
    refetchInterval: 10000,
  });
}

// ─── 루틴 ─────────────────────────────────────

export interface Routine {
  id: string;
  name: string;
  description: string | null;
  cronExpression: string;
  command: string;
  enabled: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastRunStatus: 'success' | 'failed' | 'running' | null;
  lastRunOutput: string | null;
  createdAt: string;
  updatedAt: string;
}

export function useRoutines() {
  return useQuery<Routine[]>({
    queryKey: ['routines'],
    queryFn: () => fetchJson('/routines'),
    refetchInterval: 10000,
  });
}

export function useToggleRoutine() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, enabled }: { id: string; enabled: boolean }) =>
      fetchJson<Routine>(`/routines/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: enabled ? 1 : 0 }),
      }),
    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: ['routines'] });
      const prev = queryClient.getQueryData<Routine[]>(['routines']);
      queryClient.setQueryData<Routine[]>(['routines'], (old) =>
        old?.map((r) => (r.id === id ? { ...r, enabled: enabled ? 1 : 0 } : r)),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['routines'], ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['routines'] });
    },
  });
}
