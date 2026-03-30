import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { testDb } from './setup';
import * as schema from '../server/db/schema';

describe('DB 스키마', () => {
  it('13개 테이블이 모두 생성됨', () => {
    const result = testDb.all<{ name: string }>(
      sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
    );
    const tableNames = result.map((r: any) => r.name).sort();
    expect(tableNames).toEqual([
      'agents',
      'budget_incidents',
      'budget_policies',
      'cost_events',
      'events',
      'heartbeat_runs',
      'knowledge_entries',
      'notifications',
      'pdca_features',
      'routines',
      'tickets',
      'workflow_chains',
      'workflow_steps',
    ]);
  });

  it('agents 테이블에 데이터 삽입/조회', () => {
    testDb.insert(schema.agents).values({
      id: 'test-agent-1',
      name: 'test-agent',
      displayName: '테스트 에이전트',
      role: 'developer',
      team: 'cto',
    }).run();

    const result = testDb.select().from(schema.agents).all();
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('test-agent');
    expect(result[0].displayName).toBe('테스트 에이전트');
    expect(result[0].status).toBe('idle');
  });

  it('tickets 테이블에 데이터 삽입/조회', () => {
    testDb.insert(schema.tickets).values({
      id: 'test-ticket-1',
      feature: 'test-feature',
      title: '테스트 티켓',
      status: 'todo',
    }).run();

    const result = testDb.select().from(schema.tickets).all();
    expect(result).toHaveLength(1);
    expect(result[0].feature).toBe('test-feature');
    expect(result[0].status).toBe('todo');
    expect(result[0].checklist).toBe('[]');
  });

  it('workflow_chains + workflow_steps FK 관계', () => {
    testDb.insert(schema.workflowChains).values({
      id: 'chain-1',
      name: '테스트 체인',
    }).run();

    testDb.insert(schema.workflowSteps).values({
      id: 'step-1',
      chainId: 'chain-1',
      stepOrder: 1,
      teamRole: 'cto',
      phase: 'do',
      label: '구현',
    }).run();

    const steps = testDb.select().from(schema.workflowSteps).all();
    expect(steps).toHaveLength(1);
    expect(steps[0].chainId).toBe('chain-1');
  });

  it('events 테이블 AUTOINCREMENT 동작', () => {
    testDb.insert(schema.events).values({
      eventType: 'ticket.created',
      actor: 'test',
    }).run();

    testDb.insert(schema.events).values({
      eventType: 'ticket.completed',
      actor: 'test',
    }).run();

    const result = testDb.select().from(schema.events).all();
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(1);
    expect(result[1].id).toBe(2);
  });

  it('notifications 테이블 기본값', () => {
    testDb.insert(schema.events).values({
      eventType: 'system.error',
      actor: 'system',
    }).run();

    const eventResult = testDb.select().from(schema.events).all();

    testDb.insert(schema.notifications).values({
      type: 'error',
      title: '테스트 알림',
      message: '오류 발생',
      sourceEventId: eventResult[0].id,
    }).run();

    const result = testDb.select().from(schema.notifications).all();
    expect(result).toHaveLength(1);
    expect(result[0].read).toBe(0);
    expect(result[0].sourceEventId).toBe(eventResult[0].id);
  });

  it('pdca_features 테이블 기본값', () => {
    testDb.insert(schema.pdcaFeatures).values({
      id: 'test-feature',
      displayName: '테스트 피처',
    }).run();

    const result = testDb.select().from(schema.pdcaFeatures).all();
    expect(result).toHaveLength(1);
    expect(result[0].phase).toBe('planning');
    expect(result[0].processLevel).toBe('L2');
    expect(result[0].automationLevel).toBe(2);
  });

  it('cost_events 불변 추가', () => {
    testDb.insert(schema.agents).values({
      id: 'cost-agent',
      name: 'cost-test-agent',
      role: 'developer',
    }).run();

    testDb.insert(schema.costEvents).values({
      id: 'cost-1',
      agentId: 'cost-agent',
      model: 'claude-opus-4-6',
      costCents: 150,
    }).run();

    const result = testDb.select().from(schema.costEvents).all();
    expect(result).toHaveLength(1);
    expect(result[0].costCents).toBe(150);
    expect(result[0].provider).toBe('anthropic');
  });

  it('budget_policies + budget_incidents FK 관계', () => {
    testDb.insert(schema.budgetPolicies).values({
      id: 'policy-1',
      scopeType: 'global',
      amountCents: 100000,
    }).run();

    testDb.insert(schema.budgetIncidents).values({
      id: 'incident-1',
      policyId: 'policy-1',
      kind: 'warn',
      amountAtTrigger: 80000,
      thresholdAmount: 80000,
    }).run();

    const result = testDb.select().from(schema.budgetIncidents).all();
    expect(result).toHaveLength(1);
    expect(result[0].resolved).toBe(0);
  });

  it('routines 테이블 기본값', () => {
    testDb.insert(schema.routines).values({
      id: 'routine-1',
      name: 'daily-collect',
      cronExpression: '0 2 * * *',
      command: 'bash scripts/collect-daily.sh',
    }).run();

    const result = testDb.select().from(schema.routines).all();
    expect(result).toHaveLength(1);
    expect(result[0].enabled).toBe(1);
    expect(result[0].lastRunStatus).toBeNull();
  });

  it('knowledge_entries 테이블 + agents FK', () => {
    testDb.insert(schema.agents).values({
      id: 'knowledge-agent',
      name: 'knowledge-test-agent',
      role: 'developer',
    }).run();

    testDb.insert(schema.knowledgeEntries).values({
      id: 'knowledge-1',
      agentId: 'knowledge-agent',
      category: 'pattern',
      title: 'Drizzle 인덱스 패턴',
      content: '객체 반환 방식 사용',
    }).run();

    const result = testDb.select().from(schema.knowledgeEntries).all();
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('pattern');
    expect(result[0].tags).toBe('[]');
  });
});
