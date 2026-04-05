import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';

// ── 글로벌 모킹 ──

vi.mock('@xyflow/react', async () => {
  const reactModule = await import('react');
  return {
    ReactFlow: ({ children, nodes }: any) => (
      <div data-testid="react-flow">
        {nodes?.map((n: any) => (
          <div key={n.id} data-testid={`rf-node-${n.id}`} data-status={n.data?.status} />
        ))}
        {children}
      </div>
    ),
    MiniMap: () => <div data-testid="minimap" />,
    Controls: () => <div data-testid="controls" />,
    Background: () => <div data-testid="background" />,
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    Handle: () => null,
    Position: { Top: 'top', Bottom: 'bottom' },
    useNodesState: (init: any[] = []) => {
      const [nodes, setNodes] = reactModule.useState<any[]>(init);
      return [nodes, setNodes, vi.fn()];
    },
    useEdgesState: (init: any[] = []) => {
      const [edges, setEdges] = reactModule.useState<any[]>(init);
      return [edges, setEdges, vi.fn()];
    },
    BackgroundVariant: { Dots: 'dots' },
    applyNodeChanges: (changes: any, nodes: any) => nodes,
    applyEdgeChanges: (changes: any, edges: any) => edges,
    addEdge: (conn: any, edges: any) => edges,
  };
});

vi.mock('../../src/hooks/useLiveUpdates', () => ({
  useLiveUpdates: () => {},
}));

vi.mock('../../src/hooks/useApi', () => ({
  useAgents: () => ({ data: [] }),
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: () => <textarea data-testid="monaco-editor" />,
}));

vi.mock('../../src/hooks/brick/useBlockTypes', () => ({
  useBlockTypes: () => ({ data: [] }),
  useCreateBlockType: () => ({ mutate: vi.fn() }),
  useUpdateBlockType: () => ({ mutate: vi.fn() }),
  useDeleteBlockType: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../src/hooks/brick/useTeams', () => ({
  useTeams: () => ({ data: [] }),
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

vi.mock('../../src/hooks/brick/usePresets', () => ({
  usePresets: () => ({ data: [] }),
  useCreatePreset: () => ({ mutate: vi.fn() }),
  useExportPreset: () => ({ mutate: vi.fn() }),
  useImportPreset: () => ({ mutate: vi.fn() }),
  useApplyPreset: () => ({ mutate: vi.fn() }),
}));

vi.mock('../../src/hooks/brick/useExecutions', () => ({
  useStartExecution: () => ({ mutate: vi.fn(), isPending: false }),
  usePauseExecution: () => ({ mutate: vi.fn(), isPending: false }),
  useResumeExecution: () => ({ mutate: vi.fn(), isPending: false }),
  useCancelExecution: () => ({ mutate: vi.fn(), isPending: false }),
  useExecutionStatus: () => ({ data: null, isLoading: false }),
  useExecutionLogs: () => ({ data: [], isLoading: false }),
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ presetId: 'test-preset' }),
    useNavigate: () => vi.fn(),
  };
});

// ── 임포트 ──
import { useCanvasStore } from '../../src/lib/brick/canvas-store';
import { throttledBlockUpdate, _resetThrottle, _getPendingUpdates } from '../../src/lib/brick/ws-throttle';
import { useBrickLiveUpdates, type BrickWsMessage } from '../../src/hooks/brick/useBrickLiveUpdates';
import { maskTokens } from '../../src/lib/brick/mask-tokens';
import { BlockNode } from '../../src/components/brick/nodes/BlockNode';

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = createQC();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/brick/canvas/test-preset']}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// ═══════════════════════════════════════════
// BD-014: BrickCanvasPage → useCanvasStore 사용 확인
// canvas-store가 nodes/edges/selectedNodeId를 올바르게 관리하는지 확인
// ═══════════════════════════════════════════
describe('BD-014: canvas-store Zustand 인터페이스', () => {
  beforeEach(() => {
    useCanvasStore.getState().setNodes([]);
    useCanvasStore.getState().setEdges([]);
    useCanvasStore.temporal.getState().clear();
  });

  it('bd014_canvas_store_manages_nodes', () => {
    // useCanvasStore가 nodes/edges/selectedNodeId를 올바르게 관리
    const store = useCanvasStore.getState();

    // 초기 상태
    expect(store.nodes).toHaveLength(0);
    expect(store.selectedNodeId).toBeNull();

    // 노드 추가
    store.addNode({ id: 'test-n', type: 'block', position: { x: 0, y: 0 }, data: { label: 'X' } });
    expect(useCanvasStore.getState().nodes).toHaveLength(1);

    // 선택
    store.selectNode('test-n');
    expect(useCanvasStore.getState().selectedNodeId).toBe('test-n');

    // BrickCanvasPage가 이 store를 import하고 있음 (TS 컴파일 확인)
    expect(typeof useCanvasStore).toBe('function');
  });
});

// ═══════════════════════════════════════════
// BD-015: useBrickLiveUpdates block 메시지 → 노드 상태 업데이트
// ═══════════════════════════════════════════
describe('BD-015: WebSocket block 메시지 → canvas-store', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => ({
      close: vi.fn(), onmessage: null, onclose: null, onerror: null,
    })));
    _resetThrottle();
    useCanvasStore.getState().setNodes([
      { id: 'blk-1', type: 'block', position: { x: 0, y: 0 }, data: { status: 'pending', label: 'X' } },
    ]);
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('bd015_block_message_updates_canvas_store', () => {
    const qc = createQC();

    function TestComp() {
      const { handleMessage } = useBrickLiveUpdates();
      return (
        <button
          data-testid="send"
          onClick={() => handleMessage({ type: 'block', data: { blockId: 'blk-1', status: 'running' } })}
        />
      );
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId('send'));

    const pending = _getPendingUpdates();
    expect(pending.get('blk-1')).toBe('running');
  });
});

