// dashboard/server/routes/brick/links.ts — Links CRUD + DAG 순환 검증 (5 endpoints)
import type { Application, Request, Response } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { brickLinks } from '../../db/schema/brick.js';

// 6종 고정 카탈로그
const LINK_TYPES = [
  { name: 'sequential', displayName: '순차', style: 'solid', color: '#6B7280' },
  { name: 'parallel', displayName: '병렬', style: 'dashed', color: '#3B82F6' },
  { name: 'compete', displayName: '경쟁', style: 'solid', color: '#EF4444' },
  { name: 'loop', displayName: '반복', style: 'dotted', color: '#8B5CF6' },
  { name: 'cron', displayName: '크론', style: 'dashed', color: '#F59E0B' },
  { name: 'branch', displayName: '분기', style: 'solid', color: '#10B981' },
];

/** DAG 순환 검증: 새 link 추가 시 순환 발생 여부 체크 */
function hasCycle(db: BetterSQLite3Database, workflowId: number, fromBlock: string, toBlock: string): boolean {
  const links = db.select().from(brickLinks).where(eq(brickLinks.workflowId, workflowId)).all();
  // 인접 리스트 구성 (기존 link + 새 link)
  const adj = new Map<string, string[]>();
  for (const link of links) {
    if (!adj.has(link.fromBlock)) adj.set(link.fromBlock, []);
    adj.get(link.fromBlock)!.push(link.toBlock);
  }
  // 새 link 추가
  if (!adj.has(fromBlock)) adj.set(fromBlock, []);
  adj.get(fromBlock)!.push(toBlock);
  // DFS: toBlock에서 시작해서 fromBlock에 도달하면 순환
  const visited = new Set<string>();
  function dfs(node: string): boolean {
    if (node === fromBlock) return true;
    if (visited.has(node)) return false;
    visited.add(node);
    for (const next of adj.get(node) ?? []) {
      if (dfs(next)) return true;
    }
    return false;
  }
  return dfs(toBlock);
}

export function registerLinkRoutes(app: Application, db: BetterSQLite3Database) {
  // GET /api/brick/link-types — 6종 고정 카탈로그
  app.get('/api/brick/link-types', (_req: Request, res: Response) => {
    res.json(LINK_TYPES);
  });

  // GET /api/brick/links?workflowId=:id — 워크플로우별 Link 조회
  app.get('/api/brick/links', (req: Request, res: Response) => {
    try {
      const workflowId = req.query.workflowId;
      if (!workflowId) {
        return res.status(400).json({ error: 'workflowId 필수' });
      }
      const links = db.select().from(brickLinks).where(eq(brickLinks.workflowId, Number(workflowId))).all();
      res.json(links);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/links — Link 생성
  app.post('/api/brick/links', (req: Request, res: Response) => {
    try {
      const { workflowId, fromBlock, toBlock, linkType, condition, judge, cron } = req.body;
      if (!workflowId || !fromBlock || !toBlock) {
        return res.status(400).json({ error: '필수 필드 누락: workflowId, fromBlock, toBlock' });
      }
      // 자기참조 차단
      if (fromBlock === toBlock) {
        return res.status(400).json({ error: '자기참조 불가: fromBlock과 toBlock이 같습니다' });
      }
      // DAG 순환 검증
      if (hasCycle(db, Number(workflowId), fromBlock, toBlock)) {
        return res.status(400).json({ error: 'DAG 순환 감지: 이 Link를 추가하면 순환이 발생합니다' });
      }
      const result = db.insert(brickLinks).values({
        workflowId: Number(workflowId),
        fromBlock,
        toBlock,
        linkType: linkType || 'sequential',
        condition,
        judge,
        cron,
      }).returning().get();
      console.log(`[brick/links] 생성: ${fromBlock} → ${toBlock}`);
      res.status(201).json(result);
    } catch (e: any) {
      // UNIQUE 제약 위반
      if (String(e).includes('UNIQUE constraint failed') || String(e).includes('SQLITE_CONSTRAINT_UNIQUE')) {
        return res.status(409).json({ error: '중복 Link: 동일 워크플로우에 같은 fromBlock→toBlock 이미 존재' });
      }
      res.status(400).json({ error: String(e) });
    }
  });

  // PUT /api/brick/links/:id — Link 수정
  app.put('/api/brick/links/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = db.select().from(brickLinks).where(eq(brickLinks.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: 'Link 없음' });
      }
      const { linkType, condition, judge, cron } = req.body;
      const updated = db.update(brickLinks)
        .set({
          ...(linkType !== undefined && { linkType }),
          ...(condition !== undefined && { condition }),
          ...(judge !== undefined && { judge }),
          ...(cron !== undefined && { cron }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(brickLinks.id, id))
        .returning().get();
      console.log(`[brick/links] 수정: ${id}`);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/brick/links/:id — Link 삭제
  app.delete('/api/brick/links/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const deleted = db.delete(brickLinks).where(eq(brickLinks.id, id)).run();
      if (deleted.changes === 0) {
        return res.status(404).json({ error: 'Link 없음' });
      }
      console.log(`[brick/links] 삭제: ${id}`);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
