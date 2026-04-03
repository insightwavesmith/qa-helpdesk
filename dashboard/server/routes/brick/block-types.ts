// dashboard/server/routes/brick/block-types.ts — Block Types CRUD (4 endpoints)
import type { Application, Request, Response } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { brickBlockTypes } from '../../db/schema/brick.js';

export function registerBlockTypeRoutes(app: Application, db: BetterSQLite3Database) {
  // GET /api/brick/block-types — 전체 조회
  app.get('/api/brick/block-types', (_req: Request, res: Response) => {
    try {
      const blockTypes = db.select().from(brickBlockTypes).all();
      res.json(blockTypes);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/block-types — 생성
  app.post('/api/brick/block-types', (req: Request, res: Response) => {
    try {
      const { name, displayName, icon, color, category, config, thinkLogRequired } = req.body;
      if (!name || !displayName || !icon || !color || !category) {
        return res.status(400).json({ error: '필수 필드 누락: name, displayName, icon, color, category' });
      }
      // name 중복 체크
      const existing = db.select().from(brickBlockTypes).where(eq(brickBlockTypes.name, name)).get();
      if (existing) {
        return res.status(409).json({ error: `이미 존재하는 블록 타입: ${name}` });
      }
      const result = db.insert(brickBlockTypes).values({
        name, displayName, icon, color, category, config,
        thinkLogRequired: thinkLogRequired ?? false,
      }).returning().get();
      console.log(`[brick/block-types] 생성: ${name}`);
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // PUT /api/brick/block-types/:name — 수정
  app.put('/api/brick/block-types/:name', (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const existing = db.select().from(brickBlockTypes).where(eq(brickBlockTypes.name, name)).get();
      if (!existing) {
        return res.status(404).json({ error: `블록 타입 없음: ${name}` });
      }
      if (existing.isCore) {
        return res.status(403).json({ error: '내장 블록 타입은 수정할 수 없습니다' });
      }
      const { displayName, icon, color, category, config, thinkLogRequired } = req.body;
      const updated = db.update(brickBlockTypes)
        .set({
          ...(displayName !== undefined && { displayName }),
          ...(icon !== undefined && { icon }),
          ...(color !== undefined && { color }),
          ...(category !== undefined && { category }),
          ...(config !== undefined && { config }),
          ...(thinkLogRequired !== undefined && { thinkLogRequired }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(brickBlockTypes.name, name))
        .returning().get();
      console.log(`[brick/block-types] 수정: ${name}`);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/brick/block-types/:name — 삭제
  app.delete('/api/brick/block-types/:name', (req: Request, res: Response) => {
    try {
      const { name } = req.params;
      const existing = db.select().from(brickBlockTypes).where(eq(brickBlockTypes.name, name)).get();
      if (!existing) {
        return res.status(404).json({ error: `블록 타입 없음: ${name}` });
      }
      if (existing.isCore) {
        return res.status(403).json({ error: '내장 블록 타입은 삭제할 수 없습니다' });
      }
      db.delete(brickBlockTypes).where(eq(brickBlockTypes.name, name)).run();
      console.log(`[brick/block-types] 삭제: ${name}`);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
