// P7 E2E: PM완료→CTO자동시작→배포
// 체인 4단계 (PM→CTO→QA→배포) 전체 흐름 통합 테스트
import { describe, it, expect, vi } from 'vitest';
import { testDb } from '../setup.js';
import { TicketService } from '../../server/services/tickets.js';
import { ChainService } from '../../server/services/chains.js';
import { NotificationService } from '../../server/services/notifications.js';
import { eventBus } from '../../server/event-bus.js';
import { pdcaFeatures, events, tickets } from '../../server/db/schema.js';
import { eq, and } from 'drizzle-orm';

describe('E2E: 체인 흐름 (PM→CTO→QA→배포)', () => {
  it('4단계 체인 전체 흐름이 자동으로 진행된다', async () => {
    const ticketSvc = new TicketService(testDb);
    const chainSvc = new ChainService(testDb, ticketSvc);
    // NotificationService가 이벤트 수신하도록 인스턴스 생성
    const _notifSvc = new NotificationService(testDb);

    // ── 1. PDCA 체인 생성 (4단계) ──
    const chain = await chainSvc.createChain({
      name: 'test-pdca-chain',
      description: '통합 테스트용 PDCA 체인',
    });

    // PM 단계: 수동 승인
    const step1 = await chainSvc.addStep(chain.id, {
      teamRole: 'pm',
      phase: 'plan',
      label: 'PM 분석',
      completionCondition: { type: 'manual' },
    });

    // CTO 단계: composite(all) — 체크리스트 + 커밋 + push
    const step2 = await chainSvc.addStep(chain.id, {
      teamRole: 'cto',
      phase: 'do',
      label: 'CTO 구현',
      completionCondition: {
        type: 'all',
        conditions: [
          { type: 'checklist_all_done' },
          { type: 'commit_exists' },
          { type: 'push_verified' },
        ],
      },
    });

    // QA 단계: match_rate >= 90
    const step3 = await chainSvc.addStep(chain.id, {
      teamRole: 'qa',
      phase: 'check',
      label: 'QA 검증',
      completionCondition: { type: 'match_rate', min: 90 },
    });

    // 배포 단계: 빌드 성공
    const step4 = await chainSvc.addStep(chain.id, {
      teamRole: 'cto',
      phase: 'deploy',
      label: '배포',
      completionCondition: { type: 'build_success' },
    });

    // ── 2. PDCA 피처 + 초기 티켓 생성 ──
    testDb.insert(pdcaFeatures).values({
      id: 'test-feature',
      displayName: '테스트 피처',
      phase: 'planning',
      chainId: chain.id,
      currentStep: 1,
    }).run();

    const pmTicket = await ticketSvc.create({
      feature: 'test-feature',
      title: 'PM 분석 태스크',
      assigneeTeam: 'pm',
      pdcaPhase: 'plan',
      chainId: chain.id,
      chainStepId: step1.id,
    });

    // ── 3. PM 단계 완료 (수동 승인) ──
    const pmComplete = await chainSvc.evaluateCompletion(step1.id, {
      manualApproval: true,
    });
    expect(pmComplete).toBe(true);

    // ── 4. 자동으로 CTO 단계 트리거 ──
    await chainSvc.triggerNextStep(chain.id, step1.stepOrder);

    // chain.auto_triggered 이벤트 확인
    const autoTriggerEvents = testDb.select().from(events)
      .where(eq(events.eventType, 'chain.auto_triggered')).all();
    expect(autoTriggerEvents.length).toBeGreaterThanOrEqual(1);

    // CTO 티켓 자동 생성 확인
    const ctoTickets = testDb.select().from(tickets)
      .where(and(
        eq(tickets.assigneeTeam, 'cto'),
        eq(tickets.chainStepId, step2.id),
      )).all();
    expect(ctoTickets.length).toBe(1);
    const ctoTicket = ctoTickets[0];

    // PDCA 피처 phase 업데이트 확인
    const featureAfterCto = testDb.select().from(pdcaFeatures)
      .where(eq(pdcaFeatures.id, 'test-feature')).get();
    expect(featureAfterCto?.phase).toBe('implementing');
    expect(featureAfterCto?.currentStep).toBe(step2.stepOrder);

    // ── 5. CTO 단계: 체크리스트 + 커밋 + push ──
    const checklist = [
      { id: 'c1', text: '설계 완료', done: true },
      { id: 'c2', text: '구현 완료', done: true },
      { id: 'c3', text: '테스트 통과', done: true },
    ];
    // 체크리스트 완료 → 자동 completed 됨
    await ticketSvc.updateChecklist(ctoTicket.id, checklist);
    await ticketSvc.recordCommit(ctoTicket.id, 'abc1234', 5);
    await ticketSvc.verifyPush(ctoTicket.id);

    // CTO 단계 완료 조건 확인 (composite all)
    const ctoTicketFresh = testDb.select().from(tickets)
      .where(eq(tickets.id, ctoTicket.id)).get();
    const ctoComplete = await chainSvc.evaluateCompletion(step2.id, {
      ticket: ctoTicketFresh as unknown as Record<string, unknown>,
    });
    expect(ctoComplete).toBe(true);

    // ── 6. 자동으로 QA 단계 트리거 ──
    await chainSvc.triggerNextStep(chain.id, step2.stepOrder);

    const qaTickets = testDb.select().from(tickets)
      .where(eq(tickets.chainStepId, step3.id)).all();
    expect(qaTickets.length).toBe(1);
    const qaTicket = qaTickets[0];

    // PDCA 피처 phase → checking
    const featureAfterQa = testDb.select().from(pdcaFeatures)
      .where(eq(pdcaFeatures.id, 'test-feature')).get();
    expect(featureAfterQa?.phase).toBe('checking');

    // ── 7. QA 단계: match_rate 95% ──
    testDb.update(tickets).set({ matchRate: 95 })
      .where(eq(tickets.id, qaTicket.id)).run();

    const qaTicketFresh = testDb.select().from(tickets)
      .where(eq(tickets.id, qaTicket.id)).get();
    const qaComplete = await chainSvc.evaluateCompletion(step3.id, {
      ticket: qaTicketFresh as unknown as Record<string, unknown>,
    });
    expect(qaComplete).toBe(true);

    // ── 8. 자동으로 배포 단계 트리거 ──
    await chainSvc.triggerNextStep(chain.id, step3.stepOrder);

    const deployTickets = testDb.select().from(tickets)
      .where(eq(tickets.chainStepId, step4.id)).all();
    expect(deployTickets.length).toBe(1);

    // ── 9. 배포 단계 완료 → 체인 완료 ──
    const deployComplete = await chainSvc.evaluateCompletion(step4.id, {
      buildSuccess: true,
    });
    expect(deployComplete).toBe(true);

    // 마지막 단계 이후 triggerNextStep → chain.handoff
    await chainSvc.triggerNextStep(chain.id, step4.stepOrder);

    const handoffEvents = testDb.select().from(events)
      .where(eq(events.eventType, 'chain.handoff')).all();
    expect(handoffEvents.length).toBe(1);

    // auto_triggered 이벤트 총 3건 (PM→CTO, CTO→QA, QA→배포)
    const allAutoTriggers = testDb.select().from(events)
      .where(eq(events.eventType, 'chain.auto_triggered')).all();
    expect(allAutoTriggers.length).toBe(3);
  });
});
