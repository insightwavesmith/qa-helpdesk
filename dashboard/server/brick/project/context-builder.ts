// dashboard/server/brick/project/context-builder.ts — 프로젝트 컨텍스트 빌더
import { db } from '../../db/index.js';
import { brickProjects, brickInvariants, brickExecutions, brickGateResults } from '../../db/schema/brick.js';
import { eq, and, desc } from 'drizzle-orm';

interface ProjectContext {
  project_id: string;
  project_name: string;
  infrastructure: {
    db: { type: string; orm: string; driver: string; constraints: string[] };
    services: Array<{ name: string; port: number; language: string; framework: string }>;
    runtime: string;
    languages: string[];
  };
  invariants: Array<{
    id: string;
    description: string;
    design_source: string;
    constraint_value: string;
  }>;
  recent_failures: Array<{
    feature: string;
    block_id: string;
    reason: string;
    date: string;
  }>;
  recent_artifacts: Array<{
    feature: string;
    block_type: string;
    path: string;
  }>;
}

export class ProjectContextBuilder {

  build(projectId: string): ProjectContext {
    const project = this.loadProject(projectId);
    const invariants = this.loadInvariants(projectId);
    const failures = this.loadRecentFailures(projectId, 10);
    const artifacts = this.loadRecentArtifacts(projectId, 20);

    return {
      project_id: project.id,
      project_name: project.name,
      infrastructure: JSON.parse(project.infrastructure as string),
      invariants,
      recent_failures: failures,
      recent_artifacts: artifacts,
    };
  }

  private loadProject(projectId: string) {
    const row = db.select().from(brickProjects)
      .where(eq(brickProjects.id, projectId))
      .get();
    if (!row) throw new Error(`Project not found: ${projectId}`);
    return row;
  }

  private loadInvariants(projectId: string) {
    return db.select({
      id: brickInvariants.id,
      description: brickInvariants.description,
      design_source: brickInvariants.designSource,
      constraint_value: brickInvariants.constraintValue,
    })
    .from(brickInvariants)
    .where(and(
      eq(brickInvariants.projectId, projectId),
      eq(brickInvariants.status, 'active'),
    ))
    .all();
  }

  private loadRecentFailures(projectId: string, limit: number) {
    const rows = db.select({
      feature: brickExecutions.feature,
      block_id: brickGateResults.blockId,
      reason: brickGateResults.detail,
      date: brickGateResults.executedAt,
    })
    .from(brickGateResults)
    .innerJoin(brickExecutions, eq(brickGateResults.executionId, brickExecutions.id))
    .where(and(
      eq(brickExecutions.projectId, projectId),
      eq(brickGateResults.passed, false),
    ))
    .orderBy(desc(brickGateResults.executedAt))
    .limit(limit)
    .all();

    return rows.map(r => ({
      feature: r.feature,
      block_id: r.block_id,
      reason: typeof r.reason === 'string' ? r.reason : JSON.stringify(r.reason),
      date: r.date?.split('T')[0] ?? '',
    }));
  }

  private loadRecentArtifacts(projectId: string, limit: number) {
    const rows = db.select({
      feature: brickExecutions.feature,
      blocksState: brickExecutions.blocksState,
    })
    .from(brickExecutions)
    .where(and(
      eq(brickExecutions.projectId, projectId),
      eq(brickExecutions.status, 'completed'),
    ))
    .orderBy(desc(brickExecutions.createdAt))
    .limit(limit)
    .all();

    const artifacts: ProjectContext['recent_artifacts'] = [];
    for (const row of rows) {
      const state = typeof row.blocksState === 'string'
        ? JSON.parse(row.blocksState) : row.blocksState;
      if (!state) continue;
      for (const [blockId, block] of Object.entries(state as Record<string, Record<string, unknown>>)) {
        const blockArtifacts = (block as { artifacts?: string[] }).artifacts;
        if (blockArtifacts) {
          for (const path of blockArtifacts) {
            artifacts.push({
              feature: row.feature,
              block_type: (block as { type?: string }).type ?? blockId,
              path,
            });
          }
        }
      }
    }
    return artifacts.slice(0, limit);
  }
}
