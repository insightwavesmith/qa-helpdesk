// dashboard/server/routes/budgets.ts — Budget API endpoints
import type { Application, Request, Response } from 'express';
import { BudgetService } from '../services/budgets.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerBudgetRoutes(app: Application, db: DB) {
  const svc = new BudgetService(db);

  // GET /api/budgets/policies — 정책 목록
  app.get('/api/budgets/policies', async (_req: Request, res: Response) => {
    try {
      const policies = svc.listPolicies();
      res.json(policies);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/budgets/policies — 정책 생성
  app.post('/api/budgets/policies', async (req: Request, res: Response) => {
    try {
      const policy = svc.createPolicy(req.body);
      res.status(201).json(policy);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // GET /api/budgets/incidents?resolved=0|1 — incident 목록
  app.get('/api/budgets/incidents', async (req: Request, res: Response) => {
    try {
      const resolved = req.query.resolved !== undefined
        ? req.query.resolved === '1'
        : undefined;
      const incidents = svc.listIncidents(resolved);
      res.json(incidents);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/budgets/incidents/:id/resolve — incident 해결
  app.post('/api/budgets/incidents/:id/resolve', async (req: Request, res: Response) => {
    try {
      await svc.resolveIncident(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });
}
