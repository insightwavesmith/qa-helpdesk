// dashboard/server/routes/brick/gates.ts — Brick Gate API
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { requireApprover } from '../../middleware/brick-auth.js';
import { eq } from 'drizzle-orm';
import { brickGateResults } from '../../db/schema/brick.js';

export function registerGateRoutes(app: Application, db: BetterSQLite3Database) {
  // GET /api/brick/gates/:gateId/result — Gate 결과 조회
  app.get('/api/brick/gates/:gateId/result', (req, res) => {
    try {
      const result = db.select().from(brickGateResults)
        .where(eq(brickGateResults.id, Number(req.params.gateId)))
        .get();

      if (!result) {
        return res.status(404).json({ error: 'Gate 결과 없음' });
      }

      console.log('[brick-gates] Gate 결과 조회:', req.params.gateId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/gates/:gateId/override — Gate 강제 pass
  app.post('/api/brick/gates/:gateId/override', requireApprover, (req, res) => {
    try {
      const updated = db.update(brickGateResults)
        .set({ passed: true })
        .where(eq(brickGateResults.id, Number(req.params.gateId)))
        .returning()
        .get();

      if (!updated) {
        return res.status(404).json({ error: 'Gate 결과 없음' });
      }

      console.log('[brick-gates] Gate 강제 pass:', req.params.gateId);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
