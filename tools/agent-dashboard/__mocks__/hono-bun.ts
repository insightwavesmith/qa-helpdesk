/**
 * hono/bun 모킹 — vitest(Node) 환경에서 사용
 * serveStatic은 Bun 전용이라 vitest에서 no-op으로 대체
 */
export function serveStatic(_opts: { root?: string; rewriteRequestPath?: (path: string) => string } = {}) {
  return async (_c: any, next: () => Promise<void>) => next()
}
