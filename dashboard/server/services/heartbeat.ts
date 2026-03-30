// dashboard/server/services/heartbeat.ts
// 경량화: createRun, finishRun만 구현
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { heartbeatRuns, agents, events } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export interface CreateRunInput {
  agentId: string;
  ticketId?: string;
  pid?: number;
}

export interface FinishRunInput {
  exitCode?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  stdoutExcerpt?: string;
  resultJson?: string;
}

export class HeartbeatService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  createRun(input: CreateRunInput) {
    const run = this.db.insert(heartbeatRuns).values({
      agentId: input.agentId,
      ticketId: input.ticketId,
      status: 'running',
      startedAt: new Date().toISOString(),
      pid: input.pid,
    }).returning().get();

    // 에이전트 heartbeat 갱신
    this.db.update(agents).set({
      lastHeartbeatAt: new Date().toISOString(),
      status: 'running',
      updatedAt: new Date().toISOString(),
    }).where(eq(agents.id, input.agentId)).run();

    eventBus.publish({
      type: 'agent.heartbeat',
      actor: input.agentId,
      targetType: 'heartbeat_run',
      targetId: run.id,
    });

    return run;
  }

  finishRun(runId: string, input: FinishRunInput = {}) {
    const status = (input.exitCode ?? 0) === 0 ? 'completed' : 'failed';

    this.db.update(heartbeatRuns).set({
      status: status as 'completed' | 'failed',
      finishedAt: new Date().toISOString(),
      exitCode: input.exitCode ?? 0,
      inputTokens: input.inputTokens ?? 0,
      outputTokens: input.outputTokens ?? 0,
      cachedTokens: input.cachedTokens ?? 0,
      stdoutExcerpt: input.stdoutExcerpt,
      resultJson: input.resultJson,
    }).where(eq(heartbeatRuns.id, runId)).run();

    return this.db.select().from(heartbeatRuns)
      .where(eq(heartbeatRuns.id, runId)).get();
  }

  getRunsByAgent(agentId: string) {
    return this.db.select().from(heartbeatRuns)
      .where(eq(heartbeatRuns.agentId, agentId))
      .all();
  }
}
