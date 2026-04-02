import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface Preset {
  id: string;
  name: string;
  description?: string;
  blockCount: number;
  yaml?: string;
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

export function usePresets() {
  return useQuery<Preset[]>({
    queryKey: ['brick', 'presets'],
    queryFn: () => fetchJson('/presets'),
  });
}

export function useCreatePreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { name: string; yaml: string }) =>
      fetchJson<Preset>('/presets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'presets'] }),
  });
}

export function useExportPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchJson<{ yaml: string }>(`/presets/${id}/export`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'presets'] }),
  });
}

export function useImportPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { yaml: string }) =>
      fetchJson<Preset>('/presets/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['brick', 'presets'] }),
  });
}

export function useApplyPreset() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ presetId, canvasId }: { presetId: string; canvasId: string }) =>
      fetchJson(`/presets/${presetId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvasId }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['brick', 'presets'] });
      qc.invalidateQueries({ queryKey: ['brick', 'canvas'] });
    },
  });
}
