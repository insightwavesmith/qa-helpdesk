import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { testDb } from '../setup';
import * as schema from '../../server/db/schema';
import { eq } from 'drizzle-orm';
import { HookBridgeService } from '../../server/services/hook-bridge';
import { TicketService } from '../../server/services/tickets';
import { ChainService } from '../../server/services/chains';
import { existsSync, readFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

let hookSvc: HookBridgeService;
let ticketSvc: TicketService;
let chainSvc: ChainService;
let tmpOutputDir: string;

beforeEach(() => {
  ticketSvc = new TicketService(testDb);
  chainSvc = new ChainService(testDb, ticketSvc);
  tmpOutputDir = join(tmpdir(), `hookbridge-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(tmpOutputDir, { recursive: true });
  hookSvc = new HookBridgeService(testDb, ticketSvc, chainSvc, tmpOutputDir);
});

afterEach(() => {
  try { rmSync(tmpOutputDir, { recursive: true }); } catch {}
});

describe('HookBridgeService', () => {
  // TC-H01: onTaskCompleted → 진행 중 ticket 찾기
  it('TC-H01: onTaskCompleted → 진행 중 ticket에 커밋 기록', async () => {
    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    await ticketSvc.changeStatus(ticket.id, 'in_progress');

    await hookSvc.onTaskCompleted({
      commitHash: 'abc123',
      changedFiles: 5,
    });

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(updated.commitHash).toBe('abc123');
    expect(updated.changedFiles).toBe(5);
  });

  // TC-H02: syncToPdcaStatusJson → primaryFeature 정확
  it('TC-H02: syncToPdcaStatusJson — primaryFeature 정확', async () => {
    testDb.insert(schema.pdcaFeatures).values({
      id: 'feature-active',
      displayName: '활성 피처',
      phase: 'implementing',
    }).run();
    testDb.insert(schema.pdcaFeatures).values({
      id: 'feature-done',
      displayName: '완료 피처',
      phase: 'completed',
    }).run();

    await hookSvc.syncToPdcaStatusJson();

    const filePath = join(tmpOutputDir, 'pdca-status.json');
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.primaryFeature).toBe('feature-active');
    expect(content.activeFeatures).not.toContain('feature-done');
  });

  // TC-H03: syncToPdcaStatusJson → 미러 파일 생성
  it('TC-H03: syncToPdcaStatusJson — 파일 생성 + JSON 유효', async () => {
    testDb.insert(schema.pdcaFeatures).values({
      id: 'test-f',
      displayName: '테스트',
      phase: 'planning',
    }).run();

    await hookSvc.syncToPdcaStatusJson();

    const filePath = join(tmpOutputDir, 'pdca-status.json');
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content.version).toBe('3.0');
    expect(content.features['test-f']).toBeDefined();
    expect(content.features['test-f'].displayName).toBe('테스트');
  });

  // TC-H04: ticket 없어도 이벤트 기록
  it('TC-H04: ticket 없어도 이벤트 기록', async () => {
    await hookSvc.onTaskCompleted({});

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'system.hook_executed')).all();
    expect(evts).toHaveLength(1);
    expect(evts[0].actor).toBe('hook:task-completed');
  });

  // TC-H05: match_rate 전달 시 ticket 업데이트
  it('TC-H05: matchRate 전달 → ticket 업데이트', async () => {
    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    await ticketSvc.changeStatus(ticket.id, 'in_progress');

    await hookSvc.onTaskCompleted({ matchRate: 95 });

    const updated = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(updated.matchRate).toBe(95);
  });

  // TC-H06: chain_step_id → 체인 평가 + 자동 트리거
  it('TC-H06: chainStepId 있으면 체인 평가 + 자동 트리거', async () => {
    const chain = await chainSvc.createChain({ name: '테스트 체인' });
    const step1 = await chainSvc.addStep(chain.id, {
      teamRole: 'cto', phase: 'do', label: '구현',
      completionCondition: { type: 'build_success' },
    });
    await chainSvc.addStep(chain.id, {
      teamRole: 'cto', phase: 'check', label: 'QA',
      completionCondition: { type: 'match_rate', min: 90 },
    });

    testDb.insert(schema.pdcaFeatures).values({
      id: 'test-feature',
      displayName: '테스트',
      chainId: chain.id,
      currentStep: 1,
    }).run();

    const ticket = await ticketSvc.create({
      feature: 'test-feature',
      title: '구현 태스크',
      chainId: chain.id,
      chainStepId: step1.id,
    });
    await ticketSvc.changeStatus(ticket.id, 'in_progress');

    await hookSvc.onTaskCompleted({ buildSuccess: true });

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'chain.auto_triggered')).all();
    expect(evts.length).toBeGreaterThanOrEqual(1);
  });

  // TC-H07: 에러에도 안전 처리
  it('TC-H07: 잘못된 체인 참조에도 이벤트 기록', async () => {
    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    await ticketSvc.changeStatus(ticket.id, 'in_progress');
    testDb.update(schema.tickets).set({
      chainStepId: 'nonexistent',
      chainId: 'nonexistent',
    }).where(eq(schema.tickets.id, ticket.id)).run();

    await expect(hookSvc.onTaskCompleted({ buildSuccess: true }))
      .resolves.not.toThrow();

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'system.hook_executed')).all();
    expect(evts.length).toBeGreaterThanOrEqual(1);
  });

  // TC-H08: 동시 호출 시 DB 일관성
  it('TC-H08: 동시 호출 시 DB 일관성', async () => {
    const promises = Array.from({ length: 5 }, () =>
      hookSvc.onTaskCompleted({})
    );
    await Promise.all(promises);

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'system.hook_executed')).all();
    expect(evts).toHaveLength(5);
  });
});
