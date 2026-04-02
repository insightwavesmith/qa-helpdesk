// dashboard/server/routes/brick/teams.ts — Teams CRUD + 하위 리소스 (10 endpoints)
import type { Application, Request, Response } from 'express';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { brickTeams } from '../../db/schema/brick.js';

export function registerTeamRoutes(app: Application, db: BetterSQLite3Database) {
  // GET /api/brick/teams — 전체 조회
  app.get('/api/brick/teams', (_req: Request, res: Response) => {
    try {
      const teams = db.select().from(brickTeams).all();
      res.json(teams);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // POST /api/brick/teams — 생성
  app.post('/api/brick/teams', (req: Request, res: Response) => {
    try {
      const { name, displayName, adapter, adapterConfig, members, skills, mcpServers, modelConfig } = req.body;
      if (!name) {
        return res.status(400).json({ error: '필수 필드 누락: name' });
      }
      const result = db.insert(brickTeams).values({
        name,
        displayName: displayName || name,
        adapter: adapter || 'claude_agent_teams',
        adapterConfig,
        members,
        skills,
        mcpServers,
        modelConfig,
      }).returning().get();
      console.log(`[brick/teams] 생성: ${name}`);
      res.status(201).json(result);
    } catch (e) {
      res.status(400).json({ error: String(e) });
    }
  });

  // GET /api/brick/teams/:id — 상세
  app.get('/api/brick/teams/:id', (req: Request, res: Response) => {
    try {
      const team = db.select().from(brickTeams).where(eq(brickTeams.id, Number(req.params.id))).get();
      if (!team) {
        return res.status(404).json({ error: '팀 없음' });
      }
      res.json(team);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PUT /api/brick/teams/:id — 수정
  app.put('/api/brick/teams/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = db.select().from(brickTeams).where(eq(brickTeams.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: '팀 없음' });
      }
      const { name, displayName, adapter, adapterConfig, members, skills, mcpServers, modelConfig, status } = req.body;
      const updated = db.update(brickTeams)
        .set({
          ...(name !== undefined && { name }),
          ...(displayName !== undefined && { displayName }),
          ...(adapter !== undefined && { adapter }),
          ...(adapterConfig !== undefined && { adapterConfig }),
          ...(members !== undefined && { members }),
          ...(skills !== undefined && { skills }),
          ...(mcpServers !== undefined && { mcpServers }),
          ...(modelConfig !== undefined && { modelConfig }),
          ...(status !== undefined && { status }),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(brickTeams.id, id))
        .returning().get();
      console.log(`[brick/teams] 수정: ${id}`);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // DELETE /api/brick/teams/:id — 삭제
  app.delete('/api/brick/teams/:id', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const deleted = db.delete(brickTeams).where(eq(brickTeams.id, id)).run();
      if (deleted.changes === 0) {
        return res.status(404).json({ error: '팀 없음' });
      }
      console.log(`[brick/teams] 삭제: ${id}`);
      res.status(204).end();
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/teams/:id/members — 팀원 목록
  app.get('/api/brick/teams/:id/members', (req: Request, res: Response) => {
    try {
      const team = db.select().from(brickTeams).where(eq(brickTeams.id, Number(req.params.id))).get();
      if (!team) {
        return res.status(404).json({ error: '팀 없음' });
      }
      res.json(team.members ?? []);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PUT /api/brick/teams/:id/skills — 스킬 갱신
  app.put('/api/brick/teams/:id/skills', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = db.select().from(brickTeams).where(eq(brickTeams.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: '팀 없음' });
      }
      const { skills } = req.body;
      const updated = db.update(brickTeams)
        .set({ skills, updatedAt: new Date().toISOString() })
        .where(eq(brickTeams.id, id))
        .returning().get();
      console.log(`[brick/teams] 스킬 갱신: ${id}`);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/teams/:id/mcp — MCP 서버 목록
  app.get('/api/brick/teams/:id/mcp', (req: Request, res: Response) => {
    try {
      const team = db.select().from(brickTeams).where(eq(brickTeams.id, Number(req.params.id))).get();
      if (!team) {
        return res.status(404).json({ error: '팀 없음' });
      }
      res.json(team.mcpServers ?? []);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // PUT /api/brick/teams/:id/model — 모델 설정 갱신
  app.put('/api/brick/teams/:id/model', (req: Request, res: Response) => {
    try {
      const id = Number(req.params.id);
      const existing = db.select().from(brickTeams).where(eq(brickTeams.id, id)).get();
      if (!existing) {
        return res.status(404).json({ error: '팀 없음' });
      }
      const { modelConfig } = req.body;
      const updated = db.update(brickTeams)
        .set({ modelConfig, updatedAt: new Date().toISOString() })
        .where(eq(brickTeams.id, id))
        .returning().get();
      console.log(`[brick/teams] 모델 설정 갱신: ${id}`);
      res.json(updated);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  // GET /api/brick/teams/:id/status — 팀 상태
  app.get('/api/brick/teams/:id/status', (req: Request, res: Response) => {
    try {
      const team = db.select().from(brickTeams).where(eq(brickTeams.id, Number(req.params.id))).get();
      if (!team) {
        return res.status(404).json({ error: '팀 없음' });
      }
      res.json({ status: team.status });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
}
