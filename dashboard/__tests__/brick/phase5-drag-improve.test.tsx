import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';

// ── vi.mock 호이스팅 — import 전에 선언 ──

vi.mock('dagre', () => {
  const mockGraph = {
    setDefaultEdgeLabel: vi.fn(),
    setGraph: vi.fn(),
    setNode: vi.fn(),
    setEdge: vi.fn(),
    node: vi.fn().mockReturnValue({ x: 100, y: 100 }),
  };
  return {
    default: {
      graphlib: { Graph: vi.fn(() => mockGraph) },
      layout: vi.fn(),
    },
  };
});

vi.mock('@xyflow/react', () => ({
  ReactFlow: ({ onConnect }: { onConnect?: (c: { source: string; target: string }) => void }) => (
    <div
      data-testid="mock-reactflow"
      onClick={() => onConnect?.({ source: 'node-1', target: 'node-2' })}
    />
  ),
  ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  MiniMap: () => <div data-testid="minimap" />,
  Controls: () => <div data-testid="controls" />,
  Background: () => <div data-testid="background" />,
  BackgroundVariant: { Dots: 'dots' },
  useNodesState: () => [[], vi.fn(), vi.fn()],
  useEdgesState: () => [[], vi.fn(), vi.fn()],
}));

vi.mock('../../src/hooks/brick/useExecutions', () => ({
  useStartExecution: () => ({ mutate: vi.fn() }),
  usePauseExecution: () => ({ mutate: vi.fn() }),
  useResumeExecution: () => ({ mutate: vi.fn() }),
  useCancelExecution: () => ({ mutate: vi.fn() }),
  useExecutionStatus: () => ({ data: null }),
  useExecutionLogs: () => ({ data: null }),
}));

vi.mock('../../src/lib/brick/connection-validator', () => ({
  validateConnection: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('../../src/lib/brick/serializer', () => ({
  yamlToFlow: vi.fn().mockReturnValue({ nodes: [], edges: [] }),
  flowToYamlFull: vi.fn().mockReturnValue(''),
}));

// ── Imports ──
import { BlockSidebar } from '../../src/components/brick/BlockSidebar';
import { LinkTypePopover } from '../../src/components/brick/dialogs/LinkTypePopover';
import { CanvasToolbar } from '../../src/components/brick/toolbar/CanvasToolbar';
import { autoLayout } from '../../src/lib/brick/layout';
import { BrickCanvasPage } from '../../src/pages/brick/BrickCanvasPage';

beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({}),
  }) as unknown as typeof fetch;
});

// ── BD-033: BlockSidebar 카테고리 그룹핑 ──
describe('test_bd033_block_sidebar_category_grouping', () => {
  it('Plan/Do/Check/Act/Notify 카테고리 그룹이 렌더된다', () => {
    render(<BlockSidebar />);
    expect(screen.getByTestId('category-toggle-계획')).toBeInTheDocument();
    expect(screen.getByTestId('category-toggle-실행')).toBeInTheDocument();
    expect(screen.getByTestId('category-toggle-검증')).toBeInTheDocument();
    expect(screen.getByTestId('category-toggle-조치')).toBeInTheDocument();
    expect(screen.getByTestId('category-toggle-알림')).toBeInTheDocument();
  });
});

// ── BD-034: BlockSidebar 검색 필터 ──
describe('test_bd034_block_sidebar_search_filter', () => {
  it('검색어 입력 시 매칭되는 블록만 표시된다', () => {
    render(<BlockSidebar />);
    const input = screen.getByPlaceholderText('블록 검색...');
    fireEvent.change(input, { target: { value: '기획' } });
    expect(screen.getByTestId('block-type-plan')).toBeInTheDocument();
    expect(screen.queryByTestId('block-type-implement')).not.toBeInTheDocument();
  });
});

// ── BD-035: BlockSidebar 접기/펼치기 ──
describe('test_bd035_block_sidebar_toggle', () => {
  it('카테고리 헤더 클릭 시 해당 블록이 숨겨진다', () => {
    render(<BlockSidebar />);
    expect(screen.getByTestId('block-type-plan')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('category-toggle-계획'));
    expect(screen.queryByTestId('block-type-plan')).not.toBeInTheDocument();
  });
});

