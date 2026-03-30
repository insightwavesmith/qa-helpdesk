// dashboard/server/services/budgets.ts
// Paperclip budgets.ts 기반 — companyId/project 제거, SQLite 적응
import { eq, and, gte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { budgetPolicies, budgetIncidents, costEvents, agents, events } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

type WindowKind = 'monthly' | 'weekly' | 'daily';

function getWindowStart(kind: WindowKind): string {
  const now = new Date();
  if (kind === 'daily') {
    return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  }
  if (kind === 'weekly') {
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(now.getFullYear(), now.getMonth(), diff).toISOString();
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export interface CreatePolicyInput {
  scopeType: 'global' | 'agent' | 'team';
  scopeId?: string | null;
  amountCents: number;
  warnPercent?: number;
  hardStop?: number;
  windowKind?: WindowKind;
}

export class BudgetService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  createPolicy(input: CreatePolicyInput) {
    const policy = this.db.insert(budgetPolicies).values({
      scopeType: input.scopeType,
      scopeId: input.scopeId ?? null,
      amountCents: input.amountCents,
      warnPercent: input.warnPercent ?? 80,
      hardStop: input.hardStop ?? 1,
      windowKind: input.windowKind ?? 'monthly',
      active: 1,
    }).returning().get();

    return policy;
  }

  /** 특정 에이전트의 비용을 해당 정책과 대조하여 예산 평가 */
  async evaluateBudget(agentId: string) {
    // active 정책 조회 (글로벌 + 에이전트 스코프)
    const policies = this.db.select().from(budgetPolicies)
      .where(eq(budgetPolicies.active, 1))
      .all();

    for (const policy of policies) {
      // 스코프 필터: global은 모두 적용, agent는 scopeId 매칭
      if (policy.scopeType === 'agent' && policy.scopeId !== agentId) continue;

      const windowStart = getWindowStart(policy.windowKind as WindowKind);

      // 해당 윈도우의 총 지출 계산
      const conditions = [gte(costEvents.occurredAt, windowStart)];
      if (policy.scopeType === 'agent' && policy.scopeId) {
        conditions.push(eq(costEvents.agentId, policy.scopeId));
      }

      const [row] = this.db.select({
        total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
      }).from(costEvents).where(and(...conditions)).all();

      const currentSpend = Number(row?.total ?? 0);
      const warnThreshold = Math.ceil((policy.amountCents * policy.warnPercent) / 100);

      // warn 체크
      if (currentSpend >= warnThreshold && currentSpend < policy.amountCents) {
        await this.handleBudgetIncident(policy, 'warn', currentSpend, agentId);
      }

      // hard_stop 또는 초과 체크
      if (currentSpend >= policy.amountCents) {
        if (policy.hardStop) {
          await this.handleBudgetIncident(policy, 'hard_stop', currentSpend, agentId);
          // 에이전트 정지
          this.db.update(agents).set({
            status: 'paused',
            pauseReason: 'budget',
            updatedAt: new Date().toISOString(),
          }).where(eq(agents.id, agentId)).run();
        } else {
          // hard_stop 비활성 → warn만
          await this.handleBudgetIncident(policy, 'warn', currentSpend, agentId);
        }
      }
    }
  }

  async handleBudgetIncident(
    policy: typeof budgetPolicies.$inferSelect,
    kind: 'warn' | 'hard_stop',
    amountAtTrigger: number,
    agentId: string,
  ) {
    // 중복 incident 방지: 같은 정책/종류의 미해결 incident가 있으면 스킵
    const existing = this.db.select().from(budgetIncidents)
      .where(and(
        eq(budgetIncidents.policyId, policy.id),
        eq(budgetIncidents.kind, kind),
        eq(budgetIncidents.resolved, 0),
      )).get();

    if (existing) return existing;

    const thresholdAmount = kind === 'warn'
      ? Math.ceil((policy.amountCents * policy.warnPercent) / 100)
      : policy.amountCents;

    const incident = this.db.insert(budgetIncidents).values({
      policyId: policy.id,
      agentId,
      kind,
      amountAtTrigger,
      thresholdAmount,
    }).returning().get();

    // 이벤트 기록
    const eventType = kind === 'warn' ? 'budget.warn' : 'budget.hard_stop';
    this.db.insert(events).values({
      eventType,
      actor: 'system',
      targetType: 'budget_incident',
      targetId: incident.id,
      payload: JSON.stringify({
        policyId: policy.id,
        agentId,
        kind,
        amountAtTrigger,
        thresholdAmount,
      }),
    }).run();

    eventBus.publish({
      type: eventType,
      actor: 'system',
      targetType: 'budget_incident',
      targetId: incident.id,
      payload: { policyId: policy.id, agentId, kind, amountAtTrigger },
    });

    return incident;
  }

  async resolveIncident(incidentId: string) {
    this.db.update(budgetIncidents).set({
      resolved: 1,
      resolvedAt: new Date().toISOString(),
    }).where(eq(budgetIncidents.id, incidentId)).run();

    this.db.insert(events).values({
      eventType: 'budget.resolved',
      actor: 'system',
      targetType: 'budget_incident',
      targetId: incidentId,
      payload: JSON.stringify({ incidentId }),
    }).run();

    eventBus.publish({
      type: 'budget.resolved',
      actor: 'system',
      targetType: 'budget_incident',
      targetId: incidentId,
    });
  }

  listPolicies() {
    return this.db.select().from(budgetPolicies).all();
  }

  listIncidents(resolved?: boolean) {
    if (resolved !== undefined) {
      return this.db.select().from(budgetIncidents)
        .where(eq(budgetIncidents.resolved, resolved ? 1 : 0))
        .all();
    }
    return this.db.select().from(budgetIncidents).all();
  }
}
