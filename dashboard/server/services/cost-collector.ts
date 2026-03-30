// dashboard/server/services/cost-collector.ts
// 세션 파일 감시 — Claude Code 세션 로그에서 비용 데이터 수집
import { existsSync, readFileSync, watch, type FSWatcher } from 'fs';
import { join } from 'path';
import type { CostService } from './costs.js';

interface SessionCostData {
  agentId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  costCents: number;
  ticketId?: string;
  runId?: string;
}

export class CostCollector {
  private costService: CostService;
  private watchDir: string;
  private watcher: FSWatcher | null = null;

  constructor(costService: CostService, watchDir?: string) {
    this.costService = costService;
    this.watchDir = watchDir ?? join(process.cwd(), '.data', 'sessions');
  }

  start() {
    if (!existsSync(this.watchDir)) return;

    this.watcher = watch(this.watchDir, { recursive: false }, (eventType, filename) => {
      if (eventType === 'change' && filename?.endsWith('.json')) {
        this.processFile(join(this.watchDir, filename));
      }
    });
  }

  stop() {
    this.watcher?.close();
    this.watcher = null;
  }

  private async processFile(filePath: string) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const data: SessionCostData = JSON.parse(content);
      if (data.agentId && data.model && typeof data.costCents === 'number') {
        await this.costService.recordCost({
          agentId: data.agentId,
          model: data.model,
          inputTokens: data.inputTokens ?? 0,
          outputTokens: data.outputTokens ?? 0,
          cachedInputTokens: data.cachedInputTokens,
          costCents: data.costCents,
          ticketId: data.ticketId,
          runId: data.runId,
        });
      }
    } catch {
      // 파일 파싱 실패 시 무시 (불완전 쓰기 등)
    }
  }
}