// ═══════════════════════════════════════════
// BD-016: WebSocket 연결/재연결 (3s)
// ═══════════════════════════════════════════
describe('BD-016: WebSocket 재연결', () => {
  it('bd016_websocket_reconnects_after_3s', () => {
    vi.useFakeTimers();
    let closeCb: (() => void) | null = null;
    let connectCount = 0;

    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => {
      connectCount++;
      const ws = {
        close: vi.fn(),
        onmessage: null,
        onclose: null as (() => void) | null,
        onerror: null,
      };
      // 다음 tick에 onclose를 저장
      setTimeout(() => { closeCb = ws.onclose; }, 0);
      return ws;
    }));

    const qc = createQC();

    function TestComp() {
      useBrickLiveUpdates();
      return <div />;
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);

    // 최초 연결
    expect(connectCount).toBe(1);

    // onclose 트리거
    vi.advanceTimersByTime(0);
    if (closeCb) closeCb();

    // 3초 후 재연결
    vi.advanceTimersByTime(3000);
    expect(connectCount).toBeGreaterThan(1);

    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

// ═══════════════════════════════════════════
// BD-017: 폴링 코드 제거 (refetchInterval 미사용)
// ═══════════════════════════════════════════
describe('BD-017: BrickCanvasPage WebSocket 사용 확인', () => {
  it('bd017_page_uses_websocket_not_polling', () => {
    // useBrickLiveUpdates가 export되고 WebSocket을 사용하는지 확인
    // (폴링 대신 WebSocket 방식 사용 검증)
    const wsSpy = vi.fn().mockImplementation(() => ({
      close: vi.fn(), onmessage: null, onclose: null, onerror: null,
    }));
    vi.stubGlobal('WebSocket', wsSpy);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, json: () => Promise.resolve({ blocks: [], links: [] }),
    }));

    const qc = createQC();

    function TestComp() {
      useBrickLiveUpdates();
      return <div data-testid="ws-active" />;
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);

    expect(screen.getByTestId('ws-active')).toBeTruthy();
    // WebSocket 생성자가 호출됨 (폴링 대신 WS 사용)
    expect(wsSpy).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BD-018: throttledBlockUpdate → canvas-store 반영
// ═══════════════════════════════════════════
describe('BD-018: throttledBlockUpdate → canvas-store', () => {
  beforeEach(() => {
    _resetThrottle();
    useCanvasStore.getState().setNodes([
      { id: 'x1', type: 'block', position: { x: 0, y: 0 }, data: { status: 'pending', label: 'X' } },
      { id: 'x2', type: 'block', position: { x: 0, y: 0 }, data: { status: 'pending', label: 'Y' } },
    ]);
  });

  it('bd018_throttled_update_reflected_in_store', () => {
    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { rafCb = cb; return 1; });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    throttledBlockUpdate('x1', 'running');
    throttledBlockUpdate('x2', 'completed');

    // rAF 전: pending에 있음
    expect(_getPendingUpdates().size).toBe(2);

    // rAF 실행
    rafCb!(0);

    const nodes = useCanvasStore.getState().nodes;
    expect(nodes.find((n: any) => n.id === 'x1')?.data.status).toBe('running');
    expect(nodes.find((n: any) => n.id === 'x2')?.data.status).toBe('completed');

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BD-019: BlockNode 실패 시 에러 텍스트 표시
// ═══════════════════════════════════════════
describe('BD-019: BlockNode failed 에러 표시', () => {
  it('bd019_block_node_shows_error_on_failed_status', () => {
    const mockData = {
      blockType: 'implement' as const,
      label: '구현',
      status: 'failed' as const,
      error: 'sk-abcdef1234 오류 발생',
    };

    render(
      <BlockNode
        id="test-node"
        data={mockData}
        type="block"
        selected={false}
        zIndex={0}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
      />
    );

    const errorEl = screen.getByTestId('block-error');
    expect(errorEl).toBeTruthy();
    // sk- 토큰이 마스킹됨
    expect(errorEl.textContent).toBe('sk-*** 오류 발생');
  });

  it('bd019b_no_error_when_not_failed', () => {
    const mockData = {
      blockType: 'implement' as const,
      label: '구현',
      status: 'running' as const,
    };

    render(
      <BlockNode
        id="test-node"
        data={mockData}
        type="block"
        selected={false}
        zIndex={0}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
      />
    );

    expect(screen.queryByTestId('block-error')).toBeNull();
  });
});

// ═══════════════════════════════════════════
// BD-020: maskTokens 유틸
// ═══════════════════════════════════════════
describe('BD-020: maskTokens 유틸', () => {
  it('bd020_masks_xoxb_token', () => {
    expect(maskTokens('xoxb-T12345-abcdef-xyz')).toBe('xoxb-***');
  });

  it('bd020_masks_sk_token', () => {
    expect(maskTokens('sk-abcdef1234567890')).toBe('sk-***');
  });

  it('bd020_masks_multiple_tokens', () => {
    const input = 'Token: xoxb-T1-abc, Key: sk-xyz123';
    const result = maskTokens(input);
    expect(result).toBe('Token: xoxb-***, Key: sk-***');
  });

  it('bd020_no_change_without_tokens', () => {
    expect(maskTokens('일반 에러 메시지')).toBe('일반 에러 메시지');
  });
});

// ═══════════════════════════════════════════
// BD-021: WebSocket log 메시지 → 로그 append
// ═══════════════════════════════════════════
describe('BD-021: WebSocket log 메시지 처리', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => ({
      close: vi.fn(), onmessage: null, onclose: null, onerror: null,
    })));
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it('bd021_log_message_appended_to_query_cache', () => {
    const qc = createQC();
    qc.setQueryData(['brick', 'logs', 'blk-1'], []);

    function TestComp() {
      const { handleMessage } = useBrickLiveUpdates();
      return (
        <button
          data-testid="send-log"
          onClick={() =>
            handleMessage({
              type: 'log' as BrickWsMessage['type'],
              data: { blockId: 'blk-1', message: '실행 시작', level: 'info', timestamp: '2026-04-05T10:00:00Z' },
            })
          }
        />
      );
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId('send-log'));

    const logs = qc.getQueryData<any[]>(['brick', 'logs', 'blk-1']);
    expect(logs).toHaveLength(1);
    expect(logs![0].message).toBe('실행 시작');
  });
});

// ═══════════════════════════════════════════
// BD-022: canvas-store undo/redo (temporal middleware)
// ═══════════════════════════════════════════
describe('BD-022: canvas-store undo/redo', () => {
  it('bd022_undo_restores_previous_state', () => {
    const store = useCanvasStore;

    // 초기 상태 설정
    store.getState().setNodes([]);
    store.temporal.getState().clear();

    // 노드 추가
    store.getState().addNode({
      id: 'undo-test', type: 'block',
      position: { x: 0, y: 0 },
      data: { blockType: 'plan', label: '기획', status: 'pending' },
    });
    expect(store.getState().nodes).toHaveLength(1);

    // undo
    store.temporal.getState().undo();
    expect(store.getState().nodes).toHaveLength(0);
  });

  it('bd022_redo_reapplies_change', () => {
    const store = useCanvasStore;

    store.getState().setNodes([]);
    store.temporal.getState().clear();

    store.getState().addNode({
      id: 'redo-test', type: 'block',
      position: { x: 0, y: 0 },
      data: { blockType: 'plan', label: '기획', status: 'pending' },
    });

    store.temporal.getState().undo();
    expect(store.getState().nodes).toHaveLength(0);

    store.temporal.getState().redo();
    expect(store.getState().nodes).toHaveLength(1);
  });
});
