import { execSync } from 'child_process';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { eq } from 'drizzle-orm';
import { agents } from '../db/schema.js';
import { eventBus } from '../event-bus.js';
import type * as schema from '../db/schema.js';

type DB = BetterSQLite3Database<typeof schema>;

export class AgentPoller {
  private db: DB;
  private interval: ReturnType<typeof setInterval> | null = null;

  constructor(db: DB) {
    this.db = db;
  }

  start(intervalMs = 10000) {
    this.poll(); // 즉시 1회
    this.interval = setInterval(() => this.poll(), intervalMs);
    console.log(`[poller] 에이전트 상태 polling 시작 (${intervalMs / 1000}초 간격)`);
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private poll() {
    try {
      const activePanes = this.getTmuxPanes();
      const allAgents = this.db.select().from(agents).all();
      const now = new Date().toISOString();

      for (const agent of allAgents) {
        if (!agent.tmuxSession) continue;

        const isActive = activePanes.some(p =>
          p.session === agent.tmuxSession || p.pane === agent.tmuxPane
        );

        const newStatus = isActive ? 'running' : 'idle';

        if (agent.status !== newStatus && agent.status !== 'paused' && agent.status !== 'terminated') {
          this.db.update(agents).set({
            status: newStatus,
            lastHeartbeatAt: isActive ? now : agent.lastHeartbeatAt,
            updatedAt: now,
          }).where(eq(agents.id, agent.id)).run();

          eventBus.publish({
            type: 'agent.status_changed',
            actor: 'poller',
            targetType: 'agent',
            targetId: agent.id,
            payload: { oldStatus: agent.status, newStatus },
          });
        } else if (isActive) {
          // heartbeat만 갱신
          this.db.update(agents).set({
            lastHeartbeatAt: now,
            updatedAt: now,
          }).where(eq(agents.id, agent.id)).run();
        }

        // idle 5분 이상 → 경고
        if (agent.status === 'running' && agent.lastHeartbeatAt) {
          const idleMs = Date.now() - new Date(agent.lastHeartbeatAt).getTime();
          if (idleMs > 5 * 60 * 1000 && !agent.idleWarningSent) {
            this.db.update(agents).set({
              idleWarningSent: 1,
              updatedAt: now,
            }).where(eq(agents.id, agent.id)).run();

            eventBus.publish({
              type: 'agent.idle_warning',
              actor: 'poller',
              targetType: 'agent',
              targetId: agent.id,
              payload: { idleMs },
            });
          }
        }
      }

      // WebSocket으로 UI 갱신 알림 (ws.ts의 * 구독이 자동 브로드캐스트)
      eventBus.publish({
        type: 'agent.heartbeat',
        actor: 'poller',
        payload: { timestamp: now, agentCount: allAgents.length },
      });
    } catch {
      // polling 실패해도 무시 (tmux 없는 환경 등)
    }
  }

  private getTmuxPanes(): { session: string; pane: string }[] {
    try {
      const output = execSync('tmux list-panes -a -F "#{session_name} #{pane_id}"', {
        timeout: 3000,
        encoding: 'utf-8',
      });
      return output.trim().split('\n').filter(Boolean).map(line => {
        const [session, pane] = line.split(' ');
        return { session, pane };
      });
    } catch {
      return [];
    }
  }
}
