// dashboard/server/routes/chains.ts — 7 Chain API endpoints
import type { Application, Request, Response } from 'express';
import { ChainService } from '../services/chains.js';
import { TicketService } from '../services/tickets.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerChainRoutes(app: Application, db: DB) {
  const ticketSvc = new TicketService(db);
  const svc = new ChainService(db, ticketSvc);

  // GET /api/chains
  app.get('/api/chains', async (_req: Request, res: Response) => {
    try {
      const chains = await svc.listChains();
      res.json(chains);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/chains
  app.post('/api/chains', async (req: Request, res: Response) => {
    try {
      const chain = await svc.createChain(req.body);
      res.status(201).json(chain);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/chains/:id/steps
  app.post('/api/chains/:id/steps', async (req: Request, res: Response) => {
    try {
      const step = await svc.addStep(req.params.id, req.body);
      res.status(201).json(step);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // PUT /api/chains/:id/steps/reorder
  app.put('/api/chains/:id/steps/reorder', async (req: Request, res: Response) => {
    try {
      await svc.reorderSteps(req.params.id, req.body.stepIds);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/chains/:id/evaluate/:stepId
  app.post('/api/chains/:id/evaluate/:stepId', async (req: Request, res: Response) => {
    try {
      const result = await svc.evaluateCompletion(req.params.stepId, req.body);
      res.json({ completed: result });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/chains/:id/trigger
  app.post('/api/chains/:id/trigger', async (req: Request, res: Response) => {
    try {
      await svc.triggerNextStep(req.params.id, req.body.currentOrder);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/chains/:id/deploy/:stepId
  app.post('/api/chains/:id/deploy/:stepId', async (req: Request, res: Response) => {
    try {
      const result = await svc.executeDeployStep({
        id: req.params.stepId,
        deployConfig: req.body.deployConfig ?? null,
      });
      res.json({ success: result });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
