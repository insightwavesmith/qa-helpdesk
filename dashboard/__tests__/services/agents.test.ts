import { describe, it, expect, beforeEach } from 'vitest';
import { testDb } from '../setup';
import * as schema from '../../server/db/schema';
import { eq } from 'drizzle-orm';
import { AgentService } from '../../server/services/agents';

let svc: AgentService;

beforeEach(() => {
  svc = new AgentService(testDb);
});

describe('AgentService', () => {
  // TC-A01: 에이전트 등록
  it('TC-A01: 에이전트 등록', async () => {
    const agent = await svc.register({
      name: 'test-agent',
      displayName: '테스트 에이전트',
      role: 'developer',
      team: 'cto',
    });

    expect(agent.id).toBeDefined();
    expect(agent.name).toBe('test-agent');
    expect(agent.status).toBe('idle');

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'agent.registered')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-A02: 상태 변경
  it('TC-A02: 상태 변경', async () => {
    const agent = await svc.register({ name: 'agent-1', role: 'developer' });
    await svc.updateStatus(agent.id, 'running');

    const updated = testDb.select().from(schema.agents)
      .where(eq(schema.agents.id, agent.id)).get()!;
    expect(updated.status).toBe('running');

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'agent.status_changed')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-A03: 5분 idle → 경고
  it('TC-A03: 5분 idle → 경고 이벤트', async () => {
    const agent = await svc.register({ name: 'idle-agent', role: 'developer' });
    const sixMinAgo = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    testDb.update(schema.agents).set({
      status: 'running',
      lastHeartbeatAt: sixMinAgo,
    }).where(eq(schema.agents.id, agent.id)).run();

    await svc.checkIdleAgents();

    const updated = testDb.select().from(schema.agents)
      .where(eq(schema.agents.id, agent.id)).get()!;
    expect(updated.idleWarningSent).toBe(1);
    expect(updated.status).toBe('running');

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'agent.idle_warning')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-A04: 15분 idle → 자동 정지
  it('TC-A04: 15분 idle → 자동 정지', async () => {
    const agent = await svc.register({ name: 'dead-agent', role: 'developer' });
    const sixteenMinAgo = new Date(Date.now() - 16 * 60 * 1000).toISOString();
    testDb.update(schema.agents).set({
      status: 'running',
      lastHeartbeatAt: sixteenMinAgo,
    }).where(eq(schema.agents.id, agent.id)).run();

    await svc.checkIdleAgents();

    const updated = testDb.select().from(schema.agents)
      .where(eq(schema.agents.id, agent.id)).get()!;
    expect(updated.status).toBe('paused');
    expect(updated.pauseReason).toContain('자동 정지');

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'agent.auto_paused')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-A05: heartbeat 갱신 → idle 초기화
  it('TC-A05: heartbeat 갱신 → idle 경고 초기화', async () => {
    const agent = await svc.register({ name: 'refresh-agent', role: 'developer' });
    testDb.update(schema.agents).set({
      status: 'running',
      idleWarningSent: 1,
      lastHeartbeatAt: new Date(Date.now() - 6 * 60 * 1000).toISOString(),
      peerId: 'peer-refresh',
    }).where(eq(schema.agents.id, agent.id)).run();

    await svc.syncFromRuntime([{ id: 'peer-refresh', pid: 9999 }]);

    const updated = testDb.select().from(schema.agents)
      .where(eq(schema.agents.id, agent.id)).get()!;
    expect(updated.idleWarningSent).toBe(0);
    expect(updated.status).toBe('running');
  });

  // TC-A06: syncFromRuntime → DB 동기화
  it('TC-A06: syncFromRuntime → DB 동기화', async () => {
    const agent = await svc.register({ name: 'sync-agent', role: 'developer' });
    testDb.update(schema.agents).set({ peerId: 'peer-1' })
      .where(eq(schema.agents.id, agent.id)).run();

    await svc.syncFromRuntime([{ id: 'peer-1', pid: 1234, tmuxPane: '%5' }]);

    const updated = testDb.select().from(schema.agents)
      .where(eq(schema.agents.id, agent.id)).get()!;
    expect(updated.pid).toBe(1234);
    expect(updated.tmuxPane).toBe('%5');
    expect(updated.status).toBe('running');
  });

  // TC-A07: Org Chart 트리 조회
  it('TC-A07: getTree — reports_to 계층 조회', async () => {
    const leader = await svc.register({
      name: 'leader',
      displayName: '리더',
      role: 'leader',
      team: 'cto',
    });
    await svc.register({
      name: 'dev-1',
      displayName: '개발자1',
      role: 'developer',
      team: 'cto',
      reportsTo: leader.id,
    });
    await svc.register({
      name: 'dev-2',
      displayName: '개발자2',
      role: 'developer',
      team: 'cto',
      reportsTo: leader.id,
    });

    const tree = await svc.getTree();
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe(leader.id);
    expect(tree[0].children).toHaveLength(2);
  });

  // TC-A08: terminated 에이전트 idle 체크 제외
  it('TC-A08: terminated 에이전트는 idle 체크 제외', async () => {
    const agent = await svc.register({ name: 'term-agent', role: 'developer' });
    testDb.update(schema.agents).set({
      status: 'terminated',
      lastHeartbeatAt: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }).where(eq(schema.agents.id, agent.id)).run();

    await svc.checkIdleAgents();

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'agent.auto_paused')).all();
    expect(evts).toHaveLength(0);
    const warns = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'agent.idle_warning')).all();
    expect(warns).toHaveLength(0);
  });
});
