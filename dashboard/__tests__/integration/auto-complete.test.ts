// P1+P3 E2E: 체크리스트→완료→webhook
// 체크리스트 자동 완료 + 커밋/push + HookBridge 동기화 통합 테스트
import { describe, it, expect } from 'vitest';
import { testDb } from '../setup.js';
import { TicketService } from '../../server/services/tickets.js';
import { ChainService } from '../../server/services/chains.js';
import { HookBridgeService } from '../../server/services/hook-bridge.js';
import { NotificationService } from '../../server/services/notifications.js';
import { events, tickets, notifications, pdcaFeatures } from '../../server/db/schema.js';
import { eq } from 'drizzle-orm';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('E2E: 체크리스트→완료→HookBridge', () => {
  it('체크리스트 전부 완료 시 티켓 자동 completed + 이벤트 + 알림 생성', async () => {
    const ticketSvc = new TicketService(testDb);
    const chainSvc = new ChainService(testDb, ticketSvc);
    const outputDir = join(tmpdir(), `hook-test-${Date.now()}`);
    mkdirSync(outputDir, { recursive: true });
    const hookBridge = new HookBridgeService(testDb, ticketSvc, chainSvc, outputDir);
    // NotificationService: eventBus 리스너 등록
    const _notifSvc = new NotificationService(testDb);

    // ── 1. 티켓 생성 (체크리스트 3항목) ──
    const checklist = [
      { id: 'item-1', text: '설계 문서 작성', done: false },
      { id: 'item-2', text: '코드 구현', done: false },
      { id: 'item-3', text: '테스트 작성', done: false },
    ];
    const ticket = await ticketSvc.create({
      feature: 'auto-complete-test',
      title: '자동 완료 테스트 태스크',
      checklist,
    });
    expect(ticket.status).toBe('backlog');

    // 진행 시작
    await ticketSvc.changeStatus(ticket.id, 'in_progress');

    // ── 2. 체크리스트 항목 하나씩 완료 ──
    // 첫 번째
    await ticketSvc.updateChecklist(ticket.id, [
      { id: 'item-1', text: '설계 문서 작성', done: true },
      { id: 'item-2', text: '코드 구현', done: false },
      { id: 'item-3', text: '테스트 작성', done: false },
    ]);
    let t = testDb.select().from(tickets).where(eq(tickets.id, ticket.id)).get();
    expect(t?.status).toBe('in_progress'); // 아직 미완료

    // 두 번째
    await ticketSvc.updateChecklist(ticket.id, [
      { id: 'item-1', text: '설계 문서 작성', done: true },
      { id: 'item-2', text: '코드 구현', done: true },
      { id: 'item-3', text: '테스트 작성', done: false },
    ]);
    t = testDb.select().from(tickets).where(eq(tickets.id, ticket.id)).get();
    expect(t?.status).toBe('in_progress'); // 아직 미완료

    // ── 3. 세 번째 완료 → 자동 completed (P1/P3) ──
    await ticketSvc.updateChecklist(ticket.id, [
      { id: 'item-1', text: '설계 문서 작성', done: true },
      { id: 'item-2', text: '코드 구현', done: true },
      { id: 'item-3', text: '테스트 작성', done: true },
    ]);
    t = testDb.select().from(tickets).where(eq(tickets.id, ticket.id)).get();
    expect(t?.status).toBe('completed');
    expect(t?.completedAt).toBeTruthy();

    // ── 4. 커밋 해시 기록 (P2) ──
    await ticketSvc.recordCommit(ticket.id, 'deadbeef', 7);
    t = testDb.select().from(tickets).where(eq(tickets.id, ticket.id)).get();
    expect(t?.commitHash).toBe('deadbeef');
    expect(t?.changedFiles).toBe(7);

    // ── 5. push 확인 (P6) ──
    await ticketSvc.verifyPush(ticket.id);
    t = testDb.select().from(tickets).where(eq(tickets.id, ticket.id)).get();
    expect(t?.pushVerified).toBe(1);

    // ── 6. 이벤트 로그 확인 ──
    const allEvents = testDb.select().from(events).all();
    const eventTypes = allEvents.map((e) => e.eventType);

    // 체크리스트 업데이트 3건
    const checklistEvents = eventTypes.filter((t) => t === 'ticket.checklist_updated');
    expect(checklistEvents.length).toBe(3);

    // 상태 변경: backlog→in_progress, in_progress→completed
    const statusEvents = eventTypes.filter((t) => t === 'ticket.status_changed');
    expect(statusEvents.length).toBe(2);

    // 커밋 기록
    expect(eventTypes).toContain('ticket.commit_recorded');

    // push 확인
    expect(eventTypes).toContain('ticket.push_verified');

    // ── 7. 알림 생성 확인 (ticket.completed → 알림) ──
    const notifs = testDb.select().from(notifications).all();
    const completedNotifs = notifs.filter((n) => n.title === '태스크 완료');
    expect(completedNotifs.length).toBeGreaterThanOrEqual(1);

    // ── 8. HookBridge.onTaskCompleted → DB 동기화 (P4) ──
    // PDCA 피처 생성 (HookBridge sync 대상)
    testDb.insert(pdcaFeatures).values({
      id: 'auto-complete-test',
      displayName: '자동 완료 테스트',
      phase: 'implementing',
    }).run();

    await hookBridge.onTaskCompleted({
      commitHash: 'deadbeef',
      changedFiles: 7,
      buildSuccess: true,
    });

    // system.hook_executed 이벤트
    const hookEvents = testDb.select().from(events)
      .where(eq(events.eventType, 'system.hook_executed')).all();
    expect(hookEvents.length).toBe(1);
  });
});