// ── BD-036: 자동 레이아웃 세로 ──
describe('test_bd036_auto_layout_vertical', () => {
  it('TB 방향 autoLayout 호출 시 레이아웃된 노드를 반환한다', () => {
    const nodes = [
      { id: 'n1', type: 'block', position: { x: 0, y: 0 }, data: {} },
      { id: 'n2', type: 'block', position: { x: 0, y: 0 }, data: {} },
    ] as Parameters<typeof autoLayout>[0];
    const edges = [{ id: 'e1', source: 'n1', target: 'n2' }] as Parameters<typeof autoLayout>[1];
    const result = autoLayout(nodes, edges, 'TB');
    expect(result).toHaveLength(2);
    expect(result[0]).toHaveProperty('position');
  });
});

// ── BD-037: 자동 레이아웃 가로 ──
describe('test_bd037_auto_layout_horizontal', () => {
  it('LR 방향 autoLayout 호출 시 레이아웃된 노드를 반환한다', () => {
    const nodes = [
      { id: 'n1', type: 'block', position: { x: 0, y: 0 }, data: {} },
    ] as Parameters<typeof autoLayout>[0];
    const result = autoLayout(nodes, [], 'LR');
    expect(result).toHaveLength(1);
    expect(result[0]).toHaveProperty('position');
  });
});

// ── BD-038: CanvasToolbar 레이아웃 버튼 콜백 ──
describe('test_bd038_canvas_toolbar_layout_buttons', () => {
  it('세로/가로 버튼 클릭 시 각각의 콜백이 호출된다', () => {
    const onLayoutVertical = vi.fn();
    const onLayoutHorizontal = vi.fn();
    render(
      <CanvasToolbar
        presetId="test"
        executionId={null}
        isExecuting={false}
        isPaused={false}
        onLayoutVertical={onLayoutVertical}
        onLayoutHorizontal={onLayoutHorizontal}
      />
    );
    fireEvent.click(screen.getByTestId('layout-vertical-btn'));
    fireEvent.click(screen.getByTestId('layout-horizontal-btn'));
    expect(onLayoutVertical).toHaveBeenCalledOnce();
    expect(onLayoutHorizontal).toHaveBeenCalledOnce();
  });
});

// ── BD-039: LinkTypePopover 6종 링크 타입 렌더 ──
describe('test_bd039_link_type_popover_renders_six_types', () => {
  it('6종 링크 타입 버튼이 모두 렌더된다', () => {
    render(
      <LinkTypePopover
        position={{ x: 100, y: 100 }}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByTestId('link-type-btn-sequential')).toBeInTheDocument();
    expect(screen.getByTestId('link-type-btn-parallel')).toBeInTheDocument();
    expect(screen.getByTestId('link-type-btn-compete')).toBeInTheDocument();
    expect(screen.getByTestId('link-type-btn-loop')).toBeInTheDocument();
    expect(screen.getByTestId('link-type-btn-cron')).toBeInTheDocument();
    expect(screen.getByTestId('link-type-btn-branch')).toBeInTheDocument();
  });
});

// ── BD-040: LinkTypePopover 선택 콜백 ──
describe('test_bd040_link_type_popover_onselect', () => {
  it('버튼 클릭 시 onSelect가 해당 타입으로 호출된다', () => {
    const onSelect = vi.fn();
    render(
      <LinkTypePopover
        position={{ x: 100, y: 100 }}
        onSelect={onSelect}
        onCancel={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('link-type-btn-sequential'));
    expect(onSelect).toHaveBeenCalledWith('sequential');
  });
});

// ── BD-041: LinkTypePopover position prop 적용 ──
describe('test_bd041_link_type_popover_position', () => {
  it('position prop이 absolute 좌표 스타일로 적용된다', () => {
    render(
      <LinkTypePopover
        position={{ x: 200, y: 300 }}
        onSelect={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    const popover = screen.getByTestId('link-type-popover');
    expect(popover).toHaveStyle({ left: '200px', top: '300px' });
  });
});

// ── BD-042: 연결 드래그 완료 → LinkTypePopover 표시 ──
describe('test_bd042_connection_drag_shows_popover', () => {
  it('onConnect 호출 후 LinkTypePopover가 렌더된다', async () => {
    render(<BrickCanvasPage />);
    fireEvent.click(screen.getByTestId('mock-reactflow'));
    await waitFor(() => {
      expect(screen.getByTestId('link-type-popover')).toBeInTheDocument();
    });
  });
});
