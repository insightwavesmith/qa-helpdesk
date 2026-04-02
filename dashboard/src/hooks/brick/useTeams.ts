import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Team {
  id: string;
  name: string;
  description?: string;
  memberCount: number;
  createdAt: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  avatarUrl?: string;
}

export type TeamStatus = 'idle' | 'running' | 'stuck' | 'dead';

export interface TeamStatusData {
  teamId: string;
  status: TeamStatus;
  lastHeartbeat?: string;
}

const BASE = '/api/brick';

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function useTeams() {
  return useQuery<Team[]>({
    queryKey: ['brick', 'teams'],
    queryFn: () => fetchJson('/teams'),
  });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; description?: string }) =>
      fetchJson<Team>('/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'teams'] }),
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/teams/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'teams'] }),
  });
}

export function useTeamMembers(teamId: string) {
  return useQuery<TeamMember[]>({
    queryKey: ['brick', 'teams', teamId, 'members'],
    queryFn: () => fetchJson(`/teams/${teamId}/members`),
    enabled: !!teamId,
  });
}

export function useAddMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, ...data }: { teamId: string; name: string; role: string }) =>
      fetchJson<TeamMember>(`/teams/${teamId}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'teams', vars.teamId, 'members'] }),
  });
}

export function useRemoveMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, memberId }: { teamId: string; memberId: string }) =>
      fetchJson(`/teams/${teamId}/members/${memberId}`, { method: 'DELETE' }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'teams', vars.teamId, 'members'] }),
  });
}

export function useUpdateSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, content }: { teamId: string; content: string }) =>
      fetchJson(`/teams/${teamId}/skills`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'teams', vars.teamId] }),
  });
}

export function useConfigureMcp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, servers }: { teamId: string; servers: Record<string, boolean> }) =>
      fetchJson(`/teams/${teamId}/mcp`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ servers }),
      }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'teams', vars.teamId] }),
  });
}

export function useSetModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ teamId, model }: { teamId: string; model: string }) =>
      fetchJson(`/teams/${teamId}/model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'teams', vars.teamId] }),
  });
}

export function useTeamStatus(teamId: string) {
  return useQuery<TeamStatusData>({
    queryKey: ['brick', 'teams', teamId, 'status'],
    queryFn: () => fetchJson(`/teams/${teamId}/status`),
    enabled: !!teamId,
    refetchInterval: 5000,
  });
}
