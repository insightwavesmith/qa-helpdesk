import { Express } from 'express';
import { EngineBridge } from '../../brick/engine/bridge.js';
import { ProcessManager } from '../../brick/engine/process-manager.js';

export function registerEngineStatusRoutes(
  app: Express,
  processManager: ProcessManager,
) {
  app.get('/api/brick/engine/health', async (_req, res) => {
    const bridge = new EngineBridge();
    const result = await bridge.checkHealth();

    res.json({
      process: processManager.isHealthy(),
      engine: result,
      timestamp: new Date().toISOString(),
    });
  });
}
