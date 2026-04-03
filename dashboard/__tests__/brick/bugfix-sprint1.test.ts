// dashboard/__tests__/brick/bugfix-sprint1.test.ts — Brick Bugfix Sprint 1 TDD
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDb } from '../setup.js';
import { eq, and } from 'drizzle-orm';
import {
  brickProjects,
  brickInvariants,
  brickInvariantHistory,
  brickExecutions,
  brickApprovals,
  brickGateResults,
  brickLinks,
  brickPresets,
  brickExecutionLogs,
} from '../../server/db/schema/brick.js';
import { randomUUID } from 'node:crypto';

// ── Brick 테이블 클린 ──
function cleanBrickTables() {
  // FK 순서 주의
  testDb.delete(brickInvariantHistory).run();
  testDb.delete(brickInvariants).run();
  testDb.delete(brickGateResults).run();
  testDb.delete(brickApprovals).run();
  testDb.delete(brickExecutionLogs).run();
  testDb.delete(brickExecutions).run();
  testDb.delete(brickLinks).run();
  testDb.delete(brickPresets).run();
  testDb.delete(brickProjects).run();
}

// ── mock req/res ──
function mockReq(params: Record<string, string> = {}, body: Record<string, unknown> = {}, query: Record<string, string> = {}): any {
  return { params, body, query };
}
function mockRes(): any {
  const res: any = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  res.end = vi.fn().mockReturnValue(res);
  return res;
}

// ── EngineBridge mock ──
vi.mock('../../server/brick/engine/bridge.js', () => ({
  EngineBridge: vi.fn().mockImplementation(() => ({
    completeBlock: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        blocks_state: { 'block-1': { status: 'completed' }, 'block-2': { status: 'running' } },
        next_blocks: ['block-2'],
        context: {},
      },
    }),
    resumeWorkflow: vi.fn().mockResolvedValue({ ok: true }),
    cancelWorkflow: vi.fn().mockResolvedValue({ ok: true }),
  })),
}));

// ── Route register 함수 import ──
import { registerApprovalRoutes } from '../../server/routes/brick/approvals.js';
import { registerWorkflowRoutes } from '../../server/routes/brick/workflows.js';
import { registerProjectRoutes } from '../../server/routes/brick/projects.js';
import { registerReviewRoutes } from '../../server/routes/brick/review.js';
import { registerLinkRoutes } from '../../server/routes/brick/links.js';
import { registerPresetRoutes } from '../../server/routes/brick/presets.js';

// ── Express app mock: 라우트 핸들러 캡처 ──
type HandlerFn = (req: any, res: any) => any;
interface CapturedRoutes {
  [method: string]: { [path: string]: HandlerFn };
}

function createMockApp(): { app: any; routes: CapturedRoutes } {
  const routes: CapturedRoutes = { get: {}, post: {}, put: {}, delete: {} };
  const app: any = {};
  for (const method of ['get', 'post', 'put', 'delete'] as const) {
    app[method] = (path: string, handler: HandlerFn) => {
      routes[method][path] = handler;
    };
  }
  return { app, routes };
}

