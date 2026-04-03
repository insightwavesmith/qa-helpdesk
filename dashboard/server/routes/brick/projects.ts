// dashboard/server/routes/brick/projects.ts — 프로젝트 CRUD + 대시보드
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { and, eq, sql } from 'drizzle-orm';
import { brickProjects, brickInvariants, brickExecutions, brickInvariantHistory } from '../../db/schema/brick.js';
import { syncProjectYaml } from '../../brick/project/sync.js';

export function registerProjectRoutes(app: Application, db: BetterSQLite3Database) {

  // POST /api/brick/projects — 프로젝트 생성
  app.post('/api/brick/projects', (req, res) => {
    try {
      const { id, name, description, infrastructure, config } = req.body;
      if (!id || !name) {
        return res.status(400).json({ error: 'id, name 필수' });
      }
      const existing = db.select({ id: brickProjects.id }).from(brickProjects)
        .where(eq(brickProjects.id, id)).get();
      if (existing) {
        return res.status(409).json({ error: '이미 존재하는 프로젝트 ID' });
      }
      const row = db.insert(brickProjects).values({
        id,
        name,
        description: description ?? null,
        infrastructure: typeof infrastructure === 'object' ? JSON.stringify(infrastructure) : (infrastructure ?? '{}'),
        config: typeof config === 'object' ? JSON.stringify(config) : (config ?? '{}'),
        active: 1,
      }).returning().get();
      console.log('[brick-projects] 프로젝트 생성:', id);
      res.status(201).json(row);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/projects — 목록
  app.get('/api/brick/projects', (req, res) => {
    try {
      const rows = db.select().from(brickProjects).all();
      res.json(rows);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/projects/:id — 상세
  app.get('/api/brick/projects/:id', (req, res) => {
    try {
      const project = db.select().from(brickProjects)
        .where(eq(brickProjects.id, req.params.id)).get();
      if (!project) return res.status(404).json({ error: '프로젝트 없음' });

      const invariants = db.select().from(brickInvariants)
        .where(eq(brickInvariants.projectId, req.params.id)).all();

      const executions = db.select().from(brickExecutions)
        .where(eq(brickExecutions.projectId, req.params.id)).all();

      res.json({ ...project, invariants, executions });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PUT /api/brick/projects/:id — 수정
  app.put('/api/brick/projects/:id', (req, res) => {
    try {
      const project = db.select({ id: brickProjects.id }).from(brickProjects)
        .where(eq(brickProjects.id, req.params.id)).get();
      if (!project) return res.status(404).json({ error: '프로젝트 없음' });

      const { name, description, infrastructure, config, active } = req.body;
      const updated = db.update(brickProjects).set({
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(infrastructure !== undefined && {
          infrastructure: typeof infrastructure === 'object' ? JSON.stringify(infrastructure) : infrastructure,
        }),
        ...(config !== undefined && {
          config: typeof config === 'object' ? JSON.stringify(config) : config,
        }),
        ...(active !== undefined && { active: active ? 1 : 0 }),
        updatedAt: new Date().toISOString(),
      }).where(eq(brickProjects.id, req.params.id)).returning().get();

      console.log('[brick-projects] 프로젝트 수정:', req.params.id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/projects/sync — YAML → DB 동기화
  app.post('/api/brick/projects/sync', (req, res) => {
    try {
      syncProjectYaml();
      const projects = db.select().from(brickProjects).all();
      res.json({ ok: true, projects });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/brick/projects/:id — 삭제 (트랜잭션)
  app.delete('/api/brick/projects/:id', (req, res) => {
    try {
      const project = db.select({ id: brickProjects.id }).from(brickProjects)
        .where(eq(brickProjects.id, req.params.id)).get();
      if (!project) return res.status(404).json({ error: '프로젝트 없음' });

      db.transaction((tx) => {
        // 1. invariant_history 삭제
        const invIds = tx.select({ id: brickInvariants.id }).from(brickInvariants)
          .where(eq(brickInvariants.projectId, req.params.id)).all();
        for (const inv of invIds) {
          tx.delete(brickInvariantHistory)
            .where(and(
              eq(brickInvariantHistory.invariantId, inv.id),
              eq(brickInvariantHistory.projectId, req.params.id),
            )).run();
        }
        // 2. invariants 삭제
        tx.delete(brickInvariants).where(eq(brickInvariants.projectId, req.params.id)).run();
        // 3. executions.project_id → NULL (이력 보존)
        tx.update(brickExecutions).set({ projectId: null })
          .where(eq(brickExecutions.projectId, req.params.id)).run();
        // 4. 프로젝트 삭제
        tx.delete(brickProjects).where(eq(brickProjects.id, req.params.id)).run();
      });

      console.log('[brick-projects] 프로젝트 삭제:', req.params.id);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/projects/:id/invariants — 불변식 목록
  app.get('/api/brick/projects/:id/invariants', (req, res) => {
    try {
      const project = db.select({ id: brickProjects.id }).from(brickProjects)
        .where(eq(brickProjects.id, req.params.id)).get();
      if (!project) return res.status(404).json({ error: '프로젝트 없음' });

      const status = req.query.status as 'active' | 'deprecated' | 'superseded' | undefined;
      let results;
      if (status) {
        results = db.select().from(brickInvariants)
          .where(and(eq(brickInvariants.projectId, req.params.id), eq(brickInvariants.status, status))).all();
      } else {
        results = db.select().from(brickInvariants)
          .where(eq(brickInvariants.projectId, req.params.id)).all();
      }
      res.json({ invariants: results });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/projects/:id/dashboard — 집계
  app.get('/api/brick/projects/:id/dashboard', (req, res) => {
    try {
      const project = db.select({
        id: brickProjects.id,
        name: brickProjects.name,
        description: brickProjects.description,
      }).from(brickProjects).where(eq(brickProjects.id, req.params.id)).get();
      if (!project) return res.status(404).json({ error: '프로젝트 없음' });

      // 실행 집계
      const allExecs = db.select({
        id: brickExecutions.id,
        feature: brickExecutions.feature,
        status: brickExecutions.status,
        currentBlock: brickExecutions.currentBlock,
        updatedAt: brickExecutions.createdAt,
      }).from(brickExecutions)
        .where(eq(brickExecutions.projectId, req.params.id)).all();

      const byStatus = { pending: 0, running: 0, completed: 0, failed: 0, paused: 0 } as Record<string, number>;
      for (const e of allExecs) {
        const s = e.status as string;
        byStatus[s] = (byStatus[s] ?? 0) + 1;
      }

      // 불변식 집계
      const allInvs = db.select({ status: brickInvariants.status }).from(brickInvariants)
        .where(eq(brickInvariants.projectId, req.params.id)).all();
      const invStats = { total: allInvs.length, active: 0, deprecated: 0 };
      for (const i of allInvs) {
        if (i.status === 'active') invStats.active++;
        else if (i.status === 'deprecated') invStats.deprecated++;
      }

      const recentExecs = allExecs.slice(-5).reverse();

      res.json({
        project,
        executions: { total: allExecs.length, by_status: byStatus },
        invariants: invStats,
        recent_executions: recentExecs,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
