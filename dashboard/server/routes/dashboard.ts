// dashboard/server/routes/dashboard.ts — Dashboard API endpoints
import type { Application, Request, Response } from 'express';
import { DashboardService } from '../services/dashboard.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerDashboardRoutes(app: Application, db: DB) {
  const svc = new DashboardService(db);

  // GET /api/dashboard/summary — 대시보드 요약 통계
  app.get('/api/dashboard/summary', async (_req: Request, res: Response) => {
    try {
      const stats = svc.getSummaryStats();
      res.json(stats);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