// ── 헬퍼: 프로젝트 + 불변식 시드 ──
function seedProject(id = 'test-proj', name = 'Test Project') {
  testDb.insert(brickProjects).values({
    id, name,
    infrastructure: '{}', config: '{}', active: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();
  return id;
}

function seedInvariant(projectId: string, invId: string, status = 'active') {
  testDb.insert(brickInvariants).values({
    id: invId,
    projectId,
    designSource: 'test',
    description: `Invariant ${invId}`,
    constraintType: 'rule',
    constraintValue: '{}',
    status,
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();
}

function seedInvariantHistory(projectId: string, invariantId: string) {
  testDb.insert(brickInvariantHistory).values({
    invariantId,
    projectId,
    version: 1,
    previousValue: null,
    newValue: '{}',
    changeReason: 'init',
    changedBy: 'test',
    createdAt: new Date().toISOString(),
  }).run();
}

function seedPreset(name = 'test-preset') {
  return testDb.insert(brickPresets).values({
    name, displayName: name, yaml: 'blocks: []',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).returning().get();
}

function seedExecution(opts: { presetId?: number; feature?: string; status?: string; projectId?: string | null; engineWorkflowId?: string | null; currentBlock?: string | null } = {}) {
  return testDb.insert(brickExecutions).values({
    presetId: opts.presetId ?? null,
    feature: opts.feature ?? 'test-feature',
    status: opts.status ?? 'pending',
    projectId: opts.projectId ?? null,
    engineWorkflowId: opts.engineWorkflowId ?? null,
    currentBlock: opts.currentBlock ?? null,
    createdAt: new Date().toISOString(),
  }).returning().get();
}

function seedApproval(executionId: number) {
  const id = randomUUID();
  testDb.insert(brickApprovals).values({
    id,
    executionId,
    blockId: 'approval-block',
    approver: 'ceo',
    status: 'waiting',
    timeoutAt: new Date(Date.now() + 86400000).toISOString(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }).run();
  return id;
}

// ══════════════════════════════════════════════
// BUG-5: approvals.ts — CEO 승인 → engine 연동
// ══════════════════════════════════════════════
describe('BUG-5: approvals engine bridge', () => {
  let routes: CapturedRoutes;

  beforeEach(() => {
    cleanBrickTables();
    const mock = createMockApp();
    routes = mock.routes;
    registerApprovalRoutes(mock.app, testDb);
  });

  it('test_bf18_approve_triggers_engine', async () => {
    const exec = seedExecution({ engineWorkflowId: 'wf-123', currentBlock: 'block-1', status: 'running' });
    seedApproval(exec.id);
    const req = mockReq({ executionId: String(exec.id) }, { approver: 'smith', comment: 'ok' });
    const res = mockRes();
    await routes.post['/api/brick/approve/:executionId'](req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    // execution 상태 업데이트 확인
    const updated = testDb.select().from(brickExecutions).where(eq(brickExecutions.id, exec.id)).get();
    expect(updated?.status).not.toBe('pending');
  });

  it('test_bf19_reject_triggers_engine', async () => {
    const exec = seedExecution({ engineWorkflowId: 'wf-456', currentBlock: 'block-1', status: 'running' });
    seedApproval(exec.id);
    const req = mockReq({ executionId: String(exec.id) }, { approver: 'smith', reason: 'not ready' });
    const res = mockRes();
    await routes.post['/api/brick/reject/:executionId'](req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'rejected' }));
  });

  it('test_bf20_approve_no_engine_id', async () => {
    // engineWorkflowId가 없는 execution — DB만 업데이트
    const exec = seedExecution({ status: 'running' });
    seedApproval(exec.id);
    const req = mockReq({ executionId: String(exec.id) }, { approver: 'smith' });
    const res = mockRes();
    await routes.post['/api/brick/approve/:executionId'](req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
  });

  it('test_bf21_approve_not_found', async () => {
    const req = mockReq({ executionId: '99999' }, { approver: 'smith' });
    const res = mockRes();
    await routes.post['/api/brick/approve/:executionId'](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ══════════════════════════════════════════════
// BUG-6: workflows.ts — resume/cancel 상태 가드
// ══════════════════════════════════════════════
describe('BUG-6: workflows status guard + bridge', () => {
  let routes: CapturedRoutes;

  beforeEach(() => {
    cleanBrickTables();
    const mock = createMockApp();
    routes = mock.routes;
    registerWorkflowRoutes(mock.app, testDb);
  });

  it('test_bf22_resume_paused', async () => {
    const exec = seedExecution({ status: 'paused' });
    const req = mockReq({ workflowId: String(exec.id) });
    const res = mockRes();
    await routes.post['/api/brick/workflows/:workflowId/resume'](req, res);
    expect(res.json).toHaveBeenCalled();
    const updated = testDb.select().from(brickExecutions).where(eq(brickExecutions.id, exec.id)).get();
    expect(updated?.status).toBe('running');
  });

  it('test_bf23_resume_completed_blocked', async () => {
    const exec = seedExecution({ status: 'completed' });
    const req = mockReq({ workflowId: String(exec.id) });
    const res = mockRes();
    await routes.post['/api/brick/workflows/:workflowId/resume'](req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('test_bf24_cancel_running', async () => {
    const exec = seedExecution({ status: 'running' });
    const req = mockReq({ workflowId: String(exec.id) });
    const res = mockRes();
    await routes.post['/api/brick/workflows/:workflowId/cancel'](req, res);
    expect(res.json).toHaveBeenCalled();
    const updated = testDb.select().from(brickExecutions).where(eq(brickExecutions.id, exec.id)).get();
    expect(updated?.status).toBe('cancelled');
  });

  it('test_bf25_cancel_completed_blocked', async () => {
    const exec = seedExecution({ status: 'completed' });
    const req = mockReq({ workflowId: String(exec.id) });
    const res = mockRes();
    await routes.post['/api/brick/workflows/:workflowId/cancel'](req, res);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('test_bf26_resume_bridge_called', async () => {
    const exec = seedExecution({ status: 'paused', engineWorkflowId: 'wf-bridge-test' });
    const req = mockReq({ workflowId: String(exec.id) });
    const res = mockRes();
    await routes.post['/api/brick/workflows/:workflowId/resume'](req, res);
    // bridge.resumeWorkflow should have been called — execution should be running
    const updated = testDb.select().from(brickExecutions).where(eq(brickExecutions.id, exec.id)).get();
    expect(updated?.status).toBe('running');
  });
});

// ══════════════════════════════════════════════
// BUG-1: DELETE /projects/:id 트랜잭션
// ══════════════════════════════════════════════
describe('BUG-1: DELETE /projects/:id', () => {
  let routes: CapturedRoutes;

  beforeEach(() => {
    cleanBrickTables();
    const mock = createMockApp();
    routes = mock.routes;
    registerProjectRoutes(mock.app, testDb);
  });

  it('test_bf31_delete_project_success', () => {
    seedProject('proj-del');
    const req = mockReq({ id: 'proj-del' });
    const res = mockRes();
    routes.delete['/api/brick/projects/:id'](req, res);
    expect(res.status).toHaveBeenCalledWith(204);
    const found = testDb.select().from(brickProjects).where(eq(brickProjects.id, 'proj-del')).get();
    expect(found).toBeUndefined();
  });

  it('test_bf32_delete_project_not_found', () => {
    const req = mockReq({ id: 'nonexistent' });
    const res = mockRes();
    routes.delete['/api/brick/projects/:id'](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('test_bf33_delete_cascades_invariants', () => {
    seedProject('proj-cascade');
    seedInvariant('proj-cascade', 'INV-1');
    seedInvariant('proj-cascade', 'INV-2');
    seedInvariantHistory('proj-cascade', 'INV-1');
    const req = mockReq({ id: 'proj-cascade' });
    const res = mockRes();
    routes.delete['/api/brick/projects/:id'](req, res);
    expect(res.status).toHaveBeenCalledWith(204);
    const invs = testDb.select().from(brickInvariants).where(eq(brickInvariants.projectId, 'proj-cascade')).all();
    expect(invs).toHaveLength(0);
    const hist = testDb.select().from(brickInvariantHistory).where(eq(brickInvariantHistory.projectId, 'proj-cascade')).all();
    expect(hist).toHaveLength(0);
  });

  it('test_bf34_delete_preserves_executions', () => {
    seedProject('proj-exec');
    const exec = seedExecution({ projectId: 'proj-exec' });
    const req = mockReq({ id: 'proj-exec' });
    const res = mockRes();
    routes.delete['/api/brick/projects/:id'](req, res);
    expect(res.status).toHaveBeenCalledWith(204);
    const updated = testDb.select().from(brickExecutions).where(eq(brickExecutions.id, exec.id)).get();
    expect(updated).toBeDefined();
    expect(updated?.projectId).toBeNull();
  });
});

// ══════════════════════════════════════════════
// BUG-2: presets.ts — js-yaml → yaml
// ══════════════════════════════════════════════
describe('BUG-2: yaml import', () => {
  let routes: CapturedRoutes;

  beforeEach(() => {
    cleanBrickTables();
    const mock = createMockApp();
    routes = mock.routes;
    registerPresetRoutes(mock.app, testDb);
  });

  it('test_bf35_import_yaml_preset', () => {
    const yamlContent = `name: test-imported\ndisplayName: Test\ndescription: A test preset\n`;
    const req = mockReq({}, { yaml: yamlContent });
    const res = mockRes();
    routes.post['/api/brick/presets/import'](req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('test_bf36_import_json_still_works', () => {
    const jsonContent = JSON.stringify({ name: 'json-preset', displayName: 'JSON' });
    const req = mockReq({}, { yaml: jsonContent });
    const res = mockRes();
    routes.post['/api/brick/presets/import'](req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });
});

// ══════════════════════════════════════════════
// BUG-3: review.ts — FK → 404
// ══════════════════════════════════════════════
describe('BUG-3: review FK check', () => {
  let routes: CapturedRoutes;

  beforeEach(() => {
    cleanBrickTables();
    const mock = createMockApp();
    routes = mock.routes;
    registerReviewRoutes(mock.app, testDb);
  });

  it('test_bf37_review_approve_invalid_exec', () => {
    const req = mockReq({ executionId: '99999', blockId: 'block-1' }, { reviewer: 'smith' });
    const res = mockRes();
    routes.post['/api/brick/review/:executionId/:blockId/approve'](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('test_bf38_review_reject_invalid_exec', () => {
    const req = mockReq({ executionId: '99999', blockId: 'block-1' }, { rejectReason: 'bad', reviewer: 'smith' });
    const res = mockRes();
    routes.post['/api/brick/review/:executionId/:blockId/reject'](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ══════════════════════════════════════════════
// BUG-4: GET /projects/:id/invariants
// ══════════════════════════════════════════════
describe('BUG-4: GET /projects/:id/invariants', () => {
  let routes: CapturedRoutes;

  beforeEach(() => {
    cleanBrickTables();
    const mock = createMockApp();
    routes = mock.routes;
    registerProjectRoutes(mock.app, testDb);
  });

  it('test_bf39_get_project_invariants', () => {
    seedProject('bscamp');
    for (let i = 1; i <= 3; i++) {
      seedInvariant('bscamp', `INV-${i}`);
    }
    const req = mockReq({ id: 'bscamp' }, {}, {});
    const res = mockRes();
    routes.get['/api/brick/projects/:id/invariants'](req, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      invariants: expect.arrayContaining([
        expect.objectContaining({ id: 'INV-1' }),
      ]),
    }));
    const callArg = res.json.mock.calls[0][0];
    expect(callArg.invariants).toHaveLength(3);
  });

  it('test_bf40_project_invariants_not_found', () => {
    const req = mockReq({ id: 'nonexistent' });
    const res = mockRes();
    routes.get['/api/brick/projects/:id/invariants'](req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ══════════════════════════════════════════════
// BUG-7: links.ts — linkType 검증 + loop cycle 면제
// ══════════════════════════════════════════════
describe('BUG-7: linkType validation + loop cycle exemption', () => {
  let routes: CapturedRoutes;
  let preset: any;

  beforeEach(() => {
    cleanBrickTables();
    preset = seedPreset('link-test-preset');
    const mock = createMockApp();
    routes = mock.routes;
    registerLinkRoutes(mock.app, testDb);
  });

  it('test_bf41_create_link_invalid_type', () => {
    const req = mockReq({}, {
      workflowId: preset.id,
      fromBlock: 'A',
      toBlock: 'B',
      linkType: 'foo',
    });
    const res = mockRes();
    routes.post['/api/brick/links'](req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('test_bf42_create_link_valid_type', () => {
    const req = mockReq({}, {
      workflowId: preset.id,
      fromBlock: 'A',
      toBlock: 'B',
      linkType: 'branch',
    });
    const res = mockRes();
    routes.post['/api/brick/links'](req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('test_bf44_loop_link_allowed', () => {
    // 먼저 sequential A→B
    testDb.insert(brickLinks).values({
      workflowId: preset.id,
      fromBlock: 'A',
      toBlock: 'B',
      linkType: 'sequential',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    // loop B→A (역방향) — 허용되어야 함
    const req = mockReq({}, {
      workflowId: preset.id,
      fromBlock: 'B',
      toBlock: 'A',
      linkType: 'loop',
    });
    const res = mockRes();
    routes.post['/api/brick/links'](req, res);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('test_bf45_sequential_cycle_blocked', () => {
    // sequential A→B
    testDb.insert(brickLinks).values({
      workflowId: preset.id,
      fromBlock: 'A',
      toBlock: 'B',
      linkType: 'sequential',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).run();
    // sequential B→A — 순환 차단
    const req = mockReq({}, {
      workflowId: preset.id,
      fromBlock: 'B',
      toBlock: 'A',
      linkType: 'sequential',
    });
    const res = mockRes();
    routes.post['/api/brick/links'](req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});
