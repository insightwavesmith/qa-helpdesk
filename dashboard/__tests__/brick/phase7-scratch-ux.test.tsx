import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Edge } from '@xyflow/react';

// ── React Flow 모킹 ──
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    Handle: () => null,
    ReactFlow: ({ children, ...props }: any) => (
      <div data-testid="react-flow" data-is-valid-connection={!!props.isValidConnection}>
        {children}
      </div>
    ),
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    MiniMap: () => null,
    Controls: () => null,
    Background: () => null,
  };
});

// ── useTeams 모킹 ──
const mockTeams = [
  { id: 't1', name: '프론트팀', memberCount: 3, createdAt: '2026-01-01' },
  { id: 't2', name: '백엔드팀', memberCount: 2, createdAt: '2026-01-01' },
];

vi.mock('../../src/hooks/brick/useTeams', () => ({
  useTeams: () => ({ data: mockTeams }),
  useCreateTeam: () => ({ mutate: vi.fn() }),
  useDeleteTeam: () => ({ mutate: vi.fn() }),
  useTeamMembers: () => ({ data: [] }),
  useAddMember: () => ({ mutate: vi.fn() }),
  useRemoveMember: () => ({ mutate: vi.fn() }),
  useUpdateSkill: () => ({ mutate: vi.fn() }),
  useConfigureMcp: () => ({ mutate: vi.fn() }),
  useSetModel: () => ({ mutate: vi.fn() }),
  useTeamStatus: () => ({ data: null }),
}));

// ── usePresets 모킹 ──
const mockCreatePreset = vi.fn();
vi.mock('../../src/hooks/brick/usePresets', () => ({
  usePresets: () => ({
    data: [
      { id: 'p1', name: '기본 프리셋', description: '설명', blockCount: 5, yaml: 'blocks: []', createdAt: '2026-01-01' },
    ],
  }),
  useCreatePreset: () => ({ mutate: mockCreatePreset }),
  useExportPreset: () => ({ mutate: vi.fn() }),
  useImportPreset: () => ({ mutate: vi.fn() }),
  useApplyPreset: () => ({ mutate: vi.fn() }),
}));

// ── useBlockTypes 모킹 ──
vi.mock('../../src/hooks/brick/useBlockTypes', () => ({
  useBlockTypes: () => ({ data: [] }),
  useCreateBlockType: () => ({ mutate: vi.fn() }),
  useUpdateBlockType: () => ({ mutate: vi.fn() }),
  useDeleteBlockType: () => ({ mutate: vi.fn() }),
}));

// ── 임포트 (모킹 후) ──
import { BlockNode } from '../../src/components/brick/nodes/BlockNode';
import { NotifyNode } from '../../src/components/brick/nodes/NotifyNode';
import { PresetListPage } from '../../src/pages/brick/PresetListPage';
import { GateConfigPanel, type GateConfig } from '../../src/components/brick/panels/GateConfigPanel';
import { BrickCanvasPage } from '../../src/pages/brick/BrickCanvasPage';
import { validateConnection } from '../../src/lib/brick/connection-validator';
import {
  BLOCK_CATEGORY_MAP,
  CATEGORY_BG_COLORS,
  type BlockNodeData,
  type BlockStatus,
  type NotifyNodeData,
} from '../../src/components/brick/nodes/types';

// ── 헬퍼 ──
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function expectBgColor(el: HTMLElement, hexColor: string) {
  const bgColor = el.style.backgroundColor;
  const expected = [hexColor.toLowerCase(), hexToRgb(hexColor)];
  expect(expected).toContain(bgColor);
}

function makeBlockProps(data: Partial<BlockNodeData> & { blockType: BlockNodeData['blockType']; label: string; status: BlockStatus }) {
  return {
    id: 'test-node',
    type: 'block' as const,
    data: {
      blockType: data.blockType,
      label: data.label,
      status: data.status,
      team: data.team,
      gates: data.gates,
    } as BlockNodeData,
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    deletable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
    width: 240,
    height: 100,
  } as any;
}

function makeNotifyProps(overrides: Partial<NotifyNodeData> = {}) {
  const data: NotifyNodeData = {
    blockType: 'notify',
    label: '테스트 알림',
    status: 'idle',
    channel: 'slack',
    target: '#general',
    events: ['start', 'complete'],
    ...overrides,
  };
  return {
    id: 'notify-1',
    type: 'notify' as const,
    data,
    selected: false,
    isConnectable: true,
    zIndex: 0,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    deletable: true,
    selectable: true,
    parentId: undefined,
    sourcePosition: undefined,
    targetPosition: undefined,
    width: 240,
    height: 130,
  } as any;
}

function renderWithFlow(ui: React.ReactElement) {
  return render(ui);
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/brick/canvas/test-1']}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ── fetch 모킹 ──
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockRejectedValue(new Error('not found'));
  global.fetch = fetchMock;
  mockCreatePreset.mockClear();
});

// ═══════════════════════════════════════════
// Phase 7: Scratch UX (BF-136 ~ BF-145)
// ═══════════════════════════════════════════

