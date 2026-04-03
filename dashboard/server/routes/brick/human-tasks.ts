// dashboard/server/routes/brick/human-tasks.ts — 수동 작업 완료 API + webhook 콜백
import type { Application } from 'express';
import fs from 'fs';
import path from 'path';
import { eventBus } from '../../event-bus.js';

export function registerHumanTaskRoutes(app: Application): void {
  const completionsDir = path.resolve('.bkit/runtime/human-completions');
  const runtimeDir = path.resolve('.bkit/runtime');

  // 대기 중인 수동 작업 목록
  app.get('/api/brick/human/tasks', (req, res) => {
    if (!fs.existsSync(runtimeDir)) return res.json([]);

    const tasks = fs.readdirSync(runtimeDir)
      .filter(f => f.startsWith('task-state-hu-'))
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(runtimeDir, f), 'utf-8'));
        return { executionId: f.replace('task-state-', '').replace('.json', ''), ...data };
      })
      .filter(t => t.status === 'waiting_human');

    res.json(tasks);
  });

  // 수동 작업 완료
  app.post('/api/brick/human/complete/:executionId', (req, res) => {
    const { executionId } = req.params;
    const { metrics, artifacts } = req.body;

    fs.mkdirSync(completionsDir, { recursive: true });
    fs.writeFileSync(
      path.join(completionsDir, executionId),
      JSON.stringify({ metrics: metrics || {}, artifacts: artifacts || [], completedAt: Date.now() }),
    );

    // eventBus로 알림 → WebSocket → 대시보드 즉시 갱신
    eventBus.emit('brick.human.completed', { executionId });
    res.json({ ok: true });
  });

  // webhook 콜백 엔드포인트
  app.post('/api/brick/webhook/callback/:executionId', (req, res) => {
    const { executionId } = req.params;
    const stateFile = path.join(runtimeDir, `task-state-${executionId}.json`);

    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({
      status: req.body.status || 'completed',
      metrics: req.body.metrics,
      artifacts: req.body.artifacts,
      error: req.body.error,
    }));
    res.json({ ok: true });
  });
}
