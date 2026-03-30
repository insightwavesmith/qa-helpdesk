import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDb, cleanDb } from '../setup';
import * as schema from '../../server/db/schema';
import { eq, and } from 'drizzle-orm';
import { CostService } from '../../server/services/costs';
import { BudgetService } from '../../server/services/budgets';
import { eventBus } from '../../server/event-bus';

let costSvc: CostService;
let budgetSvc: BudgetService;

// 헬퍼: 에이전트 생성
function createAgent(id: string, name: string) {
  testDb.insert(schema.agents).values({
    id,
    name,
    role: 'developer',
    status: 'running',
  }).run();
}

// 헬퍼: 예산 정책 생성
function createPolicy(overrides: Partial<typeof schema.budgetPolicies.$inferInsert> = {}) {
  return testDb.insert(schema.budgetPolicies).values({
    id: overrides.id ?? `pol-${Math.random().toString(36).slice(2, 8)}`,
    scopeType: 'global',
    scopeId: null,
    amountCents: 10000,
    warnPercent: 80,
    hardStop: 1,
    windowKind: 'monthly',
    active: 1,
    ...overrides,
  }).returning().get();
}

beforeEach(() => {
  budgetSvc = new BudgetService(testDb);
  costSvc = new CostService(testDb, budgetSvc);
});

