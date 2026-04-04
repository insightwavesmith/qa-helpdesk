// dashboard/server/routes/brick/presets.ts — Brick 프리셋 API (8개 엔드포인트)
import type { Application } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { brickPresets } from '../../db/schema/brick.js';

import { parse as yamlParse } from 'yaml';

function parseYaml(raw: string): unknown {
  try {
    return yamlParse(raw);
  } catch {
    return JSON.parse(raw);
  }
}

export function registerPresetRoutes(app: Application, db: BetterSQLite3Database) {
  // GET /api/brick/presets — 전체 조회
  app.get('/api/brick/presets', (_req, res) => {
    try {
      const presets = db.select().from(brickPresets).all();
      console.log('[brick-presets] 목록 조회:', presets.length, '건');
      res.json(presets);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/presets — 생성
  app.post('/api/brick/presets', (req, res) => {
    try {
      const { name, displayName, description, yaml, labels } = req.body;

      if (!name || !yaml) {
        return res.status(400).json({ error: 'name, yaml 필수' });
      }

      const result = db.insert(brickPresets).values({
        name,
        displayName: displayName || name,
        description: description || null,
        yaml,
        labels: labels || null,
      }).returning().get();

      console.log('[brick-presets] 생성:', name);
      res.status(201).json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/presets/:id — 상세 (YAML 포함)
  app.get('/api/brick/presets/:id', (req, res) => {
    try {
      const preset = db.select().from(brickPresets)
        .where(eq(brickPresets.id, Number(req.params.id)))
        .get();

      if (!preset) {
        return res.status(404).json({ error: '프리셋 없음' });
      }

      console.log('[brick-presets] 상세 조회:', req.params.id);
      res.json(preset);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PUT /api/brick/presets/:id — 수정 (isCore=true → 403)
  app.put('/api/brick/presets/:id', (req, res) => {
    try {
      const existing = db.select().from(brickPresets)
        .where(eq(brickPresets.id, Number(req.params.id)))
        .get();

      if (!existing) {
        return res.status(404).json({ error: '프리셋 없음' });
      }

      if (existing.isCore) {
        return res.status(403).json({ error: '코어 프리셋은 수정할 수 없습니다' });
      }

      const { name, displayName, description, yaml, labels } = req.body;
      const updated = db.update(brickPresets)
        .set({
          ...(name && { name }),
          ...(displayName && { displayName }),
          ...(description !== undefined && { description }),
          ...(yaml && { yaml }),
          ...(labels !== undefined && { labels }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(brickPresets.id, Number(req.params.id)))
        .returning()
        .get();

      console.log('[brick-presets] 수정:', req.params.id);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/brick/presets/:id — 삭제 (isCore=true → 403)
  app.delete('/api/brick/presets/:id', (req, res) => {
    try {
      const existing = db.select().from(brickPresets)
        .where(eq(brickPresets.id, Number(req.params.id)))
        .get();

      if (!existing) {
        return res.status(404).json({ error: '프리셋 없음' });
      }

      if (existing.isCore) {
        return res.status(403).json({ error: '코어 프리셋은 삭제할 수 없습니다' });
      }

      db.delete(brickPresets)
        .where(eq(brickPresets.id, Number(req.params.id)))
        .run();

      console.log('[brick-presets] 삭제:', req.params.id);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/presets/:id/export — YAML 다운로드
  app.get('/api/brick/presets/:id/export', (req, res) => {
    try {
      const preset = db.select().from(brickPresets)
        .where(eq(brickPresets.id, Number(req.params.id)))
        .get();

      if (!preset) {
        return res.status(404).json({ error: '프리셋 없음' });
      }

      console.log('[brick-presets] YAML 내보내기:', req.params.id);
      res.setHeader('Content-Type', 'text/yaml');
      res.setHeader('Content-Disposition', `attachment; filename="${preset.name}.yaml"`);
      res.send(preset.yaml);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/presets/import — YAML 가져오기
  app.post('/api/brick/presets/import', (req, res) => {
    try {
      const { yaml: rawYaml } = req.body;

      if (!rawYaml) {
        return res.status(400).json({ error: 'yaml 필수' });
      }

      let parsed: any;
      try {
        parsed = parseYaml(rawYaml);
      } catch {
        return res.status(400).json({ error: 'YAML 파싱 실패' });
      }

      const name = parsed.name || `imported-${Date.now()}`;
      const result = db.insert(brickPresets).values({
        name,
        displayName: parsed.displayName || name,
        description: parsed.description || null,
        yaml: rawYaml,
        labels: parsed.labels || null,
      }).returning().get();

      console.log('[brick-presets] YAML 가져오기:', name);
      res.status(201).json(result);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  /**
   * POST /api/brick/presets/:presetId/apply
   * 프리셋 YAML → React Flow nodes/edges 변환 (캔버스 렌더링용).
   * 워크플로우 실행 시작은 POST /api/brick/executions 사용.
   */
  app.post('/api/brick/presets/:presetId/apply', (req, res) => {
    try {
      const preset = db.select().from(brickPresets)
        .where(eq(brickPresets.id, Number(req.params.presetId)))
        .get();

      if (!preset) {
        return res.status(404).json({ error: '프리셋 없음' });
      }

      let parsed: any;
      try {
        parsed = parseYaml(preset.yaml);
      } catch {
        return res.status(400).json({ error: '프리셋 YAML 파싱 실패' });
      }

      // YAML → nodes/edges 변환
      const nodes = (parsed.blocks || []).map((block: any, i: number) => ({
        id: block.id || `block-${i}`,
        type: block.type || 'custom',
        position: block.position || { x: i * 200, y: 100 },
        data: block,
      }));

      const edges = (parsed.links || []).map((link: any, i: number) => ({
        id: link.id || `edge-${i}`,
        source: link.from,
        target: link.to,
        type: link.type || 'sequential',
        data: link,
      }));

      console.log('[brick-presets] 적용:', req.params.presetId, '→', nodes.length, 'nodes,', edges.length, 'edges');
      res.json({ presetId: preset.id, nodes, edges });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
