import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// ── React Flow 모킹 ──
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    Handle: () => null,
    ReactFlowProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  };
});

import { ReviewDetailPanel } from '../../src/components/brick/panels/ReviewDetailPanel';
import { ReviewNode } from '../../src/components/brick/nodes/ReviewNode';
import { LearningHarnessPage } from '../../src/pages/brick/LearningHarnessPage';
import { ProposalDetail } from '../../src/components/brick/learning/ProposalDetail';
import { ApproveRejectForm } from '../../src/components/brick/learning/ApproveRejectForm';
import { BrickOverviewPage } from '../../src/pages/brick/BrickOverviewPage';
import type { ReviewNodeData } from '../../src/components/brick/nodes/types';

// ── 헬퍼 ──
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

function expectBorderColor(el: HTMLElement, hexColor: string) {
  const style = el.style.border || el.style.borderColor;
  const expected = [hexColor.toLowerCase(), hexToRgb(hexColor)];
  const match = expected.some((v) => style.includes(v));
  expect(match).toBe(true);
}

function makeReviewNode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'review-1',
    type: 'review' as const,
    position: { x: 0, y: 0 },
    data: {
      label: '코드 리뷰',
      workflowId: 'wf-1',
      reviewStatus: 'pending',
      checklist: [
        { id: 'c1', label: '코드 스타일', checked: false },
        { id: 'c2', label: '테스트 통과', checked: true },
      ],
      diff: {
        before: 'const a = 1;',
        after: 'const a = 2;',
      },
      ...overrides,
    },
  };
}

function makeReviewNodeProps(data: Partial<ReviewNodeData>) {
  const full: ReviewNodeData = {
    blockType: 'review',
    label: data.label ?? '리뷰',
    status: data.status ?? 'idle',
    reviewers: data.reviewers ?? [],
    checklist: data.checklist ?? [],
    checklistProgress: data.checklistProgress ?? 0,
    reviewStatus: data.reviewStatus ?? 'pending',
  };
  return {
    id: 'test-review',
    type: 'review' as const,
    data: full,
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
    height: 160,
  } as any;
}

function renderWithFlow(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// ── fetch 모킹 ──
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ success: true }),
  });
  global.fetch = fetchMock;
});

// ═══════════════════════════════════════════
// Phase 5: Review + Learning (BF-101 ~ BF-120)
// ═══════════════════════════════════════════

