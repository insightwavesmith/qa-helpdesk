// dashboard/server/routes/brick/executions.ts — Brick 실행 API (5개 엔드포인트)
// Step 6: Python 엔진 프록시 전환
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc, sql } from 'drizzle-orm';
import { brickExecutions, brickExecutionLogs, brickPresets, brickGateResults, brickProjects } from '../../db/schema/brick.js';
import { emitThinkLog } from '../../brick/engine/executor.js';
import { ProjectContextBuilder } from '../../brick/project/context-builder.js';
import { EngineBridge } from '../../brick/engine/bridge.js';

function getDefaultProjectId(db: BetterSQLite3Database): string | null {
  const row = db.select({ id: brickProjects.id })
    .from(brickProjects)
    .where(eq(brickProjects.active, 1))
    .limit(1)
    .get();
  return row?.id ?? null;
}

export function registerExecutionRoutes(app: Application, db: BetterSQLite3Database) {
  const bridge = new EngineBridge();

  // GET /api/brick/executions — 실행 목록
  app.get('/api/brick/executions', (req, res) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 200);
      const offset = Number(req.query.offset) || 0;
      const status = req.query.status as string | undefined;

      let query = db.select().from(brickExecutions);
      if (status) {
        query = query.where(eq(brickExecutions.status, status)) as typeof query;
      }

      const data = query
        .orderBy(desc(brickExecutions.id))
        .limit(limit)
        .offset(offset)
        .all();

      // total count
      let countQuery = db.select({ count: sql<number>`count(*)` }).from(brickExecutions);
      if (status) {
        countQuery = countQuery.where(eq(brickExecutions.status, status)) as typeof countQuery;
      }
      const totalResult = countQuery.get();
      const total = totalResult?.count ?? 0;

      res.json({ data, total, limit, offset });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/executions — 실행 시작 (Python 엔진 프록시)
  app.post('/api/brick/executions', async (req, res) => {
    try {
      const { presetId, feature, projectId } = req.body;

      if (!presetId || !feature) {
        return res.status(400).json({ error: 'presetId, feature 필수' });
      }

      // 프리셋에서 name 조회
      const preset = db.select().from(brickPresets)
        .where(eq(brickPresets.id, Number(presetId)))
        .get();

      if (!preset) {
        return res.status(404).json({ error: '프리셋 없음' });
      }

      // 프로젝트 컨텍스트 빌드
      const resolvedProjectId = projectId ?? getDefaultProjectId(db);
      let initialContext: Record<string, unknown> | undefined;
      if (resolvedProjectId) {
        try {
          const builder = new ProjectContextBuilder();
          initialContext = builder.build(resolvedProjectId) as unknown as Record<string, unknown>;
        } catch {
          // 프로젝트 없으면 컨텍스트 없이 진행
        }
      }

      // Python 엔진에 실행 요청
      const result = await bridge.startWorkflow(preset.name, feature, feature, initialContext);
      if (!result.ok) {
        return res.status(502).json({
          error: 'engine_unavailable',
          detail: result.error?.detail,
        });
      }

      // 엔진 응답으로 DB 동기화
      const execution = db.insert(brickExecutions).values({
        presetId: Number(presetId),
        feature,
        status: result.data!.status,
        currentBlock: result.data!.current_block_id,
        blocksState: JSON.stringify(result.data!.blocks_state),
        engineWorkflowId: result.data!.workflow_id,
        projectId: resolvedProjectId ?? null,
        startedAt: new Date().toISOString(),
      }).returning().get();

      // ThinkLog 자동 발행 (HP-001: 항상 저장)
      const firstBlockId = result.data!.current_block_id || 'unknown';
      emitThinkLog(db, {
        executionId: execution.id,
        blockId: firstBlockId,
        blockType: 'plan',
        feature,
      }, `[${firstBlockId}] 실행 시작. 피처: ${feature}`, 0);

      console.log('[brick-executions] 엔진 실행 시작:', execution.id, feature);
      res.status(201).json(execution);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/executions/:id/pause — 일시정지
  app.post('/api/brick/executions/:id/pause', async (req, res) => {
    try {
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(req.params.id))).get();
      if (!execution) return res.status(404).json({ error: '실행 없음' });

      // 엔진에 suspend 요청 (있으면)
      const engineId = execution.engineWorkflowId as string | null;
      if (engineId) {
        await bridge.suspendWorkflow(engineId);
      }

      const updated = db.update(brickExecutions)
        .set({ status: 'paused' })
        .where(eq(brickExecutions.id, Number(req.params.id)))
        .returning()
        .get();

      db.insert(brickExecutionLogs).values({
        executionId: updated!.id,
        eventType: 'execution.paused',
        data: JSON.stringify({ pausedAt: new Date().toISOString() }),
      }).run();

      console.log('[brick-executions] 일시정지:', req.params.id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/executions/:id — 상태 조회 (blocksState 포함)
  app.get('/api/brick/executions/:id', (req, res) => {
    try {
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(req.params.id)))
        .get();

      if (!execution) {
        return res.status(404).json({ error: '실행 없음' });
      }

      console.log('[brick-executions] 상태 조회:', req.params.id);
      res.json(execution);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/executions/:id/logs — 로그 조회 (시간순)
  app.get('/api/brick/executions/:id/logs', (req, res) => {
    try {
      const logs = db.select().from(brickExecutionLogs)
        .where(eq(brickExecutionLogs.executionId, Number(req.params.id)))
        .orderBy(brickExecutionLogs.timestamp)
        .all();

      console.log('[brick-executions] 로그 조회:', req.params.id, logs.length, '건');
      res.json(logs);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/executions/:id/blocks/:blockId/complete — 블록 완료 (Python 엔진 프록시)
  app.post('/api/brick/executions/:id/blocks/:blockId/complete', async (req, res) => {
    try {
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(req.params.id)))
        .get();

      if (!execution) return res.status(404).json({ error: '실행 없음' });

      const engineWorkflowId = execution.engineWorkflowId as string | null;
      if (!engineWorkflowId) {
        return res.status(400).json({ error: '엔진 매핑 없음. 레거시 실행은 엔진 미지원.' });
      }

      const blockId = req.params.blockId;

      // 동시성 가드
      const blocksState = JSON.parse(
        (typeof execution.blocksState === 'string' ? execution.blocksState : JSON.stringify(execution.blocksState)) || '{}'
      ) as Record<string, { status: string }>;
      if (blocksState[blockId]?.status === 'completed' || blocksState[blockId]?.status === 'gate_checking') {
        return res.status(409).json({
          error: 'block_not_running',
          detail: `블록 ${blockId}은 현재 ${blocksState[blockId]?.status} 상태`,
        });
      }

      // Python 엔진에 블록 완료 요청
      const { metrics, artifacts } = req.body || {};
      const result = await bridge.completeBlock(engineWorkflowId, blockId, metrics, artifacts);
      if (!result.ok) {
        return res.status(502).json({ error: 'engine_unavailable', detail: result.error?.detail });
      }

      // 엔진 결과로 DB 동기화
      const allCompleted = Object.values(result.data!.blocks_state).every(
        (b: { status: string }) => b.status === 'completed'
      );

      db.update(brickExecutions).set({
        blocksState: JSON.stringify(result.data!.blocks_state),
        currentBlock: result.data!.next_blocks[0] || execution.currentBlock,
        status: allCompleted ? 'completed' : 'running',
      }).where(eq(brickExecutions.id, Number(req.params.id))).run();

      // Gate 결과 저장
      if (result.data!.gate_result) {
        db.insert(brickGateResults).values({
          executionId: execution.id,
          blockId,
          handlerType: result.data!.gate_result.type || 'unknown',
          passed: result.data!.gate_result.passed,
          detail: result.data!.gate_result as unknown as Record<string, unknown>,
        }).run();
      }

      // 이벤트 로그
      db.insert(brickExecutionLogs).values({
        executionId: execution.id,
        eventType: 'block.completed',
        blockId,
        data: JSON.stringify({
          gate_result: result.data!.gate_result,
          next_blocks: result.data!.next_blocks,
          context: result.data!.context,
        }),
      }).run();

      console.log('[brick-executions] 엔진 블록 완료:', req.params.id, blockId);
      res.json({
        blocksState: result.data!.blocks_state,
        gateResult: result.data!.gate_result,
        nextBlocks: result.data!.next_blocks,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
