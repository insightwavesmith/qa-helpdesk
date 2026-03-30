// dashboard/server/routes/pdca.ts — PDCA API endpoints
import type { Application, Request, Response } from 'express';
import { eq, sql } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { pdcaFeatures } from '../db/schema.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export function registerPdcaRoutes(app: Application, db: DB) {
  // GET /api/pdca/features — 전체 피처 목록
  app.get('/api/pdca/features', async (_req: Request, res: Response) => {
    try {
      const features = db.select().from(pdcaFeatures).all();
      res.json(features);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/pdca/current — 현재 진행 중인 피처 (completed/archived 제외)
  app.get('/api/pdca/current', async (_req: Request, res: Response) => {
    try {
      const features = db.select().from(pdcaFeatures)
        .where(sql`${pdcaFeatures.phase} NOT IN ('completed', 'archived')`)
        .all();
      res.json(features);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/pdca/features/:id — 피처 상세
  app.get('/api/pdca/features/:id', async (req: Request, res: Response) => {
    try {
      const feature = db.select().from(pdcaFeatures)
        .where(eq(pdcaFeatures.id, req.params.id)).get();
      if (!feature) {
        res.status(404).json({ error: '피처를 찾을 수 없습니다' });
        return;
      }
      res.json(feature);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /api/pdca/features/:id — 피처 업데이트
  app.patch('/api/pdca/features/:id', async (req: Request, res: Response) => {
    try {
      db.update(pdcaFeatures).set({
        ...req.body,
        updatedAt: new Date().toISOString(),
      }).where(eq(pdcaFeatures.id, req.params.id)).run();
      const updated = db.select().from(pdcaFeatures)
        .where(eq(pdcaFeatures.id, req.params.id)).get();
      res.json(updated);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });
}
