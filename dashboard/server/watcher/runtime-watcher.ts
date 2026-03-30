// dashboard/server/watcher/runtime-watcher.ts
// .bkit/runtime/ 파일 감시 → AgentService.syncFromRuntime 호출
import { watch, type FSWatcher } from 'fs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { AgentService } from '../services/agents.js';

export class RuntimeWatcher {
  private agentSvc: AgentService;
  private watchDir: string;
  private watcher: FSWatcher | null = null;

  constructor(agentSvc: AgentService, watchDir?: string) {
    this.agentSvc = agentSvc;
    this.watchDir = watchDir ?? '.bkit/runtime';
  }

  start(): void {
    if (!existsSync(this.watchDir)) return;

    this.watcher = watch(this.watchDir, { recursive: true }, (_eventType, filename) => {
      if (filename === 'peer-map.json' || filename?.endsWith('peer-map.json')) {
        this.onPeerMapChanged();
      }
    });
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private async onPeerMapChanged(): Promise<void> {
    try {
      const path = join(this.watchDir, 'peer-map.json');
      if (!existsSync(path)) return;

      const content = readFileSync(path, 'utf-8');
      const peerMap = JSON.parse(content);

      if (Array.isArray(peerMap)) {
        await this.agentSvc.syncFromRuntime(peerMap);
      }
    } catch {
      // file read/parse errors are non-fatal
    }
  }
}
