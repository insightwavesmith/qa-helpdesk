// dashboard/server/services/agents.ts
// Paperclip agents.ts 기반 — P10 idle 감지 + 자동 조치
import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { agents, events } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

interface RegisterInput {
  name: string;
  displayName?: string;
  role?: 'leader' | 'developer' | 'qa' | 'pm' | 'coo';
  team?: string;
  icon?: string;
  model?: string;
  reportsTo?: string;
  peerId?: string;
}

interface PeerMapEntry {
  id: string;
  pid: number;
  tmuxPane?: string;
}

export interface AgentTreeNode {
  id: string;
  name: string;
  displayName: string | null;
  role: string;
  team: string | null;
  status: string;
  icon: string | null;
  children: AgentTreeNode[];
}

export class AgentService {
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  async register(input: RegisterInput) {
    const agent = this.db.insert(agents).values({
      name: input.name,
      displayName: input.displayName,
      role: input.role ?? 'developer',
      team: input.team,
      icon: input.icon,
      model: input.model,
      reportsTo: input.reportsTo,
      peerId: input.peerId,
    }).returning().get();

    this.recordEvent('agent.registered', agent.id);
    return agent;
  }

  async updateStatus(id: string, status: string, reason?: string) {
    const updates: Record<string, unknown> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (reason) updates.pauseReason = reason;

    this.db.update(agents).set(updates).where(eq(agents.id, id)).run();
    this.recordEvent('agent.status_changed', id, { status, reason });
  }

  // P10: idle 감지 + 자동 조치
  async checkIdleAgents(): Promise<void> {
    const IDLE_WARN = 5 * 60 * 1000;   // 5분: 경고
    const IDLE_PAUSE = 15 * 60 * 1000;  // 15분: 자동 정지

    const running = this.db.select().from(agents)
      .where(eq(agents.status, 'running')).all();

    for (const agent of running) {
      if (!agent.lastHeartbeatAt) continue;

      const idleMs = Date.now() - new Date(agent.lastHeartbeatAt).getTime();

      if (idleMs > IDLE_PAUSE) {
        this.db.update(agents).set({
          status: 'paused',
          pauseReason: `idle ${Math.round(idleMs / 60000)}분 — 자동 정지`,
          updatedAt: new Date().toISOString(),
        }).where(eq(agents.id, agent.id)).run();

        this.recordEvent('agent.auto_paused', agent.id);
        eventBus.emit('agent.auto_paused', { agent });

      } else if (idleMs > IDLE_WARN && !agent.idleWarningSent) {
        this.db.update(agents).set({
          idleWarningSent: 1,
          updatedAt: new Date().toISOString(),
        }).where(eq(agents.id, agent.id)).run();

        this.recordEvent('agent.idle_warning', agent.id);
        eventBus.emit('agent.idle_warning', { agent });
      }
    }
  }

  // RuntimeWatcher에서 호출: peer-map → DB 동기화
  async syncFromRuntime(peerMap: PeerMapEntry[]): Promise<void> {
    for (const peer of peerMap) {
      const existing = this.db.select().from(agents)
        .where(eq(agents.peerId, peer.id)).get();

      if (existing) {
        const updates: Record<string, unknown> = {
          status: 'running',
          lastHeartbeatAt: new Date().toISOString(),
          pid: peer.pid,
          idleWarningSent: 0,
          updatedAt: new Date().toISOString(),
        };
        if (peer.tmuxPane) updates.tmuxPane = peer.tmuxPane;

        this.db.update(agents).set(updates)
          .where(eq(agents.id, existing.id)).run();
      }
    }
    eventBus.emit('agents.synced', {});
  }

  // Org Chart 트리 조회
  async getTree(): Promise<AgentTreeNode[]> {
    const all = this.db.select().from(agents).all();

    const nodeMap = new Map<string, AgentTreeNode>();
    for (const a of all) {
      nodeMap.set(a.id, {
        id: a.id,
        name: a.name,
        displayName: a.displayName,
        role: a.role,
        team: a.team,
        status: a.status,
        icon: a.icon,
        children: [],
      });
    }

    const roots: AgentTreeNode[] = [];
    for (const a of all) {
      const node = nodeMap.get(a.id)!;
      if (a.reportsTo && nodeMap.has(a.reportsTo)) {
        nodeMap.get(a.reportsTo)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  private recordEvent(type: string, agentId: string, payload?: Record<string, unknown>) {
    this.db.insert(events).values({
      eventType: type,
      actor: 'system',
      targetType: 'agent',
      targetId: agentId,
      payload: payload ? JSON.stringify(payload) : undefined,
    }).run();
  }
}
