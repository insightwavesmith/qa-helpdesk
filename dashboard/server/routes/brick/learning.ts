// dashboard/server/routes/brick/learning.ts — Brick 학습 제안 API
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { brickLearningProposals } from '../../db/schema/brick.js';

export function registerLearningRoutes(app: Application, db: BetterSQLite3Database) {
  // GET /api/brick/learning/proposals — 제안 목록
  app.get('/api/brick/learning/proposals', (_req, res) => {
    try {
      const proposals = db.select().from(brickLearningProposals).all();
      console.log('[brick-learning] 제안 목록 조회:', proposals.length, '건');
      res.json(proposals);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/learning/:id/approve — 제안 승인
  app.post('/api/brick/learning/:id/approve', (req, res) => {
    try {
      const updated = db.update(brickLearningProposals)
        .set({
          status: 'approved',
          reviewedBy: req.body.reviewedBy || 'unknown',
          reviewedAt: new Date().toISOString(),
        })
        .where(eq(brickLearningProposals.id, Number(req.params.id)))
        .returning()
        .get();

      if (!updated) {
        return res.status(404).json({ error: '제안 없음' });
      }

      console.log('[brick-learning] 제안 승인:', req.params.id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/learning/:id/reject — 제안 거부
  app.post('/api/brick/learning/:id/reject', (req, res) => {
    try {
      const { rejectReason } = req.body;
      if (!rejectReason) {
        return res.status(400).json({ error: '거부 사유 필수' });
      }

      const updated = db.update(brickLearningProposals)
        .set({
          status: 'rejected',
          reviewedBy: req.body.reviewedBy || 'unknown',
          reviewedAt: new Date().toISOString(),
          rejectReason,
        })
        .where(eq(brickLearningProposals.id, Number(req.params.id)))
        .returning()
        .get();

      if (!updated) {
        return res.status(404).json({ error: '제안 없음' });
      }

      console.log('[brick-learning] 제안 거부:', req.params.id, rejectReason);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
