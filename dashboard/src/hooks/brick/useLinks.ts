import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { LinkType } from '@/components/brick/nodes/types';

export interface LinkTypeInfo {
  name: LinkType;
  displayName: string;
  style: 'solid' | 'dashed' | 'dotted';
  color: string;
}

export interface Link {
  id: number;
  workflowId: number;
  fromBlock: string;
  toBlock: string;
  linkType: LinkType;
  condition?: string | null;
  judge?: string | null;
  cron?: string | null;
  createdAt: string;
  updatedAt: string;
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

export function useLinkTypes() {
  return useQuery<LinkTypeInfo[]>({
    queryKey: ['brick', 'link-types'],
    queryFn: () => fetchJson('/link-types'),
  });
}

export function useLinks(workflowId: string) {
  return useQuery<Link[]>({
    queryKey: ['brick', 'links', workflowId],
    queryFn: () => fetchJson(`/links?workflowId=${workflowId}`),
    enabled: !!workflowId,
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      workflowId: number;
      fromBlock: string;
      toBlock: string;
      linkType?: LinkType;
      condition?: string;
      judge?: string;
      cron?: string;
    }) =>
      fetchJson<Link>('/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'links', String(vars.workflowId)] }),
  });
}

export function useUpdateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      workflowId,
      ...data
    }: {
      id: number;
      workflowId: number;
      linkType?: LinkType;
      condition?: string;
      judge?: string;
      cron?: string;
    }) =>
      fetchJson<Link>(`/links/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'links', String(vars.workflowId)] }),
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, workflowId }: { id: number; workflowId: number }) =>
      fetchJson(`/links/${id}`, { method: 'DELETE' }),
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ['brick', 'links', String(vars.workflowId)] }),
  });
}