describe('Phase 5 — ReviewDetailPanel (BF-101 ~ BF-106)', () => {
  it('bf101_review_detail_checklist_toggle', () => {
    const node = makeReviewNode();
    render(<ReviewDetailPanel node={node as any} />);

    const item = screen.getByTestId('checklist-item-c1');
    const checkbox = item.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);

    fireEvent.click(item);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(item);
    expect(checkbox.checked).toBe(false);
  });

  it('bf102_review_detail_diff_view', () => {
    const node = makeReviewNode();
    render(<ReviewDetailPanel node={node as any} />);

    expect(screen.getByTestId('review-diff')).toBeTruthy();
    expect(screen.getByTestId('diff-before').textContent).toBe('const a = 1;');
    expect(screen.getByTestId('diff-after').textContent).toBe('const a = 2;');
    expect(screen.getByText('변경 전')).toBeTruthy();
    expect(screen.getByText('변경 후')).toBeTruthy();
  });

  it('bf103_review_detail_inline_comment', () => {
    const node = makeReviewNode();
    render(<ReviewDetailPanel node={node as any} />);

    const input = screen.getByTestId('comment-input') as HTMLInputElement;
    const addBtn = screen.getByTestId('btn-add-comment');

    fireEvent.change(input, { target: { value: '변수명 수정 필요' } });
    fireEvent.click(addBtn);

    const commentList = screen.getByTestId('comment-list');
    expect(commentList.textContent).toContain('변수명 수정 필요');
    expect(input.value).toBe('');
  });

  it('bf104_review_detail_approve_api', async () => {
    const onApprove = vi.fn();
    const node = makeReviewNode();
    render(<ReviewDetailPanel node={node as any} onApprove={onApprove} />);

    const approveBtn = screen.getByTestId('btn-approve');
    fireEvent.click(approveBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/brick/workflows/wf-1/blocks/review-1/approve',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('review-status').textContent).toContain('approved');
    });
  });

  it('bf105_review_detail_reject_with_reason', async () => {
    const onReject = vi.fn();
    const node = makeReviewNode();
    render(<ReviewDetailPanel node={node as any} onReject={onReject} />);

    // 거부 버튼 클릭 → 사유 입력 폼 노출
    fireEvent.click(screen.getByTestId('btn-reject'));
    expect(screen.getByTestId('reject-reason-form')).toBeTruthy();

    // 사유 입력 + 확인
    const textarea = screen.getByTestId('reject-reason-input');
    fireEvent.change(textarea, { target: { value: '코드 품질 미달' } });
    fireEvent.click(screen.getByTestId('btn-confirm-reject'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/brick/workflows/wf-1/blocks/review-1/reject',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reason: '코드 품질 미달' }),
        }),
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId('review-status').textContent).toContain('rejected');
    });
  });

  it('bf106_review_detail_change_request_comments', () => {
    const onRequestChanges = vi.fn();
    const node = makeReviewNode();
    render(<ReviewDetailPanel node={node as any} onRequestChanges={onRequestChanges} />);

    // 코멘트 추가
    const input = screen.getByTestId('comment-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '함수 분리 필요' } });
    fireEvent.click(screen.getByTestId('btn-add-comment'));

    fireEvent.change(input, { target: { value: '타입 추가' } });
    fireEvent.click(screen.getByTestId('btn-add-comment'));

    // 변경요청 버튼
    fireEvent.click(screen.getByTestId('btn-request-changes'));
    expect(onRequestChanges).toHaveBeenCalledWith('review-1');

    // 코멘트 목록 표시
    const commentSection = screen.getByTestId('change-request-comments');
    expect(commentSection).toBeTruthy();
    expect(commentSection.textContent).toContain('함수 분리 필요');
    expect(commentSection.textContent).toContain('타입 추가');
  });
});

describe('Phase 5 — ReviewNode 상태 전환 (BF-107 ~ BF-108)', () => {
  it('bf107_review_node_approved_green_border', () => {
    const props = makeReviewNodeProps({ reviewStatus: 'approved' });
    renderWithFlow(<ReviewNode {...props} />);

    const node = screen.getByTestId('review-node');
    expectBorderColor(node, '#10B981');
  });

  it('bf108_review_node_rejected_red_border', () => {
    const props = makeReviewNodeProps({ reviewStatus: 'rejected' });
    renderWithFlow(<ReviewNode {...props} />);

    const node = screen.getByTestId('review-node');
    expectBorderColor(node, '#EF4444');
  });
});

