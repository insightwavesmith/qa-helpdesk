// server/brick/engine/bridge.ts — Python Engine HTTP Bridge (EP-1~8)

export interface BridgeConfig {
  baseUrl: string;
  timeout: number;
  retryCount: number;
  retryDelay: number;
  healthCheckInterval: number;
}

const DEFAULT_CONFIG: BridgeConfig = {
  baseUrl: process.env.BRICK_ENGINE_URL || 'http://localhost:3202',
  timeout: 30000,
  retryCount: 2,
  retryDelay: 1000,
  healthCheckInterval: 30000,
};

export interface EngineResponse<T> {
  ok: boolean;
  data?: T;
  error?: { error: string; detail: string | string[] };
}

export interface StartResult {
  workflow_id: string;
  status: string;
  current_block_id: string;
  blocks_state: Record<string, { status: string; [key: string]: unknown }>;
  context: Record<string, unknown>;
  definition: Record<string, unknown>;
}

export interface CompleteResult {
  workflow_id: string;
  block_id: string;
  block_status: string;
  gate_result: {
    passed: boolean;
    type: string;
    detail: string;
    metrics: Record<string, unknown>;
  };
  next_blocks: string[];
  adapter_results: Array<{
    block_id: string;
    adapter: string;
    started: boolean;
    execution_id?: string;
    error?: string;
  }>;
  blocks_state: Record<string, { status: string; [key: string]: unknown }>;
  context: Record<string, unknown>;
}

export interface StatusResult extends StartResult {
  events: Array<{
    type: string;
    data: Record<string, unknown>;
    timestamp: number;
  }>;
}

export interface SuspendResult {
  workflow_id: string;
  status: string;
}

export interface ResumeResult extends StartResult {}

export interface CancelResult {
  workflow_id: string;
  status: string;
}

export interface HealthResult {
  status: string;
  engine_version: string;
  presets_loaded: number;
  active_workflows: number;
}

export class EngineBridge {
  private config: BridgeConfig;
  private healthy = false;
  private healthFailCount = 0;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_FAIL = 3;

  constructor(config?: Partial<BridgeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Public API ────────────────────────────────

  async startWorkflow(
    presetName: string,
    feature: string,
    task: string,
    initialContext?: Record<string, unknown>,
  ): Promise<EngineResponse<StartResult>> {
    return this.retry(
      () =>
        this.request<StartResult>('POST', '/engine/start', {
          preset_name: presetName,
          feature,
          task,
          initial_context: initialContext ?? null,
        }),
      this.config.retryCount,
    );
  }

  async completeBlock(
    workflowId: string,
    blockId: string,
    metrics?: Record<string, unknown>,
    artifacts?: string[],
  ): Promise<EngineResponse<CompleteResult>> {
    return this.retry(
      () =>
        this.request<CompleteResult>('POST', '/engine/complete-block', {
          workflow_id: workflowId,
          block_id: blockId,
          metrics,
          artifacts,
        }),
      this.config.retryCount,
    );
  }

  async getStatus(
    workflowId: string,
  ): Promise<EngineResponse<StatusResult>> {
    return this.request<StatusResult>('GET', `/engine/status/${workflowId}`);
  }

  async suspendWorkflow(
    workflowId: string,
  ): Promise<EngineResponse<SuspendResult>> {
    return this.request<SuspendResult>(
      'POST',
      `/engine/suspend/${workflowId}`,
    );
  }

  async resumeWorkflow(
    workflowId: string,
  ): Promise<EngineResponse<ResumeResult>> {
    return this.request<ResumeResult>(
      'POST',
      `/engine/resume/${workflowId}`,
    );
  }

  async cancelWorkflow(
    workflowId: string,
  ): Promise<EngineResponse<CancelResult>> {
    return this.request<CancelResult>(
      'POST',
      `/engine/cancel/${workflowId}`,
    );
  }

  // ── Health ────────────────────────────────────

  async checkHealth(): Promise<boolean> {
    try {
      const res = await this.request<HealthResult>('GET', '/engine/health');
      return res.ok;
    } catch {
      return false;
    }
  }

  startHealthMonitor(): void {
    this.healthCheckTimer = setInterval(async () => {
      const ok = await this.checkHealth();
      if (ok) {
        this.healthy = true;
        this.healthFailCount = 0;
      } else {
        this.healthFailCount++;
        if (this.healthFailCount >= this.MAX_FAIL) {
          this.healthy = false;
        }
      }
    }, this.config.healthCheckInterval);
  }

  stopHealthMonitor(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }

  isHealthy(): boolean {
    return this.healthy;
  }

  // ── Private ───────────────────────────────────

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<EngineResponse<T>> {
    const url = this.config.baseUrl + '/api/v1' + path;

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(this.config.timeout),
      });

      if (!res.ok) {
        let errorBody: { error?: string; detail?: string | string[] } = {};
        try {
          errorBody = await res.json();
        } catch {
          errorBody = { error: 'unknown', detail: res.statusText };
        }
        return { ok: false, error: { error: errorBody.error ?? 'http_error', detail: errorBody.detail ?? res.statusText } };
      }

      const data = (await res.json()) as T;
      return { ok: true, data };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        return {
          ok: false,
          error: {
            error: 'engine_timeout',
            detail: `Request to ${path} timed out after ${this.config.timeout}ms`,
          },
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        error: {
          error: 'engine_unavailable',
          detail: message,
        },
      };
    }
  }

  private async retry<T>(
    fn: () => Promise<EngineResponse<T>>,
    retries: number,
  ): Promise<EngineResponse<T>> {
    let lastResult: EngineResponse<T> | undefined;

    for (let i = 0; i <= retries; i++) {
      lastResult = await fn();
      if (lastResult.ok) return lastResult;

      if (i < retries) {
        await new Promise((r) => setTimeout(r, this.config.retryDelay));
      }
    }

    return lastResult!;
  }
}
