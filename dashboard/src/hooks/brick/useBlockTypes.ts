import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface BlockTypeItem {
  id: string;
  name: string;
  what: string;
  done: string;
  icon?: string;
  description?: string;
  createdAt: string;
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

export function useBlockTypes() {
  return useQuery<BlockTypeItem[]>({
    queryKey: ['brick', 'blockTypes'],
    queryFn: () => fetchJson('/block-types'),
  });
}

export function useCreateBlockType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; what: string; done: string }) =>
      fetchJson<BlockTypeItem>('/block-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'blockTypes'] }),
  });
}

export function useUpdateBlockType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; name?: string; what?: string; done?: string }) =>
      fetchJson<BlockTypeItem>(`/block-types/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'blockTypes'] }),
  });
}

export function useDeleteBlockType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson(`/block-types/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'blockTypes'] }),
  });
}
