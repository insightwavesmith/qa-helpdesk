// dashboard/server/routes/costs.ts — Cost API endpoints
import type { Application, Request, Response } from 'express';
import { CostService } from '../services/costs.js';
import { BudgetService } from '../services/budgets.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerCostRoutes(app: Application, db: DB) {
  const budgetSvc = new BudgetService(db);
  const svc = new CostService(db, budgetSvc);

  // POST /api/costs — 비용 이벤트 기록
  app.post('/api/costs', async (req: Request, res: Response) => {
    try {
      const event = await svc.recordCost(req.body);
      res.status(201).json(event);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // GET /api/costs/summary — 전체 비용 요약
  app.get('/api/costs/summary', async (_req: Request, res: Response) => {
    try {
      const summary = await svc.getCostSummary();
      res.json(summary);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/costs/by-agent — 에이전트별 비용
  app.get('/api/costs/by-agent', async (_req: Request, res: Response) => {
    try {
      const result = await svc.getCostByAgent();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/costs/by-model — 모델별 비용
  app.get('/api/costs/by-model', async (_req: Request, res: Response) => {
    try {
      const result = await svc.getCostByModel();
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/costs/window?kind=daily|weekly|monthly — 윈도우별 지출
  app.get('/api/costs/window', async (req: Request, res: Response) => {
    try {
      const kind = (req.query.kind as string) || 'monthly';
      const spend = await svc.getWindowSpend(kind as 'daily' | 'weekly' | 'monthly');
      res.json({ kind, spendCents: spend });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
