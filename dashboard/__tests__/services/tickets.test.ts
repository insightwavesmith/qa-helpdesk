import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDb, cleanDb } from '../setup';
import * as schema from '../../server/db/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

// TicketService는 testDb를 주입받도록 구현
import { TicketService } from '../../server/services/tickets';
import { eventBus } from '../../server/event-bus';

let svc: TicketService;

beforeEach(() => {
  svc = new TicketService(testDb);
});

describe('TicketService', () => {
  // TC-T01: ticket 생성 시 events에 ticket.created 기록
  it('TC-T01: 생성 시 ticket.created 이벤트 기록', async () => {
    const ticket = await svc.create({
      feature: 'test-feature',
      title: '테스트 티켓',
    });

    expect(ticket.id).toBeDefined();
    expect(ticket.feature).toBe('test-feature');
    expect(ticket.status).toBe('backlog');

    const events = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'ticket.created')).all();
    expect(events).toHaveLength(1);
    expect(events[0].targetId).toBe(ticket.id);
  });

  // TC-T02: 상태 변경 시 events에 ticket.status_changed 기록
  it('TC-T02: 상태 변경 시 ticket.status_changed 이벤트', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.changeStatus(ticket.id, 'in_progress');

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'ticket.status_changed')).all();
    expect(evts).toHaveLength(1);

    const payload = JSON.parse(evts[0].payload!);
    expect(payload.from).toBe('backlog');
    expect(payload.to).toBe('in_progress');
  });

  // TC-T03: completed 전환 시 completed_at 자동 설정
  it('TC-T03: completed 전환 시 completed_at 설정', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.changeStatus(ticket.id, 'completed');

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get();
    expect(updated!.completedAt).toBeDefined();
    expect(updated!.status).toBe('completed');
  });

  // TC-T04: 체크리스트 전부 완료 → 자동 completed (P1, P3)
  it('TC-T04: 체크리스트 전부 완료 → 자동 completed', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.changeStatus(ticket.id, 'in_progress');

    await svc.updateChecklist(ticket.id, [
      { id: 'c1', text: 'tsc 통과', done: true },
      { id: 'c2', text: 'build 성공', done: true },
    ]);

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get();
    expect(updated!.status).toBe('completed');
    expect(updated!.completedAt).toBeDefined();
  });

  // TC-T05: 체크리스트 일부만 완료 → completed 안 됨
  it('TC-T05: 체크리스트 일부 완료 → completed 아님', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.changeStatus(ticket.id, 'in_progress');

    await svc.updateChecklist(ticket.id, [
      { id: 'c1', text: 'tsc 통과', done: true },
      { id: 'c2', text: 'build 성공', done: false },
    ]);

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get();
    expect(updated!.status).toBe('in_progress');
  });

  // TC-T06: 빈 체크리스트 → completed 안 됨
  it('TC-T06: 빈 체크리스트 → completed 아님', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.changeStatus(ticket.id, 'in_progress');

    await svc.updateChecklist(ticket.id, []);

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get();
    expect(updated!.status).toBe('in_progress');
  });

  // TC-T07: recordCommit → commit_hash 저장 (P2, P6)
  it('TC-T07: recordCommit → commit_hash 저장', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.recordCommit(ticket.id, 'abc123', 5);

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get();
    expect(updated!.commitHash).toBe('abc123');
    expect(updated!.changedFiles).toBe(5);

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'ticket.commit_recorded')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-T08: verifyPush → push_verified=1 (P6)
  it('TC-T08: verifyPush → push_verified=1', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.verifyPush(ticket.id);

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get();
    expect(updated!.pushVerified).toBe(1);

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'ticket.push_verified')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-T09: completed 이벤트 → eventBus emit 확인 (P1)
  it('TC-T09: completed → eventBus emit', async () => {
    const handler = vi.fn();
    eventBus.subscribe('ticket.completed', handler);

    const ticket = await svc.create({
      feature: 'f1', title: 't1',
      chainStepId: 'step-1',
    });
    await svc.changeStatus(ticket.id, 'completed');

    expect(handler).toHaveBeenCalled();

    eventBus.unsubscribe('ticket.completed', handler);
  });

  // TC-T10: 같은 feature 여러 ticket 지원
  it('TC-T10: 같은 feature 여러 ticket', async () => {
    await svc.create({ feature: 'shared-feature', title: '티켓 1' });
    await svc.create({ feature: 'shared-feature', title: '티켓 2' });
    await svc.create({ feature: 'shared-feature', title: '티켓 3' });

    const list = await svc.list({ feature: 'shared-feature' });
    expect(list).toHaveLength(3);
  });

  // TC-T11: findStaleTickets: 커밋 있는데 미완료 (P1)
  it('TC-T11: findStaleTickets — 커밋 있는데 미완료', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });
    await svc.changeStatus(ticket.id, 'in_progress');
    await svc.recordCommit(ticket.id, 'abc123', 3);

    const stale = await svc.findStaleTickets();
    expect(stale.length).toBeGreaterThanOrEqual(1);
    expect(stale.some(t => t.id === ticket.id)).toBe(true);
  });

  // TC-T12: ticket 필터 (팀별, 상태별, feature별)
  it('TC-T12: ticket 필터링', async () => {
    await svc.create({ feature: 'f1', title: 't1', assigneeTeam: 'cto' });
    await svc.create({ feature: 'f2', title: 't2', assigneeTeam: 'pm' });
    await svc.create({ feature: 'f1', title: 't3', assigneeTeam: 'cto' });

    const ctoTickets = await svc.list({ team: 'cto' });
    expect(ctoTickets).toHaveLength(2);

    const f1Tickets = await svc.list({ feature: 'f1' });
    expect(f1Tickets).toHaveLength(2);
  });

  // TC-T13: ticket 체크리스트 JSON 유효성
  it('TC-T13: 체크리스트 JSON 유효성', async () => {
    const ticket = await svc.create({ feature: 'f1', title: 't1' });

    const raw = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get();
    const parsed = JSON.parse(raw!.checklist!);
    expect(Array.isArray(parsed)).toBe(true);
  });

  // TC-T14: ticket 목록 정렬 (최신순)
  it('TC-T14: 목록 정렬 — 최신 먼저', async () => {
    const t1 = await svc.create({ feature: 'f1', title: '첫 번째' });
    const t2 = await svc.create({ feature: 'f1', title: '두 번째' });

    const list = await svc.list({ feature: 'f1' });
    // 최신순이므로 t2가 먼저
    expect(list[0].id).toBe(t2.id);
    expect(list[1].id).toBe(t1.id);
  });
});
