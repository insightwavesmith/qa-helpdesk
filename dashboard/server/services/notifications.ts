// dashboard/server/services/notifications.ts
// 이벤트 → 알림 변환, 읽음/미읽음 관리
import { eq, sql, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { notifications } from '../db/schema.js';
import { eventBus, type BusEvent } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

// 이벤트 → 알림 매핑
const EVENT_NOTIFICATION_MAP: Record<string, { type: string; titleFn: (e: BusEvent) => string; messageFn: (e: BusEvent) => string }> = {
  'ticket.completed': {
    type: 'success',
    titleFn: () => '태스크 완료',
    messageFn: (e) => `태스크 ${e.targetId}가 완료되었습니다.`,
  },
  'budget.warn': {
    type: 'warning',
    titleFn: () => '예산 경고',
    messageFn: (e) => `예산 ${e.payload?.policyId} 경고 임계치 도달 (${e.payload?.agentId})`,
  },
  'budget.hard_stop': {
    type: 'error',
    titleFn: () => '예산 초과 — 에이전트 정지',
    messageFn: (e) => `에이전트 ${e.payload?.agentId} 예산 초과로 정지됨`,
  },
  'chain.step_completed': {
    type: 'info',
    titleFn: () => '체인 단계 완료',
    messageFn: (e) => `체인 단계 ${e.targetId} 완료`,
  },
  'agent.idle_warning': {
    type: 'warning',
    titleFn: () => '에이전트 유휴 경고',
    messageFn: (e) => `에이전트 ${e.targetId} 유휴 상태 감지`,
  },
};

export class NotificationService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
    this.setupListeners();
  }

  private setupListeners() {
    eventBus.subscribe('*', (event: BusEvent) => {
      const mapping = EVENT_NOTIFICATION_MAP[event.type];
      if (!mapping) return;

      this.db.insert(notifications).values({
        type: mapping.type,
        title: mapping.titleFn(event),
        message: mapping.messageFn(event),
        sourceEventId: null, // event.id는 auto-increment로 직접 매핑 어려움
      }).run();
    });
  }

  list(limit = 50) {
    return this.db.select().from(notifications)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .all();
  }

  listUnread() {
    return this.db.select().from(notifications)
      .where(eq(notifications.read, 0))
      .orderBy(desc(notifications.createdAt))
      .all();
  }

  markAsRead(id: number) {
    this.db.update(notifications).set({ read: 1 })
      .where(eq(notifications.id, id)).run();
  }

  markAllAsRead() {
    this.db.update(notifications).set({ read: 1 })
      .where(eq(notifications.read, 0)).run();
  }

  unreadCount(): number {
    const [row] = this.db.select({
      count: sql<number>`count(*)`,
    }).from(notifications).where(eq(notifications.read, 0)).all();
    return Number(row?.count ?? 0);
  }
}
