import type { Node, Edge } from '@xyflow/react';

export interface PresetYaml {
  name: string;
  blocks: Array<{
    id: string;
    type: string;
    what: string;
    team?: string;
    gates?: Array<{ type: string }>;
  }>;
  links: Array<{
    from: string;
    to: string;
    type: string;
    condition?: string;
  }>;
  teams: Record<string, { adapter: string; config: Record<string, unknown> }>;
}

/**
 * YAML(PresetYaml) → React Flow Node/Edge 변환
 */
export function yamlToFlow(preset: PresetYaml): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = preset.blocks.map((block, i) => ({
    id: block.id,
    type: block.type === 'review' ? 'review' : block.type === 'notify' ? 'notify' : 'block',
    position: { x: 0, y: i * 150 },
    data: {
      blockId: block.id,
      name: block.what || block.id,
      blockType: block.type,
      teamId: block.team || null,
      status: 'idle',
      gates:
        block.gates?.map((g, gi) => ({
          gateId: `${block.id}-gate-${gi}`,
          type: g.type,
          status: 'pending',
        })) || [],
      isCore: false,
    },
  }));

  const edges: Edge[] = preset.links.map((link) => ({
    id: `e-${link.from}-${link.to}`,
    source: link.from,
    target: link.to,
    type: 'link',
    data: {
      linkType: link.type || 'sequential',
      condition: link.condition,
      isActive: false,
    },
  }));

  return { nodes, edges };
}

/**
 * React Flow Node/Edge → YAML(PresetYaml) 변환
 */
export function flowToYaml(
  nodes: Node[],
  edges: Edge[],
  name: string = 'preset',
): PresetYaml {
  const blocks = nodes
    .filter((n) => n.type !== 'start' && n.type !== 'end')
    .map((n) => ({
      id: (n.data as Record<string, unknown>).blockId as string || n.id,
      type: (n.data as Record<string, unknown>).blockType as string || 'custom',
      what: (n.data as Record<string, unknown>).name as string || n.id,
      team: (n.data as Record<string, unknown>).teamId as string || undefined,
      gates: Array.isArray((n.data as Record<string, unknown>).gates) &&
        ((n.data as Record<string, unknown>).gates as Array<{ type: string }>).length
        ? ((n.data as Record<string, unknown>).gates as Array<{ type: string }>).map(
            (g) => ({ type: g.type }),
          )
        : undefined,
    }));

  const links = edges.map((e) => ({
    from: e.source,
    to: e.target,
    type: (e.data as Record<string, unknown>)?.linkType as string || 'sequential',
    condition: (e.data as Record<string, unknown>)?.condition as string || undefined,
  }));

  const teams: Record<string, { adapter: string; config: Record<string, unknown> }> = {};
  nodes.forEach((n) => {
    const data = n.data as Record<string, unknown>;
    if (data.teamId && data.blockId) {
      teams[data.blockId as string] = { adapter: 'claude_code', config: {} };
    }
  });

  return { name, blocks, links, teams };
}

/**
 * Spec wrapper 포함 Full YAML 인터페이스
 */
export interface PresetYamlFull {
  kind: 'Preset';
  name: string;
  labels?: Record<string, string>;
  spec: {
    blocks: Array<{
      id: string;
      type: string;
      what: string;
      description?: string;
      done?: { artifacts?: string[]; metrics?: Record<string, unknown> };
      config?: Record<string, unknown>;
    }>;
    links: Array<{
      from: string;
      to: string;
      type: string;
      condition?: string;
      max_retries?: number;
    }>;
    teams: Record<string, string | { team: string; override?: Record<string, unknown> }>;
    gates?: Record<string, Array<{ type: string; command?: string; description?: string }>>;
  };
}

/**
 * React Flow Node/Edge → Full YAML (spec wrapper 포함) 변환.
 * Canvas에서 편집 불가한 데이터(gates, labels)는 existingPreset에서 보존.
 */
export function flowToYamlFull(
  nodes: Node[],
  edges: Edge[],
  name: string,
  existingPreset?: PresetYamlFull,
): PresetYamlFull {
  const blocks = nodes
    .filter((n) => n.type !== 'start' && n.type !== 'end')
    .map((n) => {
      const d = n.data as Record<string, unknown>;
      return {
        id: (d.blockId as string) || n.id,
        type: (d.blockType as string) || 'custom',
        what: (d.name as string) || n.id,
        description: (d.description as string) || undefined,
        done: (d.done as { artifacts?: string[] }) || undefined,
        config: (d.config as Record<string, unknown>) || undefined,
      };
    });

  const links = edges.map((e) => {
    const d = e.data as Record<string, unknown> | undefined;
    return {
      from: e.source,
      to: e.target,
      type: (d?.linkType as string) || 'sequential',
      condition: (d?.condition as string) || undefined,
      max_retries: (d?.maxRetries as number) || undefined,
    };
  });

  const teams: Record<string, string | { team: string; override?: Record<string, unknown> }> = {};
  nodes.forEach((n) => {
    const d = n.data as Record<string, unknown>;
    if (d.teamId && d.blockId) {
      teams[d.blockId as string] = d.teamId as string;
    }
  });

  return {
    kind: 'Preset',
    name,
    labels: existingPreset?.labels,
    spec: {
      blocks,
      links,
      teams,
      gates: existingPreset?.spec?.gates,
    },
  };
}
