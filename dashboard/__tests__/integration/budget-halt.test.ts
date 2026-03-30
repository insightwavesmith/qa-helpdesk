// P8 E2E: 비용초과→정지→해제
// 예산 정책 → 비용 누적 → warn → hard_stop → 해결 통합 테스트
import { describe, it, expect } from 'vitest';
import { testDb } from '../setup.js';
import { CostService } from '../../server/services/costs.js';
import { BudgetService } from '../../server/services/budgets.js';
import { AgentService } from '../../server/services/agents.js';
import { NotificationService } from '../../server/services/notifications.js';
import { agents, budgetIncidents, events, notifications } from '../../server/db/schema.js';
import { eq, and } from 'drizzle-orm';

describe('E2E: 비용 초과 → 에이전트 정지 → 해제', () => {
  it('예산 80% warn → 100% hard_stop → resolve 전체 흐름', async () => {
    const budgetSvc = new BudgetService(testDb);
    const costSvc = new CostService(testDb, budgetSvc);
    const agentSvc = new AgentService(testDb);
    // 알림 수신
    const _notifSvc = new NotificationService(testDb);

    // ── 1. 에이전트 등록 ──
    const agent = await agentSvc.register({
      name: 'cto-leader',
      displayName: 'CTO 리더',
      role: 'leader',
      team: 'cto',
    });
    // 실행 상태로 변경
    await agentSvc.updateStatus(agent.id, 'running');

    // ── 2. 예산 정책 생성 (10000 cents = $100, 80% warn, hard_stop 활성) ──
    const policy = budgetSvc.createPolicy({
      scopeType: 'agent',
      scopeId: agent.id,
      amountCents: 10000,
      warnPercent: 80,
      hardStop: 1,
      windowKind: 'monthly',
    });
    expect(policy.amountCents).toBe(10000);

    // ── 3. 비용 이벤트: 7000 cents (70%) — 아직 warn 아님 ──
    await costSvc.recordCost({
      agentId: agent.id,
      model: 'claude-opus-4-6',
      inputTokens: 50000,
      outputTokens: 10000,
      costCents: 7000,
    });

    let agentRow = testDb.select().from(agents).where(eq(agents.id, agent.id)).get();
    expect(agentRow?.status).toBe('running'); // 아직 정지 안 됨

    // warn incident 없어야 함
    let incidents = testDb.select().from(budgetIncidents).all();
    expect(incidents.length).toBe(0);

    // ── 4. 비용 추가: +1500 = 8500 (85%) → warn 발동 ──
    await costSvc.recordCost({
      agentId: agent.id,
      model: 'claude-opus-4-6',
      inputTokens: 10000,
      outputTokens: 2000,
      costCents: 1500,
    });

    incidents = testDb.select().from(budgetIncidents).all();
    const warnIncidents = incidents.filter((i) => i.kind === 'warn');
    expect(warnIncidents.length).toBe(1);
    expect(warnIncidents[0].amountAtTrigger).toBe(8500);

    // 에이전트는 아직 running (warn만)
    agentRow = testDb.select().from(agents).where(eq(agents.id, agent.id)).get();
    expect(agentRow?.status).toBe('running');

    // budget.warn 이벤트 확인
    const warnEvents = testDb.select().from(events)
      .where(eq(events.eventType, 'budget.warn')).all();
    expect(warnEvents.length).toBeGreaterThanOrEqual(1);

    // ── 5. 비용 추가: +2000 = 10500 (105%) → hard_stop 발동 (P8) ──
    await costSvc.recordCost({
      agentId: agent.id,
      model: 'claude-opus-4-6',
      inputTokens: 15000,
      outputTokens: 5000,
      costCents: 2000,
    });

    // 에이전트 자동 정지
    agentRow = testDb.select().from(agents).where(eq(agents.id, agent.id)).get();
    expect(agentRow?.status).toBe('paused');
    expect(agentRow?.pauseReason).toBe('budget');

    // hard_stop incident 확인
    incidents = testDb.select().from(budgetIncidents).all();
    const hardStopIncidents = incidents.filter((i) => i.kind === 'hard_stop');
    expect(hardStopIncidents.length).toBe(1);
    expect(hardStopIncidents[0].amountAtTrigger).toBe(10500);
    expect(hardStopIncidents[0].resolved).toBe(0);

    // budget.hard_stop 이벤트 확인
    const hardStopEvents = testDb.select().from(events)
      .where(eq(events.eventType, 'budget.hard_stop')).all();
    expect(hardStopEvents.length).toBe(1);

    // ── 6. 알림 확인 ──
    const allNotifs = testDb.select().from(notifications).all();
    // warn 알림 + hard_stop 알림
    const warnNotifs = allNotifs.filter((n) => n.title === '예산 경고');
    const stopNotifs = allNotifs.filter((n) => n.title === '예산 초과 — 에이전트 정지');
    expect(warnNotifs.length).toBeGreaterThanOrEqual(1);
    expect(stopNotifs.length).toBe(1);

    // ── 7. incident 해결 → 에이전트 상태 복구 ──
    const incidentToResolve = hardStopIncidents[0];
    await budgetSvc.resolveIncident(incidentToResolve.id);

    // incident resolved 확인
    const resolvedIncident = testDb.select().from(budgetIncidents)
      .where(eq(budgetIncidents.id, incidentToResolve.id)).get();
    expect(resolvedIncident?.resolved).toBe(1);
    expect(resolvedIncident?.resolvedAt).toBeTruthy();

    // budget.resolved 이벤트 확인
    const resolvedEvents = testDb.select().from(events)
      .where(eq(events.eventType, 'budget.resolved')).all();
    expect(resolvedEvents.length).toBe(1);

    // 에이전트를 수동으로 running 복구 (resolveIncident은 상태 복구 안 함)
    await agentSvc.updateStatus(agent.id, 'running');
    agentRow = testDb.select().from(agents).where(eq(agents.id, agent.id)).get();
    expect(agentRow?.status).toBe('running');

    // spentMonthlyCents 총액 확인
    expect(agentRow?.spentMonthlyCents).toBe(10500);
  });
});
