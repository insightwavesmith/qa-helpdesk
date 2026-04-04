import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import React from 'react';
import type { Node, Edge } from '@xyflow/react';

// ── Imports ──
import { ThreeAxisPanel } from '../../src/components/brick/panels/ThreeAxisPanel';
import { GateConfigPanel, type GateConfig } from '../../src/components/brick/panels/GateConfigPanel';
import { ConditionBuilder } from '../../src/components/brick/panels/ConditionBuilder';
import { LinkDetailPanel } from '../../src/components/brick/panels/LinkDetailPanel';
import { DetailPanel } from '../../src/components/brick/panels/DetailPanel';

// ── 공통 픽스처 ──
const makeBlockNode = (overrides: Partial<Record<string, unknown>> = {}): Node =>
  ({
    id: 'n1',
    type: 'block',
    position: { x: 0, y: 0 },
    data: { label: '테스트블록', blockType: 'plan', status: 'pending', ...overrides },
  } as Node);

const makeReviewNode = (): Node =>
  ({
    id: 'r1',
    type: 'review',
    position: { x: 0, y: 0 },
    data: {
      label: '리뷰',
      blockType: 'review',
      status: 'pending',
      reviewers: [],
      checklist: [],
      checklistProgress: 0,
      reviewStatus: 'pending',
    },
  } as Node);

const makeEdge = (linkType: string): Edge =>
  ({
    id: 'e1',
    source: 'n1',
    target: 'n2',
    data: { linkType, condition: 'match_rate < 90', isActive: false },
  } as Edge);

// ── BD-043: ThreeAxisPanel 3탭 렌더 ──
describe('test_bd043_three_axis_panel_renders_tabs', () => {
  it('블록/팀/Gate 3개 탭이 렌더된다', () => {
    render(<ThreeAxisPanel node={makeBlockNode()} onUpdateData={vi.fn()} />);
    expect(screen.getByTestId('tab-block')).toBeInTheDocument();
    expect(screen.getByTestId('tab-team')).toBeInTheDocument();
    expect(screen.getByTestId('tab-gate')).toBeInTheDocument();
  });
});

// ── BD-044: ThreeAxisPanel Block탭 이름 필드 ──
describe('test_bd044_three_axis_block_tab_name_field', () => {
  it('Block탭에 이름 입력 필드가 있다', () => {
    render(<ThreeAxisPanel node={makeBlockNode()} onUpdateData={vi.fn()} />);
    expect(screen.getByTestId('block-name-input')).toBeInTheDocument();
  });
});