describe('Phase 5 — LearningHarnessPage (BF-109)', () => {
  it('bf109_learning_page_proposal_list', () => {
    const proposals = [
      { id: '12', title: 'Gate 추가 제안', confidence: 0.87, before: '', after: '', reasoning: '', status: 'pending' as const },
      { id: '11', title: '링크 최적화', confidence: 0.72, before: '', after: '', reasoning: '', status: 'pending' as const },
    ];

    render(<LearningHarnessPage proposals={proposals} />);

    expect(screen.getByText('학습 하네스')).toBeTruthy();
    expect(screen.getAllByTestId('proposal-item')).toHaveLength(2);
    expect(screen.getByText(/#12 Gate 추가 제안/)).toBeTruthy();
    expect(screen.getByText(/신뢰도 0.87/)).toBeTruthy();
    expect(screen.getByText(/#11 링크 최적화/)).toBeTruthy();
    expect(screen.getByText(/신뢰도 0.72/)).toBeTruthy();
  });
});

describe('Phase 5 — ProposalDetail (BF-110 ~ BF-111)', () => {
  it('bf110_proposal_detail_diff_display', () => {
    render(
      <ProposalDetail
        before="기존 게이트 3개"
        after="게이트 4개 (보안 게이트 추가)"
        reasoning="보안 강화"
      />,
    );

    expect(screen.getByText('변경 전:')).toBeTruthy();
    expect(screen.getByTestId('diff-before').textContent).toBe('기존 게이트 3개');
    expect(screen.getByText('변경 후:')).toBeTruthy();
    expect(screen.getByTestId('diff-after').textContent).toBe('게이트 4개 (보안 게이트 추가)');
  });

  it('bf111_proposal_detail_reasoning', () => {
    render(
      <ProposalDetail
        before="이전 값"
        after="이후 값"
        reasoning="성능 향상을 위한 최적화입니다."
      />,
    );

    expect(screen.getByText('근거:')).toBeTruthy();
    expect(screen.getByTestId('proposal-reasoning').textContent).toBe(
      '성능 향상을 위한 최적화입니다.',
    );
  });
});

describe('Phase 5 — ApproveRejectForm (BF-112 ~ BF-113)', () => {
  it('bf112_approve_form_with_comment', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(<ApproveRejectForm onApprove={onApprove} onReject={onReject} />);

    const commentInput = screen.getByTestId('approve-comment');
    fireEvent.change(commentInput, { target: { value: '잘 작성되었습니다' } });

    fireEvent.click(screen.getByTestId('btn-approve'));
    expect(onApprove).toHaveBeenCalledWith('잘 작성되었습니다');
  });

  it('bf113_reject_form_with_reason', () => {
    const onApprove = vi.fn();
    const onReject = vi.fn();

    render(<ApproveRejectForm onApprove={onApprove} onReject={onReject} />);

    const reasonInput = screen.getByTestId('reject-reason');
    fireEvent.change(reasonInput, { target: { value: '보안 이슈 있음' } });

    fireEvent.click(screen.getByTestId('btn-reject'));
    expect(onReject).toHaveBeenCalledWith('보안 이슈 있음');
  });
});

describe('Phase 5 — Learning Hooks (BF-114 ~ BF-116)', () => {
  it('bf114_use_learning_proposals_fetch', async () => {
    const mockProposals = [
      { id: '1', title: '제안 A', confidence: 0.9, before: '', after: '', reasoning: '', status: 'pending' },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockProposals),
    });

    // 동적 import로 모듈 검증
    const { useLearningProposals } = await import('../../src/hooks/brick/useLearning');
    const qc = createQueryClient();

    function TestComp() {
      const { data, isSuccess } = useLearningProposals();
      return (
        <div>
          <span data-testid="status">{isSuccess ? 'loaded' : 'loading'}</span>
          <span data-testid="count">{data?.length ?? 0}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComp />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('loaded');
    });
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(fetchMock).toHaveBeenCalledWith('/api/brick/learning/proposals');
  });

  it('bf115_use_approve_proposal_mutation', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { useApproveProposal } = await import('../../src/hooks/brick/useLearning');
    const qc = createQueryClient();

    function TestComp() {
      const { mutate, isSuccess } = useApproveProposal();
      return (
        <div>
          <button data-testid="approve" onClick={() => mutate({ id: 'p1', comment: '좋습니다' })} />
          <span data-testid="result">{isSuccess ? 'done' : 'idle'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComp />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('approve'));

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('done');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/brick/learning/p1/approve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ comment: '좋습니다' }),
      }),
    );
  });

  it('bf116_use_reject_proposal_mutation', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { useRejectProposal } = await import('../../src/hooks/brick/useLearning');
    const qc = createQueryClient();

    function TestComp() {
      const { mutate, isSuccess } = useRejectProposal();
      return (
        <div>
          <button data-testid="reject" onClick={() => mutate({ id: 'p2', reason: '부적절' })} />
          <span data-testid="result">{isSuccess ? 'done' : 'idle'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComp />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('reject'));

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('done');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/brick/learning/p2/reject',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: '부적절' }),
      }),
    );
  });
});

