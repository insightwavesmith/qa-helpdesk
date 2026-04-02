// dashboard/server/routes/brick/notify.ts — Brick 알림 테스트 API
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

export function registerNotifyRoutes(app: Application, _db: BetterSQLite3Database) {
  // POST /api/brick/notify/test — 알림 테스트 발송 (placeholder)
  app.post('/api/brick/notify/test', (req, res) => {
    console.log('[brick-notify] 알림 테스트 발송:', req.body);
    res.json({ result: 'success', message: '알림 테스트 완료' });
  });
}