// ── BD-045: ThreeAxisPanel Team탭 셀렉터 ──
describe('test_bd045_three_axis_team_tab_selectors', () => {
  it('Team탭으로 전환 시 어댑터/모델/에이전트 셀렉터가 표시된다', () => {
    render(<ThreeAxisPanel node={makeBlockNode()} onUpdateData={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-team'));
    expect(screen.getByTestId('team-adapter-select')).toBeInTheDocument();
    expect(screen.getByTestId('team-model-select')).toBeInTheDocument();
    expect(screen.getByTestId('team-agent-select')).toBeInTheDocument();
  });
});

// ── BD-046: ThreeAxisPanel Gate탭 gate-config-panel ──
describe('test_bd046_three_axis_gate_tab_config_panel', () => {
  it('Gate탭으로 전환 시 GateConfigPanel이 렌더된다', () => {
    render(<ThreeAxisPanel node={makeBlockNode()} onUpdateData={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-gate'));
    expect(screen.getByTestId('gate-config-panel')).toBeInTheDocument();
  });
});

// ── BD-047: ThreeAxisPanel 탭 전환 ──
describe('test_bd047_three_axis_tab_switching', () => {
  it('Team탭 클릭 시 team 콘텐츠가 표시되고 block 콘텐츠는 숨겨진다', () => {
    render(<ThreeAxisPanel node={makeBlockNode()} onUpdateData={vi.fn()} />);
    fireEvent.click(screen.getByTestId('tab-team'));
    expect(screen.getByTestId('tab-content-team')).toBeInTheDocument();
    expect(screen.queryByTestId('tab-content-block')).not.toBeInTheDocument();
  });
});

// ── BD-048: ThreeAxisPanel onUpdateData 이름 변경 ──
describe('test_bd048_three_axis_update_data_on_name_change', () => {
  it('이름 입력 변경 시 onUpdateData가 올바른 인자로 호출된다', () => {
    const onUpdateData = vi.fn();
    render(<ThreeAxisPanel node={makeBlockNode({ name: '기존이름' })} onUpdateData={onUpdateData} />);
    fireEvent.change(screen.getByTestId('block-name-input'), { target: { value: '새 이름' } });
    expect(onUpdateData).toHaveBeenCalledWith('n1', { name: '새 이름' });
  });
});

// ── BD-049: GateConfigPanel 8종 게이트 체크박스 ──
describe('test_bd049_gate_config_panel_eight_types', () => {
  it('8종 게이트 타입 체크박스가 모두 렌더된다', () => {
    render(<GateConfigPanel gates={[]} />);
    const types = ['artifact', 'command', 'http', 'prompt', 'agent', 'review', 'approval', 'metric'];
    types.forEach((t) => {
      expect(screen.getByTestId(`gate-checkbox-${t}`)).toBeInTheDocument();
    });
  });
});

// ── BD-050: metric 게이트 threshold 슬라이더 ──
describe('test_bd050_metric_gate_threshold_slider', () => {
  it('metric 게이트 활성화 시 threshold 슬라이더가 표시된다', () => {
    const metricGate: GateConfig = { gateId: 'g1', type: 'metric', status: 'pending', threshold: 90 };
    render(<GateConfigPanel gates={[metricGate]} />);
    expect(screen.getByTestId('gate-threshold-slider')).toBeInTheDocument();
  });
});

// ── BD-051: approval 게이트 approver/channel 필드 ──
describe('test_bd051_approval_gate_fields', () => {
  it('approval 게이트 활성화 시 approver/channel 입력 필드가 표시된다', () => {
    const approvalGate: GateConfig = { gateId: 'g2', type: 'approval', status: 'pending' };
    render(<GateConfigPanel gates={[approvalGate]} />);
    expect(screen.getByTestId('gate-approval-approver')).toBeInTheDocument();
    expect(screen.getByTestId('gate-approval-channel')).toBeInTheDocument();
  });
});

// ── BD-052: artifact 게이트 체크박스 체크 상태 ──
describe('test_bd052_artifact_gate_checkbox_checked', () => {
  it('artifact 게이트가 gates 배열에 있으면 체크박스가 체크된다', () => {
    const artifactGate: GateConfig = { gateId: 'g3', type: 'artifact', status: 'pending' };
    render(<GateConfigPanel gates={[artifactGate]} />);
    expect(screen.getByTestId('gate-checkbox-artifact')).toBeChecked();
  });
});

// ── BD-053: 체크박스 토글로 게이트 추가 ──
describe('test_bd053_checkbox_toggle_adds_gate', () => {
  it('artifact 체크박스 클릭 시 onChange가 artifact 게이트와 함께 호출된다', () => {
    const onChange = vi.fn();
    render(<GateConfigPanel gates={[]} onChange={onChange} />);
    fireEvent.click(screen.getByTestId('gate-checkbox-artifact'));
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ type: 'artifact' })]);
  });
});

// ── BD-054: ConditionBuilder 셀렉터들 ──
describe('test_bd054_condition_builder_selectors', () => {
  it('지표/연산자/값 입력 요소가 렌더된다', () => {
    render(
      <ConditionBuilder condition="" onChange={vi.fn()} availableMetrics={['match_rate', 'coverage']} />
    );
    expect(screen.getByTestId('condition-metric-select')).toBeInTheDocument();
    expect(screen.getByTestId('condition-operator-select')).toBeInTheDocument();
    expect(screen.getByTestId('condition-value-input')).toBeInTheDocument();
  });
});

