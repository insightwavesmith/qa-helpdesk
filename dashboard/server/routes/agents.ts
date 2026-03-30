// dashboard/server/routes/agents.ts — 에이전트 관리 API
import type { Application, Request, Response } from 'express';
import { AgentService } from '../services/agents.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { agents } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerAgentRoutes(app: Application, db: DB) {
  const svc = new AgentService(db);

  // GET /api/agents — 전체 목록
  app.get('/api/agents', (_req: Request, res: Response) => {
    try {
      const all = db.select().from(agents).all();
      res.json(all);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/agents/tree — Org Chart
  app.get('/api/agents/tree', async (_req: Request, res: Response) => {
    try {
      const tree = await svc.getTree();
      res.json(tree);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/agents — 등록
  app.post('/api/agents', async (req: Request, res: Response) => {
    try {
      const agent = await svc.register(req.body);
      res.status(201).json(agent);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // PATCH /api/agents/:id/status — 상태 변경
  app.patch('/api/agents/:id/status', async (req: Request, res: Response) => {
    try {
      await svc.updateStatus(req.params.id, req.body.status, req.body.reason);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/agents/sync — runtime 동기화
  app.post('/api/agents/sync', async (req: Request, res: Response) => {
    try {
      await svc.syncFromRuntime(req.body.peerMap ?? []);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/agents/check-idle — idle 체크 (수동 트리거)
  app.post('/api/agents/check-idle', async (_req: Request, res: Response) => {
    try {
      await svc.checkIdleAgents();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
