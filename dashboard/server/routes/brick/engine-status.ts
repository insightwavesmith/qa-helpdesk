import { type Application, type Request, type Response } from 'express';
import { EngineBridge } from '../../brick/engine/bridge.js';
import { ProcessManager } from '../../brick/engine/process-manager.js';

export function registerEngineStatusRoutes(
  app: Application,
  processManager: ProcessManager,
) {
  app.get('/api/brick/engine/health', async (_req: Request, res: Response) => {
    const bridge = new EngineBridge();
    const result = await bridge.checkHealth();

    res.json({
      process: processManager.isHealthy(),
      engine: result,
      timestamp: new Date().toISOString(),
    });
  });
}