// ── BD-055: ConditionBuilder 프리뷰 문자열 ──
describe('test_bd055_condition_builder_preview', () => {
  it('condition prop 파싱 결과가 프리뷰에 표시된다', () => {
    render(
      <ConditionBuilder
        condition="match_rate < 90"
        onChange={vi.fn()}
        availableMetrics={['match_rate', 'coverage']}
      />
    );
    expect(screen.getByTestId('condition-preview')).toHaveTextContent('match_rate < 90');
  });
});

// ── BD-056: ConditionBuilder onChange 지표 변경 ──
describe('test_bd056_condition_builder_metric_change', () => {
  it('지표 변경 시 onChange가 coverage를 포함한 조건으로 호출된다', () => {
    const onChange = vi.fn();
    render(
      <ConditionBuilder
        condition="match_rate < 90"
        onChange={onChange}
        availableMetrics={['match_rate', 'coverage']}
      />
    );
    fireEvent.change(screen.getByTestId('condition-metric-select'), {
      target: { value: 'coverage' },
    });
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('coverage'));
  });
});

// ── BD-057: ConditionBuilder onChange 값 변경 ──
describe('test_bd057_condition_builder_value_change', () => {
  it('값 변경 시 onChange가 80을 포함한 조건으로 호출된다', () => {
    const onChange = vi.fn();
    render(
      <ConditionBuilder
        condition="match_rate < 90"
        onChange={onChange}
        availableMetrics={['match_rate', 'coverage']}
      />
    );
    fireEvent.change(screen.getByTestId('condition-value-input'), { target: { value: '80' } });
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('80'));
  });
});

// ── BD-058: LinkDetailPanel loop타입 ConditionBuilder 표시 ──
describe('test_bd058_link_detail_panel_loop_shows_condition_builder', () => {
  it('loop 타입 엣지일 때 ConditionBuilder가 표시된다', () => {
    render(<LinkDetailPanel edge={makeEdge('loop')} />);
    expect(screen.getByTestId('condition-builder')).toBeInTheDocument();
  });
});

// ── BD-059: LinkDetailPanel sequential타입 ConditionBuilder 없음 ──
describe('test_bd059_link_detail_panel_sequential_hides_condition_builder', () => {
  it('sequential 타입 엣지일 때 ConditionBuilder가 숨겨진다', () => {
    render(<LinkDetailPanel edge={makeEdge('sequential')} />);
    expect(screen.queryByTestId('condition-builder')).not.toBeInTheDocument();
  });
});

// ── BD-060: DetailPanel block노드 ThreeAxisPanel ──
describe('test_bd060_detail_panel_block_renders_three_axis', () => {
  it('block 노드 선택 시 ThreeAxisPanel이 렌더된다', () => {
    render(
      <DetailPanel
        nodes={[makeBlockNode()]}
        edges={[]}
        selectedNodeId="n1"
        selectedEdgeId={null}
      />
    );
    expect(screen.getByTestId('three-axis-panel')).toBeInTheDocument();
  });
});

// ── BD-061: DetailPanel review노드 ReviewDetailPanel ──
describe('test_bd061_detail_panel_review_renders_review_panel', () => {
  it('review 노드 선택 시 ReviewDetailPanel이 렌더된다', () => {
    render(
      <DetailPanel
        nodes={[makeReviewNode()]}
        edges={[]}
        selectedNodeId="r1"
        selectedEdgeId={null}
      />
    );
    expect(screen.getByTestId('review-detail-panel')).toBeInTheDocument();
  });
});

// ── BD-062: DetailPanel 선택 없음 EmptyDetailPanel ──
describe('test_bd062_detail_panel_empty_when_nothing_selected', () => {
  it('노드/엣지 선택 없을 때 EmptyDetailPanel이 렌더된다', () => {
    render(
      <DetailPanel nodes={[]} edges={[]} selectedNodeId={null} selectedEdgeId={null} />
    );
    expect(screen.getByTestId('empty-detail-panel')).toBeInTheDocument();
  });
});