describe('CostService + BudgetService', () => {
  // TC-$01: 비용 이벤트 기록 — cost_events INSERT 확인
  it('TC-$01: 비용 이벤트 기록 → cost_events INSERT', async () => {
    createAgent('agent-1', 'backend-dev');

    const event = await costSvc.recordCost({
      agentId: 'agent-1',
      model: 'claude-opus-4-6',
      inputTokens: 1000,
      outputTokens: 500,
      costCents: 150,
    });

    expect(event.id).toBeDefined();
    expect(event.agentId).toBe('agent-1');
    expect(event.costCents).toBe(150);

    const rows = testDb.select().from(schema.costEvents).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].model).toBe('claude-opus-4-6');
  });

  // TC-$02: 에이전트별 집계 — SUM 정확
  it('TC-$02: 에이전트별 비용 집계', async () => {
    createAgent('agent-1', 'backend-dev');
    createAgent('agent-2', 'frontend-dev');

    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 100 });
    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 200, outputTokens: 100, costCents: 200 });
    await costSvc.recordCost({ agentId: 'agent-2', model: 'sonnet', inputTokens: 50, outputTokens: 25, costCents: 50 });

    const result = await costSvc.getCostByAgent();
    expect(result).toHaveLength(2);

    const agent1 = result.find(r => r.agentId === 'agent-1');
    expect(agent1!.totalCents).toBe(300);

    const agent2 = result.find(r => r.agentId === 'agent-2');
    expect(agent2!.totalCents).toBe(50);
  });

  // TC-$03: 모델별 집계 — GROUP BY model 정확
  it('TC-$03: 모델별 비용 집계', async () => {
    createAgent('agent-1', 'backend-dev');

    await costSvc.recordCost({ agentId: 'agent-1', model: 'claude-opus-4-6', inputTokens: 100, outputTokens: 50, costCents: 200 });
    await costSvc.recordCost({ agentId: 'agent-1', model: 'claude-opus-4-6', inputTokens: 100, outputTokens: 50, costCents: 300 });
    await costSvc.recordCost({ agentId: 'agent-1', model: 'claude-sonnet-4-6', inputTokens: 100, outputTokens: 50, costCents: 50 });

    const result = await costSvc.getCostByModel();
    expect(result).toHaveLength(2);

    const opus = result.find(r => r.model === 'claude-opus-4-6');
    expect(opus!.totalCents).toBe(500);

    const sonnet = result.find(r => r.model === 'claude-sonnet-4-6');
    expect(sonnet!.totalCents).toBe(50);
  });

  // TC-$04: 윈도우별 지출 (일/주/월) — 기간 필터 정확
  it('TC-$04: 윈도우별 지출 조회', async () => {
    createAgent('agent-1', 'backend-dev');

    // 오늘 비용
    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 100 });
    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 200 });

    const daily = await costSvc.getWindowSpend('daily');
    expect(daily).toBe(300);

    const weekly = await costSvc.getWindowSpend('weekly');
    expect(weekly).toBe(300);

    const monthly = await costSvc.getWindowSpend('monthly');
    expect(monthly).toBe(300);
  });

  // TC-$05: 예산 80% → warn 이벤트 (P8)
  it('TC-$05: 예산 80% 초과 → budget.warn 이벤트', async () => {
    createAgent('agent-1', 'backend-dev');
    createPolicy({
      id: 'pol-1',
      scopeType: 'global',
      amountCents: 1000, // $10
      warnPercent: 80,   // $8에서 warn
      hardStop: 0,
    });

    const handler = vi.fn();
    eventBus.subscribe('budget.warn', handler);

    // 850센트 = 85% → warn 트리거
    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 850 });

    expect(handler).toHaveBeenCalled();

    eventBus.unsubscribe('budget.warn', handler);
  });

  // TC-$06: 예산 100% + hard_stop → 에이전트 정지 (P8)
  it('TC-$06: 예산 100% + hard_stop=1 → 에이전트 정지', async () => {
    createAgent('agent-1', 'backend-dev');
    createPolicy({
      id: 'pol-agent',
      scopeType: 'agent',
      scopeId: 'agent-1',
      amountCents: 500,
      warnPercent: 80,
      hardStop: 1,
    });

    const handler = vi.fn();
    eventBus.subscribe('budget.hard_stop', handler);

    // 600센트 > 500 → hard_stop
    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 600 });

    expect(handler).toHaveBeenCalled();

    // 에이전트 상태 확인
    const agent = testDb.select().from(schema.agents).where(eq(schema.agents.id, 'agent-1')).get();
    expect(agent!.status).toBe('paused');
    expect(agent!.pauseReason).toBe('budget');

    eventBus.unsubscribe('budget.hard_stop', handler);
  });

  // TC-$07: 예산 100% + hard_stop=0 → 경고만 (에이전트 정지 안 함)
  it('TC-$07: 예산 100% + hard_stop=0 → 경고만', async () => {
    createAgent('agent-1', 'backend-dev');
    createPolicy({
      id: 'pol-soft',
      scopeType: 'agent',
      scopeId: 'agent-1',
      amountCents: 500,
      warnPercent: 80,
      hardStop: 0, // hard_stop 비활성
    });

    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 600 });

    // 에이전트가 여전히 running
    const agent = testDb.select().from(schema.agents).where(eq(schema.agents.id, 'agent-1')).get();
    expect(agent!.status).toBe('running');
  });

  // TC-$08: budget_incidents 기록
  it('TC-$08: 예산 초과 시 budget_incidents 기록', async () => {
    createAgent('agent-1', 'backend-dev');
    createPolicy({
      id: 'pol-inc',
      scopeType: 'global',
      amountCents: 1000,
      warnPercent: 80,
      hardStop: 1,
    });

    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 850 });

    const incidents = testDb.select().from(schema.budgetIncidents).all();
    expect(incidents.length).toBeGreaterThanOrEqual(1);
    expect(incidents[0].kind).toBe('warn');
    expect(incidents[0].policyId).toBe('pol-inc');
  });

  // TC-$09: incident 해결 — resolved=1
  it('TC-$09: incident 해결 → resolved=1', async () => {
    createAgent('agent-1', 'backend-dev');
    const policy = createPolicy({
      id: 'pol-resolve',
      scopeType: 'global',
      amountCents: 1000,
      warnPercent: 80,
      hardStop: 1,
    });

    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 850 });

    const incidents = testDb.select().from(schema.budgetIncidents).all();
    expect(incidents).toHaveLength(1);

    await budgetSvc.resolveIncident(incidents[0].id);

    const resolved = testDb.select().from(schema.budgetIncidents)
      .where(eq(schema.budgetIncidents.id, incidents[0].id)).get();
    expect(resolved!.resolved).toBe(1);
    expect(resolved!.resolvedAt).toBeDefined();
  });

  // TC-$10: 글로벌+에이전트 정책 중복 적용
  it('TC-$10: 글로벌+에이전트 정책 중복 적용', async () => {
    createAgent('agent-1', 'backend-dev');

    // 글로벌: 2000센트, 에이전트: 500센트
    createPolicy({ id: 'pol-global', scopeType: 'global', amountCents: 2000, warnPercent: 80, hardStop: 1 });
    createPolicy({ id: 'pol-agent', scopeType: 'agent', scopeId: 'agent-1', amountCents: 500, warnPercent: 80, hardStop: 1 });

    const hardStopHandler = vi.fn();
    eventBus.subscribe('budget.hard_stop', hardStopHandler);

    // 600센트 → 에이전트 정책 초과(500), 글로벌은 아직 여유
    await costSvc.recordCost({ agentId: 'agent-1', model: 'opus', inputTokens: 100, outputTokens: 50, costCents: 600 });

    // 에이전트 정책에 의해 hard_stop 발생
    expect(hardStopHandler).toHaveBeenCalled();

    // 에이전트 paused
    const agent = testDb.select().from(schema.agents).where(eq(schema.agents.id, 'agent-1')).get();
    expect(agent!.status).toBe('paused');

    // 글로벌에도 warn incident 기록 (80% = 1600, 실제 600 < 1600이므로 warn 없음)
    // 에이전트 정책의 incident만 기록
    const incidents = testDb.select().from(schema.budgetIncidents).all();
    const agentIncidents = incidents.filter(i => i.policyId === 'pol-agent');
    expect(agentIncidents.length).toBeGreaterThanOrEqual(1);

    eventBus.unsubscribe('budget.hard_stop', hardStopHandler);
  });
});
