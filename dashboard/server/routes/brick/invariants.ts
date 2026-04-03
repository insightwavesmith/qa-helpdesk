// dashboard/server/routes/brick/invariants.ts — 불변식 CRUD
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, and } from 'drizzle-orm';
import { brickInvariants, brickInvariantHistory } from '../../db/schema/brick.js';

export function registerInvariantRoutes(app: Application, db: BetterSQLite3Database) {

  // POST /api/brick/invariants — 불변식 등록
  app.post('/api/brick/invariants', (req, res) => {
    try {
      const { id, projectId, designSource, description, constraintType, constraintValue } = req.body;
      if (!id || !projectId || !designSource || !description || !constraintType) {
        return res.status(400).json({ error: 'id, projectId, designSource, description, constraintType 필수' });
      }

      const existing = db.select({ id: brickInvariants.id }).from(brickInvariants)
        .where(and(
          eq(brickInvariants.id, id),
          eq(brickInvariants.projectId, projectId),
        )).get();

      if (existing) {
        return res.status(409).json({ error: '이미 존재하는 불변식 ID' });
      }

      db.insert(brickInvariants).values({
        id,
        projectId,
        designSource,
        description,
        constraintType,
        constraintValue: typeof constraintValue === 'object' ? JSON.stringify(constraintValue) : (constraintValue ?? '{}'),
        status: 'active',
        version: 1,
      }).run();

      const row = db.select().from(brickInvariants)
        .where(and(
          eq(brickInvariants.id, id),
          eq(brickInvariants.projectId, projectId),
        )).get();

      console.log('[brick-invariants] 불변식 등록:', id);
      res.status(201).json(row);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/invariants?project_id=xxx — 목록 (active만)
  app.get('/api/brick/invariants', (req, res) => {
    try {
      const projectId = req.query.project_id as string | undefined;
      if (!projectId) {
        return res.status(400).json({ error: 'project_id 쿼리 파라미터 필수' });
      }

      const rows = db.select().from(brickInvariants)
        .where(and(
          eq(brickInvariants.projectId, projectId),
          eq(brickInvariants.status, 'active'),
        )).all();

      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/invariants/:id — 상세 + 이력
  // NOTE: project_id 쿼리 필요 (복합 PK)
  app.get('/api/brick/invariants/:id', (req, res) => {
    try {
      const projectId = req.query.project_id as string | undefined;
      if (!projectId) {
        return res.status(400).json({ error: 'project_id 쿼리 파라미터 필수' });
      }

      const invariant = db.select().from(brickInvariants)
        .where(and(
          eq(brickInvariants.id, req.params.id),
          eq(brickInvariants.projectId, projectId),
        )).get();

      if (!invariant) return res.status(404).json({ error: '불변식 없음' });

      const history = db.select().from(brickInvariantHistory)
        .where(and(
          eq(brickInvariantHistory.invariantId, req.params.id),
          eq(brickInvariantHistory.projectId, projectId),
        )).all();

      res.json({ ...invariant, history });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PUT /api/brick/invariants/:id — 갱신 (이력 자동 생성)
  app.put('/api/brick/invariants/:id', (req, res) => {
    try {
      const { projectId, constraintValue, changeReason, changedBy } = req.body;
      if (!projectId || !constraintValue || !changeReason || !changedBy) {
        return res.status(400).json({ error: 'projectId, constraintValue, changeReason, changedBy 필수' });
      }

      const existing = db.select().from(brickInvariants)
        .where(and(
          eq(brickInvariants.id, req.params.id),
          eq(brickInvariants.projectId, projectId),
        )).get();

      if (!existing) return res.status(404).json({ error: '불변식 없음' });

      const newVersion = (existing.version ?? 1) + 1;
      const newValueStr = typeof constraintValue === 'object'
        ? JSON.stringify(constraintValue) : constraintValue;

      // 이력 저장
      const historyRow = db.insert(brickInvariantHistory).values({
        invariantId: req.params.id,
        projectId,
        version: newVersion,
        previousValue: existing.constraintValue as string,
        newValue: newValueStr,
        changeReason,
        changedBy,
      }).returning().get();

      // 불변식 갱신
      db.update(brickInvariants).set({
        constraintValue: newValueStr,
        version: newVersion,
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(brickInvariants.id, req.params.id),
        eq(brickInvariants.projectId, projectId),
      )).run();

      console.log('[brick-invariants] 불변식 갱신:', req.params.id, 'v' + newVersion);
      res.json({ id: req.params.id, version: newVersion, previous_version: existing.version, history_id: historyRow?.id });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PATCH /api/brick/invariants/:id/deprecate — 폐기
  app.patch('/api/brick/invariants/:id/deprecate', (req, res) => {
    try {
      const { projectId } = req.body;
      if (!projectId) {
        return res.status(400).json({ error: 'projectId 필수' });
      }

      const existing = db.select({ id: brickInvariants.id }).from(brickInvariants)
        .where(and(
          eq(brickInvariants.id, req.params.id),
          eq(brickInvariants.projectId, projectId),
        )).get();

      if (!existing) return res.status(404).json({ error: '불변식 없음' });

      db.update(brickInvariants).set({
        status: 'deprecated',
        updatedAt: new Date().toISOString(),
      }).where(and(
        eq(brickInvariants.id, req.params.id),
        eq(brickInvariants.projectId, projectId),
      )).run();

      console.log('[brick-invariants] 불변식 폐기:', req.params.id);
      res.json({ id: req.params.id, status: 'deprecated' });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
