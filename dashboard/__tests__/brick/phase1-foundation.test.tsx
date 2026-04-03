import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';

// EdgeLabelRenderer를 모킹하여 포탈 없이 직접 렌더링
vi.mock('@xyflow/react', async () => {
  const actual = await vi.importActual<typeof import('@xyflow/react')>('@xyflow/react');
  return {
    ...actual,
    EdgeLabelRenderer: ({ children }: { children: React.ReactNode }) => children,
  };
});

import { BlockNode } from '../../src/components/brick/nodes/BlockNode';
import { ReviewNode } from '../../src/components/brick/nodes/ReviewNode';
import { LinkEdge } from '../../src/components/brick/edges/LinkEdge';
import {
  BLOCK_TYPES,
  BLOCK_TYPE_ICONS,
  BLOCK_TYPE_LABELS,
  STATUS_BORDER_COLORS,
  type BlockNodeData,
  type BlockStatus,
  type ReviewNodeData,
  type LinkEdgeData,
} from '../../src/components/brick/nodes/types';
import { autoLayout, NODE_WIDTH, NODE_HEIGHT, REVIEW_NODE_HEIGHT } from '../../src/lib/brick/layout';
import type { Node, Edge } from '@xyflow/react';

// ── 헬퍼: ReactFlowProvider 래퍼 ──
function renderWithFlow(ui: React.ReactElement) {
  return render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
}

// ── 헬퍼: hex→rgb 변환 (jsdom은 style에서 rgb를 반환) ──
function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// ── 헬퍼: border 색상 검증 (hex 또는 rgb 모두 허용) ──
function expectBorderColor(el: HTMLElement, hexColor: string) {
  const borderColor = el.style.borderColor;
  const expected = [hexColor.toLowerCase(), hexToRgb(hexColor)];
  expect(expected).toContain(borderColor);
}

// ── 헬퍼: 기본 NodeProps 생성 ──
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

