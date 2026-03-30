// dashboard/server/services/tickets.ts
// Paperclip issues.ts 기반 — companyId/memberId/sprint/epic 제거, PDCA 연결 추가
import { eq, and, isNotNull, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { tickets, events } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface CreateTicketInput {
  feature: string;
  title: string;
  description?: string;
  priority?: 'critical' | 'high' | 'medium' | 'low';
  assigneeAgent?: string;
  assigneeTeam?: string;
  pdcaPhase?: 'plan' | 'design' | 'do' | 'check' | 'act' | 'deploy';
  processLevel?: 'L0' | 'L1' | 'L2' | 'L3';
  chainId?: string;
  chainStepId?: string;
  checklist?: ChecklistItem[];
}

type TicketStatus = 'backlog' | 'todo' | 'in_progress' | 'in_review' | 'completed' | 'cancelled';

export class TicketService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  async create(input: CreateTicketInput) {
    const ticket = this.db.insert(tickets).values({
      feature: input.feature,
      title: input.title,
      description: input.description,
      priority: input.priority ?? 'medium',
      assigneeAgent: input.assigneeAgent,
      assigneeTeam: input.assigneeTeam,
      pdcaPhase: input.pdcaPhase,
      processLevel: input.processLevel,
      chainId: input.chainId,
      chainStepId: input.chainStepId,
      checklist: JSON.stringify(input.checklist ?? []),
    }).returning().get();

    this.recordEvent('ticket.created', ticket.id, input);
    eventBus.publish({
      type: 'ticket.created',
      actor: 'system',
      targetType: 'ticket',
      targetId: ticket.id,
    });
    return ticket;
  }

  async changeStatus(id: string, newStatus: TicketStatus) {
    const ticket = this.db.select().from(tickets)
      .where(eq(tickets.id, id)).get();
    if (!ticket) throw new Error(`Ticket ${id} not found`);

    const updates: Record<string, unknown> = {
      status: newStatus,
      updatedAt: new Date().toISOString(),
    };
    if (newStatus === 'completed') {
      updates.completedAt = new Date().toISOString();
    }
    if (newStatus === 'in_progress' && !ticket.startedAt) {
      updates.startedAt = new Date().toISOString();
    }

    this.db.update(tickets).set(updates).where(eq(tickets.id, id)).run();
    this.recordEvent('ticket.status_changed', id, { from: ticket.status, to: newStatus });

    // completed → eventBus 알림 (체인 연결용)
    if (newStatus === 'completed') {
      eventBus.publish({
        type: 'ticket.completed',
        actor: 'system',
        targetType: 'ticket',
        targetId: id,
        payload: { chainStepId: ticket.chainStepId },
      });
    }
  }

  // P1, P3: 체크리스트 업데이트 + 자동 completed
  async updateChecklist(id: string, checklist: ChecklistItem[]) {
    this.db.update(tickets).set({
      checklist: JSON.stringify(checklist),
      updatedAt: new Date().toISOString(),
    }).where(eq(tickets.id, id)).run();

    this.recordEvent('ticket.checklist_updated', id, { checklist });

    const allDone = checklist.length > 0 && checklist.every(item => item.done);
    if (allDone) {
      await this.changeStatus(id, 'completed');
    }
  }

  // P2, P6: 커밋 기록
  async recordCommit(id: string, commitHash: string, changedFiles: number) {
    this.db.update(tickets).set({
      commitHash,
      changedFiles,
      updatedAt: new Date().toISOString(),
    }).where(eq(tickets.id, id)).run();
    this.recordEvent('ticket.commit_recorded', id, { commitHash, changedFiles });
  }

  // P6: push 확인
  async verifyPush(id: string) {
    this.db.update(tickets).set({
      pushVerified: 1,
      updatedAt: new Date().toISOString(),
    }).where(eq(tickets.id, id)).run();
    this.recordEvent('ticket.push_verified', id, {});
  }

  // P1 안전망: 커밋 있는데 completed 아닌 ticket 감지
  async findStaleTickets() {
    return this.db.select().from(tickets)
      .where(and(
        eq(tickets.status, 'in_progress'),
        isNotNull(tickets.commitHash),
      )).all();
  }

  async list(filters: { feature?: string; team?: string; status?: string } = {}) {
    const conditions = [];
    if (filters.feature) conditions.push(eq(tickets.feature, filters.feature));
    if (filters.team) conditions.push(eq(tickets.assigneeTeam, filters.team));
    if (filters.status) conditions.push(eq(tickets.status, filters.status as TicketStatus));

    if (conditions.length > 0) {
      return this.db.select().from(tickets)
        .where(and(...conditions))
        .orderBy(sql`rowid DESC`)
        .all();
    }
    return this.db.select().from(tickets)
      .orderBy(sql`rowid DESC`)
      .all();
  }

  private recordEvent(type: string, targetId: string, payload: unknown) {
    this.db.insert(events).values({
      eventType: type,
      actor: 'system',
      targetType: 'ticket',
      targetId,
      payload: JSON.stringify(payload),
    }).run();
  }
}
