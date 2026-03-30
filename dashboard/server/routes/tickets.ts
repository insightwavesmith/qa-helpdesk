// dashboard/server/routes/tickets.ts — 7 Ticket API endpoints
import type { Application, Request, Response } from 'express';
import { TicketService } from '../services/tickets.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerTicketRoutes(app: Application, db: DB) {
  const svc = new TicketService(db);

  // GET /api/tickets?feature=&team=&status=
  app.get('/api/tickets', async (req: Request, res: Response) => {
    try {
      const filters = {
        feature: req.query.feature as string | undefined,
        team: req.query.team as string | undefined,
        status: req.query.status as string | undefined,
      };
      const list = await svc.list(filters);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/tickets/stale
  app.get('/api/tickets/stale', async (_req: Request, res: Response) => {
    try {
      const stale = await svc.findStaleTickets();
      res.json(stale);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/tickets
  app.post('/api/tickets', async (req: Request, res: Response) => {
    try {
      const ticket = await svc.create(req.body);
      res.status(201).json(ticket);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // PATCH /api/tickets/:id/status
  app.patch('/api/tickets/:id/status', async (req: Request, res: Response) => {
    try {
      await svc.changeStatus(req.params.id, req.body.status);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // PATCH /api/tickets/:id/checklist
  app.patch('/api/tickets/:id/checklist', async (req: Request, res: Response) => {
    try {
      await svc.updateChecklist(req.params.id, req.body.checklist);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/tickets/:id/commit
  app.post('/api/tickets/:id/commit', async (req: Request, res: Response) => {
    try {
      await svc.recordCommit(req.params.id, req.body.commitHash, req.body.changedFiles);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/tickets/:id/push
  app.post('/api/tickets/:id/push', async (req: Request, res: Response) => {
    try {
      await svc.verifyPush(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });
}
