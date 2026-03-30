import { describe, it, expect, vi, beforeEach } from 'vitest';
import { testDb, cleanDb } from '../setup';
import * as schema from '../../server/db/schema';
import { eq } from 'drizzle-orm';
import { KnowledgeService } from '../../server/services/knowledge';
import { eventBus } from '../../server/event-bus';

let svc: KnowledgeService;

// 헬퍼: 에이전트 생성
function createAgent(id: string, name: string) {
  testDb.insert(schema.agents).values({
    id,
    name,
    role: 'developer',
    status: 'running',
  }).run();
}

// 헬퍼: 티켓 생성
function createTicket(id: string, feature: string, title: string) {
  testDb.insert(schema.tickets).values({
    id,
    feature,
    title,
    status: 'in_progress',
    priority: 'medium',
  }).run();
}

beforeEach(() => {
  svc = new KnowledgeService(testDb);
});

describe('KnowledgeService', () => {
  // TC-K01: 학습 항목 생성 — knowledgeEntries INSERT 확인
  it('TC-K01: 학습 항목 생성 → knowledgeEntries INSERT + 이벤트', () => {
    createAgent('agent-1', 'backend-dev');

    const handler = vi.fn();
    eventBus.subscribe('knowledge.created', handler);

    const entry = svc.addEntry({
      agentId: 'agent-1',
      category: 'pattern',
      title: 'Supabase RLS 패턴',
      content: 'SECURITY DEFINER 사용 시 SET search_path = public 필수',
      tags: ['supabase', 'rls'],
    });

    expect(entry.id).toBeDefined();
    expect(entry.agentId).toBe('agent-1');
    expect(entry.category).toBe('pattern');
    expect(entry.title).toBe('Supabase RLS 패턴');

    const rows = testDb.select().from(schema.knowledgeEntries).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].content).toBe('SECURITY DEFINER 사용 시 SET search_path = public 필수');
    expect(JSON.parse(rows[0].tags!)).toEqual(['supabase', 'rls']);

    expect(handler).toHaveBeenCalled();
    eventBus.unsubscribe('knowledge.created', handler);
  });

  // TC-K02: 에이전트별 학습 조회 — agentId 필터 정확
  it('TC-K02: 에이전트별 학습 조회 → agentId 필터', () => {
    createAgent('agent-1', 'backend-dev');
    createAgent('agent-2', 'frontend-dev');

    svc.addEntry({ agentId: 'agent-1', title: 'BE 패턴 1', content: '내용 1' });
    svc.addEntry({ agentId: 'agent-1', title: 'BE 패턴 2', content: '내용 2' });
    svc.addEntry({ agentId: 'agent-2', title: 'FE 패턴 1', content: '내용 3' });

    const result = svc.getByAgent('agent-1');
    expect(result).toHaveLength(2);
    expect(result.every(r => r.agentId === 'agent-1')).toBe(true);
  });

  // TC-K03: 카테고리별 조회 — category 필터 정확
  it('TC-K03: 카테고리별 조회 → category 필터', () => {
    createAgent('agent-1', 'backend-dev');

    svc.addEntry({ agentId: 'agent-1', category: 'pattern', title: '패턴 1', content: '내용' });
    svc.addEntry({ agentId: 'agent-1', category: 'mistake', title: '실수 1', content: '내용' });
    svc.addEntry({ agentId: 'agent-1', category: 'pattern', title: '패턴 2', content: '내용' });

    const patterns = svc.getByCategory('pattern');
    expect(patterns).toHaveLength(2);
    expect(patterns.every(r => r.category === 'pattern')).toBe(true);

    const mistakes = svc.getByCategory('mistake');
    expect(mistakes).toHaveLength(1);
  });

  // TC-K04: 태그 검색 — tags JSON에 특정 태그 포함 여부 LIKE 검색
  it('TC-K04: 태그 검색 → LIKE 검색', () => {
    createAgent('agent-1', 'backend-dev');

    svc.addEntry({ agentId: 'agent-1', title: '항목 1', content: '내용', tags: ['supabase', 'rls'] });
    svc.addEntry({ agentId: 'agent-1', title: '항목 2', content: '내용', tags: ['firebase', 'auth'] });
    svc.addEntry({ agentId: 'agent-1', title: '항목 3', content: '내용', tags: ['supabase', 'storage'] });

    const result = svc.searchByTag('supabase');
    expect(result).toHaveLength(2);
    expect(result.map(r => r.title).sort()).toEqual(['항목 1', '항목 3']);
  });

  // TC-K05: 티켓 연결 — sourceTicketId FK로 학습 출처 추적
  it('TC-K05: 티켓 연결 → sourceTicketId FK', () => {
    createAgent('agent-1', 'backend-dev');
    createTicket('ticket-1', 'auth', '인증 구현');

    const entry = svc.addEntry({
      agentId: 'agent-1',
      title: '인증 교훈',
      content: 'Firebase 전환 시 uid 캐스케이드 필수',
      sourceTicketId: 'ticket-1',
    });

    expect(entry.sourceTicketId).toBe('ticket-1');

    const row = testDb.select().from(schema.knowledgeEntries)
      .where(eq(schema.knowledgeEntries.id, entry.id)).get();
    expect(row!.sourceTicketId).toBe('ticket-1');
  });

  // TC-K06: 학습 항목 수정 — title, content, tags 업데이트
  it('TC-K06: 학습 항목 수정 → title, content, tags 업데이트', () => {
    createAgent('agent-1', 'backend-dev');

    const entry = svc.addEntry({
      agentId: 'agent-1',
      title: '원래 제목',
      content: '원래 내용',
      tags: ['old'],
    });

    svc.updateEntry(entry.id, {
      title: '수정된 제목',
      content: '수정된 내용',
      tags: ['new', 'updated'],
    });

    const updated = testDb.select().from(schema.knowledgeEntries)
      .where(eq(schema.knowledgeEntries.id, entry.id)).get();

    expect(updated!.title).toBe('수정된 제목');
    expect(updated!.content).toBe('수정된 내용');
    expect(JSON.parse(updated!.tags!)).toEqual(['new', 'updated']);
  });

  // TC-K07: 학습 항목 삭제 — DELETE 확인
  it('TC-K07: 학습 항목 삭제 → DELETE', () => {
    createAgent('agent-1', 'backend-dev');

    const entry = svc.addEntry({
      agentId: 'agent-1',
      title: '삭제 대상',
      content: '내용',
    });

    expect(testDb.select().from(schema.knowledgeEntries).all()).toHaveLength(1);

    svc.deleteEntry(entry.id);

    expect(testDb.select().from(schema.knowledgeEntries).all()).toHaveLength(0);
  });

  // TC-K08: 에이전트별 카테고리 통계 — GROUP BY category, COUNT 집계
  it('TC-K08: 에이전트별 카테고리 통계 → GROUP BY + COUNT', () => {
    createAgent('agent-1', 'backend-dev');

    svc.addEntry({ agentId: 'agent-1', category: 'pattern', title: '패턴 1', content: '내용' });
    svc.addEntry({ agentId: 'agent-1', category: 'pattern', title: '패턴 2', content: '내용' });
    svc.addEntry({ agentId: 'agent-1', category: 'mistake', title: '실수 1', content: '내용' });
    svc.addEntry({ agentId: 'agent-1', category: 'architecture', title: '아키텍처 1', content: '내용' });

    const stats = svc.getStatsByAgent('agent-1');

    expect(stats).toHaveLength(3);

    const patternStat = stats.find(s => s.category === 'pattern');
    expect(patternStat!.count).toBe(2);

    const mistakeStat = stats.find(s => s.category === 'mistake');
    expect(mistakeStat!.count).toBe(1);

    const archStat = stats.find(s => s.category === 'architecture');
    expect(archStat!.count).toBe(1);
  });
});
