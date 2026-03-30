// dashboard/server/routes/hooks.ts — Hook 브릿지 API
import fs from 'fs';
import path from 'path';
import type { Application, Request, Response } from 'express';
import { eq, and, sql } from 'drizzle-orm';
import { HookBridgeService } from '../services/hook-bridge.js';
import { TicketService } from '../services/tickets.js';
import { ChainService } from '../services/chains.js';
import { tickets, events } from '../db/schema.js';
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

  // POST /api/hooks/chain-handoff — 체인 자동 전환
  app.post('/api/hooks/chain-handoff', async (req: Request, res: Response) => {
    try {
      const { chainId, currentStepOrder } = req.body;
      if (!chainId || currentStepOrder == null) {
        return res.status(400).json({ error: 'chainId, currentStepOrder 필수' });
      }
      await chainSvc.triggerNextStep(chainId, currentStepOrder);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/hooks/commit — 커밋 기록
  app.post('/api/hooks/commit', async (req: Request, res: Response) => {
    try {
      const { commitHash, changedFiles, feature } = req.body;
      // feature로 in_progress ticket 찾기
      const ticket = db.select().from(tickets)
        .where(and(eq(tickets.status, 'in_progress'), feature ? eq(tickets.feature, feature) : undefined))
        .orderBy(sql`rowid DESC`)
        .get();

      if (ticket && commitHash) {
        await ticketSvc.recordCommit(ticket.id, commitHash, changedFiles ?? 0);
        res.json({ ok: true, ticketId: ticket.id });
      } else {
        // ticket 없어도 이벤트만 기록
        db.insert(events).values({
          eventType: 'system.commit_recorded',
          actor: 'hook:commit',
          payload: JSON.stringify(req.body),
        }).run();
        res.json({ ok: true, ticketId: null });
      }
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/hooks/chain-status — .bkit/runtime/chain-status-*.json 전체 반환
  app.get('/api/hooks/chain-status', (_req: Request, res: Response) => {
    try {
      const runtimeDir = path.join(process.cwd(), '..', '.bkit', 'runtime');
      const files = fs.readdirSync(runtimeDir)
        .filter((f: string) => f.startsWith('chain-status-') && f.endsWith('.json'));
      const statuses = files.map((f: string) => {
        try { return JSON.parse(fs.readFileSync(path.join(runtimeDir, f), 'utf-8')); }
        catch { return null; }
      }).filter(Boolean);
      res.json({ statuses });
    } catch (_e) {
      res.json({ statuses: [] });
    }
  });
}
