import { useQuery } from '@tanstack/react-query';

export interface Project {
  id: string;
  name: string;
  description?: string;
  presetCount: number;
}

const BASE = '/api/brick';

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json();
}

export function useProjects() {
  return useQuery<Project[]>({
    queryKey: ['brick', 'projects'],
    queryFn: () => fetchJson('/projects'),
  });
}

export function useProjectPresets(projectId: string | null) {
  return useQuery({
    queryKey: ['brick', 'presets', { project: projectId }],
    queryFn: () => {
      const url = projectId ? `/presets?project=${projectId}` : '/presets';
      return fetchJson(url);
    },
    enabled: true,
  });
}
