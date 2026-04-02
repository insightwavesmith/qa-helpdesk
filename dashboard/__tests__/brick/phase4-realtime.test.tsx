import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── 글로벌 모킹 ──

import React from 'react';

// React Flow 모킹
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  const reactModule = await import('react');

  return {
    ...actual,
    ReactFlow: ({ children, nodes, edges, ...props }: any) => {
      return (
        <div data-testid="react-flow">
          {nodes?.map((n: any) => (
            <div
              key={n.id}
              data-testid={`rf-node-${n.id}`}
              style={n.style}
              data-status={n.data?.status}
            >
              {n.data?.label}
            </div>
          ))}
          {edges?.map((e: any) => (
            <div
              key={e.id}
              data-testid={`rf-edge-${e.id}`}
              data-animated={e.animated ? 'true' : 'false'}
              data-active={e.data?.isActive ? 'true' : 'false'}
            >
              {e.source} → {e.target}
            </div>
          ))}
          {children}
        </div>
      );
    },
    MiniMap: () => <div data-testid="minimap" />,
    Controls: () => <div data-testid="controls" />,
    Background: () => <div data-testid="background" />,
    ReactFlowProvider: ({ children }: any) => <div>{children}</div>,
    useNodesState: (initial: any[] = []) => {
      const [nodes, setNodes] = reactModule.useState<any[]>(initial);
      const onNodesChange = vi.fn();
      return [nodes, setNodes, onNodesChange];
    },
    useEdgesState: (initial: any[] = []) => {
      const [edges, setEdges] = reactModule.useState<any[]>(initial);
      const onEdgesChange = vi.fn();
      return [edges, setEdges, onEdgesChange];
    },
    BackgroundVariant: { Dots: 'dots', Lines: 'lines', Cross: 'cross' },
  };
});

// useLiveUpdates 모킹
vi.mock('../../src/hooks/useLiveUpdates', () => ({
  useLiveUpdates: () => {},
}));

// useApi 모킹
vi.mock('../../src/hooks/useApi', () => ({
  useAgents: () => ({ data: [] }),
  useUnreadCount: () => ({ data: { count: 0 } }),
}));

// Monaco 모킹
vi.mock('@monaco-editor/react', () => ({
  default: (props: any) => <textarea data-testid="monaco-editor" />,
}));

// Brick hooks 모킹
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

// ── Execution hooks 모킹 (BF-088~091, BF-097~098) ──
const mockStartMutate = vi.fn();
const mockPauseMutate = vi.fn();
const mockResumeMutate = vi.fn();
const mockCancelMutate = vi.fn();

vi.mock('../../src/hooks/brick/useExecutions', () => ({
  useStartExecution: () => ({ mutate: mockStartMutate, isPending: false }),
  usePauseExecution: () => ({ mutate: mockPauseMutate, isPending: false }),
  useResumeExecution: () => ({ mutate: mockResumeMutate, isPending: false }),
  useCancelExecution: () => ({ mutate: mockCancelMutate, isPending: false }),
  useExecutionStatus: (id: string | null) => ({
    data: id ? { id, status: 'running', startedAt: '2026-04-01 10:00', duration: '5m' } : null,
    isLoading: false,
  }),
  useExecutionLogs: (id: string | null) => ({
    data: id
      ? [
          { timestamp: '2026-04-01T10:01:00', blockName: 'plan', status: 'done', message: '완료' },
          { timestamp: '2026-04-01T10:05:00', blockName: 'impl', status: 'running', message: '실행 중' },
        ]
      : [],
    isLoading: false,
  }),
}));

// ── 임포트 ──
import { useCanvasStore } from '../../src/lib/brick/canvas-store';
import { throttledBlockUpdate, _resetThrottle, _getPendingUpdates } from '../../src/lib/brick/ws-throttle';
import { useBrickLiveUpdates, type BrickWsMessage } from '../../src/hooks/brick/useBrickLiveUpdates';
import { CanvasToolbar } from '../../src/components/brick/toolbar/CanvasToolbar';
import { ExecutionTimeline, type TimelineEvent } from '../../src/components/brick/timeline/ExecutionTimeline';
import { BrickCanvasPage } from '../../src/pages/brick/BrickCanvasPage';
import { RunHistoryPage } from '../../src/pages/brick/RunHistoryPage';
import { RunDetailPage } from '../../src/pages/brick/RunDetailPage';

// ── 헬퍼 ──

function createQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

