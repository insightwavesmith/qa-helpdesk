// dashboard/server/routes/hooks.ts — Hook 브릿지 API
import type { Application, Request, Response } from 'express';
import { HookBridgeService } from '../services/hook-bridge.js';
import { TicketService } from '../services/tickets.js';
import { ChainService } from '../services/chains.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerHookRoutes(app: Application, db: DB) {
  const ticketSvc = new TicketService(db);
  const chainSvc = new ChainService(db, ticketSvc);
  const hookSvc = new HookBridgeService(db, ticketSvc, chainSvc);

  // POST /api/hooks/task-completed — bash hook에서 호출
  app.post('/api/hooks/task-completed', async (req: Request, res: Response) => {
    try {
      const payload = {
        commitHash: req.body.commit_hash ?? req.body.commitHash,
        changedFiles: req.body.changed_files ?? req.body.changedFiles,
        matchRate: req.body.match_rate ?? req.body.matchRate,
        buildSuccess: req.body.build_success ?? req.body.buildSuccess,
        feature: req.body.feature,
      };
      await hookSvc.onTaskCompleted(payload);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/hooks/sync-pdca — pdca-status.json 수동 동기화
  app.post('/api/hooks/sync-pdca', async (_req: Request, res: Response) => {
    try {
      await hookSvc.syncToPdcaStatusJson();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
