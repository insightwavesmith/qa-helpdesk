import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDb, cleanDb } from '../setup';
import * as schema from '../../server/db/schema';
import { eq } from 'drizzle-orm';

import { ChainService } from '../../server/services/chains';
import { TicketService } from '../../server/services/tickets';
import { eventBus } from '../../server/event-bus';

let chainSvc: ChainService;
let ticketSvc: TicketService;

beforeEach(() => {
  ticketSvc = new TicketService(testDb);
  chainSvc = new ChainService(testDb, ticketSvc);
});

// 헬퍼: 기본 체인 + 3단계 생성
async function createTestChain() {
  const chain = await chainSvc.createChain({
    name: '테스트 체인',
    description: '테스트용',
  });

  const step1 = await chainSvc.addStep(chain.id, {
    teamRole: 'pm', phase: 'plan', label: '기획',
    completionCondition: { type: 'checklist_all_done' },
  });
  const step2 = await chainSvc.addStep(chain.id, {
    teamRole: 'cto', phase: 'do', label: '구현',
    completionCondition: {
      type: 'all',
      conditions: [
        { type: 'checklist_all_done' },
        { type: 'commit_exists' },
        { type: 'push_verified' },
      ],
    },
  });
  const step3 = await chainSvc.addStep(chain.id, {
    teamRole: 'cto', phase: 'check', label: 'QA',
    completionCondition: { type: 'match_rate', min: 90 },
  });

  return { chain, step1, step2, step3 };
}

// 헬퍼: pdca_features 레코드 생성
function createTestFeature(chainId: string) {
  testDb.insert(schema.pdcaFeatures).values({
    id: 'test-feature',
    displayName: '테스트 피처',
    chainId,
    currentStep: 1,
  }).run();
}

