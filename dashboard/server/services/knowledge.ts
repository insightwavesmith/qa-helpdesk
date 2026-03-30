// dashboard/server/services/knowledge.ts
// 에이전트 학습 데이터 서비스 — knowledgeEntries CRUD + 통계
import { eq, and, like, sql, desc } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { knowledgeEntries } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export class KnowledgeService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  /** 학습 항목 생성 */
  addEntry(data: {
    agentId: string;
    category?: string;
    title: string;
    content: string;
    sourceTicketId?: string;
    tags?: string[];
  }) {
    const entry = this.db.insert(knowledgeEntries).values({
      agentId: data.agentId,
      category: (data.category ?? 'general') as typeof knowledgeEntries.$inferInsert.category,
      title: data.title,
      content: data.content,
      sourceTicketId: data.sourceTicketId,
      tags: JSON.stringify(data.tags ?? []),
    }).returning().get();

    eventBus.publish({
      type: 'knowledge.created',
      actor: 'system',
      targetType: 'knowledge_entry',
      targetId: entry.id,
      payload: {
        entryId: entry.id,
        agentId: data.agentId,
        category: entry.category,
        title: data.title,
      },
    });

    return entry;
  }

  /** 에이전트별 학습 조회 */
  getByAgent(agentId: string, opts?: { category?: string; limit?: number }) {
    const conditions = opts?.category
      ? and(eq(knowledgeEntries.agentId, agentId), eq(knowledgeEntries.category, opts.category))
      : eq(knowledgeEntries.agentId, agentId);

    const query = this.db.select().from(knowledgeEntries)
      .where(conditions)
      .orderBy(desc(knowledgeEntries.learnedAt));

    if (opts?.limit) {
      return query.limit(opts.limit).all();
    }
    return query.all();
  }

  /** 카테고리별 조회 */
  getByCategory(category: string, opts?: { limit?: number }) {
    const query = this.db.select().from(knowledgeEntries)
      .where(eq(knowledgeEntries.category, category))
      .orderBy(desc(knowledgeEntries.learnedAt));

    if (opts?.limit) {
      return query.limit(opts.limit).all();
    }
    return query.all();
  }

  /** 태그 검색 (LIKE '%tag%') */
  searchByTag(tag: string) {
    return this.db.select().from(knowledgeEntries)
      .where(like(knowledgeEntries.tags, `%${tag}%`))
      .orderBy(desc(knowledgeEntries.learnedAt))
      .all();
  }

  /** 학습 항목 수정 */
  updateEntry(id: string, data: Partial<{ title: string; content: string; tags: string[]; category: string }>) {
    const updateData: Record<string, unknown> = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.content !== undefined) updateData.content = data.content;
    if (data.tags !== undefined) updateData.tags = JSON.stringify(data.tags);
    if (data.category !== undefined) updateData.category = data.category;

    this.db.update(knowledgeEntries)
      .set(updateData)
      .where(eq(knowledgeEntries.id, id))
      .run();
  }

  /** 학습 항목 삭제 */
  deleteEntry(id: string) {
    this.db.delete(knowledgeEntries)
      .where(eq(knowledgeEntries.id, id))
      .run();
  }

  /** 에이전트별 카테고리 통계 */
  getStatsByAgent(agentId: string): { category: string; count: number }[] {
    const rows = this.db.select({
      category: knowledgeEntries.category,
      count: sql<number>`count(*)`,
    })
      .from(knowledgeEntries)
      .where(eq(knowledgeEntries.agentId, agentId))
      .groupBy(knowledgeEntries.category)
      .all();

    return rows.map(r => ({
      category: r.category,
      count: Number(r.count),
    }));
  }
}
