// dashboard/server/services/dashboard.ts
// 대시보드 요약 통계
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { tickets, agents, costEvents, budgetIncidents, pdcaFeatures } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export class DashboardService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  getSummaryStats() {
    // 티켓 상태별 카운트
    const ticketStats = this.db.select({
      status: tickets.status,
      count: sql<number>`count(*)`,
    }).from(tickets).groupBy(tickets.status).all();

    // 에이전트 상태별 카운트
    const agentStats = this.db.select({
      status: agents.status,
      count: sql<number>`count(*)`,
    }).from(agents).groupBy(agents.status).all();

    // 총 비용
    const [costRow] = this.db.select({
      totalCents: sql<number>`coalesce(sum(${costEvents.costCents}), 0)`,
    }).from(costEvents).all();

    // 미해결 예산 incident 수
    const [incidentRow] = this.db.select({
      count: sql<number>`count(*)`,
    }).from(budgetIncidents).where(eq(budgetIncidents.resolved, 0)).all();

    // PDCA 피처 현황
    const pdcaStats = this.db.select({
      phase: pdcaFeatures.phase,
      count: sql<number>`count(*)`,
    }).from(pdcaFeatures).groupBy(pdcaFeatures.phase).all();

    return {
      tickets: ticketStats.map(r => ({ status: r.status, count: Number(r.count) })),
      agents: agentStats.map(r => ({ status: r.status, count: Number(r.count) })),
      totalCostCents: Number(costRow?.totalCents ?? 0),
      openBudgetIncidents: Number(incidentRow?.count ?? 0),
      pdcaFeatures: pdcaStats.map(r => ({ phase: r.phase, count: Number(r.count) })),
    };
  }
}
