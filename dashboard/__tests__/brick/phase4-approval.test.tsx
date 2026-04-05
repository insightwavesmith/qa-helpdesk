import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// ── 글로벌 모킹 ──

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Top: 'top', Bottom: 'bottom' },
}));

vi.mock('../../../src/hooks/brick/useTeams', () => ({
  useTeams: () => ({ data: [] }),
}));

// ── 임포트 ──
import { ApprovalPanel } from '../../src/components/brick/panels/ApprovalPanel';
import { BlockNode } from '../../src/components/brick/nodes/BlockNode';
import { useApproval } from '../../src/hooks/brick/useApproval';
import { useBrickLiveUpdates } from '../../src/hooks/brick/useBrickLiveUpdates';

function createQC() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function wrap(ui: React.ReactElement, qc?: QueryClient) {
  const client = qc ?? createQC();
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

// ═══════════════════════════════════════════
// BD-023: ApprovalPanel 렌더
// ═══════════════════════════════════════════
describe('BD-023: ApprovalPanel 렌더', () => {
  it('bd023_approval_panel_renders_buttons_and_reason_field', () => {
    wrap(
      <ApprovalPanel
        workflowId="wf-1"
        blockId="blk-review"
        approver="smith@bscamp.kr"
        artifacts={['plans/brick-p1.md']}
      />,
    );

    expect(screen.getByTestId('approval-panel')).toBeTruthy();
    expect(screen.getByTestId('approve-btn')).toBeTruthy();
    expect(screen.getByTestId('reject-btn')).toBeTruthy();
    expect(screen.getByTestId('reject-reason-input')).toBeTruthy();
  });
});

// ═══════════════════════════════════════════
// BD-024: 승인 클릭 → POST .../approve
// ═══════════════════════════════════════════
describe('BD-024: 승인 클릭 API 호출', () => {
  it('bd024_approve_click_calls_approve_endpoint', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    wrap(
      <ApprovalPanel
        workflowId="wf-1"
        blockId="blk-review"
        approver="smith@bscamp.kr"
        artifacts={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('approve-btn'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/brick/workflows/wf-1/blocks/blk-review/approve',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BD-025: 반려 클릭 → POST .../reject + reason
// ═══════════════════════════════════════════
describe('BD-025: 반려 클릭 reason 전달', () => {
  it('bd025_reject_click_posts_reason', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    wrap(
      <ApprovalPanel
        workflowId="wf-1"
        blockId="blk-review"
        approver="smith@bscamp.kr"
        artifacts={[]}
      />,
    );

    // 사유 입력
    fireEvent.change(screen.getByTestId('reject-reason-input'), {
      target: { value: '설계 미흡' },
    });
    fireEvent.click(screen.getByTestId('reject-btn'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/brick/workflows/wf-1/blocks/blk-review/reject',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: '설계 미흡' }),
        }),
      );
    });

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BD-026: 반려 사유 빈칸 → 버튼 비활성
// ═══════════════════════════════════════════
describe('BD-026: 반려 사유 빈칸 → 비활성', () => {
  it('bd026_reject_btn_disabled_when_reason_empty', () => {
    wrap(
      <ApprovalPanel
        workflowId="wf-1"
        blockId="blk-review"
        approver=""
        artifacts={[]}
      />,
    );

    const rejectBtn = screen.getByTestId('reject-btn') as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(true);
  });

  it('bd026_reject_btn_enabled_when_reason_provided', () => {
    wrap(
      <ApprovalPanel
        workflowId="wf-1"
        blockId="blk-review"
        approver=""
        artifacts={[]}
      />,
    );

    fireEvent.change(screen.getByTestId('reject-reason-input'), {
      target: { value: '사유 있음' },
    });

    const rejectBtn = screen.getByTestId('reject-btn') as HTMLButtonElement;
    expect(rejectBtn.disabled).toBe(false);
  });
});

// ═══════════════════════════════════════════
// BD-027: BlockNode 승인 대기 뱃지
// ═══════════════════════════════════════════
describe('BD-027: BlockNode approval 뱃지', () => {
  it('bd027_shows_badge_when_approval_waiting', () => {
    const mockData = {
      blockType: 'review' as const,
      label: '리뷰',
      status: 'gate_checking' as const,
      gateType: 'approval',
    };

    render(
      <BlockNode
        id="n1"
        data={mockData}
        type="block"
        selected={false}
        zIndex={0}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
      />,
    );

    expect(screen.getByTestId('approval-badge')).toBeTruthy();
    expect(screen.getByTestId('approval-badge').textContent).toBe('!');
  });

  it('bd027_no_badge_without_approval_gateType', () => {
    const mockData = {
      blockType: 'review' as const,
      label: '리뷰',
      status: 'gate_checking' as const,
      // gateType not set → no badge
    };

    render(
      <BlockNode
        id="n1"
        data={mockData}
        type="block"
        selected={false}
        zIndex={0}
        isConnectable={true}
        positionAbsoluteX={0}
        positionAbsoluteY={0}
        dragging={false}
      />,
    );

    expect(screen.queryByTestId('approval-badge')).toBeNull();
  });
});

// ═══════════════════════════════════════════
// BD-028: DetailPanel → ApprovalPanel 라우팅
// ═══════════════════════════════════════════
describe('BD-028: DetailPanel approval 라우팅', () => {
  it('bd028_detail_panel_shows_approval_panel', async () => {
    // ApprovalPanel uses useApproval internally which calls fetch
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    }));

    const { DetailPanel } = await import('../../src/components/brick/panels/DetailPanel');

    const nodes = [
      {
        id: 'n-approval',
        type: 'block',
        position: { x: 0, y: 0 },
        data: {
          status: 'gate_checking',
          gateType: 'approval',
          workflowId: 'wf-1',
          blockId: 'blk-review',
          approver: 'smith@bscamp.kr',
          artifacts: [],
        },
      },
    ];

    wrap(
      <DetailPanel
        nodes={nodes}
        edges={[]}
        selectedNodeId="n-approval"
        selectedEdgeId={null}
      />,
    );

    expect(screen.getByTestId('approval-panel')).toBeTruthy();

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BD-029: useApproval approve mutation
// ═══════════════════════════════════════════
describe('BD-029: useApproval approve mutation', () => {
  it('bd029_approve_mutation_calls_correct_url', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const qc = createQC();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');

    function TestComp() {
      const { approve } = useApproval('wf-2', 'blk-2');
      return (
        <button data-testid="do-approve" onClick={() => approve.mutate(undefined)} />
      );
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId('do-approve'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/brick/workflows/wf-2/blocks/blk-2/approve',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ queryKey: ['brick', 'executions'] }),
      );
    });

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BD-030: useApproval reject mutation
// ═══════════════════════════════════════════
describe('BD-030: useApproval reject mutation', () => {
  it('bd030_reject_mutation_posts_reason', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });
    vi.stubGlobal('fetch', fetchSpy);

    const qc = createQC();

    function TestComp() {
      const { reject } = useApproval('wf-3', 'blk-3');
      return (
        <button data-testid="do-reject" onClick={() => reject.mutate('품질 미달')} />
      );
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId('do-reject'));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/brick/workflows/wf-3/blocks/blk-3/reject',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: '품질 미달' }),
        }),
      );
    });

    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════
// BD-031: WebSocket gate approval_pending → toast
// ═══════════════════════════════════════════
describe('BD-031: WebSocket gate approval toast', () => {
  beforeEach(() => {
    vi.stubGlobal('WebSocket', vi.fn().mockImplementation(() => ({
      close: vi.fn(), onmessage: null, onclose: null, onerror: null,
    })));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('bd031_gate_approval_waiting_shows_toast', () => {
    const toastFn = vi.fn();
    const qc = createQC();

    function TestComp() {
      const { handleMessage } = useBrickLiveUpdates({ onToast: toastFn });
      return (
        <button
          data-testid="send"
          onClick={() =>
            handleMessage({
              type: 'gate',
              data: { gateType: 'approval', status: 'waiting', blockId: 'blk-review' },
            })
          }
        />
      );
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId('send'));

    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: '승인 요청' }),
    );
    // approval toast는 'warning' variant
    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'warning' }),
    );
  });

  it('bd031_non_approval_gate_shows_status_change_toast', () => {
    const toastFn = vi.fn();
    const qc = createQC();

    function TestComp() {
      const { handleMessage } = useBrickLiveUpdates({ onToast: toastFn });
      return (
        <button
          data-testid="send"
          onClick={() =>
            handleMessage({
              type: 'gate',
              data: { gateType: 'metric', status: 'passed', message: 'metric 통과' },
            })
          }
        />
      );
    }

    render(<QueryClientProvider client={qc}><TestComp /></QueryClientProvider>);
    fireEvent.click(screen.getByTestId('send'));

    expect(toastFn).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Gate 상태 변경' }),
    );
  });
});

// ═══════════════════════════════════════════
// BD-032: 산출물 목록 표시
// ═══════════════════════════════════════════
describe('BD-032: ApprovalPanel 산출물 목록', () => {
  it('bd032_artifacts_rendered', () => {
    const artifacts = ['plans/brick-p1.md', 'designs/brick-p1.md'];

    wrap(
      <ApprovalPanel
        workflowId="wf-1"
        blockId="blk-review"
        approver="smith@bscamp.kr"
        artifacts={artifacts}
      />,
    );

    const list = screen.getByTestId('approval-artifacts');
    expect(list).toBeTruthy();
    expect(list.textContent).toContain('plans/brick-p1.md');
    expect(list.textContent).toContain('designs/brick-p1.md');
  });

  it('bd032_no_artifacts_section_when_empty', () => {
    wrap(
      <ApprovalPanel
        workflowId="wf-1"
        blockId="blk-review"
        approver=""
        artifacts={[]}
      />,
    );

    expect(screen.queryByTestId('approval-artifacts')).toBeNull();
  });
});
