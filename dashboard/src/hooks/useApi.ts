import { useQuery } from '@tanstack/react-query';

const BASE = '/api';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
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
