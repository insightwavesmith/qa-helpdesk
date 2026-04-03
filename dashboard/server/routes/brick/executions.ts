// dashboard/server/routes/brick/executions.ts — Brick 실행 API (5개 엔드포인트)
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq, desc, sql, and } from 'drizzle-orm';
import { brickExecutions, brickExecutionLogs, brickPresets } from '../../db/schema/brick.js';
import { emitThinkLog } from '../../brick/engine/executor.js';
import { parse as parseYaml } from 'yaml';

export function registerExecutionRoutes(app: Application, db: BetterSQLite3Database) {
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

  // POST /api/brick/executions — 실행 시작
  app.post('/api/brick/executions', (req, res) => {
    try {
      const { presetId, feature } = req.body;

      if (!presetId || !feature) {
        return res.status(400).json({ error: 'presetId, feature 필수' });
      }

      // 프리셋 로드
      const preset = db.select().from(brickPresets)
        .where(eq(brickPresets.id, Number(presetId)))
        .get();

      if (!preset) {
        return res.status(404).json({ error: '프리셋 없음' });
      }

      // 블록 목록에서 초기 상태 생성
      let parsed: Record<string, unknown>;
      try {
        parsed = parseYaml(preset.yaml);
      } catch {
        return res.status(400).json({ error: 'YAML 파싱 실패' });
      }

      // spec wrapper 해제
      const inner = (parsed.kind && parsed.spec)
        ? parsed.spec as Record<string, unknown>
        : parsed;
      const blocks = (inner.blocks || []) as Array<{ id: string }>;

      const blocksState: Record<string, { status: string }> = {};
      blocks.forEach((b, i) => {
        blocksState[b.id] = { status: i === 0 ? 'queued' : 'pending' };
      });

      const now = new Date().toISOString();

      // 실행 인스턴스 생성
      const execution = db.insert(brickExecutions).values({
        presetId: Number(presetId),
        feature,
        status: 'running',
        blocksState: JSON.stringify(blocksState),
        startedAt: now,
      }).returning().get();

      // 첫 블록 시작 로그
      const firstBlockId = blocks[0]?.id || 'unknown';
      db.insert(brickExecutionLogs).values({
        executionId: execution.id,
        eventType: 'block.started',
        blockId: firstBlockId,
        data: JSON.stringify({ feature, startedAt: now }),
      }).run();

      // ThinkLog 자동 발행 (HP-001: 항상 저장)
      emitThinkLog(db, {
        executionId: execution.id,
        blockId: firstBlockId,
        blockType: 'plan',
        feature,
      }, `[${firstBlockId}] 실행 시작. 피처: ${feature}`, 0);

      console.log('[brick-executions] 실행 시작:', execution.id, feature);
      res.status(201).json(execution);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/executions/:id/pause — 일시정지
  app.post('/api/brick/executions/:id/pause', (req, res) => {
    try {
      const updated = db.update(brickExecutions)
        .set({ status: 'paused' })
        .where(eq(brickExecutions.id, Number(req.params.id)))
        .returning()
        .get();

      if (!updated) {
        return res.status(404).json({ error: '실행 없음' });
      }

      // 일시정지 로그
      db.insert(brickExecutionLogs).values({
        executionId: updated.id,
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

  // POST /api/brick/executions/:id/blocks/:blockId/complete — 블록 완료
  app.post('/api/brick/executions/:id/blocks/:blockId/complete', (req, res) => {
    try {
      const execution = db.select().from(brickExecutions)
        .where(eq(brickExecutions.id, Number(req.params.id)))
        .get();

      if (!execution) {
        return res.status(404).json({ error: '실행 없음' });
      }

      const blocksState = JSON.parse(
        (typeof execution.blocksState === 'string' ? execution.blocksState : JSON.stringify(execution.blocksState)) || '{}',
      ) as Record<string, { status: string }>;
      const blockId = req.params.blockId;

      if (!blocksState[blockId]) {
        return res.status(404).json({ error: '블록 없음' });
      }

      // 상태 전이: → completed
      blocksState[blockId].status = 'completed';

      db.update(brickExecutions)
        .set({ blocksState: JSON.stringify(blocksState) })
        .where(eq(brickExecutions.id, Number(req.params.id)))
        .run();

      // 로그 기록
      const { metrics } = req.body || {};
      db.insert(brickExecutionLogs).values({
        executionId: execution.id,
        eventType: 'block.completed',
        blockId,
        data: JSON.stringify(metrics || {}),
      }).run();

      console.log('[brick-executions] 블록 완료:', req.params.id, blockId);
      res.json({ blocksState });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
