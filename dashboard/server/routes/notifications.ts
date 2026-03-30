// dashboard/server/routes/notifications.ts — Notification API endpoints
import type { Application, Request, Response } from 'express';
import { NotificationService } from '../services/notifications.js';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerNotificationRoutes(app: Application, db: DB) {
  const svc = new NotificationService(db);

  // GET /api/notifications — 알림 목록
  app.get('/api/notifications', async (req: Request, res: Response) => {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const list = svc.list(limit);
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/notifications/unread — 미읽은 알림
  app.get('/api/notifications/unread', async (_req: Request, res: Response) => {
    try {
      const list = svc.listUnread();
      res.json(list);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/notifications/unread-count — 미읽은 알림 수
  app.get('/api/notifications/unread-count', async (_req: Request, res: Response) => {
    try {
      const count = svc.unreadCount();
      res.json({ count });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/notifications/:id/read — 알림 읽음 처리
  app.post('/api/notifications/:id/read', async (req: Request, res: Response) => {
    try {
      svc.markAsRead(parseInt(req.params.id));
      res.json({ ok: true });
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // POST /api/notifications/read-all — 전체 읽음 처리
  app.post('/api/notifications/read-all', async (_req: Request, res: Response) => {
    try {
      svc.markAllAsRead();
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
