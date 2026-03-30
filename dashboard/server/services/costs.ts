// dashboard/server/services/costs.ts
// Paperclip costs.ts 기반 — companyId/biller/billingType 제거, SQLite 적응
import { eq, and, gte, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { costEvents, agents, events } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type { BudgetService } from './budgets.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export interface RecordCostInput {
  agentId: string;
  ticketId?: string;
  runId?: string;
  provider?: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  costCents: number;
}

interface AgentCostRow {
  agentId: string;
  agentName: string | null;
  totalCents: number;
  inputTokens: number;
  outputTokens: number;
}

interface ModelCostRow {
  model: string;
  totalCents: number;
  inputTokens: number;
  outputTokens: number;
  eventCount: number;
}

type WindowKind = 'daily' | 'weekly' | 'monthly';

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
  // monthly
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
}

export class CostService {
  private db: DB;
  private budgetSvc: BudgetService;

  constructor(db: DB, budgetSvc: BudgetService) {
    this.db = db;
    this.budgetSvc = budgetSvc;
  }

  async recordCost(input: RecordCostInput) {
    const event = this.db.insert(costEvents).values({
      agentId: input.agentId,
      ticketId: input.ticketId,
      runId: input.runId,
      provider: input.provider ?? 'anthropic',
      model: input.model,
      inputTokens: input.inputTokens,
      cachedInputTokens: input.cachedInputTokens ?? 0,
      outputTokens: input.outputTokens,
      costCents: input.costCents,
    }).returning().get();

    // 에이전트 spentMonthlyCents 갱신
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
    const [monthRow] = this.db.select({
      total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
    }).from(costEvents).where(
      and(
        eq(costEvents.agentId, input.agentId),
        gte(costEvents.occurredAt, monthStart),
      ),
    ).all();

    const monthSpend = Number(monthRow?.total ?? 0);
    this.db.update(agents).set({
      spentMonthlyCents: monthSpend,
      updatedAt: new Date().toISOString(),
    }).where(eq(agents.id, input.agentId)).run();

    // 이벤트 기록
    this.db.insert(events).values({
      eventType: 'cost.recorded',
      actor: 'system',
      targetType: 'cost_event',
      targetId: event.id,
      payload: JSON.stringify({ agentId: input.agentId, costCents: input.costCents, model: input.model }),
    }).run();

    eventBus.publish({
      type: 'cost.recorded',
      actor: 'system',
      targetType: 'cost_event',
      targetId: event.id,
      payload: { agentId: input.agentId, costCents: input.costCents },
    });

    // 예산 평가
    await this.budgetSvc.evaluateBudget(input.agentId);

    return event;
  }

  async getCostSummary() {
    const [row] = this.db.select({
      totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
      totalInput: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)`,
      totalOutput: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)`,
      eventCount: sql<number>`count(*)`,
    }).from(costEvents).all();

    return {
      totalCents: Number(row?.totalCents ?? 0),
      totalInputTokens: Number(row?.totalInput ?? 0),
      totalOutputTokens: Number(row?.totalOutput ?? 0),
      eventCount: Number(row?.eventCount ?? 0),
    };
  }

  async getCostByAgent(): Promise<AgentCostRow[]> {
    const rows = this.db.select({
      agentId: costEvents.agentId,
      agentName: agents.name,
      totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)`,
    })
      .from(costEvents)
      .leftJoin(agents, eq(costEvents.agentId, agents.id))
      .groupBy(costEvents.agentId)
      .all();

    return rows.map(r => ({
      agentId: r.agentId,
      agentName: r.agentName,
      totalCents: Number(r.totalCents),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
    }));
  }

  async getCostByModel(): Promise<ModelCostRow[]> {
    const rows = this.db.select({
      model: costEvents.model,
      totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
      inputTokens: sql<number>`coalesce(sum(${costEvents.inputTokens}), 0)`,
      outputTokens: sql<number>`coalesce(sum(${costEvents.outputTokens}), 0)`,
      eventCount: sql<number>`count(*)`,
    })
      .from(costEvents)
      .groupBy(costEvents.model)
      .all();

    return rows.map(r => ({
      model: r.model,
      totalCents: Number(r.totalCents),
      inputTokens: Number(r.inputTokens),
      outputTokens: Number(r.outputTokens),
      eventCount: Number(r.eventCount),
    }));
  }

  async getWindowSpend(window: WindowKind): Promise<number> {
    const since = getWindowStart(window);
    const [row] = this.db.select({
      total: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
    }).from(costEvents).where(
      gte(costEvents.occurredAt, since),
    ).all();

    return Number(row?.total ?? 0);
  }
}