describe('Phase 7: Scratch UX (BF-136 ~ BF-145)', () => {
  // ── BF-136: 블록 우클릭 → 팀 배정 드롭다운 즉시 표시 ──
  it('bf136_block_right_click_team_dropdown', () => {
    renderWithFlow(
      <BlockNode
        {...makeBlockProps({ blockType: 'implement', label: '구현', status: 'idle' })}
      />,
    );

    const node = screen.getByTestId('block-node');
    fireEvent.contextMenu(node);

    const dropdown = screen.getByTestId('team-dropdown');
    expect(dropdown).toBeDefined();

    // 팀 목록 표시
    expect(screen.getByText('프론트팀')).toBeDefined();
    expect(screen.getByText('백엔드팀')).toBeDefined();
  });

  // ── BF-137: 유효하지 않은 연결 시 스냅 안 됨 ──
  it('bf137_invalid_connection_no_snap', () => {
    // 순환 연결 시도 → validateConnection이 false 반환
    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'b' },
      { id: 'e2', source: 'b', target: 'c' },
    ];
    const result = validateConnection('c', 'a', edges);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('순환 연결 불가');

    // BrickCanvasPage에 isValidConnection이 전달되는지 확인
    renderWithProviders(<BrickCanvasPage />);
    const reactFlow = screen.getByTestId('react-flow');
    expect(reactFlow.dataset.isValidConnection).toBe('true');
  });

  // ── BF-138: Plan 카테고리 블록 배경색 #DBEAFE ──
  it('bf138_plan_category_bg_dbeafe', () => {
    for (const blockType of ['plan', 'design'] as const) {
      const { unmount } = renderWithFlow(
        <BlockNode
          {...makeBlockProps({ blockType, label: blockType, status: 'idle' })}
        />,
      );
      const node = screen.getByTestId('block-node');
      expectBgColor(node, '#DBEAFE');
      unmount();
    }
  });

  // ── BF-139: Do 카테고리 블록 배경색 #DCFCE7 ──
  it('bf139_do_category_bg_dcfce7', () => {
    for (const blockType of ['implement', 'deploy'] as const) {
      const { unmount } = renderWithFlow(
        <BlockNode
          {...makeBlockProps({ blockType, label: blockType, status: 'idle' })}
        />,
      );
      const node = screen.getByTestId('block-node');
      expectBgColor(node, '#DCFCE7');
      unmount();
    }
  });

  // ── BF-140: Check 카테고리 블록 배경색 #FEF9C3 ──
  it('bf140_check_category_bg_fef9c3', () => {
    for (const blockType of ['test', 'review', 'monitor'] as const) {
      const { unmount } = renderWithFlow(
        <BlockNode
          {...makeBlockProps({ blockType, label: blockType, status: 'idle' })}
        />,
      );
      const node = screen.getByTestId('block-node');
      expectBgColor(node, '#FEF9C3');
      unmount();
    }
  });

  // ── BF-141: Act 카테고리 블록 배경색 #F3E8FF ──
  it('bf141_act_category_bg_f3e8ff', () => {
    for (const blockType of ['rollback', 'custom'] as const) {
      const { unmount } = renderWithFlow(
        <BlockNode
          {...makeBlockProps({ blockType, label: blockType, status: 'idle' })}
        />,
      );
      const node = screen.getByTestId('block-node');
      expectBgColor(node, '#F3E8FF');
      unmount();
    }
  });

  // ── BF-142: Notify 카테고리 블록 배경색 #E0F2FE ──
  it('bf142_notify_category_bg_e0f2fe', () => {
    renderWithFlow(<NotifyNode {...makeNotifyProps({ status: 'idle' })} />);
    const node = screen.getByTestId('notify-node');
    expectBgColor(node, '#E0F2FE');
  });

  // ── BF-143: 프리셋 Remix — "복제" 버튼 → 새 프리셋으로 복사 ──
  it('bf143_preset_remix_duplicate', () => {
    render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>
          <PresetListPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const duplicateBtn = screen.getByTestId('preset-duplicate-p1');
    fireEvent.click(duplicateBtn);

    expect(mockCreatePreset).toHaveBeenCalledWith({
      name: '기본 프리셋-복사본',
      yaml: 'blocks: []',
    });
  });

  // ── BF-144: Gate threshold 슬라이더 UI ──
  it('bf144_gate_threshold_slider', () => {
    const gates: GateConfig[] = [
      {
        gateId: 'g1',
        type: 'prompt',
        status: 'pending',
        confidence: 0.7,
      },
    ];
    render(<GateConfigPanel gates={gates} />);

    const slider = screen.getByTestId('gate-confidence-input') as HTMLInputElement;
    expect(slider).toBeDefined();
    expect(slider.type).toBe('range');
    expect(slider.min).toBe('0');
    expect(slider.max).toBe('1');
  });

  // ── BF-145: 빈 캔버스 시작 시 온보딩 가이드 표시 ──
  it('bf145_empty_canvas_onboarding_guide', () => {
    renderWithProviders(<BrickCanvasPage />);

    const guide = screen.getByTestId('onboarding-guide');
    expect(guide).toBeDefined();
    expect(guide.textContent).toContain('블록');
    expect(guide.textContent).toContain('드래그');
  });
});