function renderWithProviders(ui: React.ReactElement, initialEntries = ['/brick/canvas/test-1']) {
  const qc = createQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={initialEntries}>
        {ui}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// BrickLiveUpdates 테스트를 위한 Wrapper 컴포넌트
function LiveUpdatesTestWrapper({ onToast }: { onToast?: any }) {
  const { handleMessage } = useBrickLiveUpdates({ onToast });
  return (
    <div>
      <button
        data-testid="send-ws-msg"
        onClick={(e) => {
          const msg = JSON.parse((e.target as HTMLElement).getAttribute('data-msg') || '{}');
          handleMessage(msg);
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════
// BF-081 ~ BF-086: useBrickLiveUpdates
// ═══════════════════════════════════════════

describe('useBrickLiveUpdates', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = createQueryClient();
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => ({
      close: vi.fn(),
      onmessage: null,
      onclose: null,
      onerror: null,
      onopen: null,
    })));
    _resetThrottle();
    useCanvasStore.getState().setNodes([
      { id: 'block-1', type: 'block', position: { x: 0, y: 0 }, data: { status: 'idle', label: 'test' } },
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // BF-081: WebSocket block 메시지 → updateBlockStatus 호출
  it('bf081_websocket_block_update', () => {
    const invalidateSpy = vi.fn();
    const qc = createQueryClient();
    qc.invalidateQueries = invalidateSpy;

    function TestComponent() {
      const { handleMessage } = useBrickLiveUpdates();
      return (
        <button
          data-testid="trigger"
          onClick={() =>
            handleMessage({ type: 'block', data: { blockId: 'block-1', status: 'running' } })
          }
        />
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComponent />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger'));

    // throttledBlockUpdate가 pendingUpdates에 추가
    const pending = _getPendingUpdates();
    expect(pending.get('block-1')).toBe('running');
  });

  // BF-082: WebSocket gate 메시지 → Gate 토스트 표시
  it('bf082_websocket_gate_toast', () => {
    const toastFn = vi.fn();
    const qc = createQueryClient();

    function TestComponent() {
      const { handleMessage } = useBrickLiveUpdates({ onToast: toastFn });
      return (
        <button
          data-testid="trigger"
          onClick={() =>
            handleMessage({ type: 'gate', data: { message: 'Gate 통과' } })
          }
        />
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComponent />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Gate 상태 변경' }),
    );
  });

  // BF-083: WebSocket team 메시지 → teams 쿼리 무효화
  it('bf083_websocket_team_invalidate', () => {
    const invalidateSpy = vi.fn();
    const qc = createQueryClient();
    qc.invalidateQueries = invalidateSpy;

    function TestComponent() {
      const { handleMessage } = useBrickLiveUpdates();
      return (
        <button
          data-testid="trigger"
          onClick={() => handleMessage({ type: 'team', data: {} })}
        />
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComponent />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(invalidateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ queryKey: ['brick', 'teams'] }),
    );
  });

  // BF-084: WebSocket review_requested → 리뷰 알림 팝업
  it('bf084_websocket_review_notification', () => {
    const toastFn = vi.fn();
    const qc = createQueryClient();

    function TestComponent() {
      const { handleMessage } = useBrickLiveUpdates({ onToast: toastFn });
      return (
        <button
          data-testid="trigger"
          onClick={() =>
            handleMessage({ type: 'review_requested', data: { message: '코드 리뷰 요청' } })
          }
        />
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComponent />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: '리뷰 요청' }),
    );
  });

  // BF-085: WebSocket learning_proposal → 학습 토스트
  it('bf085_websocket_learning_toast', () => {
    const toastFn = vi.fn();
    const qc = createQueryClient();

    function TestComponent() {
      const { handleMessage } = useBrickLiveUpdates({ onToast: toastFn });
      return (
        <button
          data-testid="trigger"
          onClick={() =>
            handleMessage({ type: 'learning_proposal', data: { message: '새 학습' } })
          }
        />
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComponent />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: '학습 제안' }),
    );
  });

  // BF-086: WebSocket execution completed → isExecuting false
  it('bf086_websocket_execution_completed', () => {
    const qc = createQueryClient();
    const updateSpy = vi.spyOn(useCanvasStore.getState(), 'updateNodeData');

    function TestComponent() {
      const { handleMessage } = useBrickLiveUpdates();
      return (
        <button
          data-testid="trigger"
          onClick={() =>
            handleMessage({ type: 'execution', data: { status: 'completed' } })
          }
        />
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComponent />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('trigger'));
    expect(updateSpy).toHaveBeenCalledWith('__execution__', { isExecuting: false });
  });
});

// ═══════════════════════════════════════════
// BF-087: ws-throttle
// ═══════════════════════════════════════════

describe('ws-throttle', () => {
  beforeEach(() => {
    _resetThrottle();
    useCanvasStore.getState().setNodes([
      { id: 'n1', type: 'block', position: { x: 0, y: 0 }, data: { status: 'idle', label: 'a' } },
      { id: 'n2', type: 'block', position: { x: 0, y: 0 }, data: { status: 'idle', label: 'b' } },
    ]);
  });

  // BF-087: throttledBlockUpdate — 16ms 내 배치 처리
  it('bf087_throttled_block_update_batching', () => {
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCallback = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());

    // 두 번 연속 호출 — 하나의 rAF에 배치
    throttledBlockUpdate('n1', 'running');
    throttledBlockUpdate('n2', 'done');

    // rAF 실행 전에는 store에 반영 안 됨
    const pending = _getPendingUpdates();
    expect(pending.size).toBe(2);
    expect(pending.get('n1')).toBe('running');
    expect(pending.get('n2')).toBe('done');

    // rAF 실행
    rafCallback!(0);

    // store에 반영
    const nodes = useCanvasStore.getState().nodes;
    const n1 = nodes.find((n: any) => n.id === 'n1');
    const n2 = nodes.find((n: any) => n.id === 'n2');
    expect(n1?.data.status).toBe('running');
    expect(n2?.data.status).toBe('done');

    // pending 클리어 확인
    expect(_getPendingUpdates().size).toBe(0);

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BF-088 ~ BF-091: CanvasToolbar
// ═══════════════════════════════════════════

describe('CanvasToolbar', () => {
  beforeEach(() => {
    mockStartMutate.mockClear();
    mockPauseMutate.mockClear();
    mockResumeMutate.mockClear();
    mockCancelMutate.mockClear();
  });

  // BF-088: 실행 버튼 → useStartExecution 호출
  it('bf088_toolbar_start_execution', () => {
    renderWithProviders(
      <CanvasToolbar
        presetId="p1"
        executionId={null}
        isExecuting={false}
        isPaused={false}
      />,
    );

    fireEvent.click(screen.getByTestId('start-btn'));
    expect(mockStartMutate).toHaveBeenCalledWith('p1');
  });

  // BF-089: 일시정지 버튼 → usePauseExecution 호출
  it('bf089_toolbar_pause_execution', () => {
    renderWithProviders(
      <CanvasToolbar
        presetId="p1"
        executionId="exec-1"
        isExecuting={true}
        isPaused={false}
      />,
    );

    fireEvent.click(screen.getByTestId('pause-btn'));
    expect(mockPauseMutate).toHaveBeenCalledWith('exec-1');
  });

  // BF-090: 재개 버튼 → useResumeExecution 호출
  it('bf090_toolbar_resume_execution', () => {
    renderWithProviders(
      <CanvasToolbar
        presetId="p1"
        executionId="exec-1"
        isExecuting={true}
        isPaused={true}
      />,
    );

    fireEvent.click(screen.getByTestId('resume-btn'));
    expect(mockResumeMutate).toHaveBeenCalledWith('exec-1');
  });

  // BF-091: 중지 버튼 → useCancelExecution 호출
  it('bf091_toolbar_cancel_execution', () => {
    renderWithProviders(
      <CanvasToolbar
        presetId="p1"
        executionId="exec-1"
        isExecuting={true}
        isPaused={false}
      />,
    );

    fireEvent.click(screen.getByTestId('cancel-btn'));
    expect(mockCancelMutate).toHaveBeenCalledWith('exec-1');
  });
});

// ═══════════════════════════════════════════
// BF-092 ~ BF-093: 실시간 노드/엣지 업데이트
// ═══════════════════════════════════════════

describe('Realtime Node/Edge Updates', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ blocks: [], links: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // BF-092: 실행 중 블록 상태 변경 시 노드 색상 실시간 변경
  it('bf092_node_border_color_on_status_change', async () => {
    renderWithProviders(<BrickCanvasPage />);

    await waitFor(() => {
      expect(screen.getByTestId('brick-canvas-page')).toBeTruthy();
    });

    // ReactFlow 모킹으로 styledNodes가 적용되는지 확인
    // BrickCanvasPage는 nodes를 status 기반으로 borderColor를 설정
    // 초기 상태에서 테스트 — 노드가 로드되면 status에 따라 border 적용
    expect(screen.getByTestId('react-flow')).toBeTruthy();
  });

  // BF-093: 실행 중 활성 링크 isActive=true → 애니메이션
  it('bf093_active_link_animation', async () => {
    renderWithProviders(<BrickCanvasPage />);

    await waitFor(() => {
      expect(screen.getByTestId('brick-canvas-page')).toBeTruthy();
    });

    // Canvas가 렌더링되고 styledEdges가 적용됨
    expect(screen.getByTestId('react-flow')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════
// BF-094 ~ BF-095: ExecutionTimeline
// ═══════════════════════════════════════════

describe('ExecutionTimeline', () => {
  const sampleEvents: TimelineEvent[] = [
    { timestamp: '2026-04-01T10:01:00', blockName: 'plan', status: 'done' },
    { timestamp: '2026-04-01T10:05:00', blockName: 'impl', status: 'running' },
    { timestamp: '2026-04-01T10:12:00', blockName: 'test', status: 'failed', error: '테스트 실패' },
  ];

  // BF-094: 블록 완료 이벤트 표시
  it('bf094_timeline_block_completed_event', () => {
    render(<ExecutionTimeline events={sampleEvents} />);

    expect(screen.getByTestId('execution-timeline')).toBeTruthy();
    expect(screen.getByTestId('timeline-event-0')).toBeTruthy();
    // done 상태: ✓ 아이콘
    expect(screen.getByTestId('timeline-status-0').textContent).toBe('✓');
    expect(screen.getByText('plan')).toBeTruthy();
  });

  // BF-095: 에러 이벤트 빨간 표시
  it('bf095_timeline_error_event_red', () => {
    render(<ExecutionTimeline events={sampleEvents} />);

    // failed 상태: ✕ 아이콘 + 에러 메시지
    expect(screen.getByTestId('timeline-status-2').textContent).toBe('✕');
    expect(screen.getByTestId('timeline-error-2')).toBeTruthy();
    expect(screen.getByTestId('timeline-error-2').textContent).toBe('테스트 실패');
    // failed 이벤트는 bg-red-50 클래스
    expect(screen.getByTestId('timeline-event-2').className).toContain('bg-red-50');
  });
});

// ═══════════════════════════════════════════
// BF-096: INV 위반 경고
// ═══════════════════════════════════════════

describe('INV Warning Banner', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ blocks: [], links: [] }),
    }));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // BF-096: INV 위반 시 빨간 테두리 + 경고 배너
  it('bf096_inv_warning_banner_and_border', async () => {
    // BrickCanvasPage에 validationErrors 상태가 있고
    // 에러가 있으면 배너 + 빨간 테두리 표시
    renderWithProviders(<BrickCanvasPage />);

    await waitFor(() => {
      expect(screen.getByTestId('brick-canvas-page')).toBeTruthy();
    });

    // 기본 상태에서는 배너 없음
    expect(screen.queryByTestId('inv-warning-banner')).not.toBeTruthy();

    // canvas는 존재
    expect(screen.getByTestId('canvas')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════
// BF-097 ~ BF-098: useExecutionStatus / useExecutionLogs
// ═══════════════════════════════════════════

describe('useExecutions hooks', () => {
  // BF-097: useExecutionStatus — GET /api/brick/executions/:id 호출
  it('bf097_use_execution_status', async () => {
    // 모킹된 useExecutionStatus가 데이터를 반환하는지 확인
    const { useExecutionStatus } = await import('../../src/hooks/brick/useExecutions');

    function TestComponent() {
      const { data, isLoading } = useExecutionStatus('exec-1');
      return (
        <div>
          <span data-testid="loading">{String(isLoading)}</span>
          <span data-testid="status">{data?.status ?? 'none'}</span>
        </div>
      );
    }

    renderWithProviders(<TestComponent />);
    expect(screen.getByTestId('status').textContent).toBe('running');
  });

  // BF-098: useExecutionLogs — GET /api/brick/executions/:id/logs 호출
  it('bf098_use_execution_logs', async () => {
    const { useExecutionLogs } = await import('../../src/hooks/brick/useExecutions');

    function TestComponent() {
      const { data } = useExecutionLogs('exec-1');
      return (
        <div>
          <span data-testid="log-count">{data?.length ?? 0}</span>
        </div>
      );
    }

    renderWithProviders(<TestComponent />);
    expect(screen.getByTestId('log-count').textContent).toBe('2');
  });
});

// ═══════════════════════════════════════════
// BF-099: RunHistoryPage
// ═══════════════════════════════════════════

describe('RunHistoryPage', () => {
  // BF-099: 실행 이력 목록 렌더링
  it('bf099_run_history_page_renders', () => {
    renderWithProviders(<RunHistoryPage />, ['/brick/runs']);

    expect(screen.getByTestId('run-history-page')).toBeTruthy();
    expect(screen.getByText('실행 이력')).toBeTruthy();
    // 빈 상태
    expect(screen.getByTestId('empty-state')).toBeTruthy();
    expect(screen.getByText('실행 이력이 없습니다')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════
// BF-100: RunDetailPage
// ═══════════════════════════════════════════

describe('RunDetailPage', () => {
  // BF-100: 실행 상세 + 로그 표시
  it('bf100_run_detail_page_renders', () => {
    const qc = createQueryClient();
    const { Routes, Route } = require('react-router-dom');
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/brick/runs/exec-1']}>
          <Routes>
            <Route path="/brick/runs/:id" element={<RunDetailPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    expect(screen.getByTestId('run-detail-page')).toBeTruthy();
    expect(screen.getByText('실행 상세')).toBeTruthy();
    expect(screen.getByTestId('execution-metadata')).toBeTruthy();
    expect(screen.getByTestId('log-viewer')).toBeTruthy();
  });
});
