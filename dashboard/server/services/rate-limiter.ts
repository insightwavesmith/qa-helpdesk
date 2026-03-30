// dashboard/server/services/rate-limiter.ts
// P8: 에이전트별 API 호출 최소 간격 제어

export class RateLimiter {
  private lastCallMap = new Map<string, number>();
  private minIntervalMs: number;

  constructor(minIntervalMs = 100) {
    this.minIntervalMs = minIntervalMs;
  }

  /** 호출 가능 여부. false면 rate-limit 초과 */
  canProceed(agentId: string): boolean {
    const now = Date.now();
    const last = this.lastCallMap.get(agentId) ?? 0;
    if (now - last < this.minIntervalMs) {
      return false;
    }
    this.lastCallMap.set(agentId, now);
    return true;
  }

  /** 남은 대기 시간 (ms). 0이면 즉시 가능 */
  waitTimeMs(agentId: string): number {
    const now = Date.now();
    const last = this.lastCallMap.get(agentId) ?? 0;
    const elapsed = now - last;
    return Math.max(0, this.minIntervalMs - elapsed);
  }

  reset(agentId: string): void {
    this.lastCallMap.delete(agentId);
  }

  resetAll(): void {
    this.lastCallMap.clear();
  }
}
