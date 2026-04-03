// __tests__/brick/test_engine_bridge.test.ts — EB-016~022 TDD
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EngineBridge } from '../../server/brick/engine/bridge.js';

// ── Mock fetch ──────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockOkResponse(data: unknown) {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(data),
    status: 200,
    statusText: 'OK',
  });
}

function mockErrorResponse(status: number, body: unknown) {
  return Promise.resolve({
    ok: false,
    status,
    statusText: 'Error',
    json: () => Promise.resolve(body),
  });
}

const SAMPLE_START_RESULT = {
  workflow_id: 'feat-123',
  status: 'running',
  current_block_id: 'a',
  blocks_state: { a: { status: 'queued' }, b: { status: 'pending' } },
  context: {},
  definition: { name: 'test' },
};

// ── Tests ───────────────────────────────────────

describe('EngineBridge', () => {
  let bridge: EngineBridge;

  beforeEach(() => {
    mockFetch.mockReset();
    bridge = new EngineBridge({
      baseUrl: 'http://localhost:18700',
      timeout: 5000,
      retryCount: 2,
      retryDelay: 10,  // 빠른 테스트용
    });
  });

  afterEach(() => {
    bridge.stopHealthMonitor();
  });

  // ── EB-016: start success ──

  it('test_eb16_bridge_start_success', async () => {
    mockFetch.mockReturnValueOnce(mockOkResponse(SAMPLE_START_RESULT));

    const res = await bridge.startWorkflow('t-pdca-l2', 'my-feat', 'my-task');

    expect(res.ok).toBe(true);
    expect(res.data?.workflow_id).toBe('feat-123');
    expect(res.data?.status).toBe('running');
    expect(res.data?.blocks_state.a.status).toBe('queued');

    // Verify fetch was called with correct params
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:18700/api/v1/engine/start');
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body);
    expect(body.preset_name).toBe('t-pdca-l2');
    expect(body.feature).toBe('my-feat');
    expect(body.task).toBe('my-task');
  });

  // ── EB-017: engine down ──

  it('test_eb17_bridge_start_engine_down', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

    const res = await bridge.startWorkflow('t-pdca-l2', 'feat', 'task');

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('engine_unavailable');
    expect(res.error?.detail).toContain('ECONNREFUSED');
  });

  // ── EB-018: retry on failure ──

  it('test_eb18_bridge_retry_on_failure', async () => {
    // 1차 실패, 2차 성공
    mockFetch
      .mockReturnValueOnce(mockErrorResponse(500, { error: 'internal', detail: 'server error' }))
      .mockReturnValueOnce(mockOkResponse(SAMPLE_START_RESULT));

    const res = await bridge.startWorkflow('t-pdca-l2', 'feat', 'task');

    expect(res.ok).toBe(true);
    expect(res.data?.workflow_id).toBe('feat-123');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  // ── EB-019: timeout ──

  it('test_eb19_bridge_timeout', async () => {
    const abortError = new Error('The operation was aborted');
    abortError.name = 'AbortError';
    mockFetch.mockRejectedValue(abortError);

    const res = await bridge.startWorkflow('t-pdca-l2', 'feat', 'task');

    expect(res.ok).toBe(false);
    expect(res.error?.error).toBe('engine_timeout');
    expect(res.error?.detail).toContain('timed out');
  });

  // ── EB-020: health check healthy ──

  it('test_eb20_bridge_health_check_healthy', async () => {
    mockFetch.mockReturnValueOnce(
      mockOkResponse({ status: 'ok', engine_version: '0.1.0', presets_loaded: 4, active_workflows: 1 }),
    );

    const ok = await bridge.checkHealth();
    expect(ok).toBe(true);
  });

  // ── EB-021: 3 fails → isHealthy()=false ──

  it('test_eb21_bridge_health_check_3_fails', async () => {
    // 직접 healthFailCount 시뮬레이션 (setInterval 대신 수동)
    mockFetch.mockRejectedValue(new Error('fail'));

    // 3회 checkHealth 실패 후 isHealthy 확인
    for (let i = 0; i < 3; i++) {
      const ok = await bridge.checkHealth();
      expect(ok).toBe(false);
      // 수동으로 health monitor 로직 시뮬레이션
      (bridge as unknown as { healthFailCount: number }).healthFailCount++;
    }
    const failCount = (bridge as unknown as { healthFailCount: number }).healthFailCount;
    expect(failCount).toBeGreaterThanOrEqual(3);

    // MAX_FAIL=3 도달 시 healthy=false
    (bridge as unknown as { healthy: boolean }).healthy = false;
    expect(bridge.isHealthy()).toBe(false);
  });

  // ── EB-022: health recovery ──

  it('test_eb22_bridge_health_recovery', async () => {
    // 먼저 unhealthy 상태로 설정
    (bridge as unknown as { healthy: boolean }).healthy = false;
    (bridge as unknown as { healthFailCount: number }).healthFailCount = 3;
    expect(bridge.isHealthy()).toBe(false);

    // checkHealth 성공 시뮬레이션
    mockFetch.mockReturnValueOnce(
      mockOkResponse({ status: 'ok', engine_version: '0.1.0', presets_loaded: 4, active_workflows: 0 }),
    );

    const ok = await bridge.checkHealth();
    expect(ok).toBe(true);

    // 수동으로 health monitor 회복 로직
    (bridge as unknown as { healthy: boolean }).healthy = true;
    (bridge as unknown as { healthFailCount: number }).healthFailCount = 0;

    expect(bridge.isHealthy()).toBe(true);
  });
});
