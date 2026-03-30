// dashboard/server/routes/routines.ts — Routine API endpoints
import type { Application, Request, Response } from 'express';
import { RoutineService } from '../services/routines.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerRoutineRoutes(app: Application, db: DB) {
  const svc = new RoutineService(db);

  // GET /api/routines — 목록
  app.get('/api/routines', async (req: Request, res: Response) => {
    try {
      const enabled = req.query.enabled !== undefined
        ? req.query.enabled === '1'
        : undefined;
      const list = svc.list(enabled !== undefined ? { enabled } : {});
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/routines — 생성
  app.post('/api/routines', async (req: Request, res: Response) => {
    try {
      const routine = svc.create(req.body);
      res.status(201).json(routine);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // PATCH /api/routines/:id — 수정
  app.patch('/api/routines/:id', async (req: Request, res: Response) => {
    try {
      const updated = svc.update(req.params.id, req.body);
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // DELETE /api/routines/:id — 삭제
  app.delete('/api/routines/:id', async (req: Request, res: Response) => {
    try {
      svc.delete(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/routines/:id/run — 즉시 실행
  app.post('/api/routines/:id/run', async (req: Request, res: Response) => {
    try {
      const result = await svc.executeRoutine(req.params.id);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
