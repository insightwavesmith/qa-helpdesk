// dashboard/server/routes/brick/workflows.ts — Brick 워크플로우 재개/취소 API
// 프론트 hooks가 /api/brick/workflows/ prefix 사용
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { brickExecutions, brickExecutionLogs } from '../../db/schema/brick.js';

export function registerWorkflowRoutes(app: Application, db: BetterSQLite3Database) {
  // POST /api/brick/workflows/:workflowId/resume — 재개
  app.post('/api/brick/workflows/:workflowId/resume', (req, res) => {
    try {
      // workflowId로 실행 인스턴스 조회 (presetId 기준)
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.presetId, Number(req.params.workflowId)))
        .get();

      if (!execution) {
        return res.status(404).json({ error: '실행 없음' });
      }

      const updated = db.update(brickExecutions)
        .set({ status: 'running' })
        .where(eq(brickExecutions.id, execution.id))
        .returning()
        .get();

      // 재개 로그
      db.insert(brickExecutionLogs).values({
        executionId: execution.id,
        eventType: 'execution.resumed',
        data: JSON.stringify({ resumedAt: new Date().toISOString() }),
      }).run();

      console.log('[brick-workflows] 재개:', req.params.workflowId);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/workflows/:workflowId/cancel — 취소
  app.post('/api/brick/workflows/:workflowId/cancel', (req, res) => {
    try {
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.presetId, Number(req.params.workflowId)))
        .get();

      if (!execution) {
        return res.status(404).json({ error: '실행 없음' });
      }

      const updated = db.update(brickExecutions)
        .set({
          status: 'cancelled',
          completedAt: new Date().toISOString(),
        })
        .where(eq(brickExecutions.id, execution.id))
        .returning()
        .get();

      // 취소 로그
      db.insert(brickExecutionLogs).values({
        executionId: execution.id,
        eventType: 'execution.cancelled',
        data: JSON.stringify({ cancelledAt: new Date().toISOString() }),
      }).run();

      console.log('[brick-workflows] 취소:', req.params.workflowId);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
