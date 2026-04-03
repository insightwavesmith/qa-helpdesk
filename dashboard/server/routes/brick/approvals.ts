// dashboard/server/routes/brick/approvals.ts — CEO 승인 Gate API
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { brickApprovals, brickExecutions } from '../../db/schema/brick.js';
import { EngineBridge } from '../../brick/engine/bridge.js';

export function registerApprovalRoutes(app: Application, db: BetterSQLite3Database) {
  const bridge = new EngineBridge();

  // 승인 요청 생성
  app.post('/api/brick/approvals', (req, res) => {
    try {
      const { execution_id, block_id, approver, artifacts, summary, timeout_at } = req.body;
      if (!execution_id || !approver || !timeout_at) {
        return res.status(400).json({ error: 'execution_id, approver, timeout_at 필수' });
      }
      const id = randomUUID();
      db.insert(brickApprovals).values({
        id,
        executionId: execution_id,
        blockId: block_id || '',
        approver,
        status: 'waiting',
        summary: summary || null,
        artifacts: JSON.stringify(artifacts || []),
        timeoutAt: timeout_at,
      }).run();
      res.json({ approval_id: id, status: 'waiting' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 승인 목록 조회
  app.get('/api/brick/approvals', (req, res) => {
    try {
      const status = req.query.status as string | undefined;
      let results;
      if (status) {
        results = db.select().from(brickApprovals).where(eq(brickApprovals.status, status)).all();
      } else {
        results = db.select().from(brickApprovals).all();
      }
      res.json({ approvals: results });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 승인
  app.post('/api/brick/approve/:executionId', async (req, res) => {
    try {
      const { executionId } = req.params;
      const { approver, comment } = req.body;
      const now = new Date().toISOString();
      const updated = db.update(brickApprovals)
        .set({
          status: 'approved',
          comment: comment || null,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(brickApprovals.executionId, Number(executionId)))
        .run();
      if (updated.changes === 0) {
        return res.status(404).json({ error: '승인 요청을 찾을 수 없습니다' });
      }

      // 엔진 연동
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(executionId))).get();
      if (execution?.engineWorkflowId && execution.currentBlock) {
        const result = await bridge.completeBlock(
          execution.engineWorkflowId,
          execution.currentBlock,
          { approval_action: 'approve', approver: approver || 'ceo' },
        );
        if (result.ok && result.data) {
          const allCompleted = Object.values(result.data.blocks_state).every(
            (b: { status: string }) => b.status === 'completed'
          );
          db.update(brickExecutions).set({
            blocksState: JSON.stringify(result.data.blocks_state),
            currentBlock: result.data.next_blocks[0] || execution.currentBlock,
            status: allCompleted ? 'completed' : 'running',
          }).where(eq(brickExecutions.id, Number(executionId))).run();
        }
      }

      res.json({ status: 'approved' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 반려
  app.post('/api/brick/reject/:executionId', async (req, res) => {
    try {
      const { executionId } = req.params;
      const { approver, reason } = req.body;
      if (!reason) {
        return res.status(400).json({ error: '반려 사유(reason) 필수' });
      }
      const now = new Date().toISOString();
      const updated = db.update(brickApprovals)
        .set({
          status: 'rejected',
          rejectReason: reason,
          resolvedAt: now,
          updatedAt: now,
        })
        .where(eq(brickApprovals.executionId, Number(executionId)))
        .run();
      if (updated.changes === 0) {
        return res.status(404).json({ error: '승인 요청을 찾을 수 없습니다' });
      }

      // 엔진 연동
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(executionId))).get();
      if (execution?.engineWorkflowId && execution.currentBlock) {
        const result = await bridge.completeBlock(
          execution.engineWorkflowId,
          execution.currentBlock,
          { approval_action: 'reject', reject_reason: reason, approver: approver || 'ceo' },
        );
        if (result.ok && result.data) {
          const allCompleted = Object.values(result.data.blocks_state).every(
            (b: { status: string }) => b.status === 'completed'
          );
          db.update(brickExecutions).set({
            blocksState: JSON.stringify(result.data.blocks_state),
            currentBlock: result.data.next_blocks[0] || execution.currentBlock,
            status: allCompleted ? 'completed' : 'running',
          }).where(eq(brickExecutions.id, Number(executionId))).run();
        }
      }

      res.json({ status: 'rejected', reason });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
}