describe('ChainService', () => {
  // TC-C01: 체인 생성 + 3단계 추가
  it('TC-C01: 체인 생성 + 3단계 추가', async () => {
    const { chain, step1, step2, step3 } = await createTestChain();

    expect(chain.id).toBeDefined();
    expect(chain.name).toBe('테스트 체인');

    const steps = testDb.select().from(schema.workflowSteps)
      .where(eq(schema.workflowSteps.chainId, chain.id)).all();
    expect(steps).toHaveLength(3);
    expect(steps.map(s => s.stepOrder).sort()).toEqual([1, 2, 3]);
  });

  // TC-C02: 단계 순서 변경
  it('TC-C02: 단계 순서 변경', async () => {
    const { chain, step1, step2, step3 } = await createTestChain();
    // 순서를 step3, step1, step2로 변경
    await chainSvc.reorderSteps(chain.id, [step3.id, step1.id, step2.id]);

    const steps = testDb.select().from(schema.workflowSteps)
      .where(eq(schema.workflowSteps.chainId, chain.id)).all();
    const ordered = steps.sort((a, b) => a.stepOrder - b.stepOrder);
    expect(ordered[0].id).toBe(step3.id);
    expect(ordered[1].id).toBe(step1.id);
    expect(ordered[2].id).toBe(step2.id);
  });

  // TC-C03: checklist_all_done 조건 평가 (P1, P3)
  it('TC-C03: checklist_all_done 조건 평가', async () => {
    const { step1 } = await createTestChain();
    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });

    // 체크리스트 미완료
    await ticketSvc.updateChecklist(ticket.id, [
      { id: 'c1', text: 'test', done: false },
    ]);
    let ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step1.id, { ticket: ticketData })).toBe(false);

    // 체크리스트 완료 (하지만 status가 completed로 바뀌므로 새 ticket 사용)
    const ticket2 = await ticketSvc.create({ feature: 'f1', title: 't2' });
    // 직접 DB에 체크리스트 설정 (자동 completed 방지를 위해 직접 설정)
    testDb.update(schema.tickets).set({
      checklist: JSON.stringify([{ id: 'c1', text: 'test', done: true }]),
    }).where(eq(schema.tickets.id, ticket2.id)).run();
    ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket2.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step1.id, { ticket: ticketData })).toBe(true);
  });

  // TC-C04: commit_exists 조건 평가 (P2, P6)
  it('TC-C04: commit_exists 조건 평가', async () => {
    const { chain } = await createTestChain();
    // commit_exists 조건만 있는 스텝 추가
    const step = await chainSvc.addStep(chain.id, {
      teamRole: 'cto', phase: 'do', label: '커밋체크',
      completionCondition: { type: 'commit_exists' },
    });

    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    let ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step.id, { ticket: ticketData })).toBe(false);

    await ticketSvc.recordCommit(ticket.id, 'abc123', 3);
    ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step.id, { ticket: ticketData })).toBe(true);
  });

  // TC-C05: push_verified 조건 평가 (P6)
  it('TC-C05: push_verified 조건 평가', async () => {
    const { chain } = await createTestChain();
    const step = await chainSvc.addStep(chain.id, {
      teamRole: 'cto', phase: 'do', label: 'push체크',
      completionCondition: { type: 'push_verified' },
    });

    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    let ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step.id, { ticket: ticketData })).toBe(false);

    await ticketSvc.verifyPush(ticket.id);
    ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step.id, { ticket: ticketData })).toBe(true);
  });

  // TC-C06: match_rate 조건 평가 (90% 경계값)
  it('TC-C06: match_rate 조건 — 경계값', async () => {
    const { step3 } = await createTestChain(); // min: 90

    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });

    // 89% → false
    testDb.update(schema.tickets).set({ matchRate: 89 })
      .where(eq(schema.tickets.id, ticket.id)).run();
    let ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step3.id, { ticket: ticketData })).toBe(false);

    // 90% → true
    testDb.update(schema.tickets).set({ matchRate: 90 })
      .where(eq(schema.tickets.id, ticket.id)).run();
    ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step3.id, { ticket: ticketData })).toBe(true);

    // 100% → true
    testDb.update(schema.tickets).set({ matchRate: 100 })
      .where(eq(schema.tickets.id, ticket.id)).run();
    ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step3.id, { ticket: ticketData })).toBe(true);
  });

  // TC-C07: build_success 조건 평가
  it('TC-C07: build_success 조건 평가', async () => {
    const { chain } = await createTestChain();
    const step = await chainSvc.addStep(chain.id, {
      teamRole: 'cto', phase: 'deploy', label: '빌드',
      completionCondition: { type: 'build_success' },
    });

    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    const ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;

    expect(await chainSvc.evaluateCompletion(step.id, { ticket: ticketData, buildSuccess: false })).toBe(false);
    expect(await chainSvc.evaluateCompletion(step.id, { ticket: ticketData, buildSuccess: true })).toBe(true);
  });

  // TC-C08: all(복합) 조건 — 하나라도 false → false (P2)
  it('TC-C08: all 조건 — 하나라도 false', async () => {
    const { step2 } = await createTestChain();
    // step2: all(checklist_all_done, commit_exists, push_verified)

    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    // 체크리스트만 완료, 커밋/push 없음
    testDb.update(schema.tickets).set({
      checklist: JSON.stringify([{ id: 'c1', text: 'test', done: true }]),
    }).where(eq(schema.tickets.id, ticket.id)).run();

    const ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step2.id, { ticket: ticketData })).toBe(false);
  });

  // TC-C09: all(복합) 조건 — 전부 true → true (P2)
  it('TC-C09: all 조건 — 전부 true', async () => {
    const { step2 } = await createTestChain();

    const ticket = await ticketSvc.create({ feature: 'f1', title: 't1' });
    testDb.update(schema.tickets).set({
      checklist: JSON.stringify([{ id: 'c1', text: 'test', done: true }]),
      commitHash: 'abc123',
      pushVerified: 1,
    }).where(eq(schema.tickets.id, ticket.id)).run();

    const ticketData = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.id, ticket.id)).get()!;
    expect(await chainSvc.evaluateCompletion(step2.id, { ticket: ticketData })).toBe(true);
  });

  // TC-C10: triggerNextStep → 다음 단계 ticket 자동 생성 (P7)
  it('TC-C10: triggerNextStep → ticket 자동 생성', async () => {
    const { chain } = await createTestChain();
    createTestFeature(chain.id);

    await chainSvc.triggerNextStep(chain.id, 1); // step1 완료 → step2 시작

    // step2(구현)용 ticket이 생성되어야 함
    const tickets = testDb.select().from(schema.tickets)
      .where(eq(schema.tickets.chainId, chain.id)).all();
    expect(tickets.length).toBeGreaterThanOrEqual(1);
    expect(tickets.some(t => t.pdcaPhase === 'do')).toBe(true);
  });

  // TC-C11: triggerNextStep → pdca_features phase 전환 (P7)
  it('TC-C11: triggerNextStep → pdca_features phase 전환', async () => {
    const { chain } = await createTestChain();
    createTestFeature(chain.id);

    await chainSvc.triggerNextStep(chain.id, 1);

    const feature = testDb.select().from(schema.pdcaFeatures)
      .where(eq(schema.pdcaFeatures.id, 'test-feature')).get();
    expect(feature!.phase).toBe('implementing'); // do → implementing
    expect(feature!.currentStep).toBe(2);
  });

  // TC-C12: triggerNextStep → chain.auto_triggered 이벤트 (P7)
  it('TC-C12: triggerNextStep → chain.auto_triggered 이벤트', async () => {
    const { chain } = await createTestChain();
    createTestFeature(chain.id);

    const handler = vi.fn();
    eventBus.subscribe('chain.auto_triggered', handler);

    await chainSvc.triggerNextStep(chain.id, 1);

    expect(handler).toHaveBeenCalled();
    eventBus.unsubscribe('chain.auto_triggered', handler);

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'chain.auto_triggered')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-C13: 마지막 단계 완료 → onChainCompleted
  it('TC-C13: 마지막 단계 완료 → chain.handoff', async () => {
    const { chain } = await createTestChain();
    createTestFeature(chain.id);

    // 마지막 단계(3) 이후 → triggerNextStep(chainId, 3) → 다음 없음 → onChainCompleted
    await chainSvc.triggerNextStep(chain.id, 3);

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'chain.handoff')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-C14: deploy_config 있는 단계 → 배포 실행 (P9)
  it('TC-C14: executeDeployStep — deploy_config 실행', async () => {
    const { chain } = await createTestChain();
    const step = await chainSvc.addStep(chain.id, {
      teamRole: 'cto', phase: 'deploy', label: '배포',
      completionCondition: { type: 'build_success' },
      deployConfig: { command: 'echo "deploy ok"', verify: false },
    });

    const result = await chainSvc.executeDeployStep(step);
    expect(result).toBe(true);

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'chain.deploy_triggered')).all();
    expect(evts).toHaveLength(1);
  });

  // TC-C15: 배포 실패 → system.deploy_result(실패) 기록
  it('TC-C15: 배포 실패 → 실패 이벤트', async () => {
    const { chain } = await createTestChain();
    const step = await chainSvc.addStep(chain.id, {
      teamRole: 'cto', phase: 'deploy', label: '배포',
      completionCondition: { type: 'build_success' },
      deployConfig: { command: 'exit 1', verify: false },
    });

    const result = await chainSvc.executeDeployStep(step);
    expect(result).toBe(false);

    const evts = testDb.select().from(schema.events)
      .where(eq(schema.events.eventType, 'system.deploy_result')).all();
    expect(evts).toHaveLength(1);
    const payload = JSON.parse(evts[0].payload!);
    expect(payload.success).toBe(false);
  });

  // TC-C16: 비활성 체인 → 무시
  it('TC-C16: 비활성 체인 → listChains에서 제외', async () => {
    const chain1 = await chainSvc.createChain({ name: '활성 체인' });
    const chain2 = await chainSvc.createChain({ name: '비활성 체인' });

    testDb.update(schema.workflowChains).set({ active: 0 })
      .where(eq(schema.workflowChains.id, chain2.id)).run();

    const list = await chainSvc.listChains();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(chain1.id);
  });
});
