// dashboard/server/routes/brick/review.ts — Brick 리뷰 API
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq } from 'drizzle-orm';
import { brickGateResults } from '../../db/schema/brick.js';

export function registerReviewRoutes(app: Application, db: BetterSQLite3Database) {
  // POST /api/brick/review/:executionId/:blockId/approve — 리뷰 승인
  app.post('/api/brick/review/:executionId/:blockId/approve', (req, res) => {
    try {
      const { executionId, blockId } = req.params;

      // gate 통과 기록 생성
      const result = db.insert(brickGateResults).values({
        executionId: Number(executionId),
        blockId,
        handlerType: 'review',
        passed: true,
        detail: JSON.stringify({ approvedBy: req.body.reviewer || 'unknown' }),
      }).returning().get();

      console.log('[brick-review] 리뷰 승인:', executionId, blockId);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/review/:executionId/:blockId/reject — 리뷰 거부
  app.post('/api/brick/review/:executionId/:blockId/reject', (req, res) => {
    try {
      const { executionId, blockId } = req.params;
      const { rejectReason } = req.body;

      if (!rejectReason) {
        return res.status(400).json({ error: '거부 사유 필수' });
      }

      const result = db.insert(brickGateResults).values({
        executionId: Number(executionId),
        blockId,
        handlerType: 'review',
        passed: false,
        detail: JSON.stringify({ rejectReason, rejectedBy: req.body.reviewer || 'unknown' }),
      }).returning().get();

      console.log('[brick-review] 리뷰 거부:', executionId, blockId, rejectReason);
      res.json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
