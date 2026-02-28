import { NextRequest, NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitResult {
  success: boolean;
  remaining: number;
  reset: number;
}

class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private cleanupCounter = 0;

  constructor(
    private windowMs: number,
    private max: number,
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();

    // Lazy cleanup: 매 100회 호출마다 만료 엔트리 정리
    if (++this.cleanupCounter >= 100) {
      this.cleanupCounter = 0;
      for (const [k, v] of this.store) {
        if (now >= v.resetAt) this.store.delete(k);
      }
    }

    const entry = this.store.get(key);

    if (!entry || now >= entry.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { success: true, remaining: this.max - 1, reset: now + this.windowMs };
    }

    entry.count++;
    if (entry.count > this.max) {
      return { success: false, remaining: 0, reset: entry.resetAt };
    }

    return { success: true, remaining: this.max - entry.count, reset: entry.resetAt };
  }
}

/** 10 req/min — CPU 집약, AI, 이메일 발송 */
export const heavyLimiter = new RateLimiter(60_000, 10);

/** 30 req/min — 공개 API 프록시 */
export const publicLimiter = new RateLimiter(60_000, 30);

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimitResponse(result: RateLimitResult): NextResponse {
  const retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
  return NextResponse.json(
    { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
    {
      status: 429,
      headers: { "Retry-After": String(Math.max(retryAfter, 1)) },
    },
  );
}
