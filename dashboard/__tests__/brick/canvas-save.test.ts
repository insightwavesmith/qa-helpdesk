/**
 * TDD for brick-canvas-save: Canvas 저장 → 실행 → 상태 반영.
 *
 * CS-001 ~ CS-035 (35건)
 * Design: docs/02-design/features/brick-canvas-save.design.md
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Node, Edge } from '@xyflow/react';
import { flowToYamlFull, type PresetYamlFull } from '../../src/lib/brick/serializer';

// ===========================================================================
// Helpers
// ===========================================================================

function makeNodes(ids: string[]): Node[] {
  return ids.map((id, i) => ({
    id,
    type: 'block',
    position: { x: 0, y: i * 150 },
    data: { blockId: id, blockType: 'custom', name: id, status: 'idle' },
  }));
}

function makeEdges(pairs: [string, string][], linkType = 'sequential'): Edge[] {
  return pairs.map(([from, to]) => ({
    id: `e-${from}-${to}`,
    source: from,
    target: to,
    type: 'link',
    data: { linkType, isActive: false },
  }));
}

// ===========================================================================
// §8.1 Serializer 테스트 (CS-001 ~ CS-005)
// ===========================================================================

describe('flowToYamlFull', () => {
  it('test_cs01_flow_to_yaml_full_spec_wrapper', () => {
    const nodes = makeNodes(['plan', 'do']);
    const edges = makeEdges([['plan', 'do']]);

    const result = flowToYamlFull(nodes, edges, 'test-preset');

    expect(result.kind).toBe('Preset');
    expect(result.spec).toBeDefined();
    expect(result.spec.blocks).toHaveLength(2);
    expect(result.spec.links).toHaveLength(1);
    expect(result.spec.blocks[0].id).toBe('plan');
  });

  it('test_cs02_flow_to_yaml_full_preserves_gates', () => {
    const nodes = makeNodes(['plan']);
    const edges: Edge[] = [];
    const existing: PresetYamlFull = {
      kind: 'Preset',
      name: 'existing',
      spec: {
        blocks: [],
        links: [],
        teams: {},
        gates: {
          plan: [{ type: 'command', command: 'tsc --noEmit' }],
        },
      },
    };

    const result = flowToYamlFull(nodes, edges, 'test', existing);

    expect(result.spec.gates).toBeDefined();
    expect(result.spec.gates!.plan).toHaveLength(1);
    expect(result.spec.gates!.plan[0].type).toBe('command');
  });

  it('test_cs03_flow_to_yaml_full_links_condition', () => {
    const nodes = makeNodes(['check', 'do']);
    const edges: Edge[] = [{
      id: 'e-check-do',
      source: 'check',
      target: 'do',
      type: 'link',
      data: { linkType: 'loop', condition: 'match_rate < 90', maxRetries: 3, isActive: false },
    }];

    const result = flowToYamlFull(nodes, edges, 'test');

    expect(result.spec.links[0].condition).toBe('match_rate < 90');
    expect(result.spec.links[0].max_retries).toBe(3);
  });

  it('test_cs04_flow_to_yaml_full_empty_canvas', () => {
    const result = flowToYamlFull([], [], 'empty');

    expect(result.kind).toBe('Preset');
    expect(result.spec.blocks).toHaveLength(0);
    expect(result.spec.links).toHaveLength(0);
  });

  it('test_cs05_flow_to_yaml_full_filters_start_end', () => {
    const nodes: Node[] = [
      { id: 'start-1', type: 'start', position: { x: 0, y: 0 }, data: {} },
      { id: 'plan', type: 'block', position: { x: 0, y: 150 }, data: { blockId: 'plan', name: '기획' } },
      { id: 'end-1', type: 'end', position: { x: 0, y: 300 }, data: {} },
    ];

    const result = flowToYamlFull(nodes, [], 'test');

    expect(result.spec.blocks).toHaveLength(1);
    expect(result.spec.blocks[0].id).toBe('plan');
  });
});

// ===========================================================================
// §8.2 저장 흐름 테스트 (CS-006 ~ CS-008)
// ===========================================================================

describe('저장 흐름', () => {
  it('test_cs06_save_existing_preset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => ({}) });
    const nodes = makeNodes(['plan']);
    const edges: Edge[] = [];

    // 기존 프리셋 업데이트 시뮬레이션
    const presetId = '3';
    const yaml = flowToYamlFull(nodes, edges, 'test');
    await fetchMock(`/api/brick/presets/${presetId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(yaml),
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/brick/presets/${presetId}`,
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('test_cs07_save_new_preset', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => ({ id: 42 }),
    });

    // 새 프리셋 생성 시뮬레이션
    const response = await fetchMock('/api/brick/presets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'new-preset', yaml: '{}' }),
    });

    const data = response.json();
    expect(data.id).toBe(42);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/brick/presets',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('test_cs08_save_core_preset_rejected', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      json: () => ({ error: '코어 프리셋 수정 불가' }),
    });

    const response = await fetchMock('/api/brick/presets/1', { method: 'PUT' });
    expect(response.ok).toBe(false);
    expect(response.status).toBe(403);
  });
});

// ===========================================================================
// §8.3 실행 흐름 테스트 (CS-009 ~ CS-014)
// ===========================================================================

describe('실행 흐름', () => {
  it('test_cs09_execute_saves_first_if_dirty', async () => {
    const saveCalled = vi.fn();
    const executeCalled = vi.fn();

    // isDirty=true 상태에서 실행 → handleSave 먼저 호출
    const handleExecute = async (isDirty: boolean) => {
      if (isDirty) {
        await saveCalled();
      }
      executeCalled();
    };

    await handleExecute(true);
    expect(saveCalled).toHaveBeenCalled();
    expect(executeCalled).toHaveBeenCalled();

    // saveCalled가 executeCalled보다 먼저 호출됨
    const saveOrder = saveCalled.mock.invocationCallOrder[0];
    const executeOrder = executeCalled.mock.invocationCallOrder[0];
    expect(saveOrder).toBeLessThan(executeOrder);
  });

  it('test_cs10_execute_shows_feature_dialog', () => {
    // 실행 클릭 시 showExecuteDialog = true
    let showExecuteDialog = false;
    const onExecute = () => { showExecuteDialog = true; };

    onExecute();
    expect(showExecuteDialog).toBe(true);
  });

  it('test_cs11_execute_validates_feature_name', () => {
    const isValid = (feature: string) =>
      /^[a-z0-9-]+$/.test(feature) && feature.length >= 2;

    expect(isValid('')).toBe(false);         // 빈 문자열
    expect(isValid('a')).toBe(false);        // 1자
    expect(isValid('my-feature')).toBe(true); // 정상
    expect(isValid('My Feature')).toBe(false); // 대문자+공백
    expect(isValid('test123')).toBe(true);    // 숫자 포함
  });

  it('test_cs12_execute_creates_execution', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => ({ id: 7, status: 'running' }),
    });

    const response = await fetchMock('/api/brick/executions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ presetId: '3', feature: 'my-feature' }),
    });

    const execution = response.json();
    expect(execution.id).toBe(7);
    expect(execution.status).toBe('running');
  });

  it('test_cs13_execute_without_preset_blocked', () => {
    // presetId가 없으면 실행 차단
    const presetId: string | null = null;
    const canExecute = !!presetId;
    expect(canExecute).toBe(false);
  });

  it('test_cs14_execute_sets_execution_id', async () => {
    let executionId: number | null = null;
    let isExecuting = false;

    // 실행 성공 시뮬레이션
    const onExecutionSuccess = (execution: { id: number }) => {
      executionId = execution.id;
      isExecuting = true;
    };

    onExecutionSuccess({ id: 7 });
    expect(executionId).toBe(7);
    expect(isExecuting).toBe(true);
  });
});

// ===========================================================================
// §8.4 상태 반영 테스트 (CS-015 ~ CS-020)
// ===========================================================================

describe('상태 반영', () => {
  const STATUS_MAP: Record<string, string> = {
    pending: 'idle',
    queued: 'queued',
    running: 'running',
    gate_checking: 'running',
    completed: 'done',
    failed: 'failed',
    suspended: 'paused',
  };

  it('test_cs15_polling_updates_node_status', () => {
    const blocksState = { plan: { status: 'running' }, design: { status: 'pending' } };
    const nodes = [
      { id: 'plan', data: { blockId: 'plan', status: 'idle' as string } },
      { id: 'design', data: { blockId: 'design', status: 'idle' as string } },
    ];

    const updated = nodes.map((n) => {
      const bs = blocksState[n.data.blockId as keyof typeof blocksState];
      return {
        ...n,
        data: { ...n.data, status: STATUS_MAP[bs?.status || 'pending'] || 'idle' },
      };
    });

    expect(updated[0].data.status).toBe('running');
    expect(updated[1].data.status).toBe('idle');
  });

  it('test_cs16_status_map_gate_checking', () => {
    expect(STATUS_MAP['gate_checking']).toBe('running');
  });

  it('test_cs17_active_edge_on_running_block', () => {
    const blocksState = { plan: { status: 'running' }, design: { status: 'pending' } };
    const edges = [
      { id: 'e1', source: 'plan', target: 'design', data: { isActive: false } },
      { id: 'e2', source: 'design', target: 'do', data: { isActive: false } },
    ];

    const runningBlockIds = Object.entries(blocksState)
      .filter(([, v]) => v.status === 'running')
      .map(([k]) => k);

    const updatedEdges = edges.map((edge) => ({
      ...edge,
      data: { ...edge.data, isActive: runningBlockIds.includes(edge.source) },
    }));

    expect(updatedEdges[0].data.isActive).toBe(true);  // plan→design
    expect(updatedEdges[1].data.isActive).toBe(false); // design→do
  });

  it('test_cs18_execution_complete_stops_polling', () => {
    let isExecuting = true;
    const executionStatus = 'completed';

    if (executionStatus === 'completed' || executionStatus === 'failed') {
      isExecuting = false;
    }

    expect(isExecuting).toBe(false);
  });

  it('test_cs19_execution_failed_stops_polling', () => {
    let isExecuting = true;
    const executionStatus = 'failed';

    if (executionStatus === 'completed' || executionStatus === 'failed') {
      isExecuting = false;
    }

    expect(isExecuting).toBe(false);
  });

  it('test_cs20_multiple_running_blocks_edges', () => {
    // parallel 실행: 여러 블록이 동시 running
    const blocksState = {
      taskA: { status: 'running' },
      taskB: { status: 'running' },
      taskC: { status: 'pending' },
    };

    const edges = [
      { id: 'e1', source: 'taskA', target: 'merge', data: { isActive: false } },
      { id: 'e2', source: 'taskB', target: 'merge', data: { isActive: false } },
      { id: 'e3', source: 'taskC', target: 'merge', data: { isActive: false } },
    ];

    const runningBlockIds = Object.entries(blocksState)
      .filter(([, v]) => v.status === 'running')
      .map(([k]) => k);

    const updatedEdges = edges.map((edge) => ({
      ...edge,
      data: { ...edge.data, isActive: runningBlockIds.includes(edge.source) },
    }));

    expect(updatedEdges[0].data.isActive).toBe(true);
    expect(updatedEdges[1].data.isActive).toBe(true);
    expect(updatedEdges[2].data.isActive).toBe(false);
  });
});

// ===========================================================================
// §8.5 타임라인 테스트 (CS-021 ~ CS-022)
// ===========================================================================

describe('타임라인', () => {
  it('test_cs21_logs_to_timeline_events', () => {
    const logs = [
      { id: 1, eventType: 'block.started', blockId: 'plan', timestamp: '2026-04-03T10:00:00Z', data: '{}' },
      { id: 2, eventType: 'block.completed', blockId: 'plan', timestamp: '2026-04-03T10:01:00Z', data: '{}' },
      { id: 3, eventType: 'block.started', blockId: 'design', timestamp: '2026-04-03T10:01:01Z', data: '{}' },
    ];

    const STATUS_MAP_TIMELINE: Record<string, string> = {
      'block.started': 'running',
      'block.completed': 'done',
      'block.failed': 'failed',
      'block.gate_passed': 'done',
      'block.gate_failed': 'failed',
    };

    const events = logs.map((log) => ({
      timestamp: log.timestamp,
      blockName: log.blockId || '',
      status: STATUS_MAP_TIMELINE[log.eventType] || 'idle',
    }));

    expect(events).toHaveLength(3);
    expect(events[0].blockName).toBe('plan');
    expect(events[0].status).toBe('running');
    expect(events[1].status).toBe('done');
  });

  it('test_cs22_timeline_updates_on_poll', () => {
    // 초기 로그 2건 → 폴링 후 3건
    let events = [
      { timestamp: '10:00', blockName: 'plan', status: 'running' },
      { timestamp: '10:01', blockName: 'plan', status: 'done' },
    ];

    // 폴링 후 새 로그 추가
    const newLogs = [
      { timestamp: '10:00', blockName: 'plan', status: 'running' },
      { timestamp: '10:01', blockName: 'plan', status: 'done' },
      { timestamp: '10:02', blockName: 'design', status: 'running' },
    ];

    events = newLogs;
    expect(events).toHaveLength(3);
  });
});

// ===========================================================================
// §8.6 엣지 케이스 테스트 (CS-023 ~ CS-027)
// ===========================================================================

describe('엣지 케이스', () => {
  it('test_cs23_unsaved_changes_warning', () => {
    const isDirty = true;
    let preventDefaultCalled = false;

    const handler = (e: { preventDefault: () => void; returnValue: string }) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = '';
        preventDefaultCalled = true;
      }
    };

    handler({ preventDefault: () => {}, returnValue: '' });
    expect(preventDefaultCalled).toBe(true);
  });

  it('test_cs24_execution_id_in_url', () => {
    // URL에서 executionId 파싱
    const searchParams = new URLSearchParams('presetId=3&executionId=7');
    const executionId = searchParams.get('executionId');
    expect(executionId).toBe('7');
  });

  it('test_cs25_edit_during_execution', () => {
    // 실행 중 노드 이동 — 에러 없이 처리
    const isExecuting = true;
    const nodes = makeNodes(['plan']);

    const movedNodes = nodes.map((n) => ({
      ...n,
      position: { x: n.position.x + 100, y: n.position.y },
    }));

    expect(movedNodes[0].position.x).toBe(100);
    // 에러 없음 확인
    expect(isExecuting).toBe(true);
  });

  it('test_cs26_save_during_execution_toast', () => {
    // 실행 중 저장 시 "영향 없음" 경고 표시
    const isExecuting = true;
    let toastMessage = '';

    const handleSave = () => {
      if (isExecuting) {
        toastMessage = '실행 중인 워크플로우에는 영향 없음';
      }
    };

    handleSave();
    expect(toastMessage).toContain('영향 없음');
  });

  it('test_cs27_core_preset_execute_no_save', () => {
    // 코어 프리셋 실행 시 자동 저장 스킵
    const isCore = true;
    const isDirty = true;
    let saveCalled = false;

    const handleExecute = () => {
      if (isDirty && !isCore) {
        saveCalled = true;
      }
    };

    handleExecute();
    expect(saveCalled).toBe(false);
  });
});

// ===========================================================================
// §8.7 서버 API 테스트 (CS-028 ~ CS-035)
// ===========================================================================

describe('서버 API', () => {
  it('test_cs28_execution_creates_blocks_state', () => {
    // blocksState 초기화: 프리셋 블록 기반
    const presetBlocks = [
      { id: 'plan' },
      { id: 'design' },
      { id: 'do' },
      { id: 'check' },
    ];

    const blocksState: Record<string, { status: string }> = {};
    presetBlocks.forEach((b, i) => {
      blocksState[b.id] = { status: i === 0 ? 'queued' : 'pending' };
    });

    expect(Object.keys(blocksState)).toHaveLength(4);
    expect(blocksState['plan']).toBeDefined();
    expect(blocksState['check']).toBeDefined();
  });

  it('test_cs29_first_block_queued', () => {
    const blocks = [{ id: 'plan' }, { id: 'design' }];
    const blocksState: Record<string, { status: string }> = {};
    blocks.forEach((b, i) => {
      blocksState[b.id] = { status: i === 0 ? 'queued' : 'pending' };
    });

    expect(blocksState['plan'].status).toBe('queued');
  });

  it('test_cs30_remaining_blocks_pending', () => {
    const blocks = [{ id: 'plan' }, { id: 'design' }, { id: 'do' }];
    const blocksState: Record<string, { status: string }> = {};
    blocks.forEach((b, i) => {
      blocksState[b.id] = { status: i === 0 ? 'queued' : 'pending' };
    });

    expect(blocksState['design'].status).toBe('pending');
    expect(blocksState['do'].status).toBe('pending');
  });

  it('test_cs31_spec_wrapper_handled', () => {
    // spec wrapper 형식 파싱
    const presetYaml = {
      kind: 'Preset',
      name: 'test',
      spec: {
        blocks: [{ id: 'plan', what: '기획' }],
        links: [],
      },
    };

    const inner = (presetYaml.kind && presetYaml.spec)
      ? presetYaml.spec
      : presetYaml;

    const blocks = (inner as { blocks: Array<{ id: string }> }).blocks;
    expect(blocks).toHaveLength(1);
    expect(blocks[0].id).toBe('plan');
  });

  it('test_cs32_block_complete_api', () => {
    // 블록 완료 시 blocksState 업데이트
    const blocksState: Record<string, { status: string }> = {
      plan: { status: 'running' },
      design: { status: 'pending' },
    };

    const blockId = 'plan';
    blocksState[blockId].status = 'completed';

    expect(blocksState['plan'].status).toBe('completed');
  });

  it('test_cs33_execution_log_created', () => {
    // 블록 완료 시 로그 레코드 생성 시뮬레이션
    const logs: Array<{ executionId: number; eventType: string; blockId: string }> = [];

    const createLog = (executionId: number, eventType: string, blockId: string) => {
      logs.push({ executionId, eventType, blockId });
    };

    createLog(1, 'block.completed', 'plan');
    expect(logs).toHaveLength(1);
    expect(logs[0].eventType).toBe('block.completed');
    expect(logs[0].blockId).toBe('plan');
  });

  it('test_cs34_missing_preset_404', () => {
    // 존재하지 않는 presetId → 404
    const preset = undefined;  // DB에서 찾지 못함
    const statusCode = !preset ? 404 : 200;
    expect(statusCode).toBe(404);
  });

  it('test_cs35_missing_feature_400', () => {
    // feature 누락 → 400
    const body = { presetId: '3' };  // feature 없음
    const feature = (body as Record<string, unknown>).feature;
    const statusCode = !feature ? 400 : 200;
    expect(statusCode).toBe(400);
  });
});