describe('Phase 5 — Gate Hooks (BF-117 ~ BF-118)', () => {
  it('bf117_use_gate_result_fetch', async () => {
    const mockGate = { id: 'g1', name: '보안 게이트', passed: true, details: '통과' };
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockGate),
    });

    const { useGateResult } = await import('../../src/hooks/brick/useGates');
    const qc = createQueryClient();

    function TestComp() {
      const { data, isSuccess } = useGateResult('g1');
      return (
        <div>
          <span data-testid="status">{isSuccess ? 'loaded' : 'loading'}</span>
          <span data-testid="name">{data?.name ?? ''}</span>
          <span data-testid="passed">{data?.passed ? 'yes' : 'no'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComp />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('loaded');
    });
    expect(screen.getByTestId('name').textContent).toBe('보안 게이트');
    expect(fetchMock).toHaveBeenCalledWith('/api/brick/gates/g1/result');
  });

  it('bf118_use_override_gate_mutation', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: true }),
    });

    const { useOverrideGate } = await import('../../src/hooks/brick/useGates');
    const qc = createQueryClient();

    function TestComp() {
      const { mutate, isSuccess } = useOverrideGate();
      return (
        <div>
          <button data-testid="override" onClick={() => mutate({ gateId: 'g1', override: true })} />
          <span data-testid="result">{isSuccess ? 'done' : 'idle'}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComp />
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByTestId('override'));

    await waitFor(() => {
      expect(screen.getByTestId('result').textContent).toBe('done');
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/brick/gates/g1/override',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ override: true }),
      }),
    );
  });
});

describe('Phase 5 — System Hooks (BF-119)', () => {
  it('bf119_use_invariants_fetch', async () => {
    const mockInvariants = [
      { id: 'inv1', name: '데이터 무결성', description: '모든 참조 유효', status: 'ok' },
    ];
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockInvariants),
    });

    const { useInvariants } = await import('../../src/hooks/brick/useSystem');
    const qc = createQueryClient();

    function TestComp() {
      const { data, isSuccess } = useInvariants();
      return (
        <div>
          <span data-testid="status">{isSuccess ? 'loaded' : 'loading'}</span>
          <span data-testid="count">{data?.length ?? 0}</span>
          <span data-testid="name">{data?.[0]?.name ?? ''}</span>
        </div>
      );
    }

    render(
      <QueryClientProvider client={qc}>
        <TestComp />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('loaded');
    });
    expect(screen.getByTestId('count').textContent).toBe('1');
    expect(screen.getByTestId('name').textContent).toBe('데이터 무결성');
    expect(fetchMock).toHaveBeenCalledWith('/api/brick/system/invariants');
  });
});

describe('Phase 5 — BrickOverviewPage (BF-120)', () => {
  it('bf120_overview_workflow_list_with_badges', () => {
    const workflows = [
      { id: 'wf1', name: 'CI/CD 파이프라인', description: '배포 자동화', status: 'running' as const, lastRunAt: '2026-04-03 10:00' },
      { id: 'wf2', name: '코드 리뷰 플로우', description: '리뷰 자동화', status: 'done' as const, lastRunAt: '2026-04-02 15:30' },
      { id: 'wf3', name: '모니터링', description: '상태 감시', status: 'failed' as const },
    ];

    render(<BrickOverviewPage workflows={workflows} />);

    expect(screen.getByText('Brick 워크플로우')).toBeTruthy();
    expect(screen.getByTestId('btn-new-workflow')).toBeTruthy();

    const items = screen.getAllByTestId('workflow-item');
    expect(items).toHaveLength(3);

    expect(screen.getByText('CI/CD 파이프라인')).toBeTruthy();
    expect(screen.getByText('배포 자동화')).toBeTruthy();

    const badges = screen.getAllByTestId('status-badge');
    expect(badges[0].textContent).toBe('실행중');
    expect(badges[1].textContent).toBe('완료');
    expect(badges[2].textContent).toBe('실패');
  });
});