function makeReviewProps(data: Partial<ReviewNodeData>) {
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

// ── Edge 렌더 헬퍼 ──
function renderEdge(data: LinkEdgeData) {
  const props = {
    id: 'test-edge',
    source: 'a',
    target: 'b',
    sourceX: 0,
    sourceY: 0,
    targetX: 100,
    targetY: 100,
    sourcePosition: 'bottom' as const,
    targetPosition: 'top' as const,
    data,
    selected: false,
    animated: false,
    markerStart: undefined,
    markerEnd: undefined,
    pathOptions: undefined,
    interactionWidth: 20,
    sourceHandleId: null,
    targetHandleId: null,
    deletable: true,
    selectable: true,
    label: undefined,
    labelStyle: undefined,
    labelShowBg: undefined,
    labelBgStyle: undefined,
    labelBgPadding: undefined,
    labelBgBorderRadius: undefined,
    style: undefined,
  } as any;

  return render(
    <ReactFlowProvider>
      <svg>
        <LinkEdge {...props} />
      </svg>
    </ReactFlowProvider>,
  );
}

// ═══════════════════════════════════════════
// BF-001 ~ BF-003: BlockNode
// ═══════════════════════════════════════════

describe('BlockNode', () => {
  it('bf001_blocknode_renders_all_block_types', () => {
    // 10종 블록 타입별 아이콘 + 이름 표시 확인
    for (const bt of BLOCK_TYPES) {
      const { unmount } = renderWithFlow(
        <BlockNode
          {...makeBlockProps({
            blockType: bt,
            label: BLOCK_TYPE_LABELS[bt],
            status: 'idle',
          })}
        />,
      );

      const iconEl = screen.getByTestId('block-icon');
      expect(iconEl.textContent).toBe(BLOCK_TYPE_ICONS[bt]);

      const labelEl = screen.getByTestId('block-label');
      expect(labelEl.textContent).toBe(BLOCK_TYPE_LABELS[bt]);

      unmount();
    }
  });

  it('bf002_blocknode_status_border_colors', () => {
    // 7가지 상태별 테두리 색상 변경 확인
    const statuses: BlockStatus[] = ['pending', 'queued', 'running', 'gate_checking', 'completed', 'failed', 'suspended'];

    for (const status of statuses) {
      const { unmount } = renderWithFlow(
        <BlockNode
          {...makeBlockProps({
            blockType: 'implement',
            label: '구현',
            status,
          })}
        />,
      );

      const node = screen.getByTestId('block-node');
      expectBorderColor(node, STATUS_BORDER_COLORS[status]);
      unmount();
    }
  });

  it('bf003_blocknode_running_animation', () => {
    // running 상태 시 회전 아이콘 애니메이션 클래스 확인
    renderWithFlow(
      <BlockNode
        {...makeBlockProps({
          blockType: 'implement',
          label: '구현',
          status: 'running',
        })}
      />,
    );

    const statusIcon = screen.getByTestId('status-icon');
    expect(statusIcon.className).toContain('animate-spin');
  });
});

// ═══════════════════════════════════════════
// BF-004 ~ BF-007: ReviewNode
// ═══════════════════════════════════════════

describe('ReviewNode', () => {
  it('bf004_reviewnode_purple_border', () => {
    // 보라색 테두리 #8B5CF6 확인
    renderWithFlow(
      <ReviewNode
        {...makeReviewProps({
          label: '코드 리뷰',
          status: 'idle',
          reviewers: [],
          checklist: [],
          checklistProgress: 0,
          reviewStatus: 'pending',
        })}
      />,
    );

    const node = screen.getByTestId('review-node');
    expectBorderColor(node, '#8B5CF6');
  });

  it('bf005_reviewnode_checklist_progress_bar', () => {
    // 체크리스트 진행률 바 표시 확인
    renderWithFlow(
      <ReviewNode
        {...makeReviewProps({
          checklistProgress: 75,
          reviewers: [],
          checklist: [
            { id: '1', label: '항목1', checked: true },
            { id: '2', label: '항목2', checked: true },
            { id: '3', label: '항목3', checked: true },
            { id: '4', label: '항목4', checked: false },
          ],
        })}
      />,
    );

    const progressContainer = screen.getByTestId('checklist-progress');
    expect(progressContainer).toBeTruthy();

    const progressBar = screen.getByTestId('progress-bar');
    expect(progressBar.style.width).toBe('75%');
  });

  it('bf006_reviewnode_reviewer_avatars', () => {
    // 리뷰어 아바타 표시 확인
    const reviewers = [
      { id: 'r1', name: 'Alice' },
      { id: 'r2', name: 'Bob' },
      { id: 'r3', name: 'Charlie' },
    ];

    renderWithFlow(
      <ReviewNode
        {...makeReviewProps({
          reviewers,
          checklistProgress: 50,
          checklist: [],
        })}
      />,
    );

    const avatarContainer = screen.getByTestId('reviewer-avatars');
    expect(avatarContainer).toBeTruthy();

    const avatars = screen.getAllByTestId('reviewer-avatar');
    expect(avatars).toHaveLength(3);

    // 이니셜 확인
    expect(avatars[0].textContent).toBe('A');
    expect(avatars[1].textContent).toBe('B');
    expect(avatars[2].textContent).toBe('C');
  });

  it('bf007_reviewnode_action_buttons', () => {
    // 승인/변경요청/거부 버튼 렌더링 확인
    renderWithFlow(
      <ReviewNode
        {...makeReviewProps({
          reviewers: [],
          checklist: [],
          checklistProgress: 0,
        })}
      />,
    );

    const actions = screen.getByTestId('review-actions');
    expect(actions).toBeTruthy();

    const approveBtn = screen.getByTestId('btn-approve');
    expect(approveBtn.textContent).toBe('승인');

    const changesBtn = screen.getByTestId('btn-changes-requested');
    expect(changesBtn.textContent).toBe('변경요청');

    const rejectBtn = screen.getByTestId('btn-reject');
    expect(rejectBtn.textContent).toBe('거부');
  });
});

// ═══════════════════════════════════════════
// BF-008 ~ BF-010: LinkEdge
// ═══════════════════════════════════════════

describe('LinkEdge', () => {
  it('bf008_linkedge_type_styles', () => {
    // 6종 타입별 스타일 확인
    const types: Array<{ linkType: LinkEdgeData['linkType']; color: string; dashed: boolean }> = [
      { linkType: 'sequential', color: '#6B7280', dashed: false },
      { linkType: 'parallel', color: '#3B82F6', dashed: false },
      { linkType: 'compete', color: '#F97316', dashed: true },
      { linkType: 'loop', color: '#8B5CF6', dashed: false },
      { linkType: 'cron', color: '#9CA3AF', dashed: true },
      { linkType: 'branch', color: '#10B981', dashed: false },
    ];

    for (const { linkType, color, dashed } of types) {
      const { container, unmount } = renderEdge({
        linkType,
        judge: linkType === 'compete' ? 'AI' : undefined,
        condition: linkType === 'loop' || linkType === 'branch' ? '조건' : undefined,
        cron: linkType === 'cron' ? '0 9 * * *' : undefined,
      });

      // react-flow__edge-path 클래스를 가진 path 찾기
      const edgePath = container.querySelector('.react-flow__edge-path') as SVGPathElement;
      expect(edgePath).toBeTruthy();

      // style 속성에서 stroke 확인 (getAttribute로 raw string 검사)
      const styleAttr = edgePath.getAttribute('style') ?? '';
      const rgbColor = hexToRgb(color);
      // jsdom은 style.stroke를 rgb로 변환하거나 hex 그대로 유지
      expect(
        styleAttr.includes(color.toLowerCase()) || styleAttr.includes(rgbColor),
      ).toBe(true);

      if (dashed) {
        expect(styleAttr).toContain('stroke-dasharray');
      }

      unmount();
    }
  });

  it('bf009_linkedge_labels', () => {
    // 라벨 표시: sequential=없음, parallel=∥, compete=⚔
    // sequential은 라벨 없음
    const { unmount: unmount1 } = renderEdge({
      linkType: 'sequential',
    });
    expect(document.querySelector('[data-testid="edge-label"]')).toBeNull();
    unmount1();

    // parallel은 ∥ — EdgeLabelRenderer는 body에 포탈 렌더링
    const { unmount: unmount2 } = renderEdge({ linkType: 'parallel' });
    const parallelLabel = document.querySelector('[data-testid="edge-label"]');
    expect(parallelLabel).toBeTruthy();
    expect(parallelLabel!.textContent).toBe('∥');
    unmount2();

    // compete는 ⚔ {judge}
    const { unmount: unmount3 } = renderEdge({
      linkType: 'compete',
      judge: 'AI',
    });
    const competeLabel = document.querySelector('[data-testid="edge-label"]');
    expect(competeLabel).toBeTruthy();
    expect(competeLabel!.textContent).toBe('⚔ AI');
    unmount3();
  });

  it('bf010_linkedge_active_animation', () => {
    // isActive=true 시 애니메이션 스타일 적용 확인
    const { container } = renderEdge({
      linkType: 'sequential',
      isActive: true,
    });

    const edgePath = container.querySelector('.react-flow__edge-path') as SVGPathElement;
    expect(edgePath).toBeTruthy();

    const styleAttr = edgePath.getAttribute('style') ?? '';
    // isActive 시 dash-flow 애니메이션 + strokeDasharray 적용
    expect(styleAttr).toContain('dash-flow');
    expect(styleAttr).toContain('stroke-dasharray');
  });
});

// ═══════════════════════════════════════════
// BF-011 ~ BF-013: autoLayout
// ═══════════════════════════════════════════

describe('autoLayout', () => {
  const baseNodes: Node[] = [
    { id: 'a', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'plan', label: '기획', status: 'idle' } },
    { id: 'b', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'implement', label: '구현', status: 'idle' } },
    { id: 'c', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'test', label: '테스트', status: 'idle' } },
  ];

  const baseEdges: Edge[] = [
    { id: 'e1', source: 'a', target: 'b' },
    { id: 'e2', source: 'b', target: 'c' },
  ];

  it('bf011_autolayout_tb_direction', () => {
    // TB 방향: 노드가 위→아래로 배치
    const laid = autoLayout(baseNodes, baseEdges, 'TB');

    expect(laid).toHaveLength(3);

    // TB에서 a→b→c 순서로 y 좌표가 증가해야 함
    expect(laid[0].position.y).toBeLessThan(laid[1].position.y);
    expect(laid[1].position.y).toBeLessThan(laid[2].position.y);

    // x 좌표는 거의 같아야 함 (직렬 연결)
    expect(Math.abs(laid[0].position.x - laid[1].position.x)).toBeLessThan(1);
  });

  it('bf012_autolayout_lr_direction', () => {
    // LR 방향: 노드가 왼→오른쪽으로 배치
    const laid = autoLayout(baseNodes, baseEdges, 'LR');

    expect(laid).toHaveLength(3);

    // LR에서 a→b→c 순서로 x 좌표가 증가해야 함
    expect(laid[0].position.x).toBeLessThan(laid[1].position.x);
    expect(laid[1].position.x).toBeLessThan(laid[2].position.x);

    // y 좌표는 거의 같아야 함 (직렬 연결)
    expect(Math.abs(laid[0].position.y - laid[1].position.y)).toBeLessThan(1);
  });

  it('bf013_autolayout_review_node_height', () => {
    // ReviewNode 높이 차이 반영 (160px vs 100px)
    const nodesWithReview: Node[] = [
      { id: 'a', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'plan', label: '기획', status: 'idle' } },
      { id: 'r', type: 'review', position: { x: 0, y: 0 }, data: { blockType: 'review', label: '리뷰', status: 'idle' } },
      { id: 'c', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'deploy', label: '배포', status: 'idle' } },
    ];

    const edges: Edge[] = [
      { id: 'e1', source: 'a', target: 'r' },
      { id: 'e2', source: 'r', target: 'c' },
    ];

    const laid = autoLayout(nodesWithReview, edges, 'TB');

    const reviewNode = laid.find((n) => n.id === 'r')!;
    const deployNode = laid.find((n) => n.id === 'c')!;
    const planNode = laid.find((n) => n.id === 'a')!;

    // 세 노드 순서 유지
    expect(planNode.position.y).toBeLessThan(reviewNode.position.y);
    expect(reviewNode.position.y).toBeLessThan(deployNode.position.y);

    // 모든 노드 높이가 동일한 레이아웃과 비교
    const allSameHeight = autoLayout(
      [
        { id: 'a', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'plan', label: '기획', status: 'idle' } },
        { id: 'b', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'implement', label: '구현', status: 'idle' } },
        { id: 'c', type: 'block', position: { x: 0, y: 0 }, data: { blockType: 'deploy', label: '배포', status: 'idle' } },
      ],
      edges,
      'TB',
    );

    const totalHeightWithReview = deployNode.position.y - planNode.position.y;
    const totalHeightAllSame = allSameHeight[2].position.y - allSameHeight[0].position.y;

    // review 노드(160px)가 있는 레이아웃이 모든 100px 노드 레이아웃보다 높아야 함
    expect(totalHeightWithReview).toBeGreaterThan(totalHeightAllSame);
  });
});
